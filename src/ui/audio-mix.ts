/** RAF timestamps may precede performance.now() when requested in the same frame. */
export function audioLevel(value: number | undefined, fallback = 0): number {
  const level = Number.isFinite(value) ? value! : fallback;
  return Math.max(0, Math.min(1, level));
}

export function crossfadeProgress(frameTime: number, startedAt: number, duration = 1200): number {
  return audioLevel((frameTime - startedAt) / Math.max(1, duration));
}
