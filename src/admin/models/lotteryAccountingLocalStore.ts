import {
  indexedDbRequestResult,
  indexedDbTransactionDone,
} from "../../core/storage/indexedDbPromises";

export type AccountingLocalOwnerKind = "ADMIN_REAL" | "ADMIN_DEMO" | "PUBLIC_USER";
export type AccountingLocalSyncState =
  | "LOCAL_SAVED"
  | "PENDING"
  | "SYNCING"
  | "SYNCED"
  | "ERROR";
export type AccountingUserLedgerStorage = "CLOUD" | "DEVICE";

export interface AccountingLocalScope {
  ownerKind: AccountingLocalOwnerKind;
  ownerId: string;
  organizationId: string;
}

export interface AccountingSellerWorkingRow {
  saleId?: string;
  partyId: string;
  reference?: string;
  status?: "DRAFT" | "POSTED";
  dispatchQuantity: string;
  morningReturnQuantity: string;
  dayReturnQuantity: string;
  eveningReturnQuantity: string;
  commissionRupees: string;
  syncVersion?: number;
}

export interface AccountingSellerWorkingRecord {
  key: string;
  partitionKey: string;
  entityType: "SELLER_DAILY";
  partyId: string;
  occurredAt: string;
  row: AccountingSellerWorkingRow;
  syncState: AccountingLocalSyncState;
  updatedAt: number;
  schemaVersion?: 1;
}

export interface AccountingOutboxRecord {
  operationId: string;
  partitionKey: string;
  entityKey: string;
  operation: "UPSERT_SELLER_ROW";
  status: "PENDING" | "SYNCING" | "ERROR";
  attempts: number;
  payload: AccountingSellerWorkingRow;
  expectedVersion?: number;
  updatedAt: number;
  lastError?: string;
  schemaVersion?: 1;
}

type AccountingStoreName = "workingRecords" | "outbox";

type AccountingLocalMutation =
  | { store: AccountingStoreName; type: "put"; value: unknown }
  | { store: AccountingStoreName; type: "delete"; key: IDBValidKey };

export interface AccountingLocalDriver {
  getAll(store: AccountingStoreName): Promise<unknown[]>;
  mutate(mutations: AccountingLocalMutation[]): Promise<void>;
}

const DATABASE_NAME = "orbis-accounting-local";
const DATABASE_VERSION = 1;
const RECORD_SCHEMA_VERSION = 1 as const;
const WORKING_STORE: AccountingStoreName = "workingRecords";
const OUTBOX_STORE: AccountingStoreName = "outbox";

function defaultOperationId(): string {
  return globalThis.crypto.randomUUID();
}

const requestResult = <T,>(request: IDBRequest<T>): Promise<T> =>
  indexedDbRequestResult(request, "IndexedDB request failed.");

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  indexedDbTransactionDone(
    transaction,
    "IndexedDB transaction failed.",
    "IndexedDB transaction aborted.",
  );

export function createIndexedDbAccountingLocalDriver(
  indexedDb: IDBFactory,
): AccountingLocalDriver {
  let databasePromise: Promise<IDBDatabase> | null = null;

  const openDatabase = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(WORKING_STORE)) {
          database.createObjectStore(WORKING_STORE, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
          database.createObjectStore(OUTBOX_STORE, { keyPath: "operationId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Accounting local database could not open."));
    });
    return databasePromise;
  };

  return {
    async getAll(store) {
      const database = await openDatabase();
      const transaction = database.transaction(store, "readonly");
      const completed = transactionDone(transaction);
      const result = await requestResult(transaction.objectStore(store).getAll());
      await completed;
      return result;
    },
    async mutate(mutations) {
      if (!mutations.length) return;
      const database = await openDatabase();
      const stores = [...new Set(mutations.map((mutation) => mutation.store))];
      const transaction = database.transaction(stores, "readwrite");
      const completed = transactionDone(transaction);
      for (const mutation of mutations) {
        const objectStore = transaction.objectStore(mutation.store);
        if (mutation.type === "put") objectStore.put(mutation.value);
        else objectStore.delete(mutation.key);
      }
      await completed;
    },
  };
}

export function accountingLocalPartitionKey(scope: AccountingLocalScope): string {
  return `${scope.ownerKind}:${scope.ownerId}:${scope.organizationId}`;
}

export function accountingSellerWorkingKey(
  scope: AccountingLocalScope,
  partyId: string,
  occurredAt: string,
): string {
  return `${accountingLocalPartitionKey(scope)}:SELLER_DAILY:${partyId}:${occurredAt}`;
}

function sellerOutboxOperationId(
  workingKey: string,
  operationId: () => string,
): string {
  return `SELLER_ROW_SYNC:${workingKey}:${operationId()}`;
}

function isSellerWorkingRecord(value: unknown): value is AccountingSellerWorkingRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AccountingSellerWorkingRecord>;
  return (
    record.entityType === "SELLER_DAILY" &&
    typeof record.key === "string" &&
    typeof record.partitionKey === "string" &&
    typeof record.partyId === "string" &&
    typeof record.occurredAt === "string" &&
    Boolean(record.row && typeof record.row === "object")
  );
}

function isAccountingOutboxRecord(value: unknown): value is AccountingOutboxRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AccountingOutboxRecord>;
  return (
    typeof record.operationId === "string" &&
    typeof record.partitionKey === "string" &&
    typeof record.entityKey === "string" &&
    record.operation === "UPSERT_SELLER_ROW" &&
    (record.status === "PENDING" ||
      record.status === "SYNCING" ||
      record.status === "ERROR") &&
    typeof record.attempts === "number" &&
    Boolean(record.payload && typeof record.payload === "object") &&
    (record.expectedVersion === undefined ||
      (Number.isSafeInteger(record.expectedVersion) &&
        record.expectedVersion >= 0)) &&
    typeof record.updatedAt === "number"
  );
}

export interface LotteryAccountingLocalStore {
  stageSellerRow(
    scope: AccountingLocalScope,
    occurredAt: string,
    row: AccountingSellerWorkingRow,
    storageMode?: AccountingUserLedgerStorage,
  ): Promise<void>;
  markSellerRowSynced(
    scope: AccountingLocalScope,
    occurredAt: string,
    row: AccountingSellerWorkingRow,
  ): Promise<void>;
  removeSellerRow(
    scope: AccountingLocalScope,
    partyId: string,
    occurredAt: string,
  ): Promise<void>;
  loadSellerRows(
    scope: AccountingLocalScope,
    occurredAt: string,
  ): Promise<AccountingSellerWorkingRecord[]>;
  listSellerRows(
    scope: AccountingLocalScope,
  ): Promise<AccountingSellerWorkingRecord[]>;
  listPendingOutbox(scope: AccountingLocalScope): Promise<AccountingOutboxRecord[]>;
  markSellerRowSyncing?(
    scope: AccountingLocalScope,
    occurredAt: string,
    row: AccountingSellerWorkingRow,
  ): Promise<void>;
  markSellerRowSyncError?(
    scope: AccountingLocalScope,
    occurredAt: string,
    row: AccountingSellerWorkingRow,
    message: string,
  ): Promise<void>;
  getSellerSyncOperation?(
    scope: AccountingLocalScope,
    occurredAt: string,
    partyId: string,
  ): Promise<AccountingOutboxRecord | null>;
  acknowledgeSellerSync?(
    scope: AccountingLocalScope,
    occurredAt: string,
    partyId: string,
    operationId: string,
    acknowledgement: {
      id: string;
      reference: string;
      status: "DRAFT";
      syncVersion?: number;
    },
  ): Promise<void>;
}

export function createLotteryAccountingLocalStore(
  driver: AccountingLocalDriver,
  now: () => number = Date.now,
  operationId: () => string = defaultOperationId,
): LotteryAccountingLocalStore {
  let mutationTail: Promise<void> = Promise.resolve();

  const serializeMutation = <T,>(action: () => Promise<T>): Promise<T> => {
    const result = mutationTail.then(action, action);
    mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const waitForMutations = async () => {
    await mutationTail;
  };

  const matchingOutbox = async (
    partitionKey: string,
    entityKey: string,
  ): Promise<AccountingOutboxRecord[]> =>
    (await driver.getAll(OUTBOX_STORE))
      .filter(isAccountingOutboxRecord)
      .filter(
        (record) =>
          record.partitionKey === partitionKey && record.entityKey === entityKey,
      )
      .sort((left, right) => left.updatedAt - right.updatedAt);

  const expectedVersionForRow = (row: AccountingSellerWorkingRow) =>
    row.syncVersion ?? (row.saleId ? 1 : 0);

  const createSellerWorkingRecord = (
    scope: AccountingLocalScope,
    occurredAt: string,
    row: AccountingSellerWorkingRow,
    syncState: AccountingLocalSyncState,
    updatedAt: number,
  ): AccountingSellerWorkingRecord => {
    const partitionKey = accountingLocalPartitionKey(scope);

    return {
      key: accountingSellerWorkingKey(scope, row.partyId, occurredAt),
      partitionKey,
      entityType: "SELLER_DAILY",
      partyId: row.partyId,
      occurredAt,
      row: { ...row },
      syncState,
      updatedAt,
      schemaVersion: RECORD_SCHEMA_VERSION,
    };
  };

  const putWorkingAndReplaceOutbox = async (
    workingRecord: AccountingSellerWorkingRecord,
    nextOutbox: AccountingOutboxRecord | null,
  ) => {
    const existingOutbox = await matchingOutbox(
      workingRecord.partitionKey,
      workingRecord.key,
    );
    await driver.mutate([
      { store: WORKING_STORE, type: "put", value: workingRecord },
      ...existingOutbox.map(
        (record): AccountingLocalMutation => ({
          store: OUTBOX_STORE,
          type: "delete",
          key: record.operationId,
        }),
      ),
      ...(nextOutbox
        ? [
            {
              store: OUTBOX_STORE,
              type: "put",
              value: nextOutbox,
            } satisfies AccountingLocalMutation,
          ]
        : []),
    ]);
  };

  const updateSellerSyncState = async (
    scope: AccountingLocalScope,
    occurredAt: string,
    row: AccountingSellerWorkingRow,
    syncState: AccountingLocalSyncState,
    outboxState: "SYNCING" | "ERROR" | "DELETE",
    lastError?: string,
  ) =>
    serializeMutation(async () => {
      const updatedAt = now();
      const workingRecord = createSellerWorkingRecord(
        scope,
        occurredAt,
        row,
        syncState,
        updatedAt,
      );
      const { partitionKey, key } = workingRecord;
      const existing = await matchingOutbox(partitionKey, key);
      const latest = existing.length ? existing[existing.length - 1] : null;
      const mutations: AccountingLocalMutation[] = [
        { store: WORKING_STORE, type: "put", value: workingRecord },
      ];

      for (const record of existing) {
        if (outboxState === "DELETE" || record.operationId !== latest?.operationId) {
          mutations.push({
            store: OUTBOX_STORE,
            type: "delete",
            key: record.operationId,
          });
        }
      }

      if (latest && outboxState !== "DELETE") {
        mutations.push({
          store: OUTBOX_STORE,
          type: "put",
          value: {
            ...latest,
            status: outboxState,
            attempts:
              outboxState === "SYNCING" ? latest.attempts + 1 : latest.attempts,
            updatedAt,
            lastError: outboxState === "ERROR" ? lastError : undefined,
            schemaVersion: RECORD_SCHEMA_VERSION,
          } satisfies AccountingOutboxRecord,
        });
      }

      await driver.mutate(mutations);
    });

  return {
    async stageSellerRow(scope, occurredAt, row, storageMode = "CLOUD") {
      return serializeMutation(async () => {
        const updatedAt = now();
        const workingRecord = createSellerWorkingRecord(
          scope,
          occurredAt,
          row,
          storageMode === "DEVICE" ? "LOCAL_SAVED" : "PENDING",
          updatedAt,
        );
        const { partitionKey, key } = workingRecord;
        const outboxRecord: AccountingOutboxRecord | null =
          storageMode === "CLOUD"
            ? {
                operationId: sellerOutboxOperationId(key, operationId),
                partitionKey,
                entityKey: key,
                operation: "UPSERT_SELLER_ROW",
                status: "PENDING",
                attempts: 0,
                payload: { ...row },
                expectedVersion: expectedVersionForRow(row),
                updatedAt,
                schemaVersion: RECORD_SCHEMA_VERSION,
              }
            : null;
        await putWorkingAndReplaceOutbox(workingRecord, outboxRecord);
      });
    },

    async markSellerRowSynced(scope, occurredAt, row) {
      await updateSellerSyncState(
        scope,
        occurredAt,
        row,
        "SYNCED",
        "DELETE",
      );
    },

    async markSellerRowSyncing(scope, occurredAt, row) {
      await updateSellerSyncState(
        scope,
        occurredAt,
        row,
        "SYNCING",
        "SYNCING",
      );
    },

    async markSellerRowSyncError(scope, occurredAt, row, message) {
      await updateSellerSyncState(
        scope,
        occurredAt,
        row,
        "ERROR",
        "ERROR",
        message,
      );
    },

    async removeSellerRow(scope, partyId, occurredAt) {
      await serializeMutation(async () => {
        const partitionKey = accountingLocalPartitionKey(scope);
        const key = accountingSellerWorkingKey(scope, partyId, occurredAt);
        const existingOutbox = await matchingOutbox(partitionKey, key);
        await driver.mutate([
          { store: WORKING_STORE, type: "delete", key },
          ...existingOutbox.map(
            (record): AccountingLocalMutation => ({
              store: OUTBOX_STORE,
              type: "delete",
              key: record.operationId,
            }),
          ),
        ]);
      });
    },

    async loadSellerRows(scope, occurredAt) {
      await waitForMutations();
      const partitionKey = accountingLocalPartitionKey(scope);
      const records = await driver.getAll(WORKING_STORE);
      return records
        .filter(isSellerWorkingRecord)
        .filter(
          (record) =>
            record.partitionKey === partitionKey && record.occurredAt === occurredAt,
        )
        .sort((left, right) => left.partyId.localeCompare(right.partyId));
    },

    async listSellerRows(scope) {
      await waitForMutations();
      const partitionKey = accountingLocalPartitionKey(scope);
      const records = await driver.getAll(WORKING_STORE);
      return records
        .filter(isSellerWorkingRecord)
        .filter((record) => record.partitionKey === partitionKey)
        .sort(
          (left, right) =>
            left.occurredAt.localeCompare(right.occurredAt) ||
            left.partyId.localeCompare(right.partyId),
        );
    },

    async getSellerSyncOperation(scope, occurredAt, partyId) {
      await waitForMutations();
      const partitionKey = accountingLocalPartitionKey(scope);
      const entityKey = accountingSellerWorkingKey(scope, partyId, occurredAt);
      const existing = await matchingOutbox(partitionKey, entityKey);
      return existing.length ? existing[existing.length - 1] : null;
    },

    async acknowledgeSellerSync(
      scope,
      occurredAt,
      partyId,
      operationIdValue,
      acknowledgement,
    ) {
      await serializeMutation(async () => {
        const partitionKey = accountingLocalPartitionKey(scope);
        const key = accountingSellerWorkingKey(scope, partyId, occurredAt);
        const updatedAt = now();
        const records = (await driver.getAll(WORKING_STORE))
          .filter(isSellerWorkingRecord);
        const current = records.find((record) => record.key === key);
        if (!current) return;

        const existing = await matchingOutbox(partitionKey, key);
        const latest = existing.length ? existing[existing.length - 1] : null;
        const acknowledgedVersion =
          acknowledgement.syncVersion ?? expectedVersionForRow(current.row) + 1;
        const acknowledgedRow: AccountingSellerWorkingRow = {
          ...current.row,
          saleId: acknowledgement.id,
          reference: acknowledgement.reference,
          status: acknowledgement.status,
          syncVersion: acknowledgedVersion,
        };
        const isLatestAcknowledgement =
          !latest || latest.operationId === operationIdValue;
        const workingRecord: AccountingSellerWorkingRecord = {
          ...current,
          row: acknowledgedRow,
          syncState: isLatestAcknowledgement ? "SYNCED" : current.syncState,
          updatedAt,
          schemaVersion: RECORD_SCHEMA_VERSION,
        };
        const mutations: AccountingLocalMutation[] = [
          { store: WORKING_STORE, type: "put", value: workingRecord },
        ];

        for (const record of existing) {
          if (
            isLatestAcknowledgement ||
            record.operationId !== latest?.operationId
          ) {
            mutations.push({
              store: OUTBOX_STORE,
              type: "delete",
              key: record.operationId,
            });
          }
        }

        if (!isLatestAcknowledgement && latest) {
          mutations.push({
            store: OUTBOX_STORE,
            type: "put",
            value: {
              ...latest,
              payload: {
                ...latest.payload,
                saleId: acknowledgement.id,
                reference: acknowledgement.reference,
                status: acknowledgement.status,
                syncVersion: acknowledgedVersion,
              },
              expectedVersion: acknowledgedVersion,
              status: "PENDING",
              lastError: undefined,
              updatedAt,
              schemaVersion: RECORD_SCHEMA_VERSION,
            } satisfies AccountingOutboxRecord,
          });
        }

        await driver.mutate(mutations);
      });
    },

    async listPendingOutbox(scope) {
      await waitForMutations();
      const partitionKey = accountingLocalPartitionKey(scope);
      const records = await driver.getAll(OUTBOX_STORE);
      return records
        .filter(isAccountingOutboxRecord)
        .filter((record) => record.partitionKey === partitionKey)
        .sort((left, right) => left.updatedAt - right.updatedAt);
    },
  };
}

function browserIndexedDb(): IDBFactory | null {
  return typeof window !== "undefined" && window.indexedDB ? window.indexedDB : null;
}

let defaultStore: LotteryAccountingLocalStore | null = null;

export function getLotteryAccountingLocalStore(): LotteryAccountingLocalStore | null {
  const indexedDb = browserIndexedDb();
  if (!indexedDb) return null;
  if (!defaultStore) {
    defaultStore = createLotteryAccountingLocalStore(
      createIndexedDbAccountingLocalDriver(indexedDb),
    );
  }
  return defaultStore;
}
