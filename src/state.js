// App state and rendering/compositing
import { $, $$, clamp, toHex, fromHex, blobDownload, createMask, maskToOutlinePaths, maskFromFloodFill } from './utils.js';
import { Doc, Layer } from './document.js';

export const dpr = window.devicePixelRatio || 1;
export const viewport = $('#viewport');
export const overlay = $('#overlay');
export const ctx = viewport.getContext('2d');
export const octx = overlay.getContext('2d');

export const state = {
  doc: new Doc(1024, 768),
  zoom: 1,
  pan: { x: 0, y: 0 },
  tool: 'move',
  dragging: false,
  pt0: null,
  selection: null,
  selMask: null, // Uint8Array mask (w*h)
  selEdges: [],  // outline points for ants
  antsOffset: 0,
  spacePanning: false,
  hist: [],
  histIndex: -1,
  composite: null,
};

export function composite() {
  const c = document.createElement('canvas');
  c.width = state.doc.w;
  c.height = state.doc.h;
  const cctx = c.getContext('2d');
  cctx.clearRect(0, 0, c.width, c.height);
  for (const l of state.doc.layers) {
    if (!l.visible) continue;
    cctx.globalAlpha = l.opacity;
    cctx.globalCompositeOperation = l.blend;
    cctx.drawImage(l.canvas, 0, 0);
  }
  cctx.globalAlpha = 1;
  cctx.globalCompositeOperation = 'source-over';
  state.composite = c;
  return c;
}

export function render() {
  const comp = composite();
  ctx.save();
  ctx.setTransform(dpr * state.zoom, 0, 0, dpr * state.zoom, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  ctx.drawImage(comp, 0, 0);
  ctx.restore();
  octx.setTransform(dpr * state.zoom, 0, 0, dpr * state.zoom, 0, 0);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (state.selection) {
    const { x, y, w, h } = state.selection;
    octx.save();
    octx.strokeStyle = '#fff';
    octx.lineWidth = 1 / dpr;
    octx.setLineDash([6, 4]);
    octx.lineDashOffset = 0;
    octx.strokeRect(x + 0.5, y + 0.5, w, h);
    octx.restore();
  }
  if (state.selMask) {
    // dashed raster selection outline along pixel borders
    octx.save();
    octx.setTransform(dpr * state.zoom, 0, 0, dpr * state.zoom, 0, 0);
    octx.strokeStyle = '#fff';
    octx.lineWidth = 1 / dpr;
    octx.setLineDash([6, 4]);
    octx.lineDashOffset = 0;
    drawRasterSelectionDashed(octx, state.selMask, state.doc.w, state.doc.h);
    octx.restore();
  }
}

export function resizeViewport() {
  viewport.width = state.doc.w * dpr * state.zoom;
  viewport.height = state.doc.h * dpr * state.zoom;
  overlay.width = viewport.width;
  overlay.height = viewport.height;
  viewport.style.width = state.doc.w * state.zoom + 'px';
  viewport.style.height = state.doc.h * state.zoom + 'px';
  overlay.style.width = viewport.style.width;
  overlay.style.height = viewport.style.height;
  render();
}

export function setZoom(factor) {
  state.zoom = clamp(factor, 0.05, 8);
  $('#statusZoom').textContent = Math.round(state.zoom * 100) + '%';
  const zs = document.getElementById('zoomSlider');
  if (zs) zs.value = String(Math.round(state.zoom * 100));
  resizeViewport();
}

export const HIST_LIMIT = 20;
export async function snapshot() {
  const proj = state.doc.toProject();
  const json = JSON.stringify(proj);
  state.hist = state.hist.slice(0, state.histIndex + 1);
  state.hist.push(json);
  if (state.hist.length > HIST_LIMIT) state.hist.shift();
  state.histIndex = state.hist.length - 1;
}
export async function loadSnapshot(json) {
  const data = JSON.parse(json);
  const doc = new Doc(data.w, data.h);
  await doc.fromProject(data);
  state.doc = doc;
  updateUIFromDoc();
  setZoom(state.zoom);
}
export async function undo() {
  if (state.histIndex > 0) {
    state.histIndex--;
    await loadSnapshot(state.hist[state.histIndex]);
  }
}
export async function redo() {
  if (state.histIndex < state.hist.length - 1) {
    state.histIndex++;
    await loadSnapshot(state.hist[state.histIndex]);
  }
}

export function updateLayersPanel() {
  const list = $('#layers');
  list.innerHTML = '';
  [...state.doc.layers]
    .map((l, i) => ({ l, i }))
    .reverse()
    .forEach(({ l, i }) => {
      const el = document.createElement('div');
      el.className = 'layer-item';
      const idx = i;
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = l.visible;
      chk.addEventListener('change', () => {
        l.visible = chk.checked;
        snapshot();
        render();
      });
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = (i === state.doc.active ? '★ ' : '') + l.name;
      const ops = document.createElement('div');
      ops.className = 'ops';
      const sel = document.createElement('button');
      sel.textContent = '◉';
      sel.title = 'Activate';
      sel.onclick = () => {
        state.doc.active = idx;
        updateLayersPanel();
        syncLayerControls();
        render();
      };
      const dup = document.createElement('button');
      dup.textContent = '⧉';
      dup.title = 'Duplicate';
      dup.onclick = () => {
        const nl = l.clone();
        nl.name = l.name + ' copy';
        state.doc.layers.splice(idx + 1, 0, nl);
        state.doc.active = idx + 1;
        snapshot();
        updateLayersPanel();
        render();
      };
      ops.append(sel, dup);
      el.append(chk, name, ops);
      list.appendChild(el);
    });
}

export function syncLayerControls() {
  const L = state.doc.activeLayer();
  if (!L) return;
  $('#blendMode').value = L.blend;
  $('#layerOpacity').value = Math.round(L.opacity * 100);
  $('#layerOpacityVal').textContent = Math.round(L.opacity * 100) + '%';
}
export function updateUIFromDoc() {
  updateLayersPanel();
  syncLayerControls();
  resizeViewport();
}

export async function newDoc() {
  const w = parseInt(prompt('Width?', state.doc.w) || state.doc.w);
  const h = parseInt(prompt('Height?', state.doc.h) || state.doc.h);
  const doc = new Doc(clamp(w, 1, 8192), clamp(h, 1, 8192));
  doc.addLayer(new Layer(doc.w, doc.h, 'Background'));
  state.doc = doc;
  state.selection = null;
  state.selMask = null;
  state.selEdges = [];
  await snapshot();
  resizeViewport(); // Ensure the viewport is resized after creating a new document
  updateUIFromDoc();
}

export async function openImageFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  // Always size the document to the image dimensions to avoid cropping
  const doc = new Doc(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const L = new Layer(doc.w, doc.h, file.name.replace(/\.[^.]+$/, ''));
  L.ctx.drawImage(img, 0, 0);
  doc.addLayer(L);
  state.doc = doc;
  state.selection = null;
  state.selMask = null;
  state.selEdges = [];
  updateUIFromDoc();
  await snapshot();
  render();
  URL.revokeObjectURL(url);
}

export async function openProjectFile(file) {
  const txt = await file.text();
  const data = JSON.parse(txt);
  const doc = new Doc(data.w, data.h);
  await doc.fromProject(data);
  state.doc = doc;
  state.selection = null;
  state.selMask = null;
  state.selEdges = [];
  await snapshot();
  updateUIFromDoc();
}

export function exportFlat(mime = 'image/png', quality = 0.92) {
  const c = composite();
  c.toBlob(
    (b) => blobDownload(mime === 'image/png' ? 'photopop.png' : 'photopop.jpg', b),
    mime,
    quality,
  );
}

export function clientToDoc(e) {
  const rect = viewport.getBoundingClientRect();
  const x = (e.clientX - rect.left) / state.zoom;
  const y = (e.clientY - rect.top) / state.zoom;
  return { x: clamp(x, 0, state.doc.w), y: clamp(y, 0, state.doc.h) };
}

export function setRasterSelectionFromPoint(pt, tol = 24) {
  // Build mask from composite image for visual selection
  const comp = state.composite || composite();
  const cx = comp.getContext('2d');
  const w = comp.width, h = comp.height;
  const img = cx.getImageData(0, 0, w, h);
  const x = Math.min(Math.max(0, Math.floor(pt.x)), w - 1);
  const y = Math.min(Math.max(0, Math.floor(pt.y)), h - 1);
  state.selMask = maskFromFloodFill(img, w, h, x, y, tol);
  state.selEdges = maskToOutlinePaths(state.selMask, w, h);
  state.selection = null; // clear rect selection when raster selection is set
  render();
}

export function startAnts() {
  // No longer animating selection; keep for backward-compat no-op
}

function drawRasterSelectionDashed(ctx, mask, w, h) {
  ctx.beginPath();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = x + y * w;
      if (!mask[i]) continue;
      // top edge
      if (y === 0 || !mask[i - w]) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 1, y);
      }
      // bottom edge
      if (y === h - 1 || !mask[i + w]) {
        ctx.moveTo(x, y + 1);
        ctx.lineTo(x + 1, y + 1);
      }
      // left edge
      if (x === 0 || !mask[i - 1]) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 1);
      }
      // right edge
      if (x === w - 1 || !mask[i + 1]) {
        ctx.moveTo(x + 1, y);
        ctx.lineTo(x + 1, y + 1);
      }
    }
  }
  ctx.stroke();
}

export function clearSelection() {
  state.selection = null;
  state.selMask = null;
  state.selEdges = [];
  render();
}

export function pickColor(pt) {
  const comp = state.composite || composite();
  const cx = comp.getContext('2d');
  const p = cx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
  $('#fgColor').value = toHex(p[0], p[1], p[2]);
}

// Minimal self-tests
export function runSelfTests() {
  const tests = [];
  const ok = (name, cond) => tests.push({ name, pass: !!cond });
  ok('#fileExportPNG exists', !!document.getElementById('fileExportPNG'));
  ok('#fileExportJPG exists', !!document.getElementById('fileExportJPG'));
  ok('#fileSaveProject exists', !!document.getElementById('fileSaveProject'));
  ok('exportFlat available', typeof exportFlat === 'function');
  ok('Doc has at least 1 layer', state.doc.layers.length >= 1);
  const before = state.histIndex;
  state.doc.addLayer(new Layer(state.doc.w, state.doc.h, 'Test Layer'));
  snapshot();
  ok('snapshot increments history', state.histIndex > before);
  undo().then(() => {
    ok('undo works', state.histIndex === before);
    console.table(tests);
  });
}
