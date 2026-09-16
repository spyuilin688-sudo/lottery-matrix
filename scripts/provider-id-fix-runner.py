from pathlib import Path
import runpy

root = Path(__file__).resolve().parents[1]
patch = root / 'scripts/provider-id-fix-once.py'
text = patch.read_text(encoding='utf-8')
old = "replace_exact('apps/admin/backend/admin-data.ts', '      authUserId: row.auth_user_id,\\n      lineDisplayName: row.line_display_name,', '      authUserId: row.auth_user_id,\\n      lineUserId: row.line_user_id,\\n      lineDisplayName: row.line_display_name,', expected=2)"
new = """replace_exact('apps/admin/backend/admin-data.ts', '      authUserId: row.auth_user_id,\\n      lineDisplayName: row.line_display_name,', '      authUserId: row.auth_user_id,\\n      lineUserId: row.line_user_id,\\n      lineDisplayName: row.line_display_name,')
replace_exact('apps/admin/backend/admin-data.ts', '        authUserId: row.auth_user_id,\\n        lineDisplayName: row.line_display_name,', '        authUserId: row.auth_user_id,\\n        lineUserId: row.line_user_id,\\n        lineDisplayName: row.line_display_name,')"""
if text.count(old) != 1:
    raise SystemExit('admin member mapper patch block changed unexpectedly')
patch.write_text(text.replace(old, new), encoding='utf-8')
runpy.run_path(str(patch), run_name='__main__')
