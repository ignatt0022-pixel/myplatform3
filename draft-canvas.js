/* ===================================================
   Рисование в черновике урока: кисть, ластик, толщина
   =================================================== */

let draftDrawMode = false;
let draftTool = 'pen';
let draftThickness = 3;
let draftIsDrawing = false;
let draftLastX = 0;
let draftLastY = 0;

function initDraftCanvas() {
    const canvas = document.getElementById('l-draft-canvas');
    if (!canvas) return;

    resizeDraftCanvas();

    canvas.addEventListener('pointerdown', startDraftDraw);
    canvas.addEventListener('pointermove', draftDraw);
    window.addEventListener('pointerup', endDraftDraw);
    window.addEventListener('pointercancel', endDraftDraw);
    window.addEventListener('resize', resizeDraftCanvas);
}

function resizeDraftCanvas() {
    const canvas = document.getElementById('l-draft-canvas');
    if (!canvas) return;

    const cssWidth = canvas.parentElement.clientWidth;
    const cssHeight = canvas.clientHeight || 120;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#4b4b4b';
}

function getDraftPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function startDraftDraw(e) {
    if (!draftDrawMode) return;
    e.preventDefault();
    const canvas = document.getElementById('l-draft-canvas');
    canvas.setPointerCapture(e.pointerId);
    draftIsDrawing = true;
    const pos = getDraftPos(e, canvas);
    draftLastX = pos.x;
    draftLastY = pos.y;
}

function draftDraw(e) {
    if (!draftIsDrawing) return;
    e.preventDefault();
    const canvas = document.getElementById('l-draft-canvas');
    const ctx = canvas.getContext('2d');
    const pos = getDraftPos(e, canvas);

    ctx.globalCompositeOperation = draftTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.lineWidth = draftTool === 'eraser' ? draftThickness * 3 : draftThickness;

    ctx.beginPath();
    ctx.moveTo(draftLastX, draftLastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    draftLastX = pos.x;
    draftLastY = pos.y;
}

function endDraftDraw() {
    draftIsDrawing = false;
}

function toggleDraftDrawMode() {
    draftDrawMode = !draftDrawMode;

    const mathField = document.getElementById('l-draft');
    const canvas = document.getElementById('l-draft-canvas');
    const toggleBtn = document.getElementById('draft-mode-toggle');
    const toolIds = ['draft-tool-pen', 'draft-tool-eraser', 'draft-clear-btn'];
    const slider = document.getElementById('draft-thickness');

    if (draftDrawMode) {
        mathField.classList.add('hidden');
        canvas.classList.remove('hidden');
        toggleBtn.classList.add('active');
        toolIds.forEach(id => document.getElementById(id).classList.remove('hidden'));
        slider.classList.remove('hidden');
        resizeDraftCanvas();
    } else {
        mathField.classList.remove('hidden');
        canvas.classList.add('hidden');
        toggleBtn.classList.remove('active');
        toolIds.forEach(id => document.getElementById(id).classList.add('hidden'));
        slider.classList.add('hidden');
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

function clearDraftCanvas() {
    const canvas = document.getElementById('l-draft-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Вызывается из loadTask() в script.js при переходе к новому заданию
function resetDraftCanvasForNewTask() {
    clearDraftCanvas();
    if (draftDrawMode) {
        toggleDraftDrawMode();
    }
}

document.addEventListener('DOMContentLoaded', initDraftCanvas);
