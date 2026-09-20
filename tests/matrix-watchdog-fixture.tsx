import {createRoot} from 'react-dom/client';
import {MatrixWatchdogPanel} from '../apps/admin/src/MatrixWatchdogPanel';
import {CHAIN_STAGES} from '../apps/admin/backend/matrix-chain';
import '../apps/admin/src/admin.css';
import '../apps/admin/src/system-status.css';
const at='2026-09-20T00:00:00Z';
const mode=new URLSearchParams(location.search).get('mode');
const reports=['今彩539','天天樂','六合彩','大樂透'].map((lottery,i)=>({lottery,drawPeriod:'12004',checkedAt:at,stages:CHAIN_STAGES.map(stage=>({stage,state:i===1&&stage==='analysis'?'FAIL':i===2?'UNKNOWN':'PASS',source:'Supabase',period:'12004',observedAt:at,code:i===1?'ANALYSIS_INCOMPLETE':'VERIFIED'}))}));
createRoot(document.getElementById('root')!).render(<main><MatrixWatchdogPanel detail={mode==='empty'?null:{checkedAt:at,completedAt:at,reports,actions:[{lottery:'天天樂',target:'railway',reasons:['analysis-missing'],outcome:'accepted'}]}} now={new Date(mode==='stale'?'2026-09-21T00:00:00Z':at)} /></main>);
