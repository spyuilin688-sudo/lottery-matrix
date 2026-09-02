# Explore Canonical v12 RED Proof

The RED contract commit is `21423a47c3b9696fca50cc6f35920f2cdd057c5b`.

Expected first failure before production implementation: `services/matrix-api/tests/test_explore_canonical_v12.py` cannot import `app.domain.explore_engine` because the new production module does not yet exist.

This file records the intended TDD boundary; the actual GitHub Actions job result is verified separately before creating `explore_engine.py`.
