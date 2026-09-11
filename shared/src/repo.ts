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

/**
 * Veri erişiminin tek arayüzü. İki uygulaması var:
 * `AppwriteRepo` (gerçek backend) ve `LocalRepo` (tarayıcıda localStorage / bellek).
 * Web arayüzü ve MCP sunucusu yalnızca bu arayüzü tanır.
 */
export interface TakipRepo {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  getProjectBySlug(slug: string): Promise<Project | null>;
  createProject(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project>;

  listItems(projectId?: string): Promise<Item[]>;
  getItem(id: string): Promise<Item | null>;
  createItem(input: Omit<Item, 'id'>): Promise<Item>;
  updateItem(id: string, patch: Partial<Item>): Promise<Item>;
  deleteItem(id: string): Promise<void>;

  listNotes(projectId?: string): Promise<Note[]>;
  createNote(input: Omit<Note, 'id'>): Promise<Note>;
  deleteNote(id: string): Promise<void>;

  listReleases(projectId?: string): Promise<Release[]>;
  createRelease(input: Omit<Release, 'id'>): Promise<Release>;
  updateRelease(id: string, patch: Partial<Release>): Promise<Release>;
  deleteRelease(id: string): Promise<void>;

  listChangeEntries(projectId?: string): Promise<ChangeEntry[]>;
  createChangeEntry(input: Omit<ChangeEntry, 'id'>): Promise<ChangeEntry>;
  deleteChangeEntry(id: string): Promise<void>;

  /**
   * Sürüm silmenin iki ağır adımı. Uygulama toplu yapabiliyorsa bunları
   * tanımlar; tanımlamazsa `deleteRelease` kayıtları tek tek işler.
   */
  deleteChangeEntriesOfRelease?(projectId: string, releaseId: string): Promise<void>;
  detachItemsFromRelease?(projectId: string, version: string): Promise<void>;

  listCredentials(projectId?: string): Promise<Credential[]>;
  createCredential(input: Omit<Credential, 'id'>): Promise<Credential>;
  updateCredential(id: string, patch: Partial<Credential>): Promise<Credential>;
  deleteCredential(id: string): Promise<void>;

  listLinks(projectId?: string): Promise<Link[]>;
  createLink(input: Omit<Link, 'id'>): Promise<Link>;
  deleteLink(id: string): Promise<void>;

  listTimeEntries(projectId?: string): Promise<TimeEntry[]>;
  createTimeEntry(input: Omit<TimeEntry, 'id'>): Promise<TimeEntry>;
  updateTimeEntry(id: string, patch: Partial<TimeEntry>): Promise<TimeEntry>;

  listMcpConfigs(): Promise<McpConfig[]>;
  getMcpConfig(projectId: string): Promise<McpConfig | null>;
  upsertMcpConfig(input: Omit<McpConfig, 'id'>): Promise<McpConfig>;
  updateMcpConfig(id: string, patch: Partial<McpConfig>): Promise<McpConfig>;

  listMcpClients(projectId?: string): Promise<McpClient[]>;
  upsertMcpClient(input: Omit<McpClient, 'id'>): Promise<McpClient>;

  listMcpLogs(projectId?: string, limit?: number): Promise<McpLog[]>;
  createMcpLog(input: Omit<McpLog, 'id'>): Promise<McpLog>;
}
