from pathlib import Path

path = Path('src/__tests__/MatrixTianyanPage.test.tsx')
source = path.read_text()
append = r'''

test('天衍維持複合版路與準5+鎖定2碼，沒有準4+入口', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  expect(screen.getByText('複合版路')).toBeTruthy();
  expect(screen.getByRole('button', { name: '準5+（鎖定2碼）' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '準4+（鎖定1碼）' })).toBeNull();
});

test('天衍只有展開結果時才讀取驗證資料', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('14.27')).toBeTruthy();
  expect(matrixApi.fetchTianyanValidation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /展開版路/ }));
  expect(matrixApi.fetchTianyanValidation).toHaveBeenCalledWith(
    expect.objectContaining({ analysisVersion: '114000123:v1', drawPeriod: '114000123' }),
    'tianyan-api-1',
  );
});
'''
if "天衍只有展開結果時才讀取驗證資料" not in source:
    source += append
path.write_text(source)
