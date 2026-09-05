// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMatrixCardManifest } from '../lottery-api';

const bytes = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,8,228,0,0,13,110,0,1,2,3]);
const url = 'https://cards.example/539/115000215/version/sorted.png';
const png = () => new Blob([bytes], { type: 'image/png' });

async function read(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('pre-generated static card downloads', () => {
  it('downloads exactly the fetched PNG bytes without a canvas or document observer', async () => {
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const observer = vi.spyOn(globalThis, 'MutationObserver');
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, blob: async () => png() } as Response);
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:card'; }); });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { downloadMatrixCardPng } = await import('../matrix-ticket-download');
    await downloadMatrixCardPng(url, '牌單.png');
    await downloadMatrixCardPng(url, '牌單.png');
    expect(new Uint8Array(await read(blobs[0]))).toEqual(bytes);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(canvas).not.toHaveBeenCalled();
    expect(observer).not.toHaveBeenCalled();
  });

  it('rejects invalid image data and retries with a fresh fetch', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['bad'], { type: 'image/png' }) } as Response)
      .mockResolvedValueOnce({ ok: true, blob: async () => png() } as Response);
    const { prepareMatrixCardPng } = await import('../matrix-ticket-download');
    await expect(prepareMatrixCardPng(url)).rejects.toThrow('MATRIX_TICKET_INVALID_PNG');
    await expect(prepareMatrixCardPng(url)).resolves.toBeInstanceOf(Blob);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('accepts an unpublished manifest and explicitly requests the PNG contract', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ lottery: '今彩539', period: null, cards: {} }), { headers: { 'content-type': 'application/json' } }));
    const manifest = await fetchMatrixCardManifest('今彩539');
    expect(manifest.period).toBeNull();
    expect(manifest.cards.sorted.url).toBe('');
    expect(String(fetcher.mock.calls[0][0])).toContain('?format=png');
  });
});
