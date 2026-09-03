from pathlib import Path
import runpy

patch_script = Path("scripts/audit_remediation_frontend.py")
source = patch_script.read_text(encoding="utf-8")
start_marker = "text = regex_once(\n    text,\n    r'export function MatrixCorePage"
end_marker = '    "dead MatrixCorePage",\n)\n'
start = source.find(start_marker)
end_start = source.find(end_marker, start)
if start < 0 or end_start < 0:
    raise SystemExit("unable to locate MatrixCorePage remediation block")
end = end_start + len(end_marker)
replacement = '''matrix_core_start = text.index("export function MatrixCorePage(")
matrix_core_end = text.index("const GUIDE_LOOP_GROUPS", matrix_core_start)
text = text[:matrix_core_start] + text[matrix_core_end:]
'''
patched_source = source[:start] + replacement + source[end:]
temporary_script = Path("/tmp/audit_remediation_frontend_runtime.py")
temporary_script.write_text(patched_source, encoding="utf-8")
runpy.run_path(str(temporary_script), run_name="__main__")
