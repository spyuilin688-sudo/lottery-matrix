from pathlib import Path

prototype_path = Path('src/Prototype.tsx')
prototype = prototype_path.read_text()
old = '''            >\n              <span className="clean-hit-label">{lottery.id}</span>\n            </button>'''
new = '''            >\n              <img className="lottery-card-logo" src={lottery.logo} alt="" draggable={false} />\n              <span className="clean-hit-label">{lottery.id}</span>\n            </button>'''
count = prototype.count(old)
if count != 1:
    raise SystemExit(f'LotterySwitcher markup source count={count}')
prototype = prototype.replace(old, new, 1)
prototype_path.write_text(prototype)

css_path = Path('src/homepage-repair.css')
css = css_path.read_text()

replacements = [
    (
        '''  border: 1px solid rgba(118, 84, 43, .82);\n  border-radius: 8px;\n  background-color: rgba(2, 7, 12, .72);\n  background-image: url("/assets/lottery/status/Matrixbba.png");\n  background-repeat: no-repeat;\n  background-size: 400% 100%;\n  color: transparent;\n  box-shadow: inset 0 0 8px rgba(196, 145, 69, .04);\n  filter: brightness(.72) saturate(.78);\n  overflow: hidden;''',
        '''  border: 1px solid rgba(118, 84, 43, .95);\n  border-radius: 8px;\n  background: linear-gradient(180deg, rgba(7, 16, 24, .94), rgba(2, 7, 12, .98));\n  color: transparent;\n  box-shadow: inset 0 0 12px rgba(196, 145, 69, .08);\n  overflow: hidden;''',
    ),
    (
        '''.home-screen .lottery-switcher > .lottery-switcher-hit-grid > .lottery-card[data-lottery="今彩539"] {\n  background-position: 0% 50%;\n}\n\n.home-screen .lottery-switcher > .lottery-switcher-hit-grid > .lottery-card[data-lottery="天天樂"] {\n  background-position: 33.333% 50%;\n}\n\n.home-screen .lottery-switcher > .lottery-switcher-hit-grid > .lottery-card[data-lottery="六合彩"] {\n  background-position: 66.667% 50%;\n}\n\n.home-screen .lottery-switcher > .lottery-switcher-hit-grid > .lottery-card[data-lottery="大樂透"] {\n  background-position: 100% 50%;\n}\n\n''',
        '''.home-screen .lottery-card-logo {\n  display: block;\n  width: 86%;\n  height: 72%;\n  max-width: 92%;\n  max-height: 82%;\n  object-fit: contain;\n  object-position: center;\n}\n\n''',
    ),
    (
        '''  border: 0;\n  border-radius: 10px;\n  background-color: rgba(2, 7, 12, .34);\n  background-image: url("/assets/lottery/functions/開獎資訊卡.png");\n  background-repeat: no-repeat;\n  background-position: center;\n  background-size: 100% 100%;\n  background-blend-mode: multiply;\n  box-shadow: inset 0 0 0 1px rgba(118, 84, 43, .26);''',
        '''  border: 1px solid rgba(118, 84, 43, .92);\n  border-radius: 10px;\n  background-color: #02070c;\n  background-image: url("/assets/lottery/functions/開獎資訊卡.png");\n  background-repeat: no-repeat;\n  background-position: center;\n  background-size: 100% 100%;\n  background-blend-mode: normal;\n  box-shadow: inset 0 0 0 1px rgba(196, 145, 69, .08), 0 0 5px rgba(196, 145, 69, .08);''',
    ),
    (
        '''  display: flex;\n  width: 100%;\n  justify-content: center;\n  border-radius: 10px;\n  background: rgba(2, 7, 12, .28);\n  box-shadow: inset 0 0 0 1px rgba(118, 84, 43, .42), inset 0 0 12px rgba(196, 145, 69, .035);''',
        '''  display: flex;\n  width: 100%;\n  padding: 2px;\n  justify-content: center;\n  border: 1px solid rgba(118, 84, 43, .92);\n  border-radius: 10px;\n  background: #02070c;\n  box-shadow: inset 0 0 12px rgba(196, 145, 69, .06);''',
    ),
    (
        '''  object-fit: contain;\n  object-position: center top;\n  filter: brightness(.72) saturate(.8);\n  opacity: .92;''',
        '''  object-fit: contain;\n  object-position: center top;\n  border-radius: 8px;\n  filter: brightness(.9) saturate(1.04);\n  opacity: 1;''',
    ),
    (
        '''  min-width: 0;\n  padding: 0;\n  border: 0;\n  background: transparent;''',
        '''  min-width: 0;\n  margin: 2px 1px;\n  padding: 0;\n  border: 1px solid rgba(118, 84, 43, .72);\n  border-radius: 8px;\n  background: rgba(2, 7, 12, .08);\n  box-shadow: inset 0 0 8px rgba(196, 145, 69, .035);''',
    ),
    (
        '''.home-screen .matrix-status-hit-grid > button[data-active="true"] {\n  background: rgba(244, 206, 103, .035);\n  box-shadow: inset 0 0 0 1px rgba(244, 206, 103, .72), inset 0 0 14px rgba(244, 206, 103, .12);\n}''',
        '''.home-screen .matrix-status-hit-grid > button[data-active="true"] {\n  border-color: rgba(244, 206, 103, .96);\n  background: rgba(244, 206, 103, .04);\n  box-shadow: inset 0 0 12px rgba(244, 206, 103, .12), 0 0 6px rgba(244, 206, 103, .18);\n}''',
    ),
    (
        '''  border: 0;\n  border-radius: 8px;\n  background: rgba(2, 7, 12, .34);\n  box-shadow: none;\n  overflow: hidden;''',
        '''  border: 1px solid rgba(118, 84, 43, .9);\n  border-radius: 8px;\n  background: #02070c;\n  box-shadow: inset 0 0 8px rgba(196, 145, 69, .06);\n  overflow: hidden;''',
    ),
    (
        '''  width: auto;\n  height: 100%;\n  max-height: 100%;\n  max-width: 100%;\n  object-fit: contain;\n  object-position: center;\n  border-radius: 8px;\n  clip-path: polygon(1.5px 0, calc(100% - 1.5px) 0, 100% 1.5px, 100% calc(100% - 1.5px), calc(100% - 1.5px) 100%, 1.5px 100%, 0 calc(100% - 1.5px), 0 1.5px);\n  filter: brightness(.7) saturate(.76);\n  opacity: .9;''',
        '''  width: 94%;\n  height: 94%;\n  max-height: 94%;\n  max-width: 94%;\n  object-fit: contain;\n  object-position: center;\n  border-radius: 6px;\n  clip-path: polygon(1.5px 0, calc(100% - 1.5px) 0, 100% 1.5px, 100% calc(100% - 1.5px), calc(100% - 1.5px) 100%, 1.5px 100%, 0 calc(100% - 1.5px), 0 1.5px);\n  filter: brightness(.94) saturate(.96);\n  opacity: 1;''',
    ),
    (
        '''.home-screen .lottery-switcher > .lottery-switcher-hit-grid > .lottery-card[data-selected="true"] {\n  border-color: rgba(244, 206, 103, .9);\n  box-shadow: inset 0 0 8px rgba(244, 206, 103, .06), 0 0 5px rgba(255, 206, 105, .16);\n  filter: brightness(1) saturate(1);\n}\n\n.home-screen .bottom-navigation-artwork {\n  filter: brightness(.7) saturate(.62);\n  opacity: .8;\n}''',
        '''.home-screen .lottery-switcher > .lottery-switcher-hit-grid > .lottery-card[data-selected="true"] {\n  border-color: rgba(244, 206, 103, .96);\n  background: linear-gradient(180deg, rgba(44, 31, 12, .92), rgba(2, 7, 12, .98));\n  box-shadow: inset 0 0 12px rgba(244, 206, 103, .12), 0 0 8px rgba(244, 206, 103, .22);\n}\n\n.home-screen .bottom-navigation {\n  background: #02070c;\n  box-shadow: inset 0 1px 0 rgba(118, 84, 43, .82);\n}\n\n.home-screen .bottom-navigation-artwork {\n  filter: brightness(.9) saturate(.86);\n  opacity: .92;\n}\n\n.home-screen .bottom-navigation-item[data-selected="true"] {\n  background: radial-gradient(circle at 50% 76%, rgba(244, 206, 103, .12), transparent 58%);\n}''',
    ),
]

for old, new in replacements:
    count = css.count(old)
    if count != 1:
        raise SystemExit(f'Expected one formal CSS source match, found {count}: {old[:100]}')
    css = css.replace(old, new, 1)

css_path.write_text(css)
