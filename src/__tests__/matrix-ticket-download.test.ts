// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMatrixTicket } from "../matrix-ticket-download";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function computedStyle(values: Record<string, string>) {
  const entries = Object.entries(values);
  return {
    cssText: "",
    length: entries.length,
    item: (index: number) => entries[index]?.[0] ?? "",
    getPropertyValue: (property: string) => values[property] ?? "",
    getPropertyPriority: () => "",
  } as unknown as CSSStyleDeclaration;
}

function readBlobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("BLOB_READ_FAILED"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

function readBlobBytes(blob: Blob) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("BLOB_READ_FAILED"));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

type BoundaryOptions = {
  fontsFailure?: boolean;
  decodeFailure?: boolean;
  assetFailure?: boolean;
  svgFailure?: boolean;
  canvasFailure?: boolean;
  zeroRect?: boolean;
  drawFailure?: boolean;
  blobFailure?: boolean;
  blobThrow?: boolean;
  wrongMime?: boolean;
  invalidPng?: boolean;
  dataUrlFailure?: boolean;
  finalUrlFailure?: boolean;
};

function installBoundaries(options: BoundaryOptions = {}) {
  const ticket = document.createElement("section");
  ticket.className = "matrix-ticket";
  const firstImage = document.createElement("img");
  firstImage.src = "/assets/ticket-a.png";
  firstImage.srcset = "/assets/ticket-a@2x.png 2x";
  firstImage.sizes = "100vw";
  const secondImage = document.createElement("img");
  secondImage.src = "/assets/ticket-b.png";
  secondImage.srcset = "/assets/ticket-b@2x.png 2x";
  secondImage.sizes = "50vw";
  const copy = document.createElement("div");
  copy.className = "ticket-copy";
  copy.textContent = "最新一期牌單";
  ticket.append(firstImage, copy, secondImage);
  document.body.append(ticket);
  vi.spyOn(ticket, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: options.zeroRect ? 0 : 120,
    bottom: 80,
    left: 0,
    width: options.zeroRect ? 0 : 120,
    height: 80,
    toJSON: () => ({}),
  });

  const fonts = deferred<FontFaceSet>();
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: options.fontsFailure ? Promise.reject(new Error("fonts unavailable")) : fonts.promise },
  });

  const decodes = [deferred<void>(), deferred<void>()];
  const decodeMocks = decodes.map((decode) => vi.fn(() => options.decodeFailure
    ? Promise.reject(new Error("image decode failed"))
    : decode.promise));
  Object.defineProperty(firstImage, "decode", { configurable: true, value: decodeMocks[0] });
  Object.defineProperty(secondImage, "decode", { configurable: true, value: decodeMocks[1] });

  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok: !options.assetFailure,
    status: options.assetFailure ? 500 : 200,
    blob: async () => new Blob(["asset"], { type: "image/png" }),
  } as Response));
  vi.stubGlobal("fetch", fetchMock);

  const normalStyle = computedStyle({
    display: "block",
    visibility: "visible",
    color: "rgb(12, 34, 56)",
    "background-color": "rgb(2, 7, 12)",
  });
  const nestedStyle = computedStyle({
    display: "block",
    visibility: "visible",
    color: "rgb(91, 92, 93)",
    "letter-spacing": "7px",
  });
  const emptyPseudo = computedStyle({ content: "none", display: "inline", visibility: "visible" });
  const emptyBoxStyle = computedStyle({
    content: '""',
    display: "block",
    visibility: "visible",
    "border-top-width": "1px",
    "border-top-style": "solid",
  });
  const beforeStyle = computedStyle({ content: '"BEFORE"', display: "block", visibility: "visible", color: "rgb(255, 0, 0)" });
  const afterStyle = computedStyle({ content: '"AFTER"', display: "inline", visibility: "visible", color: "rgb(0, 255, 0)" });
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudoElement) => {
    if (pseudoElement === "::before") {
      if (element === ticket) return beforeStyle;
      if (element === copy) return emptyBoxStyle;
      return emptyPseudo;
    }
    if (pseudoElement === "::after") return element === copy ? afterStyle : emptyPseudo;
    return element === copy ? nestedStyle : normalStyle;
  });

  if (options.dataUrlFailure) {
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function failDataUrlRead(this: FileReader) {
      Object.defineProperty(this, "error", { configurable: true, value: new DOMException("failed", "NotReadableError") });
      this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
    });
  }

  const objectUrlBlobs: Blob[] = [];
  const createObjectURL = vi.fn((blob: Blob) => {
    if (options.finalUrlFailure && objectUrlBlobs.length === 1) throw new Error("final URL failed");
    objectUrlBlobs.push(blob);
    return `blob:matrix-ticket-${objectUrlBlobs.length}`;
  });
  const revokeObjectURL = vi.fn();
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: createObjectURL },
    revokeObjectURL: { configurable: true, value: revokeObjectURL },
  });

  const svgSources: string[] = [];
  class MockSvgImage {
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    set src(value: string) {
      svgSources.push(value);
      queueMicrotask(() => {
        if (options.svgFailure) this.onerror?.(new Event("error"));
        else this.onload?.(new Event("load"));
      });
    }
  }
  vi.stubGlobal("Image", MockSvgImage);

  const context = {
    scale: vi.fn(),
    drawImage: options.drawFailure ? vi.fn(() => { throw new Error("draw failed"); }) : vi.fn(),
  };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
  getContext.mockImplementation((() => options.canvasFailure ? null : context as unknown as CanvasRenderingContext2D) as typeof HTMLCanvasElement.prototype.getContext);
  const pngBytes = options.invalidPng
    ? new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
    : new Uint8Array([...PNG_SIGNATURE, 1, 2, 3, 4]);
  const pngBlob = new Blob([pngBytes], { type: options.wrongMime ? "image/jpeg" : "image/png" });
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    if (options.blobThrow) throw new Error("toBlob failed");
    callback(options.blobFailure ? null : pngBlob);
  });

  const clickedAnchors: HTMLAnchorElement[] = [];
  const anchorConnectedAtClick: boolean[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(this: HTMLAnchorElement) {
    clickedAnchors.push(this);
    anchorConnectedAtClick.push(this.isConnected);
  });
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 3 });

  return {
    ticket,
    fonts,
    decodes,
    decodeMocks,
    fetchMock,
    objectUrlBlobs,
    createObjectURL,
    revokeObjectURL,
    svgSources,
    context,
    getContext,
    pngBlob,
    toBlob,
    clickedAnchors,
    anchorConnectedAtClick,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downloadMatrixTicket", () => {
  it("waits for assets, inlines styles and pseudos, renders a bounded PNG, and downloads once", async () => {
    const boundary = installBoundaries();

    const download = downloadMatrixTicket(boundary.ticket, "matrix-ticket.png");
    await Promise.resolve();
    expect(boundary.decodeMocks[0]).not.toHaveBeenCalled();
    expect(boundary.decodeMocks[1]).not.toHaveBeenCalled();

    boundary.fonts.resolve({} as FontFaceSet);
    await vi.waitFor(() => {
      expect(boundary.decodeMocks[0]).toHaveBeenCalledTimes(1);
      expect(boundary.decodeMocks[1]).toHaveBeenCalledTimes(1);
    });
    expect(boundary.fetchMock).not.toHaveBeenCalled();

    boundary.decodes[0].resolve();
    boundary.decodes[1].resolve();
    await download;

    expect(boundary.fetchMock).toHaveBeenCalledTimes(2);
    expect(boundary.fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringMatching(/\/assets\/ticket-a\.png$/),
      expect.stringMatching(/\/assets\/ticket-b\.png$/),
    ]);
    expect(boundary.objectUrlBlobs).toHaveLength(2);
    expect(boundary.objectUrlBlobs[0].type).toMatch(/^image\/svg\+xml/);
    expect(boundary.objectUrlBlobs[1]).toBe(boundary.pngBlob);

    const svg = await readBlobText(boundary.objectUrlBlobs[0]);
    expect(svg).toContain("foreignObject");
    expect(svg).toContain("data:image/png;base64,");
    expect(svg).toContain('data-matrix-pseudo="before"');
    expect(svg).toContain('data-matrix-pseudo="after"');
    expect(svg.match(/data-matrix-pseudo="before"/g)).toHaveLength(2);
    expect(svg).toContain("BEFORE");
    expect(svg).toContain("AFTER");
    expect(svg).toContain("border-top-width: 1px");
    expect(svg).toContain("color: rgb(12, 34, 56)");
    expect(svg).toContain("letter-spacing: 7px");
    expect(svg).not.toContain("/assets/ticket-");
    expect(svg).not.toContain("srcset=");
    expect(svg).not.toContain("sizes=");

    const parsedSvg = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (parsedSvg.documentElement.localName === "parsererror") {
      throw new Error(parsedSvg.documentElement.textContent ?? "SVG parse failed");
    }
    const foreignObject = parsedSvg.documentElement.firstElementChild;
    const xhtmlWrapper = foreignObject?.firstElementChild;
    const clonedTicket = xhtmlWrapper?.querySelector<HTMLElement>("section.matrix-ticket");
    const clonedCopy = clonedTicket?.querySelector<HTMLElement>(".ticket-copy");
    const clonedImages = Array.from(clonedTicket?.querySelectorAll("img") ?? []);
    expect(parsedSvg.documentElement.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(foreignObject?.localName).toBe("foreignObject");
    expect(foreignObject?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(xhtmlWrapper?.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(clonedTicket?.firstElementChild?.getAttribute("data-matrix-pseudo")).toBe("before");
    expect(clonedCopy?.firstElementChild?.getAttribute("data-matrix-pseudo")).toBe("before");
    expect(clonedCopy?.lastElementChild?.getAttribute("data-matrix-pseudo")).toBe("after");
    expect(clonedCopy?.style.letterSpacing).toBe("7px");
    expect(clonedImages).toHaveLength(2);
    expect(clonedImages.every((image) => image.getAttribute("src")?.startsWith("data:image/png;base64,"))).toBe(true);
    expect(clonedImages.every((image) => !image.hasAttribute("srcset") && !image.hasAttribute("sizes"))).toBe(true);

    const canvas = boundary.getContext.mock.instances[0] as HTMLCanvasElement;
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(160);
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    expect(boundary.context.scale).toHaveBeenCalledWith(2, 2);
    expect(boundary.context.drawImage).toHaveBeenCalledTimes(1);
    expect(boundary.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");

    expect(boundary.clickedAnchors).toHaveLength(1);
    expect(boundary.anchorConnectedAtClick).toEqual([true]);
    expect(boundary.clickedAnchors[0].download).toBe("matrix-ticket.png");
    expect(boundary.clickedAnchors[0].href).toBe("blob:matrix-ticket-2");
    expect(boundary.clickedAnchors[0].isConnected).toBe(false);
    expect(boundary.revokeObjectURL).toHaveBeenCalledWith("blob:matrix-ticket-1");
    expect(boundary.revokeObjectURL).toHaveBeenCalledWith("blob:matrix-ticket-2");
    expect(boundary.svgSources).toEqual(["blob:matrix-ticket-1"]);

    const signature = Array.from(await readBlobBytes(boundary.pngBlob.slice(0, 8)));
    expect(boundary.pngBlob.type).toBe("image/png");
    expect(signature).toEqual(PNG_SIGNATURE);
  });

  const failureCases: ReadonlyArray<readonly [string, BoundaryOptions]> = [
    ["fonts", { fontsFailure: true }],
    ["ticket image decode", { decodeFailure: true }],
    ["same-origin asset fetch", { assetFailure: true }],
    ["asset data URL conversion", { dataUrlFailure: true }],
    ["zero-sized ticket", { zeroRect: true }],
    ["SVG image", { svgFailure: true }],
    ["canvas context", { canvasFailure: true }],
    ["canvas draw", { drawFailure: true }],
    ["PNG encoder throw", { blobThrow: true }],
    ["PNG blob", { blobFailure: true }],
    ["PNG MIME", { wrongMime: true }],
    ["PNG signature", { invalidPng: true }],
    ["final object URL", { finalUrlFailure: true }],
  ];

  it.each(failureCases)("rejects without clicking when %s creation fails", async (_boundaryName, options) => {
    const boundary = installBoundaries(options);
    if (!options.fontsFailure) boundary.fonts.resolve({} as FontFaceSet);
    if (!options.decodeFailure) boundary.decodes.forEach((decode) => decode.resolve());

    await expect(downloadMatrixTicket(boundary.ticket, "matrix-ticket.png")).rejects.toThrow();

    expect(boundary.clickedAnchors).toHaveLength(0);
    expect(document.querySelector('a[download="matrix-ticket.png"]')).toBeNull();
    if (boundary.objectUrlBlobs[0]?.type.startsWith("image/svg+xml")) {
      expect(boundary.revokeObjectURL).toHaveBeenCalledWith("blob:matrix-ticket-1");
    }
  });
});
