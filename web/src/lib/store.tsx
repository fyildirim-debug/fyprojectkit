import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  AppwriteRepo,
  LocalRepo,
  addItem as addItemService,
  approveItem as approveItemService,
  closeItem as closeItemService,
  deleteRelease as deleteReleaseService,
  unapproveItem as unapproveItemService,
  publishRelease as publishReleaseService,
  reopenItem as reopenItemService,
  type AddItemInput,
  type DeleteReleaseResult,
  type ChangeEntry,
  type Credential,
  type Item,
  type Link,
  type McpClient,
  type McpConfig,
  type McpLog,
  type Note,
  type NoteImportance,
  type Project,
  type Release,
  type TakipRepo,
  type TimeEntry,
} from '@takip/shared';
import { appwriteConfigured, createBrowserGateway } from './appwrite';

/** Tek bir yerden tüm koleksiyonları tutar; yazma işlemlerinden sonra hepsini tazeler. */
interface Snapshot {
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

const EMPTY: Snapshot = {
  projects: [],
  items: [],
  notes: [],
  releases: [],
  changeEntries: [],
  credentials: [],
  links: [],
  timeEntries: [],
  mcpConfigs: [],
  mcpClients: [],
  mcpLogs: [],
};

interface StoreValue extends Snapshot {
  repo: TakipRepo;
  loading: boolean;
  error: string | null;
  /** Appwrite bağlıysa false; yerel modda arayüzde uyarı gösterilir. */
  localMode: boolean;
  reload: () => Promise<void>;
  addItem: (input: AddItemInput) => Promise<Item>;
  closeItem: (itemId: string) => Promise<void>;
  reopenItem: (itemId: string) => Promise<void>;
  updateItem: (id: string, patch: Partial<Item>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  approveItem: (id: string) => Promise<void>;
  unapproveItem: (id: string) => Promise<void>;
  addNote: (
    projectId: string,
    body: string,
    context?: string,
    importance?: NoteImportance,
  ) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  publishRelease: (releaseId: string) => Promise<void>;
  deleteRelease: (releaseId: string) => Promise<DeleteReleaseResult>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  createProject: (input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Project>;
  addCredential: (input: Omit<Credential, 'id'>) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;
  addLink: (input: Omit<Link, 'id'>) => Promise<void>;
  deleteLink: (id: string) => Promise<void>;
  addTimeEntry: (input: Omit<TimeEntry, 'id'>) => Promise<void>;
  updateMcpConfig: (id: string, patch: Partial<McpConfig>) => Promise<void>;
  upsertMcpConfig: (input: Omit<McpConfig, 'id'>) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

function createRepo(): { repo: TakipRepo; localMode: boolean } {
  if (appwriteConfigured) {
    try {
      return { repo: new AppwriteRepo(createBrowserGateway()), localMode: false };
    } catch {
      // Yapılandırma bozuksa uygulamayı kilitlemek yerine yerel moda düş.
    }
  }
  return { repo: new LocalRepo(window.localStorage), localMode: true };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [{ repo, localMode }] = useState(createRepo);
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [
        projects,
        items,
        notes,
        releases,
        changeEntries,
        credentials,
        links,
        timeEntries,
        mcpConfigs,
        mcpClients,
        mcpLogs,
      ] = await Promise.all([
        repo.listProjects(),
        repo.listItems(),
        repo.listNotes(),
        repo.listReleases(),
        repo.listChangeEntries(),
        repo.listCredentials(),
        repo.listLinks(),
        repo.listTimeEntries(),
        repo.listMcpConfigs(),
        repo.listMcpClients(),
        repo.listMcpLogs(undefined, 100),
      ]);
      setData({
        projects,
        items,
        notes,
        releases,
        changeEntries,
        credentials,
        links,
        timeEntries,
        mcpConfigs,
        mcpClients,
        mcpLogs,
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Veri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * Veri panelden başka yerlerden de değişiyor — MCP sunucusu üzerinden yapay
   * zeka kayıt açıyor, başka bir sekme düzenliyor. Sayfayı elle yenilemek
   * gerekmesin diye düzenli tazeleriz. Sekme arkadayken durur, öne gelince
   * hemen bir tur atar; boşuna istek gitmez.
   */
  useEffect(() => {
    let timer: number | undefined;

    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };

    const start = () => {
      stop();
      timer = window.setInterval(() => void reload(), 15_000);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void reload();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [reload]);

  const value = useMemo<StoreValue>(() => {
    /** Her yazma sonrası tek noktadan tazeleme — tutarsız ara durum kalmasın. */
    const after = async <T,>(work: Promise<T>): Promise<T> => {
      const result = await work;
      await reload();
      return result;
    };

    return {
      ...data,
      repo,
      loading,
      error,
      localMode,
      reload,
      addItem: (input) => after(addItemService(repo, input)),
      closeItem: async (itemId) => {
        await after(closeItemService(repo, itemId));
      },
      reopenItem: async (itemId) => {
        await after(reopenItemService(repo, itemId));
      },
      updateItem: async (id, patch) => {
        await after(repo.updateItem(id, patch));
      },
      deleteItem: async (id) => {
        await after(repo.deleteItem(id));
      },
      approveItem: async (id) => {
        await after(approveItemService(repo, id));
      },
      unapproveItem: async (id) => {
        await after(unapproveItemService(repo, id));
      },
      addNote: async (projectId, body, context = 'not', importance = 'normal') => {
        await after(
          repo.createNote({
            projectId,
            body,
            context,
            importance,
            createdAt: new Date().toISOString(),
          }),
        );
      },
      deleteNote: async (id) => {
        await after(repo.deleteNote(id));
      },
      publishRelease: async (releaseId) => {
        await after(publishReleaseService(repo, releaseId));
      },
      deleteRelease: (releaseId) => after(deleteReleaseService(repo, releaseId)),
      updateProject: async (id, patch) => {
        await after(repo.updateProject(id, patch));
      },
      createProject: (input) => after(repo.createProject(input)),
      addCredential: async (input) => {
        await after(repo.createCredential(input));
      },
      deleteCredential: async (id) => {
        await after(repo.deleteCredential(id));
      },
      addLink: async (input) => {
        await after(repo.createLink(input));
      },
      deleteLink: async (id) => {
        await after(repo.deleteLink(id));
      },
      addTimeEntry: async (input) => {
        await after(repo.createTimeEntry(input));
      },
      updateMcpConfig: async (id, patch) => {
        await after(repo.updateMcpConfig(id, patch));
      },
      upsertMcpConfig: async (input) => {
        await after(repo.upsertMcpConfig(input));
      },
    };
  }, [data, repo, loading, error, localMode, reload]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore, StoreProvider içinde kullanılmalı.');
  return value;
}
