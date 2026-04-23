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

Simply open `index.html` in a web browser. For best results:
- Use a local server (e.g., Live Server extension in VS Code)
- Or open directly in Chrome/Firefox

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
