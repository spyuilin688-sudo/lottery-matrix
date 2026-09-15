from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'src/matrix-algorithm-api.ts',
    """  // Algorithm reads can start without a member session. The database RPCs remain
  // authoritative for the global free-access switch and feature entitlements.
  const sessionOptions = { allowGuest: true };
""",
    """  // Keep the legacy public basics available without an account. Higher periods,
  // full range, Tianyan and Tiangong require an authenticated member session;
  // the database remains authoritative for that member's actual entitlement.
  const sessionOptions = {
    allowGuest: (
      (name === 'matrix_explore_list' || name === 'matrix_explore_validation')
        && (request as { explorePeriods?: number }).explorePeriods === 2
    ) || (
      (name === 'matrix_tianheng_list' || name === 'matrix_tianheng_validation')
        && (request as { explorePeriods?: number }).explorePeriods === 3
    ),
  };
""",
)

replace_once(
    'src/auth/algorithm-cache-scope.ts',
    """  if (error) {
    // Public algorithm reads must not depend on Auth being available. Only a
    // genuinely sessionless lookup may fall back to the anonymous cache scope;
    // protected callers and ambiguous authenticated failures remain rejected.
    if (!options.allowGuest || returnedSession) throw new MatrixApiError('AUTH_REQUIRED', 401);
    updateAlgorithmCacheSession(null);
    return generation;
  }
  updateAlgorithmCacheSession(returnedSession);
""",
    """  if (error) throw new MatrixApiError('AUTH_REQUIRED', 401);
  updateAlgorithmCacheSession(returnedSession);
""",
)

replace_once(
    'src/onboarding/FirstVisitGuide.tsx',
    'formal="點擊下方「我的」，再點擊「LINE 登入」即可免費註冊會員。新註冊 LINE 會員可使用 Pro 演算法：天衍 2 天、天工 1 天。點擊首頁下方的 Matrix Core，即可進入探索。"',
    'formal="點擊下方「我的」，可使用 LINE 或 Google 登入。新註冊 LINE 會員可使用 Pro 演算法：天衍 2 天、天工 1 天。點擊首頁下方的 Matrix Core，即可進入探索。"',
)
replace_once(
    'src/onboarding/FirstVisitGuide.tsx',
    'alternative="目前查詢功能可直接使用，不需 LINE 登入；點擊首頁下方的 Matrix Core 即可進入探索。需要會員相關功能時，再到右下方「我的」登入。"',
    'alternative="Matrix 探索二期與天衡三期基本查詢可直接使用；較高期數、完整範圍、天衍與天工請先使用 LINE 或 Google 登入。新註冊 LINE 會員另有天衍 2 天、天工 1 天試用。"',
)

replace_once(
    'src/__tests__/MatrixExploreGuest.test.tsx',
    """test('匿名使用者即使 session lookup 失敗仍可使用探索', async () => {
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: new Error('session unavailable') });
  await start();
  expect(await screen.findByText('22.26')).toBeTruthy();
  expect(sdk.rpc).toHaveBeenCalledWith('matrix_explore_list', { p_request: expect.objectContaining({ explorePeriods: 2 }) });
  expect(screen.queryByRole('dialog', { name: '請先登入' })).toBeNull();
});
""",
    """test('session lookup 失敗時不把未知身分降級成匿名查詢', async () => {
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: new Error('session unavailable') });
  await start();
  expect((await screen.findByRole('dialog', { name: '請先登入' })).textContent).toContain('請先登入後再使用 Matrix 探索');
  fireEvent.click(screen.getByRole('button', { name: '知道了' }));
  expect((await screen.findByRole('alert')).textContent).toBe('請先登入後再使用 Matrix 探索');
  expect(screen.queryByText('無符合設定條件')).toBeNull();
  expect(document.querySelector('.result-count')).toBeNull();
});
""",
)
replace_once(
    'src/__tests__/MatrixExploreGuest.test.tsx',
    """test('未登入也可以呼叫天衍與天工', async () => {
  await expect(fetchTianyanList({ lottery: '今彩539', selectedStreaks: ['準5進6'], sameCode: false })).resolves.toBeTruthy();
  await expect(fetchTiangongList({ lottery: '今彩539', periodRange: 50, mode: 'two-stage', hitCondition: '準2進3', exploreDirections: ['固定'], firstStageDirections: ['固定'], firstRoadTypes: ['加減'] })).resolves.toBeTruthy();
  expect(sdk.rpc).toHaveBeenCalledWith('matrix_tianyan_list', { p_request: expect.objectContaining({ lottery: '今彩539' }) });
  expect(sdk.rpc).toHaveBeenCalledWith('matrix_tiangong_list', { p_request: expect.objectContaining({ lottery: '今彩539', periodRange: 50 }) });
});
""",
    """test('天衍與天工仍要求登入', async () => {
  await expect(fetchTianyanList({ lottery: '今彩539', selectedStreaks: ['準5進6'], sameCode: false })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  await expect(fetchTiangongList({ lottery: '今彩539', periodRange: 50, mode: 'two-stage', hitCondition: '準2進3', exploreDirections: ['固定'], firstStageDirections: ['固定'], firstRoadTypes: ['加減'] })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(sdk.rpc).not.toHaveBeenCalled();
});
""",
)
replace_once(
    'src/__tests__/MatrixExploreGuest.test.tsx',
    """test('訪客選擇七期仍會送出探索請求', async () => {
  await expect(fetchExploreList({ lottery: '今彩539', numberOrder: '依號碼由小到大排序', explorePeriods: 7, exploreDateOffset: 0, exploreRange: '標準範圍', ruleCount: 1, roadTypes: ['加減'], selectedStreaks: ['準5進6'], sameCode: false })).resolves.toBeTruthy();
  expect(sdk.rpc).toHaveBeenCalledWith('matrix_explore_list', { p_request: expect.objectContaining({ explorePeriods: 7 }) });
});
""",
    """test('訪客選擇七期時須登入，且不送出探索請求', async () => {
  await expect(fetchExploreList({ lottery: '今彩539', numberOrder: '依號碼由小到大排序', explorePeriods: 7, exploreDateOffset: 0, exploreRange: '標準範圍', ruleCount: 1, roadTypes: ['加減'], selectedStreaks: ['準5進6'], sameCode: false })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(sdk.rpc).not.toHaveBeenCalled();
});
""",
)

print('Applied registered-member algorithm access patch.')
