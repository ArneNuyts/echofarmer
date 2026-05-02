// Configuration: Add your GIFs and audio files here
const samplerConfig = [
    {
        gif: 'gifs/blue_dolphin.gif',     // Path to GIF
        staticImg: 'gifs/blue_dolphin.png', // Path to static image (first frame)
        audio: 'audio/sth-kick.wav',      // Path to audio file
        width: 112,                        // Width in pixels
        height: 112,                       // Height in pixels
        x: 20,                             // Initial X position (%)
        y: 50                              // Initial Y position (%)
    },
    {
        gif: 'gifs/pink_dolphin.gif',     // Path to GIF
        staticImg: 'gifs/pink_dolphin.png', // Path to static image (first frame)
        audioList: [                       // Random sample picked on each trigger
            'audio/sweet-samples/samp1.wav',
            'audio/sweet-samples/samp2.wav',
            'audio/sweet-samples/samp3.wav',
            'audio/sweet-samples/samp4.wav',
            'audio/sweet-samples/samp5.wav',
            'audio/sweet-samples/samp6.wav',
            'audio/sweet-samples/samp8.wav',
            'audio/sweet-samples/samp9.wav'
        ],
        width: 112,                        // Width in pixels
        height: 112,                       // Height in pixels
        x: 50,                             // Initial X position (%)
        y: 20                              // Initial Y position (%)
    },
    {
        gif: 'gifs/pink_dolphin.gif',     // Path to GIF
        staticImg: 'gifs/pink_dolphin.png', // Path to static image (first frame)
        audio: 'audio/sweet.wav',         // Path to audio file
        width: 112,                        // Width in pixels
        height: 112,                       // Height in pixels
        x: 80,                             // Initial X position (%)
        y: 70                              // Initial Y position (%)
    },
    {
        gif: 'gifs/blue_dolphin.gif',     // Path to GIF
        staticImg: 'gifs/blue_dolphin.png', // Path to static image (first frame)
        audio: 'audio/so.wav',            // Path to audio file
        width: 112,                        // Width in pixels
        height: 112,                       // Height in pixels
        x: 30,                             // Initial X position (%)
        y: 40                              // Initial Y position (%)
    },
    {
        gif: 'gifs/blue_dolphin.gif',     // Path to GIF
        staticImg: 'gifs/blue_dolphin.png', // Path to static image (first frame)
        audio: 'audio/sth-snare.wav',     // Path to audio file
        width: 112,                        // Width in pixels
        height: 112,                       // Height in pixels
        x: 70,                             // Initial X position (%)
        y: 60                              // Initial Y position (%)
    },
    // hidden for now — restore when ready:
    // {
    //     gif: 'gifs/blue_dolphin.gif',
    //     staticImg: 'gifs/blue_dolphin.png',
    //     audio: 'audio/dans1.wav',
    //     width: 112,
    //     height: 112,
    //     x: 25,
    //     y: 25
    // },
    // {
    //     gif: 'gifs/blue_dolphin.gif',
    //     staticImg: 'gifs/blue_dolphin.png',
    //     audio: 'audio/dans2.wav',
    //     width: 112,
    //     height: 112,
    //     x: 60,
    //     y: 45
    // },
    // {
    //     gif: 'gifs/blue_dolphin.gif',
    //     staticImg: 'gifs/blue_dolphin.png',
    //     audio: 'audio/dans3.wav',
    //     width: 112,
    //     height: 112,
    //     x: 40,
    //     y: 75
    // }
];

// Detect if device is mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// View mode: 'room' (default, 3D look) or 'flat' (original flat scrollable table)
const VIEW_MODE = (() => {
    try { return localStorage.getItem('viewMode') === 'flat' ? 'flat' : 'room'; }
    catch (e) { return 'room'; }
})();
if (VIEW_MODE === 'flat') {
    document.documentElement.classList.add('flat-mode');
    document.addEventListener('DOMContentLoaded', () => {
        document.body.classList.remove('room-mode');
        document.body.classList.add('flat-mode');
    });
} else {
    document.documentElement.classList.add('room-mode');
}

// Lock state for dragging
let isDraggingLocked = false;

// Info-float toggle state (default on, persisted)
let infoFloatEnabled = (() => { try { return localStorage.getItem('infoFloat') !== 'false'; } catch(e) { return true; } })();

let _scrollbarUpdate = null; // exposed by setupCustomScrollbar so room scroll can retrigger it

// Mouse tracking for info-float positioning
let _mouseX = 0, _mouseY = 0;
// Suppress info-float repositioning while a knob/drag interaction is in progress
// (so the tooltip stays where it was when the drag began).
let _infoFloatFrozen = false;

// Shared z-index counter for bring-to-front on GIFs and video pads
let _topZ = 1;

// Shared Web Audio context + master chain (created lazily)
// Graph: sources -> masterIn -> (dry) ---------------------\
//                            \-> reverbSend -> convolver -> HPF -> highshelf -> reverbWet -/
//                                                               -> preDrive -> [bypass | drive (preGain -> shaper -> postGain)] -> limiter -> destination
// (drive sits AFTER reverb, so the reverb tail also gets saturated)
let _audioCtx = null;
let _limiter = null;
let _masterIn = null;
let _preDrive = null;
let _drivePre = null;
let _driveShaper = null;
let _drivePost = null;
let _driveOn = false;
let _reverbSend = null;
let _reverbConvolver = null;
let _reverbWet = null;

function getAudioContext() {
    if (_audioCtx) return _audioCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _audioCtx = new AC();
    return _audioCtx;
}

function _makeDriveCurve(amount) {
    // Warm tape-style saturation: gentle soft-clip with slight even-harmonic
    // asymmetry for a tube-like character (rather than harsh overdrive).
    // amount = drive strength (~0.2 .. 2.5 in practice)
    const n = 4096;
    const curve = new Float32Array(n);
    const k = amount;
    const bias = 0.05 * amount; // tiny DC-ish bias adds even harmonics
    for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        const xb = x + bias;
        // arctan = smoother knee than tanh, sounds warmer at moderate drive
        const y = Math.atan(k * xb) / Math.atan(k);
        // Remove DC introduced by the bias so output stays centered
        const dc = Math.atan(k * bias) / Math.atan(k);
        curve[i] = y - dc;
    }
    return curve;
}

function _ensureMasterChain() {
    if (_limiter) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    // Limiter (brick-wall) into destination
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -1;
    comp.knee.value = 0;
    comp.ratio.value = 20;
    comp.attack.value = 0.001;
    comp.release.value = 0.05;
    comp.connect(ctx.destination);
    _limiter = comp;

    // Drive stage (preGain -> waveshaper -> postGain)
    _drivePre = ctx.createGain();
    _drivePre.gain.value = 1.5;        // gentle boost into the shaper
    _driveShaper = ctx.createWaveShaper();
    _driveShaper.curve = _makeDriveCurve(5);
    _driveShaper.oversample = '4x';
    _drivePost = ctx.createGain();
    _drivePost.gain.value = 0.7;       // makeup post-shape
    _drivePre.connect(_driveShaper).connect(_drivePost);

    // Master input bus (everything connects here)
    _masterIn = ctx.createGain();
    _masterIn.gain.value = 1;

    // Pre-drive sum bus: dry + wet reverb mix here, then feed the drive (or bypass).
    _preDrive = ctx.createGain();
    _preDrive.gain.value = 1;
    _masterIn.connect(_preDrive);          // dry path
    _preDrive.connect(_limiter);           // start in bypass (no drive)

    // Parallel reverb send: masterIn -> reverbSend -> convolver -> HPF -> hi-shelf -> reverbWet -> preDrive.
    // Wet level is 0 by default and ramped up via setReverbAmount() as the
    // 3D room opens (driven by scroll position). Because reverbWet feeds preDrive,
    // the reverb tail is also saturated when drive is engaged.
    _reverbSend = ctx.createGain();
    _reverbSend.gain.value = 1;
    _reverbConvolver = ctx.createConvolver();
    _reverbConvolver.buffer = _makeRoomImpulse(ctx, 0.4, 5.0);
    const reverbHPF = ctx.createBiquadFilter();
    reverbHPF.type = 'highpass';
    reverbHPF.frequency.value = 350;
    reverbHPF.Q.value = 0.7;
    const reverbHi = ctx.createBiquadFilter();
    reverbHi.type = 'highshelf';
    reverbHi.frequency.value = 4000;
    reverbHi.gain.value = 4;
    _reverbWet = ctx.createGain();
    _reverbWet.gain.value = 0;
    _masterIn.connect(_reverbSend);
    _reverbSend.connect(_reverbConvolver);
    _reverbConvolver.connect(reverbHPF);
    reverbHPF.connect(reverbHi);
    reverbHi.connect(_reverbWet);
    _reverbWet.connect(_preDrive);
}

// Generate a simple stereo room impulse response: exponentially decaying noise.
// duration in seconds; decay controls steepness (higher = shorter tail).
function _makeRoomImpulse(ctx, duration, decay) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const ir = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
    }
    return ir;
}

// Set reverb wet amount [0..1].
let _lastIrStep = -1;
let _lastWetAmount = 0;
function setReverbAmount(amount) {
    _ensureMasterChain();
    if (!_reverbWet) return;
    const a = Math.max(0, Math.min(1, amount));
    const ctx = getAudioContext();
    const t = ctx ? ctx.currentTime : 0;
    // Kill immediately when fully closed; fade out slowly mid-scroll so the
    // tail isn't chopped; fade in fast when opening.
    if (a === 0) {
        _reverbWet.gain.cancelScheduledValues(t);
        _reverbWet.gain.setValueAtTime(0, t);
    } else {
        const timeConst = a < _lastWetAmount ? 0.6 : 0.05;
        _reverbWet.gain.setTargetAtTime(a * 1.6, t, timeConst);
    }
    _lastWetAmount = a;
    // Only rebuild IR when room is opening (step increasing) — replacing the
    // convolver buffer kills any in-progress reverb tail.
    // duration 0.7s→2.0s, decay 4.5→2.5 (shorter overall).
    const step = Math.round(a * 5) / 5;
    if (_reverbConvolver && step > _lastIrStep && Math.abs(step - _lastIrStep) >= 0.19) {
        _lastIrStep = step;
        const duration = 0.4 + step * 0.9;
        const decay    = 5.0 - step * 1.5;
        _reverbConvolver.buffer = _makeRoomImpulse(ctx, duration, decay);
    }
}

function getMasterIn() {
    _ensureMasterChain();
    return _masterIn;
}

function getLimiter() {
    // Kept for backward compatibility; sources should now connect to getMasterIn()
    _ensureMasterChain();
    return _masterIn;
}

function setDrive(on) {
    setDriveAmount(on ? 1 : 0);
}

// amount in [0, 1]: 0 = full bypass, 1 = max drive (preGain x6, tanh k=8)
function setDriveAmount(amount) {
    _ensureMasterChain();
    if (!_masterIn) return;
    amount = Math.max(0, Math.min(1, amount));
    const shouldBeOn = amount > 0.001;

    if (shouldBeOn !== _driveOn) {
        // Re-route preDrive output: either through the drive chain or straight to limiter.
        try { _preDrive.disconnect(); } catch (e) {}
        try { _drivePost.disconnect(); } catch (e) {}
        if (shouldBeOn) {
            _preDrive.connect(_drivePre);
            _drivePost.connect(_limiter);
        } else {
            _preDrive.connect(_limiter);
        }
        _driveOn = shouldBeOn;
    }

    if (shouldBeOn) {
        // Warm saturation scaling: subtle low end, pushed hard at max
        const preGain = 1 + amount * 2.5;      // 1 .. 3.5
        const k = 0.4 + amount * 4.6;          // 0.4 .. 5  (arctan curvature)
        // Mild makeup attenuation to compensate for added harmonic energy
        const post = 1 - amount * 0.35;        // 1 .. 0.65
        _drivePre.gain.value = preGain;
        _drivePost.gain.value = post;
        _driveShaper.curve = _makeDriveCurve(k);
    }
}

// Grid configuration (defaults)
const GRID_CELL_WIDTH_DEFAULT = 70;
const GRID_CELL_HEIGHT_DEFAULT = 20;
const GRID_LINE_WIDTH = 1;
const SQUARE_SIZE = 9;
const GRID_COLOR = 'rgb(89, 81, 71)';
const BACKGROUND_COLOR = '#9b9183';

// Calculate responsive cell dimensions.
// Cell sizes are NOT rounded so that frameWidth = cols * cellWidth (and
// frameHeight = rows * cellHeight) exactly. This guarantees the back-wall
// grid lines land precisely on the wall hinges, so every line on the four
// 3D walls lines up with the back wall and the colored header row.
function getResponsiveCellDimensions() {
    const frameInner = document.getElementById('frame-inner');
    const width = frameInner ? frameInner.clientWidth : window.innerWidth;
    const height = frameInner ? frameInner.clientHeight : window.innerHeight;
    const cols = Math.max(1, Math.floor(width / GRID_CELL_WIDTH_DEFAULT));
    const rows = Math.max(1, Math.floor(height / GRID_CELL_HEIGHT_DEFAULT));
    const cellWidth = width / cols;
    const cellHeight = height / rows;
    return { cellWidth, cellHeight, cols, rows };
}

// Header row colors (rotating palette)
const HEADER_COLORS = [
    '#eba0ab', '#e7a64e', '#bd9643', '#c2e84c',
    '#9ec4f2', '#6b84ce',
    '#c77cd1', '#ce6799', '#ffffff', '#e055c6', '#b081b4',
    '#4e9dd5', '#6bd9ea', '#51afa2',
    '#65b437', '#f0e460', '#d87631',
    '#e0534a', '#cd7766', '#eaa984', ,
    '#bec880', '#d8eef2',
    '#cec0da',
];

// Pre-generate cell labels ("1 Audio", "2 MIDI", ...) so they stay stable across redraws.
const CELL_LABELS = Array.from({ length: 200 }, (_, i) =>
    `${i + 1} ${Math.random() < 0.5 ? 'Audio' : 'MIDI'}`
);

// Draw the main grid
function drawGrid() {
    const canvas = document.getElementById('grid-canvas');
    const tableContent = document.getElementById('table-content');
    const ctx = canvas.getContext('2d');
    
    // Use device pixel ratio for crisp rendering on HiDPI screens
    const dpr = window.devicePixelRatio || 1;
    const width = tableContent ? tableContent.clientWidth : window.innerWidth;
    const height = tableContent ? tableContent.clientHeight : window.innerHeight;
    
    // Set canvas size in actual pixels and CSS pixels
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    
    // Get responsive dimensions
    const { cellWidth, cellHeight } = getResponsiveCellDimensions();
    
    // Fill background
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid lines with crisp 1px strokes (0.5px offset for odd line widths)
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = GRID_LINE_WIDTH;
    ctx.fillStyle = GRID_COLOR;
    
    ctx.beginPath();
    
    // Vertical lines
    for (let x = 0; x <= width; x += cellWidth) {
        const px = Math.floor(x) + 0.5;
        ctx.moveTo(px, cellHeight);
        ctx.lineTo(px, height);
    }
    
    // Horizontal lines (skip top row, that's the header)
    for (let y = cellHeight; y <= height; y += cellHeight) {
        const py = Math.floor(y) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
    }
    
    ctx.stroke();
    
    // Draw squares as solid filled rects (pixel-aligned)
    for (let y = cellHeight; y < height; y += cellHeight) {
        for (let x = 0; x < width; x += cellWidth) {
            const squareSpacing = Math.floor((cellHeight - SQUARE_SIZE) / 2);
            const squareX = Math.floor(x + squareSpacing);
            const squareY = Math.floor(y + squareSpacing);
            ctx.fillRect(squareX, squareY, SQUARE_SIZE, SQUARE_SIZE);
        }
    }
}

// Draw the header row
function drawHeaderRow() {
    const canvas = document.getElementById('header-canvas');
    const ctx = canvas.getContext('2d');
    
    // Use device pixel ratio for crisp rendering on HiDPI screens
    const dpr = window.devicePixelRatio || 1;
    
    // Get responsive dimensions
    const { cellWidth, cellHeight } = getResponsiveCellDimensions();
    
    const frameInner = document.getElementById('frame-inner');
    const width = frameInner ? frameInner.clientWidth : window.innerWidth;
    const height = cellHeight;
    
    // Set canvas size in actual pixels and CSS pixels
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    
    // Draw header cells with different colors
    ctx.lineWidth = GRID_LINE_WIDTH;
    // Shuffle a copy of the palette so each color is used at most once
    const shuffledColors = HEADER_COLORS.slice().sort(() => Math.random() - 0.5);
    let colorIdx = 0;
    
    for (let x = 0; x < width; x += cellWidth) {
        // Cycle through shuffled palette if more cells than colors (shouldn't happen)
        if (colorIdx >= shuffledColors.length) {
            colorIdx = 0;
        }
        ctx.fillStyle = shuffledColors[colorIdx++];
        
        // Draw colored cell fill (pixel-aligned)
        ctx.fillRect(Math.floor(x), 0, Math.ceil(cellWidth), height);
    }
    
    // Draw labels inside each cell (left-aligned, vertically centred, smaller size)
    const fontSize = Math.max(8, Math.floor(height * 0.40)) + 1;
    ctx.font = `700 ${fontSize}px "Geist", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1b1916';
    const pad = 4;
    let labelIndex = 0;
    for (let x = 0; x < width; x += cellWidth) {
        const label = CELL_LABELS[labelIndex % CELL_LABELS.length];
        ctx.fillText(label, Math.floor(x) + pad, height / 2, Math.ceil(cellWidth) - pad * 2);
        labelIndex++;
    }

    // Draw vertical separators with crisp lines — use exact float positions to match
    // the CSS repeating-linear-gradient(--cell-w) which also uses fractional values.
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = GRID_LINE_WIDTH;
    ctx.beginPath();
    for (let x = 0; x <= width; x += cellWidth) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    ctx.stroke();
    // Bottom border of header — 0.5px thicker than the grid lines
    ctx.beginPath();
    ctx.lineWidth = GRID_LINE_WIDTH + 1;
    ctx.moveTo(0, height);
    ctx.lineTo(width, height);
    ctx.stroke();
}

// Initialize grid
function initializeGrid() {
    drawGrid();
    drawHeaderRow();
    syncWallCellVars();
}

// Push the active cellWidth/cellHeight to CSS so the 3D walls' grid pattern
// matches the back-wall canvas grid (and the colored top row) at every size.
let _roomDepthTarget = 0;
let _roomPersp = 600;
function syncWallCellVars() {
    const frameInner = document.getElementById('frame-inner');
    if (!frameInner) return;
    const { cellWidth, cellHeight } = getResponsiveCellDimensions();
    frameInner.style.setProperty('--cell-w', cellWidth + 'px');
    frameInner.style.setProperty('--cell-h', cellHeight + 'px');
    // Snap room depth to a whole number of cellHeight so the back-wall edge
    // lands exactly on a depth-marker line on the floor/ceiling/side walls.
    const TARGET_DEPTH = 800;
    const PERSP = 600;
    _roomPersp = PERSP;
    const depthCells = Math.max(1, Math.round(TARGET_DEPTH / cellHeight));
    const depth = depthCells * cellHeight;
    _roomDepthTarget = depth;
    frameInner.style.setProperty('--depth', depth + 'px');
    // --back-z and --back-line-w are driven by scroll position in room mode
    // (see setupRoomScrollOpen). Don't snap them here.
    // Build the same square-stamp tile the original table uses, sized to one cell.
    // Squares sit on the LEFT side of the cell, with equal padding to the
    // top, bottom and left edges of the cell INTERIOR (i.e. inside the 1px grid lines).
    const lineW = 1;
    const sq = 9;
    const pad = lineW + (cellHeight - lineW - sq) / 2;
    const sx = pad;
    const sy = pad;
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'>` +
        `<defs><pattern id='p' width='${cellWidth}' height='${cellHeight}' patternUnits='userSpaceOnUse'>` +
        `<rect x='${sx}' y='${sy}' width='${sq}' height='${sq}' fill='%235d5343'/>` +
        `</pattern></defs><rect width='100%25' height='100%25' fill='url(%23p)'/></svg>`;
    frameInner.style.setProperty('--squares-bg', `url("data:image/svg+xml;utf8,${svg}")`);
}

// Two-phase scroll animation:
//   Phase 1 (scrollTop in [0, depth]): "open" the room by animating
//     --back-z from 0 to depth. Reverb wet ramps up. Walls/floor stay still.
//   Phase 2 (scrollTop in [depth, depth + floorH]): the room (walls + gifs),
//     header row, and the floor-section translate upward by `extra = scrollTop - depth`.
//     Floor-section is anchored at top:100% so it slides into view from below.
//     Header stays fixed to top of frame in phase 1, then slides up with room in phase 2.
function setupRoomScrollOpen() {
    const frameInner = document.getElementById('frame-inner');
    const scroller = document.getElementById('table-scroll');
    if (!frameInner || !scroller) return;
    // Move the gif container out of the scroll layer so gifs stay fixed in
    // the frame while scrolling drives the room open.
    const gifContainer = document.getElementById('gif-container');
    if (gifContainer && gifContainer.parentElement !== frameInner) {
        frameInner.appendChild(gifContainer);
    }
    const roomWalls = frameInner.querySelector('.room-walls');
    const floorSection = frameInner.querySelector('.floor-section');
    const headerCanvas = frameInner.querySelector('.header-canvas');
    // Publish floor-section height as a CSS var so #table-content min-height
    // reserves enough scroll room for phase 2. The floor lands 15px above
    // frame-inner.bottom at end-of-scroll (so its bottom sits at the top of
    // the bottom frame bar), so the scroll range it needs is _floorH - 15.
    let _floorH = 0;
    const PEEK = 15;
    const syncFloorHeight = () => {
        _floorH = floorSection ? floorSection.offsetHeight : 0;
        const effective = Math.max(0, _floorH - PEEK);
        frameInner.style.setProperty('--floor-h', effective + 'px');
    };
    syncFloorHeight();
    window.addEventListener('resize', syncFloorHeight);
    // Start with the back wall pulled forward to z=0 (flat-table look).
    frameInner.style.setProperty('--back-z', '0px');
    frameInner.style.setProperty('--back-line-w', '1px');
    let raf = null;
    const bottomFrameBar = document.getElementById('bottom-frame-bar');
    const update = () => {
        raf = null;
        const depth = _roomDepthTarget || 800;
        const st = scroller.scrollTop;
        // Phase 1: opening (0 .. depth)
        const phase1 = Math.min(st, depth);
        const t = depth > 0 ? phase1 / depth : 0;
        frameInner.style.setProperty('--back-z', phase1 + 'px');
        const scale = _roomPersp / (_roomPersp + phase1);
        const lineW = Math.max(1, Math.round(1 / scale));
        frameInner.style.setProperty('--back-line-w', lineW + 'px');
        setReverbAmount(t);
        // Phase 2: slide the room + header + floor section up (all together, floor stays attached).
        // The peek at the bottom is achieved by margin-bottom on frame-inner, not by translating
        // elements — so the top row of cells stays fully visible at refresh.
        const extra = Math.max(0, st - depth);
        const ty = `translateY(${-extra}px)`;
        if (roomWalls) roomWalls.style.transform = ty;
        if (headerCanvas) headerCanvas.style.transform = ty;
        if (floorSection) floorSection.style.transform = ty;
        if (gifContainer) gifContainer.style.transform = ty;
        // Slide the bottom frame bar in during the last 30px of scroll,
        // tracking floor.bottom so the dark line stays continuous with the floor's L/R borders.
        // Also grow the scrollbar track bottom to keep the same 11px gap from the bar.
        const scrollBarEl = document.getElementById('custom-scrollbar');
        const rightPanelEl = document.getElementById('right-panel');
        const totalExtra = Math.max(0, _floorH - PEEK);
        const barEnter = Math.max(0, totalExtra - 30);
        const barProgress = extra <= barEnter ? 0 : Math.min(1, (extra - barEnter) / 30);
        if (bottomFrameBar) bottomFrameBar.style.transform = `translateY(${(1 - barProgress) * 30}px)`;
        // Scrollbar bottom: 11px inset from the right-panel bottom (0px from window),
        // growing by 30px as the bottom frame bar slides in so the thumb never overlaps it.
        if (scrollBarEl) scrollBarEl.style.bottom = (11 + barProgress * 30) + 'px';
        // Right-panel bottom: tracks the floor's visible bottom border so
        // the panel ends right at the inner frame line as soon as it appears.
        const panelTarget = 45 + extra - _floorH + 2.5;
        if (rightPanelEl) rightPanelEl.style.bottom = Math.max(0, panelTarget) + 'px';
        // Retrigger scrollbar thumb calc now so it uses the new track height.
        if (_scrollbarUpdate) _scrollbarUpdate();
    };
    const onScroll = () => { if (raf === null) raf = requestAnimationFrame(update); };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    // The gif container is reparented out of #table-scroll, so a wheel event
    // landing on a gif is not naturally applied to the scroller. Forward it.
    if (gifContainer) {
        gifContainer.addEventListener('wheel', (e) => {
            scroller.scrollTop += e.deltaY;
            scroller.scrollLeft += e.deltaX;
            e.preventDefault();
        }, { passive: false });
    }
    update();
}

// Debounced resize handler (avoids redraw storm during window resize)
let gridResizeRaf = null;
function scheduleGridRedraw() {
    if (gridResizeRaf !== null) return;
    gridResizeRaf = requestAnimationFrame(() => {
        gridResizeRaf = null;
        drawGrid();
        drawHeaderRow();
        syncWallCellVars();
    });
}
window.addEventListener('resize', scheduleGridRedraw);

// Initialize on load
initializeGrid();
// Initial measurements can be slightly off before fonts/layout settle
// (manifests as misaligned cell lines that snap into place on resize).
// Force a redraw after the window load event and after web fonts are ready.
window.addEventListener('load', () => requestAnimationFrame(scheduleGridRedraw));
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleGridRedraw);
}

// Custom scrollbar living in the outer frame's right border, below the controls-bar
function setupCustomScrollbar() {
    const scroller = document.getElementById('table-scroll');
    const bar = document.getElementById('custom-scrollbar');
    const thumb = document.getElementById('custom-scrollbar-thumb');
    if (!scroller || !bar || !thumb) return;

    // Position scrollbar track and right-panel just below the controls-bar
    const positionBar = () => {
        const controlsBar = document.getElementById('controls-bar');
        const rightPanel = document.getElementById('right-panel');
        if (controlsBar) {
            const bottom = controlsBar.getBoundingClientRect().bottom;
            if (rightPanel) rightPanel.style.top = (bottom + 4) + 'px';
            bar.style.top = (bottom + 15) + 'px';  // 4px gap to panel + 11px inset
        }
    };
    positionBar();
    window.addEventListener('resize', positionBar);

    const update = () => {
        const visible = scroller.clientHeight;
        const total = scroller.scrollHeight;
        const trackHeight = bar.clientHeight;
        if (total <= visible || trackHeight <= 0) {
            thumb.style.display = 'none';
            return;
        }
        thumb.style.display = 'block';
        const ratio = visible / total;
        const thumbHeight = Math.max(24, trackHeight * ratio);
        const maxScroll = total - visible;
        const scrollRatio = maxScroll > 0 ? scroller.scrollTop / maxScroll : 0;
        const thumbY = scrollRatio * (trackHeight - thumbHeight);
        thumb.style.height = thumbHeight + 'px';
        thumb.style.transform = `translateY(${thumbY}px)`;
    };

    scroller.addEventListener('scroll', update, { passive: true });
    _scrollbarUpdate = update; // expose for room scroll to retrigger after track height changes
    window.addEventListener('resize', () => requestAnimationFrame(update));
    window.addEventListener('load', () => requestAnimationFrame(update));

    // Drag the thumb
    let dragging = false;
    let dragStartY = 0;
    let dragStartScroll = 0;
    const onThumbDown = (clientY, e) => {
        dragging = true;
        dragStartY = clientY;
        dragStartScroll = scroller.scrollTop;
        thumb.classList.add('dragging');
        if (e) e.preventDefault();
    };
    thumb.addEventListener('mousedown', (e) => onThumbDown(e.clientY, e));
    thumb.addEventListener('touchstart', (e) => onThumbDown(e.touches[0].clientY, e), { passive: false });

    const onMove = (clientY) => {
        if (!dragging) return;
        const trackHeight = bar.clientHeight;
        const thumbHeight = thumb.clientHeight;
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        const usableTrack = Math.max(1, trackHeight - thumbHeight);
        const dy = clientY - dragStartY;
        scroller.scrollTop = dragStartScroll + (dy / usableTrack) * maxScroll;
    };
    document.addEventListener('mousemove', (e) => onMove(e.clientY));
    document.addEventListener('touchmove', (e) => { if (dragging) { e.preventDefault(); onMove(e.touches[0].clientY); } }, { passive: false });
    document.addEventListener('mouseup', () => { dragging = false; thumb.classList.remove('dragging'); });
    document.addEventListener('touchend', () => { dragging = false; thumb.classList.remove('dragging'); });

    // Click track to jump
    bar.addEventListener('mousedown', (e) => {
        if (e.target === thumb) return;
        const rect = bar.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const trackHeight = bar.clientHeight;
        const thumbHeight = thumb.clientHeight;
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        const ratio = (y - thumbHeight / 2) / Math.max(1, trackHeight - thumbHeight);
        scroller.scrollTop = Math.max(0, Math.min(maxScroll, ratio * maxScroll));
    });

    requestAnimationFrame(update);
}

// Setup SVG hover state swapping between normal and hover versions
function setupSvgHoverStates() {
    // All elements with SVG images from the SVG-STATES/NORMAL folder
    // Exclude the lock button — its hover is handled separately in the lock handler
    const svgElements = document.querySelectorAll('img[src*="SVG-STATES/NORMAL/"]');
    
    svgElements.forEach(img => {
        const hoverElement = img.closest('button') || img.closest('a') || img.closest('.knob-dial') || img.parentElement;
        if (!hoverElement) return;
        
        // Lock button excluded: its src changes on click, generic mouseleave would reset it
        if (hoverElement.id === 'lock-button') return;
        // Info toggle excluded: src toggles between question.svg / question-disabled.svg
        // based on infoFloatEnabled state — handled manually below.
        if (hoverElement.id === 'info-toggle') return;
        // Drive knob excluded: hover state also active while dragging, handled in driveKnob block
        if (hoverElement.closest('#drive-knob')) return;
        
        const normalSrc = img.src;
        const hoverSrc = normalSrc.replace('SVG-STATES/NORMAL/', 'SVG-STATES/HOVER/');
        
        // Preload hover image
        const preload = new Image();
        preload.src = hoverSrc;
        
        hoverElement.addEventListener('mouseenter', () => { img.src = hoverSrc; });
        hoverElement.addEventListener('mouseleave', () => { img.src = normalSrc; });
    });
}

class GifSampler {
    constructor(config) {
        this.config = config;
        this.container = document.getElementById('gif-container');
        this.gifs = [];
        // Physical key codes matching the original layout (AZERTY: Q=KeyA, Z=KeyW; QWERTY: A=KeyA, W=KeyW)
        this.triggerCodes = ['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK','KeyO','KeyL'];
        // Display labels — QWERTY defaults; updated by KeyboardLayoutMap when available
        this.keyLabels = ['A','W','S','E','D','F','T','G','Y','H','U','J','K','O','L'];
        this.init();
        this.setupAudioUnlock();
        this.setupKeyboardListeners();
        this._initKeyLabels();
    }

    _initKeyLabels() {
        if (navigator.keyboard && typeof navigator.keyboard.getLayoutMap === 'function') {
            navigator.keyboard.getLayoutMap().then(map => {
                this.triggerCodes.forEach((code, i) => {
                    if (map.has(code)) this.keyLabels[i] = map.get(code).toUpperCase();
                });
            }).catch(() => {});
        }
    }

    setupAudioUnlock() {
        // Prime audio context on first user interaction
        const tryUnlockAudio = () => {
            // Create a dummy audio element and play it to unlock the audio context
            const dummy = new Audio();
            dummy.volume = 0;
            dummy.play().catch(() => {});
            // Resume the shared Web Audio context (needed for limiter routing)
            const ctx = getAudioContext();
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }
            // Remove listeners after attempt
            document.removeEventListener('click', tryUnlockAudio);
            document.removeEventListener('touchstart', tryUnlockAudio);
            document.removeEventListener('keydown', tryUnlockAudio);
        };
        document.addEventListener('click', tryUnlockAudio);
        document.addEventListener('touchstart', tryUnlockAudio);
        document.addEventListener('keydown', tryUnlockAudio);
    }

    setupKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            const index = this.triggerCodes.indexOf(e.code);
            if (index !== -1 && index < this.gifs.length) {
                this.activateGif(this.gifs[index]);
            }
        });
    }

    init() {
        // Scale GIFs 2x on desktop, keep original size on mobile
        const sizeMultiplier = isMobile ? 1 : 2;
        // In room mode keep gifs within the visible frame (no scrolling reveals them).
        // In flat mode let them spread across the full scrollable table.
        const placementHost = VIEW_MODE === 'room'
            ? document.getElementById('frame-inner')
            : document.getElementById('table-content');
        const frameWidth = placementHost ? placementHost.clientWidth : window.innerWidth;
        const frameHeight = placementHost ? placementHost.clientHeight : window.innerHeight;
        
        this.config.forEach((item, index) => {
            // Apply size multiplier
            item.width = item.width * sizeMultiplier;
            item.height = item.height * sizeMultiplier;
            
            // Randomize position within safe bounds (20px margin from all sides)
            const maxX = Math.max(10, 100 - (item.width / frameWidth) * 100);
            const maxY = Math.max(10, 100 - (item.height / frameHeight) * 100);
            item.x = Math.random() * maxX;
            item.y = Math.random() * maxY;
            this.createGifElement(item, index);
        });
        // Prevent overlaps
        this.preventOverlaps();
        // Setup window resize listener to keep GIFs in bounds
        this.setupWindowResizeListener();
    }

    preventOverlaps() {
        const MARGIN = 20;
        const maxOverlap = 5;

        for (let i = 0; i < this.gifs.length; i++) {
            for (let j = i + 1; j < this.gifs.length; j++) {
                const rect1 = this.gifs[i].element.getBoundingClientRect();
                const rect2 = this.gifs[j].element.getBoundingClientRect();

                // Check horizontal overlap
                const horizontalOverlap = Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left);
                const verticalOverlap = Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top);

                // If overlapping more than allowed (in either direction) and both rects actually overlap
                if ((horizontalOverlap > maxOverlap || verticalOverlap > maxOverlap) && horizontalOverlap > 0 && verticalOverlap > 0) {
                    // Try to move the second GIF
                    this.repositionGif(this.gifs[j].element, this.gifs, j, MARGIN);
                }
            }
        }
    }

    repositionGif(element, gifs, index, margin) {
        const maxOverlap = 5;
        let attempts = 0;
        const maxAttempts = 20;
        const host = this.getBoundsHost();
        const frameRect = host.getBoundingClientRect();

        while (attempts < maxAttempts) {
            // Random position with bounds accounting for element size
            const minXPercent = (margin / frameRect.width) * 100;
            const maxXPercent = ((frameRect.width - element.offsetWidth - margin) / frameRect.width) * 100;
            const minYPercent = (margin / frameRect.height) * 100;
            const maxYPercent = ((frameRect.height - element.offsetHeight - margin) / frameRect.height) * 100;
            
            const newX = Math.random() * Math.max(0, maxXPercent - minXPercent) + minXPercent;
            const newY = Math.random() * Math.max(0, maxYPercent - minYPercent) + minYPercent;

            element.style.left = newX + '%';
            element.style.top = newY + '%';

            // Check for overlaps
            let hasConflict = false;
            const currentRect = element.getBoundingClientRect();

            for (let i = 0; i < gifs.length; i++) {
                if (i === index) continue;

                const otherRect = gifs[i].element.getBoundingClientRect();
                const horizontalOverlap = Math.min(currentRect.right, otherRect.right) - Math.max(currentRect.left, otherRect.left);
                const verticalOverlap = Math.min(currentRect.bottom, otherRect.bottom) - Math.max(currentRect.top, otherRect.top);

                if ((horizontalOverlap > maxOverlap || verticalOverlap > maxOverlap) && horizontalOverlap > 0 && verticalOverlap > 0) {
                    hasConflict = true;
                    break;
                }
            }

            if (!hasConflict) {
                break;
            }

            attempts++;
        }
    }

    // Returns the element that gifs are positioned relative to.
    // Room mode reparents #gif-container to #frame-inner so gifs stay fixed
    // in the viewport while scrolling drives the room open.
    getBoundsHost() {
        const gc = document.getElementById('gif-container');
        return (gc && gc.parentElement) || document.getElementById('table-content');
    }

    setupWindowResizeListener() {
        // Track previous frame size to detect shrinking vs growing
        let lastWidth = this.getBoundsHost().clientWidth;
        let lastHeight = this.getBoundsHost().clientHeight;

        // Debounce window resize for cheap, jitter-free updates
        let resizeRaf = null;
        window.addEventListener('resize', () => {
            if (resizeRaf !== null) return;
            resizeRaf = requestAnimationFrame(() => {
                resizeRaf = null;
                const host = this.getBoundsHost();
                const newWidth = host.clientWidth;
                const newHeight = host.clientHeight;
                const isShrinking = newWidth < lastWidth || newHeight < lastHeight;
                lastWidth = newWidth;
                lastHeight = newHeight;

                // Only react when shrinking - walls push GIFs inward.
                // When growing, GIFs keep their absolute position.
                if (isShrinking) {
                    this.gifs.forEach(gifData => {
                        this.constrainElementToBounds(gifData.element);
                    });
                    this.nudgeApart();
                }
            });
        });
    }

    nudgeApart() {
        const MARGIN = 20;
        const maxIterations = 30;

        for (let iter = 0; iter < maxIterations; iter++) {
            let anyDeepOverlap = false;

            for (let i = 0; i < this.gifs.length; i++) {
                for (let j = i + 1; j < this.gifs.length; j++) {
                    const el1 = this.gifs[i].element;
                    const el2 = this.gifs[j].element;
                    const rect1 = el1.getBoundingClientRect();
                    const rect2 = el2.getBoundingClientRect();

                    // Calculate distance between centers
                    const cx1 = rect1.left + rect1.width / 2;
                    const cy1 = rect1.top + rect1.height / 2;
                    const cx2 = rect2.left + rect2.width / 2;
                    const cy2 = rect2.top + rect2.height / 2;

                    const dx = cx2 - cx1;
                    const dy = cy2 - cy1;
                    const centerDistance = Math.sqrt(dx * dx + dy * dy);

                    // Threshold: minimum allowed distance between centers
                    // Approximately 30% of average element size
                    const avgSize = (rect1.width + rect1.height + rect2.width + rect2.height) / 4;
                    const minCenterDistance = avgSize * 0.4;

                    if (centerDistance < minCenterDistance && centerDistance > 0) {
                        anyDeepOverlap = true;

                        // Push apart along the center-to-center axis
                        const pushAmount = (minCenterDistance - centerDistance) / 2 + 2;
                        const angle = Math.atan2(dy, dx);
                        const pushX = Math.cos(angle) * pushAmount;
                        const pushY = Math.sin(angle) * pushAmount;

                        this.shiftElement(el1, -pushX, -pushY, MARGIN);
                        this.shiftElement(el2, pushX, pushY, MARGIN);
                    } else if (centerDistance === 0) {
                        // Edge case: exactly stacked - push in random direction
                        anyDeepOverlap = true;
                        const angle = Math.random() * Math.PI * 2;
                        const pushAmount = 20;
                        this.shiftElement(el2, Math.cos(angle) * pushAmount, Math.sin(angle) * pushAmount, MARGIN);
                    }
                }
            }

            if (!anyDeepOverlap) break;
        }
    }

    shiftElement(element, dx, dy, margin) {
        const host = this.getBoundsHost();
        const frameRect = host.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        let newLeft = rect.left - frameRect.left + dx;
        let newTop = rect.top - frameRect.top + dy;

        const minLeft = margin;
        const maxLeft = frameRect.width - element.offsetWidth - margin;
        const minTop = margin;
        const maxTop = frameRect.height - element.offsetHeight - margin;

        newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
        newTop = Math.max(minTop, Math.min(maxTop, newTop));

        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
    }

    constrainElementToBounds(element) {
        const MARGIN = 20; // 20px margin from edges
        const host = this.getBoundsHost();
        const frameRect = host.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const elementWidth = element.offsetWidth;
        const elementHeight = element.offsetHeight;

        let left = rect.left - frameRect.left;
        let top = rect.top - frameRect.top;

        // Constrain with 20px margin relative to frame
        const minLeft = MARGIN;
        const maxLeft = frameRect.width - elementWidth - MARGIN;
        const minTop = MARGIN;
        const maxTop = frameRect.height - elementHeight - MARGIN;

        if (left < minLeft) left = minLeft;
        if (left > maxLeft) left = maxLeft;
        if (top < minTop) top = minTop;
        if (top > maxTop) top = maxTop;

        element.style.left = left + 'px';
        element.style.top = top + 'px';
    }

    createGifElement(config, index) {
        const gifDiv = document.createElement('div');
        gifDiv.className = 'gif-item';
        gifDiv.style.width = `${config.width}px`;
        gifDiv.style.height = `${config.height}px`;
        gifDiv.style.left = `${config.x}%`;
        gifDiv.style.top = `${config.y}%`;

        // Create placeholder div (shows when paused)
        const placeholder = document.createElement('img');
        placeholder.src = config.staticImg;
        placeholder.style.position = 'absolute';
        placeholder.style.top = '0';
        placeholder.style.left = '0';
        placeholder.style.width = '100%';
        placeholder.style.height = '100%';
        placeholder.style.objectFit = 'contain';
        placeholder.style.pointerEvents = 'none';
        placeholder.style.display = 'block';

        // Create animated GIF image (hidden by default)
        const animatedImg = document.createElement('img');
        animatedImg.src = config.gif;
        animatedImg.alt = `Sampler ${index + 1}`;
        animatedImg.draggable = false;
        animatedImg.style.position = 'absolute';
        animatedImg.style.top = '0';
        animatedImg.style.left = '0';
        animatedImg.style.width = '100%';
        animatedImg.style.height = '100%';
        animatedImg.style.objectFit = 'contain';
        animatedImg.style.pointerEvents = 'none';
        animatedImg.style.display = 'none';

        gifDiv.appendChild(placeholder);
        gifDiv.appendChild(animatedImg);
        const gifIndex = index;
        gifDiv.addEventListener('mouseenter', () => setHoverInfo(`Click me or press (${this.keyLabels[gifIndex]}). Drag me to move me to a new spot.`));
        gifDiv.addEventListener('mouseleave', () => setHoverInfo(''));
        this.container.appendChild(gifDiv);

        // Build audio pool: either a single source or a list of randomized samples
        const audioSources = config.audioList && config.audioList.length
            ? config.audioList
            : [config.audio];
        const audioPool = audioSources.map(src => {
            const a = new Audio();
            a.src = src;
            a.preload = 'auto';
            a.volume = 1.0;
            a.crossOrigin = 'anonymous';
            // Route through shared limiter to prevent clipping
            const ctx = getAudioContext();
            if (ctx) {
                try {
                    const source = ctx.createMediaElementSource(a);
                    source.connect(getLimiter());
                } catch (e) {
                    // If routing fails, audio still plays directly to output
                }
            }
            return a;
        });
        const audio = audioPool[0];

        // Store references
        const gifData = {
            element: gifDiv,
            placeholder: placeholder,
            animatedImg: animatedImg,
            audio: audio,
            audioPool: audioPool,
            isPlaying: false,
            isDragging: false,
            dragStartTime: 0,
            touchStartX: 0,
            touchStartY: 0,
            elementStartX: 0,
            elementStartY: 0,
            alphaMask: null,      // Uint8Array (1 byte per pixel, 0/1)
            alphaWidth: 0,
            alphaHeight: 0,
            hideOnAudioEnd: null  // Stores the ended listener function for cleanup
        };

        // Build alpha mask from static image once it loads (one-time cost)
        const buildAlphaMask = () => {
            try {
                const w = placeholder.naturalWidth;
                const h = placeholder.naturalHeight;
                if (!w || !h) return;
                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                const cctx = c.getContext('2d');
                cctx.drawImage(placeholder, 0, 0);
                const data = cctx.getImageData(0, 0, w, h).data;
                const mask = new Uint8Array(w * h);
                for (let i = 0, j = 3; i < mask.length; i++, j += 4) {
                    mask[i] = data[j] > 20 ? 1 : 0;  // Relaxed from >50 to >20 for easier clicking
                }
                gifData.alphaMask = mask;
                gifData.alphaWidth = w;
                gifData.alphaHeight = h;
            } catch (e) {
                // CORS or other failure -> fallback inset hit area is used
            }
        };
        if (placeholder.complete && placeholder.naturalWidth > 0) {
            buildAlphaMask();
        } else {
            placeholder.addEventListener('load', buildAlphaMask, { once: true });
        }

        this.gifs.push(gifData);
        this.attachEventListeners(gifData);
    }

    // Check if a screen point hits a non-transparent pixel of the GIF.
    // Falls back to a 15% inset hit-area if alpha mask isn't available.
    isPointOnGif(gifData, clientX, clientY) {
        const rect = gifData.element.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return false;

        if (gifData.alphaMask) {
            const imgW = gifData.alphaWidth;
            const imgH = gifData.alphaHeight;
            // object-fit: contain -> compute rendered image rect inside element
            const scale = Math.min(rect.width / imgW, rect.height / imgH);
            const renderedW = imgW * scale;
            const renderedH = imgH * scale;
            const offsetX = (rect.width - renderedW) / 2;
            const offsetY = (rect.height - renderedH) / 2;
            const inX = localX - offsetX;
            const inY = localY - offsetY;
            if (inX < 0 || inY < 0 || inX >= renderedW || inY >= renderedH) return false;
            const px = Math.floor((inX / renderedW) * imgW);
            const py = Math.floor((inY / renderedH) * imgH);
            return gifData.alphaMask[py * imgW + px] === 1;
        }

        // Fallback: 15% inset hit area
        const insetX = rect.width * 0.15;
        const insetY = rect.height * 0.15;
        return localX >= insetX && localX <= rect.width - insetX
            && localY >= insetY && localY <= rect.height - insetY;
    }

    attachEventListeners(gifData) {
        if (isMobile) {
            this.attachMobileListeners(gifData);
        } else {
            this.attachDesktopListeners(gifData);
        }
    }

    attachDesktopListeners(gifData) {
        const { element } = gifData;

        // Hover only updates cursor (visual feedback), no animation playback yet
        element.addEventListener('mousemove', (e) => {
            if (gifData.isDragging) return;
            const onSolid = this.isPointOnGif(gifData, e.clientX, e.clientY);
            // Update cursor based on hit area
            element.style.cursor = onSolid ? 'grab' : 'default';
        });

        // Drag functionality - audio already started on mousedown
        element.addEventListener('mousedown', (e) => {
            // Only start interaction if on a solid (non-transparent) pixel
            if (!this.isPointOnGif(gifData, e.clientX, e.clientY)) return;
            
            e.preventDefault();
            
            // Start playing audio immediately on mousedown
            this.activateGif(gifData);
            element.style.zIndex = ++_topZ;
            
            gifData.dragStartTime = Date.now();
            gifData.isDragging = false;

            const rect = element.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;

            const onMouseMove = (e) => {
                // Check if dragging is locked
                if (isDraggingLocked) return;
                
                const dragDuration = Date.now() - gifData.dragStartTime;
                
                // Consider it a drag after 200ms or 10px movement
                if (dragDuration > 200 || !gifData.isDragging) {
                    gifData.isDragging = true;
                    const gifContainer = document.getElementById('gif-container');
                    const frameRect = gifContainer.getBoundingClientRect();
                    
                    let newLeft = e.clientX - frameRect.left - offsetX;
                    let newTop = e.clientY - frameRect.top - offsetY;
                    
                    element.style.left = newLeft + 'px';
                    element.style.top = newTop + 'px';
                }
            };

            const onMouseUp = () => {
                // Let audio continue playing until it finishes
                
                setTimeout(() => {
                    gifData.isDragging = false;
                }, 100);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    attachMobileListeners(gifData) {
        const { element } = gifData;
        let longPressTimeout;
        let isActiveTouchOnElement = false;

        element.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            // Only respond to touches on non-transparent pixels
            if (!this.isPointOnGif(gifData, touch.clientX, touch.clientY)) return;
            e.preventDefault();
            
            // Start playing audio immediately on touch
            this.activateGif(gifData);
            
            isActiveTouchOnElement = true;
            gifData.dragStartTime = Date.now();
            gifData.touchStartX = touch.clientX;
            gifData.touchStartY = touch.clientY;
            
            const rect = element.getBoundingClientRect();
            gifData.elementStartX = rect.left;
            gifData.elementStartY = rect.top;

            // Long press detection for dragging
            longPressTimeout = setTimeout(() => {
                gifData.isDragging = true;
            }, 200);

            // Setup document-level touch handlers
            const onTouchMove = (e) => {
                if (!isActiveTouchOnElement) return;
                
                e.preventDefault();
                const touch = e.touches[0];
                
                const deltaX = touch.clientX - gifData.touchStartX;
                const deltaY = touch.clientY - gifData.touchStartY;

                // If moved more than 10px, it's a drag
                if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                    gifData.isDragging = true;
                }

                if (gifData.isDragging && !isDraggingLocked) {
                    const gifContainer = document.getElementById('gif-container');
                    const frameRect = gifContainer.getBoundingClientRect();
                    
                    let newLeft = gifData.elementStartX - frameRect.left + deltaX;
                    let newTop = gifData.elementStartY - frameRect.top + deltaY;
                    
                    element.style.left = newLeft + 'px';
                    element.style.top = newTop + 'px';
                }
            };

            const onTouchEnd = (e) => {
                if (!isActiveTouchOnElement) return;
                
                isActiveTouchOnElement = false;
                clearTimeout(longPressTimeout);
                
                // Let audio continue playing until it finishes
                
                setTimeout(() => {
                    gifData.isDragging = false;
                }, 100);
                
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
            };

            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
        });
    }

    // Unified GIF activation: show animation, play audio, auto-hide when audio ends
    activateGif(gifData) {
        // Show animated GIF
        gifData.placeholder.style.display = 'none';
        gifData.animatedImg.style.display = 'block';
        
        // Reload GIF to restart animation
        const src = gifData.animatedImg.src;
        gifData.animatedImg.src = '';
        gifData.animatedImg.src = src;
        
        // Pick audio: random from pool if multiple, else the single one
        const pool = gifData.audioPool || [gifData.audio];
        const audio = pool.length > 1
            ? pool[Math.floor(Math.random() * pool.length)]
            : pool[0];

        // Stop any previously playing audio from the pool
        pool.forEach(a => { if (a !== audio && !a.paused) { a.pause(); a.currentTime = 0; } });

        // Play audio
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {});
        }
        
        // Remove old ended listener if it exists (prevent duplicates)
        if (gifData.hideOnAudioEnd && gifData.activeAudio) {
            gifData.activeAudio.removeEventListener('ended', gifData.hideOnAudioEnd);
        }
        gifData.activeAudio = audio;
        
        // Auto-hide when audio ends
        gifData.hideOnAudioEnd = () => {
            gifData.placeholder.style.display = 'block';
            gifData.animatedImg.style.display = 'none';
        };
        audio.addEventListener('ended', gifData.hideOnAudioEnd);
    }
}

// Initialize the sampler when DOM is ready
function positionInfoFloat(el) {
    const offset = 16;
    const w = el.offsetWidth || 220;
    const h = el.offsetHeight || 40;
    let x = _mouseX + offset;
    let y = _mouseY + offset;
    if (x + w > window.innerWidth - 10) x = _mouseX - w - offset;
    if (y + h > window.innerHeight - 10) y = _mouseY - h - offset;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
}

function setHoverInfo(text) {
    const floatEl = document.getElementById('info-float');
    if (!floatEl) return;
    if (!infoFloatEnabled) {
        floatEl.classList.remove('visible');
        return;
    }
    floatEl.textContent = text || '';
    if (text && !_infoFloatFrozen) positionInfoFloat(floatEl);
    floatEl.classList.toggle('visible', !!text);
}

document.addEventListener('DOMContentLoaded', () => {
    new GifSampler(samplerConfig);
    setupCustomScrollbar();

    // Track mouse for info-float positioning
    document.addEventListener('mousemove', (e) => {
        _mouseX = e.clientX;
        _mouseY = e.clientY;
        const floatEl = document.getElementById('info-float');
        if (floatEl && floatEl.classList.contains('visible') && !_infoFloatFrozen) positionInfoFloat(floatEl);
    });

    // Setup SVG hover state swapping
    setupSvgHoverStates();

    // Explicitly wire HOVER SVGs for social/music icon links
    document.querySelectorAll('.icon-link img').forEach(img => {
        const link = img.closest('.icon-link');
        if (!link) return;
        const normalSrc = img.getAttribute('src');
        const hoverSrc = normalSrc.replace('SVG-STATES/NORMAL/', 'SVG-STATES/HOVER/');
        const preload = new Image(); preload.src = hoverSrc;
        link.addEventListener('mouseenter', () => { img.src = hoverSrc; });
        link.addEventListener('mouseleave', () => { img.src = normalSrc; });
    });

    // In room mode, scrolling drives the back-wall depth (room "opens" as you scroll).
    if (VIEW_MODE === 'room') {
        requestAnimationFrame(() => setupRoomScrollOpen());
    }

    // Reveal page now that classes and layout are settled — prevents flash on load
    requestAnimationFrame(() => {
        document.body.style.transition = 'opacity 0.15s';
        document.body.style.opacity = '1';
    });

    // Forward wheel events from anywhere on the page to the scroller
    const scroller = document.getElementById('table-scroll');
    if (scroller) {
        window.addEventListener('wheel', (e) => {
            scroller.scrollTop += e.deltaY;
            e.preventDefault();
        }, { passive: false });
    }

    // View mode toggle (3D room <-> flat). Reload to re-init cleanly.
    const viewToggle = document.getElementById('view-toggle');
    if (viewToggle) {
        // Set initial SVG based on current view mode
        const viewImg = viewToggle.querySelector('img');
        if (viewImg) {
            viewImg.src = VIEW_MODE === 'room' ? 'icons/SVG-STATES/NORMAL/room-3D.svg' : 'icons/SVG-STATES/NORMAL/room-flat.svg';
        }
        viewToggle.addEventListener('click', () => {
            const next = VIEW_MODE === 'room' ? 'flat' : 'room';
            try { localStorage.setItem('viewMode', next); } catch (e) {}
            location.reload();
        });
    }
    
    // Setup lock button — start unlocked (yellow open icon)
    const lockButton = document.getElementById('lock-button');
    const lockImg = lockButton.querySelector('img');
    if (lockImg) lockImg.src = 'icons/SVG-STATES/NORMAL/lock-open-yellow.svg';

    // Lock hover: orange when locked, yellow when unlocked
    lockButton.addEventListener('mouseenter', () => {
        if (lockImg) lockImg.src = isDraggingLocked
            ? 'icons/SVG-STATES/HOVER/lock-closed.svg'
            : 'icons/SVG-STATES/HOVER/lock-open.svg';
    });
    lockButton.addEventListener('mouseleave', () => {
        if (lockImg) lockImg.src = isDraggingLocked
            ? 'icons/SVG-STATES/NORMAL/lock-closed-orange.svg'
            : 'icons/SVG-STATES/NORMAL/lock-open-yellow.svg';
    });
    lockButton.addEventListener('click', () => {
        isDraggingLocked = !isDraggingLocked;
        if (isDraggingLocked) {
            if (lockImg) lockImg.src = 'icons/SVG-STATES/NORMAL/lock-closed-orange.svg';
            lockButton.classList.add('locked');
        } else {
            if (lockImg) lockImg.src = 'icons/SVG-STATES/NORMAL/lock-open-yellow.svg';
            lockButton.classList.remove('locked');
        }
        setHoverInfo(isDraggingLocked ? 'Unlock sample position' : 'Lock sample position');
    });

    // Setup drive knob (master output drive + soft-clip, 0..1)
    const driveKnob = document.getElementById('drive-knob');
    if (driveKnob) {
        const dial = driveKnob.querySelector('.knob-dial');
        // Wrap the rotating dial in a fixed clip that always hides the bottom 60° gap
        // so the arc body never bleeds into the gap region as it rotates.
        // Polygon: full rect minus the wedge from 7 o'clock → center → 5 o'clock.
        const dialClip = document.createElement('div');
        dialClip.style.cssText = 'position:absolute;inset:0;clip-path:polygon(0 0,100% 0,100% 100%,68.5% 92%,54.5% 70%,45.5% 70%,31.5% 92%,0 100%);';
        driveKnob.insertBefore(dialClip, dial);
        dialClip.appendChild(dial);
        const MIN_ANGLE = 0;
        const MAX_ANGLE = 300;
        let amount = 0;

        // Indication overlay: clip knob-indication.svg to a pie sector matching the current amount
        const NS = 'http://www.w3.org/2000/svg';
        const overlaySvg = document.createElementNS(NS, 'svg');
        overlaySvg.setAttribute('viewBox', '0 0 1 1');
        overlaySvg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
        const defs = document.createElementNS(NS, 'defs');
        const clipPath = document.createElementNS(NS, 'clipPath');
        clipPath.setAttribute('id', 'knob-ring-clip');
        const clipSector = document.createElementNS(NS, 'path');
        clipPath.appendChild(clipSector);
        defs.appendChild(clipPath);
        overlaySvg.appendChild(defs);
        const indicationImg = document.createElementNS(NS, 'image');
        indicationImg.setAttribute('href', 'icons/SVG-STATES/HOVER/knob-indication.svg');
        indicationImg.setAttribute('x', '0');
        indicationImg.setAttribute('y', '0');
        indicationImg.setAttribute('width', '1');
        indicationImg.setAttribute('height', '1');
        indicationImg.setAttribute('clip-path', 'url(#knob-ring-clip)');
        overlaySvg.appendChild(indicationImg);
        driveKnob.appendChild(overlaySvg);

        // Returns a pie-sector path (in 0..1 normalised coords) from the start angle
        // sweeping clockwise by amount*300°. Angles measured from top, clockwise.
        function makeSectorPath(amt) {
            if (amt < 0.001) return '';
            const cx = 0.5, cy = 0.5, r = 0.7;
            const toRad = d => d * Math.PI / 180;
            const startDeg = 210;                    // 30° left of bottom (7 o'clock)
            const endDeg   = startDeg + amt * 300;   // up to 30° right of bottom (5 o'clock)
            const x1 = cx + r * Math.sin(toRad(startDeg));
            const y1 = cy - r * Math.cos(toRad(startDeg));
            const x2 = cx + r * Math.sin(toRad(endDeg));
            const y2 = cy - r * Math.cos(toRad(endDeg));
            const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
            return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        }

        const applyAmount = (a) => {
            amount = Math.max(0, Math.min(1, a));
            const angle = MIN_ANGLE + amount * (MAX_ANGLE - MIN_ANGLE);
            dial.style.transform = `rotate(${angle}deg)`;
            driveKnob.setAttribute('aria-valuenow', Math.round(amount * 100));
            driveKnob.classList.toggle('active', amount > 0.001);
            setDriveAmount(amount);
            clipSector.setAttribute('d', makeSectorPath(amount));
            if (!_applyInit) setHoverInfo('Drive ' + Math.round(amount * 100) + '%');
        };

        let dragging = false;
        let startY = 0;
        let startAmount = 0;
        const DRAG_RANGE_PX = 150; // pixels to go from 0 to 1

        const onMove = (clientY) => {
            const dy = startY - clientY; // up = increase
            applyAmount(startAmount + dy / DRAG_RANGE_PX);
        };

        driveKnob.addEventListener('mousedown', (e) => {
            dragging = true;
            startY = e.clientY;
            startAmount = amount;
            _infoFloatFrozen = true;
            e.preventDefault();
        });
        const knobDialImg = dial.querySelector('img');
        if (knobDialImg) {
            driveKnob.addEventListener('mouseenter', () => { knobDialImg.src = 'icons/SVG-STATES/HOVER/knob-plus.svg'; });
            driveKnob.addEventListener('mouseleave', () => { if (!dragging) knobDialImg.src = 'icons/SVG-STATES/NORMAL/knob-plus.svg'; });
        }
        document.addEventListener('mousemove', (e) => {
            if (dragging) onMove(e.clientY);
        });
        document.addEventListener('mouseup', () => {
            if (dragging) {
                setHoverInfo('');
                // Restore normal image if cursor is no longer over the knob
                if (knobDialImg && !driveKnob.matches(':hover')) {
                    knobDialImg.src = 'icons/SVG-STATES/NORMAL/knob-plus.svg';
                }
            }
            dragging = false;
            _infoFloatFrozen = false;
        });

        driveKnob.addEventListener('touchstart', (e) => {
            dragging = true;
            startY = e.touches[0].clientY;
            startAmount = amount;
            _infoFloatFrozen = true;
            e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchmove', (e) => {
            if (dragging) onMove(e.touches[0].clientY);
        }, { passive: false });
        document.addEventListener('touchend', () => { if (dragging) setHoverInfo(''); dragging = false; _infoFloatFrozen = false; });

        let _wheelTimeout = null;
        driveKnob.addEventListener('wheel', (e) => {
            e.preventDefault();
            _infoFloatFrozen = true;
            applyAmount(amount - e.deltaY / 1000);
            clearTimeout(_wheelTimeout);
            _wheelTimeout = setTimeout(() => { setHoverInfo(''); _infoFloatFrozen = false; }, 800);
        }, { passive: false });

        driveKnob.addEventListener('dblclick', () => applyAmount(0));

        driveKnob.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { applyAmount(amount + 0.05); e.preventDefault(); }
            else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { applyAmount(amount - 0.05); e.preventDefault(); }
        });
        driveKnob.addEventListener('keyup', () => setHoverInfo(''));

        let _applyInit = true;
        applyAmount(0);
        _applyInit = false;
    }

    // Fetch and display upcoming shows from Bandsintown
    fetchBandsintown();
    // Wire up the add-video button
    const addVideoBtn = document.getElementById('add-video');
    if (addVideoBtn) addVideoBtn.addEventListener('click', createVideoPad);

    // Wire up the info-float toggle button
    const infoToggleBtn = document.getElementById('info-toggle');
    if (infoToggleBtn) {
        const infoImg = infoToggleBtn.querySelector('img');
        const ICON_ON       = 'icons/SVG-STATES/NORMAL/question.svg';        // yellow
        const ICON_ON_HOVER = 'icons/SVG-STATES/HOVER/question.svg';         // light
        const ICON_OFF      = 'icons/SVG-STATES/NORMAL/question-disabled.svg'; // dark
        // Idle icon for the current enabled state.
        const idleIcon = (enabled) => enabled ? ICON_ON : ICON_OFF;
        // Hover icon: yellow stays yellow (scale-only via .icon-button:hover);
        // dark swaps to the light variant on hover.
        const hoverIcon = (enabled) => enabled ? ICON_ON : ICON_ON_HOVER;
        let pressing = false;
        const refresh = () => {
            if (!infoImg) return;
            const hovering = infoToggleBtn.matches(':hover');
            // While the mouse button is held, show the IDLE icon for the
            // state we are about to toggle to (preview the next state).
            const enabled = pressing ? !infoFloatEnabled : infoFloatEnabled;
            infoImg.src = (pressing || !hovering) ? idleIcon(enabled) : hoverIcon(enabled);
            infoToggleBtn.classList.toggle('info-off', !infoFloatEnabled);
        };
        refresh();
        // Preload hover variant
        const preload = new Image(); preload.src = ICON_ON_HOVER;
        infoToggleBtn.addEventListener('mouseenter', refresh);
        infoToggleBtn.addEventListener('mouseleave', () => { pressing = false; refresh(); });
        infoToggleBtn.addEventListener('mousedown', () => { pressing = true; refresh(); });
        // Mouseup fires before click; clear the press flag here so the click
        // handler's refresh() picks up the new committed state.
        const releasePress = () => { pressing = false; };
        infoToggleBtn.addEventListener('mouseup', releasePress);
        document.addEventListener('mouseup', releasePress);
        infoToggleBtn.addEventListener('click', () => {
            infoFloatEnabled = !infoFloatEnabled;
            try { localStorage.setItem('infoFloat', infoFloatEnabled); } catch(e) {}
            refresh();
            if (!infoFloatEnabled) {
                const floatEl = document.getElementById('info-float');
                if (floatEl) floatEl.classList.remove('visible');
            }
            // Re-evaluate any open video-pad placeholders so they reflect
            // the new info state immediately (instead of only on next stop).
            document.querySelectorAll('.video-pad').forEach(p => {
                if (typeof p._refreshPlaceholder === 'function') p._refreshPlaceholder();
            });
            setHoverInfo(infoFloatEnabled ? 'Hide info' : 'Show info');
        });
    }

    // Hover info bar — action buttons (state-aware for lock and info-toggle)
    const lockBtnHover = document.getElementById('lock-button');
    if (lockBtnHover) {
        lockBtnHover.addEventListener('mouseenter', () => setHoverInfo(isDraggingLocked ? 'Unlock sample position' : 'Lock sample position'));
        lockBtnHover.addEventListener('mouseleave', () => setHoverInfo(''));
    }
    const driveKnobHover = document.getElementById('drive-knob');
    if (driveKnobHover) {
        driveKnobHover.addEventListener('mouseenter', () => setHoverInfo('Turn to add drive'));
        driveKnobHover.addEventListener('mouseleave', () => setHoverInfo(''));
    }
    const addVideoHover = document.getElementById('add-video');
    if (addVideoHover) {
        addVideoHover.addEventListener('mouseenter', () => setHoverInfo('Add video sampler'));
        addVideoHover.addEventListener('mouseleave', () => setHoverInfo(''));
    }
    const infoToggleHover = document.getElementById('info-toggle');
    if (infoToggleHover) {
        infoToggleHover.addEventListener('mouseenter', () => setHoverInfo(infoFloatEnabled ? 'Hide info' : 'Show info'));
        infoToggleHover.addEventListener('mouseleave', () => setHoverInfo(''));
    }

    // Scrollbar hover info
    const scrollThumb = document.getElementById('custom-scrollbar-thumb');
    if (scrollThumb) {
        scrollThumb.addEventListener('mouseenter', () => setHoverInfo('Scroll anywhere to make more space'));
        scrollThumb.addEventListener('mouseleave', () => setHoverInfo(''));
    }
});

// Fetch Bandsintown shows and display them
async function fetchBandsintown() {
    const showsContainer = document.getElementById('shows-container');
    if (!showsContainer) return;

    try {
        // Fetch from our local proxy endpoint to bypass CORS
        const response = await fetch('/api/bandsintown');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const events = await response.json();
        
        if (!Array.isArray(events)) {
            throw new Error('Invalid response format');
        }

        // Filter for upcoming shows only (events in the future)
        const now = new Date();
        const upcomingEvents = events.filter(event => {
            const eventDate = new Date(event.datetime);
            return eventDate > now;
        });

        if (upcomingEvents.length === 0) {
            showsContainer.innerHTML = '<div class="show-item" style="border: none; padding-left: 0;"><p style="color: #5d5343; font-size: 12px;">No upcoming shows currently scheduled</p></div>';
            return;
        }

        displayShows(upcomingEvents, showsContainer);
    } catch (error) {
        console.error('Bandsintown fetch error:', error);
        showsContainer.innerHTML = '<div class="show-item" style="border: none; padding-left: 0;"><p style="color: #5d5343; font-size: 12px;">Unable to load shows — <a href="https://www.bandsintown.com/a/15583965-echofarmer" target="_blank" style="color: #5d5343; text-decoration: underline;">view on Bandsintown</a></p></div>';
    }
}

function displayShows(events, container) {
    container.innerHTML = '';

    events.forEach(event => {
        const eventDate = new Date(event.datetime);
        const dateStr = eventDate.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });

        // Bandsintown puts the actual show title in event.title
        // and venue.name often duplicates it. Prefer event.title when available.
        const title = event.title || (event.venue && event.venue.name) || 'TBA';
        const location = event.venue ? `${event.venue.city}, ${event.venue.country}` : '';

        // Build clickable link if event URL exists
        const eventUrl = event.url || '';

        const showEl = document.createElement('div');
        showEl.className = 'show-item';
        showEl.innerHTML = `
            <div class="show-date">${dateStr}</div>
            <div class="show-venue">${eventUrl ? `<a href="${eventUrl}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}</div>
            <div class="show-location">${location}</div>
        `;
        container.appendChild(showEl);
    });
}

// ─── Video Sampler Pad ───────────────────────────────────────────────────────

// YouTube IFrame API loader (singleton, lazy)
let _ytApiLoaded = false;
let _ytApiCallbacks = [];
function loadYTApi(cb) {
    if (typeof YT !== 'undefined' && YT.Player) { cb(); return; }
    _ytApiCallbacks.push(cb);
    if (_ytApiLoaded) return;
    _ytApiLoaded = true;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = () => {
    _ytApiCallbacks.forEach(cb => cb());
    _ytApiCallbacks = [];
};

function createVideoPad() {
    let keyBinding = null;
    let isPlaying = false;
    let hasPlayed = false; // becomes true after the first play; controls whether
                           // the explainer reappears on pause/stop when info is off.
    let ytPlayer = null;
    let ytReady = false;
    let ytPollInterval = null;
    let dragging = false, dragOffX = 0, dragOffY = 0;

    // Build DOM
    const pad = document.createElement('div');
    pad.className = 'video-pad';
    pad.style.position = 'absolute';

    // Stagger new pads
    const existing = document.querySelectorAll('.video-pad').length;
    pad.style.left = (60 + existing * 24) + 'px';
    pad.style.top  = (60 + existing * 24) + 'px';

    // URL input
    const urlInput = document.createElement('input');
    urlInput.className = 'video-url';
    urlInput.type = 'text';
    urlInput.placeholder = 'Paste video URL here…';

    // Close button — placed in grid col2/row1 (aligned with url and vol column)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'video-close';
    const closeImg = document.createElement('img');
    closeImg.src = 'icons/SVG-STATES/NORMAL/plus.svg';
    closeImg.alt = 'Close';
    closeImg.style.cssText = 'width:19.5px;height:19.5px;display:block;transform:rotate(45deg);pointer-events:none;';
    closeBtn.appendChild(closeImg);
    closeBtn.addEventListener('mouseenter', () => { closeImg.src = 'icons/SVG-STATES/HOVER/plus.svg'; setHoverInfo('Close video sampler.'); });
    closeBtn.addEventListener('mouseleave', () => { closeImg.src = 'icons/SVG-STATES/NORMAL/plus.svg'; setHoverInfo(''); });

    pad.addEventListener('mouseenter', () => setHoverInfo('Video sampler'));
    pad.addEventListener('mouseleave', () => setHoverInfo(''));

    const stage = document.createElement('div');
    stage.className = 'video-stage';
    const videoEl = document.createElement('video');
    videoEl.className = 'video-el';
    videoEl.hidden = true;
    videoEl.crossOrigin = 'anonymous';
    let _videoSourceNode = null;
    function _connectVideoToChain() {
        if (_videoSourceNode) return;
        _ensureMasterChain();
        const ctx = getAudioContext();
        if (!ctx || !_masterIn) return;
        try {
            _videoSourceNode = ctx.createMediaElementSource(videoEl);
            _videoSourceNode.connect(_masterIn);
        } catch(_) {}
    }
    // ytWrapper stays in the DOM permanently so it keeps its CSS class.
    // YT.Player replaces an inner div, not the wrapper itself.
    const ytWrapper = document.createElement('div');
    ytWrapper.className = 'video-yt';
    ytWrapper.hidden = true;
    // Transparent overlay blocks direct iframe interaction; our controls use the API
    const ytOverlay = document.createElement('div');
    ytOverlay.className = 'video-yt-overlay';

    // Control row: PLAY | MAP KEY | timecode
    const scrub = document.createElement('input');
    scrub.className = 'video-scrub';
    scrub.type = 'range'; scrub.min = 0; scrub.max = 1; scrub.step = 0.001; scrub.value = 0;
    function updateScrubTrack() {
        const pct = parseFloat(scrub.value) * 100;
        scrub.style.background = `linear-gradient(to right, #bfb8af ${pct}%, #595147 ${pct}%)`;
    }
    updateScrubTrack();
    const padRow = document.createElement('div');
    padRow.className = 'video-pad-row';
    const timeLabel = document.createElement('span');
    timeLabel.className = 'video-time';
    timeLabel.textContent = '0:00 / 0:00';
    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'video-trigger';
    triggerBtn.textContent = '▶  PLAY';
    const keyBtn = document.createElement('button');
    keyBtn.className = 'video-key';
    keyBtn.textContent = 'MAP KEY';
    padRow.appendChild(triggerBtn);
    padRow.appendChild(keyBtn);
    padRow.appendChild(timeLabel);

    stage.appendChild(videoEl);
    stage.appendChild(ytWrapper);
    stage.appendChild(ytOverlay);

    // Placeholder shown before any URL is loaded
    const stagePlaceholder = document.createElement('div');
    stagePlaceholder.className = 'video-stage-placeholder';
    stagePlaceholder.innerHTML =
        `<div class="ph-list">` +
        `<span class="ph-num">1.</span><span class="ph-text">Paste a video URL above.</span>` +
        `<span class="ph-num">2.</span><span class="ph-text">Click "MAP KEY" and press a key. That key can now launch the video.</span>` +
        `<span class="ph-num">3.</span><span class="ph-text">To set the sample starting point either...</span>` +
        `<span class="ph-num"></span><span class="ph-text ph-sub">...drag the play head sideways<span class="ph-mini-scrub"><span class="ph-mini-dot"></span></span></span>` +
        `<span class="ph-num"></span><span class="ph-text ph-sub">...or drag up or down in the timecode box<span class="ph-mini-tc">0:42 / 3:15</span></span>` +
        `</div>`;
    stage.appendChild(stagePlaceholder);

    // Stereo meter + fader knob
    let volValue = 0.8;
    const meterWrap = document.createElement('div');
    meterWrap.className = 'video-meter-wrap';
    const meterBars = document.createElement('div');
    meterBars.className = 'video-meter-bars';
    const meterBarL = document.createElement('div');
    meterBarL.className = 'video-meter-bar';
    const meterFillL = document.createElement('div');
    meterFillL.className = 'video-meter-fill';
    meterBarL.appendChild(meterFillL);
    const meterBarR = document.createElement('div');
    meterBarR.className = 'video-meter-bar';
    const meterFillR = document.createElement('div');
    meterFillR.className = 'video-meter-fill';
    meterBarR.appendChild(meterFillR);
    meterBars.appendChild(meterBarL);
    meterBars.appendChild(meterBarR);
    const faderKnob = document.createElement('div');
    faderKnob.className = 'video-fader-knob';
    meterWrap.appendChild(meterBars);
    meterWrap.appendChild(faderKnob);

    function setFaderPos(v) {
        volValue = Math.max(0, Math.min(1, v));
        faderKnob.style.top = `calc(${(1 - volValue) * 100}% - 3px)`;
        meterFillL.style.height = `${volValue * 100}%`;
        meterFillR.style.height = `${volValue * 100}%`;
        videoEl.volume = volValue;
        if (ytPlayer && ytReady) { try { ytPlayer.setVolume(volValue * 100); } catch(_) {} }
    }
    setFaderPos(0.8);

    meterWrap.addEventListener('mouseenter', () => setHoverInfo('Video volume'));
    meterWrap.addEventListener('mouseleave', () => setHoverInfo(''));

    let faderDragging = false;
    faderKnob.addEventListener('mousedown', (e) => { faderDragging = true; e.preventDefault(); e.stopPropagation(); });
    document.addEventListener('mousemove', (e) => {
        if (!faderDragging) return;
        const rect = meterWrap.getBoundingClientRect();
        setFaderPos(1 - (e.clientY - rect.top) / rect.height);
    });
    document.addEventListener('mouseup', () => { faderDragging = false; });
    faderKnob.addEventListener('dblclick', () => setFaderPos(0.8));

    const volLabel = document.createElement('div');
    volLabel.className = 'video-vol-label';
    volLabel.textContent = 'VOL';

    // CSS grid layout: col1=content, col2=vol/close; row1=url/close, row2=stage/vol, row3=controls/label
    const layout = document.createElement('div');
    layout.className = 'video-layout';
    urlInput.style.gridColumn = '1'; urlInput.style.gridRow = '1';
    stage.style.gridColumn    = '1'; stage.style.gridRow    = '2';
    layout.appendChild(urlInput);   // col1 row1
    layout.appendChild(closeBtn);   // col2 row1
    layout.appendChild(stage);      // col1 row2
    layout.appendChild(meterWrap);  // col2 row2-3
    layout.appendChild(scrub);      // col1 row3
    layout.appendChild(padRow);     // col1 row4
    layout.appendChild(volLabel);   // col2 row4
    pad.appendChild(layout);

    const _padContainer = document.getElementById('gif-container') || document.getElementById('frame-inner') || document.body;
    _padContainer.appendChild(pad);

    // ── Helpers ──
    function fmt(s) {
        if (!isFinite(s)) return '0:00';
        return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
    }
    function isYT(url) { return /youtu\.be\/|youtube\.com\/(?:watch|shorts)/.test(url); }
    function getYTId(url) { const m = url.match(/(?:youtu\.be\/|[?&]v=|shorts\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; }

    function stopYTPoll() {
        if (ytPollInterval) { clearInterval(ytPollInterval); ytPollInterval = null; }
    }

    function startYTPoll() {
        stopYTPoll();
        ytPollInterval = setInterval(() => {
            if (!ytPlayer || !ytReady) return;
            // Only sync scrub from the player while playing — otherwise the poll
            // would fight a user drag on the scrub bar by overwriting its value.
            if (!isPlaying) return;
            // Don't fight the user while they are actively scrubbing.
            if (userSeeking) return;
            try {
                const dur = ytPlayer.getDuration();
                const cur = ytPlayer.getCurrentTime();
                if (dur > 0) {
                    scrub.value = cur / dur;
                    updateScrubTrack();
                    timeLabel.textContent = `${fmt(cur)} / ${fmt(dur)}`;
                }
            } catch (_) {}
        }, 250);
    }

    function resetPlayer() {
        stopYTPoll();
        videoEl.pause(); videoEl.src = ''; videoEl.hidden = true;
        if (ytPlayer) { try { ytPlayer.destroy(); } catch (_) {} ytPlayer = null; }
        ytReady = false;
        ytWrapper.innerHTML = ''; ytWrapper.hidden = true;
        isPlaying = false;
        hasPlayed = false;
        triggerBtn.textContent = '▶  PLAY'; triggerBtn.classList.remove('active');
        scrub.value = 0; timeLabel.textContent = '0:00 / 0:00'; updateScrubTrack();
        // Reset url-input loaded indicator and re-show the explainer.
        urlInput.style.background = '';
        stagePlaceholder.style.display = 'flex';
    }

    // Signal a successfully loaded video by tinting the URL input.
    const URL_LOADED_BG = '#90f1df';
    function markUrlLoaded() { urlInput.style.background = URL_LOADED_BG; }
    // Show the placeholder unless info is off and the video has already been
    // played at least once (in that case the user has seen the instructions).
    function showPlaceholder() {
        if (isPlaying) return; // never override during playback
        if (!infoFloatEnabled && hasPlayed) {
            stagePlaceholder.style.display = 'none';
        } else {
            stagePlaceholder.style.display = 'flex';
        }
    }
    // Expose so the info-toggle handler can re-show the placeholder when
    // info is turned back on while the video is paused.
    pad._refreshPlaceholder = showPlaceholder;

    function loadUrl(raw) {
        const url = raw.trim(); if (!url) return;
        // Keep the explainer visible — it's only hidden once playback starts.
        resetPlayer();
        if (isYT(url)) {
            const id = getYTId(url); if (!id) return;
            ytWrapper.hidden = false;
            loadYTApi(() => {
                // Create a fresh inner target — YT.Player replaces this, not ytWrapper
                const ytTarget = document.createElement('div');
                ytTarget.style.width = '100%';
                ytTarget.style.height = '100%';
                ytWrapper.appendChild(ytTarget);
                ytPlayer = new YT.Player(ytTarget, {
                    videoId: id,
                    width: '100%',
                    height: '100%',
                    playerVars: { rel: 0, enablejsapi: 1, controls: 0, disablekb: 1, iv_load_policy: 3, cc_load_policy: 0, fs: 0, modestbranding: 1 },
                    events: {
                        onReady() {
                            ytReady = true;
                            ytPlayer.setVolume(volValue * 100);
                            startYTPoll();
                            markUrlLoaded();
                        },
                        onStateChange(e) {
                            if (e.data === YT.PlayerState.PLAYING) {
                                isPlaying = true; hasPlayed = true; triggerBtn.textContent = '■  STOP'; triggerBtn.classList.add('active');
                                stagePlaceholder.style.display = 'none';
                            } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
                                isPlaying = false; triggerBtn.textContent = '▶  PLAY'; triggerBtn.classList.remove('active');
                                showPlaceholder();
                            }
                        }
                    }
                });
            });
        } else {
            videoEl.hidden = false;
            videoEl.src = url;
            videoEl.volume = volValue;
            videoEl.load();
            _connectVideoToChain();
        }
    }

    let startScrubPos = 0;
    // True while the user is actively seeking (dragging the scrub bar, dragging
    // the timecode label, or pressing arrow keys). Suppresses the YT poll so
    // it doesn't overwrite the user's intended position mid-action.
    let userSeeking = false;
    let _seekClearTimer = null;
    function markUserSeeking(ms = 400) {
        userSeeking = true;
        clearTimeout(_seekClearTimer);
        _seekClearTimer = setTimeout(() => { userSeeking = false; }, ms);
    }

    function startPlay() {
        startScrubPos = parseFloat(scrub.value);
        if (ytPlayer && ytReady) {
            try {
                const dur = ytPlayer.getDuration();
                if (dur > 0) ytPlayer.seekTo(startScrubPos * dur, true);
                ytPlayer.playVideo();
            } catch (_) {}
        } else if (!videoEl.hidden && videoEl.src) {
            if (videoEl.duration) videoEl.currentTime = startScrubPos * videoEl.duration;
            videoEl.play();
            isPlaying = true; triggerBtn.classList.add('active');
        }
        hasPlayed = true;
        triggerBtn.textContent = '■  STOP';
        triggerBtn.classList.add('active');
        stagePlaceholder.style.display = 'none';
    }

    function stopPlay() {
        if (ytPlayer && ytReady) {
            try {
                ytPlayer.pauseVideo();
                ytPlayer.seekTo(startScrubPos * ytPlayer.getDuration(), true);
            } catch (_) {}
        } else if (!videoEl.hidden) {
            videoEl.pause();
            if (videoEl.duration) videoEl.currentTime = startScrubPos * videoEl.duration;
        }
        scrub.value = startScrubPos; updateScrubTrack();
        const dur = videoEl.duration || (ytPlayer && ytReady ? (() => { try { return ytPlayer.getDuration(); } catch(_){return 0;} })() : 0);
        timeLabel.textContent = `${fmt(startScrubPos * dur)} / ${fmt(dur)}`;
        isPlaying = false;
        triggerBtn.textContent = '▶  PLAY';
        triggerBtn.classList.remove('active');
        showPlaceholder();
    }

    // ── HTML5 video events ──
    videoEl.addEventListener('timeupdate', () => {
        if (userSeeking) return;
        if (videoEl.duration) {
            scrub.value = videoEl.currentTime / videoEl.duration;
            updateScrubTrack();
            timeLabel.textContent = `${fmt(videoEl.currentTime)} / ${fmt(videoEl.duration)}`;
        }
    });
    videoEl.addEventListener('ended', () => {
        isPlaying = false; triggerBtn.textContent = '▶  PLAY'; triggerBtn.classList.remove('active');
        showPlaceholder();
    });
    videoEl.addEventListener('loadedmetadata', () => { markUrlLoaded(); });
    scrub.addEventListener('input', () => {
        updateScrubTrack();
        markUserSeeking();
        if (ytPlayer && ytReady) {
            try {
                const dur = ytPlayer.getDuration();
                if (dur > 0) ytPlayer.seekTo(scrub.value * dur, true);
            } catch (_) {}
        } else if (videoEl.duration) {
            videoEl.currentTime = scrub.value * videoEl.duration;
        }
    });
    scrub.addEventListener('mouseenter', () => setHoverInfo('Drag playhead left or right to set sample start'));
    scrub.addEventListener('mouseleave', () => setHoverInfo(''));
    // Drag up/down on timecode = per-second seek (1px = 1s, shift = 0.1s/px)
    let timeDragY = null;
    let timeDragStart = null;
    timeLabel.addEventListener('mouseenter', () => setHoverInfo('Drag up or down (or use arrow keys) to set sample start. Hold shift for fine, cmd/ctrl+shift for ultra-fine control.'));
    timeLabel.addEventListener('mouseleave', () => setHoverInfo(''));
    timeLabel.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        timeDragY = e.clientY;
        timeDragStart = ytPlayer && ytReady
            ? (() => { try { return ytPlayer.getCurrentTime(); } catch(_) { return 0; } })()
            : (videoEl.duration ? videoEl.currentTime : 0);
        timeLabel.classList.add('dragging');
    });
    document.addEventListener('mousemove', (e) => {
        if (timeDragY === null) return;
        // Read modifiers live so the user can press/release them mid-drag.
        // shift = 0.1s/px (fine), cmd/ctrl+shift = 0.01s/px (ultra-fine), default = 1s/px.
        const ultra = e.shiftKey && (e.metaKey || e.ctrlKey);
        const rate = ultra ? 0.01 : (e.shiftKey ? 0.1 : 1);
        const delta = (timeDragY - e.clientY) * rate;
        const target = timeDragStart + delta;
        markUserSeeking();
        if (ytPlayer && ytReady) {
            try {
                const dur = ytPlayer.getDuration();
                if (dur > 0) ytPlayer.seekTo(Math.max(0, Math.min(dur, target)), true);
            } catch (_) {}
        } else if (videoEl.duration) {
            videoEl.currentTime = Math.max(0, Math.min(videoEl.duration, target));
            scrub.value = videoEl.currentTime / videoEl.duration;
            timeLabel.textContent = `${fmt(videoEl.currentTime)} / ${fmt(videoEl.duration)}`;
        }
    });
    document.addEventListener('mouseup', () => {
        if (timeDragY !== null) {
            // Update cue point so trigger snap-back goes to the new position
            if (videoEl.duration) startScrubPos = videoEl.currentTime / videoEl.duration;
            else if (ytPlayer && ytReady) {
                try { const d = ytPlayer.getDuration(); if (d > 0) startScrubPos = ytPlayer.getCurrentTime() / d; } catch(_) {}
            }
        }
        timeDragY = null; timeDragStart = null;
        timeLabel.classList.remove('dragging');
    });
    timeLabel.addEventListener('touchstart', (e) => {
        timeDragY = e.touches[0].clientY;
        timeDragStart = ytPlayer && ytReady
            ? (() => { try { return ytPlayer.getCurrentTime(); } catch(_) { return 0; } })()
            : (videoEl.duration ? videoEl.currentTime : 0);
    }, { passive: true });
    timeLabel.addEventListener('touchmove', (e) => {
        if (timeDragY === null) return;
        const rate = e.touches.length > 1 ? 0.1 : 1; // two-finger touch = fine mode
        const delta = (timeDragY - e.touches[0].clientY) * rate;
        const target = timeDragStart + delta;
        if (ytPlayer && ytReady) {
            try {
                const dur = ytPlayer.getDuration();
                if (dur > 0) ytPlayer.seekTo(Math.max(0, Math.min(dur, target)), true);
            } catch (_) {}
        } else if (videoEl.duration) {
            videoEl.currentTime = Math.max(0, Math.min(videoEl.duration, target));
            scrub.value = videoEl.currentTime / videoEl.duration;
            timeLabel.textContent = `${fmt(videoEl.currentTime)} / ${fmt(videoEl.duration)}`;
        }
    }, { passive: true });
    timeLabel.addEventListener('touchend', () => { timeDragY = null; timeDragStart = null; timeLabel.classList.remove('dragging'); });

    // ── URL load ──
    urlInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { loadUrl(urlInput.value); urlInput.blur(); }
    });
    urlInput.addEventListener('paste', () => setTimeout(() => { loadUrl(urlInput.value); urlInput.blur(); }, 0));
    urlInput.addEventListener('input', () => { if (!urlInput.value.trim()) urlInput.style.background = ''; });
    urlInput.addEventListener('mouseenter', () => setHoverInfo('Paste video URL here.'));
    urlInput.addEventListener('mouseleave', () => setHoverInfo(''));

    // ── Trigger (hold to play) ──
    triggerBtn.addEventListener('mousedown', (e) => { e.preventDefault(); startPlay(); });
    triggerBtn.addEventListener('mouseleave', (e) => { stopPlay(); setHoverInfo(''); });
    triggerBtn.addEventListener('mouseup', stopPlay);
    triggerBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startPlay(); }, { passive: false });
    triggerBtn.addEventListener('touchend', stopPlay);
    triggerBtn.addEventListener('mouseenter', () => setHoverInfo('Hold to play. Or map a key with the "MAP KEY" button for easier triggering.'));

    // ── Key binding ──
    let listening = false;
    let keyHeld = false;
    const keydownHandler = (e) => {
        if (listening) {
            if (e.key === 'Escape' || e.key === 'Backspace') {
                listening = false; keyBinding = null;
                keyBtn.classList.remove('binding', 'mapped');
                keyBtn.textContent = 'MAP KEY';
            } else {
                // Store the raw key exactly as fired so comparison always matches
                keyBinding = e.key;
                keyBtn.classList.remove('binding');
                keyBtn.classList.add('mapped');
                keyBtn.textContent = e.key.length === 1 ? e.key.toUpperCase() : e.key;
                listening = false;
            }
            e.preventDefault(); e.stopPropagation(); return;
        }
        if (keyBinding && document.activeElement !== urlInput && e.key === keyBinding && !keyHeld) {
            keyHeld = true;
            startPlay(); e.preventDefault();
        }
        // Arrow-key time scrubbing: only act on the pad the cursor is currently over,
        // and only when the URL input isn't focused (so typing in the URL still works).
        if (document.activeElement !== urlInput && pad.matches(':hover')) {
            const isHoriz = e.key === 'ArrowRight' || e.key === 'ArrowLeft';
            const isVert  = e.key === 'ArrowUp'    || e.key === 'ArrowDown';
            if (isHoriz || isVert) {
                const dir = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1 : -1;
                // Same precision tiers as the drag: shift = 0.1s, cmd/ctrl+shift = 0.01s.
                const ultra = e.shiftKey && (e.metaKey || e.ctrlKey);
                const step = ultra ? 0.01 : (e.shiftKey ? 0.1 : 1);
                markUserSeeking();
                if (ytPlayer && ytReady) {
                    try {
                        const dur = ytPlayer.getDuration();
                        if (dur > 0) {
                            const target = Math.max(0, Math.min(dur, ytPlayer.getCurrentTime() + dir * step));
                            ytPlayer.seekTo(target, true);
                            scrub.value = target / dur; updateScrubTrack();
                            timeLabel.textContent = `${fmt(target)} / ${fmt(dur)}`;
                        }
                    } catch(_) {}
                } else if (videoEl.duration) {
                    const target = Math.max(0, Math.min(videoEl.duration, videoEl.currentTime + dir * step));
                    videoEl.currentTime = target;
                    scrub.value = target / videoEl.duration; updateScrubTrack();
                    timeLabel.textContent = `${fmt(target)} / ${fmt(videoEl.duration)}`;
                }
                // Update cue point so a subsequent trigger snap-back goes here.
                startScrubPos = parseFloat(scrub.value);
                e.preventDefault();
            }
        }
    };
    const keyupHandler = (e) => {
        if (keyBinding && e.key === keyBinding && keyHeld) {
            keyHeld = false;
            stopPlay();
        }
    };
    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('keyup', keyupHandler);
    keyBtn.addEventListener('mouseenter', () => setHoverInfo('Click this button and press a key to map it as a trigger. Press the button again to unmap or remap. Hold the key to play the video. Escape or Backspace to delete the key link.'));
    keyBtn.addEventListener('mouseleave', () => setHoverInfo(''));
    keyBtn.addEventListener('click', () => {
        if (listening) {
            // Second click cancels listening, restore previous state
            listening = false;
            keyBtn.classList.remove('binding');
            if (keyBinding) {
                keyBtn.classList.add('mapped');
                keyBtn.textContent = keyBinding.length === 1 ? keyBinding.toUpperCase() : keyBinding;
            } else {
                keyBtn.textContent = 'MAP KEY';
            }
        } else {
            listening = true; keyBtn.classList.add('binding'); keyBtn.classList.remove('mapped');
        }
    });

    // ── Close ──
    closeBtn.addEventListener('click', () => {
        stopYTPoll();
        videoEl.pause();
        if (ytPlayer) { try { ytPlayer.destroy(); } catch (_) {} }
        document.removeEventListener('keydown', keydownHandler);
        document.removeEventListener('keyup', keyupHandler);
        pad.remove();
    });

    // ── Drag (mouse) ──
    let _fr = { left: 0, top: 0 };
    pad.addEventListener('mousedown', (e) => {
        if (isDraggingLocked) return;
        const t = e.target.tagName.toLowerCase();
        if (['input','button','iframe','select','textarea'].includes(t)) return;
        pad.style.zIndex = ++_topZ;
        dragging = true;
        const r = pad.getBoundingClientRect();
        _fr = _padContainer.getBoundingClientRect();
        dragOffX = e.clientX - r.left; dragOffY = e.clientY - r.top;
        e.preventDefault();
    });
    const onMouseMove = (e) => { if (!dragging) return; pad.style.left = (e.clientX - _fr.left - dragOffX) + 'px'; pad.style.top = (e.clientY - _fr.top - dragOffY) + 'px'; };
    const onMouseUp = () => { dragging = false; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // ── Drag (touch) ──
    let _frT = { left: 0, top: 0 };
    pad.addEventListener('touchstart', (e) => {
        if (isDraggingLocked) return;
        const t = e.target.tagName.toLowerCase();
        if (['input','button','iframe','select','textarea'].includes(t)) return;
        pad.style.zIndex = ++_topZ;
        dragging = true;
        const r = pad.getBoundingClientRect();
        _frT = _padContainer.getBoundingClientRect();
        dragOffX = e.touches[0].clientX - r.left; dragOffY = e.touches[0].clientY - r.top;
    }, { passive: true });
    const onTouchMovePad = (e) => { if (!dragging) return; pad.style.left = (e.touches[0].clientX - _frT.left - dragOffX) + 'px'; pad.style.top = (e.touches[0].clientY - _frT.top - dragOffY) + 'px'; };
    const onTouchEndPad = () => { dragging = false; };
    document.addEventListener('touchmove', onTouchMovePad, { passive: true });
    document.addEventListener('touchend', onTouchEndPad);

    // Clean up drag listeners when pad is removed
    const observer = new MutationObserver(() => {
        if (!document.body.contains(pad)) {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('touchmove', onTouchMovePad);
            document.removeEventListener('touchend', onTouchEndPad);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: false });
}

// Prevent default drag behavior on all images
document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') {
        e.preventDefault();
    }
});
