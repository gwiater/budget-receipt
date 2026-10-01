/**
 * Pomiar czasu etapów odczytu paragonu (debug: co trwa najdłużej). Kroki trafiają do logu
 * kontenera i do odpowiedzi API jako `timings` — budżet pokazuje je przy paragonie.
 */
export function createTimer() {
  const startedAt = performance.now();
  const steps = [];

  return {
    steps,
    /** Dopisuje krok zmierzony na zewnątrz (np. pojedyncza próba modelu). */
    add(name, ms, extra = {}) {
      steps.push({ name, ms: Math.round(ms), ...extra });
    },
    /** Mierzy wywołanie `fn` (także gdy rzuci wyjątek). */
    async measure(name, fn) {
      const t = performance.now();
      try {
        return await fn();
      } finally {
        this.add(name, performance.now() - t);
      }
    },
    totalMs() {
      return Math.round(performance.now() - startedAt);
    },
    toJSON() {
      return { totalMs: this.totalMs(), steps };
    },
  };
}

/** Jedna linia do logu: „odczyt 14210 ms: build 3 ms, gemini-3.7-flash 503 1200 ms, ...”. */
export function formatTimings(timer) {
  const parts = timer.steps.map((s) => {
    const extra = Object.entries(s)
      .filter(([k]) => k !== 'name' && k !== 'ms')
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');
    return `${s.name} ${s.ms} ms${extra ? ` (${extra})` : ''}`;
  });
  return `odczyt ${timer.totalMs()} ms: ${parts.join(', ')}`;
}

/** `timer.measure`, gdy jest timer (API); bez niego (CLI) samo wywołanie. */
export function measure(timer, name, fn) {
  return timer ? timer.measure(name, fn) : fn();
}
