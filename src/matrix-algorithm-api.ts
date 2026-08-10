import { LOTTERY_API_BASE } from './lottery-api';

export type MatrixAlgorithmRequest = Record<string, unknown>;
export type MatrixAlgorithmResponse = Record<string, unknown>;

export async function runMatrixAlgorithmExplore(payload: MatrixAlgorithmRequest) {
  const response = await fetch(`${LOTTERY_API_BASE}/api/matrix/algorithm/explore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Matrix Algorithm API ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<MatrixAlgorithmResponse>;
}
