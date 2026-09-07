import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const dir=await mkdtemp(resolve('.tiangong-preview-')),name=dir.split('/').at(-1);
const directions=['依序遞增','依序遞減','固定'];
const items=directions.flatMap(a=>directions.flatMap(b=>directions.map(c=>({id:`${a}-${b}-${c}`,interval:39,predictedPosition:3,predictionNumber:'28',exploreDirection:a,firstStageDirection:b,secondStageDirection:c,firstRoadType:'合值',secondRoadType:'加減'}))));
const value={period:'115000085',position:3,numbers:[1,3,8,19,28,49,6],number:'08',actual_number:'08',calculated_number:'08',matched:true};
const validation={itemId:items[0].id,evidence:{stage1_distance:14,stage2_distance:5,stage1_operation:{type:'sum',value:16},stage2_operation:{type:'add_sub',residue:0},rows:[{group:'A',source:value,stage1:value,stage2:value}],d_exclusion:{status:'path_not_extendable'}}};
await writeFile(resolve(dir,'mock.ts'),`export async function fetchTiangongList(){return ${JSON.stringify({lottery:'大樂透',analysisVersion:'test',drawPeriod:'115000085',total:27,items})};} export async function fetchTiangongValidation(){return {validation:${JSON.stringify(validation)}};}`);
const imports=(await readFile('src/main.tsx','utf8')).split('\n').filter(x=>x.startsWith('import ')&&x.includes('.css')&&!x.includes('@fontsource')).join('\n').replaceAll('"./','"/src/');
await writeFile(resolve(dir,'index.html'),`<div id="root"></div><script type="module" src="/${name}/entry.tsx"></script>`);
await writeFile(resolve(dir,'entry.tsx'),`import "/src/feature-pages.css";\n${imports}\nimport React from 'react';import{createRoot}from'react-dom/client';import{MatrixTiangongPage}from'/src/features/MatrixTiangongPage';createRoot(document.getElementById('root')).render(<MatrixTiangongPage onNavigate={()=>{}}/>);`);
let browser;const server=await createServer({configFile:false,optimizeDeps:{entries:[resolve(dir,'index.html')]},plugins:[{name:'fixture',enforce:'pre',transform(code,id){if(id.endsWith('/src/features/MatrixTiangongPage.tsx'))return code.replace('from "../matrix-algorithm-api"',`from "/${name}/mock.ts"`);}},react()],server:{host:'127.0.0.1',port:4179}});
try{
 await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on("pageerror", error=>console.log("Page error:",error.message));
 for(const width of [360,390,430]){
  await page.setViewportSize({width,height:844});await page.goto(`http://127.0.0.1:${server.config.server.port}/${name}/index.html`);
  await page.getByRole('button',{name:'開始天工'}).click();await page.locator('.tiangong-result-row').first().waitFor();
  const errors=await page.locator('.tiangong-result-row').evaluateAll(rows=>rows.flatMap(row=>[...row.children].filter(cell=>cell.scrollWidth>cell.clientWidth+1).map(cell=>({text:cell.textContent,width:cell.clientWidth,scroll:cell.scrollWidth}))));
  if(errors.length)throw new Error(`Cell overflow at ${width}: ${JSON.stringify(errors.slice(0,5))}`);
  const aligned=await page.evaluate(()=>{
    const head=[...document.querySelector('.tiangong-results-head').children];
    const row=[...document.querySelector('.tiangong-result-row').children];
    return head.every((cell,i)=>Math.abs(cell.getBoundingClientRect().x-row[i].getBoundingClientRect().x)<1 && Math.abs(cell.getBoundingClientRect().width-row[i].getBoundingClientRect().width)<1);
  });
  if(!aligned)throw new Error('Header and result columns misaligned');
  const inset=await page.locator('.result-panel').evaluate(x=>x.getBoundingClientRect().left);
  if(Math.abs(inset-13)>1)throw new Error('Wrong result panel inset: '+inset);
  const statsInset=await page.locator('.repeat-stats-panel').evaluate(x=>x.getBoundingClientRect().left);
  if(Math.abs(statsInset-16)>1)throw new Error('Wrong stats inset: '+statsInset);
  const gap=await page.locator('.tiangong-directions').first().evaluate(x=>getComputedStyle(x).gap);
  if(gap!=='1.5px')throw new Error('Wrong displacement gap: '+gap);
  await page.locator('.tiangong-result-row').first().click();await page.getByRole('region',{name:'天工驗證過程'}).waitFor();
  if(await page.locator('.explore-validation-issue').count()!==3)throw new Error('Wrong validation rows');
  const summary=page.getByLabel('版路摘要');
  if(await summary.locator('.tianyan-validation-summary-row').count()!==2)throw new Error('Wrong summary row count');
  const summaryFits=await summary.evaluate(x=>[...x.children].every(row=>row.getBoundingClientRect().right<=x.getBoundingClientRect().right+1));
  if(!summaryFits)throw new Error('Summary overflow');
  const alignedSummary=await summary.evaluate(x=>{
    const rows=[...x.querySelectorAll('.tianyan-validation-summary-row')];
    return Math.abs(rows[0].querySelector('.validation-summary-position').getBoundingClientRect().left-rows[1].querySelector('.validation-summary-position').getBoundingClientRect().left)<1;
  });
  if(!alignedSummary)throw new Error('Summary positions not aligned');
  const formulaGap=await page.locator('.explore-validation-formula-expression').first().evaluate(x=>getComputedStyle(x).gap);
  if(formulaGap!=='1px')throw new Error('Wrong formula gap');
  const predictionStyles=await page.locator('.explore-validation-prediction-content strong').evaluateAll(xs=>xs.map(x=>{const s=getComputedStyle(x);return s.fontSize+s.color;}));
  if(predictionStyles.length!==2||predictionStyles[0]!==predictionStyles[1])throw new Error('Prediction label styles differ');
  const validationErrors=await page.locator('.explore-validation-group > div').evaluateAll(cards=>cards.flatMap(card=>[...card.children].filter(row=>row.scrollWidth>row.clientWidth+1).map(row=>({text:row.textContent,width:row.clientWidth,scroll:row.scrollWidth}))));
  if(validationErrors.length)throw new Error(`Validation overflow at ${width}: ${JSON.stringify(validationErrors)}`);
  const issueStyle=await page.locator('.explore-validation-issue').first().evaluate(x=>({size:getComputedStyle(x).fontSize,color:getComputedStyle(x).color,border:getComputedStyle(x.parentElement).borderTopWidth}));
  if(issueStyle.size!=='9px'||issueStyle.border!=='1px')throw new Error('Wrong exploration issue style: '+JSON.stringify(issueStyle));
  console.log(`Passed ${width}px: 27 directions, no cell overflow, full-row disclosure, 3-column validation`);
 }
}finally{await browser?.close();await server.close();await rm(dir,{recursive:true,force:true});}
