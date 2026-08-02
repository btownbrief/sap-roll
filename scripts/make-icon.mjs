// Rebuild icon-180.png from simple vector-like drawing primitives.
// Uses only Node built-ins so the static project needs no dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const W = 180;
const H = 180;
const pixels = new Uint8Array(W * H * 4);

function color(hex) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}
function setPixel(x, y, fill) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const index = (y * W + x) * 4;
  pixels[index] = fill[0];
  pixels[index + 1] = fill[1];
  pixels[index + 2] = fill[2];
  pixels[index + 3] = 255;
}
function roundedRect(x, y, width, height, radius, fill) {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) {
      const dx = Math.max(x + radius - px, 0, px - (x + width - radius - 1));
      const dy = Math.max(y + radius - py, 0, py - (y + height - radius - 1));
      if (dx * dx + dy * dy <= radius * radius) setPixel(px, py, fill);
    }
  }
}
function circle(cx, cy, radius, fill) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) setPixel(x, y, fill);
    }
  }
}
function polygon(points, fill) {
  const minY = Math.floor(Math.min(...points.map((point) => point[1])));
  const maxY = Math.ceil(Math.max(...points.map((point) => point[1])));
  for (let y = minY; y <= maxY; y++) {
    const hits = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi > y) !== (yj > y)) hits.push(xi + (y - yi) * (xj - xi) / (yj - yi));
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i < hits.length; i += 2) {
      for (let x = Math.ceil(hits[i]); x <= Math.floor(hits[i + 1]); x++) setPixel(x, y, fill);
    }
  }
}

roundedRect(0, 0, W, H, 36, color('#173d2c'));
polygon([
  [90,18],[100,47],[126,33],[117,63],[150,64],[124,85],[151,103],[119,107],
  [129,137],[101,123],[90,153],[79,123],[51,137],[61,107],[29,103],[56,85],
  [30,64],[63,63],[54,33],[80,47],
], color('#c84b31'));
roundedRect(48, 48, 84, 84, 17, color('#fff3d7'));
roundedRect(53, 53, 74, 74, 13, color('#e6b96f'));
circle(70, 70, 7, color('#51331f'));
circle(90, 90, 7, color('#51331f'));
circle(110, 110, 7, color('#51331f'));

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  const row = y * (W * 4 + 1);
  raw[row] = 0;
  raw.set(pixels.subarray(y * W * 4, (y + 1) * W * 4), row + 1);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(W, 0);
header.writeUInt32BE(H, 4);
header.set([8, 6, 0, 0, 0], 8);
const png = Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('../icon-180.png', import.meta.url), png);
console.log('wrote icon-180.png (180×180)');
