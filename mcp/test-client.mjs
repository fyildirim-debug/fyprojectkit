#!/usr/bin/env node
/**
 * MCP sunucusunu uçtan uca dener: bağlan, araçları listele, bir hatayı oku,
 * yapıldı işaretle ve changelog'a düştüğünü doğrula.
 *
 *   node mcp/test-client.mjs [url] [token]
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.argv[2] ?? 'http://127.0.0.1:8787/mcp/nova-okul';
const token = process.argv[3] ?? 'mcp_nova_3f9a12c7d84be05a';

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${token}`, 'x-mcp-client': 'test-client' } },
});

const client = new Client({ name: 'takip-test', version: '1.0.0' });
await client.connect(transport);

const text = (result) => result.content.map((part) => part.text).join('\n');

const { tools } = await client.listTools();
console.log(`ARAÇLAR (${tools.length}): ${tools.map((tool) => tool.name).join(', ')}\n`);

console.log('--- list_bugs (öncelik ≥ yüksek) ---');
console.log(text(await client.callTool({ name: 'list_bugs', arguments: { min_priority: 'yuksek' } })));

console.log('\n--- get_bug #131 ---');
console.log(text(await client.callTool({ name: 'get_bug', arguments: { ref_no: 131 } })));

console.log('\n--- add_bug ---');
const added = text(
  await client.callTool({
    name: 'add_bug',
    arguments: {
      title: 'Yedekleme cronu pazar günleri atlıyor',
      description: 'Haftalık tetikleyici 0 3 * * 1-6 olarak kalmış',
      priority: 'yuksek',
      tag: 'backend',
    },
  }),
);
console.log(added);

console.log('\n--- update_status #130 ---');
console.log(text(await client.callTool({ name: 'update_status', arguments: { ref_no: 130 } })));

console.log('\n--- get_changelog ---');
console.log(text(await client.callTool({ name: 'get_changelog', arguments: { limit: 2 } })));

// Kapalı araçlar hiç kaydedilmediği için istemciye görünmez; çağrılırsa
// SDK "tool not found" hatası döndürür (isError: true).
console.log('\n--- kapalı araç denemesi: get_credentials ---');
const denied = await client.callTool({ name: 'get_credentials', arguments: {} }).catch((error) => ({
  isError: true,
  content: [{ text: error.message }],
}));
console.log(denied.isError ? `Reddedildi (beklenen): ${text(denied)}` : 'BEKLENMEDİK: kapalı araç çalıştı');

await client.close();
console.log('\nBitti.');
