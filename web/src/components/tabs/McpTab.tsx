import { useMemo, useState } from 'react';
import {
  MCP_TOOL_CATALOG,
  buildProjectSkill,
  relativeTime,
  type McpToolName,
  type Project,
} from '@takip/shared';
import { useStore } from '../../lib/store';
import { useCopy } from '../../lib/ui';

const ACCESS_LABEL = {
  read: 'OKUMA',
  write: 'YAZMA',
  secret: 'GİZLİ',
  risky: 'RİSKLİ',
} as const;

/** Hareket glifi: Anton ok/işaret; anlam renkle değil glif ve metinle. */
const LOG_GLYPH: Record<string, string> = {
  update_status: '✓',
  list_bugs: '↓',
  get_bug: '↓',
  get_changelog: '↓',
  add_note: '+',
  add_bug: '+',
};

const MCP_BASE = (import.meta.env.VITE_MCP_BASE_URL as string | undefined) ?? window.location.origin;

/** Rastgele ama okunabilir bir proje tokenı üretir. */
function generateToken(slug: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `mcp_${slug.replace(/[^a-z0-9]/gi, '').slice(0, 6)}_${hex}`;
}

/**
 * 09 — Projenin kendi MCP sunucusu. Yapay zeka bu adres üzerinden
 * yalnızca bu projenin hatalarını okur, kapatır ve not yazar.
 */
export function McpTab({ project }: { project: Project }) {
  const { mcpConfigs, mcpClients, mcpLogs, links, upsertMcpConfig, updateMcpConfig, updateProject } =
    useStore();
  const { copied, copy } = useCopy();
  const [revealToken, setRevealToken] = useState(false);

  const config = useMemo(
    () => mcpConfigs.find((entry) => entry.projectId === project.id) ?? null,
    [mcpConfigs, project.id],
  );

  const clients = useMemo(
    () => mcpClients.filter((client) => client.projectId === project.id),
    [mcpClients, project.id],
  );

  const logs = useMemo(
    () =>
      mcpLogs
        .filter((log) => log.projectId === project.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12),
    [mcpLogs, project.id],
  );

  const endpoint = `${MCP_BASE}/mcp/${project.slug}/sse`;

  /** Projeye özel skill dosyası — adres, token ve açık araçlar gömülü gelir. */
  const skill = useMemo(
    () =>
      config
        ? buildProjectSkill({
            project,
            config,
            links: links.filter((link) => link.projectId === project.id),
            mcpBase: MCP_BASE,
          })
        : '',
    [project, config, links],
  );

  /** Tarayıcıdan dosya olarak indirir — panel dışına çıkmadan skill elde edilir. */
  function downloadSkill() {
    const blob = new Blob([skill], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'SKILL.md';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  const enabled = config?.enabledTools ?? [];
  const enabledCount = enabled.length;
  const disabledCount = MCP_TOOL_CATALOG.length - enabledCount;

  const snippet = `{
  "mcpServers": {
    "${project.slug}-takip": {
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer ${
        revealToken && config ? config.token : '***'
      }" }
    }
  }
}`;

  async function enable() {
    await upsertMcpConfig({
      projectId: project.id,
      enabled: true,
      token: generateToken(project.slug),
      enabledTools: MCP_TOOL_CATALOG.filter((tool) => tool.defaultEnabled).map((tool) => tool.name),
      autoApply: false,
      createdAt: new Date().toISOString(),
    });
    await updateProject(project.id, { mcpEnabled: true });
  }

  async function toggleTool(name: McpToolName) {
    if (!config) return;
    const next = enabled.includes(name)
      ? enabled.filter((tool) => tool !== name)
      : [...enabled, name];
    await updateMcpConfig(config.id, { enabledTools: next });
  }

  return (
    <>
      <div className="subbar">
        <span className="topbar__crumb">{project.name} /</span>
        <span className="topbar__title">MCP sunucusu</span>
        <span className={`pill ${config?.enabled ? 'pill--green' : 'pill--neutral'}`}>
          {config?.enabled ? 'AÇIK' : 'KAPALI'}
        </span>

        <div className="topbar__actions">
          {config && (
            <button
              type="button"
              className="btn"
              onClick={() => void updateMcpConfig(config.id, { token: generateToken(project.slug) })}
            >
              Anahtarı yenile
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => (config ? copy(endpoint, 'endpoint') : void enable())}
          >
            {config ? (copied === 'endpoint' ? 'Kopyalandı' : 'Bağlantıyı kopyala') : 'MCP’yi aç'}
          </button>
        </div>
      </div>

      {!config ? (
        <div className="empty">
          Bu proje için MCP sunucusu kapalı. Açtığında yapay zeka yalnızca {project.name}{' '}
          verisine erişir.
        </div>
      ) : (
        <div className="detail">
          <div className="detail__main">
            <section className="panel">
              <div className="panel__head">
                <span className="panel__title">Bu projenin MCP adresi</span>
                <span className="panel__meta">yalnızca {project.name} verisine erişir</span>
              </div>

              <div className="mcp__row">
                <div className="mcp__endpoint">{endpoint}</div>
                <button type="button" className="icon-btn" onClick={() => copy(endpoint, 'url')}>
                  {copied === 'url' ? 'KOPYALANDI' : 'KOPYALA'}
                </button>
              </div>

              <div className="mcp__row">
                <span className="col-head mcp__label">TOKEN</span>
                <div className="mcp__endpoint mcp__endpoint--muted">
                  {revealToken ? config.token : `${config.token.slice(0, 12)}${'•'.repeat(16)}`}
                </div>
                <button
                  type="button"
                  className={`icon-btn ${revealToken ? 'icon-btn--on' : ''}`}
                  onClick={() => setRevealToken((current) => !current)}
                >
                  {revealToken ? 'GİZLE' : 'GÖSTER'}
                </button>
                <button type="button" className="icon-btn" onClick={() => copy(config.token, 'token')}>
                  {copied === 'token' ? 'KOPYALANDI' : 'KOPYALA'}
                </button>
              </div>

              <pre className="mcp__json">{snippet}</pre>
            </section>

            <section className="panel">
              <div className="panel__head">
                <span className="panel__title">Yapay zeka skill'i</span>
                <span className="panel__meta">{project.slug} için hazır</span>
              </div>

              <p className="skill-card__lead">
                Tek dosya. Bu projenin MCP adresi, tokenı, açık araçları ve onay akışı
                içinde hazır gelir — yapay zekanın başka bir şey sorması gerekmez.
                Projenin <code>.claude/skills/takip/SKILL.md</code> yoluna ya da
                <code> ~/.claude/skills/takip-{project.slug}/SKILL.md</code> altına koy.
              </p>

              <div className="skill-card__actions">
                <button type="button" className="btn btn--primary" onClick={downloadSkill}>
                  SKILL.md indir
                </button>
                <button type="button" className="btn" onClick={() => copy(skill, 'skill')}>
                  {copied === 'skill' ? 'Kopyalandı' : 'Panoya kopyala'}
                </button>
                <span className="skill-card__warn">
                  Dosyada token var — <code>.gitignore</code>'a ekle, repoya commit etme.
                </span>
              </div>

              <details className="skill-card__peek">
                <summary>Ne yazıyor?</summary>
                <pre className="mcp__json">{skill}</pre>
              </details>
            </section>

            <section className="panel">
              <div className="panel__head">
                <span className="panel__title">Yapay zekaya açık araçlar</span>
                <span className="panel__meta">
                  {enabledCount} açık · {disabledCount} kapalı
                </span>
              </div>

              <div className="rows">
                {MCP_TOOL_CATALOG.map((tool) => {
                  const on = enabled.includes(tool.name);
                  return (
                    <div className={`tool-row ${on ? '' : 'tool-row--off'}`} key={tool.name}>
                      <span className="tool-row__name">{tool.name}</span>
                      <span className="tool-row__desc">{tool.description}</span>
                      <span className={`access access--${tool.access}`}>
                        {ACCESS_LABEL[tool.access]}
                      </span>
                      <button
                        type="button"
                        className={`toggle ${on ? 'toggle--on' : ''}`}
                        aria-pressed={on}
                        aria-label={`${tool.name} ${on ? 'kapat' : 'aç'}`}
                        onClick={() => void toggleTool(tool.name)}
                      >
                        <i />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="aside aside--mcp">
            <span className="eyebrow">BAĞLI İSTEMCİLER</span>
            <div className="stack" style={{ gap: 0 }}>
              {clients.map((client) => {
                const idle = Date.now() - new Date(client.lastSeenAt).getTime() > 60 * 60 * 1000;
                return (
                  <div className={`client ${idle ? 'client--idle' : ''}`} key={client.id}>
                    <span className="client__dot" />
                    <div className="cell-stack" style={{ flex: 1 }}>
                      <span className="client__name">{client.name}</span>
                      <span className="client__mode">
                        {client.mode === 'readwrite' ? 'okuma + yazma' : 'sadece okuma'}
                      </span>
                    </div>
                    <span className="row__time">{relativeTime(client.lastSeenAt)}</span>
                  </div>
                );
              })}
              {clients.length === 0 && (
                <span className="aside__hint">Henüz bağlanan istemci yok.</span>
              )}
            </div>

            <div className="divider" />

            <span className="eyebrow">YAPAY ZEKA HAREKETLERİ</span>
            <div className="stack" style={{ gap: 0 }}>
              {logs.map((log) => {
                const glyph = LOG_GLYPH[log.tool] ?? '·';
                return (
                  <div className="log" key={log.id}>
                    <div className="log__head">
                      <span className="log__glyph" aria-hidden="true">
                        {glyph}
                      </span>
                      <span>{log.tool}</span>
                      <time>{relativeTime(log.createdAt)}</time>
                    </div>
                    <span className="log__body">{log.summary}</span>
                  </div>
                );
              })}
              {logs.length === 0 && <span className="aside__hint">Henüz hareket yok.</span>}
            </div>

            <button
              type="button"
              className="mcp__note"
              onClick={() => void updateMcpConfig(config.id, { autoApply: !config.autoApply })}
            >
              Yazma işlemleri onay bekletilebilir:{' '}
              <b>otomatik uygula {config.autoApply ? 'açık' : 'kapalı'}</b>
            </button>
          </aside>
        </div>
      )}
    </>
  );
}
