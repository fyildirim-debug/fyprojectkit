/** Ortak alan modeli — web arayüzü ve MCP sunucusu aynı tipleri kullanır. */

export const PROJECT_STATUSES = [
  'teklif',
  'gelistirme',
  'test',
  'canli',
  'beklemede',
  'arsiv',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  teklif: 'Teklif',
  gelistirme: 'Geliştirme',
  test: 'Test',
  canli: 'Canlı',
  beklemede: 'Beklemede',
  arsiv: 'Arşiv',
};

export const PRIORITIES = ['cok_onemli', 'kritik', 'yuksek', 'orta', 'dusuk', 'istek'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  cok_onemli: 'Çok önemli',
  kritik: 'Kritik',
  yuksek: 'Yüksek',
  orta: 'Orta',
  dusuk: 'Düşük',
  istek: 'İstek',
};

/** Yüksekten düşüğe sıralama ağırlığı — MCP `list_bugs` ve tablo sıralaması kullanır. */
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  cok_onemli: 5,
  kritik: 4,
  yuksek: 3,
  orta: 2,
  dusuk: 1,
  istek: 0,
};

export type ItemType = 'bug' | 'task';
/**
 * `planned` bir öneridir, iş değildir: yapay zeka buraya yazar, yönetici
 * onaylayınca `open` olur. İşe `open`'dan başlanır.
 */
export type ItemStatus = 'planned' | 'open' | 'done';

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  planned: 'Planlanan',
  open: 'Yapılacak',
  done: 'Yapıldı',
};

export interface Project {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  status: ProjectStatus;
  progress: number;
  version: string;
  startDate: string;
  server: string;
  domain: string;
  sslStatus: string;
  sslDays: number | null;
  dns: string;
  mcpEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
  projectId: string;
  /** Proje içinde artan sıra numarası — changelog'da `#126` olarak görünür. */
  refNo: number;
  type: ItemType;
  title: string;
  description: string;
  priority: Priority;
  status: ItemStatus;
  reporter: string;
  tag: string;
  createdAt: string;
  doneAt: string | null;
  /** Kapatıldığında düştüğü sürüm — changelog bağlantısı. */
  releaseVersion: string | null;
}

export const NOTE_IMPORTANCES = ['cok_onemli', 'normal', 'az_onemli'] as const;
export type NoteImportance = (typeof NOTE_IMPORTANCES)[number];

export const NOTE_IMPORTANCE_LABELS: Record<NoteImportance, string> = {
  cok_onemli: 'Çok önemli',
  normal: 'Normal',
  az_onemli: 'Az önemli',
};

/** Önemliden önemsize sıralama ağırlığı — not listesi ve MCP `list_notes` kullanır. */
export const NOTE_IMPORTANCE_WEIGHT: Record<NoteImportance, number> = {
  cok_onemli: 2,
  normal: 1,
  az_onemli: 0,
};

export interface Note {
  id: string;
  projectId: string;
  body: string;
  context: string;
  importance: NoteImportance;
  createdAt: string;
}

export type ReleaseStatus = 'draft' | 'released';

export interface Release {
  id: string;
  projectId: string;
  version: string;
  date: string;
  status: ReleaseStatus;
  createdAt: string;
}

export const CHANGE_KINDS = ['fix', 'new', 'improve', 'removed'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
  fix: 'Düzeltme',
  new: 'Yeni',
  improve: 'İyileşme',
  removed: 'Kaldırıldı',
};

export interface ChangeEntry {
  id: string;
  projectId: string;
  releaseId: string;
  kind: ChangeKind;
  text: string;
  /** Kaynak maddenin `refNo`'su — otomatik düşen kayıtlarda dolu. */
  refNo: number | null;
  createdAt: string;
}

export type TwoFactorState = 'active' | 'none' | 'expiring';

export interface Credential {
  id: string;
  projectId: string;
  service: string;
  username: string;
  secret: string;
  twoFactor: TwoFactorState;
  color: string;
  updatedAt: string;
}

export type LinkKind = 'live' | 'repo' | 'panel' | 'console' | 'other';

export const LINK_KIND_COLORS: Record<LinkKind, string> = {
  live: '#22c55e',
  repo: '#3B82F6',
  panel: '#a855f7',
  console: '#f59e0b',
  other: '#8b9199',
};

export interface Link {
  id: string;
  projectId: string;
  label: string;
  url: string;
  kind: LinkKind;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  itemId: string | null;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  note: string;
}

export const MCP_TOOL_NAMES = [
  'list_bugs',
  'get_bug',
  'add_bug',
  'update_status',
  'add_note',
  'get_changelog',
  'add_plan',
  'list_plans',
  'update_plan',
  'delete_plan',
  'approve_plan',
  'list_notes',
  'search',
  'project_status',
  'update_bug',
  'reopen_bug',
  'log_time',
  'add_release',
  'add_done_items',
  'add_changelog_entries',
  'set_project_version',
  'publish_release',
  'get_credentials',
  'delete_item',
  'delete_release',
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export interface McpToolMeta {
  name: McpToolName;
  description: string;
  access: 'read' | 'write' | 'secret' | 'risky';
  /** Kapalı doğan araçlar — açmak bilinçli bir karar olmalı. */
  defaultEnabled: boolean;
}

export const MCP_TOOL_CATALOG: McpToolMeta[] = [
  {
    name: 'list_bugs',
    description: 'Açık hataları önceliğe göre listeler',
    access: 'read',
    defaultEnabled: true,
  },
  {
    name: 'get_bug',
    description: 'Tek hatanın detayı, yorumları, ilgili notlar',
    access: 'read',
    defaultEnabled: true,
  },
  {
    name: 'add_bug',
    description: 'Yeni hata veya iş kaydı açar',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'update_status',
    description: "Yapıldı işaretler, changelog'a düşürür",
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'add_note',
    description: 'Projeye not yazar, önem derecesi verir',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'get_changelog',
    description: 'Sürüm geçmişini okur',
    access: 'read',
    defaultEnabled: true,
  },
  {
    name: 'add_plan',
    description: 'Planlanan öneri yazar — onay bekler, iş listesine düşmez',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'list_plans',
    description: 'Onay bekleyen planları okur',
    access: 'read',
    defaultEnabled: true,
  },
  {
    name: 'update_plan',
    description: 'Onay bekleyen planı düzenler',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'delete_plan',
    description: 'Onay bekleyen planı siler — onaylanmışa dokunmaz',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'approve_plan',
    description: 'Planı yapılacağa çevirir — onay yöneticinin, kapalı',
    access: 'risky',
    defaultEnabled: false,
  },
  {
    name: 'list_notes',
    description: 'Notları okur, önem derecesine göre süzer',
    access: 'read',
    defaultEnabled: true,
  },
  {
    name: 'search',
    description: 'Hata, iş, not ve changelog içinde arar',
    access: 'read',
    defaultEnabled: true,
  },
  {
    name: 'project_status',
    description: 'Projenin durumu, sürümü, açık kayıt sayıları',
    access: 'read',
    defaultEnabled: true,
  },
  {
    name: 'update_bug',
    description: 'Var olan kaydın başlığını, önceliğini, etiketini düzenler',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'reopen_bug',
    description: 'Kapatılmış kaydı yeniden açar',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'log_time',
    description: 'Projeye harcanan süreyi kaydeder',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'add_release',
    description: 'Geçmişe dönük sürüm + changelog satırları yazar',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'add_done_items',
    description: 'Geçmişte çözülmüş kayıtları tarihleriyle toplu yazar',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'add_changelog_entries',
    description: 'Var olan bir sürüme changelog satırı ekler',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'set_project_version',
    description: 'Projenin görünen sürüm numarasını belirler',
    access: 'write',
    defaultEnabled: true,
  },
  {
    name: 'publish_release',
    description: 'Taslak sürümü yayına alır — kapalı',
    access: 'risky',
    defaultEnabled: false,
  },
  {
    name: 'get_credentials',
    description: 'Şifre ve erişim bilgileri — kapalı',
    access: 'secret',
    defaultEnabled: false,
  },
  {
    name: 'delete_item',
    description: 'Kayıt silme — kapalı',
    access: 'risky',
    defaultEnabled: false,
  },
  {
    name: 'delete_release',
    description: 'Sürüm ve changelog satırlarını silme — kapalı',
    access: 'risky',
    defaultEnabled: false,
  },
];

export interface McpConfig {
  id: string;
  projectId: string;
  enabled: boolean;
  token: string;
  enabledTools: McpToolName[];
  autoApply: boolean;
  createdAt: string;
}

export interface McpClient {
  id: string;
  projectId: string;
  name: string;
  mode: 'read' | 'readwrite';
  lastSeenAt: string;
}

export interface McpLog {
  id: string;
  projectId: string;
  tool: McpToolName;
  summary: string;
  client: string;
  createdAt: string;
}

/** Ana ekranın ve giriş ekranının beslendiği türetilmiş sayaçlar. */
export interface ProjectStats {
  openBugs: number;
  openTasks: number;
  doneThisWeek: number;
  notes: number;
  minutes: number;
  lastActivityAt: string | null;
}
