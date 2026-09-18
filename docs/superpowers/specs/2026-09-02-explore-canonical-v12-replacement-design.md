# Explore Canonical v12 Replacement Design

## Decision

Replace the production Explore v11 algorithm runtime with the approved canonical state-machine engine from `docs/specs/Matrix_Explore_Canonical_v12_20260902.md`. Do not deploy a second standalone HTTP API. The production flow remains Railway Worker → Matrix API AnalysisPipeline → Explore artifact → Supabase → existing RPC/PWA.

## Algorithm boundaries

- Each reference cell is evaluated independently; different `referenceOffset` / `referencePosition` cells are never cross-aggregated for the final `>2` rule decision.
- 準4+ requires exactly one highest rule and invalidates at streak 8 without truncation.
- 準5+ uses incremental anchor states and a shrinking second-candidate pool; it never pre-enumerates all `B ∪ C` pairs.
- All top pairs at the true maximum eligible streak are retained before distinct-rule evaluation; more than two distinct top rules invalidates that cell.
- `+0` remains valid for 加減 and 拖牌.
- Full history is indexed; 8/12 are single-path stop boundaries rather than global history caps.

## Integration

Create `services/matrix-api/app/domain/explore_engine.py` with the new engine and checkpoint/session interface. Keep the existing artifact schema and Tianyan prepared-coordinate contract so repository persistence, Matrix Status, and frontend RPC consumers stay compatible. Once verified, `artifact_builders.py` will import only the new engine and Worker analysis version will become `matrix-python-v12`.

## Supabase

Use a forward migration for v12 RPC selection. Executed v11 migration files remain in history. Only after v12 recomputation and RPC validation will obsolete v11 runtime result rows be eligible for cleanup.

## Verification gate

TDD is mandatory. RED state-machine contracts must fail on the branch before production code exists. Then run targeted engine tests, complete Matrix API regression, Project CI, runtime reference scans, and v12 Supabase/PWA verification. No merge to `main` until all gates are green and the user authorizes merge.
