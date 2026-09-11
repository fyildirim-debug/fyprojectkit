import { useEffect, useRef, useState } from 'react';
import { formatStopwatch } from '@takip/shared';
import { useStore } from '../lib/store';

/**
 * Başlıktaki kronometre. Durdurulduğunda geçen süre zaman kaydı olarak yazılır;
 * bir dakikanın altındaki ölçümler kaydedilmez.
 */
export function Timer({ projectId }: { projectId: string }) {
  const { addTimeEntry } = useStore();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const tick = useRef<number | null>(null);

  useEffect(() => {
    if (startedAt === null) return undefined;
    tick.current = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
  }, [startedAt]);

  // Proje değişince sayaç sıfırlanır.
  useEffect(() => {
    setStartedAt(null);
    setSeconds(0);
  }, [projectId]);

  async function toggle() {
    if (startedAt === null) {
      setStartedAt(Date.now());
      setSeconds(0);
      return;
    }

    const minutes = Math.round((Date.now() - startedAt) / 60_000);
    const from = new Date(startedAt).toISOString();
    setStartedAt(null);
    setSeconds(0);

    if (minutes >= 1) {
      await addTimeEntry({
        projectId,
        itemId: null,
        startedAt: from,
        endedAt: new Date().toISOString(),
        minutes,
        note: 'kronometre',
      });
    }
  }

  return (
    <button
      type="button"
      className={`timer ${startedAt !== null ? 'timer--on' : ''}`}
      onClick={() => void toggle()}
      title={startedAt !== null ? 'Durdur ve kaydet' : 'Süre tutmaya başla'}
    >
      <span className="timer__dot" />
      {formatStopwatch(seconds)}
    </button>
  );
}
