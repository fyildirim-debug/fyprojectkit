import { CHANGE_KIND_LABELS, type ChangeEntry, type ChangeKind, type Release } from './types.js';
import { formatDate } from './format.js';

/** "v1.4.0" → [1, 4, 0]; biçim tanınmazsa [0, 0, 0]. */
export function parseVersion(version: string): [number, number, number] {
  const match = /v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

export type BumpLevel = 'major' | 'minor' | 'patch';

export function bumpVersion(version: string, level: BumpLevel = 'patch'): string {
  const [major, minor, patch] = parseVersion(version);
  if (level === 'major') return `v${major + 1}.0.0`;
  if (level === 'minor') return `v${major}.${minor + 1}.0`;
  return `v${major}.${minor}.${patch + 1}`;
}

/**
 * Kapanan maddelerin düşeceği taslak sürümün adı.
 * Yayındaki son sürümün bir yama üstü — tasarımdaki v1.4.0 → v1.4.1 akışı.
 */
export function nextDraftVersion(releases: Release[]): string {
  const latest = [...releases].sort((a, b) => compareVersions(b.version, a.version))[0];
  return latest ? bumpVersion(latest.version, 'patch') : 'v0.1.0';
}

const KIND_ORDER: ChangeKind[] = ['fix', 'new', 'improve', 'removed'];

/** Changelog'u panoya kopyalanabilir markdown'a çevirir. */
export function releasesToMarkdown(
  releases: Release[],
  entries: ChangeEntry[],
  projectName: string,
): string {
  const ordered = [...releases].sort((a, b) => compareVersions(b.version, a.version));
  const lines: string[] = [`# ${projectName} — Changelog`, ''];

  for (const release of ordered) {
    const mine = entries.filter((entry) => entry.releaseId === release.id);
    if (mine.length === 0) continue;

    const suffix = release.status === 'draft' ? ' _(taslak)_' : '';
    lines.push(`## ${release.version} — ${formatDate(release.date)}${suffix}`, '');

    for (const kind of KIND_ORDER) {
      const group = mine.filter((entry) => entry.kind === kind);
      if (group.length === 0) continue;
      lines.push(`### ${CHANGE_KIND_LABELS[kind]}`);
      for (const entry of group) {
        lines.push(`- ${entry.text}${entry.refNo ? ` (#${entry.refNo})` : ''}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}
