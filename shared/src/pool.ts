/**
 * İşleri en fazla `limit` tanesi aynı anda olacak şekilde çalıştırır.
 *
 * Yüzlerce kaydı tek tek göndermek hem dakikalar sürüyor hem de Appwrite'ın
 * hız sınırına takılıyor. Toplu uç varsa o tercih edilir; bu havuz, toplu
 * ucu olmayan uygulamalar için geri düşüş yolu.
 */
export async function runPooled(jobs: (() => Promise<unknown>)[], limit = 8): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor;
      cursor += 1;
      await jobs[index]();
    }
  });
  await Promise.all(workers);
}
