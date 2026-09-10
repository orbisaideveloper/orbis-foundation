export type IndexedDbErrorResolver = (
  reason: unknown,
  fallbackMessage: string,
) => unknown;

function defaultIndexedDbError(
  reason: unknown,
  fallbackMessage: string,
): unknown {
  return reason || new Error(fallbackMessage);
}

export function indexedDbRequestResult<T>(
  request: IDBRequest<T>,
  fallbackMessage: string,
  resolveError: IndexedDbErrorResolver = defaultIndexedDbError,
): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(resolveError(request.error, fallbackMessage));
  });
}

export function indexedDbTransactionDone(
  transaction: IDBTransaction,
  errorMessage: string,
  abortMessage: string,
  resolveError: IndexedDbErrorResolver = defaultIndexedDbError,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(resolveError(transaction.error, errorMessage));
    transaction.onabort = () =>
      reject(resolveError(transaction.error, abortMessage));
  });
}
