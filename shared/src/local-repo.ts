import type { TakipRepo } from './repo.js';
import { seedData } from './seed.js';
import type {
  ChangeEntry,
  Credential,
  Item,
  Link,
  McpClient,
  McpConfig,
  McpLog,
  Note,
  Project,
  Release,
  TimeEntry,
} from './types.js';

interface Tables {
  projects: Project[];
  items: Item[];
  notes: Note[];
  releases: Release[];
  changeEntries: ChangeEntry[];
  credentials: Credential[];
  links: Link[];
  timeEntries: TimeEntry[];
  mcpConfigs: McpConfig[];
  mcpClients: McpClient[];
  mcpLogs: McpLog[];
}

/** localStorage benzeri en küçük arayüz — Node tarafında bellek nesnesi de olur. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'takip.db.v1';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/**
 * Backend olmadan çalışan adaptör. Appwrite kurulmadan önce uygulamayı
 * gerçek veriymiş gibi kullanabilmek için var; kayıtlar tarayıcıda durur.
 */
export class LocalRepo implements TakipRepo {
  private data: Tables;

  constructor(private readonly store?: KeyValueStore) {
    const raw = store?.getItem(STORAGE_KEY);
    if (raw) {
      try {
        this.data = { ...clone(seedData), ...(JSON.parse(raw) as Partial<Tables>) } as Tables;
        return;
      } catch {
        // Bozuk kayıt: tohum veriye dön.
      }
    }
    this.data = clone(seedData) as Tables;
    this.persist();
  }

  /** Tohum veriyi geri yükler — arayüzdeki "verileri sıfırla" için. */
  reset(): void {
    this.data = clone(seedData) as Tables;
    this.persist();
  }

  private persist(): void {
    this.store?.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }

  private insert<K extends keyof Tables>(
    table: K,
    prefix: string,
    input: Omit<Tables[K][number], 'id'>,
  ): Tables[K][number] {
    const row = { ...(input as object), id: makeId(prefix) } as Tables[K][number];
    (this.data[table] as Tables[K][number][]).unshift(row);
    this.persist();
    return clone(row);
  }

  private patch<K extends keyof Tables>(
    table: K,
    id: string,
    changes: Partial<Tables[K][number]>,
  ): Tables[K][number] {
    const rows = this.data[table] as (Tables[K][number] & { id: string })[];
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) throw new Error(`Kayıt bulunamadı: ${String(table)}/${id}`);
    rows[index] = { ...rows[index], ...changes };
    this.persist();
    return clone(rows[index]);
  }

  private remove<K extends keyof Tables>(table: K, id: string): void {
    const rows = this.data[table] as { id: string }[];
    const index = rows.findIndex((row) => row.id === id);
    if (index !== -1) rows.splice(index, 1);
    this.persist();
  }

  private scoped<T extends { projectId: string }>(rows: T[], projectId?: string): T[] {
    return clone(projectId ? rows.filter((row) => row.projectId === projectId) : rows);
  }

  async listProjects(): Promise<Project[]> {
    return clone(this.data.projects);
  }

  async getProject(id: string): Promise<Project | null> {
    return clone(this.data.projects.find((project) => project.id === id) ?? null);
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    return clone(this.data.projects.find((project) => project.slug === slug) ?? null);
  }

  async createProject(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const stamp = new Date().toISOString();
    return this.insert('projects', 'p', { ...input, createdAt: stamp, updatedAt: stamp });
  }

  async updateProject(id: string, patch: Partial<Project>): Promise<Project> {
    return this.patch('projects', id, { ...patch, updatedAt: new Date().toISOString() });
  }

  async listItems(projectId?: string): Promise<Item[]> {
    return this.scoped(this.data.items, projectId);
  }

  async getItem(id: string): Promise<Item | null> {
    return clone(this.data.items.find((item) => item.id === id) ?? null);
  }

  async createItem(input: Omit<Item, 'id'>): Promise<Item> {
    return this.insert('items', 'i', input);
  }

  async updateItem(id: string, patch: Partial<Item>): Promise<Item> {
    return this.patch('items', id, patch);
  }

  async deleteItem(id: string): Promise<void> {
    this.remove('items', id);
  }

  async listNotes(projectId?: string): Promise<Note[]> {
    return this.scoped(this.data.notes, projectId);
  }

  async createNote(input: Omit<Note, 'id'>): Promise<Note> {
    return this.insert('notes', 'n', input);
  }

  async deleteNote(id: string): Promise<void> {
    this.remove('notes', id);
  }

  async listReleases(projectId?: string): Promise<Release[]> {
    return this.scoped(this.data.releases, projectId);
  }

  async createRelease(input: Omit<Release, 'id'>): Promise<Release> {
    return this.insert('releases', 'r', input);
  }

  async updateRelease(id: string, patch: Partial<Release>): Promise<Release> {
    return this.patch('releases', id, patch);
  }

  async deleteRelease(id: string): Promise<void> {
    this.remove('releases', id);
  }

  async listChangeEntries(projectId?: string): Promise<ChangeEntry[]> {
    return this.scoped(this.data.changeEntries, projectId);
  }

  async createChangeEntry(input: Omit<ChangeEntry, 'id'>): Promise<ChangeEntry> {
    return this.insert('changeEntries', 'c', input);
  }

  async deleteChangeEntry(id: string): Promise<void> {
    this.remove('changeEntries', id);
  }

  async deleteChangeEntriesOfRelease(projectId: string, releaseId: string): Promise<void> {
    for (const entry of this.data.changeEntries.filter(
      (row) => row.projectId === projectId && row.releaseId === releaseId,
    )) {
      this.remove('changeEntries', entry.id);
    }
  }

  async detachItemsFromRelease(projectId: string, version: string): Promise<void> {
    for (const item of this.data.items.filter(
      (row) => row.projectId === projectId && row.releaseVersion === version,
    )) {
      this.patch('items', item.id, { releaseVersion: null });
    }
  }

  async listCredentials(projectId?: string): Promise<Credential[]> {
    return this.scoped(this.data.credentials, projectId);
  }

  async createCredential(input: Omit<Credential, 'id'>): Promise<Credential> {
    return this.insert('credentials', 'cr', input);
  }

  async updateCredential(id: string, patch: Partial<Credential>): Promise<Credential> {
    return this.patch('credentials', id, patch);
  }

  async deleteCredential(id: string): Promise<void> {
    this.remove('credentials', id);
  }

  async listLinks(projectId?: string): Promise<Link[]> {
    return this.scoped(this.data.links, projectId);
  }

  async createLink(input: Omit<Link, 'id'>): Promise<Link> {
    return this.insert('links', 'l', input);
  }

  async deleteLink(id: string): Promise<void> {
    this.remove('links', id);
  }

  async listTimeEntries(projectId?: string): Promise<TimeEntry[]> {
    return this.scoped(this.data.timeEntries, projectId);
  }

  async createTimeEntry(input: Omit<TimeEntry, 'id'>): Promise<TimeEntry> {
    return this.insert('timeEntries', 't', input);
  }

  async updateTimeEntry(id: string, patch: Partial<TimeEntry>): Promise<TimeEntry> {
    return this.patch('timeEntries', id, patch);
  }

  async listMcpConfigs(): Promise<McpConfig[]> {
    return clone(this.data.mcpConfigs);
  }

  async getMcpConfig(projectId: string): Promise<McpConfig | null> {
    return clone(this.data.mcpConfigs.find((config) => config.projectId === projectId) ?? null);
  }

  async upsertMcpConfig(input: Omit<McpConfig, 'id'>): Promise<McpConfig> {
    const existing = this.data.mcpConfigs.find((config) => config.projectId === input.projectId);
    if (existing) return this.patch('mcpConfigs', existing.id, input);
    return this.insert('mcpConfigs', 'm', input);
  }

  async updateMcpConfig(id: string, patch: Partial<McpConfig>): Promise<McpConfig> {
    return this.patch('mcpConfigs', id, patch);
  }

  async listMcpClients(projectId?: string): Promise<McpClient[]> {
    return this.scoped(this.data.mcpClients, projectId);
  }

  async upsertMcpClient(input: Omit<McpClient, 'id'>): Promise<McpClient> {
    const existing = this.data.mcpClients.find(
      (client) => client.projectId === input.projectId && client.name === input.name,
    );
    if (existing) return this.patch('mcpClients', existing.id, input);
    return this.insert('mcpClients', 'mc', input);
  }

  async listMcpLogs(projectId?: string, limit = 50): Promise<McpLog[]> {
    return this.scoped(this.data.mcpLogs, projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async createMcpLog(input: Omit<McpLog, 'id'>): Promise<McpLog> {
    return this.insert('mcpLogs', 'ml', input);
  }
}
