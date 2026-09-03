from pathlib import Path
import runpy

patch_script = Path("scripts/audit_remediation_frontend.py")
source = patch_script.read_text(encoding="utf-8")
old = "r'export function MatrixCorePage\\\\([\\\\s\\\\S]*?(?=export function MatrixExplorePage)'"
new = "r'export function MatrixCorePage\\([\\s\\S]*?(?=export function MatrixExplorePage)'"
if source.count(old) != 1:
    raise SystemExit(f"matrix core matcher correction expected one match, got {source.count(old)}")
patch_script.write_text(source.replace(old, new, 1), encoding="utf-8")
runpy.run_path(str(patch_script), run_name="__main__")
