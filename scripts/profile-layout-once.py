from pathlib import Path

runner = Path("scripts/integration-runner-v2.py")
exec(compile(runner.read_text(), str(runner), "exec"), {"__name__": "__main__", "__file__": str(runner)})
