from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
member_path = ROOT / "src/features/MemberPages.tsx"
css_path = ROOT / "src/feature-pages.css"

member = member_path.read_text(encoding="utf-8")
css = css_path.read_text(encoding="utf-8")

old_signature = 'function MembershipArtwork({ showSubscription }: { showSubscription: boolean }) {'
new_signature = 'function MembershipArtwork({ showSubscription, maskAuthPill }: { showSubscription: boolean; maskAuthPill: boolean }) {'
if member.count(old_signature) != 1:
    raise RuntimeError(f"MembershipArtwork signature count={member.count(old_signature)}")
member = member.replace(old_signature, new_signature, 1)

old_mask = '            <rect x="1280" y="180" width="145" height="67" fill="black" />'
new_mask = '''            {maskAuthPill
              ? <rect className="profile-auth-pill-mask" x="1235" y="145" width="285" height="110" rx="55" fill="black" />
              : <rect className="profile-auth-pill-mask" x="1280" y="180" width="145" height="67" fill="black" />}'''
if member.count(old_mask) != 1:
    raise RuntimeError(f"profile auth raster mask count={member.count(old_mask)}")
member = member.replace(old_mask, new_mask, 1)

old_call = '        <MembershipArtwork showSubscription={subscriptionPurchaseVisible} />'
new_call = '        <MembershipArtwork showSubscription={subscriptionPurchaseVisible} maskAuthPill={authState === "anonymous" || authState === "signing-in"} />'
if member.count(old_call) != 1:
    raise RuntimeError(f"MembershipArtwork call count={member.count(old_call)}")
member = member.replace(old_call, new_call, 1)

old_css = '''.profile-card[data-auth-layout="multiple"] .profile-logout {
  min-height: 32px;
  height: 8.9cqw;
}
'''
new_css = '''.profile-card[data-auth-layout="multiple"] .profile-logout {
  min-height: 32px;
  height: 8.9cqw;
  border: 1px solid #b98a31;
  background: #030a0d;
}
'''
if css.count(old_css) != 1:
    raise RuntimeError(f"multiple auth button block count={css.count(old_css)}")
css = css.replace(old_css, new_css, 1)

member_path.write_text(member, encoding="utf-8")
css_path.write_text(css, encoding="utf-8")
print("Masked the raster single-login capsule for anonymous two-provider state and gave both live buttons their own canonical gold outline.")
