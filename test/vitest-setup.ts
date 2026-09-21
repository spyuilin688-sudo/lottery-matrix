import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

if (typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.scrollTo !== "function") {
  HTMLElement.prototype.scrollTo = function scrollTo() {};
}

// jsdom has no native dialog top layer. Model open/close for component tests;
// focus containment and inert background remain browser verification concerns.
if (typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close = function close() { this.open = false; };
}
