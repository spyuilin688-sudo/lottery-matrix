import { createWorkerApi, type WorkerStatus } from './worker-api';

export type AlgorithmStatus = WorkerStatus;

type BaseUrlLoader = () => Promise<string>;

export function createAlgorithmApi(
  fetcher: typeof fetch = fetch,
  loadBaseUrl: BaseUrlLoader,
) {
  const workerApi = createWorkerApi(loadBaseUrl, fetcher);
  return {
    getAlgorithmStatus: () => workerApi.getStatus(),
  };
}
