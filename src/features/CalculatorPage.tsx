import { useState } from "react";
import { TrashIcon } from "@radix-ui/react-icons";
import { Navigate } from "./navigation";
import { useTimedState, FeatureShell, SectionTitle } from "./shared";

export const COMBINATION_RESULTS = [
  ["二星", 2], ["三星", 3], ["四星", 4], ["五星", 5],
] as const;

export function CalculatorPage({ onNavigate }: { onNavigate: Navigate }) {
  const [mode, setMode] = useTimedState<"連碰" | "立柱">("calculator-mode", "連碰");
  const [collisionMode, setCollisionMode] = useTimedState<"總數" | "選號">("calculator-collision-mode", "總數");
  const [totalCount, setTotalCount] = useTimedState("calculator-total", 0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [columns, setColumns] = useTimedState("calculator-columns", [3, 2, 4, 3, 2, 0, 0, 0, 0, 0, 0, 0]);
  const [bulkColumnSetting, setBulkColumnSetting] = useState<{ value: number | null; phase: 0 | 1 | 2 }>({ value: null, phase: 0 });
  const toggleNumber = (number: number) => {
    const next = new Set(selected);
    if (next.has(number)) next.delete(number); else next.add(number);
    setSelected(next);
  };
  const clearColumns = () => {
    setColumns(Array(12).fill(0));
    setBulkColumnSetting({ value: null, phase: 0 });
  };
  const cycleBulkColumnSetting = (value: number) => {
    if (bulkColumnSetting.value !== value || bulkColumnSetting.phase === 0) {
      setColumns(Array.from({ length: 12 }, (_, index) => index < 6 ? value : 0));
      setBulkColumnSetting({ value, phase: 1 });
      return;
    }
    if (bulkColumnSetting.phase === 1) {
      setColumns(Array(12).fill(value));
      setBulkColumnSetting({ value, phase: 2 });
      return;
    }
    clearColumns();
  };
  const columnDisplayOrder = [0, 6, 1, 7, 2, 8, 3, 9, 4, 10, 5, 11];
  const switchCollisionMode = () => {
    setCollisionMode((current) => current === "總數" ? "選號" : "總數");
    setSelected(new Set());
    setTotalCount(0);
  };
  const clearCollision = () => {
    setSelected(new Set());
    setTotalCount(0);
  };
  const collisionCount = collisionMode === "總數" ? totalCount : selected.size;
  const choose = (n: number, r: number) => {
    if (n < r || r < 0) return 0;
    let value = 1;
    for (let i = 1; i <= r; i += 1) value = (value * (n - r + i)) / i;
    return Math.round(value);
  };
  const columnCombination = (degree: number) => {
    const sums = Array(degree + 1).fill(0) as number[];
    sums[0] = 1;
    columns.filter((value) => value > 0).forEach((value) => {
      for (let index = degree; index >= 1; index -= 1) {
        sums[index] += sums[index - 1] * value;
      }
    });
    return sums[degree] ?? 0;
  };
  return (
    <FeatureShell title={mode === "連碰" ? "連碰計算機" : "立柱計算機"} onNavigate={onNavigate} className="calculator-screen">
      <div className="mode-tabs"><button type="button" data-selected={mode === "連碰"} onClick={() => setMode("連碰")}>連碰計算機</button><button type="button" data-selected={mode === "立柱"} onClick={() => setMode("立柱")}>立柱計算機</button></div>
      {mode === "連碰" ? (
        <section className="panel calculator-panel">
          <header>
            <div className="calculator-heading"><SectionTitle>連碰設定</SectionTitle><span>{collisionMode === "總數" ? "計算總數" : "已選號碼"}：<strong>{collisionCount}</strong> 個</span></div>
            <div className="calculator-actions"><button type="button" className="mode-select-button" onClick={switchCollisionMode}>{collisionMode === "總數" ? "選號" : "總數"}</button><button type="button" onClick={clearCollision}><TrashIcon />清除</button></div>
          </header>
          <div className="number-grid">
            {Array.from({ length: 49 }, (_, i) => i + 1).map((number) => (
              <button
                type="button"
                data-selected={collisionMode === "總數" ? totalCount === number : selected.has(number)}
                onClick={() => collisionMode === "總數" ? setTotalCount(number) : toggleNumber(number)}
                key={number}
              >
                {String(number).padStart(2, "0")}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel calculator-panel column-panel">
          <header><div className="calculator-heading"><SectionTitle>立柱設定</SectionTitle><span>啟動柱數：<strong>{columns.filter(Boolean).length}</strong> 柱</span></div></header>
          <div className="quick-actions"><button type="button" onClick={() => cycleBulkColumnSetting(2)}>全部設為 2</button><button type="button" onClick={() => cycleBulkColumnSetting(3)}>全部設為 3</button><button type="button" onClick={() => cycleBulkColumnSetting(5)}>全部設為 5</button><button type="button" className="clear-button" onClick={clearColumns}><TrashIcon />清除</button></div>
          <div className="column-grid">
            {columnDisplayOrder.map((index) => (
              <div key={index}><span>第 {index + 1} 柱</span><button type="button" onClick={() => setColumns(columns.map((v, i) => i === index ? Math.max(0, v - 1) : v))}>−</button><strong>{columns[index]}</strong><button type="button" onClick={() => setColumns(columns.map((v, i) => i === index ? Math.min(48, v + 1) : v))}>＋</button></div>
            ))}
          </div>
        </section>
      )}
      <section className="panel calculation-results">
        <SectionTitle>計算結果</SectionTitle>
        <div>{COMBINATION_RESULTS.map(([label, degree]) => <article key={label}><span>{label}</span><strong>{mode === "連碰" ? choose(collisionCount, degree) : columnCombination(degree)}</strong></article>)}</div>
      </section>
    </FeatureShell>
  );
}
