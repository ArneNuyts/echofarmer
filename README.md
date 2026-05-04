# Echofarmer Interactive Sampler Website

A responsive interactive website featuring free-floating GIFs that act as a sampler, with instant audio playback and drag-and-drop functionality.

## Features

- **Scaleable Background**: Uses "tiny big website.png" as a responsive background
- **Interactive GIF Sampler**: 
  - Desktop: Hover to activate GIF animation and play audio
  - Mobile: Tap to activate GIF animation and play audio
  - Both: Long press and drag to reposition GIFs
- **Low Latency**: Preloaded assets for instant playback
- **Social Links**: Scrollable section with links to social media platforms

## Setup Instructions

### 1. Add Your GIFs

Place your GIF files in the `gifs/` folder. For each GIF, you'll need:
- **Animated GIF**: e.g., `sample1.gif`
- **Static Image**: A PNG/JPG of the first frame, e.g., `sample1.png` (for the paused state)

### 2. Add Your Audio Files

Place your audio files (MP3, WAV, etc.) in the `audio/` folder:
- `sample1.mp3`
- `sample2.mp3`
- etc.

### 3. Configure the Sampler

Edit `script.js` and modify the `samplerConfig` array at the top:

```javascript
const samplerConfig = [
    {
        gif: 'gifs/your-gif.gif',           // Path to animated GIF
        staticImg: 'gifs/your-static.png',  // Path to static image
        audio: 'audio/your-audio.mp3',      // Path to audio file
        width: 150,                          // Width in pixels
        height: 150,                         // Height in pixels
        x: 20,                               // Initial X position (%)
        y: 15                                // Initial Y position (%)
    },
    // Add more samplers here...
];
```

### 4. Update Social Links

Edit `index.html` and update the links in the `.links-section` to your actual social media profiles.

### 5. Open the Website

Run the included Python proxy server (required for live Bandsintown shows feed):

```bash
python3 server.py
```

Then visit `http://localhost:8000/` in your browser.

The `server.py` script:
- Serves the static site files
- Proxies Bandsintown API requests at `/api/bandsintown` to bypass browser CORS
- Automatically fetches the latest shows from your Bandsintown artist page (id: 15583965)
- Updates whenever you reload the page (no caching)

> ⚠️ **`server.py` is a development tool only.** It binds to `127.0.0.1`, has
> no auth/rate-limiting, and disables HTTP caching. **Never deploy it to a
> public host.** Production runs as static files on GitHub Pages — the
> Bandsintown feed is fetched directly from the browser there, no proxy
> needed.

## Deployment (GitHub Pages + custom domain)

This site is designed to be served as **static files** from GitHub Pages.
No backend is required in production.

### One-time setup when linking a custom domain (e.g. via GoDaddy)

1. **DNS at GoDaddy** — point your apex domain at GitHub Pages:
   - Four `A` records on `@` → `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153`
   - One `CNAME` on `www` → `<your-github-username>.github.io`
2. **Repo settings** → *Pages* → set the custom domain to your GoDaddy
   domain. GitHub will provision a Let's Encrypt certificate (can take a
   few minutes to a few hours).
3. **Enable "Enforce HTTPS"** in the same Pages settings panel as soon as
   the certificate is issued. This redirects all `http://` traffic to
   `https://` and is critical for security.
4. **Add a `CNAME` file** to the repo root containing your domain on a
   single line (GitHub will create this automatically when you set the
   custom domain in step 2).
5. **Disable directory listings**: nothing to do — GitHub Pages doesn't
   serve directory indexes.

### Security posture in production

- **HTTPS** — enforced by GitHub Pages once "Enforce HTTPS" is on. The
  CSP also includes `upgrade-insecure-requests` as a belt-and-braces
  measure against any accidental `http://` asset URL.
- **Content-Security-Policy** — set via `<meta>` in `index.html`. Blocks
  inline scripts and `eval()`, restricts asset origins to the small set
  this site actually uses (Google Fonts, Bandsintown, YouTube IFrame
  Player). If you add a new external service, you must also add its
  origin to the relevant CSP directive or the browser will block it.
- **Clickjacking** — `frame-ancestors 'none'` in the CSP prevents any
  other site from embedding this one in an `<iframe>`.
- **Referrer leakage** — `<meta name="referrer" content="strict-origin-when-cross-origin">`
  hides the visited URL path/query from external links.
- **XSS via Bandsintown** — all artist-controlled fields are rendered via
  `textContent`/`createElement` (never `innerHTML`); event URLs are
  validated with a `^https?://` regex before use.
- **Video URL input** — only YouTube watch / shorts / `youtu.be/…` URLs
  are accepted; everything else (incl. `javascript:`, `file:`, arbitrary
  MP4) is rejected and shown as "URL not valid".

### Pre-deploy checklist

- [ ] `python3 server.py` was not pushed as part of any production
      configuration; the repo is meant to be served as raw static files.
- [ ] No secrets or `.env` files in the repo (none exist today).
- [ ] All external `<script>` / `<link>` / `connect`/`fetch` targets are
      already in the CSP whitelist in [index.html](index.html).
- [ ] GitHub Pages → Settings → Pages → "Enforce HTTPS" is **on**.
- [ ] Custom domain in GoDaddy DNS resolves and serves over HTTPS without
      a certificate warning.

## File Structure

```
/
├── index.html          # Main HTML file
├── styles.css          # Styling and layout
├── script.js           # Interactive functionality
├── tiny big website.png # Background image
├── gifs/               # Place your GIF files here
│   ├── sample1.gif
│   ├── sample1.png
│   └── ...
└── audio/              # Place your audio files here
    ├── sample1.mp3
    └── ...
```

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (some autoplay restrictions may apply)
- Mobile browsers: Full touch support

## Tips for Best Performance

1. **Optimize your GIFs**: Keep file sizes small for faster loading
2. **Use compressed audio**: MP3 files at 128-192kbps work well
3. **Preload**: The script automatically preloads all assets for instant playback
4. **Static images**: Create static images by exporting the first frame of your GIF

## Customization

- **Background**: Replace `tiny big website.png` with your own image
- **Colors**: Edit the `.links-section` styles in `styles.css`
- **Layout**: Adjust GIF positions in `samplerConfig` in `script.js`
- **Number of samplers**: Add or remove entries in `samplerConfig`

## Troubleshooting

**Audio doesn't play on mobile:**
- Some browsers require user interaction before playing audio
- The first tap should enable audio playback

**GIFs appear blurry:**
- Ensure your static images match your GIF dimensions
- Check the width/height settings in `samplerConfig`

**Dragging is too sensitive:**
- Adjust the long-press delay in `script.js` (currently 200ms)

---

Built for Echofarmer - An interactive musical experience
