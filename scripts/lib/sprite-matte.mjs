/** Remove a magenta compositing background without keying burgundy hair.
 * Strong magenta seeds include enclosed gaps between limbs; only connected,
 * equally red/blue fringe pixels may join them. Dark character colours and
 * reddish hair highlights remain opaque even next to the background. */
export function removeSpriteMatte(data, width, height) {
  const length = width * height, marked = new Uint8Array(length), queue = new Int32Array(length);
  let head = 0, tail = 0;
  const key = (p, strong) => {
    const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    // Bright, saturated edge blends are still matte even when red and blue
    // differ. Burgundy hair never has both channels this bright and green low.
    if (r > 180 && b > 180 && g < 60) return true;
    const chroma = Math.min(r, b) - g;
    return Math.min(r, b) > (strong ? 130 : 45) && chroma > (strong ? 65 : 25)
      && Math.abs(r - b) < chroma * .3;
  };
  const add = p => { marked[p] = 1; queue[tail++] = p; };
  for (let p = 0; p < length; p++) if (!data[p * 4 + 3] || key(p, true)) add(p);
  while (head < tail) {
    const p = queue[head++], x = p % width;
    for (const next of [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, p - width, p + width])
      if (next >= 0 && next < length && !marked[next] && key(next, false)) add(next);
  }
  for (let p = 0; p < length; p++) if (marked[p]) data.fill(0, p * 4, p * 4 + 4);
  return data;
}
