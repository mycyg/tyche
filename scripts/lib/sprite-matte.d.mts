/** Mutates an RGBA buffer, preserving non-matte source pixels. */
export function removeSpriteMatte<T extends Uint8Array>(data: T, width: number, height: number): T;
