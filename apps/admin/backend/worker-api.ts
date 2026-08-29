export type WorkerStatus = {
  ok: boolean;
  health: unknown | null;
  jobs: unknown | null;
};

type BaseUrlLoader = () => Promise<string>;

const unavailable = (): WorkerStatus => ({
  ok: false,
  health: null,
  jobs: null,
});

export function createWorkerApi(
  loadBaseUrl: BaseUrlLoader,
  fetcher: typeof fetch = fetch,
) {
  return {
    async getStatus(): Promise<WorkerStatus> {
      try {
        const baseUrl = (await loadBaseUrl()).trim().replace(/\/+$/, '');
        if (!baseUrl) return unavailable();

        const [healthResponse, jobsResponse] = await Promise.all([
          fetcher(`${baseUrl}/health`),
          fetcher(`${baseUrl}/jobs/status`),
        ]);
        if (!healthResponse.ok || !jobsResponse.ok) return unavailable();

        const [health, jobs] = await Promise.all([
          healthResponse.json(),
          jobsResponse.json(),
        ]);
        return { ok: true, health, jobs };
      } catch {
        return unavailable();
      }
    },
  };
}
