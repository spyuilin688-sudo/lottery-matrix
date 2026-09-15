from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "src/__tests__/MemberProfilePage.test.tsx"
text = path.read_text(encoding="utf-8")

needle = '''    expect(parseFloat(getComputedStyle(lineLogin).minHeight)).toBe(32);\n    expect(parseFloat(getComputedStyle(googleLogin).minHeight)).toBe(32);\n  });\n'''
replacement = '''    expect(parseFloat(getComputedStyle(lineLogin).minHeight)).toBe(32);\n    expect(parseFloat(getComputedStyle(googleLogin).minHeight)).toBe(32);\n    expect(getComputedStyle(lineLogin).borderTopStyle).toBe("solid");\n    expect(getComputedStyle(googleLogin).borderTopStyle).toBe("solid");\n    const authPillMask = document.querySelector<SVGRectElement>(".membership-reference-art .profile-auth-pill-mask");\n    expect(authPillMask).not.toBeNull();\n    expect(authPillMask?.getAttribute("x")).toBe("1235");\n    expect(authPillMask?.getAttribute("y")).toBe("145");\n    expect(authPillMask?.getAttribute("width")).toBe("285");\n    expect(authPillMask?.getAttribute("height")).toBe("110");\n  });\n'''

if text.count(needle) != 1:
    raise RuntimeError(f"vertical auth test anchor count={text.count(needle)}")
if "profile-auth-pill-mask" in text:
    raise RuntimeError("profile auth artwork regression already present")

path.write_text(text.replace(needle, replacement, 1), encoding="utf-8")
print("Added profile auth artwork/button regression assertions.")
