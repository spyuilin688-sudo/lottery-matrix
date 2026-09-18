const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const VOID_ELEMENTS = new Set([
  "AREA",
  "BASE",
  "BR",
  "COL",
  "EMBED",
  "HR",
  "IMG",
  "INPUT",
  "LINK",
  "META",
  "PARAM",
  "SOURCE",
  "TRACK",
  "WBR",
]);

function copyComputedStyle(source: Element, target: HTMLElement, pseudo?: "::before" | "::after") {
  const computed = window.getComputedStyle(source, pseudo);
  for (let index = 0; index < computed.length; index += 1) {
    const property = computed.item(index);
    if (!property) continue;
    target.style.setProperty(
      property,
      computed.getPropertyValue(property),
      computed.getPropertyPriority(property),
    );
  }
  return computed;
}

function readCssString(content: string) {
  const trimmed = content.trim();
  if (trimmed.length < 2) return trimmed;
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) return trimmed;
  const body = trimmed.slice(1, -1);
  return body
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\([\\"'])/g, "$1");
}

function materializePseudo(
  source: Element,
  target: HTMLElement,
  pseudo: "::before" | "::after",
) {
  if (VOID_ELEMENTS.has(target.tagName)) return;
  const computed = window.getComputedStyle(source, pseudo);
  const content = computed.getPropertyValue("content").trim();
  if (!content || content === "none" || content === "normal") return;
  if (computed.getPropertyValue("display") === "none") return;
  if (["hidden", "collapse"].includes(computed.getPropertyValue("visibility"))) return;
  if (computed.getPropertyValue("opacity") === "0") return;

  const renderedPseudo = document.createElement("span");
  renderedPseudo.setAttribute("data-matrix-pseudo", pseudo.slice(2));
  renderedPseudo.setAttribute("aria-hidden", "true");
  copyComputedStyle(source, renderedPseudo, pseudo);
  renderedPseudo.textContent = readCssString(content);

  if (pseudo === "::before") target.insertBefore(renderedPseudo, target.firstChild);
  else target.append(renderedPseudo);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("MATRIX_TICKET_ASSET_READ_FAILED"));
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:")) {
        reject(new Error("MATRIX_TICKET_ASSET_READ_FAILED"));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

async function inlineImageAssets(source: HTMLElement, clone: HTMLElement) {
  const sourceImages = Array.from(source.querySelectorAll<HTMLImageElement>("img"));
  const clonedImages = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
  if (sourceImages.length !== clonedImages.length) throw new Error("MATRIX_TICKET_CLONE_MISMATCH");

  await Promise.all(sourceImages.map(async (image, index) => {
    const clonedImage = clonedImages[index];
    const sourceValue = image.currentSrc || image.getAttribute("src") || image.src;
    if (!sourceValue) throw new Error("MATRIX_TICKET_IMAGE_SOURCE_MISSING");

    let dataUrl = sourceValue;
    if (!sourceValue.startsWith("data:")) {
      const assetUrl = new URL(sourceValue, document.baseURI);
      const isNetworkAsset = assetUrl.protocol === "http:" || assetUrl.protocol === "https:";
      if (isNetworkAsset && assetUrl.origin !== window.location.origin) {
        throw new Error("MATRIX_TICKET_CROSS_ORIGIN_ASSET");
      }
      if (!isNetworkAsset && assetUrl.protocol !== "blob:") {
        throw new Error("MATRIX_TICKET_UNSUPPORTED_ASSET");
      }
      const response = await fetch(assetUrl.href, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`MATRIX_TICKET_ASSET_FETCH_FAILED:${response.status}`);
      dataUrl = await blobToDataUrl(await response.blob());
    }

    clonedImage.setAttribute("src", dataUrl);
    clonedImage.removeAttribute("srcset");
    clonedImage.removeAttribute("sizes");
  }));
}

async function waitForTicketAssets(ticket: HTMLElement) {
  if (document.fonts) await document.fonts.ready;
  await Promise.all(Array.from(ticket.querySelectorAll<HTMLImageElement>("img")).map(async (image) => {
    if (typeof image.decode === "function") {
      await image.decode();
      return;
    }
    if (image.complete && image.naturalWidth > 0) return;
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("MATRIX_TICKET_IMAGE_DECODE_FAILED")), { once: true });
    });
  }));
}

function cloneWithRenderedStyles(ticket: HTMLElement) {
  const clone = ticket.cloneNode(true) as HTMLElement;
  const sourceElements = [ticket, ...Array.from(ticket.querySelectorAll("*"))];
  const clonedElements = [clone, ...Array.from(clone.querySelectorAll("*"))];
  if (sourceElements.length !== clonedElements.length) throw new Error("MATRIX_TICKET_CLONE_MISMATCH");

  sourceElements.forEach((source, index) => {
    const target = clonedElements[index];
    if (!(target instanceof HTMLElement)) throw new Error("MATRIX_TICKET_CLONE_MISMATCH");
    copyComputedStyle(source, target);
  });
  sourceElements.forEach((source, index) => {
    const target = clonedElements[index] as HTMLElement;
    materializePseudo(source, target, "::before");
    materializePseudo(source, target, "::after");
  });
  return clone;
}

function serializeTicketSvg(ticket: HTMLElement, width: number, height: number) {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const foreignObject = document.createElementNS(SVG_NAMESPACE, "foreignObject");
  foreignObject.setAttribute("width", "100%");
  foreignObject.setAttribute("height", "100%");
  const wrapper = document.createElementNS(XHTML_NAMESPACE, "div") as HTMLElement;
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.append(ticket);
  foreignObject.append(wrapper);
  svg.append(foreignObject);

  return new XMLSerializer().serializeToString(svg);
}

function loadSvgImage(svg: string) {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("MATRIX_TICKET_SVG_LOAD_FAILED"));
    image.src = svgUrl;
  }).finally(() => URL.revokeObjectURL(svgUrl));
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("MATRIX_TICKET_PNG_ENCODING_FAILED"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function readBlobBytes(blob: Blob) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("MATRIX_TICKET_PNG_READ_FAILED"));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("MATRIX_TICKET_PNG_READ_FAILED"));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(blob);
  });
}

async function validatePng(blob: Blob) {
  if (blob.type.toLowerCase() !== "image/png" || blob.size < PNG_SIGNATURE.length) {
    throw new Error("MATRIX_TICKET_INVALID_PNG");
  }
  const signature = await readBlobBytes(blob.slice(0, PNG_SIGNATURE.length));
  if (PNG_SIGNATURE.some((byte, index) => signature[index] !== byte)) {
    throw new Error("MATRIX_TICKET_INVALID_PNG");
  }
}

export async function downloadMatrixTicket(ticket: HTMLElement, filename = "matrix-ticket.png") {
  await waitForTicketAssets(ticket);

  const bounds = ticket.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("MATRIX_TICKET_INVALID_SIZE");
  }

  const clone = cloneWithRenderedStyles(ticket);
  await inlineImageAssets(ticket, clone);
  const svg = serializeTicketSvg(clone, width, height);
  const svgImage = await loadSvgImage(svg);

  const rawPixelRatio = Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
  const pixelRatio = Math.min(2, Math.max(1, rawPixelRatio));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * pixelRatio);
  canvas.height = Math.ceil(height * pixelRatio);
  if (canvas.width <= 0 || canvas.height <= 0) throw new Error("MATRIX_TICKET_INVALID_CANVAS_SIZE");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("MATRIX_TICKET_CANVAS_CONTEXT_FAILED");
  context.scale(pixelRatio, pixelRatio);
  context.drawImage(svgImage, 0, 0, width, height);

  const png = await canvasToPng(canvas);
  await validatePng(png);

  let downloadUrl: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    downloadUrl = URL.createObjectURL(png);
    anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor?.remove();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }
}

