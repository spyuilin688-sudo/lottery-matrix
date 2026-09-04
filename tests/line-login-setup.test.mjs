import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const setupGuideUrl = new URL("../docs/LINE_LOGIN_SETUP.md", import.meta.url);

test("LINE operator guide locks required configuration and secret-safety invariants", () => {
  const guide = readFileSync(setupGuideUrl, "utf8");

  for (const value of [
    "oauth2",
    "custom:line",
    "https://access.line.me/oauth2/v2.1/authorize",
    "https://api.line.me/oauth2/v2.1/token",
    "https://api.line.me/oauth2/v2.1/userinfo",
    "openid profile",
    "PKCE",
    "S256",
    "email optional",
    "LINE_CHANNEL_ID",
    "LINE_CHANNEL_SECRET",
    "line-logout",
  ]) {
    assert.match(guide, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(guide, /Scopes\s*\|\s*`openid profile`/);
  assert.match(guide, /Client ID\s*\|\s*LINE Channel ID/i);
  assert.match(guide, /Client secret\s*\|\s*LINE Channel secret/i);
  assert.match(guide, /copy the exact\s+callback URL displayed by Supabase/i);
  assert.match(guide, /do not infer|never infer/i);
  assert.match(guide, /production normalized\s+origin root/i);
  assert.match(guide, /no paths, queries, fragments, or external\s+origins/i);
  assert.match(guide, /do not request the `email` scope/i);
  assert.match(guide, /current browser page-process\s+memory/i);
  assert.match(guide, /stripped from\s+the persisted Supabase session/i);
  assert.match(guide, /page reload/i);
  assert.match(guide, /fail(?:s)? closed/i);
  assert.match(guide, /does not trap the member in a\s+local Supabase session/i);
  assert.match(guide, /continues to\s+the bounded local sign-out/i);
  assert.match(guide, /recoverable\/uncertain state/i);
  assert.match(guide, /There is no AppDeploy-compatible\s+`POST \/api\/auth\/line\/logout` route/i);
  assert.doesNotMatch(guide, /LINE_CHANNEL_SECRET\s*=\s*\S+/);
  assert.doesNotMatch(guide, /LINE_CHANNEL_ID\s*=\s*\S+/);
  assert.doesNotMatch(guide, /LINE Channel secret\s*[:=]\s*\S+/i);
  assert.doesNotMatch(guide, /LINE Channel ID\s*[:=]\s*\S+/i);
});
