// Tools and interactions
import { $, $$, clamp, fromHex } from './utils.js';
import { state, dpr, viewport, overlay, octx, render, snapshot, setZoom, clientToDoc, pickColor, resizeViewport, setRasterSelectionFromPoint } from './state.js';
import { $ as qs, makeEmojiCursor } from './utils.js';

let tempPath = null;
let moveDX = 0,
  moveDY = 0;

export function setTool(t) {
  state.tool = t;
  $$('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  $('#statusTool').textContent = t[0].toUpperCase() + t.slice(1);
  applyCanvasCursor();
}

function drawSoftDot(ctx, x, y, size, hardness) {
  const r = size / 2;
  const erase = ctx.globalCompositeOperation === 'destination-out';
  const grad = ctx.createRadialGradient(x, y, r * hardness, x, y, r);
  grad.addColorStop(0, erase ? 'rgba(0,0,0,1)' : ctx.fillStyle);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function doMovePreview(pt) {
  const dx = pt.x - state.pt0.x,
    dy = pt.y - state.pt0.y;
  moveDX = dx;
  moveDY = dy;
  render();
  octx.save();
  octx.setTransform(dpr * state.zoom, 0, 0, dpr * state.zoom, 0, 0);
  octx.globalAlpha = 0.35;
  octx.drawImage(state.doc.activeLayer().canvas, dx, dy);
  octx.restore();
}
function commitMove() {
  if (moveDX || moveDY) {
    const L = state.doc.activeLayer();
    const tmp = document.createElement('canvas');
    tmp.width = L.canvas.width;
    tmp.height = L.canvas.height;
    const tctx = tmp.getContext('2d');
    tctx.clearRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(L.canvas, moveDX, moveDY);
    L.ctx.clearRect(0, 0, L.canvas.width, L.canvas.height);
    L.ctx.drawImage(tmp, 0, 0);
    moveDX = moveDY = 0;
    render();
    snapshot();
  }
}

function drawBrush(pt, e) {
  const L = state.doc.activeLayer();
  const isErase = state.tool === 'eraser';
  const size = parseInt($('#brushSize').value);
  const hardness = parseFloat($('#hardness').value);
  const opacity = (parseInt($('#brushOpacity').value) / 100) * (e.pressure || 1);
  const ctx = L.ctx;
  ctx.save();
  if (isErase) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = opacity;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = opacity;
    ctx.fillStyle = $('#fgColor').value;
  }
  const last = tempPath[tempPath.length - 1];
  const dx = pt.x - last.x,
    dy = pt.y - last.y;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(1, size * 0.35);
  for (let t = 0; t <= dist; t += step) {
    const x = last.x + (dx * t) / dist,
      y = last.y + (dy * t) / dist;
    if (!withinSelection({ x, y })) continue;
    drawSoftDot(ctx, x, y, size, hardness);
  }
  tempPath.push({ x: pt.x, y: pt.y });
  ctx.restore();
  render();
}

function withinSelection(pt) {
  if (state.selMask) {
    const x = Math.floor(pt.x), y = Math.floor(pt.y);
    if (x < 0 || y < 0 || x >= state.doc.w || y >= state.doc.h) return false;
    return state.selMask[x + y * state.doc.w] === 1;
  }
  if (state.selection) {
    const { x, y, w, h } = state.selection;
    return pt.x >= x && pt.y >= y && pt.x <= x + w && pt.y <= y + h;
  }
  return true;
}

function drawShapePreview() {
  if (!tempPath || tempPath.length < 2) return;
  const a = tempPath[0],
    b = tempPath[1];
  octx.save();
  octx.setTransform(dpr * state.zoom, 0, 0, dpr * state.zoom, 0, 0);
  octx.lineWidth = 1;
  octx.strokeStyle = '#7dd3fc';
  octx.fillStyle = 'rgba(125,211,252,.15)';
  if (state.tool === 'line') {
    octx.beginPath();
    octx.moveTo(a.x, a.y);
    octx.lineTo(b.x, b.y);
    octx.stroke();
  }
  if (state.tool === 'rect') {
    const x = Math.min(a.x, b.x),
      y = Math.min(a.y, b.y),
      w = Math.abs(b.x - a.x),
      h = Math.abs(b.y - a.y);
    octx.strokeRect(x, y, w, h);
  }
  if (state.tool === 'ellipse') {
    const cx = (a.x + b.x) / 2,
      cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2,
      ry = Math.abs(b.y - a.y) / 2;
    octx.beginPath();
    octx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    octx.stroke();
  }
  octx.restore();
}
function commitShape() {
  if (!tempPath || tempPath.length < 2) return;
  const a = tempPath[0],
    b = tempPath[1];
  const L = state.doc.activeLayer();
  const mode = $('#shapeMode').value;
  const sw = parseInt($('#strokeWidth').value);
  const ctx = L.ctx;
  ctx.save();
  ctx.globalAlpha = parseInt($('#brushOpacity').value) / 100;
  ctx.fillStyle = $('#fgColor').value;
  ctx.strokeStyle = $('#fgColor').value;
  ctx.lineWidth = sw;
  ctx.lineJoin = 'round';
  if (state.tool === 'line') {
    if (withinSelection(a) && withinSelection(b)) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  if (state.tool === 'rect') {
    const x = Math.min(a.x, b.x),
      y = Math.min(a.y, b.y),
      w = Math.abs(b.x - a.x),
      h = Math.abs(b.y - a.y);
    if (mode !== 'stroke') ctx.fillRect(x, y, w, h);
    if (mode !== 'fill') ctx.strokeRect(x, y, w, h);
  }
  if (state.tool === 'ellipse') {
    const cx = (a.x + b.x) / 2,
      cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2,
      ry = Math.abs(b.y - a.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (mode !== 'stroke') ctx.fill();
    if (mode !== 'fill') ctx.stroke();
  }
  ctx.restore();
  render();
}

function doBucketFill(pt) {
  const L = state.doc.activeLayer();
  const x = Math.floor(pt.x),
    y = Math.floor(pt.y);
  const tol = 24;
  const { width: w, height: h } = L.canvas;
  const id = L.ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const idx = (x + y * w) * 4;
  const target = [d[idx], d[idx + 1], d[idx + 2], d[idx + 3]];
  const fill = fromHex($('#fgColor').value);
  const stack = [[x, y]];
  const seen = new Uint8Array(w * h);
  function match(px, py) {
    const i = (px + py * w) * 4;
    const dr = d[i] - target[0],
      dg = d[i + 1] - target[1],
      db = d[i + 2] - target[2],
      da = d[i + 3] - target[3];
    return Math.abs(dr) + Math.abs(dg) + Math.abs(db) + Math.abs(da) <= tol;
  }
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const si = cx + cy * w;
    if (seen[si]) continue;
    seen[si] = 1;
    if (!match(cx, cy)) continue;
    const i = si * 4;
    d[i] = fill.r;
    d[i + 1] = fill.g;
    d[i + 2] = fill.b;
    d[i + 3] = 255;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  L.ctx.putImageData(id, 0, 0);
  render();
}

function startTextEdit(pt) {
  const textEditor = $('#textEditor');
  textEditor.style.display = 'block';
  textEditor.style.left = pt.x * state.zoom + 'px';
  textEditor.style.top = pt.y * state.zoom + 'px';
  textEditor.style.font = fontCSS();
  textEditor.style.color = $('#fgColor').value;
  textEditor.value = '';
  textEditor.focus();
}
function fontCSS() {
  const fam = $('#fontFamily').value;
  const size = parseInt($('#fontSize').value);
  const style = $('#fontStyle').value;
  return style + ' ' + size + 'px ' + fam;
}
function commitText() {
  const textEditor = $('#textEditor');
  const text = textEditor.value;
  if (!text.trim()) {
    cancelText();
    return;
  }
  const x = parseInt(textEditor.style.left) / state.zoom;
  const y = parseInt(textEditor.style.top) / state.zoom + parseInt($('#fontSize').value);
  const L = state.doc.activeLayer();
  const ctx = L.ctx;
  ctx.save();
  ctx.font = fontCSS();
  ctx.textAlign = $('#textAlign').value;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = $('#fgColor').value;
  ctx.globalAlpha = parseInt($('#brushOpacity').value) / 100;
  for (const [i, line] of text.split(/\n/).entries()) {
    ctx.fillText(line, x, y + i * (parseInt($('#fontSize').value) * 1.25));
  }
  ctx.restore();
  textEditor.style.display = 'none';
  textEditor.value = '';
  snapshot();
  render();
}
function cancelText() {
  const textEditor = $('#textEditor');
  textEditor.style.display = 'none';
  textEditor.value = '';
  render();
}

function normRect(r) {
  if (!r) return null;
  const x = Math.round(Math.min(r.x, r.x + r.w));
  const y = Math.round(Math.min(r.y, r.y + r.h));
  const w = Math.round(Math.abs(r.w));
  const h = Math.round(Math.abs(r.h));
  return { x, y, w, h };
}
function confirmCrop() {
  const r = normRect(state.selection);
  if (!r || r.w < 2 || r.h < 2) {
    state.selection = null;
    render();
    return;
  }
  if (!confirm('Crop to selection?')) {
    return;
  }
  state.doc.w = r.w;
  state.doc.h = r.h;
  for (const L of state.doc.layers) {
    const tmp = document.createElement('canvas');
    tmp.width = r.w;
    tmp.height = r.h;
    tmp.getContext('2d').drawImage(L.canvas, -r.x, -r.y);
    L.canvas.width = r.w;
    L.canvas.height = r.h;
    L.ctx = L.canvas.getContext('2d');
    L.ctx.drawImage(tmp, 0, 0);
  }
  state.selection = null;
  snapshot();
  resizeViewport();
}

function onDown(e) {
  e.preventDefault();
  viewport.setPointerCapture(e.pointerId);
  state.dragging = true;
  const pt = clientToDoc(e);
  state.pt0 = pt;
  $('#statusXY').textContent = `${Math.floor(pt.x)}, ${Math.floor(pt.y)}`;
  if (state.tool === 'marquee') {
    state.selection = { x: pt.x, y: pt.y, w: 0, h: 0 };
  }
  if (state.tool === 'text') startTextEdit(pt);
  tempPath = [{ x: pt.x, y: pt.y, p: e.pressure || 1 }];
}
function onMove(e) {
  const pt = clientToDoc(e);
  $('#statusXY').textContent = `${Math.floor(pt.x)}, ${Math.floor(pt.y)}`;
  if (state.dragging) {
    if (state.tool === 'move') doMovePreview(pt);
    else if (state.tool === 'hand' || state.spacePanning) {
      // panning placeholder
    } else if (state.tool === 'marquee') {
      const r = state.selection;
      r.w = pt.x - r.x;
      r.h = pt.y - r.y;
      render();
    } else if (state.tool === 'brush' || state.tool === 'eraser') {
      drawBrush(pt, e);
    } else if (state.tool === 'line' || state.tool === 'rect' || state.tool === 'ellipse') {
      tempPath[1] = { x: pt.x, y: pt.y };
      render();
      drawShapePreview();
    } else if (state.tool === 'bucket') {
      // bucket handled on click
    } else if (state.tool === 'crop') {
      state.selection = state.selection || { x: state.pt0.x, y: state.pt0.y, w: 0, h: 0 };
      const r = state.selection;
      r.w = pt.x - r.x;
      r.h = pt.y - r.y;
      render();
    }
  }
}
function onUp(e) {
  state.dragging = false;
  const pt = clientToDoc(e);
  if (state.tool === 'move') commitMove();
  else if (state.tool === 'marquee') {
  } else if (state.tool === 'brush' || state.tool === 'eraser') {
    snapshot();
  } else if (state.tool === 'line' || state.tool === 'rect' || state.tool === 'ellipse') {
    commitShape();
    snapshot();
  } else if (state.tool === 'bucket') {
    doBucketFill(pt);
    snapshot();
  } else if (state.tool === 'wand') {
    const tol = parseInt(qs('#wandTolerance').value) || 24;
    setRasterSelectionFromPoint(pt, tol);
  } else if (state.tool === 'crop') {
    confirmCrop();
  }
  tempPath = null;
}

export function wireCanvasEvents() {
  viewport.addEventListener('pointerdown', onDown);
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);
  viewport.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const f = e.deltaY < 0 ? state.zoom * 1.1 : state.zoom * 0.9;
      setZoom(f);
    }
  });
  viewport.addEventListener('click', (e) => {
    if (state.tool === 'eyedrop') {
      pickColor(clientToDoc(e));
    }
  });
  viewport.addEventListener('click', (e) => {
    if (state.tool === 'bucket' && !state.dragging) {
      doBucketFill(clientToDoc(e));
      snapshot();
    }
    if (state.tool === 'wand' && !state.dragging) {
      const pt = clientToDoc(e);
      const tol = parseInt(qs('#wandTolerance').value) || 24;
      setRasterSelectionFromPoint(pt, tol);
    }
  });

  // cursor in/out handling
  viewport.addEventListener('mouseenter', applyCanvasCursor);
  viewport.addEventListener('mouseleave', resetCanvasCursor);
}

function toolToCursor(tool) {
  // Use emoji cursors for high-contrast hints; fallback to standard cursors
  switch (tool) {
    case 'move': return 'move';
    case 'hand': return 'grab';
    case 'zoom': return makeEmojiCursor('🔎', { hotspot: { x: 8, y: 8 } });
    case 'marquee': return 'crosshair';
    case 'wand': return makeEmojiCursor('🪄', { hotspot: { x: 6, y: 6 } });
    case 'brush': return makeEmojiCursor('🖌️', { hotspot: { x: 8, y: 8 } });
    case 'eraser': return makeEmojiCursor('🩹', { hotspot: { x: 8, y: 8 } });
    case 'bucket': return makeEmojiCursor('🪣', { hotspot: { x: 8, y: 8 } });
    case 'eyedrop': return makeEmojiCursor('🎯', { hotspot: { x: 8, y: 8 } });
    case 'line': return 'crosshair';
    case 'rect': return 'crosshair';
    case 'ellipse': return 'crosshair';
    case 'text': return 'text';
    case 'crop': return 'crosshair';
    default: return 'default';
  }
}

function applyCanvasCursor() {
  viewport.style.cursor = toolToCursor(state.tool);
}
function resetCanvasCursor() {
  viewport.style.cursor = 'default';
}
