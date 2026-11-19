/**
 * The frame the wallet speaks over a peer destination.
 *
 *   u32be length of what follows (request id plus payload), 4 KiB..1 MiB
 *   u32be request id, monotonic per client and echoed by the answer
 *   payload: UTF-8 JSON, { op, body } or { ok, body | error }
 *
 * A length, not a delimiter: a payload is arbitrary bytes once decoded, so a
 * delimiter would be a parsing bug waiting for the first payload that holds
 * one. The receiver buffers across arrivals and parses complete frames,
 * keeping the remainder, because the seam promises bytes and never frames.
 */

export const MAX_FRAME_BYTES = 1024 * 1024;
const HEADER_BYTES = 8;

export interface Frame {
  id: number;
  payload: Uint8Array;
}

export function encodeFrame(id: number, payload: Uint8Array): Uint8Array {
  if (payload.length + 4 > MAX_FRAME_BYTES)
    throw new Error("wallet: a peer frame is larger than one megabyte");
  const out = new Uint8Array(HEADER_BYTES + payload.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, payload.length + 4, false);
  view.setUint32(4, id >>> 0, false);
  out.set(payload, HEADER_BYTES);
  return out;
}

export class FrameReader {
  private buffer = new Uint8Array(0);

  /** Bytes arrived; return every complete frame now readable. */
  push(bytes: Uint8Array): Frame[] {
    if (bytes.length > 0) {
      const merged = new Uint8Array(this.buffer.length + bytes.length);
      merged.set(this.buffer);
      merged.set(bytes, this.buffer.length);
      this.buffer = merged;
    }
    const frames: Frame[] = [];
    let offset = 0;
    while (this.buffer.length - offset >= 4) {
      const view = new DataView(
        this.buffer.buffer,
        this.buffer.byteOffset + offset,
        4,
      );
      const length = view.getUint32(0, false);
      if (length < 4 || length > MAX_FRAME_BYTES)
        throw new Error(
          `wallet: a peer frame declares an impossible length of ${length}`,
        );
      if (this.buffer.length - offset - 4 < length) break;
      const id = new DataView(
        this.buffer.buffer,
        this.buffer.byteOffset + offset + 4,
        4,
      ).getUint32(0, false);
      const payload = this.buffer.slice(
        offset + HEADER_BYTES,
        offset + 4 + length,
      );
      frames.push({ id, payload });
      offset += 4 + length;
    }
    this.buffer = this.buffer.slice(offset);
    return frames;
  }

  /** How many bytes are buffered awaiting the rest of their frame. */
  pending(): number {
    return this.buffer.length;
  }
}
