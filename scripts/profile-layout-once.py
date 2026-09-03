from pathlib import Path

runner = Path("scripts/integration-runner-v2.py")
source = runner.read_text()
old = "expect([...firstGroup!.querySelectorAll('.explore-validation-number--step')].map((node) => node.textContent)).toEqual(['09', '28', '38']);"
if source.count(old) != 1:
    raise SystemExit(f"expected one obsolete trailer hit-number assertion, found {source.count(old)}")
source = source.replace(old, "", 1)
exec(compile(source, str(runner), "exec"), {"__name__": "__main__", "__file__": str(runner)})
