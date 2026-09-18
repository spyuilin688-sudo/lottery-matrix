import { withDeadline } from "./lib/api-resilience";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
let preparedUrl: string | null = null;
let preparedPng: Blob | null = null;
let pendingUrl: string | null = null;
let pendingPng: Promise<Blob> | null = null;
let preparationVersion = 0;
const downloadUrls = new WeakMap<Blob, string>();

async function validatePng(png: Blob) {
  if (png.type.toLowerCase() !== "image/png" || png.size < 24) {
    throw new Error("MATRIX_TICKET_INVALID_PNG");
  }
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("MATRIX_TICKET_PNG_READ_FAILED"));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(png.slice(0, 24));
  });
  const view = new DataView(bytes.buffer);
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
      || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
      || view.getUint32(16) !== 2276 || view.getUint32(20) !== 3438) {
    throw new Error("MATRIX_TICKET_INVALID_PNG");
  }
}

async function fetchPng(cardUrl: string) {
  return withDeadline(async (signal) => {
    const response = await fetch(cardUrl, { credentials: "same-origin", signal });
    if (!response.ok) throw new Error("MATRIX_CARD_DOWNLOAD_FAILED");
    const png = await response.blob();
    await validatePng(png);
    return png;
  }, { timeoutMs: 30_000 });
}

export function isMatrixCardPngPrepared(cardUrl: string) {
  return preparedUrl === cardUrl && preparedPng !== null;
}

function prepare(cardUrl: string, force: boolean): Promise<Blob> {
  if (!force && preparedUrl === cardUrl && preparedPng) return Promise.resolve(preparedPng);
  if (!force && pendingUrl === cardUrl && pendingPng) return pendingPng;
  const version = ++preparationVersion;
  pendingUrl = cardUrl;
  preparedUrl = null;
  preparedPng = null;
  const pending = fetchPng(cardUrl).then((png) => {
    if (version === preparationVersion) {
      preparedUrl = cardUrl;
      preparedPng = png;
    }
    return png;
  }).finally(() => {
    if (version === preparationVersion) { pendingUrl = null; pendingPng = null; }
  });
  pendingPng = pending;
  return pending;
}

export function prepareMatrixCardPng(cardUrl: string): Promise<Blob> {
  return prepare(cardUrl, false);
}

export function refreshMatrixCardPng(cardUrl: string): Promise<Blob> {
  return prepare(cardUrl, true);
}

export async function downloadMatrixCardPng(cardUrl: string, filename: string, isCurrent: () => boolean = () => true) {
  const png = await prepareMatrixCardPng(cardUrl);
  if (!isCurrent()) return;
  let url = downloadUrls.get(png);
  if (!url) {
    url = URL.createObjectURL(png);
    downloadUrls.set(png, url);
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); }
  // A slow browser download may still be reading this URL; retain its lifetime.
}

// Retain the existing DOM-export utility for callers outside the static card page.
export async function downloadMatrixTicket(ticket: HTMLElement, filename = "matrix-ticket.png") {
  const legacy = await import("./matrix-ticket-legacy-download");
  return legacy.downloadMatrixTicket(ticket, filename);
}
