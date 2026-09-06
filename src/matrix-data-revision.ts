import { clearReadCache } from './read-cache';

let revision = 0;
const listeners = new Set<() => void>();

export function getMatrixDataRevision() {
  return revision;
}

export function subscribeMatrixDataRevision(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function invalidateMatrixData() {
  revision += 1;
  clearReadCache('matrix-rpc:');
  listeners.forEach((listener) => listener());
}
