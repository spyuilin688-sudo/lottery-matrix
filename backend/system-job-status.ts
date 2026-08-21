type Lottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';

export type JobStatusRecord = {
  job_name: string;
  lottery: Lottery;
  status: 'running' | 'success' | 'failed';
  started_at: string;
  finished_at: string | null;
  error: string | null;
  updated_at: string;
};

type Writer = (record: JobStatusRecord) => Promise<void>;

export function createSystemJobTracker(
  writer: Writer,
  now = () => new Date(),
  reportWriteError: (error: unknown) => void = (error) => console.warn('system job telemetry write failed', error),
) {
  const safeWrite = async (record: JobStatusRecord) => {
    try {
      await writer(record);
    } catch (error) {
      reportWriteError(error);
    }
  };
  return {
    async run<T>(jobName: string, lottery: Lottery, job: () => Promise<T>): Promise<T> {
      const startedAt = now().toISOString();
      await safeWrite({
        job_name: jobName,
        lottery,
        status: 'running',
        started_at: startedAt,
        finished_at: null,
        error: null,
        updated_at: startedAt,
      });
      try {
        const result = await job();
        const finishedAt = now().toISOString();
        await safeWrite({
          job_name: jobName,
          lottery,
          status: 'success',
          started_at: startedAt,
          finished_at: finishedAt,
          error: null,
          updated_at: finishedAt,
        });
        return result;
      } catch (cause) {
        const finishedAt = now().toISOString();
        const message = cause instanceof Error ? cause.message : String(cause);
        await safeWrite({
          job_name: jobName,
          lottery,
          status: 'failed',
          started_at: startedAt,
          finished_at: finishedAt,
          error: message,
          updated_at: finishedAt,
        });
        throw cause;
      }
    },
  };
}

export function createSystemJobStatusWriter(
  loadConfig: () => Promise<{ url: string; serviceRoleKey: string }>,
  fetcher: typeof fetch = fetch,
): Writer {
  return async (record) => {
    const config = await loadConfig();
    const response = await fetcher(`${config.url}/rest/v1/system_job_status?on_conflict=job_name`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(record),
    });
    if (!response.ok) throw new Error('SYSTEM_JOB_STATUS_WRITE_FAILED');
  };
}
