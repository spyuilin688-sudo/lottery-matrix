from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "src/feature-pages.css"
text = path.read_text(encoding="utf-8")
old_layout = '''.profile-card {\n  --profile-auth-zone-right: 6.08cqw;\n  --profile-auth-zone-width: 15.48cqw;\n  --profile-auth-column-count: 1;\n  top: 0;\n  height: var(--membership-profile-height);\n}\n\n.profile-card[data-auth-layout="multiple"] {\n  --profile-auth-zone-width: 34cqw;\n  --profile-auth-column-count: 2;\n}\n'''
new_layout = '''.profile-card {\n  --profile-auth-zone-right: 6.08cqw;\n  --profile-auth-zone-width: 15.48cqw;\n  --profile-auth-column-count: 1;\n  top: 0;\n  height: var(--membership-profile-height);\n}\n'''
if text.count(old_layout) != 1:
    raise RuntimeError("profile auth layout block changed; refusing to patch")
text = text.replace(old_layout, new_layout, 1)
button = '''.profile-logout {\n  position: static;\n  display: grid;\n  box-sizing: border-box;\n  width: 100%;\n  min-width: 0;\n  min-height: 44px;\n  height: 12.3cqw;\n  padding: 0;\n  place-items: center;\n  border: 0;\n  border-radius: 999px;\n  background: transparent;\n  color: #f1c66b;\n  font-size: 3.5cqw;\n  line-height: 1;\n  cursor: pointer;\n}\n'''
replacement = button + '''.profile-card[data-auth-layout="multiple"] .profile-logout {\n  min-height: 32px;\n  height: 8.9cqw;\n}\n'''
if text.count(button) != 1:
    raise RuntimeError("canonical profile logout block changed; refusing to patch")
text = text.replace(button, replacement, 1)
path.write_text(text, encoding="utf-8")
print("Applied vertical auth layout CSS while preserving the authenticated 44px button.")
