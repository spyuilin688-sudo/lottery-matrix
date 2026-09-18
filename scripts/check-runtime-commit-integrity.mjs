#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockFile = "mobile-runtime.lock.json";
const lockPath = path.join(root, lockFile);

const normalize = (value) => value.replaceAll("\\", "/").trim();

export function validateRuntimeLockAtomicity(changedFiles, lockedFiles) {
  const changed = [...new Set(changedFiles.map(normalize).filter(Boolean))];
  const lockChanged = changed.includes(lockFile);
  const protectedChanged = changed.filter(
    (file) => file !== lockFile && Object.prototype.hasOwnProperty.call(lockedFiles, file),
  );

  if (protectedChanged.length > 0 && !lockChanged) {
    throw new Error(
      `Protected Runtime files changed without ${lockFile} in the same commit: ${protectedChanged.join(", ")}`,
    );
  }

  if (lockChanged && protectedChanged.length === 0) {
    throw new Error(
      `${lockFile} changed without a protected Runtime file in the same commit.`,
    );
  }

  return { lockChanged, protectedChanged };
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function changedFilesForCommit(commit) {
  try {
    const parent = git(["rev-parse", `${commit}^1`]);
    return git(["diff", "--name-only", parent, commit]).split("\n").filter(Boolean);
  } catch {
    return git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit])
      .split("\n")
      .filter(Boolean);
  }
}

function commitsInRange(base, head) {
  if (!base || /^0+$/.test(base)) return [head];
  const output = git(["rev-list", "--reverse", `${base}..${head}`]);
  return output ? output.split("\n").filter(Boolean) : [];
}

export function validateCommitRange(base, head, lockedFiles) {
  const commits = commitsInRange(base, head);
  for (const commit of commits) {
    try {
      validateRuntimeLockAtomicity(changedFilesForCommit(commit), lockedFiles);
    } catch (error) {
      const shortCommit = commit.slice(0, 12);
      throw new Error(`Runtime commit integrity failed at ${shortCommit}: ${error.message}`);
    }
  }
  return commits.length;
}

function main() {
  const lockedFiles = JSON.parse(readFileSync(lockPath, "utf8"));
  const [baseArg, headArg] = process.argv.slice(2);

  if (baseArg && headArg) {
    const count = validateCommitRange(baseArg, headArg, lockedFiles);
    console.log(`Runtime commit integrity passed (${count} commit${count === 1 ? "" : "s"} checked).`);
    return;
  }

  const head = git(["rev-parse", "HEAD"]);
  validateRuntimeLockAtomicity(changedFilesForCommit(head), lockedFiles);
  console.log("Runtime commit integrity passed (HEAD checked).");
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main();
