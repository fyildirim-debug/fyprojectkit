import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { MCP_TOOL_CATALOG, type McpConfig, type Project } from '@takip/shared';
import { createRepo } from './repo.js';
import { registerTools } from './tools.js';

/**
 * Proje başına MCP sunucusu.
 *
 *   GET  /mcp/:slug/sse       → SSE akışı (tasarımdaki adres)
 *   POST /mcp/:slug/messages  → SSE oturumunun mesaj kanalı
 *   ALL  /mcp/:slug           → Streamable HTTP (yeni istemciler)
 *
 * Her istek `Authorization: Bearer <token>` ister ve token yalnızca kendi
 * projesinin verisini açar — başka projeye erişim yoktur.
 */

const PORT = Number(process.env.PORT ?? 8787);
const { repo, localMode } = createRepo();

const app = express();

/** Streamable HTTP gövdeyi kendi okur; yalnızca /messages için JSON ayrıştırılır. */
app.use('/mcp/:slug/messages', express.json());

interface Authorized {
  project: Project;
  config: McpConfig;
}

// ---- Sağlık ----
//
// İki yolda da yanıt verir: sunucu doğrudan açıldığında `/health`, ters vekil
// `/mcp` yolunu bu servise yönlendirdiğinde `/mcp/health`. Aşağıdaki
// `/mcp/:slug` rotasından ÖNCE tanımlı olmalı, yoksa slug'ı "health" sanar.
async function health(_req: Request, res: Response): Promise<void> {
  const configs = await repo.listMcpConfigs();
  res.json({
    ok: true,
    mode: localMode ? 'local' : 'appwrite',
    projects: configs.filter((config) => config.enabled).length,
    sessions: sseSessions.size + httpSessions.size,
  });
}

app.get('/health', health);
app.get('/mcp/health', health);

/** Slug + Bearer token doğrulaması. Hata durumunda yanıtı kendisi yazar. */
async function authorize(req: Request, res: Response): Promise<Authorized | null> {
  const slug = req.params.slug;
  const project = await repo.getProjectBySlug(slug);
  if (!project) {
    res.status(404).json({ error: `Proje bulunamadı: ${slug}` });
    return null;
  }

  const config = await repo.getMcpConfig(project.id);
  if (!config || !config.enabled) {
    res.status(403).json({ error: `${project.name} için MCP kapalı.` });
    return null;
  }

  const header = req.header('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== config.token) {
    res.status(401).json({ error: 'Geçersiz token.' });
    return null;
  }

  return { project, config };
}

/** İstemci adı: kendini tanıtan başlık varsa onu, yoksa user-agent'ı kullanır. */
function clientName(req: Request): string {
  return (
    req.header('x-mcp-client') ??
    req.header('user-agent')?.split('/')[0] ??
    'bilinmeyen istemci'
  );
}

function buildServer(auth: Authorized, client: string): McpServer {
  const server = new McpServer(
    { name: `takip-${auth.project.slug}`, version: '1.0.0' },
    {
      instructions:
        `Bu sunucu yalnızca "${auth.project.name}" projesinin takip verisine erişir.\n\n` +
        `ÖNEMLİ — onay akışı: planlanan → (yönetici onayı) → yapılacak → yapıldı.\n` +
        `Yapmayı önerdiğin her şeyi add_plan ile PLANLANAN olarak yaz; bunlar iş ` +
        `listesine düşmez, onay bekler. Kendi planını update_plan ile düzeltebilir, ` +
        `delete_plan ile geri çekebilirsin. Onayı yönetici panelden verir. ` +
        `İşe YALNIZCA list_bugs'ın döndürdüğü onaylanmış kayıtlardan başla ` +
        `(status varsayılanı open); planlanan bir maddeyi kendiliğinden yapma, ` +
        `onaylanmadan kapatamazsın da.\n\n` +
        `Nereden başlayacağını bilmiyorsan project_status ile projenin genel durumunu al. ` +
        `Hataları list_bugs ile oku, get_bug ile detaylandır, update_bug ile düzelt, ` +
        `çözülenleri update_status ile kapat — kapanan madde otomatik olarak changelog'a düşer. ` +
        `Yanlış kapattığın bir kaydı reopen_bug geri açar. Bir konuyu ararken search kullan; ` +
        `hata, iş, not ve changelog metinlerinin hepsine bakar. Notları list_notes ile oku, ` +
        `önemlileri min_importance ile süz; yazdığın notta importance alanını doldur ` +
        `(cok_onemli / normal / az_onemli). Harcadığın süreyi log_time ile kaydet. ` +
        `Bu panel projeden sonra kurulduysa geçmişi de doldurabilirsin: önce add_release ile ` +
        `eski sürümleri eskiden yeniye doğru aç, sonra add_done_items ile o sürümlerde ` +
        `çözülmüş kayıtları release_version vererek tek çağrıda yaz — changelog satırları ` +
        `kendiliğinden düşer. Var olan bir sürüme sonradan satır eklemek için ` +
        `add_changelog_entries, projenin kartta görünen numarasını düzeltmek için ` +
        `set_project_version kullan. Şifrelere erişim ve silme kapalıdır.`,
    },
  );

  registerTools(server, {
    repo,
    project: auth.project,
    enabledTools: auth.config.enabledTools,
    client,
  });

  return server;
}

/** Bağlanan istemciyi "bağlı istemciler" listesine yazar. */
async function touchClient(auth: Authorized, name: string): Promise<void> {
  // Yazma yetkisi katalogdan gelir — yeni araç eklenince burası kendiliğinden doğru kalır.
  const writes = MCP_TOOL_CATALOG.filter(
    (tool) => tool.access === 'write' || tool.access === 'risky',
  ).map((tool) => tool.name);
  try {
    await repo.upsertMcpClient({
      projectId: auth.project.id,
      name,
      mode: auth.config.enabledTools.some((tool) => writes.includes(tool)) ? 'readwrite' : 'read',
      lastSeenAt: new Date().toISOString(),
    });
  } catch {
    // İstemci kaydı yazılamazsa bağlantı yine de kurulur.
  }
}

// ---- SSE aktarımı (tasarımdaki /sse adresi) ----

/** Aktif SSE oturumları: sessionId → transport. */
const sseSessions = new Map<string, { transport: SSEServerTransport; slug: string }>();

app.get('/mcp/:slug/sse', async (req, res) => {
  const auth = await authorize(req, res);
  if (!auth) return;

  const name = clientName(req);
  await touchClient(auth, name);

  const transport = new SSEServerTransport(`/mcp/${auth.project.slug}/messages`, res);
  sseSessions.set(transport.sessionId, { transport, slug: auth.project.slug });

  transport.onclose = () => {
    sseSessions.delete(transport.sessionId);
  };

  const server = buildServer(auth, name);
  await server.connect(transport);
});

app.post('/mcp/:slug/messages', async (req, res) => {
  const auth = await authorize(req, res);
  if (!auth) return;

  const sessionId = String(req.query.sessionId ?? '');
  const session = sseSessions.get(sessionId);

  // Oturumun gerçekten bu projeye ait olduğunu doğrula — token doğru olsa bile
  // başka bir projenin oturumuna mesaj yazılamamalı.
  if (!session || session.slug !== auth.project.slug) {
    res.status(404).json({ error: 'Oturum bulunamadı.' });
    return;
  }

  await session.transport.handlePostMessage(req, res, req.body);
});

// ---- Streamable HTTP aktarımı (yeni istemciler) ----

const httpSessions = new Map<string, { transport: StreamableHTTPServerTransport; slug: string }>();

app.all('/mcp/:slug', async (req, res) => {
  const auth = await authorize(req, res);
  if (!auth) return;

  const sessionId = req.header('mcp-session-id');
  const existing = sessionId ? httpSessions.get(sessionId) : undefined;

  if (existing && existing.slug !== auth.project.slug) {
    res.status(404).json({ error: 'Oturum bulunamadı.' });
    return;
  }

  if (existing) {
    await existing.transport.handleRequest(req, res);
    return;
  }

  const name = clientName(req);
  await touchClient(auth, name);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      httpSessions.set(id, { transport, slug: auth.project.slug });
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) httpSessions.delete(transport.sessionId);
  };

  const server = buildServer(auth, name);
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

app.listen(PORT, () => {
  console.log(
    `Takip MCP sunucusu :${PORT} — kaynak: ${localMode ? 'yerel tohum veri' : 'Appwrite'}`,
  );
  console.log(`  SSE:        GET  /mcp/<proje>/sse`);
  console.log(`  Streamable: POST /mcp/<proje>`);
});
