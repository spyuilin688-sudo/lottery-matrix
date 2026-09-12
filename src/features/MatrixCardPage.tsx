import { subscribeLotteryRefresh } from "../lottery-data-refresh";
import { useEffect, useRef, useState } from "react";
import { DownloadIcon } from "@radix-ui/react-icons";
import { type LotteryId } from "../Prototype";
import { fetchMatrixCardManifest, matrixCardUrl, type MatrixCardManifest, type MatrixCardOrder } from "../lottery-api";
import { useAppDialog } from "../dialog/AppDialog";
import { Navigate } from "./navigation";
import { FeatureShell, LotteryTabs } from "./shared";

export function MatrixCardPage({ onNavigate }: { onNavigate: Navigate }) {
  const appDialog = useAppDialog();
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [order, setOrder] = useState<MatrixCardOrder>("sorted");
  const [manifest, setManifest] = useState<MatrixCardManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let revision = 0;
    setLoading(true);
    setLoadFailed(false);
    setManifest(null);
    const refresh = () => {
      const current = ++revision;
      void fetchMatrixCardManifest(lottery)
        .then((nextManifest) => { if (active && current === revision) { setManifest(nextManifest); setLoadFailed(false); } })
        .catch(() => { if (active && current === revision) { setManifest(null); setLoadFailed(true); } })
        .finally(() => { if (active && current === revision) setLoading(false); });
    };
    refresh();
    const unsubscribe = subscribeLotteryRefresh(lottery, refresh);
    return () => { active = false; unsubscribe(); };
  }, [lottery]);

  const currentManifest = manifest?.lottery === lottery ? manifest : null;
  const cardPath = currentManifest?.cards[order]?.url;
  const cardUrl = cardPath ? matrixCardUrl(cardPath) : null;
  const cardPeriod = currentManifest?.period ?? null;
  const currentCard = useRef<string | null>(null);
  currentCard.current = cardUrl;
  useEffect(() => () => { currentCard.current = null; }, []);

  const handleTicketDownload = async () => {
    if (!cardUrl || currentCard.current !== cardUrl || downloadPending) return;
    setDownloadPending(true);
    setDownloadFailed(false);
    try {
      const { downloadMatrixCardPng } = await import("../matrix-ticket-download");
      if (currentCard.current !== cardUrl) return;
      await downloadMatrixCardPng(
        cardUrl,
        [lottery, order === "draw" ? "落球" : "順球"].join("-") + "牌單.png",
        () => currentCard.current === cardUrl,
      );
    } catch {
      setDownloadFailed(true);
    } finally {
      setDownloadPending(false);
    }
  };

  const requestTicketDownload = async () => {
    if (!cardUrl || downloadPending) return;
    if (!await appDialog.confirm("確認下載牌單？")) return;
    await handleTicketDownload();
  };

  return (
    <FeatureShell title="Matrix 牌單" onNavigate={onNavigate}>
      <LotteryTabs selected={lottery} onChange={setLottery} />
      <div className="matrix-card-order" role="tablist" aria-label="牌單順序">
        <button type="button" role="tab" aria-selected={order === "sorted"} className={order === "sorted" ? "is-selected" : undefined} onClick={() => setOrder("sorted")}>順球</button>
        <button type="button" role="tab" aria-selected={order === "draw"} className={order === "draw" ? "is-selected" : undefined} onClick={() => setOrder("draw")} disabled={!currentManifest?.cards.draw?.url} aria-label="落球" aria-description={!currentManifest?.cards.draw?.url ? "落球牌單待公布" : undefined}>落球{currentManifest && !currentManifest.cards.draw?.url ? "（待公布）" : ""}</button>
      </div>
      <section className="matrix-ticket matrix-ticket--preview" aria-busy={loading}>
        {loading ? <p>牌單載入中…</p> : null}
        {loadFailed ? <p role="alert">牌單暫時無法載入，請稍後再試</p> : null}
        {!loading && !loadFailed && !cardPeriod ? <p>尚無可用牌單</p> : null}
        {!loading && !loadFailed && cardPeriod && !cardUrl ? <p role="status">{order === "draw" ? "落球" : "順球"}牌單待公布</p> : null}
        {!loading && !loadFailed && cardUrl && cardPeriod ? (
          <img className="matrix-ticket-image" src={cardUrl} alt={lottery + (order === "draw" ? "落球" : "順球") + "牌單，第 " + cardPeriod + " 期"} />
        ) : null}
      </section>
      <button type="button" className="primary-action branded-explore-action matrix-card-download-action" onClick={() => void requestTicketDownload()} disabled={!cardUrl || downloadPending} aria-busy={downloadPending}><DownloadIcon />下載牌單</button>
      {downloadFailed ? <p role="alert">下載失敗，請稍後再試</p> : null}
    </FeatureShell>
  );
}
