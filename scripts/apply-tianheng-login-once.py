from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'src/matrix-algorithm-api.ts',
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
    """  // Only the legacy Matrix Explore two-period read remains public. Tianheng,
  // higher Explore periods, full range, Tianyan and Tiangong require a member session;
  // the database remains authoritative for that member's actual entitlement.
  const sessionOptions = {
    allowGuest: (name === 'matrix_explore_list' || name === 'matrix_explore_validation')
      && (request as { explorePeriods?: number }).explorePeriods === 2,
  };
""",
)

replace_once(
    'src/onboarding/FirstVisitGuide.tsx',
    'alternative="Matrix 探索二期與天衡三期基本查詢可直接使用；較高期數、完整範圍、天衍與天工請先使用 LINE 或 Google 登入。新註冊 LINE 會員另有天衍 2 天、天工 1 天試用。"',
    'alternative="Matrix 探索二期基本查詢可直接使用；天衡、較高期數、完整範圍、天衍與天工請先使用 LINE 或 Google 登入。新註冊 LINE 會員另有天衍 2 天、天工 1 天試用。"',
)

replace_once(
    'src/__tests__/FirstVisitGuideGuest.test.tsx',
    "  expect(dialog.textContent).toContain('探索二期');\n  expect(dialog.textContent).toContain('LINE 或 Google 登入');\n",
    "  expect(dialog.textContent).toContain('探索二期');\n  expect(dialog.textContent).toContain('天衡、較高期數');\n  expect(dialog.textContent).not.toContain('天衡三期基本查詢可直接使用');\n  expect(dialog.textContent).toContain('LINE 或 Google 登入');\n",
)

Path('supabase/migrations/20260915154500_tianheng_requires_login.sql').write_text(
    """-- Tianheng is member-only. Matrix Explore two-period remains the only anonymous algorithm read.
revoke execute on function public.matrix_tianheng_list(jsonb) from anon;
revoke execute on function public.matrix_tianheng_validation(jsonb) from anon;
""",
    encoding='utf-8',
)

print('Applied Tianheng login requirement.')
