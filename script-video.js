// ─── Video Sampler Pad ───────────────────────────────────────────────────────
// Lazy-loaded on first click of the "+ video sampler" button (see the
// __loadVideoModule wrapper near the end of script.js). Splitting this off
// keeps ~30KB of unused JS off the critical path so initial-render LCP
// stays fast for users who never open a video pad.
//
// Relies on globals declared in script.js (shared via classic-script global
// scope): isMobile, setHoverInfo, _ensureMasterChain, getAudioContext,
// _masterIn, showToast, infoFloatEnabled, isDraggingLocked, _topZ,
// isTypingInForm.

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
    urlInput.placeholder = 'Paste YouTube URL here…';

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
    if (isMobile) {
        stagePlaceholder.innerHTML =
            `<div class="ph-list">` +
            `<span class="ph-num">1.</span><span class="ph-text">Paste a YouTube URL above.</span>` +
            `<span class="ph-num">2.</span><span class="ph-text">Hold the video area to play. Release to stop.</span>` +
            `<span class="ph-num">3.</span><span class="ph-text">Set start point: drag the timeline left\u2009/\u2009right<span class="ph-mini-scrub"><span class="ph-mini-dot"></span></span></span>` +
            `</div>`;
        // iOS limitations are shown once as a longer-lived toast when the
        // pad opens, instead of cluttering the in-stage placeholder.
        showToast('iOS limits video playback to one sound at a time, and disables the volume fader.', 6000);
    } else {
        stagePlaceholder.innerHTML =
            `<div class="ph-list">` +
            `<span class="ph-num">1.</span><span class="ph-text">Paste a YouTube URL above.</span>` +
            `<span class="ph-num">2.</span><span class="ph-text">Click "MAP KEY" and press a key. <br> That key can now launch the video.</span>` +
            `<span class="ph-num">3.</span><span class="ph-text">To set the sample starting point, either...</span>` +
            `<span class="ph-num"></span><span class="ph-text ph-sub">•<span style="padding-left:15px">...drag the play head sideways</span><span class="ph-mini-scrub"><span class="ph-mini-dot"></span></span></span>` +
            `<span class="ph-num"></span><span class="ph-text ph-sub">•<span style="padding-left:15px">...or drag the timecode up or down</span><span class="ph-mini-tc">0:42 / 3:15</span></span>` +
            `</div>`;
    }
    stage.appendChild(stagePlaceholder);

    // Persistent error overlay shown when the pasted URL is not a valid
    // YouTube link. Always visible while present (independent of info-toggle
    // state) until the user pastes a new URL.
    const stageError = document.createElement('div');
    stageError.className = 'video-stage-error';
    stageError.textContent = 'URL not valid';
    stageError.hidden = true;
    stage.appendChild(stageError);

    // On mobile: hold the stage to play, release to stop (replaces the PLAY button)
    if (isMobile) {
        stage.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startPlay();
        }, { passive: false });
        stage.addEventListener('touchend', stopPlay);
        stage.addEventListener('touchcancel', stopPlay);
    }

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
        // translate(-50%,-50%) keeps the knob centered on `top` regardless of
        // its size (different on desktop vs mobile via CSS).
        faderKnob.style.top = `${(1 - volValue) * 100}%`;
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

    // Touch support for fader volume drag
    faderKnob.addEventListener('touchstart', (e) => {
        faderDragging = true;
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
        if (!faderDragging) return;
        e.preventDefault();
        const rect = meterWrap.getBoundingClientRect();
        setFaderPos(1 - (e.touches[0].clientY - rect.top) / rect.height);
    }, { passive: false });
    document.addEventListener('touchend', () => { faderDragging = false; });

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
        // Whitelist: only real YouTube watch / shorts / youtu.be URLs are
        // accepted. Everything else — arbitrary http(s) MP4s, javascript:,
        // data:, file:… — is rejected and surfaced via stageError.
        // Reasoning: the previous implementation passed any string straight
        // into <video src>, which made it easy to accidentally try to load
        // unsupported streams (or, in some browser configurations, leak
        // local files via file:// URIs).
        const id = isYT(url) ? getYTId(url) : null;
        if (!id) {
            // Reset state but show the persistent error overlay instead of
            // the instructional placeholder.
            resetPlayer();
            stagePlaceholder.style.display = 'none';
            stageError.hidden = false;
            urlInput.style.background = '';
            return;
        }
        // Hide any previous error, keep the explainer visible — it's only
        // hidden once playback starts.
        stageError.hidden = true;
        resetPlayer();
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
    // Hold userSeeking for the entire pointer-down lifetime of a scrub drag,
    // independent of whether `input` events keep firing. Without this, slow
    // drags (or pauses mid-drag) let the 400ms cooldown expire and the YT
    // poll yanks the playhead back, making dragging feel inconsistent.
    let _scrubHeld = false;
    scrub.addEventListener('pointerdown', () => {
        _scrubHeld = true;
        userSeeking = true;
        clearTimeout(_seekClearTimer);
    });
    const _scrubRelease = () => {
        if (!_scrubHeld) return;
        _scrubHeld = false;
        // Update the cue position so the next trigger snap-back goes here.
        startScrubPos = parseFloat(scrub.value);
        markUserSeeking(600); // brief cooldown so the YT poll doesn't immediately overwrite
    };
    document.addEventListener('pointerup', _scrubRelease);
    document.addEventListener('pointercancel', _scrubRelease);
    scrub.addEventListener('mouseenter', () => setHoverInfo('Drag playhead left or right to set sample start'));
    scrub.addEventListener('mouseleave', () => setHoverInfo(''));
    // Drag up/down on timecode = per-second seek (1px = 1s, shift = 0.1s/px)
    // Implemented with pointer events + setPointerCapture so all subsequent
    // move/up events route directly to the timeLabel — immune to the
    // pad-drag handler that would otherwise capture the gesture.
    let timeDragY = null;
    let timeDragStart = null;
    let timePointerId = null;
    timeLabel.addEventListener('mouseenter', () => setHoverInfo('Drag up or down (or use arrow keys) to set sample start. Hold shift for fine, shift+alt/option for ultra-fine control.'));
    timeLabel.addEventListener('mouseleave', () => setHoverInfo(''));
    timeLabel.addEventListener('pointerdown', (e) => {
        // Stop the pad-drag handler from also reacting to this press.
        e.preventDefault();
        e.stopPropagation();
        timeDragY = e.clientY;
        timeDragStart = ytPlayer && ytReady
            ? (() => { try { return ytPlayer.getCurrentTime(); } catch(_) { return 0; } })()
            : (videoEl.duration ? videoEl.currentTime : 0);
        timeLabel.classList.add('dragging');
        // Hold userSeeking for the entire drag (cleared on pointerup below).
        userSeeking = true;
        clearTimeout(_seekClearTimer);
        // Route all subsequent move/up events on this pointer to timeLabel,
        // even if they leave the element.
        try {
            timeLabel.setPointerCapture(e.pointerId);
            timePointerId = e.pointerId;
        } catch(_) {}
    });
    timeLabel.addEventListener('pointermove', (e) => {
        if (timeDragY === null) return;
        // Read modifiers live so the user can press/release them mid-drag.
        // shift = 0.1s/px (fine), shift+alt/option = 0.01s/px (ultra-fine), default = 1s/px.
        const ultra = e.shiftKey && e.altKey;
        const rate = ultra ? 0.01 : (e.shiftKey ? 0.1 : 1);
        const delta = (timeDragY - e.clientY) * rate;
        const target = timeDragStart + delta;
        if (ytPlayer && ytReady) {
            try {
                const dur = ytPlayer.getDuration();
                if (dur > 0) ytPlayer.seekTo(Math.max(0, Math.min(dur, target)), true);
            } catch (_) {}
        } else if (videoEl.duration) {
            videoEl.currentTime = Math.max(0, Math.min(videoEl.duration, target));
            scrub.value = videoEl.currentTime / videoEl.duration;
            updateScrubTrack();
            timeLabel.textContent = `${fmt(videoEl.currentTime)} / ${fmt(videoEl.duration)}`;
        }
    });
    const endTimeDrag = (e) => {
        if (timeDragY === null) return;
        // Update cue point so trigger snap-back goes to the new position
        if (videoEl.duration) startScrubPos = videoEl.currentTime / videoEl.duration;
        else if (ytPlayer && ytReady) {
            try { const d = ytPlayer.getDuration(); if (d > 0) startScrubPos = ytPlayer.getCurrentTime() / d; } catch(_) {}
        }
        // Brief cooldown so the YT poll doesn't immediately overwrite our seek
        markUserSeeking(600);
        timeDragY = null; timeDragStart = null;
        timeLabel.classList.remove('dragging');
        if (timePointerId !== null) {
            try { timeLabel.releasePointerCapture(timePointerId); } catch(_) {}
            timePointerId = null;
        }
    };
    timeLabel.addEventListener('pointerup', endTimeDrag);
    timeLabel.addEventListener('pointercancel', endTimeDrag);
    timeLabel.addEventListener('touchstart', (e) => {
        timeDragY = e.touches[0].clientY;
        timeDragStart = ytPlayer && ytReady
            ? (() => { try { return ytPlayer.getCurrentTime(); } catch(_) { return 0; } })()
            : (videoEl.duration ? videoEl.currentTime : 0);
    }, { passive: true });
    timeLabel.addEventListener('touchmove', (e) => {
        if (timeDragY === null) return;
        // Block page scroll while scrubbing the timecode on mobile.
        if (e.cancelable) e.preventDefault();
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
    urlInput.addEventListener('input', () => {
        if (!urlInput.value.trim()) {
            urlInput.style.background = '';
            // User cleared the field — also clear any "URL not valid" overlay
            // and re-show the instructional placeholder.
            stageError.hidden = true;
            showPlaceholder();
        }
    });
    urlInput.addEventListener('mouseenter', () => setHoverInfo('Paste YouTube URL here.'));
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
        // Don't react to typed characters when the user is filling in a form
        // (mailing list, etc.) — otherwise typing letters fires the mapped key.
        if (isTypingInForm()) return;
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
                // Same precision tiers as the drag: shift = 0.1s, shift+alt/option = 0.01s.
                const ultra = e.shiftKey && e.altKey;
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
        setHoverInfo(''); // clear any lingering tooltip before the element is removed
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
        // On mobile the stage handles play — don't start a drag when touching it
        if (e.target.closest('.video-stage')) return;
        pad.style.zIndex = ++_topZ;
        dragging = true;
        const r = pad.getBoundingClientRect();
        _frT = _padContainer.getBoundingClientRect();
        dragOffX = e.touches[0].clientX - r.left; dragOffY = e.touches[0].clientY - r.top;
    }, { passive: true });
    const onTouchMovePad = (e) => {
        if (!dragging) return;
        // Block page scroll while dragging the video pad on mobile.
        if (e.cancelable) e.preventDefault();
        pad.style.left = (e.touches[0].clientX - _frT.left - dragOffX) + 'px';
        pad.style.top = (e.touches[0].clientY - _frT.top - dragOffY) + 'px';
    };
    const onTouchEndPad = () => { dragging = false; };
    document.addEventListener('touchmove', onTouchMovePad, { passive: false });
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

// Expose for the lazy loader in script.js, and flush any clicks queued
// while this file was still in flight.
window.createVideoPad = createVideoPad;
if (Array.isArray(window.__videoPadQueue)) {
    window.__videoPadQueue.splice(0).forEach(() => createVideoPad());
}
