from pathlib import Path
import runpy

source_path = Path("scripts/audit_remediation_lease.py")
source = source_path.read_text(encoding="utf-8")
old = '''if text.count("                built = self.builders[phase](context)\\n") != 1:
    raise SystemExit("phase builder location changed")
text = text.replace(
    "                built = self.builders[phase](context)\\n",
    "                self._require_lease(lottery, period)\\n                built = self.builders[phase](context)\\n",
    1,
)
'''
new = '''text = replace_once(
    text,
    "                self._hydrate_dependencies(context, lottery, period, phase)\\n                built = self.builders[phase](context)\\n",
    "                self._hydrate_dependencies(context, lottery, period, phase)\\n                self._require_lease(lottery, period)\\n                built = self.builders[phase](context)\\n",
    "phase builder lease guard",
)
'''
if source.count(old) != 1:
    raise SystemExit(f"phase matcher correction expected one block, got {source.count(old)}")
runtime_source = source.replace(old, new, 1)
runtime_path = Path("/tmp/audit_remediation_lease_runtime.py")
runtime_path.write_text(runtime_source, encoding="utf-8")
runpy.run_path(str(runtime_path), run_name="__main__")
