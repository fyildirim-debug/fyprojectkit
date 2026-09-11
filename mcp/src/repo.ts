import { Client, Databases, ID, Query } from 'node-appwrite';
import {
  AppwriteRepo,
  LocalRepo,
  type AppwriteDoc,
  type CollectionId,
  type DocumentsGateway,
  type TakipRepo,
} from '@takip/shared';

/** Bellek içi anahtar-değer — yerel modda LocalRepo'nun kalıcılık ihtiyacını karşılar. */
class MemoryStore {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** `DocumentsGateway`'in sunucu (node-appwrite) uygulaması. */
function createServerGateway(
  endpoint: string,
  projectId: string,
  apiKey: string,
  databaseId: string,
): DocumentsGateway {
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const databases = new Databases(client);

  return {
    async list(collection: CollectionId, queries: string[] = []) {
      const response = await databases.listDocuments(databaseId, collection, queries);
      return response.documents as unknown as AppwriteDoc[];
    },
    async create(collection, data) {
      return (await databases.createDocument(
        databaseId,
        collection,
        ID.unique(),
        data,
      )) as unknown as AppwriteDoc;
    },
    async update(collection, id, data) {
      return (await databases.updateDocument(
        databaseId,
        collection,
        id,
        data,
      )) as unknown as AppwriteDoc;
    },
    async remove(collection, id) {
      await databases.deleteDocument(databaseId, collection, id);
    },
    equal: (field, value) => Query.equal(field, value),
    orderDesc: (field) => Query.orderDesc(field),
    limit: (count) => Query.limit(count),

    // node-appwrite 14 toplu uçları sarmalamıyor; REST'e doğrudan gidiyoruz.
    // `client.call` API anahtarını ve proje başlığını kendi ekler.
    async removeMany(collection, queries) {
      await bulk(client, endpoint, databaseId, 'DELETE', collection, { queries });
    },
    async updateMany(collection, queries, data) {
      await bulk(client, endpoint, databaseId, 'PATCH', collection, { queries, data });
    },
  };
}

/**
 * Appwrite'ın sorgu tabanlı toplu uçları:
 *   DELETE .../documents  { queries }
 *   PATCH  .../documents  { queries, data }
 */
async function bulk(
  client: Client,
  endpoint: string,
  databaseId: string,
  method: 'DELETE' | 'PATCH',
  collection: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const callable = client as unknown as {
    call(method: string, url: URL, headers?: Record<string, string>, params?: unknown): Promise<unknown>;
  };
  const url = new URL(
    `${endpoint.replace(/\/$/, '')}/databases/${databaseId}/collections/${collection}/documents`,
  );
  await callable.call(method, url, { 'content-type': 'application/json' }, payload);
}

export interface RepoHandle {
  repo: TakipRepo;
  /** Appwrite bağlıysa false — günlüklerde ve /health çıktısında belirtilir. */
  localMode: boolean;
}

/**
 * Ortam değişkenleri eksikse yerel (tohum veriyle dolu, bellekte) adaptöre düşer;
 * böylece sunucu backend olmadan da ayağa kalkar ve araçlar denenebilir.
 */
export function createRepo(): RepoHandle {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'takip';

  if (endpoint && projectId && apiKey) {
    return {
      repo: new AppwriteRepo(createServerGateway(endpoint, projectId, apiKey, databaseId)),
      localMode: false,
    };
  }

  return { repo: new LocalRepo(new MemoryStore()), localMode: true };
}
