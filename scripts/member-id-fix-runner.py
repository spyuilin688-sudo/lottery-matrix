from pathlib import Path
import runpy

root = Path(__file__).resolve().parents[1]
patch = root / "scripts/member-id-fix-once.py"
text = patch.read_text(encoding="utf-8")
old = '''replace_exact(\n    "apps/admin/backend/admin-data.ts",\n    \'\'\'      id: String(row.id),\\n      authUserId: row.auth_user_id,\'\'\',\n    \'\'\'      id: String(row.id),\\n      memberId: String(row.id),\\n      authUserId: row.auth_user_id,\'\'\',\n    expected=2,\n)'''
new = '''replace_exact(\n    "apps/admin/backend/admin-data.ts",\n    \'\'\'      id: String(row.id),\\n      authUserId: row.auth_user_id,\'\'\',\n    \'\'\'      id: String(row.id),\\n      memberId: String(row.id),\\n      authUserId: row.auth_user_id,\'\'\',\n)\nreplace_exact(\n    "apps/admin/backend/admin-data.ts",\n    \'\'\'        id: String(row.id),\\n        authUserId: row.auth_user_id,\'\'\',\n    \'\'\'        id: String(row.id),\\n        memberId: String(row.id),\\n        authUserId: row.auth_user_id,\'\'\',\n)'''
if text.count(old) != 1:
    raise SystemExit("one-shot patch block changed unexpectedly")
patch.write_text(text.replace(old, new), encoding="utf-8")
runpy.run_path(str(patch), run_name="__main__")
