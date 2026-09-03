from pathlib import Path

path = Path('src/__tests__/MatrixExplorePage.test.tsx')
source = path.read_text()
start_marker = "test('Matrix 天衍的近10期與探索頁使用相同展開行為', () => {"
end_marker = "\ntest('Matrix 同星移除近10期卡片並可收合探索設定', () => {"
start = source.index(start_marker)
end = source.index(end_marker, start)
replacement = '''test('Matrix 天衍移除近10期但保留 Matrix 探索頁布局', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);

  expect(document.querySelector('.matrix-tianyan-screen')?.classList.contains('matrix-explore-layout')).toBe(true);
  expect(document.querySelectorAll('.matrix-tianyan-screen .matrix-explore-setting-icon')).toHaveLength(3);
  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
  expect(screen.queryByRole('button', { name: /近10期開獎號碼/ })).toBeNull();
  expect(document.querySelector('.matrix-tianyan-screen .history-panel')).toBeNull();

  fireEvent.change(screen.getByRole('combobox', { name: '彩種' }), { target: { value: '六合彩' } });
  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
  expect(document.querySelector('.matrix-tianyan-screen .history-panel')).toBeNull();
});
'''
path.write_text(source[:start] + replacement + source[end:])
