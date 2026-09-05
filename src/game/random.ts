// Keyed randomness: adding an unrelated scene never consumes another scene's roll.
export function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += h << 13;
  h ^= h >>> 7;
  h += h << 3;
  h ^= h >>> 17;
  h += h << 5;
  return h >>> 0;
}
export const random = (seed: string, key: string) =>
  hash(`${seed}\u0000${key}`) / 4294967296;
export const die = (seed: string, key: string) =>
  1 + Math.floor(random(seed, key) * 20);
export function shuffled<T>(
  items: readonly T[],
  seed: string,
  key: string,
): T[] {
  return items
    .map((value, i) => ({ value, rank: random(seed, `${key}:${i}`) }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.value);
}
