import "./dialog-test-setup";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetMemberSessionStoreForTests } from "../src/auth/member-session-store";

afterEach(() => { cleanup(); resetMemberSessionStoreForTests(); });

if (typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.scrollTo !== "function") {
  HTMLElement.prototype.scrollTo = function scrollTo() {};
}
