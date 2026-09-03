from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# ---- Matrix Explore component logic ----
feature_path = Path("src/FeaturePages.tsx")
feature = feature_path.read_text()

start = feature.index('  const defaultFilters: Record<string, ConsecutiveOption[]> = {')
end = feature.index('  const [lottery, setLottery]', start)
feature = feature[:start] + '''  const defaultFiltersFor = (hitValue: string, roadValue: string): ConsecutiveOption[] => {
    if (title === "Matrix 天衍") {
      return ["準11進12", "準14進15", "準15進16", "準16進17", "準17進18"];
    }
    const isTrailer = roadValue === "拖牌版路";
    if (hitValue === "準4+（鎖定1碼）") {
      return isTrailer
        ? ["準5進6", "準6進7", "準7進8"]
        : ["準6進7", "準7進8"];
    }
    return isTrailer
      ? ["準6進7", "準7進8", "準9進10", "準11進12"]
      : ["準9進10", "準11進12"];
  };
''' + feature[end:]

feature = replace_once(
    feature,
    '    defaultFilters[title === "Matrix 天衍" ? "準5+（鎖定2碼）" : "準4+（鎖定1碼）"],',
    '''    defaultFiltersFor(
      title === "Matrix 天衍" ? "準5+（鎖定2碼）" : "準4+（鎖定1碼）",
      roadTypes[0],
    ),''',
    "selected filter initializer",
)

handler_start = feature.index('  const changeHit = (value: string) => {')
handler_end = feature.index('  const changeLottery = (value: LotteryId) => {', handler_start)
feature = feature[:handler_start] + '''  const changeHit = (value: string) => {
    setHit(value);
    setSelectedFilters(defaultFiltersFor(value, road));
    setExpandedRoad(null);
    setResultPage(1);
  };

  const changeRoad = (value: string) => {
    setRoad(value);
    setSelectedFilters(defaultFiltersFor(hit, value));
    setExpandedRoad(null);
    setResultPage(1);
  };

''' + feature[handler_end:]

feature = replace_once(
    feature,
    '    const nextFilters = defaultFilters[hit];',
    '    const nextFilters = defaultFiltersFor(hit, road);',
    "start explore defaults",
)
feature = replace_once(
    feature,
    'onClick={() => setRoad(v)}',
    'onClick={() => changeRoad(v)}',
    "road selector handler",
)
feature = replace_once(
    feature,
    '<span>{`第${position}顆`}</span>{" "}',
    '''<span className="explore-validation-formula-position">
        <span>第</span>
        <span>{position}</span>
        <span>顆</span>
      </span>{" "}''',
    "explore formula position grouping",
)
feature = replace_once(
    feature,
    '''{paginatedResults.map((item) => (
                <article key={item.id}>''',
    '''{paginatedResults.map((item, index) => (
                <article
                  data-number-group-start={sameCode && index > 0 && paginatedResults[index - 1]?.prediction !== item.prediction ? "true" : undefined}
                  key={item.id}
                >''',
    "same-code group boundary marker",
)
feature_path.write_text(feature)


# ---- Existing Matrix Explore unit expectations ----
test_path = Path("src/__tests__/MatrixExplorePage.test.tsx")
test_source = test_path.read_text()

test_source = replace_once(
    test_source,
    "expect(options.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'true', 'true']);",
    "expect(options.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'true']);",
    "準4 pressed defaults",
)
test_source = replace_once(
    test_source,
    '''  fireEvent.click(screen.getByRole('button', { name: '準5進6' }));
  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.objectContaining({ selectedStreaks: ['準6進7', '準7進8'] }),
  ));''',
    '''  fireEvent.click(screen.getByRole('button', { name: '準6進7' }));
  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.objectContaining({ selectedStreaks: ['準7進8'] }),
  ));''',
    "準4 temporary filter interaction",
)
test_source = replace_once(
    test_source,
    "expect(screen.getByRole('button', { name: '準5進6' }).getAttribute('aria-pressed')).toBe('true');",
    "expect(screen.getByRole('button', { name: '準6進7' }).getAttribute('aria-pressed')).toBe('true');",
    "準4 restored aria",
)
test_source = replace_once(
    test_source,
    '''  fireEvent.click(screen.getByRole('button', { name: '準7進8' }));

  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.objectContaining({ selectedStreaks: ['準9進10', '準11進12'] }),
  ));''',
    '''  fireEvent.click(screen.getByRole('button', { name: '準9進10' }));

  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.objectContaining({ selectedStreaks: ['準11進12'] }),
  ));''',
    "準5 temporary filter interaction",
)
test_source = replace_once(
    test_source,
    "expect(screen.getByRole('button', { name: '準7進8' }).getAttribute('aria-pressed')).toBe('true');",
    "expect(screen.getByRole('button', { name: '準9進10' }).getAttribute('aria-pressed')).toBe('true');",
    "準5 restored aria",
)
# All remaining old arrays in this file represent Matrix Explore default expectations.
test_source = test_source.replace(
    "selectedStreaks: ['準5進6', '準6進7', '準7進8'],",
    "selectedStreaks: ['準6進7', '準7進8'],",
)
test_source = test_source.replace(
    "selectedStreaks: ['準7進8', '準9進10', '準11進12'],",
    "selectedStreaks: ['準9進10', '準11進12'],",
)

anchor = "test('再次開始探索會清除同碼與號碼篩選並恢復準4+預設連準', async () => {"
if test_source.count(anchor) != 1:
    raise SystemExit("trailer-default unit test anchor not found exactly once")
trailer_test = '''test('拖牌版路依命中條件使用例外預設連準', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '拖牌版路推薦' }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(expect.objectContaining({
    roadTypes: ['拖牌'],
    selectedStreaks: ['準5進6', '準6進7', '準7進8'],
  })));

  fireEvent.click(screen.getByRole('button', { name: '準5+（鎖定2碼）' }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(expect.objectContaining({
    roadTypes: ['拖牌'],
    selectedStreaks: ['準6進7', '準7進8', '準9進10', '準11進12'],
  })));
});

'''
test_source = test_source.replace(anchor, trailer_test + anchor, 1)
test_path.write_text(test_source)


# ---- Explore-only visual rules ----
preview_path = Path("src/explore-result-preview.css")
preview = preview_path.read_text().rstrip()
marker = "/* Matrix Explore result refinements: keep Tianyan isolated from Explore-only spacing. */"
if marker in preview:
    raise SystemExit("Explore result refinement CSS block already exists")
preview += '''

/* Matrix Explore result refinements: keep Tianyan isolated from Explore-only spacing. */
.matrix-explore-main-screen:not(.matrix-tianyan-screen) .explore-validation-card {
  padding-block: 12px;
}

.matrix-explore-main-screen:not(.matrix-tianyan-screen) .explore-validation-formula-position {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
}

.matrix-explore-main-screen:not(.matrix-tianyan-screen)
  .explore-validation-group:is([data-lottery="今彩539"], [data-lottery="天天樂"])[data-wide-numbers="false"]
  .explore-validation-numbers {
  gap: calc(clamp(4px, 1.5vw, 6px) + 1px);
  padding-inline: 4px;
}

.matrix-explore-main-screen:not(.matrix-tianyan-screen) .explore-validation-result-number {
  font-size: calc(.8em - 2px);
  margin-inline: 2px;
}
'''
preview_path.write_text(preview + "\n")

spacing_path = Path("src/matrix-explore-spacing.css")
spacing = spacing_path.read_text().rstrip()
spacing_marker = "/* Matrix Explore result table alignment and same-code grouping. */"
if spacing_marker in spacing:
    raise SystemExit("Explore result table refinement CSS block already exists")
spacing += '''

/* Matrix Explore result table alignment and same-code grouping. */
.matrix-explore-main-screen:not(.matrix-tianyan-screen) .road-results-head {
  align-items: end;
  padding-bottom: 5px;
}

.matrix-explore-main-screen:not(.matrix-tianyan-screen) .road-results article[data-number-group-start="true"] {
  border-top: 1px solid rgba(230, 183, 106, .72);
}
'''
spacing_path.write_text(spacing + "\n")


# ---- New forward-only RPC migration for number-card ordering ----
source_migration = Path("supabase/migrations/20260902040000_matrix_explore_v12_rpc.sql").read_text()
function_start = source_migration.index("create or replace function public.matrix_explore_list")
function_end = source_migration.index("create or replace function public.matrix_explore_validation")
list_function = source_migration[function_start:function_end].rstrip()
old_order = "case when v_same then filtered.prediction_numbers::text else '' end,"
new_order = "case when v_same or v_prediction_number is not null then filtered.prediction_numbers::text else '' end,"
if list_function.count(old_order) != 1:
    raise SystemExit(f"matrix_explore_list order clause expected once, found {list_function.count(old_order)}")
list_function = list_function.replace(old_order, new_order, 1)

migration_path = Path("supabase/migrations/20260904040000_matrix_explore_prediction_number_group_order.sql")
if migration_path.exists():
    raise SystemExit("new prediction-number grouping migration already exists")
migration_path.write_text(f'''-- Keep a selected duplicate-number card grouped in the same prediction-number order as 同碼 mode.
begin;

{list_function}

revoke all on function public.matrix_explore_list(jsonb) from public;
grant execute on function public.matrix_explore_list(jsonb) to anon, authenticated;

commit;
''')
