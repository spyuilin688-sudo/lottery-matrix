- DESIGN structure: `npx -p @google/design.md designmd lint DESIGN.md`.
- Premium audit: strict audit over `src` only; Tasks 7–9 own the currently planned action, form, textarea and scrollbar corrections.
- Runtime verification: project unit, Node, typecheck and build commands plus real-browser checks for native popup/calendar, failure, keyboard, narrow viewport and forced-colors behavior when the owning task changes those surfaces.
- Canonical sibling comparison: existing feature pages inside `FeatureShell`, profile direct logout, native select fields and native date fields.


## LINE login return — 2026-09-06

- User request: opening LINE login from the installed PWA must return to the PWA.
- Mobile installed PWAs start OAuth in the original window and return to the
  exact approved origin root, without opening a separate authorization window
  or adding a popup correlation query. Preserve native LINE auto login; do not
  force `disable_auto_login=true`.
- The web app manifest declares the stable root identity (`id: /`), root scope
  (`scope: /`) and `launch_handler.client_mode: navigate-existing`. When the
  Android browser resolves the HTTPS callback to the installed PWA, the launch
  handler directs that navigation to the existing PWA client rather than a new
  application window. OS/browser navigation capture remains authoritative and
  requires physical-device verification.
- Desktop installed PWAs retain the managed authorization window. Its callback
  stays at the approved origin root; an internally generated `matrix_line_return`
  UUID binds it to the waiting attempt. Public redirect arguments still reject
  arbitrary paths or queries. Keep this handoff available for callbacks from
  older mobile clients that already opened a popup.
- When native LINE opens a callback without its opener, a same-origin
  BroadcastChannel matched to the callback's own UUID can import the session
  into the waiting PWA. Never choose a pending attempt from shared storage.
  Check for a listening PWA before consuming a detached callback. Successful
  import acknowledges the callback, closes the temporary authorization windows
  and requests focus of the original PWA, which uses its existing success UI.
- Fullscreen (the current manifest setting), standalone, minimal-ui and iOS
  home-screen mode share detection with the install UI.
- Ordinary browser login keeps the existing origin-root redirect. Unsupported
  popup or unreachable return channels retain normal browser initialization.
  Separate browser/PWA partitions (including iOS Home Screen/Safari) cannot use
  this channel. Window focus is controlled by the OS; unit or desktop-browser
  checks do not verify physical Android/iOS foreground return.
- No page geometry, shortcuts, provider scopes or Supabase allowlist changes.

## Notification settings login state — 2026-09-06