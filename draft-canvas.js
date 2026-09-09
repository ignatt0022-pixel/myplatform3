/* ===================================================
   Рисование в черновике урока: кисть, ластик, толщина,
   отмена/повтор (undo/redo), сохранение рисунка между
   переключениями режима текст <-> рисование,
   бесконечный холст с масштабированием и перемещением
   =================================================== */

let draftDrawMode = false;
let draftTool = 'pen';
let draftThickness = 3;
let draftColor = '#4b4b4b';
let draftDpr = window.devicePixelRatio || 1;
let draftIsFullscreen = false;
let draftFullscreenPlaceholder = null;

// Все линии хранятся в "мировых" координатах — не зависят от масштаба/сдвига камеры
let draftStrokes = [];
let draftCurrentStroke = null;

let draftHistory = [];
let draftHistoryIndex = -1;

// Камера: масштаб и сдвиг видимой области
let draftZoom = 1;
let draftPanX = 0;
let draftPanY = 0;

let draftActivePointers = new Map();
let draftPinchStartDist = 0;
let draftPinchStartZoom = 1;
let draftPinchWorldAnchor = { x: 0, y: 0 };

function initDraftCanvas() {
    const canvas = document.getElementById('l-draft-canvas');
    if (!canvas) return;

    resizeDraftCanvas();

    canvas.addEventListener('pointerdown', draftPointerDown);
    canvas.addEventListener('pointermove', draftPointerMove);
    window.addEventListener('pointerup', draftPointerUp);
    window.addEventListener('pointercancel', draftPointerUp);
    window.addEventListener('resize', resizeDraftCanvas);

    updateDraftHistoryButtons();
}

function resizeDraftCanvas() {
    const canvas = document.getElementById('l-draft-canvas');
    if (!canvas) return;

    const cssWidth = canvas.parentElement.clientWidth;
    const cssHeight = canvas.clientHeight || 240;
    draftDpr = window.devicePixelRatio || 1;

    canvas.width = cssWidth * draftDpr;
    canvas.height = cssHeight * draftDpr;

    redrawDraftCanvas();
}

// Экранные координаты -> мировые (с учётом текущей камеры)
function screenToWorld(x, y) {
    return {
        x: (x - draftPanX) / draftZoom,
        y: (y - draftPanY) / draftZoom
    };
}

function getDraftScreenPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function redrawDraftCanvas() {
    const canvas = document.getElementById('l-draft-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(draftDpr, 0, 0, draftDpr, 0, 0);
    ctx.translate(draftPanX, draftPanY);
    ctx.scale(draftZoom, draftZoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const allStrokes = draftCurrentStroke ? [...draftStrokes, draftCurrentStroke] : draftStrokes;

    allStrokes.forEach(stroke => {
        if (stroke.points.length < 2) return;
        ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.lineWidth = stroke.tool === 'eraser' ? stroke.thickness * 3 : stroke.thickness;
        ctx.strokeStyle = stroke.color || '#4b4b4b';
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
    });
}

function draftPointerDown(e) {
    if (!draftDrawMode) return;
    const canvas = document.getElementById('l-draft-canvas');
    draftActivePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (draftActivePointers.size === 1) {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        const screenPos = getDraftScreenPos(e, canvas);
        draftCurrentStroke = { tool: draftTool, thickness: draftThickness, color: draftColor, points: [screenToWorld(screenPos.x, screenPos.y)] };
    } else if (draftActivePointers.size === 2) {
        // Второй палец — отменяем текущий штрих, начинаем жест масштаба/перемещения
        draftCurrentStroke = null;
        const canvas = document.getElementById('l-draft-canvas');
        const rect = canvas.getBoundingClientRect();
        const pts = Array.from(draftActivePointers.values());
        draftPinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        draftPinchStartZoom = draftZoom;
        const mid = { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top };
        draftPinchWorldAnchor = screenToWorld(mid.x, mid.y);
    }
}

function draftPointerMove(e) {
    if (!draftActivePointers.has(e.pointerId)) return;
    draftActivePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (draftActivePointers.size === 1 && draftCurrentStroke) {
        e.preventDefault();
        const canvas = document.getElementById('l-draft-canvas');
        const screenPos = getDraftScreenPos(e, canvas);
        draftCurrentStroke.points.push(screenToWorld(screenPos.x, screenPos.y));
        redrawDraftCanvas();
    } else if (draftActivePointers.size === 2) {
        e.preventDefault();
        const canvas = document.getElementById('l-draft-canvas');
        const rect = canvas.getBoundingClientRect();
        const pts = Array.from(draftActivePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const mid = { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top };

        draftZoom = Math.min(4, Math.max(0.3, draftPinchStartZoom * (dist / draftPinchStartDist)));
        draftPanX = mid.x - draftPinchWorldAnchor.x * draftZoom;
        draftPanY = mid.y - draftPinchWorldAnchor.y * draftZoom;

        redrawDraftCanvas();
    }
}

function draftPointerUp(e) {
    draftActivePointers.delete(e.pointerId);

    if (draftActivePointers.size === 0 && draftCurrentStroke) {
        if (draftCurrentStroke.points.length > 1) {
            draftStrokes.push(draftCurrentStroke);
            pushDraftHistory();
        }
        draftCurrentStroke = null;
        redrawDraftCanvas();
    }
}

function toggleDraftDrawMode() {
    draftDrawMode = !draftDrawMode;

    const mathField = document.getElementById('l-draft');
    const canvas = document.getElementById('l-draft-canvas');
    const toggleBtn = document.getElementById('draft-mode-toggle');
    const toolIds = ['draft-tool-pen', 'draft-tool-eraser', 'draft-color-wrap', 'draft-clear-btn'];
    const slider = document.getElementById('draft-thickness');
    const topControls = document.getElementById('draft-top-controls');
    const toolbar = document.getElementById('draft-toolbar');
    const modeCorner = document.getElementById('draft-mode-corner');

    if (draftDrawMode) {
        mathField.classList.add('hidden');
        canvas.classList.remove('hidden');
        if (topControls) topControls.classList.remove('hidden');
        toolbar.classList.remove('hidden');
        modeCorner.classList.add('hidden');
        toggleBtn.classList.add('active');
        toolIds.forEach(id => document.getElementById(id).classList.remove('hidden'));
        slider.classList.remove('hidden');
        if (topControls) topControls.appendChild(toggleBtn);
        resizeDraftCanvas();
    } else {
        mathField.classList.remove('hidden');
        canvas.classList.add('hidden');
        if (topControls) topControls.classList.add('hidden');
        toolbar.classList.add('hidden');
        modeCorner.classList.remove('hidden');
        toggleBtn.classList.remove('active');
        toolIds.forEach(id => document.getElementById(id).classList.add('hidden'));
        slider.classList.add('hidden');
        modeCorner.appendChild(toggleBtn);
    }
}

function setDraftTool(tool) {
    draftTool = tool;
    document.getElementById('draft-tool-pen').classList.toggle('active', tool === 'pen');
    document.getElementById('draft-tool-eraser').classList.toggle('active', tool === 'eraser');
}

function setDraftThickness(value) {
    draftThickness = parseInt(value, 10);
}
function toggleDraftFullscreen() {
    draftIsFullscreen = !draftIsFullscreen;
    const wrap = document.getElementById('l-draft-input-group');
    const btn = document.getElementById('draft-fullscreen-btn');

    if (draftIsFullscreen) {
        draftFullscreenPlaceholder = document.createComment('draft-fullscreen-placeholder');
        wrap.parentNode.insertBefore(draftFullscreenPlaceholder, wrap);
        document.body.appendChild(wrap);
    } else if (draftFullscreenPlaceholder) {
        draftFullscreenPlaceholder.parentNode.insertBefore(wrap, draftFullscreenPlaceholder);
        draftFullscreenPlaceholder.remove();
        draftFullscreenPlaceholder = null;
    }

    wrap.classList.toggle('draft-fullscreen', draftIsFullscreen);
    btn.classList.toggle('active', draftIsFullscreen);
    document.body.classList.toggle('draft-fullscreen-open', draftIsFullscreen);
    resizeDraftCanvas();
}
function setDraftColor(color) {
    draftColor = color;
    const swatch = document.getElementById('draft-color-swatch');
    if (swatch) swatch.style.background = color;
    document.querySelectorAll('.draft-color-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === color);
    });
    toggleDraftColorPicker(false);
}

function toggleDraftColorPicker(forceState) {
    const popup = document.getElementById('draft-color-popup');
    if (!popup) return;
    const show = forceState !== undefined ? forceState : popup.classList.contains('hidden');
    popup.classList.toggle('hidden', !show);
}

function clearDraftCanvas() {
    if (draftStrokes.length === 0) return;
    draftStrokes = [];
    redrawDraftCanvas();
    pushDraftHistory();
}

function pushDraftHistory() {
    draftHistory = draftHistory.slice(0, draftHistoryIndex + 1);
    draftHistory.push(JSON.parse(JSON.stringify(draftStrokes)));
    if (draftHistory.length > 40) draftHistory.shift();
    draftHistoryIndex = draftHistory.length - 1;
    updateDraftHistoryButtons();
}

function undoDraft() {
    if (draftHistoryIndex < 0) return;
    draftHistoryIndex--;
    draftStrokes = draftHistoryIndex >= 0 ? JSON.parse(JSON.stringify(draftHistory[draftHistoryIndex])) : [];
    redrawDraftCanvas();
    updateDraftHistoryButtons();
}

function redoDraft() {
    if (draftHistoryIndex >= draftHistory.length - 1) return;
    draftHistoryIndex++;
    draftStrokes = JSON.parse(JSON.stringify(draftHistory[draftHistoryIndex]));
    redrawDraftCanvas();
    updateDraftHistoryButtons();
}

function updateDraftHistoryButtons() {
    const undoBtn = document.getElementById('draft-undo-btn');
    const redoBtn = document.getElementById('draft-redo-btn');
    if (undoBtn) undoBtn.disabled = draftHistoryIndex < 0;
    if (redoBtn) redoBtn.disabled = draftHistoryIndex >= draftHistory.length - 1;
}

// Вызывается из loadTask() в script.js при переходе к новому заданию
function resetDraftCanvasForNewTask() {
    if (draftIsFullscreen) toggleDraftFullscreen();
    draftStrokes = [];
    draftCurrentStroke = null;
    draftHistory = [];
    draftHistoryIndex = -1;
    draftZoom = 1;
    draftPanX = 0;
    draftPanY = 0;
    updateDraftHistoryButtons();
    redrawDraftCanvas();
    if (draftDrawMode) {
        toggleDraftDrawMode();
    }
}

document.addEventListener('DOMContentLoaded', initDraftCanvas);