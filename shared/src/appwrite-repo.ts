import { runPooled } from './pool.js';
import type { TakipRepo } from './repo.js';
import type {
  ChangeEntry,
  Credential,
  Item,
  Link,
  McpClient,
  McpConfig,
  McpLog,
  McpToolName,
  Note,
  Project,
  Release,
  TimeEntry,
} from './types.js';

/** Appwrite koleksiyon kimlikleri — `scripts/setup-appwrite.mjs` bunları oluşturur. */
export const COLLECTIONS = {
  projects: 'projects',
  items: 'items',
  notes: 'notes',
  releases: 'releases',
  changeEntries: 'change_entries',
  credentials: 'credentials',
  links: 'links',
  timeEntries: 'time_entries',
  mcpConfigs: 'mcp_configs',
  mcpClients: 'mcp_clients',
  mcpLogs: 'mcp_logs',
} as const;

export type CollectionId = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export type AppwriteDoc = Record<string, unknown> & { $id: string };

/**
 * Appwrite SDK'sının ince sarmalayıcısı. Tarayıcıda `appwrite`, sunucuda
 * `node-appwrite` paketi kullanıldığı için ortak katman bu arayüzü görür.
 */
export interface DocumentsGateway {
  list(collection: CollectionId, queries?: string[]): Promise<AppwriteDoc[]>;
  create(collection: CollectionId, data: Record<string, unknown>): Promise<AppwriteDoc>;
  update(
    collection: CollectionId,
    id: string,
    data: Record<string, unknown>,
  ): Promise<AppwriteDoc>;
  remove(collection: CollectionId, id: string): Promise<void>;
  /** `Query.equal('projectId', value)` gibi bir sorgu dizesi üretir. */
  equal(field: string, value: string): string;
  orderDesc(field: string): string;
  limit(count: number): string;

  /**
   * Sorguya uyan kayıtları tek istekte siler/günceller. Appwrite'ın toplu
   * uçları; yüzlerce kaydı tek tek göndermek hız sınırına takılıyor.
   * Uygulamada yoksa `TakipRepo` tek tek yapmaya düşer.
   */
  removeMany?(collection: CollectionId, queries: string[]): Promise<void>;
  updateMany?(
    collection: CollectionId,
    queries: string[],
    data: Record<string, unknown>,
  ): Promise<void>;
}

const str = (doc: AppwriteDoc, key: string, fallback = ''): string =>
  typeof doc[key] === 'string' ? (doc[key] as string) : fallback;

const num = (doc: AppwriteDoc, key: string, fallback = 0): number =>
  typeof doc[key] === 'number' ? (doc[key] as number) : fallback;

const bool = (doc: AppwriteDoc, key: string, fallback = false): boolean =>
  typeof doc[key] === 'boolean' ? (doc[key] as boolean) : fallback;

const nullableStr = (doc: AppwriteDoc, key: string): string | null =>
  typeof doc[key] === 'string' && doc[key] !== '' ? (doc[key] as string) : null;

/** Appwrite'a `undefined` gönderilemez; boş alanlar atılır. */
function compact(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

const toProject = (doc: AppwriteDoc): Project => ({
  id: doc.$id,
  slug: str(doc, 'slug'),
  name: str(doc, 'name'),
  subtitle: str(doc, 'subtitle'),
  status: (str(doc, 'status', 'gelistirme') as Project['status']),
  progress: num(doc, 'progress'),
  version: str(doc, 'version', 'v0.1.0'),
  startDate: str(doc, 'startDate'),
  server: str(doc, 'server'),
  domain: str(doc, 'domain'),
  sslStatus: str(doc, 'sslStatus'),
  sslDays: typeof doc.sslDays === 'number' ? doc.sslDays : null,
  dns: str(doc, 'dns'),
  mcpEnabled: bool(doc, 'mcpEnabled'),
  createdAt: str(doc, 'createdAt', str(doc, '$createdAt')),
  updatedAt: str(doc, 'updatedAt', str(doc, '$updatedAt')),
});

const toItem = (doc: AppwriteDoc): Item => ({
  id: doc.$id,
  projectId: str(doc, 'projectId'),
  refNo: num(doc, 'refNo'),
  type: (str(doc, 'type', 'bug') as Item['type']),
  title: str(doc, 'title'),
  description: str(doc, 'description'),
  priority: (str(doc, 'priority', 'orta') as Item['priority']),
  status: (str(doc, 'status', 'open') as Item['status']),
  reporter: str(doc, 'reporter'),
  tag: str(doc, 'tag'),
  createdAt: str(doc, 'createdAt', str(doc, '$createdAt')),
  doneAt: nullableStr(doc, 'doneAt'),
  releaseVersion: nullableStr(doc, 'releaseVersion'),
});

const toNote = (doc: AppwriteDoc): Note => ({
  id: doc.$id,
  projectId: str(doc, 'projectId'),
  body: str(doc, 'body'),
  context: str(doc, 'context'),
  // Alan eklenmeden önce yazılmış notlar `normal` sayılır.
  importance: str(doc, 'importance', 'normal') as Note['importance'],
  createdAt: str(doc, 'createdAt', str(doc, '$createdAt')),
});

const toRelease = (doc: AppwriteDoc): Release => ({
  id: doc.$id,
  projectId: str(doc, 'projectId'),
  version: str(doc, 'version'),
  date: str(doc, 'date'),
  status: (str(doc, 'status', 'draft') as Release['status']),
  createdAt: str(doc, 'createdAt', str(doc, '$createdAt')),
});

const toChangeEntry = (doc: AppwriteDoc): ChangeEntry => ({
  id: doc.$id,
  projectId: str(doc, 'projectId'),
  releaseId: str(doc, 'releaseId'),
  kind: (str(doc, 'kind', 'fix') as ChangeEntry['kind']),
  text: str(doc, 'text'),
  refNo: typeof doc.refNo === 'number' ? doc.refNo : null,
  createdAt: str(doc, 'createdAt', str(doc, '$createdAt')),
});

const toCredential = (doc: AppwriteDoc): Credential => ({
  id: doc.$id,
  projectId: str(doc, 'projectId'),
  service: str(doc, 'service'),
  username: str(doc, 'username'),
  secret: str(doc, 'secret'),
  twoFactor: (str(doc, 'twoFactor', 'none') as Credential['twoFactor']),
  color: str(doc, 'color', '#3B82F6'),
  updatedAt: str(doc, 'updatedAt', str(doc, '$updatedAt')),
});

const toLink = (doc: AppwriteDoc): Link => ({
  id: doc.$id,
  projectId: str(doc, 'projectId'),
  label: str(doc, 'label'),
  url: str(doc, 'url'),
  kind: (str(doc, 'kind', 'other') as Link['kind']),
});

const toTimeEntry = (doc: AppwriteDoc): TimeEntry => ({
  id: doc.$id,
  projectId: str(doc, 'projectId'),
  itemId: nullableStr(doc, 'itemId'),
  startedAt: str(doc, 'startedAt'),
  endedAt: nullableStr(doc, 'endedAt'),
  minutes: num(doc, 'minutes'),
  note: str(doc, 'note'),
});

const toMcpConfig = (doc: AppwriteDoc): McpConfig => ({
  id: doc.$id,
  projectId: str(doc, 'projectId'),
  enabled: bool(doc, 'enabled', true),
  token: str(doc, 'token'),
  enabledTools: Array.isArray(doc.enabledTools) ? (doc.enabledTools as McpToolName[]) : [],
  autoApply: bool(doc, 'autoApply'),
  createdAt: str(doc, 'createdAt', str(doc, '$createdAt')),
});

const toMcpClient = (doc: AppwriteDoc): McpClient => ({
  id: doc.$id,
  projectId: str(doc, 'projectId'),
  name: str(doc, 'name'),
  mode: (str(doc, 'mode', 'read') as McpClient['mode']),
  lastSeenAt: str(doc, 'lastSeenAt', str(doc, '$updatedAt')),
});

const toMcpLog = (doc: AppwriteDoc): McpLog => ({
  id: doc.$id,
  projectId: str(doc, 'projectId'),
  tool: (str(doc, 'tool', 'list_bugs') as McpToolName),
  summary: str(doc, 'summary'),
  client: str(doc, 'client'),
  createdAt: str(doc, 'createdAt', str(doc, '$createdAt')),
});

/** Domain nesnesinden Appwrite belgesine — `id` alanı belge kimliğidir, gövdeye yazılmaz. */
function body(input: object): Record<string, unknown> {
  const { id: _ignored, ...rest } = input as Record<string, unknown>;
  return compact(rest);
}

export class AppwriteRepo implements TakipRepo {
  constructor(private readonly gw: DocumentsGateway) {}

  private byProject(projectId?: string): string[] {
    return projectId ? [this.gw.equal('projectId', projectId), this.gw.limit(500)] : [this.gw.limit(500)];
  }

  async listProjects(): Promise<Project[]> {
    return (await this.gw.list(COLLECTIONS.projects, [this.gw.limit(200)])).map(toProject);
  }

  async getProject(id: string): Promise<Project | null> {
    return (await this.listProjects()).find((project) => project.id === id) ?? null;
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    const docs = await this.gw.list(COLLECTIONS.projects, [this.gw.equal('slug', slug), this.gw.limit(1)]);
    return docs[0] ? toProject(docs[0]) : null;
  }

  async createProject(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const stamp = new Date().toISOString();
    return toProject(
      await this.gw.create(COLLECTIONS.projects, { ...input, createdAt: stamp, updatedAt: stamp }),
    );
  }

  async updateProject(id: string, patch: Partial<Project>): Promise<Project> {
    return toProject(
      await this.gw.update(COLLECTIONS.projects, id, {
        ...body(patch),
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  async listItems(projectId?: string): Promise<Item[]> {
    return (await this.gw.list(COLLECTIONS.items, this.byProject(projectId))).map(toItem);
  }

  async getItem(id: string): Promise<Item | null> {
    const docs = await this.gw.list(COLLECTIONS.items, [this.gw.limit(500)]);
    const hit = docs.find((doc) => doc.$id === id);
    return hit ? toItem(hit) : null;
  }

  async createItem(input: Omit<Item, 'id'>): Promise<Item> {
    return toItem(await this.gw.create(COLLECTIONS.items, body(input)));
  }

  async updateItem(id: string, patch: Partial<Item>): Promise<Item> {
    return toItem(await this.gw.update(COLLECTIONS.items, id, body(patch)));
  }

  async deleteItem(id: string): Promise<void> {
    await this.gw.remove(COLLECTIONS.items, id);
  }

  async listNotes(projectId?: string): Promise<Note[]> {
    return (await this.gw.list(COLLECTIONS.notes, this.byProject(projectId))).map(toNote);
  }

  async createNote(input: Omit<Note, 'id'>): Promise<Note> {
    return toNote(await this.gw.create(COLLECTIONS.notes, body(input)));
  }

  async deleteNote(id: string): Promise<void> {
    await this.gw.remove(COLLECTIONS.notes, id);
  }

  async listReleases(projectId?: string): Promise<Release[]> {
    return (await this.gw.list(COLLECTIONS.releases, this.byProject(projectId))).map(toRelease);
  }

  async createRelease(input: Omit<Release, 'id'>): Promise<Release> {
    return toRelease(await this.gw.create(COLLECTIONS.releases, body(input)));
  }

  async updateRelease(id: string, patch: Partial<Release>): Promise<Release> {
    return toRelease(await this.gw.update(COLLECTIONS.releases, id, body(patch)));
  }

  async deleteRelease(id: string): Promise<void> {
    await this.gw.remove(COLLECTIONS.releases, id);
  }

  async deleteChangeEntry(id: string): Promise<void> {
    await this.gw.remove(COLLECTIONS.changeEntries, id);
  }

  /**
   * Toplu uç istek başına 100 kayıt işler, o yüzden kalmayana kadar dönülür.
   * Tur sınırı sonsuz döngüye karşı.
   */
  private async sweep(
    collection: CollectionId,
    queries: string[],
    work: (queries: string[]) => Promise<void>,
  ): Promise<void> {
    for (let round = 0; round < 100; round += 1) {
      const remaining = await this.gw.list(collection, [...queries, this.gw.limit(1)]);
      if (remaining.length === 0) return;
      await work([...queries, this.gw.limit(100)]);
    }
    throw new Error('Toplu işlem bitmedi — kayıt sayısı beklenenden fazla.');
  }

  async deleteChangeEntriesOfRelease(projectId: string, releaseId: string): Promise<void> {
    const scope = [this.gw.equal('projectId', projectId), this.gw.equal('releaseId', releaseId)];

    if (this.gw.removeMany) {
      const removeMany = this.gw.removeMany.bind(this.gw);
      await this.sweep(COLLECTIONS.changeEntries, scope, (queries) =>
        removeMany(COLLECTIONS.changeEntries, queries),
      );
      return;
    }

    const docs = await this.gw.list(COLLECTIONS.changeEntries, [...scope, this.gw.limit(500)]);
    await runPooled(docs.map((doc) => () => this.gw.remove(COLLECTIONS.changeEntries, doc.$id)));
  }

  async detachItemsFromRelease(projectId: string, version: string): Promise<void> {
    const scope = [this.gw.equal('projectId', projectId), this.gw.equal('releaseVersion', version)];

    if (this.gw.updateMany) {
      const updateMany = this.gw.updateMany.bind(this.gw);
      await this.sweep(COLLECTIONS.items, scope, (queries) =>
        updateMany(COLLECTIONS.items, queries, { releaseVersion: null }),
      );
      return;
    }

    const docs = await this.gw.list(COLLECTIONS.items, [...scope, this.gw.limit(500)]);
    await runPooled(
      docs.map(
        (doc) => () => this.gw.update(COLLECTIONS.items, doc.$id, { releaseVersion: null }),
      ),
    );
  }

  async listChangeEntries(projectId?: string): Promise<ChangeEntry[]> {
    return (await this.gw.list(COLLECTIONS.changeEntries, this.byProject(projectId))).map(
      toChangeEntry,
    );
  }

  async createChangeEntry(input: Omit<ChangeEntry, 'id'>): Promise<ChangeEntry> {
    return toChangeEntry(await this.gw.create(COLLECTIONS.changeEntries, body(input)));
  }

  async listCredentials(projectId?: string): Promise<Credential[]> {
    return (await this.gw.list(COLLECTIONS.credentials, this.byProject(projectId))).map(toCredential);
  }

  async createCredential(input: Omit<Credential, 'id'>): Promise<Credential> {
    return toCredential(await this.gw.create(COLLECTIONS.credentials, body(input)));
  }

  async updateCredential(id: string, patch: Partial<Credential>): Promise<Credential> {
    return toCredential(
      await this.gw.update(COLLECTIONS.credentials, id, {
        ...body(patch),
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  async deleteCredential(id: string): Promise<void> {
    await this.gw.remove(COLLECTIONS.credentials, id);
  }

  async listLinks(projectId?: string): Promise<Link[]> {
    return (await this.gw.list(COLLECTIONS.links, this.byProject(projectId))).map(toLink);
  }

  async createLink(input: Omit<Link, 'id'>): Promise<Link> {
    return toLink(await this.gw.create(COLLECTIONS.links, body(input)));
  }

  async deleteLink(id: string): Promise<void> {
    await this.gw.remove(COLLECTIONS.links, id);
  }

  async listTimeEntries(projectId?: string): Promise<TimeEntry[]> {
    return (await this.gw.list(COLLECTIONS.timeEntries, this.byProject(projectId))).map(toTimeEntry);
  }

  async createTimeEntry(input: Omit<TimeEntry, 'id'>): Promise<TimeEntry> {
    return toTimeEntry(await this.gw.create(COLLECTIONS.timeEntries, body(input)));
  }

  async updateTimeEntry(id: string, patch: Partial<TimeEntry>): Promise<TimeEntry> {
    return toTimeEntry(await this.gw.update(COLLECTIONS.timeEntries, id, body(patch)));
  }

  async listMcpConfigs(): Promise<McpConfig[]> {
    return (await this.gw.list(COLLECTIONS.mcpConfigs, [this.gw.limit(200)])).map(toMcpConfig);
  }

  async getMcpConfig(projectId: string): Promise<McpConfig | null> {
    const docs = await this.gw.list(COLLECTIONS.mcpConfigs, [
      this.gw.equal('projectId', projectId),
      this.gw.limit(1),
    ]);
    return docs[0] ? toMcpConfig(docs[0]) : null;
  }

  async upsertMcpConfig(input: Omit<McpConfig, 'id'>): Promise<McpConfig> {
    const existing = await this.getMcpConfig(input.projectId);
    if (existing) return this.updateMcpConfig(existing.id, input);
    return toMcpConfig(await this.gw.create(COLLECTIONS.mcpConfigs, body(input)));
  }

  async updateMcpConfig(id: string, patch: Partial<McpConfig>): Promise<McpConfig> {
    return toMcpConfig(await this.gw.update(COLLECTIONS.mcpConfigs, id, body(patch)));
  }

  async listMcpClients(projectId?: string): Promise<McpClient[]> {
    return (await this.gw.list(COLLECTIONS.mcpClients, this.byProject(projectId))).map(toMcpClient);
  }

  async upsertMcpClient(input: Omit<McpClient, 'id'>): Promise<McpClient> {
    const existing = (await this.listMcpClients(input.projectId)).find(
      (client) => client.name === input.name,
    );
    if (existing) {
      return toMcpClient(await this.gw.update(COLLECTIONS.mcpClients, existing.id, body(input)));
    }
    return toMcpClient(await this.gw.create(COLLECTIONS.mcpClients, body(input)));
  }

  async listMcpLogs(projectId?: string, limit = 50): Promise<McpLog[]> {
    const queries = projectId
      ? [this.gw.equal('projectId', projectId), this.gw.orderDesc('createdAt'), this.gw.limit(limit)]
      : [this.gw.orderDesc('createdAt'), this.gw.limit(limit)];
    return (await this.gw.list(COLLECTIONS.mcpLogs, queries)).map(toMcpLog);
  }

  async createMcpLog(input: Omit<McpLog, 'id'>): Promise<McpLog> {
    return toMcpLog(await this.gw.create(COLLECTIONS.mcpLogs, body(input)));
  }
}
