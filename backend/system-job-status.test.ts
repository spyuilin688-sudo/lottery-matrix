import { describe, expect, it, vi } from 'vitest';
import { createSystemJobTracker } from './system-job-status';

describe('system job status tracker', () => {
  it('writes running and success around a completed job', async () => {
    const writes: Record<string, unknown>[] = [];
    const tracker = createSystemJobTracker(async (record) => { writes.push(record); }, () => new Date('2026-08-21T03:00:00Z'));
    await expect(tracker.run('matrix-539-refresh-v2', '今彩539', async () => 'done')).resolves.toBe('done');
    expect(writes).toEqual([
      expect.objectContaining({ job_name: 'matrix-539-refresh-v2', lottery: '今彩539', status: 'running', finished_at: null, error: null }),
      expect.objectContaining({ job_name: 'matrix-539-refresh-v2', lottery: '今彩539', status: 'success', finished_at: '2026-08-21T03:00:00.000Z', error: null }),
    ]);
  });

  it('writes a durable running stage under the same job start time', async () => {
    const writes: Record<string, unknown>[] = [];
    const times = [
      new Date('2026-08-22T00:00:00Z'),
      new Date('2026-08-22T00:00:01Z'),
      new Date('2026-08-22T00:00:02Z'),
    ];
    const tracker = createSystemJobTracker(
      async (record) => { writes.push(record); },
      () => times.shift() ?? new Date('2026-08-22T00:00:02Z'),
    );

    await expect(tracker.run('matrix-539-refresh-v2', '今彩539', async (reportStage) => {
      await reportStage('history:start');
      return 'done';
    })).resolves.toBe('done');

    expect(writes[1]).toEqual({
      job_name: 'matrix-539-refresh-v2',
      lottery: '今彩539',
      status: 'running',
      started_at: '2026-08-22T00:00:00.000Z',
      finished_at: null,
      error: 'stage:history:start',
      updated_at: '2026-08-22T00:00:01.000Z',
    });
  });

  it('writes failure and rethrows the job error', async () => {
    const writes: Record<string, unknown>[] = [];
    const tracker = createSystemJobTracker(async (record) => { writes.push(record); }, () => new Date('2026-08-21T03:00:00Z'));
    await expect(tracker.run('matrix-marksix-refresh-v2', '六合彩', async () => { throw new Error('source failed'); })).rejects.toThrow('source failed');
    expect(writes.at(-1)).toMatchObject({ status: 'failed', error: 'source failed' });
  });

  it('does not block or replace the job result when telemetry writes fail', async () => {
    const report = vi.fn();
    const tracker = createSystemJobTracker(async () => { throw new Error('telemetry offline'); }, () => new Date('2026-08-21T03:00:00Z'), report);
    await expect(tracker.run('matrix-539-refresh-v2', '今彩539', async () => 'done')).resolves.toBe('done');
    expect(report).toHaveBeenCalled();
  });

  it('preserves the original job error when failure telemetry also fails', async () => {
    const tracker = createSystemJobTracker(async () => { throw new Error('telemetry offline'); });
    await expect(tracker.run('matrix-539-refresh-v2', '今彩539', async () => { throw new Error('job failed'); })).rejects.toThrow('job failed');
  });
});
