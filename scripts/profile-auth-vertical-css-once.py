from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "src/feature-pages.css"
text = path.read_text(encoding="utf-8")
old = '''.profile-card {\n  --profile-auth-zone-right: 6.08cqw;\n  --profile-auth-zone-width: 15.48cqw;\n  --profile-auth-column-count: 1;\n  top: 0;\n  height: var(--membership-profile-height);\n}\n\n.profile-card[data-auth-layout="multiple"] {\n  --profile-auth-zone-width: 34cqw;\n  --profile-auth-column-count: 2;\n}\n'''
new = '''.profile-card {\n  --profile-auth-zone-right: 6.08cqw;\n  --profile-auth-zone-width: 15.48cqw;\n  --profile-auth-column-count: 1;\n  --profile-auth-button-min-height: 44px;\n  --profile-auth-button-height: 12.3cqw;\n  top: 0;\n  height: var(--membership-profile-height);\n}\n\n.profile-card[data-auth-layout="multiple"] {\n  --profile-auth-button-min-height: 32px;\n  --profile-auth-button-height: 8.9cqw;\n}\n'''
if text.count(old) != 1:
    raise RuntimeError("profile auth layout block changed; refusing to patch")
text = text.replace(old, new, 1)
old_button = '''  min-height: 44px;\n  height: 12.3cqw;\n'''
new_button = '''  min-height: var(--profile-auth-button-min-height);\n  height: var(--profile-auth-button-height);\n'''
if text.count(old_button) != 1:
    raise RuntimeError("profile auth button sizing block changed; refusing to patch")
text = text.replace(old_button, new_button, 1)
path.write_text(text, encoding="utf-8")
print("Applied vertical auth layout CSS.")
