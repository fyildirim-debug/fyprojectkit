import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  CHANGE_KINDS,
  CHANGE_KIND_LABELS,
  ITEM_STATUS_LABELS,
  MCP_TOOL_CATALOG,
  NOTE_IMPORTANCES,
  NOTE_IMPORTANCE_LABELS,
  NOTE_IMPORTANCE_WEIGHT,
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_WEIGHT,
  addChangelogEntries,
  addHistoricalItems,
  addHistoricalRelease,
  addItem,
  approveItem,
  closeItem,
  compareVersions,
  deleteRelease,
  formatDate,
  normalizeVersion,
  publishRelease,
  reopenItem,
  setProjectVersion,
  type Item,
  type McpToolName,
  type Project,
  type TakipRepo,
} from '@takip/shared';

/** Araç çağrılarının günlüğe düşmesi için gereken bağlam. */
export interface ToolContext {
  repo: TakipRepo;
  project: Project;
  enabledTools: McpToolName[];
  client: string;
}

type TextResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ok = (text: string): TextResult => ({ content: [{ type: 'text', text }] });
const fail = (text: string): TextResult => ({ content: [{ type: 'text', text }], isError: true });

const DESCRIPTIONS = new Map(MCP_TOOL_CATALOG.map((tool) => [tool.name, tool.description]));

/**
 * Araçları sunucuya bağlar. Yalnızca projenin ayarlarında açık olan araçlar
 * kaydedilir — kapalı olanlar istemciye hiç görünmez.
 */
export function registerTools(server: McpServer, context: ToolContext): void {
  const { repo, project, enabledTools } = context;

  /** Her yazma/okuma sonrası "yapay zeka hareketleri" günlüğüne satır ekler. */
  const log = async (tool: McpToolName, summary: string) => {
    try {
      await repo.createMcpLog({
        projectId: project.id,
        tool,
        summary,
        client: context.client,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Günlük yazılamazsa araç sonucu yine de döner.
    }
  };

  const has = (name: McpToolName) => enabledTools.includes(name);

  if (has('list_bugs')) {
    server.registerTool(
      'list_bugs',
      {
        description:
          `${DESCRIPTIONS.get('list_bugs')} (proje: ${project.name}). ` +
          `Varsayılan open = onaylanmış iş; işe buradan başlanır. ` +
          `Onay bekleyen öneriler için list_plans.`,
        inputSchema: {
          status: z
            .enum(['open', 'done', 'planned', 'all'])
            .default('open')
            .describe('Kayıt durumu — varsayılan open, yani onaylanmış iş'),
          type: z.enum(['bug', 'task', 'all']).default('all').describe('Hata mı, iş mi'),
          min_priority: z
            .enum(PRIORITIES)
            .optional()
            .describe('Bu öncelik ve üstü (kritik > yuksek > orta > dusuk > istek)'),
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async ({ status, type, min_priority, limit }) => {
        const floor = min_priority ? PRIORITY_WEIGHT[min_priority] : -1;
        const items = (await repo.listItems(project.id))
          .filter((item) => (status === 'all' ? true : item.status === status))
          .filter((item) => (type === 'all' ? true : item.type === type))
          .filter((item) => PRIORITY_WEIGHT[item.priority] >= floor)
          .sort(
            (a, b) =>
              PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
              b.createdAt.localeCompare(a.createdAt),
          )
          .slice(0, limit);

        await log(
          'list_bugs',
          `${items.length} kayıt okundu · durum: ${status}${
            min_priority ? ` · öncelik ≥ ${PRIORITY_LABELS[min_priority].toLocaleLowerCase('tr')}` : ''
          }`,
        );

        if (items.length === 0) return ok('Kayıt bulunamadı.');

        return ok(
          items
            .map(
              (item) =>
                `#${item.refNo} [${item.type === 'bug' ? 'HATA' : 'İŞ'} · ${PRIORITY_LABELS[
                  item.priority
                ].toLocaleUpperCase('tr')}${
                  item.status === 'done'
                    ? ' · YAPILDI'
                    : item.status === 'planned'
                      ? ' · PLANLANAN'
                      : ''
                }] ${
                  item.title
                }${item.tag ? ` #${item.tag}` : ''}${
                  item.reporter ? ` — bildiren: ${item.reporter}` : ''
                }`,
            )
            .join('\n'),
        );
      },
    );
  }

  if (has('get_bug')) {
    server.registerTool(
      'get_bug',
      {
        description: `${DESCRIPTIONS.get('get_bug')} (proje: ${project.name})`,
        inputSchema: {
          ref_no: z.number().int().describe('Kayıt numarası, örn. 126'),
        },
      },
      async ({ ref_no }) => {
        const item = (await repo.listItems(project.id)).find((entry) => entry.refNo === ref_no);
        if (!item) return fail(`#${ref_no} bulunamadı.`);

        // İlgili notlar: başlıktaki anlamlı kelimeleri içeren notlar.
        const words = item.title
          .toLocaleLowerCase('tr')
          .split(/\s+/)
          .filter((word) => word.length > 4);
        const related = (await repo.listNotes(project.id)).filter((note) =>
          words.some((word) => note.body.toLocaleLowerCase('tr').includes(word)),
        );

        await log('get_bug', `#${ref_no} detayı okundu`);

        return ok(
          [
            `#${item.refNo} — ${item.title}`,
            `Tür: ${item.type === 'bug' ? 'hata' : 'iş'} · Öncelik: ${PRIORITY_LABELS[item.priority]}`,
            `Durum: ${
              item.status === 'done'
                ? `yapıldı (${item.releaseVersion ?? '—'})`
                : item.status === 'planned'
                  ? 'planlanan — onay bekliyor, üzerinde çalışma'
                  : 'yapılacak'
            }`,
            `Bildiren: ${item.reporter || '—'} · Etiket: ${item.tag || '—'}`,
            `Açılış: ${formatDate(item.createdAt)}`,
            item.description ? `\nAçıklama:\n${item.description}` : '',
            related.length > 0
              ? `\nİlgili notlar:\n${related.map((note) => `- ${note.body}`).join('\n')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      },
    );
  }

  if (has('add_bug')) {
    server.registerTool(
      'add_bug',
      {
        description:
          `${DESCRIPTIONS.get('add_bug')} (proje: ${project.name}). ` +
          `type kaydın hangi listeye düşeceğini belirler: bug → Hatalar, ` +
          `task → Yapılacaklar (özellik/iş). Var olan bir sorunu bildiriyorsan ` +
          `bunu kullan; yapılmasını öneriyorsan add_plan.`,
        inputSchema: {
          title: z.string().min(3).describe('Kısa başlık'),
          description: z.string().default('').describe('Detay, adımlar, ekran'),
          type: z
            .enum(['bug', 'task'])
            .default('bug')
            .describe('bug → Hatalar listesi, task → Yapılacaklar listesi'),
          priority: z.enum(PRIORITIES).default('orta'),
          reporter: z.string().default('Yapay zeka').describe('Kimin bildirdiği'),
          tag: z.string().default('').describe('Tek kelimelik etiket'),
        },
      },
      async ({ title, description, type, priority, reporter, tag }) => {
        const item = await addItem(repo, {
          projectId: project.id,
          title,
          description,
          type,
          priority,
          reporter,
          tag,
        });

        await log(
          'add_bug',
          `"${item.title}" kaydı açıldı · ${PRIORITY_LABELS[item.priority].toLocaleLowerCase('tr')}`,
        );

        return ok(`#${item.refNo} açıldı: ${item.title}`);
      },
    );
  }

  if (has('update_status')) {
    server.registerTool(
      'update_status',
      {
        description: `${DESCRIPTIONS.get('update_status')} (proje: ${project.name})`,
        inputSchema: {
          ref_no: z.number().int().describe('Kapatılacak kaydın numarası'),
          changelog_text: z
            .string()
            .optional()
            .describe("Changelog'da görünecek metin; boşsa kaydın başlığı kullanılır"),
        },
      },
      async ({ ref_no, changelog_text }) => {
        const item = (await repo.listItems(project.id)).find((entry) => entry.refNo === ref_no);
        if (!item) return fail(`#${ref_no} bulunamadı.`);
        if (item.status === 'done') return fail(`#${ref_no} zaten yapıldı.`);

        const result = await closeItem(repo, item.id, { changeText: changelog_text });

        await log(
          'update_status',
          `#${ref_no} "${item.title}" → yapıldı, ${result.release.version} changelog'una eklendi`,
        );

        return ok(
          `#${ref_no} yapıldı olarak işaretlendi ve ${result.release.version} sürümüne "${
            CHANGE_KIND_LABELS[result.entry.kind]
          }" olarak düştü.`,
        );
      },
    );
  }

  if (has('add_note')) {
    server.registerTool(
      'add_note',
      {
        description: `${DESCRIPTIONS.get('add_note')} (proje: ${project.name})`,
        inputSchema: {
          body: z.string().min(3).describe('Not metni'),
          context: z.string().default('yapay zeka').describe('Notun kaynağı'),
          importance: z
            .enum(NOTE_IMPORTANCES)
            .default('normal')
            .describe('Önem derecesi: cok_onemli, normal, az_onemli'),
        },
      },
      async ({ body, context: noteContext, importance }) => {
        await repo.createNote({
          projectId: project.id,
          body,
          context: noteContext,
          importance,
          createdAt: new Date().toISOString(),
        });

        const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
        await log(
          'add_note',
          `"${preview}" notu eklendi · ${NOTE_IMPORTANCE_LABELS[importance].toLocaleLowerCase('tr')}`,
        );

        return ok('Not eklendi.');
      },
    );
  }

  if (has('get_changelog')) {
    server.registerTool(
      'get_changelog',
      {
        description: `${DESCRIPTIONS.get('get_changelog')} (proje: ${project.name})`,
        inputSchema: {
          limit: z.number().int().min(1).max(50).default(5).describe('Kaç sürüm'),
        },
      },
      async ({ limit }) => {
        const releases = (await repo.listReleases(project.id))
          .sort((a, b) => compareVersions(b.version, a.version))
          .slice(0, limit);
        const entries = await repo.listChangeEntries(project.id);

        await log('get_changelog', `${releases.length} sürüm okundu`);

        if (releases.length === 0) return ok('Henüz sürüm yok.');

        return ok(
          releases
            .map((release) => {
              const mine = entries.filter((entry) => entry.releaseId === release.id);
              const head = `${release.version} — ${formatDate(release.date)}${
                release.status === 'draft' ? ' (taslak)' : ''
              }`;
              const body = mine
                .map(
                  (entry) =>
                    `  - [${CHANGE_KIND_LABELS[entry.kind]}] ${entry.text}${
                      entry.refNo ? ` (#${entry.refNo})` : ''
                    }`,
                )
                .join('\n');
              return body ? `${head}\n${body}` : head;
            })
            .join('\n\n'),
        );
      },
    );
  }

  /** Plan araçları yalnızca `planned` kayda dokunur — onaylanmış iş korunur. */
  type PlanLookup = { error: string; item?: undefined } | { error?: undefined; item: Item };

  const findPlan = async (refNo: number): Promise<PlanLookup> => {
    const item = (await repo.listItems(project.id)).find((entry) => entry.refNo === refNo);
    if (!item) return { error: `#${refNo} bulunamadı.` };
    if (item.status !== 'planned') {
      return {
        error:
          `#${refNo} planlanan değil (${ITEM_STATUS_LABELS[item.status].toLocaleLowerCase('tr')}). ` +
          `Plan araçları yalnızca onay bekleyen kayıtlara dokunur.`,
      };
    }
    return { item };
  };

  if (has('add_plan')) {
    server.registerTool(
      'add_plan',
      {
        description:
          `${DESCRIPTIONS.get('add_plan')} (proje: ${project.name}). ` +
          `Yapmayı düşündüğün her şey önce buraya yazılır — iş listesine DÜŞMEZ, ` +
          `onay bekler. Yönetici onaylayınca yapılacağa geçer ve ancak o zaman ` +
          `üzerinde çalışmaya başlarsın. Tek çağrıda birden çok plan yazabilirsin.`,
        inputSchema: {
          items: z
            .array(
              z.object({
                title: z.string().min(3).describe('Ne yapılması öneriliyor'),
                description: z.string().default('').describe('Gerekçe, kapsam, nasıl yapılacağı'),
                type: z
                  .enum(['bug', 'task'])
                  .default('task')
                  .describe('Onaylanınca hangi listeye düşecek: bug → Hatalar, task → Yapılacaklar'),
                priority: z.enum(PRIORITIES).default('orta'),
                tag: z.string().default('').describe('Tek kelimelik etiket'),
              }),
            )
            .min(1)
            .max(50)
            .describe('Önerilen planlar'),
        },
      },
      async ({ items }) => {
        const written = [];
        for (const entry of items) {
          written.push(
            await addItem(repo, {
              projectId: project.id,
              title: entry.title,
              description: entry.description,
              type: entry.type,
              priority: entry.priority,
              reporter: 'Yapay zeka',
              tag: entry.tag,
              status: 'planned',
            }),
          );
        }

        await log('add_plan', `${written.length} plan önerildi, onay bekliyor`);

        return ok(
          [
            `${written.length} plan yazıldı — onay bekliyor, iş listesine düşmedi.`,
            ...written.map((item) => `  #${item.refNo} ${item.title}`),
          ].join('\n'),
        );
      },
    );
  }

  if (has('list_plans')) {
    server.registerTool(
      'list_plans',
      {
        description:
          `${DESCRIPTIONS.get('list_plans')} (proje: ${project.name}). ` +
          `Bunlar henüz iş değil; onaylanmadan üzerlerinde çalışma.`,
        inputSchema: {
          type: z.enum(['bug', 'task', 'all']).default('all'),
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async ({ type, limit }) => {
        const plans = (await repo.listItems(project.id))
          .filter((item) => item.status === 'planned')
          .filter((item) => (type === 'all' ? true : item.type === type))
          .sort(
            (a, b) =>
              PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
              b.createdAt.localeCompare(a.createdAt),
          )
          .slice(0, limit);

        await log('list_plans', `${plans.length} plan okundu`);

        if (plans.length === 0) return ok('Onay bekleyen plan yok.');

        return ok(
          plans
            .map(
              (item) =>
                `#${item.refNo} [${item.type === 'bug' ? 'HATA' : 'İŞ'} · ${PRIORITY_LABELS[
                  item.priority
                ].toLocaleUpperCase('tr')}] ${item.title}${item.tag ? ` #${item.tag}` : ''}${
                  item.description ? `\n    ${item.description}` : ''
                }`,
            )
            .join('\n'),
        );
      },
    );
  }

  if (has('update_plan')) {
    server.registerTool(
      'update_plan',
      {
        description:
          `${DESCRIPTIONS.get('update_plan')} (proje: ${project.name}). ` +
          `Yalnızca onay bekleyen kayıtlara dokunur; onaylanmış iş için update_bug kullan.`,
        inputSchema: {
          ref_no: z.number().int().describe('Düzenlenecek planın numarası'),
          title: z.string().min(3).optional(),
          description: z.string().optional(),
          type: z
            .enum(['bug', 'task'])
            .optional()
            .describe('bug → Hatalar, task → Yapılacaklar'),
          priority: z.enum(PRIORITIES).optional(),
          tag: z.string().optional(),
        },
      },
      async ({ ref_no, title, description, type, priority, tag }) => {
        const found = await findPlan(ref_no);
        if (!found.item) return fail(found.error);

        const patch = {
          ...(title !== undefined ? { title: title.trim() } : {}),
          ...(description !== undefined ? { description: description.trim() } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(tag !== undefined ? { tag: tag.trim().replace(/^#/, '').toLocaleLowerCase('tr') } : {}),
        };
        if (Object.keys(patch).length === 0) return fail('Değiştirilecek alan verilmedi.');

        await repo.updateItem(found.item.id, patch);

        const changed = Object.keys(patch).join(', ');
        await log('update_plan', `#${ref_no} planı düzenlendi · ${changed}`);

        return ok(`#${ref_no} planı güncellendi (${changed}).`);
      },
    );
  }

  if (has('delete_plan')) {
    server.registerTool(
      'delete_plan',
      {
        description:
          `${DESCRIPTIONS.get('delete_plan')} (proje: ${project.name}). ` +
          `Vazgeçtiğin öneriyi kaldırır. Onaylanmış ya da yapılmış kayda dokunamaz.`,
        inputSchema: {
          ref_no: z.number().int().describe('Silinecek planın numarası'),
        },
      },
      async ({ ref_no }) => {
        const found = await findPlan(ref_no);
        if (!found.item) return fail(found.error);

        await repo.deleteItem(found.item.id);
        await log('delete_plan', `#${ref_no} "${found.item.title}" planı silindi`);

        return ok(`#${ref_no} planı silindi.`);
      },
    );
  }

  if (has('list_notes')) {
    server.registerTool(
      'list_notes',
      {
        description: `${DESCRIPTIONS.get('list_notes')} (proje: ${project.name})`,
        inputSchema: {
          min_importance: z
            .enum(NOTE_IMPORTANCES)
            .optional()
            .describe('Bu önem derecesi ve üstü (cok_onemli > normal > az_onemli)'),
          context: z.string().optional().describe('Kaynak filtresi, örn. "toplantı"'),
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async ({ min_importance, context: contextFilter, limit }) => {
        const floor = min_importance ? NOTE_IMPORTANCE_WEIGHT[min_importance] : -1;
        const needle = contextFilter?.toLocaleLowerCase('tr');
        const notes = (await repo.listNotes(project.id))
          .filter((note) => NOTE_IMPORTANCE_WEIGHT[note.importance] >= floor)
          .filter((note) => (needle ? note.context.toLocaleLowerCase('tr').includes(needle) : true))
          .sort(
            (a, b) =>
              NOTE_IMPORTANCE_WEIGHT[b.importance] - NOTE_IMPORTANCE_WEIGHT[a.importance] ||
              b.createdAt.localeCompare(a.createdAt),
          )
          .slice(0, limit);

        await log(
          'list_notes',
          `${notes.length} not okundu${
            min_importance
              ? ` · önem ≥ ${NOTE_IMPORTANCE_LABELS[min_importance].toLocaleLowerCase('tr')}`
              : ''
          }`,
        );

        if (notes.length === 0) return ok('Not bulunamadı.');

        return ok(
          notes
            .map(
              (note) =>
                `[${NOTE_IMPORTANCE_LABELS[note.importance].toLocaleUpperCase('tr')} · ${
                  note.context
                } · ${formatDate(note.createdAt)}]\n${note.body}`,
            )
            .join('\n\n'),
        );
      },
    );
  }

  if (has('search')) {
    server.registerTool(
      'search',
      {
        description: `${DESCRIPTIONS.get('search')} (proje: ${project.name})`,
        inputSchema: {
          query: z.string().min(2).describe('Aranacak metin'),
          limit: z.number().int().min(1).max(100).default(30),
        },
      },
      async ({ query, limit }) => {
        const needle = query.toLocaleLowerCase('tr');
        const hit = (text: string) => text.toLocaleLowerCase('tr').includes(needle);

        const [items, notes, entries] = await Promise.all([
          repo.listItems(project.id),
          repo.listNotes(project.id),
          repo.listChangeEntries(project.id),
        ]);

        const lines = [
          ...items
            .filter((item) => hit(item.title) || hit(item.description) || hit(item.tag))
            .map(
              (item) =>
                `KAYIT #${item.refNo} [${PRIORITY_LABELS[item.priority].toLocaleUpperCase('tr')}${
                  item.status === 'done' ? ' · YAPILDI' : ''
                }] ${item.title}`,
            ),
          ...notes
            .filter((note) => hit(note.body) || hit(note.context))
            .map(
              (note) =>
                `NOT [${NOTE_IMPORTANCE_LABELS[note.importance].toLocaleUpperCase('tr')}] ${
                  note.body.length > 120 ? `${note.body.slice(0, 120)}…` : note.body
                }`,
            ),
          ...entries
            .filter((entry) => hit(entry.text))
            .map(
              (entry) =>
                `CHANGELOG [${CHANGE_KIND_LABELS[entry.kind]}] ${entry.text}${
                  entry.refNo ? ` (#${entry.refNo})` : ''
                }`,
            ),
        ].slice(0, limit);

        await log('search', `"${query}" arandı · ${lines.length} sonuç`);

        return ok(lines.length > 0 ? lines.join('\n') : `"${query}" için sonuç yok.`);
      },
    );
  }

  if (has('project_status')) {
    server.registerTool(
      'project_status',
      {
        description: `${DESCRIPTIONS.get('project_status')} (proje: ${project.name})`,
        inputSchema: {},
      },
      async () => {
        // `project` bağlantı anındaki anlık görüntü; durum/sürüm o an değişmiş
        // olabilir (set_project_version, panelden düzenleme) — taze oku.
        const [current, items, notes, releases, timeEntries] = await Promise.all([
          repo.getProject(project.id),
          repo.listItems(project.id),
          repo.listNotes(project.id),
          repo.listReleases(project.id),
          repo.listTimeEntries(project.id),
        ]);
        const live = current ?? project;

        const open = items.filter((item) => item.status === 'open');
        const draft = releases.find((release) => release.status === 'draft');
        const lastReleased = releases
          .filter((release) => release.status === 'released')
          .sort((a, b) => compareVersions(b.version, a.version))[0];
        const minutes = timeEntries.reduce((total, entry) => total + entry.minutes, 0);
        const critical = open.filter((item) => item.priority === 'kritik');

        await log('project_status', 'proje durumu okundu');

        return ok(
          [
            `${live.name} — ${live.status} · ${live.version} · %${live.progress}`,
            `Açık: ${open.filter((item) => item.type === 'bug').length} hata, ${
              open.filter((item) => item.type === 'task').length
            } iş · Kapanan: ${items.length - open.length}`,
            critical.length > 0
              ? `Kritik açık kayıtlar:\n${critical
                  .map((item) => `  - #${item.refNo} ${item.title}`)
                  .join('\n')}`
              : 'Kritik açık kayıt yok.',
            `Not: ${notes.length} (${
              notes.filter((note) => note.importance === 'cok_onemli').length
            } çok önemli)`,
            draft ? `Açık taslak sürüm: ${draft.version}` : 'Açık taslak sürüm yok.',
            lastReleased
              ? `Son yayın: ${lastReleased.version} — ${formatDate(lastReleased.date)}`
              : 'Henüz yayınlanmış sürüm yok.',
            `Harcanan süre: ${Math.floor(minutes / 60)}s ${minutes % 60}dk`,
          ].join('\n'),
        );
      },
    );
  }

  if (has('update_bug')) {
    server.registerTool(
      'update_bug',
      {
        description: `${DESCRIPTIONS.get('update_bug')} (proje: ${project.name})`,
        inputSchema: {
          ref_no: z.number().int().describe('Düzenlenecek kaydın numarası'),
          title: z.string().min(3).optional(),
          description: z.string().optional(),
          type: z
            .enum(['bug', 'task'])
            .optional()
            .describe('Kaydı listeler arasında taşır: bug → Hatalar, task → Yapılacaklar'),
          priority: z.enum(PRIORITIES).optional(),
          reporter: z.string().optional(),
          tag: z.string().optional(),
        },
      },
      async ({ ref_no, title, description, type, priority, reporter, tag }) => {
        const item = (await repo.listItems(project.id)).find((entry) => entry.refNo === ref_no);
        if (!item) return fail(`#${ref_no} bulunamadı.`);

        const patch = {
          ...(title !== undefined ? { title: title.trim() } : {}),
          ...(description !== undefined ? { description: description.trim() } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(reporter !== undefined ? { reporter: reporter.trim() } : {}),
          ...(tag !== undefined ? { tag: tag.trim().replace(/^#/, '').toLocaleLowerCase('tr') } : {}),
        };
        if (Object.keys(patch).length === 0) return fail('Değiştirilecek alan verilmedi.');

        await repo.updateItem(item.id, patch);

        const changed = Object.keys(patch).join(', ');
        await log('update_bug', `#${ref_no} düzenlendi · ${changed}`);

        return ok(`#${ref_no} güncellendi (${changed}).`);
      },
    );
  }

  if (has('reopen_bug')) {
    server.registerTool(
      'reopen_bug',
      {
        description: `${DESCRIPTIONS.get('reopen_bug')} (proje: ${project.name})`,
        inputSchema: {
          ref_no: z.number().int().describe('Yeniden açılacak kaydın numarası'),
        },
      },
      async ({ ref_no }) => {
        const item = (await repo.listItems(project.id)).find((entry) => entry.refNo === ref_no);
        if (!item) return fail(`#${ref_no} bulunamadı.`);
        if (item.status === 'open') return fail(`#${ref_no} zaten açık.`);

        await reopenItem(repo, item.id);
        await log('reopen_bug', `#${ref_no} "${item.title}" yeniden açıldı`);

        return ok(`#${ref_no} yeniden açıldı. Changelog satırı ${item.releaseVersion ?? '—'} sürümünde duruyor.`);
      },
    );
  }

  if (has('log_time')) {
    server.registerTool(
      'log_time',
      {
        description: `${DESCRIPTIONS.get('log_time')} (proje: ${project.name})`,
        inputSchema: {
          minutes: z.number().int().min(1).max(1440).describe('Harcanan dakika'),
          note: z.string().default('').describe('Ne yapıldı'),
          ref_no: z.number().int().optional().describe('İlgili kaydın numarası'),
        },
      },
      async ({ minutes, note, ref_no }) => {
        let itemId: string | null = null;
        if (ref_no !== undefined) {
          const item = (await repo.listItems(project.id)).find((entry) => entry.refNo === ref_no);
          if (!item) return fail(`#${ref_no} bulunamadı.`);
          itemId = item.id;
        }

        const now = new Date();
        await repo.createTimeEntry({
          projectId: project.id,
          itemId,
          startedAt: new Date(now.getTime() - minutes * 60_000).toISOString(),
          endedAt: now.toISOString(),
          minutes,
          note,
        });

        await log('log_time', `${minutes} dk kaydedildi${ref_no ? ` · #${ref_no}` : ''}`);

        return ok(`${minutes} dakika kaydedildi.`);
      },
    );
  }

  if (has('add_release')) {
    server.registerTool(
      'add_release',
      {
        description:
          `${DESCRIPTIONS.get('add_release')} (proje: ${project.name}). ` +
          `Panel kurulmadan önce çıkmış sürümleri changelog'a taşımak için. ` +
          `Projenin görünen sürümüne ve açık taslağa dokunmaz. ` +
          `Her sürüm için bir kez çağır; geçmişi eskiden yeniye doğru yaz.`,
        inputSchema: {
          version: z.string().describe('Sürüm, örn. v1.2.0'),
          date: z.string().describe('Çıkış tarihi — 2026-03-14 ya da tam ISO'),
          status: z
            .enum(['released', 'draft'])
            .default('released')
            .describe('Geçmiş sürümler released olmalı'),
          entries: z
            .array(
              z.object({
                kind: z
                  .enum(CHANGE_KINDS)
                  .describe('fix (düzeltme), new (yeni), improve (iyileşme), removed (kaldırıldı)'),
                text: z.string().min(2).describe('Changelog satırı'),
                ref_no: z.number().int().optional().describe('Varsa ilgili kaydın numarası'),
              }),
            )
            .default([])
            .describe('Bu sürümün changelog satırları'),
        },
      },
      async ({ version, date, status, entries }) => {
        try {
          const result = await addHistoricalRelease(repo, {
            projectId: project.id,
            version,
            date,
            status,
            entries: entries.map((entry) => ({
              kind: entry.kind,
              text: entry.text,
              refNo: entry.ref_no ?? null,
            })),
          });

          await log(
            'add_release',
            `${result.release.version} geçmişe dönük eklendi · ${result.entries.length} changelog satırı`,
          );

          return ok(
            `${result.release.version} (${formatDate(result.release.date)}) eklendi, ${
              result.entries.length
            } changelog satırı yazıldı.`,
          );
        } catch (cause) {
          return fail(cause instanceof Error ? cause.message : 'Sürüm eklenemedi.');
        }
      },
    );
  }

  if (has('add_done_items')) {
    server.registerTool(
      'add_done_items',
      {
        description:
          `${DESCRIPTIONS.get('add_done_items')} (proje: ${project.name}). ` +
          `Tek çağrıda birden çok kayıt yazabilirsin. release_version verirsen kayıt o ` +
          `sürüme bağlanır ve changelog satırı da otomatik düşer — o sürümün önce ` +
          `add_release ile var olması gerekir. done_at boş bırakılırsa kayıt açık kalır.`,
        inputSchema: {
          items: z
            .array(
              z.object({
                title: z.string().min(3).describe('Kısa başlık'),
                description: z.string().default('').describe('Detay'),
                type: z.enum(['bug', 'task']).default('bug'),
                priority: z.enum(PRIORITIES).default('orta'),
                reporter: z.string().default('').describe('Kimin bildirdiği'),
                tag: z.string().default('').describe('Tek kelimelik etiket'),
                created_at: z.string().describe('Açılış tarihi — 2026-03-14 ya da tam ISO'),
                done_at: z.string().optional().describe('Çözülme tarihi; boşsa kayıt açık kalır'),
                release_version: z.string().optional().describe('Hangi sürümde çıktı, örn. v1.2.0'),
                changelog_text: z
                  .string()
                  .optional()
                  .describe("Changelog'da görünecek metin; boşsa başlık kullanılır"),
              }),
            )
            .min(1)
            .max(100)
            .describe('Yazılacak kayıtlar'),
        },
      },
      async ({ items }) => {
        try {
          const results = await addHistoricalItems(
            repo,
            project.id,
            items.map((entry) => ({
              title: entry.title,
              description: entry.description,
              type: entry.type,
              priority: entry.priority,
              reporter: entry.reporter,
              tag: entry.tag,
              createdAt: entry.created_at,
              doneAt: entry.done_at ?? null,
              releaseVersion: entry.release_version ?? null,
              changelogText: entry.changelog_text,
            })),
          );

          const closed = results.filter((row) => row.item.status === 'done').length;
          const logged = results.filter((row) => row.entry).length;

          await log(
            'add_done_items',
            `${results.length} geçmiş kayıt yazıldı · ${closed} kapalı · ${logged} changelog satırı`,
          );

          return ok(
            [
              `${results.length} kayıt yazıldı (${closed} kapalı, ${logged} changelog satırı).`,
              ...results.map(
                (row) =>
                  `  #${row.item.refNo} ${row.item.title}${
                    row.item.releaseVersion ? ` → ${row.item.releaseVersion}` : ''
                  }`,
              ),
            ].join('\n'),
          );
        } catch (cause) {
          // Hata ortada patlarsa o ana kadar yazılanlar durur; mesaj hangi
          // maddede takıldığını söyler, kalanı tekrar göndermek yeterli.
          return fail(cause instanceof Error ? cause.message : 'Kayıtlar yazılamadı.');
        }
      },
    );
  }

  if (has('add_changelog_entries')) {
    server.registerTool(
      'add_changelog_entries',
      {
        description:
          `${DESCRIPTIONS.get('add_changelog_entries')} (proje: ${project.name}). ` +
          `Sürüm numarasını sen verirsin; o sürüm projede zaten var olmalı. ` +
          `Geçmişi parça parça doldururken aynı sürüme birden çok kez dönebilirsin. ` +
          `Yeni bir sürüm açmak için add_release kullan.`,
        inputSchema: {
          version: z.string().describe('Hangi sürüme eklenecek, örn. v1.2.0'),
          entries: z
            .array(
              z.object({
                kind: z
                  .enum(CHANGE_KINDS)
                  .describe('fix (düzeltme), new (yeni), improve (iyileşme), removed (kaldırıldı)'),
                text: z.string().min(2).describe('Changelog satırı'),
                ref_no: z.number().int().optional().describe('Varsa ilgili kaydın numarası'),
              }),
            )
            .min(1)
            .max(100),
        },
      },
      async ({ version, entries }) => {
        try {
          const result = await addChangelogEntries(
            repo,
            project.id,
            version,
            entries.map((entry) => ({
              kind: entry.kind,
              text: entry.text,
              refNo: entry.ref_no ?? null,
            })),
          );

          await log(
            'add_changelog_entries',
            `${result.release.version} sürümüne ${result.entries.length} changelog satırı eklendi`,
          );

          return ok(
            `${result.release.version} (${formatDate(result.release.date)}) sürümüne ${
              result.entries.length
            } satır eklendi.`,
          );
        } catch (cause) {
          return fail(cause instanceof Error ? cause.message : 'Changelog satırı eklenemedi.');
        }
      },
    );
  }

  if (has('set_project_version')) {
    server.registerTool(
      'set_project_version',
      {
        description:
          `${DESCRIPTIONS.get('set_project_version')} (proje: ${project.name}). ` +
          `Kartta ve proje detayında görünen numara budur. Sürüm kayıtlarına dokunmaz — ` +
          `geçmişi add_release ile doldurduktan sonra projeyi gerçek sürümüne çekmek için.`,
        inputSchema: {
          version: z.string().describe('Yeni sürüm numarası, örn. v2.3.0'),
        },
      },
      async ({ version }) => {
        try {
          const before = (await repo.getProject(project.id))?.version ?? project.version;
          const updated = await setProjectVersion(repo, project.id, version);
          await log('set_project_version', `proje sürümü ${before} → ${updated.version}`);
          return ok(`Projenin sürümü ${before} → ${updated.version} olarak güncellendi.`);
        } catch (cause) {
          return fail(cause instanceof Error ? cause.message : 'Sürüm belirlenemedi.');
        }
      },
    );
  }

  // get_credentials, delete_item ve publish_release bilerek kapalı doğar: şifreler
  // yapay zekaya kapalı, silme geri alınamaz, sürüm yayınlamak da geri alınamaz bir
  // karar. Ayarlardan açılırlarsa burada devreye girerler.
  if (has('approve_plan')) {
    server.registerTool(
      'approve_plan',
      {
        description:
          `${DESCRIPTIONS.get('approve_plan')} (proje: ${project.name}). ` +
          `Normalde onayı panelden yönetici verir; bu araç bilerek kapalı doğar.`,
        inputSchema: {
          ref_no: z.number().int().describe('Onaylanacak planın numarası'),
        },
      },
      async ({ ref_no }) => {
        const found = await findPlan(ref_no);
        if (!found.item) return fail(found.error);

        await approveItem(repo, found.item.id);
        await log('approve_plan', `#${ref_no} "${found.item.title}" onaylandı → yapılacak`);

        return ok(`#${ref_no} onaylandı, artık yapılacak listesinde.`);
      },
    );
  }

  if (has('publish_release')) {
    server.registerTool(
      'publish_release',
      {
        description: `${DESCRIPTIONS.get('publish_release')} (proje: ${project.name})`,
        inputSchema: {},
      },
      async () => {
        const draft = (await repo.listReleases(project.id)).find(
          (release) => release.status === 'draft',
        );
        if (!draft) return fail('Yayına alınacak taslak sürüm yok.');

        const published = await publishRelease(repo, draft.id);
        await log('publish_release', `${published.version} yayına alındı`);

        return ok(`${published.version} yayına alındı, projenin sürümü güncellendi.`);
      },
    );
  }

  if (has('get_credentials')) {
    server.registerTool(
      'get_credentials',
      {
        description: `${DESCRIPTIONS.get('get_credentials')} (proje: ${project.name})`,
        inputSchema: { service: z.string().optional().describe('Servis adı filtresi') },
      },
      async ({ service }) => {
        const rows = (await repo.listCredentials(project.id)).filter((credential) =>
          service ? credential.service.toLocaleLowerCase('tr').includes(service.toLocaleLowerCase('tr')) : true,
        );
        await log('get_credentials', `${rows.length} erişim kaydı okundu`);
        return ok(
          rows
            .map((row) => `${row.service} · ${row.username} · ${row.secret}`)
            .join('\n') || 'Kayıt yok.',
        );
      },
    );
  }

  if (has('delete_release')) {
    server.registerTool(
      'delete_release',
      {
        description:
          `${DESCRIPTIONS.get('delete_release')} (proje: ${project.name}). ` +
          `Sürümü ve changelog satırlarını siler. O sürümde çıkmış maddeler SİLİNMEZ — ` +
          `yapıldı kalır, yalnızca sürüm bağı kopar. Geri alma yok.`,
        inputSchema: {
          version: z.string().describe('Silinecek sürüm, örn. v1.2.0'),
        },
      },
      async ({ version }) => {
        try {
          const wanted = normalizeVersion(version);
          const release = (await repo.listReleases(project.id)).find(
            (candidate) => candidate.version === wanted,
          );
          if (!release) return fail(`${wanted} projede yok.`);

          const result = await deleteRelease(repo, release.id);

          await log(
            'delete_release',
            `${result.version} silindi · ${result.removedEntries} changelog satırı · ${result.detachedItems} madde bağı koptu`,
          );

          return ok(
            `${result.version} silindi. ${result.removedEntries} changelog satırı kaldırıldı, ` +
              `${result.detachedItems} madde yapıldı kaldı ama sürüm bağı koptu.`,
          );
        } catch (cause) {
          return fail(cause instanceof Error ? cause.message : 'Sürüm silinemedi.');
        }
      },
    );
  }

  if (has('delete_item')) {
    server.registerTool(
      'delete_item',
      {
        description: `${DESCRIPTIONS.get('delete_item')} (proje: ${project.name})`,
        inputSchema: { ref_no: z.number().int().describe('Silinecek kaydın numarası') },
      },
      async ({ ref_no }) => {
        const item = (await repo.listItems(project.id)).find((entry) => entry.refNo === ref_no);
        if (!item) return fail(`#${ref_no} bulunamadı.`);
        await repo.deleteItem(item.id);
        await log('delete_item', `#${ref_no} "${item.title}" silindi`);
        return ok(`#${ref_no} silindi.`);
      },
    );
  }
}
