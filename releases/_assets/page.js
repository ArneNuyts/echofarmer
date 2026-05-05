/* ── Release landing page logic ──────────────────────────────────────────── */
/* Reads window.RELEASE_CONFIG (set inline in each release's index.html),
   renders the page, and wires up:
     • live countdown until release date
     • "Notify me" form (pre-release) → EmailOctopus per-release form
     • Streaming buttons (auto-swap from preLive → postLive on release day)
     • Share button (Web Share API with clipboard fallback)
   No build step — vanilla JS, runs as a classic script. */

(function () {
    'use strict';

    const cfg = window.RELEASE_CONFIG;
    if (!cfg) {
        console.error('[release-page] window.RELEASE_CONFIG is missing');
        return;
    }

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
        // Render in a fixed order so the layout is predictable across releases
        const order = ['spotify', 'apple', 'youtube', 'bandcamp', 'soundcloud', 'tidal'];
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
                `<span class="service-name">${live ? 'Listen on ' : 'Follow on '}${meta.label}</span>` +
                `<span class="service-arrow" aria-hidden="true">→</span>`;
            li.appendChild(a);
            serviceList.appendChild(li);
        });
    }

    // ── Notify form (pre-release only) ────────────────────────────────────
    const notifyForm = document.querySelector('.notify-form');
    if (notifyForm) {
        if (isLive()) {
            // Hide pre-release form entirely once the track is out
            notifyForm.hidden = true;
        } else if (cfg.emailoctopus && cfg.emailoctopus.action) {
            notifyForm.setAttribute('action', cfg.emailoctopus.action);
            // Form's submit handler (below) will manage everything else.
        } else {
            // No EmailOctopus form configured yet — show a friendly message
            // and disable submit so the form doesn't look broken.
            const status = notifyForm.querySelector('.notify-status');
            const submit = notifyForm.querySelector('.notify-submit');
            const input  = notifyForm.querySelector('.notify-input');
            if (status) status.textContent = 'Notification signup coming soon.';
            if (submit) submit.disabled = true;
            if (input)  input.disabled  = true;
        }

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
            // Honeypot must be empty
            if (data.get('hp')) return;

            if (submit) submit.disabled = true;
            try {
                // EmailOctopus embedded endpoint doesn't return CORS headers,
                // so a successful POST throws a TypeError. Treat any
                // resolved promise OR network-level error as success.
                await fetch(action, { method: 'POST', body: data, mode: 'no-cors' });
                if (status) {
                    status.textContent = `Thanks — you'll get an email when ${cfg.title} drops.`;
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
    const shareBtn = document.querySelector('.share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            const shareData = {
                title: `${cfg.title} — ${cfg.artist}`,
                text: isLive()
                    ? `${cfg.title} by ${cfg.artist} is out now`
                    : `${cfg.title} by ${cfg.artist} — out ${fmtDate(releaseDate)}`,
                url: window.location.href
            };
            // Native share sheet on mobile / supported desktop browsers
            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                    return;
                } catch (_) { /* user cancelled — fall through to clipboard */ }
            }
            // Fallback: copy URL to clipboard
            try {
                await navigator.clipboard.writeText(window.location.href);
                const original = shareBtn.textContent;
                shareBtn.textContent = 'Link copied';
                shareBtn.classList.add('copied');
                setTimeout(() => {
                    shareBtn.textContent = original;
                    shareBtn.classList.remove('copied');
                }, 1800);
            } catch (_) { /* clipboard blocked — silent */ }
        });
    }
})();
