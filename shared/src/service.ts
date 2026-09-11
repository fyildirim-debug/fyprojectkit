import type { TakipRepo } from './repo.js';
import { changeKindForItem } from './parse.js';
import { runPooled } from './pool.js';
import { compareVersions, nextDraftVersion } from './changelog.js';
import { startOfWeek } from './format.js';
import type {
  ChangeEntry,
  ChangeKind,
  Item,
  ItemStatus,
  ItemType,
  Priority,
  Project,
  ProjectStats,
  Release,
  ReleaseStatus,
} from './types.js';

/**
 * İş kuralları — web arayüzü ve MCP sunucusu ikisi de buradan geçer,
 * böylece "yapıldı işaretle → changelog'a düş" davranışı tek yerde tanımlı kalır.
 */

/** Proje içindeki bir sonraki `#refNo`. */
async function nextRefNo(repo: TakipRepo, projectId: string): Promise<number> {
  const items = await repo.listItems(projectId);
  return items.reduce((max, item) => Math.max(max, item.refNo), 100) + 1;
}

export interface AddItemInput {
  projectId: string;
  title: string;
  description?: string;
  type?: ItemType;
  priority?: Priority;
  reporter?: string;
  tag?: string;
  /** `planned` öneri olarak düşer, onay bekler. Varsayılan `open`. */
  status?: Extract<ItemStatus, 'planned' | 'open'>;
}

export async function addItem(repo: TakipRepo, input: AddItemInput): Promise<Item> {
  const title = input.title.trim();
  if (!title) throw new Error('Başlık boş olamaz.');

  return repo.createItem({
    projectId: input.projectId,
    refNo: await nextRefNo(repo, input.projectId),
    type: input.type ?? 'bug',
    title,
    description: input.description?.trim() ?? '',
    priority: input.priority ?? 'orta',
    status: input.status ?? 'open',
    reporter: input.reporter?.trim() || 'Yönetici',
    tag: input.tag?.trim().toLocaleLowerCase('tr') ?? '',
    createdAt: new Date().toISOString(),
    doneAt: null,
    releaseVersion: null,
  });
}

/** Projenin açık taslak sürümünü döndürür; yoksa bir sonraki yama sürümünü açar. */
export async function ensureDraftRelease(repo: TakipRepo, projectId: string): Promise<Release> {
  const releases = await repo.listReleases(projectId);
  const draft = releases.find((release) => release.status === 'draft');
  if (draft) return draft;

  return repo.createRelease({
    projectId,
    version: nextDraftVersion(releases),
    date: new Date().toISOString(),
    status: 'draft',
    createdAt: new Date().toISOString(),
  });
}

export interface CloseItemResult {
  item: Item;
  release: Release;
  entry: ChangeEntry;
}

/**
 * Bir maddeyi "yapıldı" işaretler ve açık taslak sürümün changelog'una düşürür.
 * Kullanıcının istediği ana akış bu: dışarıdan gelen hata → not → yapıldı → changelog.
 */
export async function closeItem(
  repo: TakipRepo,
  itemId: string,
  options: { changeText?: string } = {},
): Promise<CloseItemResult> {
  const item = await repo.getItem(itemId);
  if (!item) throw new Error(`Madde bulunamadı: ${itemId}`);
  if (item.status === 'done') throw new Error(`Madde zaten yapıldı: #${item.refNo}`);
  if (item.status === 'planned') {
    throw new Error(
      `#${item.refNo} henüz planlanan aşamasında — önce onaylanmalı, sonra yapıldı işaretlenebilir.`,
    );
  }

  const release = await ensureDraftRelease(repo, item.projectId);

  const entry = await repo.createChangeEntry({
    projectId: item.projectId,
    releaseId: release.id,
    kind: changeKindForItem(item.type, item.priority, item.title),
    text: options.changeText?.trim() || item.title,
    refNo: item.refNo,
    createdAt: new Date().toISOString(),
  });

  const updated = await repo.updateItem(itemId, {
    status: 'done',
    doneAt: new Date().toISOString(),
    releaseVersion: release.version,
  });

  return { item: updated, release, entry };
}

/**
 * Planlanan bir maddeyi onaylar — `planned` → `open`. Onay yöneticinin
 * kararıdır; yapay zeka işe ancak bundan sonra başlar.
 */
export async function approveItem(repo: TakipRepo, itemId: string): Promise<Item> {
  const item = await repo.getItem(itemId);
  if (!item) throw new Error(`Madde bulunamadı: ${itemId}`);
  if (item.status !== 'planned') {
    throw new Error(`#${item.refNo} planlanan değil, onaylanacak bir şey yok.`);
  }

  return repo.updateItem(itemId, { status: 'open' });
}

/** Onayı geri alır — `open` → `planned`. Üzerinde iş başlamadıysa anlamlı. */
export async function unapproveItem(repo: TakipRepo, itemId: string): Promise<Item> {
  const item = await repo.getItem(itemId);
  if (!item) throw new Error(`Madde bulunamadı: ${itemId}`);
  if (item.status !== 'open') {
    throw new Error(`#${item.refNo} açık değil, plana geri alınamaz.`);
  }

  return repo.updateItem(itemId, { status: 'planned' });
}

/** Kapatmayı geri alır; changelog kaydı taslakta kalırsa temizlenir. */
export async function reopenItem(repo: TakipRepo, itemId: string): Promise<Item> {
  const item = await repo.getItem(itemId);
  if (!item) throw new Error(`Madde bulunamadı: ${itemId}`);

  return repo.updateItem(itemId, { status: 'open', doneAt: null, releaseVersion: null });
}

/** "1.2" / "v1.2.0" / "1.2.3" → "v1.2.3"; tanınmazsa hata. */
export function normalizeVersion(version: string): string {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(version.trim());
  if (!match) throw new Error(`Sürüm biçimi tanınmadı: "${version}" — v1.4.0 gibi olmalı.`);
  return `v${match[1]}.${match[2]}.${match[3] ?? 0}`;
}

/** "2026-03-14" / tam ISO → ISO. Gelecek tarih ve bozuk giriş reddedilir. */
export function normalizePastDate(value: string, label = 'Tarih'): string {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? `${value.trim()}T12:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} okunamadı: "${value}" — 2026-03-14 ya da tam ISO olmalı.`);
  }
  if (parsed.getTime() > Date.now() + 60_000) {
    throw new Error(`${label} gelecekte olamaz: ${value}`);
  }
  return parsed.toISOString();
}

export interface HistoricalReleaseInput {
  projectId: string;
  version: string;
  date: string;
  status?: ReleaseStatus;
  entries?: { kind: ChangeKind; text: string; refNo?: number | null }[];
}

/**
 * Geçmişe dönük sürüm kaydı — panel kurulmadan önce çıkılmış sürümleri
 * changelog'a taşımak için. Projenin görünen sürümüne ve açık taslağa
 * dokunmaz; o `publishRelease`'in işi.
 */
export async function addHistoricalRelease(
  repo: TakipRepo,
  input: HistoricalReleaseInput,
): Promise<{ release: Release; entries: ChangeEntry[] }> {
  const version = normalizeVersion(input.version);
  const date = normalizePastDate(input.date, 'Sürüm tarihi');

  const existing = await repo.listReleases(input.projectId);
  if (existing.some((release) => release.version === version)) {
    throw new Error(
      `${version} zaten var — o sürüme satır eklemek için add_changelog_entries kullan.`,
    );
  }

  const release = await repo.createRelease({
    projectId: input.projectId,
    version,
    date,
    status: input.status ?? 'released',
    createdAt: date,
  });

  const entries: ChangeEntry[] = [];
  for (const entry of input.entries ?? []) {
    const text = entry.text.trim();
    if (!text) continue;
    entries.push(
      await repo.createChangeEntry({
        projectId: input.projectId,
        releaseId: release.id,
        kind: entry.kind,
        text,
        refNo: entry.refNo ?? null,
        createdAt: date,
      }),
    );
  }

  return { release, entries };
}

/**
 * Var olan bir sürüme changelog satırı ekler — geçmişi parça parça
 * doldururken aynı sürüme birden çok kez dönebilmek için.
 */
export async function addChangelogEntries(
  repo: TakipRepo,
  projectId: string,
  version: string,
  entries: { kind: ChangeKind; text: string; refNo?: number | null }[],
): Promise<{ release: Release; entries: ChangeEntry[] }> {
  const wanted = normalizeVersion(version);
  const releases = await repo.listReleases(projectId);
  const release = releases.find((candidate) => candidate.version === wanted);

  if (!release) {
    const known = [...releases]
      .sort((a, b) => compareVersions(b.version, a.version))
      .map((candidate) => candidate.version)
      .join(', ');
    throw new Error(
      `${wanted} projede yok.${known ? ` Var olanlar: ${known}.` : ''} Yeni sürüm için add_release kullan.`,
    );
  }

  const written: ChangeEntry[] = [];
  for (const entry of entries) {
    const text = entry.text.trim();
    if (!text) continue;
    written.push(
      await repo.createChangeEntry({
        projectId,
        releaseId: release.id,
        kind: entry.kind,
        text,
        refNo: entry.refNo ?? null,
        createdAt: release.date,
      }),
    );
  }

  return { release, entries: written };
}

/**
 * Projenin görünen sürüm numarasını doğrudan belirler. Geçmiş doldurulduktan
 * sonra kartta hâlâ v0.1.0 yazmasın diye. Sürüm kayıtlarına dokunmaz.
 */
export async function setProjectVersion(
  repo: TakipRepo,
  projectId: string,
  version: string,
): Promise<Project> {
  return repo.updateProject(projectId, { version: normalizeVersion(version) });
}

export interface HistoricalItemInput {
  title: string;
  description?: string;
  type?: ItemType;
  priority?: Priority;
  reporter?: string;
  tag?: string;
  createdAt: string;
  doneAt?: string | null;
  /** Hangi sürümde çıktığı — o sürüm projede yoksa hata. */
  releaseVersion?: string | null;
  /** Changelog satırının metni; boşsa başlık kullanılır. */
  changelogText?: string;
  /** Sürüm verildiyse varsayılan true — changelog satırı da yazılır. */
  addToChangelog?: boolean;
}

/**
 * Geçmişte açılıp çözülmüş kayıtları toplu yazar. `addItem`'dan farkı,
 * tarihleri çağıran belirler ve kayıt doğrudan kapalı doğabilir.
 * `refNo` bir kez okunup yerel olarak artırılır — her madde için ayrı
 * sorgu atmaz.
 */
export async function addHistoricalItems(
  repo: TakipRepo,
  projectId: string,
  inputs: HistoricalItemInput[],
): Promise<{ item: Item; entry: ChangeEntry | null }[]> {
  const releases = await repo.listReleases(projectId);
  let refNo = await nextRefNo(repo, projectId);
  const results: { item: Item; entry: ChangeEntry | null }[] = [];

  for (const input of inputs) {
    const title = input.title.trim();
    if (!title) throw new Error('Başlık boş olamaz.');

    const createdAt = normalizePastDate(input.createdAt, `"${title}" açılış tarihi`);
    const doneAt = input.doneAt ? normalizePastDate(input.doneAt, `"${title}" çözülme tarihi`) : null;
    if (doneAt && doneAt < createdAt) {
      throw new Error(`"${title}": çözülme tarihi açılıştan önce olamaz.`);
    }

    const version = input.releaseVersion ? normalizeVersion(input.releaseVersion) : null;
    const release = version ? releases.find((candidate) => candidate.version === version) : null;
    if (version && !release) {
      throw new Error(`${version} projede yok — önce add_release ile sürümü oluştur.`);
    }

    const type = input.type ?? 'bug';
    const priority = input.priority ?? 'orta';

    const item = await repo.createItem({
      projectId,
      refNo,
      type,
      title,
      description: input.description?.trim() ?? '',
      priority,
      status: doneAt ? 'done' : 'open',
      reporter: input.reporter?.trim() || 'Yönetici',
      tag: input.tag?.trim().replace(/^#/, '').toLocaleLowerCase('tr') ?? '',
      createdAt,
      doneAt,
      releaseVersion: release?.version ?? null,
    });

    let entry: ChangeEntry | null = null;
    const wantsEntry = input.addToChangelog ?? Boolean(release);
    if (release && doneAt && wantsEntry) {
      entry = await repo.createChangeEntry({
        projectId,
        releaseId: release.id,
        kind: changeKindForItem(type, priority, title),
        text: input.changelogText?.trim() || title,
        refNo: item.refNo,
        createdAt: doneAt,
      });
    }

    results.push({ item, entry });
    refNo += 1;
  }

  return results;
}

export interface DeleteReleaseResult {
  version: string;
  /** Silinen changelog satırı sayısı. */
  removedEntries: number;
  /** `releaseVersion` alanı boşaltılan madde sayısı — maddeler yapıldı kalır. */
  detachedItems: number;
}

/**
 * Sürümü ve changelog satırlarını siler. Ona bağlı maddeler **silinmez**:
 * yapıldı kalır, yalnızca `releaseVersion` bağı kopar — yanlış açılmış bir
 * sürümü temizlerken iş kaybı olmasın diye.
 */
export async function deleteRelease(
  repo: TakipRepo,
  releaseId: string,
): Promise<DeleteReleaseResult> {
  const releases = await repo.listReleases();
  const release = releases.find((candidate) => candidate.id === releaseId);
  if (!release) throw new Error(`Sürüm bulunamadı: ${releaseId}`);

  const entries = (await repo.listChangeEntries(release.projectId)).filter(
    (entry) => entry.releaseId === release.id,
  );
  const attached = (await repo.listItems(release.projectId)).filter(
    (item) => item.releaseVersion === release.version,
  );

  // Uygulama toplu yapabiliyorsa öyle: yüzlerce kaydı tek tek göndermek
  // Appwrite'ın hız sınırına takılıyor.
  if (repo.deleteChangeEntriesOfRelease) {
    await repo.deleteChangeEntriesOfRelease(release.projectId, release.id);
  } else {
    await runPooled(entries.map((entry) => () => repo.deleteChangeEntry(entry.id)));
  }

  if (repo.detachItemsFromRelease) {
    await repo.detachItemsFromRelease(release.projectId, release.version);
  } else {
    await runPooled(attached.map((item) => () => repo.updateItem(item.id, { releaseVersion: null })));
  }

  // Sürüm kaydı en sonda siliniyor: ortada bir istek patlarsa sürüm ayakta
  // kalır ve tekrar denemek kaldığı yerden temizler.
  await repo.deleteRelease(release.id);

  return {
    version: release.version,
    removedEntries: entries.length,
    detachedItems: attached.length,
  };
}

/** Taslak sürümü yayına alır ve projenin görünen sürümünü günceller. */
export async function publishRelease(repo: TakipRepo, releaseId: string): Promise<Release> {
  const releases = await repo.listReleases();
  const release = releases.find((candidate) => candidate.id === releaseId);
  if (!release) throw new Error(`Sürüm bulunamadı: ${releaseId}`);

  const published = await repo.updateRelease(releaseId, {
    status: 'released',
    date: new Date().toISOString(),
  });
  await repo.updateProject(release.projectId, { version: published.version });
  return published;
}

export function computeStats(
  projectId: string,
  items: Item[],
  notes: { projectId: string }[],
  timeEntries: { projectId: string; minutes: number }[],
  now: Date = new Date(),
): ProjectStats {
  const mine = items.filter((item) => item.projectId === projectId);
  const weekStart = startOfWeek(now).getTime();

  const lastActivityAt = mine
    .map((item) => item.doneAt ?? item.createdAt)
    .sort()
    .pop();

  return {
    openBugs: mine.filter((item) => item.status === 'open' && item.type === 'bug').length,
    openTasks: mine.filter((item) => item.status === 'open' && item.type === 'task').length,
    doneThisWeek: mine.filter(
      (item) => item.status === 'done' && item.doneAt && new Date(item.doneAt).getTime() >= weekStart,
    ).length,
    notes: notes.filter((note) => note.projectId === projectId).length,
    minutes: timeEntries
      .filter((entry) => entry.projectId === projectId)
      .reduce((total, entry) => total + entry.minutes, 0),
    lastActivityAt: lastActivityAt ?? null,
  };
}

/** Ana ekrandaki üst şeridin dört sayacı. */
export function computeGlobalStats(
  items: Item[],
  timeEntries: { minutes: number; startedAt: string }[],
  releases: Release[],
  now: Date = new Date(),
) {
  const weekStart = startOfWeek(now).getTime();
  return {
    openBugs: items.filter((item) => item.status === 'open' && item.type === 'bug').length,
    doneThisWeek: items.filter(
      (item) => item.status === 'done' && item.doneAt && new Date(item.doneAt).getTime() >= weekStart,
    ).length,
    minutesThisWeek: timeEntries
      .filter((entry) => new Date(entry.startedAt).getTime() >= weekStart)
      .reduce((total, entry) => total + entry.minutes, 0),
    newReleases: releases.filter(
      (release) => release.status === 'released' && new Date(release.date).getTime() >= weekStart,
    ).length,
  };
}

export function sortProjects(projects: Project[]): Project[] {
  const order: Record<string, number> = {
    gelistirme: 0,
    canli: 1,
    test: 2,
    beklemede: 3,
    teklif: 4,
    arsiv: 5,
  };
  return [...projects].sort(
    (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name, 'tr'),
  );
}

export function latestReleaseOf(releases: Release[], projectId: string): Release | null {
  return (
    [...releases]
      .filter((release) => release.projectId === projectId)
      .sort((a, b) => compareVersions(b.version, a.version))[0] ?? null
  );
}
