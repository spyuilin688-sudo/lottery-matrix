import { useEffect, useState } from "react";
import { fetchMatrixCustomStatuses } from "./api";
import type { MatrixCustomStatusView } from "./types";

export default function AdminMatrixStatus() {
  const [items, setItems] = useState<MatrixCustomStatusView[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  useEffect(() => {
    let active = true;
    void fetchMatrixCustomStatuses().then((rows) => { if (active) { setItems(rows); setState(rows.length ? "ready" : "empty"); } }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);
  if (state !== "ready") return <section className="admin-record-screen" data-testid="admin-matrix-status" data-state={state} />;
  return <section className="admin-record-screen" data-testid="admin-matrix-status" data-state="ready">
    <div className="admin-record-table-wrap"><table className="admin-record-table"><thead><tr><th>會員</th><th>彩種</th><th>狀態</th><th>一碼組合</th><th>二碼組合</th><th>最後更新</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.member_id}-${item.lottery}-${item.status}`}><td>{item.member.line_user_id ?? item.member.id}</td><td>{item.lottery}</td><td>{item.status}</td><td>{item.config.oneCodeGroups.length}</td><td>{item.config.twoCodeGroups.length}</td><td>{new Date(item.updated_at).toLocaleString("zh-TW")}</td></tr>)}</tbody></table></div>
    <div className="admin-record-cards">{items.map((item) => <article className="admin-record-card" key={`${item.member_id}-${item.lottery}-${item.status}-card`}><span data-label="會員">{item.member.line_user_id ?? item.member.id}</span><span data-label="彩種">{item.lottery}</span><span data-label="狀態">{item.status}</span><span data-label="組合">一碼 {item.config.oneCodeGroups.length}／二碼 {item.config.twoCodeGroups.length}</span></article>)}</div>
  </section>;
}
