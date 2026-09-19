import {sanitizeWatchdogStatus} from '../backend/watchdog-status';
import type {ChainStage,StageState} from '../backend/matrix-chain';
import {formatAdminDateTime} from './admin-operations';
const stageNames:Record<ChainStage,string> = {schedule:'排程執行',job:'工作',crawler:'爬蟲',draw:'開獎資料',analysis:'分析','matrix-status':'Matrix 狀態','custom-status':'自訂狀態'};
const stateNames:Record<StageState,string> = {PASS:'已驗證',FAIL:'異常',WAITING:'等待',UNKNOWN:'證據不足'};
const tones:Record<StageState,string> = {PASS:'good',FAIL:'bad',WAITING:'warning',UNKNOWN:'limited'};
const outcomes = {'accepted':'已受理，等待資料驗證','already-running':'執行中，未重複啟動','lease-held':'其他工作持有執行鎖','dispatched':'已派送，等待資料驗證','config-missing':'恢復設定不足','failed':'恢復請求失敗'};
export function MatrixWatchdogPanel({detail,now=new Date()}:{detail:unknown;now?:Date}) {
 const status=sanitizeWatchdogStatus(detail);
 const age=now.getTime()-Date.parse(status.completedAt);
 const stale=age>18*60000||age< -120000;
 return <section className="matrixWatchdogPanel" aria-label="Matrix 資料鏈監控">
  <header className="statusGroupHeader"><h3>Matrix 資料鏈</h3><span>{formatAdminDateTime(status.checkedAt)}</span></header>
  {stale&&<p className="systemStatusNotice" role="status">觀察已過期或時間異常；以下為最近紀錄，請重新檢查。</p>}
  {!status.reports?.length&&<p className="statusEmpty">尚無完整資料鏈紀錄。</p>}
  <div className="matrixChainGrid">
   {status.reports?.map(report=>{
    const diagnosis=status.diagnoses?.find(d=>d.lottery===report.lottery);
    const action=status.actions.find(a=>a.lottery===report.lottery);
    return <article className="statusRow" key={report.lottery} aria-label={`${report.lottery} ${report.drawPeriod??'期數未知'}`}>
     <header className="matrixChainHeader"><strong>{report.lottery}</strong><span>{report.drawPeriod??'期數未知'} 期</span><span className="statusState"><span className={`statusBadge ${tones[stale?'UNKNOWN':report.state]}`}>{stale?'待重新確認':stateNames[report.state]}</span></span></header>
     <dl className="statusFacts">{report.stages.map(stage=><div key={stage.stage}><dt>{stageNames[stage.stage]}</dt><dd>{stateNames[stage.state]}</dd></div>)}</dl>
     {action&&<p className="statusScope">恢復：{outcomes[action.outcome]}</p>}
     <p className="statusScope">{diagnosis?.faultLayer?`故障層：${stageNames[diagnosis.faultLayer]}`:'尚未定位故障層'}。{diagnosis?.rootCause?diagnosis.rootCause.code:'根因尚未確認。'}</p>
     <details className="statusDetails"><summary>查看診斷證據</summary><dl className="statusFacts">{diagnosis?.checks.map(check=><div key={check.name}><dt>{stageNames[check.name as ChainStage]??check.name}</dt><dd>{stateNames[check.state]} · {check.code}<br/>{check.source}</dd></div>)}</dl></details>
    </article>;
   })}
  </div>
  <details className="statusDetails"><summary>效能與優化候選</summary>
   {!status.optimizer?<p className="statusEmpty">尚未執行深度檢查；定期頻率與觀察保留期限尚未設定。</p>:<>
    <p className="statusScope">最近檢查：{formatAdminDateTime(status.optimizer.checkedAt)}。候選不會自動修改索引、權限或程式。</p>
    {!status.optimizer.candidates.length&&<p className="statusEmpty">這次取樣未產出候選；不代表所有項目均已驗證。</p>}
    <div className="statusRows">{status.optimizer.candidates.map((candidate,i)=><details className="statusDetails" key={`${candidate.subject}:${i}`}><summary>{candidate.subject} · {candidate.observation}</summary><p className="statusScope">{candidate.state==='candidate'?'待審查':'證據不足，持續觀察'}</p><ul className="matrixEvidenceList">{candidate.evidence.map((e,i)=><li key={i}>{e}</li>)}</ul></details>)}</div>
   </>}
  </details>
 </section>;
}
