import "./dialog-test-setup";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { resetMemberSessionStoreForTests } from "../src/auth/member-session-store";

// UI tests render the home page without a live database; keep its Realtime
// connection at the boundary. The publication subscriber has its own test.
vi.mock("../src/published-result-refresh", () => ({
  subscribePublishedResultRefresh: () => () => {},
}));

afterEach(() => { cleanup(); resetMemberSessionStoreForTests(); });

if (typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.scrollTo !== "function") {
  HTMLElement.prototype.scrollTo = function scrollTo() {};
}
