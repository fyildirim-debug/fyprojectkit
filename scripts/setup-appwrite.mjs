#!/usr/bin/env node
/**
 * Appwrite'ta "Proje Takip" veritabanını kurar: koleksiyonlar, alanlar, index'ler.
 * Tekrar çalıştırmak güvenlidir — var olan kaynakları atlar, eksikleri tamamlar.
 *
 *   APPWRITE_ENDPOINT=https://appwrite.example.com/v1 \
 *   APPWRITE_PROJECT_ID=takip \
 *   APPWRITE_API_KEY=... \
 *   node scripts/setup-appwrite.mjs [--seed] [--database takip]
 *
 * --seed  örnek (kurgusal) kayıtları da yazar (boş koleksiyonlara).
 *
 * Not: Proje henüz yoksa Appwrite konsolundan "takip" kimliğiyle bir proje açıp,
 * databases + collections yetkisi olan bir API anahtarı üret.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** .env dosyasını (varsa) process.env'e ekler — kabuk değişkenleri önceliklidir. */
function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, '');
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
  } catch {
    // .env yoksa sorun değil.
  }
}

loadEnvFile(resolve(here, '..', '.env'));

const args = process.argv.slice(2);
const WITH_SEED = args.includes('--seed');
const DATABASE_ID = (() => {
  const index = args.indexOf('--database');
  return index !== -1 && args[index + 1] ? args[index + 1] : process.env.APPWRITE_DATABASE_ID || 'takip';
})();

const ENDPOINT = (process.env.APPWRITE_ENDPOINT || 'https://appwrite.example.com/v1').replace(/\/$/, '');
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || 'takip';
const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('APPWRITE_API_KEY tanımlı değil. .env dosyasına ekle veya kabukta ver.');
  process.exit(1);
}

const HEADERS = {
  'content-type': 'application/json',
  'x-appwrite-project': PROJECT_ID,
  'x-appwrite-key': API_KEY,
};

async function api(method, path, body) {
  let response;
  try {
    response = await fetch(`${ENDPOINT}${path}`, {
      method,
      headers: HEADERS,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new Error(
      `${ENDPOINT} adresine ulaşılamadı (${cause.message}). ` +
        'Ağ/VPN/proxy erişimini kontrol et.',
    );
  }

  const text = await response.text();

  // Araya giren bir vekil ya da hata sayfası JSON yerine düz metin döndürebilir;
  // ham parse hatası yerine ne olduğunu söyle.
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(
        `${ENDPOINT} JSON değil, HTTP ${response.status} döndü: ` +
          `${text.slice(0, 120).replace(/\s+/g, ' ')}`,
      );
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.message || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.type = payload?.type;
    throw error;
  }
  return payload;
}

/** 409 (zaten var) hatasını yutar — script'in tekrar çalıştırılabilir olmasını sağlar. */
async function ensure(label, run) {
  try {
    await run();
    console.log(`  + ${label}`);
  } catch (error) {
    if (error.status === 409) {
      console.log(`  · ${label} (zaten var)`);
      return;
    }
    throw error;
  }
}

const s = (key, size, required = false, array = false) => ({ kind: 'string', key, size, required, array });
const i = (key, required = false) => ({ kind: 'integer', key, required });
const b = (key, required = false) => ({ kind: 'boolean', key, required });
const e = (key, elements, required = false) => ({ kind: 'enum', key, elements, required });

/** Koleksiyon şeması — `shared/src/types.ts` ile birebir aynı alanlar. */
const SCHEMA = [
  {
    id: 'projects',
    name: 'Projeler',
    attributes: [
      s('slug', 64, true),
      s('name', 128, true),
      s('subtitle', 255),
      e('status', ['teklif', 'gelistirme', 'test', 'canli', 'beklemede', 'arsiv'], true),
      i('progress'),
      s('version', 32),
      s('startDate', 40),
      s('server', 128),
      s('domain', 190),
      s('sslStatus', 64),
      i('sslDays'),
      s('dns', 64),
      b('mcpEnabled'),
      s('createdAt', 40),
      s('updatedAt', 40),
    ],
    indexes: [
      { key: 'slug_unique', type: 'unique', attributes: ['slug'] },
      { key: 'status_idx', type: 'key', attributes: ['status'] },
    ],
  },
  {
    id: 'items',
    name: 'Hatalar & işler',
    attributes: [
      s('projectId', 64, true),
      i('refNo', true),
      e('type', ['bug', 'task'], true),
      s('title', 500, true),
      s('description', 4000),
      e('priority', ['cok_onemli', 'kritik', 'yuksek', 'orta', 'dusuk', 'istek'], true),
      e('status', ['planned', 'open', 'done'], true),
      s('reporter', 128),
      s('tag', 64),
      s('createdAt', 40),
      s('doneAt', 40),
      s('releaseVersion', 32),
    ],
    indexes: [
      { key: 'project_idx', type: 'key', attributes: ['projectId'] },
      { key: 'project_status_idx', type: 'key', attributes: ['projectId', 'status'] },
      { key: 'refno_idx', type: 'key', attributes: ['refNo'] },
      { key: 'title_search', type: 'fulltext', attributes: ['title'] },
    ],
  },
  {
    id: 'notes',
    name: 'Notlar',
    attributes: [
      s('projectId', 64, true),
      s('body', 8000, true),
      s('context', 128),
      e('importance', ['cok_onemli', 'normal', 'az_onemli']),
      s('createdAt', 40),
    ],
    indexes: [
      { key: 'project_idx', type: 'key', attributes: ['projectId'] },
      { key: 'body_search', type: 'fulltext', attributes: ['body'] },
    ],
  },
  {
    id: 'releases',
    name: 'Sürümler',
    attributes: [
      s('projectId', 64, true),
      s('version', 32, true),
      s('date', 40),
      e('status', ['draft', 'released'], true),
      s('createdAt', 40),
    ],
    indexes: [{ key: 'project_idx', type: 'key', attributes: ['projectId'] }],
  },
  {
    id: 'change_entries',
    name: 'Changelog maddeleri',
    attributes: [
      s('projectId', 64, true),
      s('releaseId', 64, true),
      e('kind', ['fix', 'new', 'improve', 'removed'], true),
      s('text', 1000, true),
      i('refNo'),
      s('createdAt', 40),
    ],
    indexes: [
      { key: 'project_idx', type: 'key', attributes: ['projectId'] },
      { key: 'release_idx', type: 'key', attributes: ['releaseId'] },
    ],
  },
  {
    id: 'credentials',
    name: 'Şifreler & erişimler',
    attributes: [
      s('projectId', 64, true),
      s('service', 190, true),
      s('username', 190),
      s('secret', 2000),
      e('twoFactor', ['active', 'none', 'expiring'], true),
      s('color', 16),
      s('updatedAt', 40),
    ],
    indexes: [{ key: 'project_idx', type: 'key', attributes: ['projectId'] }],
  },
  {
    id: 'links',
    name: 'Bağlantılar',
    attributes: [
      s('projectId', 64, true),
      s('label', 190, true),
      s('url', 1000, true),
      e('kind', ['live', 'repo', 'panel', 'console', 'other'], true),
    ],
    indexes: [{ key: 'project_idx', type: 'key', attributes: ['projectId'] }],
  },
  {
    id: 'time_entries',
    name: 'Zaman kayıtları',
    attributes: [
      s('projectId', 64, true),
      s('itemId', 64),
      s('startedAt', 40, true),
      s('endedAt', 40),
      i('minutes'),
      s('note', 500),
    ],
    indexes: [
      { key: 'project_idx', type: 'key', attributes: ['projectId'] },
      { key: 'started_idx', type: 'key', attributes: ['startedAt'] },
    ],
  },
  {
    id: 'mcp_configs',
    name: 'MCP ayarları',
    attributes: [
      s('projectId', 64, true),
      b('enabled'),
      s('token', 190, true),
      s('enabledTools', 64, false, true),
      b('autoApply'),
      s('createdAt', 40),
    ],
    indexes: [
      { key: 'project_unique', type: 'unique', attributes: ['projectId'] },
      { key: 'token_idx', type: 'key', attributes: ['token'] },
    ],
  },
  {
    id: 'mcp_clients',
    name: 'MCP istemcileri',
    attributes: [
      s('projectId', 64, true),
      s('name', 190, true),
      e('mode', ['read', 'readwrite'], true),
      s('lastSeenAt', 40),
    ],
    indexes: [{ key: 'project_idx', type: 'key', attributes: ['projectId'] }],
  },
  {
    id: 'mcp_logs',
    name: 'MCP günlüğü',
    attributes: [
      s('projectId', 64, true),
      s('tool', 64, true),
      s('summary', 2000),
      s('client', 190),
      s('createdAt', 40),
    ],
    indexes: [
      { key: 'project_idx', type: 'key', attributes: ['projectId'] },
      { key: 'created_idx', type: 'key', attributes: ['createdAt'] },
    ],
  },
];

/** Tek kullanıcılık panel: erişim `users` rolüyle sınırlı, misafire kapalı. */
const PERMISSIONS = [
  'create("users")',
  'read("users")',
  'update("users")',
  'delete("users")',
];

async function createAttribute(collectionId, attribute) {
  const base = `/databases/${DATABASE_ID}/collections/${collectionId}/attributes`;
  const { kind, key, required } = attribute;

  if (kind === 'string') {
    return api('POST', `${base}/string`, {
      key,
      size: attribute.size,
      required,
      array: attribute.array ?? false,
      default: required || attribute.array ? undefined : null,
    });
  }
  if (kind === 'integer') {
    return api('POST', `${base}/integer`, { key, required, default: required ? undefined : null });
  }
  if (kind === 'boolean') {
    return api('POST', `${base}/boolean`, { key, required, default: required ? undefined : false });
  }
  return api('POST', `${base}/enum`, {
    key,
    elements: attribute.elements,
    required,
    default: required ? undefined : null,
  });
}

/** Index oluşturmadan önce alanların `available` olmasını bekler. */
async function waitForAttributes(collectionId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { attributes } = await api(
      'GET',
      `/databases/${DATABASE_ID}/collections/${collectionId}/attributes?queries[]=${encodeURIComponent(
        JSON.stringify({ method: 'limit', values: [100] }),
      )}`,
    );
    if (attributes.every((attribute) => attribute.status === 'available')) return;
    await new Promise((done) => setTimeout(done, 750));
  }
  throw new Error(`${collectionId}: alanlar hazır olmadı`);
}

async function seedCollections() {
  const { seedData } = await import('../shared/src/seed.ts').catch(() => ({ seedData: null }));
  if (!seedData) {
    console.log('\nÖrnek veri atlandı (shared/src/seed.ts okunamadı — tsx ile çalıştır).');
    return;
  }

  const MAP = [
    ['projects', seedData.projects],
    ['items', seedData.items],
    ['notes', seedData.notes],
    ['releases', seedData.releases],
    ['change_entries', seedData.changeEntries],
    ['credentials', seedData.credentials],
    ['links', seedData.links],
    ['time_entries', seedData.timeEntries],
    ['mcp_configs', seedData.mcpConfigs],
    ['mcp_clients', seedData.mcpClients],
    ['mcp_logs', seedData.mcpLogs],
  ];

  console.log('\nÖrnek veri yazılıyor…');
  for (const [collectionId, rows] of MAP) {
    const existing = await api(
      'GET',
      `/databases/${DATABASE_ID}/collections/${collectionId}/documents?queries[]=${encodeURIComponent(
        JSON.stringify({ method: 'limit', values: [1] }),
      )}`,
    );
    if (existing.total > 0) {
      console.log(`  · ${collectionId} dolu, atlandı`);
      continue;
    }
    for (const row of rows) {
      const { id, ...data } = row;
      await api('POST', `/databases/${DATABASE_ID}/collections/${collectionId}/documents`, {
        documentId: id,
        data,
        permissions: PERMISSIONS,
      });
    }
    console.log(`  + ${collectionId}: ${rows.length} kayıt`);
  }
}

async function main() {
  console.log(`Appwrite: ${ENDPOINT}\nProje: ${PROJECT_ID}\nVeritabanı: ${DATABASE_ID}\n`);

  await ensure(`veritabanı ${DATABASE_ID}`, () =>
    api('POST', '/databases', { databaseId: DATABASE_ID, name: 'Proje Takip', enabled: true }),
  );

  for (const collection of SCHEMA) {
    console.log(`\n${collection.id} — ${collection.name}`);

    await ensure(`koleksiyon ${collection.id}`, () =>
      api('POST', `/databases/${DATABASE_ID}/collections`, {
        collectionId: collection.id,
        name: collection.name,
        permissions: PERMISSIONS,
        documentSecurity: false,
        enabled: true,
      }),
    );

    for (const attribute of collection.attributes) {
      await ensure(`alan ${attribute.key}`, () => createAttribute(collection.id, attribute));
    }

    await waitForAttributes(collection.id);

    for (const index of collection.indexes) {
      await ensure(`index ${index.key}`, () =>
        api('POST', `/databases/${DATABASE_ID}/collections/${collection.id}/indexes`, {
          key: index.key,
          type: index.type,
          attributes: index.attributes,
        }),
      );
    }
  }

  if (WITH_SEED) await seedCollections();

  console.log('\nHazır. web/.env içine şunları yaz:');
  console.log(`  VITE_APPWRITE_ENDPOINT=${ENDPOINT}`);
  console.log(`  VITE_APPWRITE_PROJECT_ID=${PROJECT_ID}`);
  console.log(`  VITE_APPWRITE_DATABASE_ID=${DATABASE_ID}`);
}

main().catch((error) => {
  console.error(`\nHata: ${error.message}${error.type ? ` (${error.type})` : ''}`);
  process.exit(1);
});
