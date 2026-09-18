from pathlib import Path
import re
p=Path('src/feature-pages.css')
s=p.read_text()
def sub(pat,repl,name):
 global s
 s2,n=re.subn(pat,repl,s,count=1,flags=re.M|re.S)
 if n!=1: raise SystemExit(f'{name}: {n}')
 s=s2
sub(r'^\.matrix-explore-main-screen \.explore-settings \.setting-grid label \{.*?^\}', '''.matrix-explore-main-screen .explore-settings .setting-grid label {
min-width: 0; width: 100%; min-height: 38px; grid-template-columns: 104px minmax(0, 1fr); align-items: center; gap: 8px;
}''','row')
sub(r'^\.matrix-explore-main-screen \.explore-settings \.setting-grid label > span \{.*?^\}', '''.matrix-explore-main-screen .explore-settings .setting-grid label > span {
display: grid; width: 100%; min-width: 0; grid-template-columns: 38px minmax(0, 1fr); align-items: center; gap: 8px; color: #bdb8b0; font-size: 13px; font-weight: 600; line-height: 18px; text-align: left; white-space: nowrap;
}''','label')
sub(r'^\.matrix-explore-main-screen \.explore-settings \.setting-grid label > span \.setting-label-icon \{.*?^\}', '''.matrix-explore-main-screen .explore-settings .setting-grid label > span .setting-label-icon {
width: 38px; height: 38px; flex: 0 0 38px; border-radius: 6px; transform: none;
}''','icon')
sub(r'^\.matrix-explore-main-screen \.explore-settings \.setting-grid \.select-box \{.*?^\}', '''.matrix-explore-main-screen .explore-settings .setting-grid .select-box {
width: 100%; max-width: none; min-width: 0; height: 32px; min-height: 32px; padding: 0; font-size: 12px; font-weight: 700;
}''','select')
sub(r'^\.matrix-explore-main-screen \.explore-settings \.segmented\.three button \{.*?^\}', '''.matrix-explore-main-screen .explore-settings .segmented.three button {
min-width: 0; height: 32px; min-height: 32px; padding: 0 3px; border-radius: 8px; font-size: 11px; font-weight: 600; line-height: 1.15; white-space: normal; overflow: visible;
}''','seg3')
sub(r'^\.matrix-explore-main-screen \.explore-settings \.setting-grid \.select-box,\n\.matrix-explore-main-screen \.explore-settings \.setting-grid \.segmented,\n\.matrix-explore-main-screen \.explore-settings \.setting-grid \.segmented button \{.*?^\}', '''.matrix-explore-main-screen .explore-settings .setting-grid .select-box,
.matrix-explore-main-screen .explore-settings .setting-grid .segmented,
.matrix-explore-main-screen .explore-settings .setting-grid .segmented button {
height: 32px; min-height: 32px;
}''','height')
sub(r'^\.matrix-explore-main-screen \.hit-options button \{.*?^\}', '''.matrix-explore-main-screen .hit-options button {
height: 34px; min-height: 34px; padding: 0 4px; border-radius: 8px; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: visible;
}''','hit')
sub(r'^\.matrix-explore-main-screen \.advanced-row \{.*?^\}', '''.matrix-explore-main-screen .advanced-row {
height: 38px; min-height: 38px; margin: 8px 0 0; padding: 0; grid-template-columns: 34px minmax(0, 1fr) 12px; align-items: center; font-size: 14px; font-weight: 700;
}''','adv')
sub(r'^\.matrix-explore-main-screen \.advanced-row > img:first-child \{.*?^\}', '''.matrix-explore-main-screen .advanced-row > img:first-child {
width: 34px; height: 34px; border-radius: 5px; object-fit: contain;
}''','advicon')
sub(r'^\.matrix-explore-main-screen \.primary-action \{.*?^\}', '''.matrix-explore-main-screen .primary-action {
width: 100%; height: 40px; margin: 8px 0 12px; border: 1px solid #d4a52f; border-radius: 10px; background: #071018; color: #f6d472; font-size: 17px; font-weight: 700; letter-spacing: 0; box-shadow: 0 0 4px rgba(212, 165, 47, .18);
}''','action')
sub(r'^\.matrix-explore-main-screen \.history-panel \.panel-heading \{.*?^\}', '''.matrix-explore-main-screen .history-panel .panel-heading {
min-height: 40px; padding: 5px 8px; align-items: center;
}''','hh')
sub(r'^\.matrix-explore-main-screen \.history-panel \.panel-heading \.section-title \{.*?^\}', '''.matrix-explore-main-screen .history-panel .panel-heading .section-title {
min-width: 0; font-size: 13px; line-height: 17px; white-space: normal;
}''','ht')
# reference table density
sub(r'^\.history-row \{.*?^\}', '''.history-row {
display: grid; box-sizing: border-box; width: 100%; height: 46px; grid-template-columns: 66px 68px minmax(0, 1fr); align-items: center; border-top: 1px solid rgba(90, 87, 80, .45); color: #bcb7ae; font-size: 9px;
}''','historyrow')
p.write_text(s)
