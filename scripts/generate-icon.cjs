'use strict';

const fs = require('node:fs');
const path = require('node:path');

const width = 256;
const height = 256;
const pixels = Buffer.alloc(width * height * 4);
const bg = [84, 47, 25, 255];
const gold = [255, 202, 66, 255];

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function pixel(x, y, rgba) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  pixels[i] = rgba[0]; pixels[i + 1] = rgba[1]; pixels[i + 2] = rgba[2]; pixels[i + 3] = rgba[3];
}

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const dx = x - 128;
    const dy = y - 128;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const roundedDistance = Math.hypot(Math.max(ax - 82, 0), Math.max(ay - 82, 0));
    let color = roundedDistance <= 46 && ax <= 112 && ay <= 112 ? bg : [0, 0, 0, 0];

    if (color[3]) {
      const r = Math.hypot(dx, dy);
      if ([80, 57, 34].some((radius, i) => Math.abs(r - radius) <= [4, 3.5, 3.5][i])) color = gold;
      if (segmentDistance(x, y, 128, 128, 188, 75) <= 5) color = gold;
      if (Math.hypot(x - 187, y - 76) <= 10) color = gold;
      if (Math.hypot(dx, dy) <= 9) color = gold;
      if ((Math.abs(dx) >= 87 && Math.abs(dx) <= 101 && Math.abs(dy) <= 3) ||
          (Math.abs(dy) >= 87 && Math.abs(dy) <= 101 && Math.abs(dx) <= 3)) color = gold;
    }

    pixel(x, height - 1 - y, color);
  }
}

// Single-image 32-bit ICO with an alpha channel.
const xorBytes = width * height * 4;
const andStride = Math.ceil(width / 32) * 4;
const andBytes = andStride * height;
const dib = Buffer.alloc(40 + xorBytes + andBytes);
dib.writeUInt32LE(40, 0);
dib.writeInt32LE(width, 4);
dib.writeInt32LE(height * 2, 8);
dib.writeUInt16LE(1, 12);
dib.writeUInt16LE(32, 14);
dib.writeUInt32LE(0, 16);
dib.writeUInt32LE(xorBytes, 20);
pixels.copy(dib, 40);
const icon = Buffer.alloc(6 + 16 + dib.length);
icon.writeUInt16LE(0, 0);
icon.writeUInt16LE(1, 2);
icon.writeUInt16LE(1, 4);
icon.writeUInt8(0, 6);
icon.writeUInt8(0, 7);
icon.writeUInt8(0, 8);
icon.writeUInt8(0, 9);
icon.writeUInt16LE(1, 10);
icon.writeUInt16LE(32, 12);
icon.writeUInt32LE(dib.length, 14);
icon.writeUInt32LE(22, 18);
dib.copy(icon, 22);

const output = path.join(__dirname, '..', 'build', 'icon.ico');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, icon);
console.log(`Generated AS-Radar-X icon: ${output}`);
