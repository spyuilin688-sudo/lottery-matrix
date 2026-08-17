# Remove Virtual Phone Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the visible virtual-phone presentation layer while preserving the real PWA mobile layout, scrolling, keyboard, and touch behavior.

**Architecture:** Keep `MobileDeviceProvider`, `KeyboardProvider`, `MobileScroll`, and existing mobile interaction utilities. Change `MobileRuntime` so it no longer renders `PhoneFrame`, device picker, bezel, virtual status bar, home indicator, or keyboard preview UI. Remove the forced Pixel 10 selection from `Prototype` so the production interface is not tied to a simulated device.

**Tech Stack:** React, TypeScript, Node test runner.

## Global Constraints

- Do not modify `main`.
- Work only on branch `除錯`.
- Do not remove responsive mobile layout or touch/scroll behavior.
- Do not delete the whole `src/mobile/` runtime.
- Do not add replacement simulator UI.

---

### Task 1: Replace the virtual-phone runtime shell

**Files:**
- Modify: `src/mobile/MobileRuntime.tsx`
- Test: `tests/mobile-runtime-frame.test.mjs`

**Interfaces:**
- Consumes: `MobileDeviceProvider`, `KeyboardProvider`, existing children.
- Produces: frameless runtime wrapper preserving providers and `mobile-app-viewport`.

- [ ] **Step 1:** Change the existing frame test so it requires no `PhoneFrame`, no `StatusBar`, and no `HomeIndicator` in `MobileRuntime`.
- [ ] **Step 2:** Update `MobileRuntime` to keep providers and viewport only.
- [ ] **Step 3:** Run the frame and entry tests.

### Task 2: Remove forced simulated device selection

**Files:**
- Modify: `src/Prototype.tsx`

**Interfaces:**
- Consumes: existing PWA layout.
- Produces: no forced `pixel-10` device assignment.

- [ ] **Step 1:** Remove `useMobileDevice` from the `Prototype` import and component state.
- [ ] **Step 2:** Remove the effect that forces `pixel-10`.
- [ ] **Step 3:** Verify existing mobile entry behavior remains unchanged.

### Task 3: Verify scope

**Files:**
- Verify: `src/App.tsx`
- Verify: `src/mobile/MobileScroll.tsx`

- [ ] **Step 1:** Confirm production `App` still uses mobile and keyboard providers without `MobileRuntime`.
- [ ] **Step 2:** Confirm `MobileScroll` remains unchanged.
- [ ] **Step 3:** Compare branch changes against `main` and confirm only the requested presentation-layer changes plus this plan are present.
