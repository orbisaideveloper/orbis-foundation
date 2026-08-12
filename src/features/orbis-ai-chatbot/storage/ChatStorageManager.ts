import { ChatMessage, Conversation } from "./chatStorage.types";

const DB_NAME = "OrbisChatDB";
const DB_VERSION = 1;
const STORE_CONVERSATIONS = "conversations";
const STORE_MESSAGES = "messages";

export class ChatStorageManager {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
          db.createObjectStore(STORE_CONVERSATIONS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const messageStore = db.createObjectStore(STORE_MESSAGES, {
            keyPath: "id",
          });
          messageStore.createIndex("conversationId", "conversationId", {
            unique: false,
          });
        }
      };
    });
  }

  private ensureDb() {
    if (!this.db)
      throw new Error("Database not initialized. Call init() first.");
  }

  async createConversation(
    id: string,
    title: string = "New Chat",
  ): Promise<Conversation> {
    this.ensureDb();
    const conversation: Conversation = {
      id,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        STORE_CONVERSATIONS,
        "readwrite",
      );
      const store = transaction.objectStore(STORE_CONVERSATIONS);
      const request = store.add(conversation);

      request.onsuccess = () => resolve(conversation);
      request.onerror = () => reject(request.error);
    });
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_MESSAGES, STORE_CONVERSATIONS],
        "readwrite",
      );

      // Save the message
      const msgStore = transaction.objectStore(STORE_MESSAGES);
      msgStore.put(message);

      // Update conversation's updatedAt timestamp
      const convStore = transaction.objectStore(STORE_CONVERSATIONS);
      const getReq = convStore.get(message.conversationId);

      getReq.onsuccess = () => {
        if (getReq.result) {
          const conv = getReq.result;
          conv.updatedAt = Date.now();
          convStore.put(conv);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getMessagesByConversation(
    conversationId: string,
  ): Promise<ChatMessage[]> {
    this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_MESSAGES, "readonly");
      const store = transaction.objectStore(STORE_MESSAGES);
      const index = store.index("conversationId");
      const request = index.getAll(conversationId);

      request.onsuccess = () => {
        // Sort messages by creation time
        const messages = (request.result as ChatMessage[]).sort(
          (a, b) => a.createdAt - b.createdAt,
        );
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export const chatStorage = new ChatStorageManager();
