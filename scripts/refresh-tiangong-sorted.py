"""Refresh only Tian Gong artifacts for the latest completed run of each lottery."""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'services/matrix-api'))
from app.domain.tiangong_artifact import build_tiangong_artifact
from app.repositories.analysis_repository import create_supabase_repository

repository = create_supabase_repository(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SECRET_KEY'])
client = repository.client
for lottery in ('今彩539', '天天樂', '六合彩', '大樂透'):
    runs = client.table('matrix_analysis_runs').select('draw_period,analysis_version').eq('lottery', lottery).eq('status', 'complete').order('draw_period', desc=True).limit(1).execute().data
    if not runs:
        raise RuntimeError('ANALYSIS_NOT_READY: ' + lottery)
    run = runs[0]
    anchor = client.table('lottery_draws').select('draw_date').eq('lottery', lottery).eq('period', run['draw_period']).single().execute().data
    draws = client.table('lottery_draws').select('period,draw_date,numbers').eq('lottery', lottery).lte('draw_date', anchor['draw_date']).order('draw_date', desc=True).order('period', desc=True).limit(119).execute().data
    history = [dict(period=d['period'], drawDate=d['draw_date'], numbers=d['numbers']) for d in draws]
    if len(history) < 119:
        raise RuntimeError('TIANGONG_HISTORY_REQUIRED: ' + lottery)
    artifact = build_tiangong_artifact(lottery, run['draw_period'], history)
    repository.save_artifact(lottery, run['draw_period'], run['analysis_version'], 'tiangong', artifact)
    saved = client.table('matrix_analysis_artifacts').select('payload->numberOrder').eq('lottery', lottery).eq('draw_period', run['draw_period']).eq('analysis_version', run['analysis_version']).eq('kind', 'tiangong').single().execute().data
    if saved.get('numberOrder') != '依號碼由小到大排序':
        raise RuntimeError('TIANGONG_SAVE_VERIFICATION_FAILED')
    print(lottery, run['draw_period'], len(artifact['items']), 'sorted artifact saved', flush=True)
