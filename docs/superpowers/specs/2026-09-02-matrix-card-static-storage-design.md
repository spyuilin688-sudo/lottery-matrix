# Matrix Card Static Storage Design

**Date:** 2026-09-02
**Status:** Approved

## Goal

Stop rendering Matrix card SVGs and rereading 171/227 draw rows on every page view or download. Generate each lottery's draw-order and sorted-order cards once after a new draw is stored, publish them to Supabase Storage, and serve the immutable static assets through Supabase's public CDN.

## Selected architecture

Use a public Supabase Storage bucket named `matrix-cards` plus a server-only publication pointer table named `matrix_card_publications`.

Each published asset uses a versioned ASCII path:

```text
{lottery-slug}/{period}/draw.svg
{lottery-slug}/{period}/sorted.svg
```

Lottery slugs are stable and URL-safe:

```text
今彩539 -> daily539
天天樂  -> fantasy5
六合彩  -> marksix
大樂透  -> lotto649
```

The SVG MIME type is `image/svg+xml` and the object cache lifetime is one year. A new period always receives a new path; existing published objects are never overwritten during normal operation.

## Publication data

`public.matrix_card_publications` contains one current row per lottery:

- `lottery` primary key
- `period`
- `draw_path`
- `sorted_path`
- `published_at`
- `updated_at`

The table is protected by RLS. Browser roles receive no table permissions. Only the Railway service-role client reads or writes publication rows. The Storage bucket is public for reads, while writes continue to require the server-side Supabase secret.

## Write flow

1. The scheduled Railway worker stores and validates the latest draw.
2. It reads exactly the card renderer's required row count once for that lottery.
3. It renders both `draw` and `sorted` SVGs from the same history snapshot.
4. It uploads both SVGs to their immutable period path.
5. Only after both uploads succeed does it upsert the publication pointer.
6. Matrix analysis proceeds independently.

The publisher is idempotent. If the current publication already matches the latest stored period, it performs no history read, rendering, or upload.

Every scheduled worker invocation also checks the latest stored draw against the current publication before returning `not-due` or `already-acquired`. This creates the initial static cards after deployment and repairs an interrupted publication without waiting for another draw.

## Failure behavior

- If rendering or either upload fails, the publication pointer is not changed.
- The previous complete card pair remains available.
- The worker invocation reports the failure so Railway retries on the next scheduled invocation.
- There is no dynamic-render fallback. This prevents a Storage incident from recreating the original repeated database and CPU load.
- An orphaned first upload is harmless because it is never exposed by the publication pointer; a retry uploads idempotently to the same versioned path.

## Read flow

`GET /api/matrix/cards/{lottery}` reads the one-row publication pointer and returns absolute Supabase public URLs for both SVGs.

The PWA continues using the existing manifest contract. Its URL helper already accepts absolute URLs, so preview and download go directly to Supabase Storage without further frontend behavior changes.

Legacy routes such as `GET /api/matrix/cards/{lottery}/draw.svg` no longer render cards. They return an HTTP redirect to the current static asset for compatibility with cached clients and old links.

## Manual refresh behavior

The protected `POST /jobs/refresh` endpoint currently stores only the latest draw. It will also publish static cards after a successful refresh so manual recovery behaves consistently with scheduled ingestion.

## Verification

Tests must prove:

- bucket/table migration security and constraints;
- deterministic immutable paths and public URLs;
- both SVGs share one bounded history read;
- publication occurs only after both uploads succeed;
- failed publication preserves the previous pointer;
- same-period checks do no rendering or upload;
- scheduled acquisition, no-due repair, resume, and manual refresh publish cards;
- manifest returns static URLs;
- legacy SVG routes redirect and never invoke the renderer;
- existing renderer layout contracts and frontend card behavior remain green.

## Non-goals

- No Cloudflare R2 integration.
- No visual redesign of the Matrix card.
- No changes to lottery draw schedules or Matrix algorithms.
- No historical-card browser or object-retention job in this change.
