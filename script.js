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
    {
        gif: 'gifs/blue_dolphin.gif',
        staticImg: 'gifs/blue_dolphin.png',
        audio: 'audio/dans1.wav',
        width: 112,
        height: 112,
        x: 25,
        y: 25
    },
    {
        gif: 'gifs/blue_dolphin.gif',
        staticImg: 'gifs/blue_dolphin.png',
        audio: 'audio/dans2.wav',
        width: 112,
        height: 112,
        x: 60,
        y: 45
    },
    {
        gif: 'gifs/blue_dolphin.gif',
        staticImg: 'gifs/blue_dolphin.png',
        audio: 'audio/dans3.wav',
        width: 112,
        height: 112,
        x: 40,
        y: 75
    }
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
    document.addEventListener('DOMContentLoaded', () => document.body.classList.add('flat-mode'));
} else {
    document.documentElement.classList.add('room-mode');
    document.addEventListener('DOMContentLoaded', () => document.body.classList.add('room-mode'));
}

// Lock state for dragging
let isDraggingLocked = false;

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
    _reverbConvolver.buffer = _makeRoomImpulse(ctx, 1.0, 4.0);
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
function setReverbAmount(amount) {
    _ensureMasterChain();
    if (!_reverbWet) return;
    const a = Math.max(0, Math.min(1, amount));
    const ctx = getAudioContext();
    const t = ctx ? ctx.currentTime : 0;
    // Wet ramps up to ~1.0 (loud, lush) when room is fully open.
    _reverbWet.gain.setTargetAtTime(a * 1.0, t, 0.05);
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
const GRID_COLOR = 'rgb(93, 83, 67)';
const BACKGROUND_COLOR = '#a2927c';

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
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#7FDBCA',
    '#FF9999', '#66C2A5', '#FC8D62', '#8DA0CB', '#E78AC3'
];

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
    
    let colorIndex = 0;
    for (let x = 0; x < width; x += cellWidth) {
        // Get color for this cell
        const cellColor = HEADER_COLORS[colorIndex % HEADER_COLORS.length];
        ctx.fillStyle = cellColor;
        
        // Draw colored cell fill (pixel-aligned)
        ctx.fillRect(Math.floor(x), 0, Math.ceil(cellWidth), height);
        
        colorIndex++;
    }
    
    // Draw vertical separators with crisp lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.beginPath();
    for (let x = 0; x <= width; x += cellWidth) {
        const px = Math.floor(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
    }
    // Bottom border of header
    const py = Math.floor(height) - 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
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
    // Build the same 9x9 square-stamp tile the original table uses, sized to one cell.
    // Squares sit on the LEFT side of the cell, with equal padding to the
    // top, bottom and left edges (matches the canvas drawGrid layout).
    const sq = 9;
    const pad = (cellHeight - sq) / 2;
    const sx = pad;
    const sy = pad;
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'>` +
        `<defs><pattern id='p' width='${cellWidth}' height='${cellHeight}' patternUnits='userSpaceOnUse'>` +
        `<rect x='${sx}' y='${sy}' width='${sq}' height='${sq}' fill='%235d5343'/>` +
        `</pattern></defs><rect width='100%25' height='100%25' fill='url(%23p)'/></svg>`;
    frameInner.style.setProperty('--squares-bg', `url("data:image/svg+xml;utf8,${svg}")`);
}

// Animate room depth from 0 -> target by scroll position. The first
// `target` pixels of scrolling "open" the room (back wall recedes from z=0
// to z=-depth). Anything beyond that reveals the links section.
let _roomOpening = false;
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
    // Start with the back wall pulled forward to z=0 (flat-table look).
    frameInner.style.setProperty('--back-z', '0px');
    frameInner.style.setProperty('--back-line-w', '1px');
    let raf = null;
    const update = () => {
        raf = null;
        const target = _roomDepthTarget || 800;
        const t = Math.min(1, Math.max(0, scroller.scrollTop / target));
        const z = target * t;
        frameInner.style.setProperty('--back-z', z + 'px');
        // Adjust back-wall line thickness so projected lines stay ~1px on screen.
        // scale = persp / (persp + z); thickness = round(1 / scale).
        const scale = _roomPersp / (_roomPersp + z);
        const lineW = Math.max(1, Math.round(1 / scale));
        frameInner.style.setProperty('--back-line-w', lineW + 'px');
        // Progressively add room reverb as the room opens.
        setReverbAmount(t);
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

// Custom scrollbar living in the outer frame's right border
function setupCustomScrollbar() {
    const scroller = document.getElementById('table-scroll');
    const bar = document.getElementById('custom-scrollbar');
    const thumb = document.getElementById('custom-scrollbar-thumb');
    if (!scroller || !bar || !thumb) return;

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
    window.addEventListener('resize', () => requestAnimationFrame(update));

    // Drag the thumb
    let dragging = false;
    let dragStartY = 0;
    let dragStartScroll = 0;
    const onThumbDown = (clientY, e) => {
        dragging = true;
        dragStartY = clientY;
        dragStartScroll = scroller.scrollTop;
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
    document.addEventListener('mouseup', () => { dragging = false; });
    document.addEventListener('touchend', () => { dragging = false; });

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

class GifSampler {
    constructor(config) {
        this.config = config;
        this.container = document.getElementById('gif-container');
        this.gifs = [];
        this.init();
        this.setupAudioUnlock();
        this.setupKeyboardListeners();
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
        // Keys that should activate GIFs (by character, works on AZERTY and QWERTY)
        const triggerKeys = ['q', 'z', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l'];
        
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            const index = triggerKeys.indexOf(key);
            if (index !== -1 && index < this.gifs.length) {
                const gifData = this.gifs[index];
                this.activateGif(gifData);
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
            
            gifData.dragStartTime = Date.now();
            gifData.isDragging = false;

            const rect = element.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;
            const MARGIN = 20;

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
                    
                    // Constrain with 20px margin
                    const minLeft = MARGIN;
                    const maxLeft = frameRect.width - element.offsetWidth - MARGIN;
                    const minTop = MARGIN;
                    const maxTop = frameRect.height - element.offsetHeight - MARGIN;
                    
                    newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
                    newTop = Math.max(minTop, Math.min(maxTop, newTop));
                    
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
                const MARGIN = 20;
                
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
                    
                    // Constrain with 20px margin
                    const minLeft = MARGIN;
                    const maxLeft = frameRect.width - element.offsetWidth - MARGIN;
                    const minTop = MARGIN;
                    const maxTop = frameRect.height - element.offsetHeight - MARGIN;
                    
                    newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
                    newTop = Math.max(minTop, Math.min(maxTop, newTop));
                    
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
document.addEventListener('DOMContentLoaded', () => {
    new GifSampler(samplerConfig);
    setupCustomScrollbar();

    // In room mode, scrolling drives the back-wall depth (room "opens" as you scroll).
    if (VIEW_MODE === 'room') {
        requestAnimationFrame(() => setupRoomScrollOpen());
    }

    // View mode toggle (3D room <-> flat). Reload to re-init cleanly.
    const viewToggle = document.getElementById('view-toggle');
    if (viewToggle) {
        viewToggle.textContent = VIEW_MODE === 'room' ? 'Flat' : '3D Room';
        viewToggle.addEventListener('click', () => {
            const next = VIEW_MODE === 'room' ? 'flat' : 'room';
            try { localStorage.setItem('viewMode', next); } catch (e) {}
            location.reload();
        });
    }
    
    // Setup lock button
    const lockButton = document.getElementById('lock-button');
    lockButton.addEventListener('click', () => {
        isDraggingLocked = !isDraggingLocked;
        if (isDraggingLocked) {
            lockButton.textContent = '🔒 Locked';
            lockButton.classList.add('locked');
        } else {
            lockButton.textContent = '🔓 Unlock';
            lockButton.classList.remove('locked');
        }
    });

    // Setup drive knob (master output drive + soft-clip, 0..1)
    const driveKnob = document.getElementById('drive-knob');
    if (driveKnob) {
        const dial = driveKnob.querySelector('.knob-dial');
        const MIN_ANGLE = -135;
        const MAX_ANGLE = 135;
        let amount = 0;

        const applyAmount = (a) => {
            amount = Math.max(0, Math.min(1, a));
            const angle = MIN_ANGLE + amount * (MAX_ANGLE - MIN_ANGLE);
            dial.style.transform = `rotate(${angle}deg)`;
            driveKnob.setAttribute('aria-valuenow', Math.round(amount * 100));
            driveKnob.classList.toggle('active', amount > 0.001);
            setDriveAmount(amount);
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
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (dragging) onMove(e.clientY);
        });
        document.addEventListener('mouseup', () => { dragging = false; });

        driveKnob.addEventListener('touchstart', (e) => {
            dragging = true;
            startY = e.touches[0].clientY;
            startAmount = amount;
            e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchmove', (e) => {
            if (dragging) onMove(e.touches[0].clientY);
        }, { passive: false });
        document.addEventListener('touchend', () => { dragging = false; });

        driveKnob.addEventListener('wheel', (e) => {
            e.preventDefault();
            applyAmount(amount - e.deltaY / 1000);
        }, { passive: false });

        driveKnob.addEventListener('dblclick', () => applyAmount(0));

        driveKnob.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { applyAmount(amount + 0.05); e.preventDefault(); }
            else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { applyAmount(amount - 0.05); e.preventDefault(); }
        });

        applyAmount(0);
    }

    // setupVideoPads(); // disabled for now - back to basics
});

// Prevent default drag behavior on all images
document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') {
        e.preventDefault();
    }
});
