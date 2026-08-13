import { useEffect, useRef, useState } from "react";
import { fetchActivationCodes, generateActivationCodes } from "./api";
import type { ActivationCodeRecord, ActivationCodeView, ActivationDuration } from "./types";

type DataState = "loading" | "ready" | "empty" | "error";

const durationOptions: ReadonlyArray<{ value: ActivationDuration; label: string }> = [
  { value: "7_days", label: "7天" },
  { value: "15_days", label: "15天" },
  { value: "30_days", label: "月" },
  { value: "90_days", label: "季" },
  { value: "365_days", label: "年" },
  { value: "lifetime", label: "終生" },
];

const durationLabels: Record<ActivationDuration, string> = Object.fromEntries(
  durationOptions.map(({ value, label }) => [value, label]),
) as Record<ActivationDuration, string>;

const statusLabels: Record<ActivationCodeRecord["status"], string> = {
  unused: "未使用",
  used: "已使用",
  expired: "已到期",
};

const columns = ["啟動碼", "方案期限", "產生時間", "啟動碼到期時間", "使用狀態", "兌換會員", "兌換時間"] as const;

function activationFields(record: ActivationCodeView) {
  return [
    record.code,
    durationLabels[record.duration_type],
    record.created_at,
    record.expires_at,
    statusLabels[record.status],
    record.redeemed_member?.line_user_id ?? record.redeemed_member?.id ?? "",
    record.redeemed_at ?? "",
  ];
}

function ActivationCodeFields({ record, table }: { record: ActivationCodeView; table?: boolean }) {
  const values = activationFields(record);

  return (
    <>
      {columns.map((label, index) =>
        table ? (
          <td key={label}>{values[index]}</td>
        ) : (
          <span key={label} data-label={label}>
            {values[index]}
          </span>
        ),
      )}
    </>
  );
}

function asNewBatchView(records: ActivationCodeRecord[]): ActivationCodeView[] {
  return records.map((record) => ({ ...record, redeemed_member: null }));
}

export default function AdminActivationCodes() {
  const [codes, setCodes] = useState<ActivationCodeView[]>([]);
  const [dataState, setDataState] = useState<DataState>("loading");
  const [duration, setDuration] = useState<ActivationDuration>("7_days");
  const [generating, setGenerating] = useState(false);
  const requestRevision = useRef(0);

  useEffect(() => {
    let active = true;
    const fetchRevision = requestRevision.current;

    void fetchActivationCodes().then(
      (records) => {
        if (!active || fetchRevision !== requestRevision.current) return;
        setCodes(records);
        setDataState(records.length === 0 ? "empty" : "ready");
      },
      () => {
        if (active && fetchRevision === requestRevision.current) setDataState("error");
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const handleGenerate = async () => {
    if (generating) return;

    const generationRevision = ++requestRevision.current;
    setGenerating(true);
    try {
      const records = await generateActivationCodes(duration);
      if (generationRevision !== requestRevision.current) return;
      setCodes(asNewBatchView(records));
      setDataState(records.length === 0 ? "empty" : "ready");
    } catch {
      if (generationRevision === requestRevision.current) setDataState("error");
    } finally {
      if (generationRevision === requestRevision.current) setGenerating(false);
    }
  };

  return (
    <section className="admin-activation-codes" data-testid="admin-activation-codes" data-state={dataState}>
      <fieldset className="admin-activation-controls">
        <legend>方案期限</legend>
        <div className="admin-activation-duration-options">
          {durationOptions.map(({ value, label }) => (
            <label key={value}>
              <input
                type="radio"
                name="activation-duration"
                value={value}
                checked={duration === value}
                onChange={() => setDuration(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="admin-activation-quantity">固定產生數量：10</p>
      <button className="admin-activation-generate" type="button" onClick={() => void handleGenerate()} disabled={generating}>
        產生啟動碼
      </button>

      {dataState === "ready" ? (
        <>
          <div className="admin-record-table-wrap">
            <table className="admin-record-table">
              <thead>
                <tr>
                  {columns.map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.map((record) => (
                  <tr key={record.id}>
                    <ActivationCodeFields record={record} table />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-record-cards">
            {codes.map((record) => (
              <article className="admin-record-card" key={record.id}>
                <ActivationCodeFields record={record} />
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
