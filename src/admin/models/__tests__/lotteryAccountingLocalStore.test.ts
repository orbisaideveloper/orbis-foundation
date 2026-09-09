import { describe, expect, it, vi } from "vitest";
import {
  accountingLocalPartitionKey,
  accountingSellerWorkingKey,
  createIndexedDbAccountingLocalDriver,
  createLotteryAccountingLocalStore,
  getLotteryAccountingLocalStore,
  type AccountingLocalDriver,
  type AccountingLocalScope,
} from "../lotteryAccountingLocalStore";

function createMemoryDriver(
  seeded: Partial<Record<"workingRecords" | "outbox", unknown[]>> = {},
): AccountingLocalDriver {
  const stores = {
    workingRecords: new Map<IDBValidKey, unknown>(),
    outbox: new Map<IDBValidKey, unknown>(),
  };
  for (const [index, value] of (seeded.workingRecords ?? []).entries()) {
    const record =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    stores.workingRecords.set(
      (record.key ?? `seed-working-${index}`) as IDBValidKey,
      value,
    );
  }
  for (const [index, value] of (seeded.outbox ?? []).entries()) {
    const record =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    stores.outbox.set(
      (record.operationId ?? `seed-outbox-${index}`) as IDBValidKey,
      value,
    );
  }
  return {
    async getAll(store) {
      return [...stores[store].values()];
    },
    async mutate(mutations) {
      for (const mutation of mutations) {
        if (mutation.type === "put") {
          const value = mutation.value as Record<string, unknown>;
          const key =
            mutation.store === "workingRecords" ? value.key : value.operationId;
          stores[mutation.store].set(key as IDBValidKey, mutation.value);
        } else {
          stores[mutation.store].delete(mutation.key);
        }
      }
    },
  };
}

const ENTRY_DATE = "2026-09-07";
const ADMIN_PARTITION_KEY = "ADMIN_REAL:admin-current:org-1";

const adminScope: AccountingLocalScope = {
  ownerKind: "ADMIN_REAL",
  ownerId: "admin-current",
  organizationId: "org-1",
};
const demoScope: AccountingLocalScope = {
  ownerKind: "ADMIN_DEMO",
  ownerId: "accounting-demo",
  organizationId: "org-1",
};
const row = {
  partyId: "party-1",
  dispatchQuantity: "1000",
  morningReturnQuantity: "910",
  dayReturnQuantity: "0",
  eveningReturnQuantity: "0",
  commissionRupees: "0",
};

interface FakeIndexedDbOptions {
  preExistingStores?: boolean;
  openError?: Error | null;
  failOpen?: boolean;
  requestError?: Error | null;
  failRequest?: boolean;
  transactionSignal?: "complete" | "error" | "abort";
  transactionError?: Error | null;
}

function createFakeIndexedDb(options: FakeIndexedDbOptions = {}) {
  const workingRecords = new Map<IDBValidKey, unknown>();
  const outbox = new Map<IDBValidKey, unknown>();
  const createdStores = new Set<string>(
    options.preExistingStores ? ["workingRecords", "outbox"] : [],
  );

  const database = {
    objectStoreNames: {
      contains: vi.fn((name: string) => createdStores.has(name)),
    },
    createObjectStore: vi.fn((name: string) => {
      createdStores.add(name);
      return {};
    }),
    transaction: vi.fn((stores: string | string[], mode: IDBTransactionMode) => {
      void mode;
      const names = Array.isArray(stores) ? stores : [stores];
      const transaction = {
        error: options.transactionError ?? null,
        oncomplete: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: vi.fn((storeName: string) => {
          if (!names.includes(storeName)) throw new Error("unknown store");
          const store = storeName === "workingRecords" ? workingRecords : outbox;
          return {
            getAll: vi.fn(() => {
              const request = {
                result: [...store.values()],
                error: options.requestError ?? null,
                onsuccess: null as ((event: Event) => void) | null,
                onerror: null as ((event: Event) => void) | null,
              };
              queueMicrotask(() => {
                if (options.failRequest) request.onerror?.(new Event("error"));
                else request.onsuccess?.(new Event("success"));
              });
              return request as unknown as IDBRequest<unknown[]>;
            }),
            put: vi.fn((value: unknown) => {
              const record = value as Record<string, unknown>;
              const key =
                storeName === "workingRecords" ? record.key : record.operationId;
              store.set(key as IDBValidKey, value);
            }),
            delete: vi.fn((key: IDBValidKey) => {
              store.delete(key);
            }),
          };
        }),
      };
      queueMicrotask(() => {
        const signal = options.transactionSignal ?? "complete";
        if (signal === "error") transaction.onerror?.(new Event("error"));
        else if (signal === "abort") transaction.onabort?.(new Event("abort"));
        else transaction.oncomplete?.(new Event("complete"));
      });
      return transaction as unknown as IDBTransaction;
    }),
  };

  const openRequest = {
    result: database,
    error: options.openError ?? null,
    onupgradeneeded: null as ((event: Event) => void) | null,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
  };
  const indexedDb = {
    open: vi.fn(() => {
      queueMicrotask(() => {
        if (options.failOpen) {
          openRequest.onerror?.(new Event("error"));
          return;
        }
        openRequest.onupgradeneeded?.(new Event("upgradeneeded"));
        openRequest.onsuccess?.(new Event("success"));
      });
      return openRequest as unknown as IDBOpenDBRequest;
    }),
  } as unknown as IDBFactory;

  return { indexedDb, database, workingRecords, outbox };
}

function validWorkingRecord(overrides: Record<string, unknown> = {}) {
  return {
    key: "k",
    partitionKey: ADMIN_PARTITION_KEY,
    entityType: "SELLER_DAILY",
    partyId: "party-1",
    occurredAt: ENTRY_DATE,
    row,
    syncState: "PENDING",
    updatedAt: 1,
    ...overrides,
  };
}

function validOutboxRecord(overrides: Record<string, unknown> = {}) {
  return {
    operationId: "op-1",
    partitionKey: ADMIN_PARTITION_KEY,
    entityKey: "k",
    operation: "UPSERT_SELLER_ROW",
    status: "PENDING",
    attempts: 0,
    payload: row,
    updatedAt: 1,
    ...overrides,
  };
}

describe("lotteryAccountingLocalStore", () => {
  it("partitions Admin real, Admin demo and seller working keys", () => {
    expect(accountingLocalPartitionKey(adminScope)).toBe(
      ADMIN_PARTITION_KEY,
    );
    expect(accountingLocalPartitionKey(demoScope)).toBe(
      "ADMIN_DEMO:accounting-demo:org-1",
    );
    expect(
      accountingSellerWorkingKey(adminScope, "party-1", ENTRY_DATE),
    ).toBe("ADMIN_REAL:admin-current:org-1:SELLER_DAILY:party-1:2026-09-07");
  });

  it("keeps only the latest cloud seller operation with a unique durable operation id", async () => {
    let operationSequence = 0;
    const store = createLotteryAccountingLocalStore(
      createMemoryDriver(),
      () => 1234,
      () => `operation-${++operationSequence}`,
    );
    await store.stageSellerRow(adminScope, ENTRY_DATE, row);
    await store.stageSellerRow(adminScope, ENTRY_DATE, {
      ...row,
      morningReturnQuantity: "911",
    });

    const records = await store.loadSellerRows(adminScope, ENTRY_DATE);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      partyId: "party-1",
      syncState: "PENDING",
      updatedAt: 1234,
      schemaVersion: 1,
      row: { morningReturnQuantity: "911" },
    });
    const outboxRecords = await store.listPendingOutbox(adminScope);
    expect(outboxRecords).toHaveLength(1);
    expect(outboxRecords[0]).toMatchObject({
      operationId: expect.stringContaining("operation-2"),
      operation: "UPSERT_SELLER_ROW",
      status: "PENDING",
      attempts: 0,
      schemaVersion: 1,
      payload: { morningReturnQuantity: "911" },
    });
  });


  it("carries the acknowledged server version into the next durable seller operation", async () => {
    let operationSequence = 0;
    const store = createLotteryAccountingLocalStore(
      createMemoryDriver(),
      () => 1500 + operationSequence,
      () => `sync-${++operationSequence}`,
    );

    await store.stageSellerRow(adminScope, ENTRY_DATE, row);
    const first = await store.getSellerSyncOperation?.(
      adminScope,
      ENTRY_DATE,
      "party-1",
    );
    expect(first).toMatchObject({ expectedVersion: 0 });

    await store.acknowledgeSellerSync?.(
      adminScope,
      ENTRY_DATE,
      "party-1",
      first?.operationId || "missing",
      { id: "sale-1", reference: "SAL-1", status: "DRAFT", syncVersion: 1 },
    );
    await store.stageSellerRow(adminScope, ENTRY_DATE, {
      ...row,
      saleId: "sale-1",
      reference: "SAL-1",
      status: "DRAFT",
      syncVersion: 1,
      morningReturnQuantity: "911",
    });

    expect(await store.getSellerSyncOperation?.(adminScope, ENTRY_DATE, "party-1")).toMatchObject({
      expectedVersion: 1,
      payload: expect.objectContaining({
        saleId: "sale-1",
        syncVersion: 1,
        morningReturnQuantity: "911",
      }),
    });
  });

  it("keeps a newer local edit pending when an older server acknowledgement arrives", async () => {
    let operationSequence = 0;
    const store = createLotteryAccountingLocalStore(
      createMemoryDriver(),
      () => 1600 + operationSequence,
      () => `race-${++operationSequence}`,
    );

    await store.stageSellerRow(adminScope, ENTRY_DATE, row);
    const first = await store.getSellerSyncOperation?.(
      adminScope,
      ENTRY_DATE,
      "party-1",
    );
    await store.stageSellerRow(adminScope, ENTRY_DATE, {
      ...row,
      morningReturnQuantity: "912",
    });

    await store.acknowledgeSellerSync?.(
      adminScope,
      ENTRY_DATE,
      "party-1",
      first?.operationId || "missing",
      { id: "sale-race", reference: "SAL-R", status: "DRAFT", syncVersion: 1 },
    );

    expect(await store.loadSellerRows(adminScope, ENTRY_DATE)).toEqual([
      expect.objectContaining({
        syncState: "PENDING",
        row: expect.objectContaining({
          saleId: "sale-race",
          reference: "SAL-R",
          syncVersion: 1,
          morningReturnQuantity: "912",
        }),
      }),
    ]);
    expect(await store.listPendingOutbox(adminScope)).toEqual([
      expect.objectContaining({
        operationId: expect.stringContaining("race-2"),
        expectedVersion: 1,
        status: "PENDING",
        payload: expect.objectContaining({
          saleId: "sale-race",
          syncVersion: 1,
          morningReturnQuantity: "912",
        }),
      }),
    ]);
  });

  it("continues serialized mutations after a failure and replaces multiple older entity operations", async () => {
    const entityKey = accountingSellerWorkingKey(
      adminScope,
      "party-1",
      ENTRY_DATE,
    );
    const baseDriver = createMemoryDriver({
      outbox: [
        validOutboxRecord({
          operationId: "old-1",
          entityKey,
          updatedAt: 10,
        }),
        validOutboxRecord({
          operationId: "old-2",
          entityKey,
          updatedAt: 20,
        }),
      ],
    });
    const mutate = vi
      .fn()
      .mockRejectedValueOnce(new Error("first mutation failed"))
      .mockImplementation((mutations) => baseDriver.mutate(mutations));
    const driver: AccountingLocalDriver = {
      getAll: baseDriver.getAll,
      mutate,
    };
    let operationSequence = 0;
    const store = createLotteryAccountingLocalStore(
      driver,
      () => 1600,
      () => `replacement-${++operationSequence}`,
    );

    await expect(
      store.stageSellerRow(adminScope, ENTRY_DATE, row),
    ).rejects.toThrow("first mutation failed");

    await store.stageSellerRow(adminScope, ENTRY_DATE, {
      ...row,
      morningReturnQuantity: "912",
    });

    expect(await store.listPendingOutbox(adminScope)).toEqual([
      expect.objectContaining({
        operationId: expect.stringContaining("replacement-2"),
        payload: expect.objectContaining({
          morningReturnQuantity: "912",
        }),
      }),
    ]);
  });

  it("keeps DEVICE seller rows durable without creating a cloud outbox", async () => {
    const store = createLotteryAccountingLocalStore(
      createMemoryDriver(),
      () => 1400,
      () => "device-op-must-not-be-used",
    );

    await store.stageSellerRow(adminScope, ENTRY_DATE, row, "DEVICE");

    expect(await store.loadSellerRows(adminScope, ENTRY_DATE)).toEqual([
      expect.objectContaining({
        syncState: "LOCAL_SAVED",
        schemaVersion: 1,
        row,
      }),
    ]);
    expect(await store.listPendingOutbox(adminScope)).toEqual([]);
  });


  it("marks local sync state when no prior cloud outbox operation exists", async () => {
    const store = createLotteryAccountingLocalStore(
      createMemoryDriver(),
      () => 1700,
      () => "unused-operation-id",
    );

    await store.markSellerRowSyncing?.(adminScope, ENTRY_DATE, row);

    expect(await store.loadSellerRows(adminScope, ENTRY_DATE)).toEqual([
      expect.objectContaining({
        syncState: "SYNCING",
        updatedAt: 1700,
        schemaVersion: 1,
        row,
      }),
    ]);
    expect(await store.listPendingOutbox(adminScope)).toEqual([]);
  });

  it("tracks cloud retry attempts and a durable sync error without losing the queued payload", async () => {
    const store = createLotteryAccountingLocalStore(
      createMemoryDriver(),
      () => 1500,
      () => "retry-op",
    );
    await store.stageSellerRow(adminScope, ENTRY_DATE, row);
    await store.markSellerRowSyncing?.(adminScope, ENTRY_DATE, row);
    await store.markSellerRowSyncError?.(
      adminScope,
      ENTRY_DATE,
      row,
      "network unavailable",
    );

    expect(await store.listPendingOutbox(adminScope)).toEqual([
      expect.objectContaining({
        operationId: expect.stringContaining("retry-op"),
        status: "ERROR",
        attempts: 1,
        lastError: "network unavailable",
        payload: row,
      }),
    ]);
    expect(await store.loadSellerRows(adminScope, ENTRY_DATE)).toEqual([
      expect.objectContaining({ syncState: "ERROR" }),
    ]);
  });

  it("keeps demo data isolated, marks server acknowledgements synced and removes the outbox", async () => {
    const store = createLotteryAccountingLocalStore(createMemoryDriver(), () => 2000);
    await store.stageSellerRow(adminScope, ENTRY_DATE, row);
    await store.stageSellerRow(demoScope, ENTRY_DATE, {
      ...row,
      partyId: "demo-party",
    });

    expect(await store.loadSellerRows(adminScope, ENTRY_DATE)).toHaveLength(1);
    expect(await store.loadSellerRows(demoScope, ENTRY_DATE)).toHaveLength(1);

    await store.markSellerRowSynced(adminScope, ENTRY_DATE, {
      ...row,
      saleId: "draft-1",
      reference: "SAL-1",
      status: "DRAFT",
    });
    expect((await store.loadSellerRows(adminScope, ENTRY_DATE))[0]).toMatchObject({
      syncState: "SYNCED",
      row: { saleId: "draft-1", reference: "SAL-1" },
    });
    expect(await store.listPendingOutbox(adminScope)).toEqual([]);
    expect(await store.listPendingOutbox(demoScope)).toHaveLength(1);
  });

  it("removes a cleared row and filters every malformed working/outbox shape", async () => {
    const workingRecords = [
      null,
      7,
      {},
      { entityType: "WRONG" },
      { entityType: "SELLER_DAILY" },
      { entityType: "SELLER_DAILY", key: "k" },
      { entityType: "SELLER_DAILY", key: "k", partitionKey: "p" },
      {
        entityType: "SELLER_DAILY",
        key: "k",
        partitionKey: "p",
        partyId: "party",
      },
      {
        entityType: "SELLER_DAILY",
        key: "k",
        partitionKey: "p",
        partyId: "party",
        occurredAt: ENTRY_DATE,
        row: null,
      },
      {
        entityType: "SELLER_DAILY",
        key: "k",
        partitionKey: "p",
        partyId: "party",
        occurredAt: ENTRY_DATE,
        row: "bad",
      },
      validWorkingRecord({ key: "other", partitionKey: "OTHER", partyId: "z" }),
      validWorkingRecord({ key: "other-date", occurredAt: "2026-09-06", partyId: "z" }),
      validWorkingRecord({ key: "b", partyId: "party-b" }),
      validWorkingRecord({ key: "a", partyId: "party-a" }),
    ];
    const outboxRecords = [
      null,
      7,
      {},
      { operationId: "op" },
      { operationId: "op", partitionKey: "p" },
      validOutboxRecord({ operationId: "other", partitionKey: "OTHER" }),
      validOutboxRecord({ operationId: "late", updatedAt: 20 }),
      validOutboxRecord({ operationId: "early", updatedAt: 10 }),
    ];
    const driver = createMemoryDriver({ workingRecords, outbox: outboxRecords });
    const store = createLotteryAccountingLocalStore(driver, () => 3000);

    expect((await store.loadSellerRows(adminScope, ENTRY_DATE)).map((item) => item.partyId)).toEqual([
      "party-a",
      "party-b",
    ]);
    expect(
      (await store.listSellerRows(adminScope)).map(
        (item) => `${item.occurredAt}:${item.partyId}`,
      ),
    ).toEqual([
      "2026-09-06:z",
      "2026-09-07:party-a",
      "2026-09-07:party-b",
    ]);
    expect((await store.listPendingOutbox(adminScope)).map((item) => item.operationId)).toEqual([
      "early",
      "late",
    ]);

    await store.stageSellerRow(adminScope, ENTRY_DATE, row);
    await store.removeSellerRow(adminScope, "party-1", ENTRY_DATE);
    expect(
      (await store.loadSellerRows(adminScope, ENTRY_DATE)).some(
        (item) => item.partyId === "party-1",
      ),
    ).toBe(false);
  });

  it("runs the IndexedDB driver upgrade, cached open, put, getAll and delete paths", async () => {
    const fake = createFakeIndexedDb();
    const driver = createIndexedDbAccountingLocalDriver(fake.indexedDb);
    await driver.mutate([]);
    await driver.mutate([
      {
        store: "workingRecords",
        type: "put",
        value: validWorkingRecord({ key: "working-1" }),
      },
      {
        store: "outbox",
        type: "put",
        value: validOutboxRecord({ operationId: "outbox-1" }),
      },
    ]);
    expect(await driver.getAll("workingRecords")).toHaveLength(1);
    expect(await driver.getAll("outbox")).toHaveLength(1);
    await driver.mutate([
      { store: "workingRecords", type: "delete", key: "working-1" },
      { store: "outbox", type: "delete", key: "outbox-1" },
    ]);
    expect(await driver.getAll("workingRecords")).toEqual([]);
    expect(fake.indexedDb.open).toHaveBeenCalledTimes(1);
    expect(fake.database.createObjectStore).toHaveBeenCalledTimes(2);
  });

  it("does not recreate IndexedDB object stores that already exist", async () => {
    const fake = createFakeIndexedDb({ preExistingStores: true });
    const driver = createIndexedDbAccountingLocalDriver(fake.indexedDb);
    await driver.getAll("workingRecords");
    expect(fake.database.createObjectStore).not.toHaveBeenCalled();
  });

  it.each([
    [new Error("blocked"), "blocked"],
    [null, "Accounting local database could not open."],
  ])("reports IndexedDB open failures (%s)", async (openError, message) => {
    const fake = createFakeIndexedDb({ failOpen: true, openError });
    const driver = createIndexedDbAccountingLocalDriver(fake.indexedDb);
    await expect(driver.getAll("workingRecords")).rejects.toThrow(message);
  });

  it.each([
    [new Error("read failed"), "read failed"],
    [null, "IndexedDB request failed."],
  ])("reports IndexedDB request failures (%s)", async (requestError, message) => {
    const fake = createFakeIndexedDb({ failRequest: true, requestError });
    const driver = createIndexedDbAccountingLocalDriver(fake.indexedDb);
    await expect(driver.getAll("workingRecords")).rejects.toThrow(message);
  });

  it.each([
    ["error", new Error("tx failed"), "tx failed"],
    ["error", null, "IndexedDB transaction failed."],
    ["abort", new Error("tx aborted"), "tx aborted"],
    ["abort", null, "IndexedDB transaction aborted."],
  ] as const)(
    "reports IndexedDB transaction %s failures with and without native errors",
    async (transactionSignal, transactionError, message) => {
      const fake = createFakeIndexedDb({ transactionSignal, transactionError });
      const driver = createIndexedDbAccountingLocalDriver(fake.indexedDb);
      await expect(driver.mutate([
        {
          store: "workingRecords",
          type: "put",
          value: validWorkingRecord({ key: "tx" }),
        },
      ])).rejects.toThrow(message);
    },
  );

  it("returns null without browser IndexedDB and caches one default browser store", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "indexedDB");
    try {
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: undefined,
      });
      expect(getLotteryAccountingLocalStore()).toBeNull();

      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: {} as IDBFactory,
      });
      const first = getLotteryAccountingLocalStore();
      const second = getLotteryAccountingLocalStore();
      expect(first).not.toBeNull();
      expect(second).toBe(first);
    } finally {
      if (descriptor) Object.defineProperty(window, "indexedDB", descriptor);
      else Reflect.deleteProperty(window, "indexedDB");
    }
  });
});
