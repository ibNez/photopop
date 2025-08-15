// Utility helpers
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
export const toHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => ('0' + v.toString(16)).slice(-2)).join('');
export const fromHex = (hex) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { r: 0, g: 0, b: 0 };
};

export function download(filename, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function blobDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  download(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

// Selection helpers
export function createMask(w, h) {
  return new Uint8Array(w * h); // 0 or 1 per pixel
}

export function maskStrokeRect(mask, w, h, x, y, rw, rh, value = 1) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(w - 1, Math.floor(x + rw));
  const y1 = Math.min(h - 1, Math.floor(y + rh));
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const i = ix + iy * w;
      mask[i] = value;
    }
  }
}

export function maskFromFloodFill(imageData, w, h, sx, sy, tol = 24) {
  const d = imageData.data;
  const idx = (sx + sy * w) * 4;
  const target = [d[idx], d[idx + 1], d[idx + 2], d[idx + 3]];
  const mask = new Uint8Array(w * h);
  const stack = [[sx, sy]];
  function match(px, py) {
    const i = (px + py * w) * 4;
    const dr = d[i] - target[0];
    const dg = d[i + 1] - target[1];
    const db = d[i + 2] - target[2];
    const da = d[i + 3] - target[3];
    return Math.abs(dr) + Math.abs(dg) + Math.abs(db) + Math.abs(da) <= tol;
  }
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const si = cx + cy * w;
    if (mask[si]) continue;
    if (!match(cx, cy)) continue;
    mask[si] = 1;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return mask;
}

export function maskToOutlinePaths(mask, w, h) {
  // Simple boundary pixels list for marching ants; optimized approach omitted
  const edges = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = x + y * w;
      if (!mask[i]) continue;
      const up = mask[i - w], down = mask[i + w], left = mask[i - 1], right = mask[i + 1];
      if (!(up && down && left && right)) edges.push([x, y]);
    }
  }
  return edges;
}

// Cursor helpers
export function makeEmojiCursor(emoji, {
  size = 32, // CSS px for canvas size
  fontSize = 22, // emoji render size
  hotspot = { x: 8, y: 8 },
} = {}) {
  try {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="100%" height="100%" fill="rgba(0,0,0,0)"/>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="${fontSize}">${emoji}</text>
  <circle cx="2" cy="2" r="1.5" fill="rgba(0,0,0,0.45)"/>
</svg>`;
    const encoded = encodeURIComponent(svg)
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29');
    const url = `url("data:image/svg+xml,${encoded}") ${hotspot.x} ${hotspot.y}, auto`;
    return url;
  } catch {
    return 'crosshair';
  }
}
