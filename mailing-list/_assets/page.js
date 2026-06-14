(function () {
    'use strict';

    // ── GoatCounter ──────────────────────────────────────────────────
    const gcEvent = (path) => {
        if (window.goatcounter && window.goatcounter.count) {
            window.goatcounter.count({ path: path });
        }
    };

    const cfg = window.RELEASE_CONFIG;
    if (!cfg) {
        console.error('[release-page] window.RELEASE_CONFIG is missing');
        return;
    }

    // ── Responsive scaling ────────────────────────────────────────────────
    const DESIGN_W = 315;
    const DESIGN_H = 667;
    const COVER_DESIGN = 250;
    const COVER_MIN    = 120; // min artwork size
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

        // ── Badge bounce region (scales with cover art) ───────────────────
        // The CSS keyframes assume a design-space Y max of 301px (tuned for
        // the 250px cover). When the cover shrinks by coverShrink pixels,
        // we rewrite the keyframes so the badge stays above the notify form.
        // All intermediate Y values are proportionally scaled from the
        // original ratios (100/301, 240/301, 280/301).
        const BADGE_Y_MAX_DESIGN = 301;
        const badgeYMax = Math.round(Math.max(50, BADGE_Y_MAX_DESIGN - coverShrink));
        const by1 = Math.round(badgeYMax * 0.332); // was 100
        const by2 = Math.round(badgeYMax * 0.797); // was 240
        const by3 = Math.round(badgeYMax * 0.930); // was 280
        let badgeStyle = document.getElementById('badge-keyframes');
        if (!badgeStyle) {
            badgeStyle = document.createElement('style');
            badgeStyle.id = 'badge-keyframes';
            document.head.appendChild(badgeStyle);
        }
        badgeStyle.textContent = `@keyframes badge-drift {
    0%     { transform: translate(  0px,      0px); }
    14.9%  { transform: translate(226px, ${by1}px); }
    28.0%  { transform: translate(140px, ${badgeYMax}px); }
    37.2%  { transform: translate(  0px, ${by2}px); }
    53.6%  { transform: translate(130px,      0px); }
    71.5%  { transform: translate(226px, ${by3}px); }
    81.5%  { transform: translate( 60px, ${badgeYMax}px); }
    100%   { transform: translate(  0px,      0px); }
}`;
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

    // ── Notify form (pre-release only) ────────────────────────────────────
    // Also hide the "Get notified..." label whenever the form is hidden.
    const notifyLabel = document.querySelector('.notify-label');
    const notifyForm  = document.querySelector('.notify-form');

    // Prevent iOS from auto-zooming on input focus. iOS zooms when the
    // input's computed font-size < 16px. We keep font-size at 13px (so all
    // elements scale proportionally) and instead temporarily lock
    // maximum-scale=1 during focus so iOS doesn't zoom, then restore it.
    const notifyInput = document.querySelector('.notify-input');
    if (notifyInput) {
        const vpMeta = document.querySelector('meta[name="viewport"]');
        if (vpMeta) {
            notifyInput.addEventListener('focus', () => {
                vpMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0';
            }, { passive: true });
            notifyInput.addEventListener('blur', () => {
                vpMeta.content = 'width=device-width, initial-scale=1.0';
            }, { passive: true });
        }
    }

    // ── Back link tracking ──────────────────────────────────────────────────
    const backLink = document.querySelector('.release-back');
    if (backLink) {
        backLink.addEventListener('click', () => gcEvent('release-back-to-main'));
    }

})();
