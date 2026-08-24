import {
  CachedChatResponse,
  ChatConsent,
  ChatMessage,
  ChatStorageUsage,
  Conversation,
  LearningConsent,
  PendingClarification,
  PersonalMemoryRecord,
} from "./chatStorage.types";

const DB_NAME = "OrbisChatDB";
const DB_VERSION = 2;
const STORE_CONVERSATIONS = "conversations";
const STORE_MESSAGES = "messages";
const STORE_PERSONAL_MEMORY = "personalMemory";
const STORE_CLARIFICATIONS = "clarifications";
const STORE_CACHE = "responseCache";
const CONSENT_PREFIX = "orbis.chat.consent.";
const LEARNING_CONSENT_PREFIX = "orbis.chat.learning-consent.";
const ANONYMOUS_PROFILE_KEY = "orbis.chat.anonymous-profile";

export const DEFAULT_CHAT_STORAGE_BUDGET_BYTES = 500 * 1024 * 1024;
export const STORAGE_WARNING_RATIO = 0.8;

/** Replaceable by an encrypted Android SQLite adapter without changing chat UI. */
export interface ChatStoragePort {
  init(timeoutMs?: number): Promise<void>;
  close(): void;
  getConsent(profileId: string): ChatConsent;
  setConsent(profileId: string, consent: Exclude<ChatConsent, null>): void;
  getLearningConsent(profileId: string): LearningConsent;
  setLearningConsent(
    profileId: string,
    consent: Exclude<LearningConsent, null>,
  ): void;
  getOrCreateAnonymousProfileId(): string;
  createConversation(
    id: string,
    profileId: string,
    title?: string,
  ): Promise<Conversation>;
  saveMessage(message: ChatMessage): Promise<void>;
  getMessagesByConversation(
    conversationId: string,
    profileId: string,
  ): Promise<ChatMessage[]>;
  clearConversation(conversationId: string): Promise<void>;
  getPersonalMemory(profileId: string): Promise<PersonalMemoryRecord[]>;
  clearPersonalMemory(profileId: string): Promise<void>;
  setPendingClarification(
    profileId: string,
    conversationId: string,
    pending: PendingClarification | null,
  ): Promise<void>;
  getPendingClarification(
    profileId: string,
    conversationId: string,
  ): Promise<PendingClarification | null>;
  getCachedResponse(key: string): Promise<CachedChatResponse | null>;
  saveCachedResponse(value: CachedChatResponse): Promise<void>;
  clearAllForProfile(profileId: string): Promise<void>;
  getUsage(profileId: string): Promise<ChatStorageUsage>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export class ChatStorageManager implements ChatStoragePort {
  private db: IDBDatabase | null = null;

  constructor(
    private readonly budgetBytes = DEFAULT_CHAT_STORAGE_BUDGET_BYTES,
  ) {}

  async init(timeoutMs = 3_000): Promise<void> {
    if (this.db) return;
    if (typeof indexedDB === "undefined")
      throw new Error("STORAGE_UNAVAILABLE");

    return new Promise((resolve, reject) => {
      let settled = false;
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      const timeout = window.setTimeout(
        () => finish(() => reject(new Error("STORAGE_INIT_TIMEOUT"))),
        timeoutMs,
      );

      request.onerror = () =>
        finish(() => reject(request.error || new Error("STORAGE_INIT_FAILED")));
      request.onblocked = () =>
        finish(() => reject(new Error("STORAGE_UPGRADE_BLOCKED")));
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        finish(resolve);
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
          const store = db.createObjectStore(STORE_CONVERSATIONS, {
            keyPath: "id",
          });
          store.createIndex("profileId", "profileId", { unique: false });
        } else {
          const store = request.transaction!.objectStore(STORE_CONVERSATIONS);
          if (!store.indexNames.contains("profileId")) {
            store.createIndex("profileId", "profileId", { unique: false });
          }
        }
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const store = db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
          store.createIndex("conversationId", "conversationId", {
            unique: false,
          });
          store.createIndex("profileId", "profileId", { unique: false });
        } else {
          const store = request.transaction!.objectStore(STORE_MESSAGES);
          if (!store.indexNames.contains("profileId")) {
            store.createIndex("profileId", "profileId", { unique: false });
          }
        }
        if (!db.objectStoreNames.contains(STORE_PERSONAL_MEMORY)) {
          const store = db.createObjectStore(STORE_PERSONAL_MEMORY, {
            keyPath: "id",
          });
          store.createIndex("profileId", "profileId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_CLARIFICATIONS)) {
          db.createObjectStore(STORE_CLARIFICATIONS, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          const store = db.createObjectStore(STORE_CACHE, { keyPath: "key" });
          store.createIndex("profileId", "profileId", { unique: false });
        }
      };
    });
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private ensureDb(): IDBDatabase {
    if (!this.db) throw new Error("STORAGE_NOT_INITIALIZED");
    return this.db;
  }

  getConsent(profileId: string): ChatConsent {
    try {
      const value = localStorage.getItem(`${CONSENT_PREFIX}${profileId}`);
      return value === "accepted" || value === "declined" ? value : null;
    } catch {
      return null;
    }
  }

  setConsent(profileId: string, consent: Exclude<ChatConsent, null>): void {
    try {
      localStorage.setItem(`${CONSENT_PREFIX}${profileId}`, consent);
    } catch {
      if (consent === "accepted")
        throw new Error("CONSENT_STORAGE_UNAVAILABLE");
    }
  }

  getLearningConsent(profileId: string): LearningConsent {
    try {
      const value = localStorage.getItem(
        `${LEARNING_CONSENT_PREFIX}${profileId}`,
      );
      return value === "accepted" || value === "declined" ? value : null;
    } catch {
      return null;
    }
  }

  setLearningConsent(
    profileId: string,
    consent: Exclude<LearningConsent, null>,
  ): void {
    try {
      localStorage.setItem(`${LEARNING_CONSENT_PREFIX}${profileId}`, consent);
    } catch {
      if (consent === "accepted") {
        throw new Error("LEARNING_CONSENT_STORAGE_UNAVAILABLE");
      }
    }
  }

  getOrCreateAnonymousProfileId(): string {
    try {
      const existing = localStorage.getItem(ANONYMOUS_PROFILE_KEY);
      if (existing) return existing;
      const id = `anonymous-${crypto.randomUUID()}`;
      localStorage.setItem(ANONYMOUS_PROFILE_KEY, id);
      return id;
    } catch {
      return `anonymous-session-${crypto.randomUUID()}`;
    }
  }

  async createConversation(
    id: string,
    profileId: string,
    title = "New Chat",
  ): Promise<Conversation> {
    const conversation: Conversation = {
      id,
      profileId,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.ensureWithinBudget(profileId, conversation);
    const transaction = this.ensureDb().transaction(
      STORE_CONVERSATIONS,
      "readwrite",
    );
    transaction.objectStore(STORE_CONVERSATIONS).put(conversation);
    await transactionDone(transaction);
    return conversation;
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    await this.ensureWithinBudget(message.profileId, message);
    const transaction = this.ensureDb().transaction(
      [STORE_MESSAGES, STORE_CONVERSATIONS],
      "readwrite",
    );
    transaction.objectStore(STORE_MESSAGES).put(message);
    const conversations = transaction.objectStore(STORE_CONVERSATIONS);
    const existing = await requestResult<Conversation | undefined>(
      conversations.get(message.conversationId),
    );
    if (existing) conversations.put({ ...existing, updatedAt: Date.now() });
    await transactionDone(transaction);
  }

  async getMessagesByConversation(
    conversationId: string,
    profileId: string,
  ): Promise<ChatMessage[]> {
    const transaction = this.ensureDb().transaction(STORE_MESSAGES, "readonly");
    const messages = await requestResult<ChatMessage[]>(
      transaction
        .objectStore(STORE_MESSAGES)
        .index("conversationId")
        .getAll(conversationId),
    );
    return messages
      .filter((message) => message.profileId === profileId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async clearConversation(conversationId: string): Promise<void> {
    const transaction = this.ensureDb().transaction(
      [STORE_MESSAGES, STORE_CONVERSATIONS],
      "readwrite",
    );
    const messages = transaction.objectStore(STORE_MESSAGES);
    const keys = await requestResult<IDBValidKey[]>(
      messages.index("conversationId").getAllKeys(conversationId),
    );
    keys.forEach((key) => messages.delete(key));
    transaction.objectStore(STORE_CONVERSATIONS).delete(conversationId);
    await transactionDone(transaction);
  }

  async getPersonalMemory(profileId: string): Promise<PersonalMemoryRecord[]> {
    const transaction = this.ensureDb().transaction(
      STORE_PERSONAL_MEMORY,
      "readonly",
    );
    return requestResult<PersonalMemoryRecord[]>(
      transaction
        .objectStore(STORE_PERSONAL_MEMORY)
        .index("profileId")
        .getAll(profileId),
    );
  }

  async clearPersonalMemory(profileId: string): Promise<void> {
    await this.deleteByProfile(STORE_PERSONAL_MEMORY, profileId);
  }

  async setPendingClarification(
    profileId: string,
    conversationId: string,
    pending: PendingClarification | null,
  ): Promise<void> {
    if (pending) await this.ensureWithinBudget(profileId, pending);
    const key = `${profileId}:${conversationId}`;
    const transaction = this.ensureDb().transaction(
      STORE_CLARIFICATIONS,
      "readwrite",
    );
    const store = transaction.objectStore(STORE_CLARIFICATIONS);
    if (pending) store.put({ key, profileId, conversationId, ...pending });
    else store.delete(key);
    await transactionDone(transaction);
  }

  async getPendingClarification(
    profileId: string,
    conversationId: string,
  ): Promise<PendingClarification | null> {
    const key = `${profileId}:${conversationId}`;
    return this.getUnexpiredRecord<PendingClarification>(
      STORE_CLARIFICATIONS,
      key,
    );
  }

  async getCachedResponse(key: string): Promise<CachedChatResponse | null> {
    return this.getUnexpiredRecord<CachedChatResponse>(STORE_CACHE, key);
  }

  private async getUnexpiredRecord<T extends { expiresAt: number }>(
    storeName: string,
    key: string,
  ): Promise<T | null> {
    const transaction = this.ensureDb().transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const value = await requestResult<T | undefined>(store.get(key));
    if (!value || value.expiresAt <= Date.now()) {
      if (value) store.delete(key);
      await transactionDone(transaction);
      return null;
    }
    await transactionDone(transaction);
    return value;
  }

  async saveCachedResponse(value: CachedChatResponse): Promise<void> {
    await this.ensureWithinBudget(value.profileId, value);
    const transaction = this.ensureDb().transaction(STORE_CACHE, "readwrite");
    transaction.objectStore(STORE_CACHE).put(value);
    await transactionDone(transaction);
  }

  async clearAllForProfile(profileId: string): Promise<void> {
    const conversations = await this.getConversations(profileId);
    for (const conversation of conversations) {
      await this.clearConversation(conversation.id);
    }
    await this.deleteByProfile(STORE_PERSONAL_MEMORY, profileId);
    await this.deleteByProfile(STORE_CACHE, profileId);
    const transaction = this.ensureDb().transaction(
      STORE_CLARIFICATIONS,
      "readwrite",
    );
    const store = transaction.objectStore(STORE_CLARIFICATIONS);
    const all = await requestResult<Array<{ key: string; profileId: string }>>(
      store.getAll(),
    );
    all
      .filter((item) => item.profileId === profileId)
      .forEach((item) => {
        store.delete(item.key);
      });
    await transactionDone(transaction);
    try {
      localStorage.removeItem(`${CONSENT_PREFIX}${profileId}`);
      localStorage.removeItem(`${LEARNING_CONSENT_PREFIX}${profileId}`);
    } catch {
      // The profile data is already removed from IndexedDB.
    }
  }

  async getUsage(profileId: string): Promise<ChatStorageUsage> {
    const [conversations, messages, memories, cache, clarifications] =
      await Promise.all([
        this.getConversations(profileId),
        this.getByProfile<ChatMessage>(STORE_MESSAGES, profileId),
        this.getByProfile<PersonalMemoryRecord>(
          STORE_PERSONAL_MEMORY,
          profileId,
        ),
        this.getByProfile<CachedChatResponse>(STORE_CACHE, profileId),
        this.getClarificationsForProfile(profileId),
      ]);
    const logicalBytes = encodedBytes({
      conversations,
      messages,
      memories,
      cache,
      clarifications,
    });
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    return {
      budgetBytes: this.budgetBytes,
      logicalBytes,
      deviceUsageBytes: estimate?.usage ?? null,
      deviceQuotaBytes: estimate?.quota ?? null,
      warning: logicalBytes >= this.budgetBytes * STORAGE_WARNING_RATIO,
    };
  }

  private async getConversations(profileId: string): Promise<Conversation[]> {
    return this.getByProfile<Conversation>(STORE_CONVERSATIONS, profileId);
  }

  private async getClarificationsForProfile(
    profileId: string,
  ): Promise<Array<PendingClarification & { profileId: string }>> {
    const transaction = this.ensureDb().transaction(
      STORE_CLARIFICATIONS,
      "readonly",
    );
    const values = await requestResult<
      Array<PendingClarification & { profileId: string }>
    >(transaction.objectStore(STORE_CLARIFICATIONS).getAll());
    return values.filter((value) => value.profileId === profileId);
  }

  private async getByProfile<T>(
    storeName: string,
    profileId: string,
  ): Promise<T[]> {
    const transaction = this.ensureDb().transaction(storeName, "readonly");
    return requestResult<T[]>(
      transaction.objectStore(storeName).index("profileId").getAll(profileId),
    );
  }

  private async deleteByProfile(
    storeName: string,
    profileId: string,
  ): Promise<void> {
    const transaction = this.ensureDb().transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const keys = await requestResult<IDBValidKey[]>(
      store.index("profileId").getAllKeys(profileId),
    );
    keys.forEach((key) => store.delete(key));
    await transactionDone(transaction);
  }

  private async ensureWithinBudget(
    profileId: string,
    nextValue: unknown,
  ): Promise<void> {
    const usage = await this.getUsage(profileId);
    if (usage.logicalBytes + encodedBytes(nextValue) > this.budgetBytes) {
      throw new Error("STORAGE_BUDGET_EXCEEDED");
    }
  }
}

export const chatStorage = new ChatStorageManager();
