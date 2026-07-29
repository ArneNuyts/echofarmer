/* ==========================================================================
   echofarmer — cookie consent POP-UP + Google Consent Mode v2
   Same pattern as the Jennifur MAZDA campaign banner (centered pop-up that
   fires on load), restyled to echofarmer's own style guide (Geist; #9b9183
   khaki / #dfdcd8 paper / #1b1916 ink / #4c453d + #595147 browns).

   CSP-safe: external 'self' script, no inline handlers — required because the
   site's Content-Security-Policy forbids inline <script>/onclick.

   INSTALL (3 steps — see the note I sent):
     1. Put this file in the repo root, next to index.html  ->  /consent.js
     2. In <head>, load it as the FIRST thing, ABOVE the GTM snippet:
          <script src="consent.js"></script>
        (plain script, no async/defer — defaults must set before GTM runs)
     3. Add a reopen link anywhere (e.g. the LINKS section):
          <a href="#" data-cookie-settings>Cookie settings</a>
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'ef_consent';     // stores the visitor's choice
  var POLICY_URL  = '/privacy.html';  // privacy & cookie policy

  /* --- 1. Consent Mode v2 defaults (run synchronously, before GTM) -------- */
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: 500
  });
  gtag('set', 'ads_data_redaction', true);
  gtag('set', 'url_passthrough', true);

  /* --- storage helpers --------------------------------------------------- */
  function save(choice) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(choice)); } catch (e) {}
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }

  /* --- apply a choice to Consent Mode + dataLayer ------------------------ */
  function apply(choice) {
    gtag('consent', 'update', {
      analytics_storage:  choice.analytics ? 'granted' : 'denied',
      ad_storage:         choice.marketing ? 'granted' : 'denied',
      ad_user_data:       choice.marketing ? 'granted' : 'denied',
      ad_personalization: choice.marketing ? 'granted' : 'denied'
    });
    window.dataLayer.push({
      event: 'consent_update',
      consent_analytics: !!choice.analytics,
      consent_marketing: !!choice.marketing
    });
    // Fire consent_accept so GTM can trigger consent-gated tags (e.g. Meta base
    // Pixel), for both a fresh Accept and a returning consenter on load.
    if (choice.analytics || choice.marketing) {
      window.dataLayer.push({ event: 'consent_accept' });
    }
  }

  /* --- re-apply a stored choice on load (returning visitors) ------------- */
  var stored = load();
  if (stored) { apply(stored); }

  /* --- 2/3. Pop-up UI ---------------------------------------------------- */
  function buildBanner() {
    if (document.getElementById('ef-consent')) { return; }

    if (!document.getElementById('ef-consent-style')) {
      var css = document.createElement('style');
      css.id = 'ef-consent-style';
      css.textContent =
        // full-screen dimmed backdrop, card centered
        '#ef-consent{position:fixed;inset:0;z-index:2147483647;display:flex;' +
        'align-items:center;justify-content:center;padding:20px;' +
        'background:rgba(27,25,22,.55);font-family:"Geist",system-ui,-apple-system,sans-serif}' +
        '#ef-consent *{box-sizing:border-box}' +
        '#ef-consent .ef-card{background:#dfdcd8;color:#1b1916;width:100%;max-width:460px;' +
        'border:1px solid #595147;border-radius:6px;box-shadow:0 18px 50px rgba(27,25,22,.35);' +
        'padding:26px 26px 22px;animation:ef-pop .18s ease-out}' +
        '@keyframes ef-pop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}' +
        '@media(prefers-reduced-motion:reduce){#ef-consent .ef-card{animation:none}}' +
        '#ef-consent h2{margin:0 0 8px;font-size:18px;font-weight:800;letter-spacing:-.01em}' +
        '#ef-consent p{margin:0 0 14px;font-size:13.5px;line-height:1.55;color:#3a352e}' +
        '#ef-consent a{color:#1b1916;text-decoration:none;border-bottom:1px dotted #595147;font-weight:700}' +
        '#ef-consent a:hover{color:#595147}' +
        '#ef-consent .ef-cats{display:none;margin:0 0 16px;border-top:1px solid #c3bdb2;padding-top:12px}' +
        '#ef-consent .ef-cats.ef-open{display:block}' +
        '#ef-consent .ef-cat{display:flex;align-items:flex-start;gap:9px;font-size:13px;margin:0 0 9px;line-height:1.4}' +
        '#ef-consent .ef-cat input{width:16px;height:16px;margin-top:1px;accent-color:#4c453d;flex:0 0 auto}' +
        '#ef-consent .ef-cat b{font-weight:700}' +
        '#ef-consent .ef-cat.ef-locked{opacity:.6}' +
        '#ef-consent .ef-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}' +
        '#ef-consent button{font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;' +
        'height:38px;padding:0 16px;border-radius:3px;border:1.5px solid #595147;transition:all .15s ease}' +
        '#ef-consent .ef-accept{background:#4c453d;color:#bfb8af;border-color:#4c453d;flex:1 1 auto}' +
        '#ef-consent .ef-accept:hover{background:#1b1916;border-color:#1b1916;color:#dfdcd8}' +
        '#ef-consent .ef-reject{background:transparent;color:#1b1916;flex:1 1 auto}' +
        '#ef-consent .ef-reject:hover{background:#cfcabf}' +
        '#ef-consent .ef-manage{background:transparent;border-color:transparent;color:#595147;' +
        'text-decoration:underline;padding:0 4px;flex:0 0 auto}' +
        '#ef-consent .ef-manage:hover{color:#1b1916}' +
        '@media(max-width:460px){#ef-consent .ef-manage{order:3;width:100%;height:32px}}';
      document.head.appendChild(css);
    }

    var wrap = document.createElement('div');
    wrap.id = 'ef-consent';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Cookie consent');
    wrap.innerHTML =
      '<div class="ef-card">' +
        '<h2>This website uses cookies</h2>' +
        '<p><b>Necessary cookies</b> keep this website running. <p> Only with your consent we also use ' +
        '<b>analytics</b> (to see how the site gets used) and <b>marketing cookies</b> when we run ads. ' +
        'No non-essential cookies load until you make a choice. See our <a href="' + POLICY_URL + '">Privacy &amp; Cookie Policy</a>.</p>' +
        '<div class="ef-cats" id="ef-cats">' +
          '<div class="ef-cat ef-locked"><input type="checkbox" checked disabled>' +
          '<span><b>Necessary:</b> always on. Makes the site work and remembers this choice.</span></div>' +
          '<div class="ef-cat"><input type="checkbox" id="ef-analytics" checked>' +
          '<span><b>Analytics:</b> anonymous usage stats (Google Analytics 4).</span></div>' +
          '<div class="ef-cat"><input type="checkbox" id="ef-marketing">' +
          '<span><b>Marketing:</b> ad measurement &amp; retargeting (Meta Pixel).</span></div>' +
        '</div>' +
        '<div class="ef-actions">' +
          '<button type="button" class="ef-manage" id="ef-manage">Manage</button>' +
          '<button type="button" class="ef-reject" id="ef-reject">Only necessary</button>' +
          '<button type="button" class="ef-accept" id="ef-accept">Accept</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    document.getElementById('ef-manage').addEventListener('click', function () {
      var cats = document.getElementById('ef-cats');
      cats.classList.toggle('ef-open');
      document.getElementById('ef-accept').textContent =
        cats.classList.contains('ef-open') ? 'Save choices' : 'Accept';
    });
    document.getElementById('ef-accept').addEventListener('click', function () {
      var cats = document.getElementById('ef-cats');
      if (cats.classList.contains('ef-open')) {
        commit({
          analytics: document.getElementById('ef-analytics').checked,
          marketing: document.getElementById('ef-marketing').checked
        });
      } else {
        commit({ analytics: true, marketing: true });
      }
    });
    document.getElementById('ef-reject').addEventListener('click', function () {
      commit({ analytics: false, marketing: false });
    });
  }

  function commit(choice) {
    choice.ts = Date.now();
    save(choice);
    apply(choice);
    close();
  }
  function close() {
    var el = document.getElementById('ef-consent');
    if (el) { el.parentNode.removeChild(el); }
  }

  /* --- 4. show pop-up only if no prior choice ---------------------------- */
  function init() {
    if (!load()) { buildBanner(); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* --- 5. reopen hook (window.efOpenConsent + any [data-cookie-settings]) - */
  window.efOpenConsent = function () {
    close();
    buildBanner();
    var prev = load();
    if (prev) {
      var a = document.getElementById('ef-analytics');
      var m = document.getElementById('ef-marketing');
      if (a) { a.checked = !!prev.analytics; }
      if (m) { m.checked = !!prev.marketing; }
    }
    document.getElementById('ef-cats').classList.add('ef-open');
    document.getElementById('ef-accept').textContent = 'Save choices';
  };

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-cookie-settings]');
    if (t) { e.preventDefault(); window.efOpenConsent(); }
  });
})();
