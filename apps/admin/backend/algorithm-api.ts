export type AlgorithmStatus = {
  ok: boolean;
  health: unknown | null;
  coverage: unknown | null;
  audit: unknown | null;
  cases: unknown | null;
};

const algorithmBaseUrl = 'https://app-snsxet.v2.appdeploy.ai';
const endpoints = [
  '/api/_healthcheck',
  '/api/matrix/coverage',
  '/api/matrix/audit',
  '/api/matrix/algorithm/cases',
] as const;

const unavailable = (): AlgorithmStatus => ({
  ok: false,
  health: null,
  coverage: null,
  audit: null,
  cases: null,
});

export function createAlgorithmApi(fetcher: typeof fetch = fetch) {
  return {
    async getAlgorithmStatus(): Promise<AlgorithmStatus> {
      try {
        const responses = await Promise.all(endpoints.map((path) => fetcher(`${algorithmBaseUrl}${path}`)));
        if (responses.some((response) => !response.ok)) return unavailable();
        const [health, coverage, audit, cases] = await Promise.all(
          responses.map((response) => response.json()),
        );
        return { ok: true, health, coverage, audit, cases };
      } catch {
        return unavailable();
      }
    },
  };
}

export const algorithmApi = createAlgorithmApi();
