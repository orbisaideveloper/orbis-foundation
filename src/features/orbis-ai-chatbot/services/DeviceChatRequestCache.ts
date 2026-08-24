import {
  CachedChatResponse,
  PendingClarification,
} from "../storage/chatStorage.types";

const TTL_MS = {
  price: 2 * 60 * 1000,
  weather: 5 * 60 * 1000,
  news: 10 * 60 * 1000,
  stable: 24 * 60 * 60 * 1000,
} as const;

export type ChatFreshnessClass = keyof typeof TTL_MS;

export function normalizeChatQuery(query: string): string {
  return query
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[?!.,।]+$/g, "")
    .replace(/\s+/g, " ");
}

export function classifyFreshness(query: string): ChatFreshnessClass {
  const normalized = normalizeChatQuery(query);
  if (/(?:price|দাম)/i.test(normalized)) return "price";
  if (/(?:weather|আবহাওয়া|ওয়েদার)/i.test(normalized)) return "weather";
  if (/(?:news|খবর|latest|সর্বশেষ)/i.test(normalized)) return "news";
  return "stable";
}

export function cacheKey(
  profileId: string,
  query: string,
  pending?: PendingClarification | null,
): string {
  const effective = pending ? `${pending.originalRequest} ${query}` : query;
  return `${profileId}:${normalizeChatQuery(effective)}`;
}

interface CacheStoragePort {
  getCachedResponse(key: string): Promise<CachedChatResponse | null>;
  saveCachedResponse(value: CachedChatResponse): Promise<void>;
}

export class DeviceChatRequestCache {
  private readonly inFlight = new Map<
    string,
    Promise<CachedChatResponse["response"]>
  >();
  private readonly ephemeral = new Map<string, CachedChatResponse>();

  constructor(
    private readonly storage: CacheStoragePort,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async run(options: {
    profileId: string;
    query: string;
    pending?: PendingClarification | null;
    persistent: boolean;
    request: () => Promise<CachedChatResponse["response"]>;
  }): Promise<{ response: CachedChatResponse["response"]; cached: boolean }> {
    const key = cacheKey(options.profileId, options.query, options.pending);
    const now = this.clock();
    const local = options.persistent
      ? await this.storage.getCachedResponse(key)
      : this.ephemeral.get(key) || null;
    if (local && local.expiresAt > now) {
      return { response: local.response, cached: true };
    }
    if (local && !options.persistent) this.ephemeral.delete(key);

    const duplicate = this.inFlight.get(key);
    if (duplicate) return { response: await duplicate, cached: false };

    const request = options.request();
    this.inFlight.set(key, request);
    try {
      const response = await request;
      const freshnessClass = classifyFreshness(
        options.pending
          ? `${options.pending.originalRequest} ${options.query}`
          : options.query,
      );
      const record: CachedChatResponse = {
        key,
        profileId: options.profileId,
        normalizedQuery: normalizeChatQuery(options.query),
        response,
        freshnessClass,
        createdAt: now,
        expiresAt: now + TTL_MS[freshnessClass],
      };
      if (response.provider.type === "WEB_SEARCH") {
        if (options.persistent) {
          try {
            await this.storage.saveCachedResponse(record);
          } catch {
            // A cache write failure must never hide a fresh network response.
          }
        } else this.ephemeral.set(key, record);
      }
      return { response, cached: false };
    } finally {
      this.inFlight.delete(key);
    }
  }

  clearEphemeral(): void {
    this.ephemeral.clear();
  }
}

export const CHAT_CACHE_TTL_MS = TTL_MS;
