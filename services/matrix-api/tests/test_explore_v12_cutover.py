import inspect
from pathlib import Path

from app import worker
from app.domain.explore_engine import run_explore_batch
from app.services import artifact_builders


def test_artifact_builder_defaults_to_canonical_v12_batch_runner() -> None:
    create_signature = inspect.signature(artifact_builders.create_artifact_builders)
    chunk_signature = inspect.signature(artifact_builders.build_explore_artifact_chunk)
    full_signature = inspect.signature(artifact_builders.build_explore_artifact)

    assert create_signature.parameters["explore_batch_runner"].default is run_explore_batch
    assert chunk_signature.parameters["batch_runner"].default is run_explore_batch
    assert full_signature.parameters["batch_runner"].default is run_explore_batch


def test_worker_writes_new_results_under_matrix_python_v12() -> None:
    assert worker.ANALYSIS_VERSION == "matrix-python-v12"


def test_legacy_explore_v2_runtime_is_removed() -> None:
    service_root = Path(__file__).resolve().parents[1]

    assert not (service_root / "app/domain/explore_v2.py").exists()
