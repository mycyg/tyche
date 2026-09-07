/** Presentation only: retain fractional modifiers without exposing binary
 * floating-point tails. Never use this to settle or persist game resources. */
export function displayNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}
