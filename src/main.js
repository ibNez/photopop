import { $, $$, blobDownload } from './utils.js';
import {
  state,
  dpr,
  viewport,
  overlay,
  render,
  resizeViewport,
  setZoom,
  snapshot,
  undo,
  redo,
  newDoc,
  openImageFile,
  openProjectFile,
  exportFlat,
  updateUIFromDoc,
  runSelfTests,
  clearSelection,
  startAnts,
} from './state.js';
import { Layer } from './document.js';
import { setTool, wireCanvasEvents } from './tools.js';

window.addEventListener('DOMContentLoaded', () => {
  (function () {
    // init
    (async function init() {
      state.doc.addLayer(new Layer(state.doc.w, state.doc.h, 'Background'));
      const bg = state.doc.activeLayer();
      bg.ctx.fillStyle = '#111827';
      bg.ctx.fillRect(0, 0, state.doc.w, state.doc.h);
      await snapshot();
      updateUIFromDoc();
      setTool('move');
  startAnts();
      runSelfTests();
    })();

    // UI bindings - make optional since some moved to menus
    const newBtn = $('#newBtn');
    if (newBtn) newBtn.onclick = newDoc;
    const openBtn = $('#openBtn');
    if (openBtn) openBtn.onclick = () => $('#fileInput').click();
    $('#fileInput').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.type === 'application/json' || f.name.endsWith('.pxf')) await openProjectFile(f);
      else await openImageFile(f);
      e.target.value = '';
    });

    function exportFlatHandler(mime, quality) {
      return () => exportFlat(mime, quality);
    }
    // These buttons may not exist since we moved them to menus - make optional
    const savePNGBtn = document.getElementById('savePNGBtn');
    if (savePNGBtn) savePNGBtn.onclick = exportFlatHandler('image/png');
    const saveJPGBtn = document.getElementById('saveJPGBtn');
    if (saveJPGBtn) saveJPGBtn.onclick = exportFlatHandler('image/jpeg', 0.92);
    const saveProjBtn = document.getElementById('saveProjBtn');
    if (saveProjBtn) {
      saveProjBtn.onclick = () => {
        const json = JSON.stringify(state.doc.toProject());
        const blob = new Blob([json], { type: 'application/json' });
        blobDownload('photopop.pxf', blob);
      };
    }

    // Menu system: click to open, hover to switch, outside click to close
    const menuIds = ['menuFileWrap','menuEditWrap','menuSelectWrap','menuViewWrap','menuLayerWrap','menuColorsWrap','menuToolsWrap','menuHelpWrap'];
    let activeMenu = null;
    let clickOpen = false;
    
    function setMenuOpen(id) {
      activeMenu = id;
      clickOpen = true;
      menuIds.forEach(mid => {
        const el = document.getElementById(mid);
        if (el) el.classList.toggle('open', mid === id);
      });
    }
    
    function closeAllMenus() {
      activeMenu = null; 
      clickOpen = false;
      menuIds.forEach(mid => {
        const el = document.getElementById(mid);
        if (el) el.classList.remove('open');
      });
    }
    
    function toggleMenu(id) {
      const wrap = document.getElementById(id);
      if (!wrap) {
        console.warn('Menu element not found:', id);
        return;
      }
      
      if (wrap.classList.contains('open')) {
        closeAllMenus();
      } else {
        setMenuOpen(id);
      }
    }
    
    // Wire up menu buttons
    const menuButtons = [
      { btnId: 'menuFileBtn', wrapId: 'menuFileWrap' },
      { btnId: 'menuEditBtn', wrapId: 'menuEditWrap' },
      { btnId: 'menuSelectBtn', wrapId: 'menuSelectWrap' },
      { btnId: 'menuViewBtn', wrapId: 'menuViewWrap' },
      { btnId: 'menuLayerBtn', wrapId: 'menuLayerWrap' },
      { btnId: 'menuColorsBtn', wrapId: 'menuColorsWrap' },
      { btnId: 'menuToolsBtn', wrapId: 'menuToolsWrap' },
      { btnId: 'menuHelpBtn', wrapId: 'menuHelpWrap' }
    ];
    
    menuButtons.forEach(({ btnId, wrapId }) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          console.log(`${btnId} clicked`);
          toggleMenu(wrapId);
        });
        
        // Hover switching when a menu is already open
        btn.addEventListener('mouseenter', () => {
          if (clickOpen && activeMenu !== wrapId) {
            setMenuOpen(wrapId);
          }
        });
      } else {
        console.warn(`Menu button not found: ${btnId}`);
      }
    });
    
    // Close menus on outside click
    document.addEventListener('click', (e) => {
      if (!activeMenu) return;
      const isInsideMenubar = e.target.closest('.menubar');
      if (!isInsideMenubar) {
        closeAllMenus();
      }
    });
    
    // Close menus on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllMenus();
      }
    });

    const workspace = $('#workspace');
    ['dragenter', 'dragover'].forEach((ev) =>
      workspace.addEventListener(ev, (e) => {
        e.preventDefault();
        workspace.classList.add('dragover');
      }),
    );
    ['dragleave', 'drop'].forEach((ev) =>
      workspace.addEventListener(ev, (e) => {
        e.preventDefault();
        if (ev === 'drop') {
          const f = e.dataTransfer.files[0];
          if (f) {
            if (f.type === 'application/json' || f.name.endsWith('.pxf')) openProjectFile(f);
            else openImageFile(f);
          }
        }
        workspace.classList.remove('dragover');
      }),
    );

    function setStatusXY(pt) {
      $('#statusXY').textContent = `${Math.floor(pt.x)}, ${Math.floor(pt.y)}`;
    }

    function syncLayerControls() {
      const L = state.doc.activeLayer();
      if (!L) return;
      $('#blendMode').value = L.blend;
      $('#layerOpacity').value = Math.round(L.opacity * 100);
      $('#layerOpacityVal').textContent = Math.round(L.opacity * 100) + '%';
    }

    function updateLayersPanel() {
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

    function layerPanelSync() {
      updateLayersPanel();
      syncLayerControls();
      resizeViewport();
    }

    // Sidebar tools
    function bindTools() {
      $$('.tool[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
      $('#addLayerQuick').onclick = () => {
        const L = new Layer(state.doc.w, state.doc.h, 'Layer ' + (state.doc.layers.length + 1));
        state.doc.addLayer(L);
        snapshot();
        updateLayersPanel();
      };
    }
    bindTools();

    // Brush controls
    const sizeInput = $('#brushSize'),
      sizeVal = $('#brushSizeVal');
    sizeInput.oninput = () => {
      sizeVal.textContent = sizeInput.value;
    };
    const opInput = $('#brushOpacity'),
      opVal = $('#brushOpacityVal');
    opInput.oninput = () => {
      opVal.textContent = opInput.value + '%';
    };
    const hardInput = $('#hardness'),
      hardVal = $('#hardnessVal');
    hardInput.oninput = () => {
      hardVal.textContent = parseFloat(hardInput.value).toFixed(2);
    };

    // Wand tolerance UI
    const wandTol = $('#wandTolerance'), wandTolVal = $('#wandToleranceVal');
    if (wandTol) {
      wandTol.oninput = () => { wandTolVal.textContent = wandTol.value; };
      wandTolVal.textContent = wandTol.value;
    }

    $('#swapColors').onclick = () => {
      const a = $('#fgColor'),
        b = $('#bgColor');
      const t = a.value;
      a.value = b.value;
      b.value = t;
    };

    $('#addLayer').onclick = () => {
      const L = new Layer(state.doc.w, state.doc.h, 'Layer ' + (state.doc.layers.length + 1));
      state.doc.addLayer(L);
      snapshot();
      updateLayersPanel();
    };
    $('#delLayer').onclick = () => {
      if (state.doc.layers.length <= 1) return alert('At least one layer required.');
      state.doc.layers.splice(state.doc.active, 1);
      state.doc.active = Math.max(0, state.doc.active - 1);
      snapshot();
      updateLayersPanel();
      render();
    };
    $('#layerUp').onclick = () => {
      const i = state.doc.active;
      if (i < state.doc.layers.length - 1) {
        const t = state.doc.layers[i];
        state.doc.layers[i] = state.doc.layers[i + 1];
        state.doc.layers[i + 1] = t;
        state.doc.active = i + 1;
        snapshot();
        updateLayersPanel();
        render();
      }
    };
    $('#layerDown').onclick = () => {
      const i = state.doc.active;
      if (i > 0) {
        const t = state.doc.layers[i];
        state.doc.layers[i] = state.doc.layers[i - 1];
        state.doc.layers[i - 1] = t;
        state.doc.active = i - 1;
        snapshot();
        updateLayersPanel();
        render();
      }
    };
    $('#blendMode').onchange = (e) => {
      const L = state.doc.activeLayer();
      L.blend = e.target.value;
      snapshot();
      render();
    };
    $('#layerOpacity').oninput = (e) => {
      const L = state.doc.activeLayer();
      L.opacity = parseInt(e.target.value) / 100;
      $('#layerOpacityVal').textContent = Math.round(L.opacity * 100) + '%';
      render();
    };

    function applyAdjustmentsToLayer() {
      const L = state.doc.activeLayer();
      const { width: w, height: h } = L.canvas;
      const id = L.ctx.getImageData(0, 0, w, h);
      const d = id.data;
      const b = parseInt($('#adjBright').value);
      const c = parseInt($('#adjContrast').value);
      const gray = $('#adjGray').checked;
      const br = (b / 100) * 255;
      const cf = (259 * (c + 255)) / (255 * (259 - c));
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i],
          g = d[i + 1],
          b = d[i + 2];
        r = clamp(cf * (r - 128) + 128 + br, 0, 255);
        g = clamp(cf * (g - 128) + 128 + br, 0, 255);
        b = clamp(cf * (b - 128) + 128 + br, 0, 255);
        if (gray) {
          const avg = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = g = b = avg;
        }
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
      L.ctx.putImageData(id, 0, 0);
      snapshot();
      render();
    }
    $('#applyAdj').onclick = applyAdjustmentsToLayer;
    $('#resetAdj').onclick = () => {
      $('#adjBright').value = 0;
      $('#adjContrast').value = 0;
      $('#adjGray').checked = false;
      $('#adjBrightVal').textContent = '0';
      $('#adjContrastVal').textContent = '0';
    };
    $('#adjBright').oninput = (e) => ($('#adjBrightVal').textContent = e.target.value);
    $('#adjContrast').oninput = (e) => ($('#adjContrastVal').textContent = e.target.value);

    window.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        exportFlat('image/png');
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        $('#fileInput').click();
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        newDoc();
      } else if (e.key === ' ') {
        state.spacePanning = true;
        setTool('hand');
    } else if ('vhmzwbgeiloutc'.includes(e.key.toLowerCase())) {
        const map = {
          v: 'move',
          h: 'hand',
          z: 'zoom',
          m: 'marquee',
      w: 'wand',
          b: 'brush',
          g: 'bucket',
          e: 'eraser',
          i: 'eyedrop',
          l: 'line',
          o: 'ellipse',
          u: 'rect',
          t: 'text',
          c: 'crop',
        };
        setTool(map[e.key.toLowerCase()]);
      } else if (e.key === 'x' || e.key === 'X') {
        $('#swapColors').click();
      } else if (e.key === '0') {
        setZoom(1);
      } else if (e.key === '-') {
        setZoom(state.zoom * 0.9);
      } else if (e.key === '=') {
        setZoom(state.zoom * 1.1);
      } else if (e.key === 'Delete') {
        const L = state.doc.activeLayer();
        if (state.selection) {
          const r = (function normRect(r) {
            if (!r) return null;
            const x = Math.round(Math.min(r.x, r.x + r.w));
            const y = Math.round(Math.min(r.y, r.y + r.h));
            const w = Math.round(Math.abs(r.w));
            const h = Math.round(Math.abs(r.h));
            return { x, y, w, h };
          })(state.selection);
          L.ctx.clearRect(r.x, r.y, r.w, r.h);
          render();
          snapshot();
        } else if (state.selMask) {
          // Clear selected pixels based on raster mask
          const { width: w, height: h } = L.canvas;
          const id = L.ctx.getImageData(0, 0, w, h);
          const d = id.data;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (state.selMask[x + y * w]) {
                const i = (x + y * w) * 4;
                d[i + 3] = 0; // make transparent
              }
            }
          }
          L.ctx.putImageData(id, 0, 0);
          render();
          snapshot();
        }
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') {
        state.spacePanning = false;
        setTool('move');
      }
    });

    // Toolbar actions - make optional since some moved to menus
    const undoBtn = $('#undoBtn');
    if (undoBtn) undoBtn.onclick = undo;
    const redoBtn = $('#redoBtn');
    if (redoBtn) redoBtn.onclick = redo;
    $('#zoomInBtn').onclick = () => setZoom(state.zoom * 1.1);
    $('#zoomOutBtn').onclick = () => setZoom(state.zoom * 0.9);
    $('#zoomResetBtn').onclick = () => setZoom(1);
    
    // Zoom slider
    const zoomSlider = $('#zoomSlider');
    if (zoomSlider) {
      zoomSlider.oninput = () => {
        const val = parseInt(zoomSlider.value);
        setZoom(val / 100);
      };
    }

    // Menu item handlers
    // File menu - working items
    const fileNew = document.getElementById('fileNew');
    if (fileNew) fileNew.onclick = () => newDoc();
    
    const fileOpen = document.getElementById('fileOpen');
    if (fileOpen) fileOpen.onclick = () => document.getElementById('fileInput').click();
    
    const fileExportPNG = document.getElementById('fileExportPNG');
    if (fileExportPNG) fileExportPNG.onclick = () => exportFlat('image/png');
    
    const fileExportJPG = document.getElementById('fileExportJPG');
    if (fileExportJPG) fileExportJPG.onclick = () => exportFlat('image/jpeg', 0.92);
    
    const fileExportAs = document.getElementById('fileExportAs');
    if (fileExportAs) fileExportAs.onclick = () => {
      // TODO: Implement export dialog with format selection
      exportFlat('image/png');
    };
    
    const fileSaveProject = document.getElementById('fileSaveProject');
    if (fileSaveProject) fileSaveProject.onclick = () => {
      const json = JSON.stringify(state.doc.toProject());
      const blob = new Blob([json], { type: 'application/json' });
      blobDownload('photopop.pxf', blob);
    };

    // File menu - TODO placeholders  
    const todoItems = [
      // File Menu TODOs
      'fileOpenAsLayers', 'fileOpenLocation', 'fileOpenRecent',
      'fileSave', 'fileSaveAs', 'fileSaveCopy', 'fileRevert',
      'fileOverwriteExport', 'fileImport', 'filePrint', 'filePrintSize',
      'fileCloseAll', 'fileQuit',
      // Edit Menu TODOs  
      'editFade', 'editCut', 'editCopy', 'editCopyVisible', 'editPaste', 
      'editPasteAs', 'editPasteInto', 'editClear', 'editFill', 'editStroke', 'editPreferences',
      // Select Menu TODOs
      'selectAll', 'selectNone', 'selectInvert', 'selectFloat', 'selectByColor', 
      'selectFromPath', 'selectFeather', 'selectGrow', 'selectShrink', 'selectBorder', 
      'selectSave', 'selectPath',
      // View Menu TODOs
      'viewZoomIn', 'viewZoomOut', 'viewZoomFit', 'viewZoom100', 'viewFullscreen',
      'viewShowAll', 'viewDotForDot', 'viewShowGuides', 'viewSnapGuides', 'viewShowGrid',
      'viewSnapGrid', 'viewShowRulers', 'viewShowScrollbars', 'viewShowSelection', 'viewShowLayer',
      // Layer Menu TODOs
      'layerNew', 'layerDuplicate', 'layerAnchor', 'layerMergeDown', 'layerFlatten',
      'layerTextAlongPath', 'layerScale', 'layerCrop', 'layerRotate', 'layerTransparency',
      'layerMask', 'layerDelete',
      // Colors Menu TODOs
      'colorsForeground', 'colorsBackground', 'colorsSwap', 'colorsDefault', 'colorsInvert',
      'colorsDesaturate', 'colorsBrightness', 'colorsHueSaturation', 'colorsColorBalance',
      'colorsCurves', 'colorsLevels', 'colorsAutoNormalize', 'colorsAutoWhiteBalance', 'colorsAutoColorEnhance',
      // Tools Menu TODOs
      'toolsSelection', 'toolsPaint', 'toolsTransform', 'toolsColor', 'toolsRectSelect',
      'toolsEllipseSelect', 'toolsFreeSelect', 'toolsFuzzySelect', 'toolsByColorSelect',
      'toolsPaintbrush', 'toolsPencil', 'toolsEraser', 'toolsAirbrush', 'toolsClone',
      'toolsHeal', 'toolsPerspective', 'toolsBucketFill', 'toolsGradient', 'toolsText',
      // Help Menu TODOs
      'helpHelp', 'helpContextHelp', 'helpTipOfDay', 'helpUserManual', 'helpGIMPOnline',
      'helpPluginBrowser', 'helpProcedureBrowser', 'helpAbout'
    ];
    
    todoItems.forEach(itemId => {
      const item = document.getElementById(itemId);
      if (item) {
        item.onclick = () => {
          // Extract feature name from itemId (remove prefix like 'file', 'edit', etc.)
          const feature = itemId.replace(/^(file|edit|select|view|layer|colors?|tools?|help)/, '')
                                .replace(/([A-Z])/g, ' $1').trim();
          alert(`🚧 TODO: ${feature || itemId} feature not implemented yet`);
        };
      }
    });

    // Edit menu
    const editUndo = document.getElementById('editUndo');
    if (editUndo) editUndo.onclick = () => undo();
    
    const editRedo = document.getElementById('editRedo');
    if (editRedo) editRedo.onclick = () => redo();

    // Canvas interactions
    wireCanvasEvents();

    // Expose tiny test hook
    window.__photopopTest = { version: 1, state, exportFlat };
  })();
});
