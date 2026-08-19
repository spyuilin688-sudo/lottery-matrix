from pathlib import Path
import re

lp=Path('src/matrix-explore-spacing.css'); bp=Path('src/number-ball.css')
css=lp.read_text(); balls=bp.read_text()

def replace_once(text, old, new, label):
    n=text.count(old)
    if n!=1: raise SystemExit(f'{label}: expected 1 match, found {n}')
    return text.replace(old,new,1)

def set_props(text, selector, props):
    pattern=re.compile(re.escape(selector)+r'\s*\{([^}]*)\}',re.S)
    for m in pattern.finditer(text):
        body=m.group(1)
        pats={p:re.compile(r'(^\s*'+re.escape(p)+r'\s*:\s*)[^;]+;',re.M) for p in props}
        if not all(pat.search(body) for pat in pats.values()): continue
        for p,v in props.items(): body,n=pats[p].subn(r'\g<1>'+v+';',body,count=1)
        return text[:m.start(1)]+body+text[m.end(1):]
    raise SystemExit(f'no matching declaration block: {selector}')

css=replace_once(css,'  padding: .625rem;\n  flex-direction: column;','  padding: .5rem;\n  flex-direction: column;','lower card padding')
css=set_props(css,'.matrix-explore-main-screen .history-panel .panel-heading',{'min-height':'36px','padding':'.25rem .375rem','gap':'.375rem'})
css=set_props(css,'.matrix-explore-main-screen .history-panel-title .section-title',{'font-size':'clamp(.875rem, 3.6vw, 1rem)'})
css=set_props(css,'.matrix-explore-main-screen .history-panel .panel-heading > button:last-child',{'font-size':'clamp(.625rem, 2.8vw, .75rem)'})
hg='.matrix-explore-main-screen .history-row,\n.matrix-explore-main-screen .history-row.history-head,\n.matrix-explore-main-screen .history-row:not(.history-head)'
css=set_props(css,hg,{'min-height':'34px','padding':'.125rem 0','grid-template-columns':'minmax(0, 1fr) minmax(0, 2fr) minmax(0, 7fr)'})
css=set_props(css,'.matrix-explore-main-screen .history-row.history-head',{'min-height':'30px','padding-block':'.125rem','font-size':'clamp(.6875rem, 3vw, .8125rem)'})
css=set_props(css,'.matrix-explore-main-screen .history-row > :nth-child(1)',{'font-size':'clamp(.6875rem, 3vw, .75rem)'})
css=set_props(css,'.matrix-explore-main-screen .history-row > :nth-child(2)',{'font-size':'clamp(.625rem, 2.7vw, .6875rem)'})
css=set_props(css,'.matrix-explore-main-screen .history-date-stack strong',{'font-size':'clamp(.625rem, 2.7vw, .6875rem)'})
css=set_props(css,'.matrix-explore-main-screen .history-date-stack small',{'font-size':'clamp(.5625rem, 2.4vw, .625rem)'})
css=set_props(css,'.matrix-explore-main-screen .history-numbers',{'gap':'.125rem'})
css=set_props(css,'.matrix-explore-main-screen .history-main-numbers',{'gap':'clamp(.0625rem, .5vw, .125rem)'})
css=set_props(css,'.matrix-explore-main-screen .history-special-number',{'margin-left':'.0625rem','gap':'.0625rem'})

css=set_props(css,'.matrix-explore-main-screen .repeat-stats-heading',{'min-height':'1.75rem','margin-bottom':'.375rem','gap':'.375rem'})
css=set_props(css,'.matrix-explore-main-screen .repeat-stats-heading > span',{'font-size':'clamp(.5625rem, 2.5vw, .6875rem)'})
css=set_props(css,'.matrix-explore-main-screen .result-summary',{'column-gap':'clamp(.125rem, .8vw, .25rem)','row-gap':'clamp(.25rem, 1.1vw, .375rem)'})
css=set_props(css,'.matrix-explore-main-screen .result-summary > div',{'min-height':'clamp(36px, 10vw, 40px)','padding':'.1875rem .0625rem','border-radius':'.4375rem'})
css=set_props(css,'.matrix-explore-main-screen .result-summary b',{'font-size':'clamp(.75rem, 3.2vw, .875rem)'})
css=set_props(css,'.matrix-explore-main-screen .result-summary small',{'margin-top':'0','font-size':'clamp(.5rem, 2.2vw, .625rem)'})

css=set_props(css,'.matrix-explore-main-screen .explore-result-disclaimer',{'padding':'.5rem .5rem','font-size':'.6875rem'})
css=set_props(css,'.matrix-explore-main-screen .result-title',{'margin-bottom':'.375rem','gap':'.375rem'})
css=set_props(css,'.matrix-explore-main-screen .result-title .section-title',{'font-size':'.9375rem'})
css=set_props(css,'.matrix-explore-main-screen .result-title .result-count',{'font-size':'.6875rem'})
css=set_props(css,'.matrix-explore-main-screen .result-title .result-count .numeric-text',{'font-size':'.875rem'})
rg='.matrix-explore-main-screen .road-results-head,\n.matrix-explore-main-screen .road-result-row'
css=set_props(css,rg,{'grid-template-columns':'minmax(0, .82fr) minmax(0, .7fr) minmax(0, .86fr) minmax(0, 1.12fr) minmax(0, .98fr) minmax(0, 1.36fr)','gap':'.125rem','font-size':'.6875rem'})
css=set_props(css,'.matrix-explore-main-screen .road-results-head',{'min-height':'32px','font-size':'.6875rem'})
css=set_props(css,'.matrix-explore-main-screen .road-result-row',{'min-height':'42px','padding':'.375rem 0'})
rt='.matrix-explore-main-screen .road-result-row > span,\n.matrix-explore-main-screen .road-result-row > button'
css=set_props(css,rt,{'font-size':'.6875rem'})
css=set_props(css,'.matrix-explore-main-screen .road-result-row > strong',{'font-size':'.875rem'})
css=set_props(css,'.matrix-explore-main-screen .road-results .tag',{'padding':'.125rem .25rem','font-size':'.5625rem'})
css=set_props(css,'.matrix-explore-main-screen .road-results .result-number',{'font-size':'.8125rem'})
css=set_props(css,'.matrix-explore-main-screen .road-results .result-period',{'font-size':'.625rem'})
css=set_props(css,'.matrix-explore-main-screen .road-results .result-consecutive',{'font-size':'.625rem'})
css=set_props(css,'.matrix-explore-main-screen .road-type-toggle',{'font-size':'.625rem'})
fg='.matrix-explore-main-screen .consecutive-filter-button,\n.matrix-explore-main-screen .repeat-stats-heading button'
css=set_props(css,fg,{'min-height':'26px','height':'26px','padding':'.125rem .5rem','font-size':'.6875rem'})
anchor=fg+' {\n  position: relative;\n  min-height: 26px;\n  height: 26px;\n  padding: .125rem .5rem;\n  font-size: .6875rem;\n}'
if anchor not in css: raise SystemExit('shared compact control block not found')
css=css.replace(anchor,anchor+'\n\n.matrix-explore-main-screen .repeat-stats-heading button {\n  border: 1px solid rgba(212, 165, 47, .72);\n  border-radius: .5rem;\n  background: transparent;\n  color: #d8a93e;\n}',1)

css=replace_once(css,'    grid-template-columns: 2fr 2.35fr 7.65fr;\n    gap: .125rem;','    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 7fr);\n    gap: 0;','320 history')
css=replace_once(css,'    height: clamp(22px, 6.8vw, 28px);\n    flex: 0 0 6px;\n    font-size: 10px;','    height: clamp(18px, 5.6vw, 20px);\n    flex: 0 0 6px;\n    font-size: 9px;','320 plus')
css=replace_once(css,'    width: clamp(22px, 6.8vw, 28px);\n    height: calc(clamp(22px, 6.8vw, 28px) + 7px);\n    grid-template-rows: 7px clamp(22px, 6.8vw, 28px);','    width: clamp(18px, 5.6vw, 20px);\n    height: calc(clamp(18px, 5.6vw, 20px) + 6px);\n    grid-template-rows: 6px clamp(18px, 5.6vw, 20px);','320 special')
css=replace_once(css,'    font-size: 6px;\n    line-height: 7px;','    font-size: 5.5px;\n    line-height: 6px;','320 special label')
balls=replace_once(balls,'  --number-ball-size: clamp(22px, 6.2vw, 24px);\n  --number-font-size: clamp(10px, 2.8vw, 11px);\n  --underline-width: clamp(9px, 2.8vw, 11px);','  --number-ball-size: clamp(18px, 5.2vw, 20px);\n  --number-font-size: clamp(9px, 2.4vw, 10px);\n  --underline-width: clamp(8px, 2.4vw, 9px);','ball sizing')
lp.write_text(css); bp.write_text(balls)
