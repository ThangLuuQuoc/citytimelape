// Generates the PWA icons (no dependencies): node tools/make-icons.mjs
// A night-time Chicago skyline with a Willis-like stepped tower over the lake.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, shade) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const SS = 3;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r / (SS * SS); raw[o + 1] = g / (SS * SS); raw[o + 2] = b / (SS * SS); raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// skyline: [x0, x1, top] in a 0..1 box; scaled into the icon's safe zone
const TOWERS = [
  [0.02, 0.1, 0.55], [0.1, 0.16, 0.42], [0.16, 0.24, 0.6], [0.24, 0.3, 0.35], [0.3, 0.37, 0.5],
  [0.37, 0.43, 0.28], [0.43, 0.47, 0.1], [0.47, 0.52, 0.18], [0.52, 0.58, 0.45], [0.58, 0.66, 0.32],
  [0.66, 0.72, 0.52], [0.72, 0.8, 0.22], [0.8, 0.86, 0.48], [0.86, 0.94, 0.38], [0.94, 0.99, 0.62],
];
function scene(pad) {
  return (u, v) => {
    const horizon = 0.66;
    const sky = mix([22, 33, 58], [74, 52, 70], Math.min(1, v / horizon));
    // moon
    const md = Math.hypot(u - 0.74, v - 0.24);
    let c = md < 0.065 ? [255, 214, 140] : mix(sky, [255, 190, 110], Math.max(0, 0.18 - md) * 1.6);
    // skyline (inside the safe zone)
    const su = (u - pad) / (1 - 2 * pad), sv = (v - pad) / (1 - 2 * pad);
    if (v < horizon && su > 0 && su < 1) {
      for (const [x0, x1, top] of TOWERS) {
        const t = 0.18 + top * 0.5;
        if (su >= x0 && su < x1 && sv > t) {
          c = [14, 19, 28];
          // lit windows
          const wx = Math.floor((su - x0) * 140), wy = Math.floor(sv * 140);
          if (wx % 2 === 0 && wy % 2 === 0 && ((wx * 7 + wy * 13 + Math.floor(x0 * 100)) % 5) < 2) c = [242, 180, 90];
        }
      }
      if (su > 0.43 && su < 0.47 && sv > 0.12 && sv < 0.24 && Math.abs(su - 0.45) < 0.004) c = [220, 220, 230]; // antenna
    }
    if (v >= horizon) {
      // lake with reflections
      c = mix([18, 52, 66], [8, 24, 34], (v - horizon) / (1 - horizon));
      const ref = Math.abs(u - 0.74) < 0.08 * (1 + (v - horizon) * 2) && Math.sin(v * 160) > 0.2;
      if (ref) c = mix(c, [242, 180, 90], 0.55);
      else if (Math.sin(v * 120 + u * 8) > 0.92) c = mix(c, [120, 160, 180], 0.3);
    }
    return c;
  };
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
const out = (name, size, pad) => writeFileSync(new URL(`../icons/${name}`, import.meta.url), png(size, scene(pad)));
out('icon-192.png', 192, 0.08);
out('icon-512.png', 512, 0.08);
out('icon-maskable-512.png', 512, 0.16);   // content kept inside the maskable safe circle
out('apple-touch-icon.png', 180, 0.1);
out('favicon-32.png', 32, 0.02);
console.log('icons written to icons/');
