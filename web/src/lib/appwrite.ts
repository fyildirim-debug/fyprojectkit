import { Account, Client, Databases, ID, Query } from 'appwrite';
import type { AppwriteDoc, CollectionId, DocumentsGateway } from '@takip/shared';

const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT as string | undefined;
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID as string | undefined;
const DATABASE_ID = (import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined) ?? 'takip';

/** Üç değişken de doluysa gerçek backend'e bağlanırız, değilse yerel adaptör devreye girer. */
export const appwriteConfigured = Boolean(ENDPOINT && PROJECT_ID);

let client: Client | null = null;

function getClient(): Client {
  if (!appwriteConfigured) throw new Error('Appwrite yapılandırılmadı.');
  if (!client) client = new Client().setEndpoint(ENDPOINT!).setProject(PROJECT_ID!);
  return client;
}

export function getAccount(): Account {
  return new Account(getClient());
}

/** `DocumentsGateway`'in tarayıcı uygulaması. */
export function createBrowserGateway(): DocumentsGateway {
  const databases = new Databases(getClient());

  return {
    async list(collection: CollectionId, queries: string[] = []) {
      const response = await databases.listDocuments(DATABASE_ID, collection, queries);
      return response.documents as unknown as AppwriteDoc[];
    },
    async create(collection, data) {
      return (await databases.createDocument(
        DATABASE_ID,
        collection,
        ID.unique(),
        data,
      )) as unknown as AppwriteDoc;
    },
    async update(collection, id, data) {
      return (await databases.updateDocument(
        DATABASE_ID,
        collection,
        id,
        data,
      )) as unknown as AppwriteDoc;
    },
    async remove(collection, id) {
      await databases.deleteDocument(DATABASE_ID, collection, id);
    },
    equal: (field, value) => Query.equal(field, value),
    orderDesc: (field) => Query.orderDesc(field),
    limit: (count) => Query.limit(count),

    // SDK 16 toplu uçları sarmalamıyor; REST'e doğrudan gidiyoruz.
    // `client.call` oturumu, proje başlığını ve fallback cookie'yi kendi ekler.
    async removeMany(collection, queries) {
      await bulk('DELETE', collection, { queries });
    },
    async updateMany(collection, queries, data) {
      await bulk('PATCH', collection, { queries, data });
    },
  };
}

/**
 * Appwrite'ın sorgu tabanlı toplu uçları:
 *   DELETE .../documents  { queries }
 *   PATCH  .../documents  { queries, data }
 * Yüzlerce kaydı tek tek göndermek hız sınırına takılıyordu.
 */
async function bulk(
  method: 'DELETE' | 'PATCH',
  collection: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const client = getClient() as unknown as {
    call(method: string, url: URL, headers?: Record<string, string>, params?: unknown): Promise<unknown>;
  };
  const url = new URL(
    `${ENDPOINT!.replace(/\/$/, '')}/databases/${DATABASE_ID}/collections/${collection}/documents`,
  );
  await client.call(method, url, { 'content-type': 'application/json' }, payload);
}
