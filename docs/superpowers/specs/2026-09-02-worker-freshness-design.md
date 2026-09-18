# Worker Freshness Design

## Goal

Prevent a scheduled draw refresh from reporting success when the source still returns the previous draw, repair recent internal history gaps, and keep draw acquisition status independent from analysis failures.

## Required behavior

- A due invocation reports `success` only after the expected draw date is stored.
- A source response for an older draw reports `waiting_source` and remains eligible for later scheduled retries.
- Source, previous database, and written periods are stored in `system_job_status`.
- Recent internal period gaps are repaired through the existing history download before acquisition is marked successful.
- Draw acquisition completes before analysis starts. Analysis failure must not change a successful acquisition status.
- Existing out-of-schedule analysis resume behavior remains unchanged.
- No frontend behavior is changed.

