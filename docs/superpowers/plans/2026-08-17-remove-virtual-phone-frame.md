# Remove Virtual Phone Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the visible virtual-phone presentation layer while preserving the real PWA mobile layout, scrolling, keyboard, touch behavior, and existing screen portal context.

**Architecture:** Keep `MobileDeviceProvider`, `KeyboardProvider`, `MobileScroll`, and the existing `PhoneFrame` context interface because other mobile components can depend on its screen portal. Convert `PhoneFrame` itself into a frameless full-screen host: no device picker, no bezel, no scale box, no camera cutout, and no simulated cursor. Remove the forced Pixel 10 selection from `Prototype` so the production interface is not tied to a simulated device.

**Tech Stack:** React, TypeScript, Node test runner.

## Global Constraints

- Do not modify `main`.
- Work only on branch `除錯`.
- Do not remove responsive mobile layout or touch/scroll behavior.
- Do not delete the whole `src/mobile/` runtime.
- Do not add replacement simulator UI.
- Preserve the existing `PhoneFrame` screen portal context interface.

---

### Task 1: Convert PhoneFrame into a frameless screen host

**Files:**
- Modify: `src/mobile/PhoneFrame.tsx`
- Test: `tests/mobile-runtime-frame.test.mjs`

**Interfaces:**
- Consumes: existing `PhoneFrame` children and `useScreenPortal()` consumers.
- Produces: the same screen portal context without virtual phone chrome.

- [ ] **Step 1:** Change the frame test so it rejects `DevicePicker`, `phone-bezel`, `phone-scale-box`, `device-camera`, and simulated cursor usage.
- [ ] **Step 2:** Simplify `PhoneFrame` to a full-screen `device-screen` host with `screenRef` and children only.
- [ ] **Step 3:** Keep `MobileRuntime` provider/viewport behavior unchanged.

### Task 2: Remove forced simulated device selection

**Files:**
- Modify: `src/Prototype.tsx`

**Interfaces:**
- Consumes: existing PWA layout.
- Produces: no forced `pixel-10` device assignment.

- [ ] **Step 1:** Remove `useMobileDevice` from the `Prototype` import and component state.
- [ ] **Step 2:** Remove the effect that forces `pixel-10`.
- [ ] **Step 3:** Keep `MobileScroll` and keyboard behavior unchanged.

### Task 3: Verify scope

**Files:**
- Verify: `src/App.tsx`
- Verify: `src/mobile/MobileRuntime.tsx`
- Verify: `src/mobile/MobileScroll.tsx`

- [ ] **Step 1:** Confirm production `App` still uses mobile and keyboard providers without rendering `MobileRuntime`.
- [ ] **Step 2:** Confirm `MobileRuntime` and `MobileScroll` remain functionally present.
- [ ] **Step 3:** Compare branch changes against `main` and confirm only the requested presentation-layer changes plus this plan are present.
