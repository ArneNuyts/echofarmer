/* ── Release landing page logic ──────────────────────────────────────────── */
/* Reads window.RELEASE_CONFIG (set inline in each release's index.html),
   renders the page, and wires up:
     • live countdown until release date
     • "OUT DD/MM!" floating badge (auto-hidden post-release)
     • "Notify me" form (pre-release) → EmailOctopus per-release form
     • Streaming buttons (auto-swap from preLive → postLive on release day)
   No build step — vanilla JS, runs as a classic script. */

(function () {
    'use strict';

    const cfg = window.RELEASE_CONFIG;
    if (!cfg) {
        console.error('[release-page] window.RELEASE_CONFIG is missing');
        return;
    }

    // ── Responsive scaling ────────────────────────────────────────────────
    // Two-stage fit:
    //   1. If the viewport is shorter than the design height (667px), shrink
    //      the cover art to free up vertical space so the rest of the layout
    //      (form + 5 service buttons) keeps its design size.
    //   2. After that, if the layout still doesn't fit (very small phones),
    //      scale the entire card uniformly so nothing gets cropped.
    // The card's width stays at the design 315px (uniformly scaled by sx).
    const DESIGN_W = 315;
    const DESIGN_H = 667;
    const COVER_DESIGN = 250;
    const COVER_MIN    = 120; // don't let the artwork get smaller than this
    const fitCard = () => {
        const card = document.querySelector('.release-card');
        if (!card) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // Step 1: free up vertical space by shrinking the cover (max design
        // size 250 → as low as COVER_MIN). The amount we save is added back
        // to the design height we need to fit.
        const verticalDeficit = Math.max(0, DESIGN_H - vh);
        const coverShrink = Math.min(COVER_DESIGN - COVER_MIN, verticalDeficit);
        const coverSize = COVER_DESIGN - coverShrink;
        const effectiveDesignH = DESIGN_H - coverShrink;
        card.style.setProperty('--cover-size', coverSize + 'px');
        // Step 2: uniform scale to fit what's left of the design box.
        const sx = Math.min(1, (vw - 2) / DESIGN_W);
        const sy = Math.min(1, vh / effectiveDesignH);
        const scale = Math.min(sx, sy);
        card.style.setProperty('--scale', scale.toFixed(4));
        // True when height was the limiting factor (card visually touches
        // the top + bottom of the viewport — drop top/bottom borders).
        const fillsHeight = vh <= effectiveDesignH * scale + 1;
        card.classList.toggle('fills-height', fillsHeight);
        // Also adjust the card's effective height so it matches the shrunk
        // layout (otherwise the bottom would have empty padding).
        card.style.setProperty('--card-height', effectiveDesignH + 'px');
    };
    fitCard();
    window.addEventListener('resize', fitCard);
    window.addEventListener('orientationchange', fitCard);

    // ── Static text fields ────────────────────────────────────────────────
    const setText = (sel, txt) => {
        const el = document.querySelector(sel);
        if (el) el.textContent = txt;
    };
    setText('.release-artist', cfg.artist || '');
    setText('.release-title',  cfg.title  || '');
    document.title = `${cfg.title} — ${cfg.artist}`;

    const coverImg = document.querySelector('.release-cover img');
    if (coverImg && cfg.cover) {
        coverImg.src = cfg.cover;
        coverImg.alt = `${cfg.title} cover art`;
    }

    // ── Release-date logic ────────────────────────────────────────────────
    // Treat dates as ISO 8601. If no time is given, assume midnight in the
    // user's local timezone (consistent with how listeners experience the
    // drop on streaming services).
    const releaseDate = cfg.releaseDate ? new Date(cfg.releaseDate) : null;
    const now = () => new Date();
    const isLive = () => releaseDate && now() >= releaseDate;

    // Format DD/MM/YY for the pre-release date label
    const fmtDate = (d) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${dd}/${mm}/${yy}`;
    };
    // Short DD/MM for the floating badge ("OUT 15/05!")
    const fmtDateShort = (d) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}`;
    };

    // Floating "OUT DD/MM!" badge — visible only pre-release
    const badgeEl = document.querySelector('.release-badge');
    if (badgeEl && releaseDate) {
        if (isLive()) {
            badgeEl.hidden = true;
        } else {
            badgeEl.textContent = `OUT ${fmtDateShort(releaseDate)}!`;
            // Randomize starting position by offsetting the animation start
            // somewhere along its 36-second loop. Negative animation-delay
            // jumps the badge "ahead" in the keyframe path while keeping
            // motion continuous from frame 1.
            badgeEl.style.animationDelay = `-${(Math.random() * 36).toFixed(2)}s`;
        }
    }

    const dateLabel = document.querySelector('.release-date');
    if (dateLabel && releaseDate) {
        if (isLive()) {
            dateLabel.textContent = 'Out now';
            dateLabel.classList.add('live');
        } else {
            dateLabel.textContent = `Out ${fmtDate(releaseDate)}`;
        }
    }

    // ── Countdown ─────────────────────────────────────────────────────────
    const countdownEl = document.querySelector('.release-countdown');
    const outNowEl    = document.querySelector('.release-out-now');
    const cdNums = countdownEl ? countdownEl.querySelectorAll('.cd-num') : [];

    const tick = () => {
        if (!releaseDate) return;
        if (isLive()) {
            if (countdownEl) countdownEl.hidden = true;
            if (outNowEl)    outNowEl.hidden    = false;
            return;
        }
        const ms = releaseDate - now();
        const s = Math.floor(ms / 1000);
        const days  = Math.floor(s / 86400);
        const hours = Math.floor((s % 86400) / 3600);
        const mins  = Math.floor((s % 3600) / 60);
        const secs  = s % 60;
        if (cdNums.length === 4) {
            cdNums[0].textContent = String(days);
            cdNums[1].textContent = String(hours).padStart(2, '0');
            cdNums[2].textContent = String(mins).padStart(2, '0');
            cdNums[3].textContent = String(secs).padStart(2, '0');
        }
    };
    if (releaseDate && !isLive()) {
        tick();
        setInterval(tick, 1000);
    } else if (releaseDate && isLive()) {
        if (countdownEl) countdownEl.hidden = true;
        if (outNowEl)    outNowEl.hidden    = false;
    }

    // ── Streaming service buttons ─────────────────────────────────────────
    // Service catalog: maps service key → { label, iconPath }.
    // Icons are relative to the release page (we step out two folders to
    // reach the shared icons/ directory).
    const SERVICES = {
        spotify:    { label: 'Spotify',     icon: '../../icons/SVG-STATES/NORMAL/spotify.svg' },
        apple:      { label: 'Apple Music', icon: '../../icons/SVG-STATES/NORMAL/apple-music.svg' },
        youtube:    { label: 'YouTube',     icon: '../../icons/SVG-STATES/NORMAL/youtube.svg' },
        bandcamp:   { label: 'Bandcamp',    icon: '../../icons/SVG-STATES/NORMAL/bandcamp.svg' },
        soundcloud: { label: 'SoundCloud',  icon: '../../icons/SVG-STATES/NORMAL/soundcloud.svg' },
        tidal:      { label: 'Tidal',       icon: '../../icons/SVG-STATES/NORMAL/tidal.svg' }
    };

    const serviceList = document.querySelector('.service-list');
    if (serviceList && cfg.links) {
        // DOM order top→bottom: bandcamp, tidal, apple, spotify, soundcloud
        // (per design — soundcloud sits at the bottom of the card).
        const order = ['bandcamp', 'tidal', 'apple', 'spotify', 'soundcloud'];
        const live = isLive();
        order.forEach((key) => {
            const meta = SERVICES[key];
            const link = cfg.links[key];
            if (!meta || !link) return;
            // Pick the URL based on release-state. Skip the service entirely
            // if neither URL is set (avoids dead buttons).
            const href = live ? (link.postLive || link.preLive) : (link.preLive || link.postLive);
            if (!href) return;
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.className = 'service-link';
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.innerHTML =
                `<img class="service-icon" src="${meta.icon}" alt="" aria-hidden="true">` +
                `<span class="service-name">${meta.label}</span>` +
                `<span class="service-action">${live ? 'listen' : 'follow'}</span>`;
            li.appendChild(a);
            serviceList.appendChild(li);
        });
    }

    // ── Notify form (pre-release only) ────────────────────────────────────
    // Also hide the "Get notified..." label whenever the form is hidden.
    const notifyLabel = document.querySelector('.notify-label');
    const notifyForm  = document.querySelector('.notify-form');
    if (notifyForm) {
        if (isLive()) {
            // Hide pre-release form (and its label) once the track is out
            notifyForm.hidden = true;
            if (notifyLabel) notifyLabel.hidden = true;
        } else if (cfg.emailoctopus && cfg.emailoctopus.action) {
            notifyForm.setAttribute('action', cfg.emailoctopus.action);
            // Submit handler (below) takes it from here.
        }
        // If no action is set yet, the form stays visible but submit will
        // no-op (handler returns early). No on-screen "coming soon" text.


        // Custom validation tooltip (form is novalidate to suppress browser bubble)
        let _tooltip = null;
        const showTooltip = (input, msg) => {
            if (_tooltip) { _tooltip.remove(); _tooltip = null; }
            _tooltip = document.createElement('div');
            _tooltip.className = 'notify-tooltip';
            _tooltip.textContent = msg;
            input.parentElement.appendChild(_tooltip);
            input.addEventListener('input', () => {
                if (_tooltip) { _tooltip.remove(); _tooltip = null; }
            }, { once: true });
        };

        notifyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const action = notifyForm.getAttribute('action') || '';
            if (!action) return;

            const status = notifyForm.querySelector('.notify-status');
            const submit = notifyForm.querySelector('.notify-submit');
            const input  = notifyForm.querySelector('.notify-input');
            if (status) { status.textContent = ''; status.className = 'notify-status'; }

            // Validate
            if (input && !input.validity.valid) {
                showTooltip(input,
                    input.validity.valueMissing
                        ? 'Please fill in your email address.'
                        : 'Please enter a valid email address.');
                return;
            }

            const data = new FormData(notifyForm);
            // Honeypot must be empty (EmailOctopus uses this exact field name)
            if (data.get('hpc4b27b6e-eb38-11e9-be00-06b4694bee2a')) return;

            if (submit) submit.disabled = true;
            try {
                // EmailOctopus embedded endpoint doesn't return CORS headers,
                // so a successful POST throws a TypeError. Treat any
                // resolved promise OR network-level error as success.
                await fetch(action, { method: 'POST', body: data, mode: 'no-cors' });
                if (status) {
                    // Title-case the configured title and keep it on one line
                    // (no awkward mid-title line break in the message).
                    const titleCased = (cfg.title || '').replace(/\b\w/g, c => c.toUpperCase());
                    status.innerHTML = `Thanks! You\u2019ll get an email when <span class="nowrap">${titleCased}</span> drops!`;
                    status.classList.add('success');
                }
                notifyForm.reset();
            } catch (_) {
                if (status) {
                    status.textContent = 'Something went wrong. Please try again.';
                    status.classList.add('error');
                }
            } finally {
                if (submit) submit.disabled = false;
            }
        });
    }

    // ── Share button ──────────────────────────────────────────────────────
    // Fixed top-right floating badge. Click copies the page URL and the
    // label flips to "Link copied" for ~2s.
    const shareBtn = document.querySelector('.release-share');
    if (shareBtn) {
        const line1 = shareBtn.querySelector('.share-line1');
        const line2 = shareBtn.querySelector('.share-line2');
        const orig1 = line1 ? line1.textContent : 'Share';
        const orig2 = line2 ? line2.textContent : 'page';
        let revertTimer = null;
        const showCopied = () => {
            if (line1) line1.textContent = 'Link';
            if (line2) line2.textContent = 'copied';
            shareBtn.classList.add('copied');
            clearTimeout(revertTimer);
            revertTimer = setTimeout(() => {
                if (line1) line1.textContent = orig1;
                if (line2) line2.textContent = orig2;
                shareBtn.classList.remove('copied');
            }, 2000);
        };
        shareBtn.addEventListener('click', async () => {
            const url = window.location.href;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(url);
                } else {
                    // Fallback for older browsers / non-secure contexts.
                    const ta = document.createElement('textarea');
                    ta.value = url;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                showCopied();
            } catch (_) {
                // Even if clipboard write throws, give the user feedback.
                showCopied();
            }
        });
    }

})();
