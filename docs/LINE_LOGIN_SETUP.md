# LINE Login operator setup

This guide records the required configuration for the existing API-only LINE
Login integration. It does not create credentials, change Supabase, change
AppDeploy, deploy the PWA, or establish that live LINE Login works.

## 1. Store server-only credentials

In the AppDeploy server secret store, configure the server-only secret names
`LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET`. Keep both out of Git, frontend
build output, browser storage, responses, and logs. Do not place credential
values in this document, source files, tests, or client-side configuration.

## 2. Configure the Supabase Custom OAuth2 provider

Create or edit the LINE custom provider in Supabase with these exact values:

| Field | Required value |
| --- | --- |
| Provider type | `oauth2` |
| Identifier | `custom:line` |
| Client ID | LINE Channel ID |
| Client secret | LINE Channel secret |
| Authorization URL | `https://access.line.me/oauth2/v2.1/authorize` |
| Token URL | `https://api.line.me/oauth2/v2.1/token` |
| UserInfo URL | `https://api.line.me/oauth2/v2.1/userinfo` |
| Scopes | `openid profile` |
| Email | email optional; do not request the `email` scope |
| PKCE | enabled with `S256` |

Do not add scopes, especially the `email` scope. The scope list is exactly
`openid profile`.

After Supabase displays its callback URL for this provider, copy the exact
callback URL displayed by Supabase into the LINE Console. Never infer,
construct, replace, or otherwise guess that callback URL.

## 3. Allowlist the PWA return URL

In the Supabase redirect allowlist, enter exactly the production normalized
origin root for the PWA: use the actual production deployment's origin root
(the normalized root derived from its `window.location.origin`). The repository
does not authoritatively define that production origin, so obtain it from the
actual production PWA deployment rather than substituting an example value.

The allowlist entry is the root only: no paths, queries, fragments, or external
origins. Do not allow preview, local-development, or third-party return URLs.

## 4. Logout and revoke boundary

The server-side logout/revoke endpoint is `POST /api/auth/line/logout`. It is
handled before the client clears the Supabase session. The LINE provider access
token stays only in the current browser page-process memory long enough to
revoke it. Provider credentials are stripped from the persisted Supabase session:
specifically, the `provider_token` and `provider_refresh_token` fields
are removed while retaining the Supabase access token, refresh token, and user
needed for session persistence. The server endpoint
handles the submitted provider token only in request memory. Do not store or log
either provider credential.

A page reload discards the page-memory provider token. When that token is
missing, logout fails closed before LINE revoke or Supabase sign-out, so the
Supabase session remains intact. Retry or re-authenticate to obtain a fresh
provider token. Do not improvise a bypass: use an operator recovery only after
that recovery is explicitly defined and authorized.

## Verification status

Mock and unit-contract coverage can validate request and configuration
boundaries, but it is not a live-provider result. The following items are
**NOT EXECUTED without live credentials**:

- Live LINE callback to Supabase session mapping.
- LINE in-app browser behavior.
- SSO, QR, and authorization-refusal flows.
- Supabase `provider_id` mapping for the `custom:line` identity.
- Provider-token behavior across session refresh and page reload lifecycle.
- Real LINE revoke through `POST /api/auth/line/logout`.

Do not represent the mock results as proof that real LINE login or real revoke
works. Perform those checks only with authorized live credentials and the
actual production callback and PWA origin settings.
