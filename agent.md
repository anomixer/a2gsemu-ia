# Agent Development Context

## Project Overview

This is an Apple IIgs online emulator project that allows users to play classic Apple IIgs games directly in their web browser. The project has evolved through multiple iterations and now serves 130 carefully curated games with rich descriptions, modern web features, and full Cloudflare Pages deployment support.

## Architecture

### Frontend
- **Main File**: `index.html` (renamed from `index_emularity_v8.html`)
- **Game Database**: `games.js` (130 games with English/Chinese names)
- **Emulator core**:
  - **`main` / MAME branch**: Emularity framework with the MAME Apple IIgs core (`mameapple2gs.js.gz` / `mameapple2gs.wasm.gz`, ~66 MB).
  - **`gs2` branch (this branch)**: **GS² (GSSquared)** Apple IIgs core compiled to WebAssembly — `gs2/GSSquared.js` + `gs2/GSSquared.wasm` + `gs2/GSSquared.data` (~4.9 MB wasm + ~3 MB data, SIMD). Fast, native ProDOS/WOZ support, no BIOS mount needed (BIOS is baked into `GSSquared.data`). See the [GS² Engine](#gs2-gssquared-engine---gs2-branch) section for the full dev process.
- **Features**: Mouse lock, full-screen mode, intelligent search, responsive design, scale-to-fit toggle

### Backend Options
1. **Local Server**: `server.js` (Node.js + Express)
2. **Cloudflare Pages**: Full deployment with Pages Functions

### Proxy Architecture
- **Local**: Express routes with CORS handling
- **Cloudflare**: Pages Functions in `functions/proxy/[[path]].js` (repository root)
- **Features**: ZIP support, URL validation, 24-hour caching, CORS resolution

### Proxy Endpoints (identical in `server.js` and Pages Functions)
- `/proxy/bios/:filename` — BIOS files (proxied from `emularity-bios.ux-b.archive.org`)
- `/proxy/mame/:filename` — MAME core files (proxied from `emularity-engine.ux-b.archive.org`)
- `/proxy/url/*` — arbitrary full-URL proxy (with validation)
- `/proxy/zip/:zipUrl/:filename` — file extraction from ZIP archives
- `/proxy/game/:itemId/:filename` — Archive.org game files

> Note: on the **MAME branch** the core (`mameapple2gs.js.gz` / `mameapple2gs.wasm.gz`) and BIOS are **not stored in the repository** — they are fetched at runtime through the proxy endpoints above. On the **`gs2` branch** the core **is** stored in the repo under `gs2/` (see below), and is served locally via `express.static('.')` / Cloudflare Pages.

## GS² (GSSquared) Engine — `gs2` Branch

The `gs2` branch swaps the MAME core for the **GS²** (GSSquared) Apple IIgs core, a WebAssembly port (SDL3 + Emscripten). Rationale: MAME was slow and its UX was poor; GS² is markedly faster (~5 MB wasm vs 66 MB) and boots native ProDOS without a separate BIOS mount.

### Core files (in-repo, `gs2/`)
- `gs2/GSSquared.js` — Emscripten runtime + glue (SDL3, audio, canvas, FS)
- `gs2/GSSquared.wasm` — the core (~4.9 MB, SIMD build)
- `gs2/GSSquared.data` — preloaded data: BIOS ROMs (`/resources/roms/apple2gs/*.rom`), default system configs, etc. (~3 MB)
- `gs2/resources/` — runtime resource tree unpacked into the virtual FS
- `gs2/coi-serviceworker.js` — COI service worker (only needed when the host can't set COOP/COEP headers, e.g. GitHub Pages)

> `loader.js` and `browserfs.min.js` are MAME/Emularity-only; they are **not loaded** by `index.html` on the `gs2` branch.

### How a game launches (`index.html` → `startEmulator`)
1. **Assemble the disk list** from the `games.js` entry: `file`→slot 5 d1, `file2`→slot 5 d2, `hard1`→slot 7 d1, `hard2`→slot 7 d2. (IIgs slot 5 = 3.5" 800K `bazfast3`; slot 6 = 5.25" `disk_ii`; slot 7 = hard disk `PD_BLOCK3`.)
2. **Download all disks first** (`downloadWithRetry`, exponential backoff) — resolves each path via `buildFileUrl()`:
   - leading `/` (e.g. `/4th-and-inches.po`) → served locally from the repo root (`express.static('.')`)
   - `http(s)://` full URL → `/proxy/url/`
   - `...zip/inner` → `/proxy/zip/` or `/proxy/game/`
3. **Download and write into the Emscripten FS** in `preRun`: `FS.mkdir('/uploads')`, `FS.writeFile('/uploads/<name>', bytes)`, plus the supplied `gs2/resources/gs2/IIgs.gs2` profile copied to `/uploads/IIgs.gs2`. This profile selects `apple2gs_rom3` and declares `bazfast3` in slot 7.
4. **Launch** `gs2/GSSquared.js` with `Module.arguments = ['/uploads/IIgs.gs2', '-ds7d1=/uploads/<f>', …]`. The supplied profile keeps `bazfast3` in slot 7, so the disk mount must target slot 7 as well.

This is the "browser virtual FS" mount path — the disk bytes are fetched on the JS side and written into the core's virtual FS; no GS² modification is needed to accept a browser-sourced disk image.

### GS² hotkeys (replaces the MAME menu)
- **F1** — capture mouse (then click the canvas to lock; Esc to release)
- **F2** — display / CRT shader
- **F4** — slot / device panel
- **F6** — joystick
- **F7** — CRT shader toggle (GS²: **F7 is *not* save state** — GS² has no save/restore in this build; the old MAME F7 / Shift+F7 save-state features are gone on this branch)
- **F9** — speed control
- **Ctrl+F12** — soft reset / reboot

### WOZ → raw .po conversion (the 4th & Inches work)
Many `wozaday_*` games ship only as `.woz` (raw GCR bitstream). The 3.5" 800K drive (`bazfast3`) **refuses a WOZ**: `BazFast: refusing … not a 512-byte block image`. It only accepts a **raw 512-byte block image** (`.po`) — 160 tracks × 10 sectors × 512 B = **819 200 bytes**.

- **Tool**: `tools/woz2po.py` — decodes a WOZ2 3.5" 800K disk to a raw block image.
  - Parses WOZ2 chunks (`TMAP` track map, `TRKS` descriptors: start-block u16, block-count u16, bit-count u32).
  - Latches each track's GCR bitstream into nibbles (bit-7 latch), scans every position for the data prologue `D5 AA AD`, and decodes the following **683 6&2-encoded nibbles → 512 bytes** (bit-buffer).
  - A real data prologue is followed by 683 valid 6&2 nibbles; the tool applies a **90% valid-nibble threshold** to skip false prologue hits in the 4&4 address field.
  - Missing/undecodable sectors are zero-filled; output is always exactly 819 200 bytes.
  - Run: `python tools/woz2po.py <in.woz> <out.po>` (Windows: pass the full temp path, since Python's `/tmp` maps to a nonexistent `C:\TMP`).
- **4th & Inches** specifically: `00playable.woz` → `4th-and-inches.po` (819 200 B). Verified: byte 0 = `$14` (ProDOS boot block) → block 4 = `$0C` (catalog header); track 0 decodes 10/10 clean. ~79% of sectors decode cleanly; the rest are zero-filled.
- **Wiring**: `games.js` entry `wozaday_4th_and_Inches_IIgs` now uses `"file": "/4th-and-inches.po"` (leading slash → local) and `"screenshot": "/4th-and-inches_screenshot.png"` (a local copy, so it no longer depends on archive.org's flaky download endpoint).
- **Local screenshot**: several `wozaday_*` games reference bare `00playable_screenshot.png`, which routes through `/proxy/game/` → archive.org. When archive.org 502/503s the image breaks. Fix pattern: download the screenshot into the repo, point `screenshot` at a leading-`/` local path, and note that the screenshot loader in `index.html` has a local-path branch (`screenshot.startsWith('/')`) that serves it from the repo root — the same convention `buildFileUrl` uses for disks.

### COOP/COEP (required for SharedArrayBuffer / pthreads)
GS² is compiled with pthreads, which needs Cross-Origin Isolation. Both are set in `server.js` (applied to every response) and, for Cloudflare Pages, in the repo-root `_headers`:
```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```
Verify in the console: `typeof SharedArrayBuffer !== 'undefined'` must be `true`.

## Development History

### Major Tasks Completed

1. **Game Library Expansion** (70 → 130 games)
   - Created automated expansion tools (JavaScript, Python, PowerShell)
   - Integrated Archive.org search functionality
   - Added deduplication and quality scoring
   - Generated rich game descriptions

2. **Full URL Support Implementation**
   - Support for games with files across different Archive.org projects
   - Backend handles both `itemId + filename` and full URLs
   - Security validation for external URLs
   - Extended to screenshots and ZIP files

3. **ZIP File Support**
   - Added `/proxy/zip/:zipUrl/:filename` endpoint
   - Intelligent file matching within ZIP archives
   - Proper Content-Type headers and caching
   - Frontend detection and routing

4. **UI/UX Improvements**
   - Mouse lock functionality (click to lock, Esc to release)
   - Resolution adjustments (704x462 final)
   - Search functionality with multi-field support
   - Focus management between search and emulator

5. **Game Data Restructuring**
   - Removed " IIgs" suffixes from titles
   - Moved "The" prefix to end of titles
   - Renamed fields: `name` (English), `nameCh` (Chinese)
   - English sorting and category badges

6. **Wikipedia Description Automation**
   - Three-layer search strategy (gamelist.md links → Wikipedia API → MobyGames)
   - 400-word summaries with complete sentences
   - Batch processing with dry-run mode
   - High success rate for game descriptions

7. **Project Finalization**
   - Removed v8 branding and legacy files
   - Renamed main file to `index.html`
   - Updated server routes to serve at root path
   - Added GitHub logo to header
   - Comprehensive documentation

8. **Complete i18n Implementation**
   - Full bilingual interface (Chinese/English) with single toggle button
   - Browser language auto-detection on first load
   - Complete translation of all UI elements including usage tips, controls, MAME settings
   - Game information bilingual display (desc/descCh fields)
   - Language persistence across page reloads and screenshot clicks
   - URL parameter-based language storage for sharing and bookmarking

9. **Cloudflare Pages Deployment** (Latest Major Update)
   - **Pages Functions**: Complete proxy service implementation
   - **ZIP File Handling**: Advanced ZIP parsing with DecompressionStream
   - **Archive.org Support**: Native ZIP file access strategies
   - **URL Proxy**: 44 full URLs converted to `/proxy/url/` format
   - **Global CDN**: Worldwide acceleration and auto-scaling
   - **Zero Maintenance**: Serverless deployment with enterprise reliability

10. **Apple IIgs 40th Anniversary Branding** (March 2026 Update)
    - **Logo Integration**: Added custom 40th-anniversary logo globally.
    - **Dynamic Header**: Placed logo in `index.html` header, clickable to KansasFest.
    - **README Branding**: Added logo above "Features" section in both Chinese and English READMEs.
    - **Image Processing**: Custom circular mask processing to ensure transparency and clean rendering on GitHub.

11. **Collapsible Left & Right Drawers Layout & Robust Anchor Fix** (May 2026 Update)
    - **Layout Architecture**: Transitioned the main container to a relative-positioned flex layout supporting dual sliding drawers.
    - **Sidebar & Info Panel**: Configured CSS transitions and transforms (`transform: translateX()`, `margin-right`) to slide sidebars smoothly out of the flex container layout, expanding the main emulator area.
    - **Mobile Drawer Overlay**: Implemented fully responsive mobile overlay drawers that collapse automatically on screen width <= 768px, slide in from the screen edges, and auto-close when clicking outside.
    - **Header, Canvas & Controls RWD Consolidations**: Redesigned the header top layout and emulator controls to dynamically resize and wrap (centering action buttons and adjusting absolute element positions on screen width <= 768px) to prevent layout clashing, and scaled down the canvas dynamically to center it perfectly on mobile viewports.
    - **Small Desktop Auto-Collapse**: Implemented automatic collapsing of the right game information drawer on desktop screens with a viewport width less than 1200px to optimize center canvas space, while dynamically restoring/expanding it back when the window is resized larger than 1200px.
    - **Robust Handle Containment & Anti-Decoupling**: Resolved arrow decoupling and clipping issues by nesting the toggle buttons `#sidebarToggle` and `#infoToggle` directly within their respective drawer containers, utilizing relative styling to anchor them perfectly on borders.
    - **Clipping & Layout Fixes**: Configured the sidebars and emulator content to use `overflow: visible` and wrapped info-panel content inside a scrollable `.info-panel-content` container. Removed `transform: translateX(100%)` from desktop info-panel collapse to prevent double-translating, ensuring that toggle handles remain fully visible and responsive flush with the right screen edge.

12. **Scale Mode Toggle Switch Button (Native 1x / Scale to Fit)** (May 2026 Update)
    - **Toggle Button**: Integrated a toggler button (`id="scaleBtn"`) right next to the Mute/Sound button in the top control bar.
    - **Dual Scale Settings**:
      - **Native 1x Mode (Default)**: Keeps the emulator screen sharp, pixelated, and perfectly rendered at its target `704x462` resolution.
      - **Scale to Fit Mode**: Applies a new `.scale-fit` class utilizing `object-fit: contain;` and dynamic relative scaling (`width: 100% !important; height: 100% !important; max-width: 100%; max-height: 100%;`) to stretch the canvas to fill the remaining screen space perfectly.
    - **State Persistence**: Utilized `localStorage` to save the selected `'scaleMode'` (`'fit'` vs `'native'`) and load it automatically on subsequent page loads.
    - **Dynamic Localization**: Built in full Traditional Chinese / English bilingual labels (`"切到原生模式1x" / "切到縮放適應"` and `"Switch to Native 1x" / "Switch to Scale to Fit"`) that update immediately upon language changes.

13. **GS² (GSSquared) Engine Migration + WOZ→.po Conversion** (August 2026, `gs2` branch)
    - **Branch base**: `gs2` branches off `main` (merge-base is main's tip), and the GS² engine + `roms/` disk images were added on top of that tree.
    - **Core swap**: dropped the MAME/Emularity stack (`loader.js`, `browserfs.min.js` no longer loaded) and the 66 MB MAME core; added the GS² core under `gs2/` (`GSSquared.js`/`.wasm`/`.data`). GS² boots native ProDOS with the BIOS baked into `GSSquared.data` — no BIOS mount step.
    - **Launch rewrite** in `index.html`: `startEmulator()` assembles disks (slot 5 d1/d2, slot 7 d1/d2), downloads them, writes them into the Emscripten FS (`FS.writeFile('/uploads/…')`) plus a runtime config `iigs_800k.gs2`, then launches `gs2/GSSquared.js` with `-ds…=` mount args.
    - **COOP/COEP** headers added in `server.js` + `_headers` (Cloudflare Pages) so `SharedArrayBuffer` is available for the pthreads build.
    - **WOZ → 800K .po** for `wozaday_*` games that only ship `.woz` (the 3.5" `bazfast3` drive rejects WOZ): built `tools/woz2po.py` (GCR bit-7 latch, `D5 AA AD` prologue scan, 683 6&2 nibbles → 512 B, 90% valid-nibble threshold) and produced `4th-and-inches.po` (819 200 B) from `00playable.woz`.
    - **4th & Inches wired locally**: `games.js` entry `wozaday_4th_and_Inches_IIgs` now points at `/4th-and-inches.po` and a local `/4th-and-inches_screenshot.png` (downloaded into the repo so it no longer depends on archive.org's flaky download endpoint). The screenshot loader in `index.html` gained a local-path branch (`screenshot.startsWith('/')`) mirroring `buildFileUrl`.
    - **Status / known limits**: the disk mounts and the 6502 runs (verified via console), but full in-browser play of 4th & Inches is still being validated — see the [WOZ → raw .po conversion](#woz--raw-po-conversion-the-4th--inches-work) notes for the decode coverage (~79% of sectors clean) and the still-open display/letterbox + boot-loop investigation. GS² has **no save/restore** in this build (MAME F7 / Shift+F7 save-state are gone; F7 is now the CRT-shader toggle).
14. **GS² initial layout and hard-disk boot fixes** (August 2026, `gs2` branch)
    - **Initial canvas position**: the main container previously used `height: calc(100vh - 80px)`, while the real header height is content-dependent. That left the emulator content region with the wrong height and could make the first canvas render appear below the centred frame until the scale toggle dispatched a resize event.
    - **Layout fix**: `body` is now a column flex container and `.main-container` uses `flex: 1` with `min-height: 0`, so the available emulator height follows the actual header. Native mode keeps its definite 704px width/aspect ratio while `max-width`/`max-height` prevent overflow and preserve centering; scale-to-fit remains opt-in through `.scale-fit`.
    - **Hard-disk controller fix**: the generated `/uploads/iigs_800k.gs2` now declares `[[cards]] slot = 7, card = "pdblock3"`. Previously hard-disk files were downloaded and passed as `-ds7dN`, but no slot 7 controller existed, so a disk could appear requested without being usable for boot.
    - **Duplicate-card correction**: GS²'s Apple IIgs platform already installs the default slot 5 `bazfast3`; declaring another `bazfast3` in the generated config causes `Multiple instances of card bazfast3 are not allowed`. The runtime config now leaves slot 5 implicit.
    - **Verification**: `git diff --check`, `node --check server.js`, `node --check games.js`, and an inline-script syntax check all pass. A browser/manual boot test is still recommended for each disk format, especially the partially decoded 4th & Inches `.po` image.
15. **Use the supplied IIgs boot profile** (August 2026, `gs2` branch)
    - **Symptom**: the generated profile mounted a 3.5-inch disk as S5D1 but did not boot; the supplied `gs2/resources/gs2/IIgs.gs2` declares the ROM 3 machine and puts `bazfast3` at slot 7.
    - **Fix**: `startEmulator()` fetches that profile unchanged, writes it to `/uploads/IIgs.gs2`, and maps `file`/`file2` to S7D1/S7D2. A `preRun` readback now verifies each browser virtual FS disk's byte length and logs its first boot byte, plus verifies the stored config contains slot 7 `bazfast3`.
16. **Diagnose `not a startup disk`** (August 2026, `gs2` branch)
    - **Root cause**: a temporary test mounted `4th-and-inches.po` as S5D1 while the supplied `IIgs.gs2` profile's `bazfast3` controller is S7. The image was written to the browser virtual FS, but the active boot controller was looking at a different slot.
    - **Correction**: keep the profile and mount slot aligned at S7; the `preRun` FS readback makes missing/partial writes immediately visible in the browser console.

## Key Files

### Core Application (repository root)
- `index.html` - Main application (HTML + CSS + JavaScript)
- `server.js` - Local backend proxy server
- `games.js` - Game database (130 games)
- `package.json` - Dependencies and scripts

### GS² branch (in-repo core + disk images)
- `gs2/GSSquared.js` / `gs2/GSSquared.wasm` / `gs2/GSSquared.data` - GS² (GSSquared) WASM core + preloaded BIOS/resources
- `gs2/coi-serviceworker.js` - COI service worker (for hosts that can't set COOP/COEP)
- `_headers` - Cloudflare Pages COOP/COEP headers (required for `SharedArrayBuffer`)
- `4th-and-inches.po` - WOZ→.po decoded 800K block image for 4th & Inches (served locally)
- `4th-and-inches_screenshot.png` - local copy of the 4th & Inches screenshot (avoids archive.org flakiness)
- `roms/GSOS601.po` / `roms/SpaceAce2.po` - Space Ace 2 hard-disk images (slot 7)
- `tools/woz2po.py` - WOZ2 3.5" 800K → raw `.po` block-image converter (GCR decoder)
- `tools/debug_*.py`, `tools/dump_info.py`, `tools/woz2raw.py` - intermediate WOZ diagnostic/prototype scripts (kept for reference)

### Cloudflare Pages (repository root)
- `functions/proxy/[[path]].js` - Pages Functions proxy handler
- `_redirects` - Route configuration
- `wrangler.toml` - Cloudflare Pages configuration
- `.github/workflows/cf-deploy.yml` - GitHub Actions: auto-deploys to Pages on every push to `main`

### Auxiliary Scripts (`cf-deploy/`)
- `worker.js` + `wrangler-worker.toml` - Standalone Worker version
- `cloudflare_deploy.md` - Deployment guide
- `deploy-windows.bat` / `deploy.sh` - Manual deployment scripts
- `test-deployment.js` / `test-zip-files.js` - Deployment & ZIP testing
- `update-games-for-cloudflare.js` - Game data conversion tool

> Note: one-off development tools from earlier phases (game expander scripts, Wikipedia description updater, etc.) have been removed from the repository; their output is baked into `games.js`.

### Documentation
- `README.md` - Main project documentation (Chinese)
- `README_EN.md` - Main project documentation (English)
- `agent.md` - This development context document

## Technical Decisions

### Game Data Structure
```javascript
{
  id: "archive_id",              // Archive.org item ID or full URL
  emu: "apple2gs",              // Emulator core
  name: "English Name",          // Primary display name
  nameCh: "中文名稱",             // Chinese translation
  year: 1987,                    // Release year
  developer: "Developer Name",   // Developer
  publisher: "Publisher Name",   // Publisher
  type: "Game",                  // Category
  desc: "400-word description",  // Rich description
  descCh: "400字中文描述",        // Chinese description
  file: "disk1.woz",             // Primary game file (name, full URL, or "zip.zip/inner.po")
  file2: "disk2.woz",            // Secondary game file (optional)
  screenshot: "/proxy/url/...",  // Screenshot URL (proxy format)
}
```

### URL Handling Evolution
- **Traditional**: `itemId + filename` → `https://archive.org/download/{itemId}/{filename}`
- **Full URL**: Direct URLs starting with `https://` → `/proxy/url/{encodedUrl}`
- **ZIP Files**: `zipUrl/filename` → `/proxy/zip/{encodedZipUrl}/{filename}`
- **Proxy Conversion**: 44 full URLs converted to proxy format for stability

### Cloudflare Pages Functions Architecture
```javascript
// Route handling in functions/proxy/[[path]].js
export async function onRequest(context) {
  const [category, ...rest] = params.path;
  
  switch (category) {
    case 'bios': // BIOS files
    case 'mame': // MAME engine files  
    case 'url':  // Full URL proxy
    case 'zip':  // ZIP file extraction
    case 'game': // Game files
  }
}
```

### ZIP File Processing
- **Archive.org Strategy**: Native `${zipUrl}/${filename}` format
- **Non-Archive.org**: Direct ZIP parsing with DecompressionStream
- **Compression Support**: Deflate (method 8) and uncompressed (method 0)
- **Data Descriptor**: Handles ZIP files with size information in central directory

## Development Patterns

### Error Handling
- Graceful fallbacks for missing files
- Comprehensive logging with emoji indicators
- User-friendly error messages
- Automatic retry mechanisms
- Multi-strategy ZIP access with intelligent fallback

### Performance Optimization
- 24-hour caching for all proxied files
- Global CDN acceleration (Cloudflare)
- Lazy loading of game screenshots
- Efficient search algorithms
- Minimal DOM manipulation
- Pre-download of core files

### Code Organization
- Separation of concerns (frontend/backend/deployment)
- Modular tool architecture
- Comprehensive test coverage
- Clear documentation standards
- Environment-specific configurations

## Deployment Options

### 1. Local Development
```bash
npm install
npm start
# Serves at http://localhost:3000
```

### 2. Cloudflare Pages (Recommended)
The Cloudflare Pages config (`wrangler.toml`, `_redirects`, `functions/`) now lives at the **repository root**, so deployment runs from the root rather than `cf-deploy/`.

```bash
# From the repository root
npm run deploy-pages
# = wrangler pages deploy . --project-name=a2gsemu-ia
```

- **Auto-deploy**: `.github/workflows/cf-deploy.yml` triggers `pages deploy .` on every push to `main` (uses `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets).
- Global CDN deployment with full functionality.

### 3. Simple Mode / Static Hosting
- The full-featured app requires a proxy backend (local `server.js` or Cloudflare Pages Functions) for audio and ZIP support.
- A zero-backend **Simple Mode** build lives on the separate **`OneHtmlFile`** branch (served at https://anomixer.github.io/a2gsemu-ia), embedding the Internet Archive emulator directly via iframe.
- Simple Mode limitations: no ZIP support, no custom audio, no scale-to-fit (cross-origin iframe constraints).

## Recent Major Updates

### Cloudflare Pages Implementation (December 2024)

**Objective**: Deploy Apple IIgs emulator to Cloudflare Pages with full functionality

**Key Achievements**:

1. **Pages Functions Proxy Service**
   - Complete proxy implementation in `functions/proxy/[[path]].js`
   - Support for all file types: BIOS, MAME, games, URLs, ZIP files
   - CORS handling and security validation
   - 24-hour caching with global CDN

2. **Advanced ZIP File Handling**
   - Multi-strategy access for different ZIP sources
   - Archive.org native format support: `${zipUrl}/${filename}`
   - DecompressionStream for Deflate compression
   - Data Descriptor ZIP format support
   - Intelligent fallback mechanisms

3. **Game Data Conversion**
   - 44 full URLs converted to `/proxy/url/` format
   - Maintained ZIP file paths for local compatibility
   - Automated conversion with `update-games-for-cloudflare.js`
   - Preserved all game functionality

4. **Deployment Infrastructure**
   - Automated deployment scripts for Windows/Linux/macOS
   - Comprehensive testing suite
   - Configuration management with `wrangler.toml`
   - Route handling with `_redirects`

5. **Problem Resolution**
   - **Lode Runner ZIP Issue**: Fixed Data Descriptor format handling
   - **URL Encoding**: Proper filename decoding in Pages Functions  
   - **Direct Access Optimization**: Skip invalid strategies for non-Archive.org
   - **DecompressionStream**: Improved async handling and error management

**Technical Highlights**:

```javascript
// ZIP file processing with multiple strategies
if (zipUrl.includes('archive.org')) {
    // Strategy 1: Archive.org native format
    const directUrl1 = `${zipUrl}/${filename}`;
    
    // Strategy 2-4: Various fallback methods
    // ...
} else {
    // Non-Archive.org: Direct ZIP parsing
    console.log('Skipping direct access, using ZIP extraction');
}

// Data Descriptor support
const actualCompressedSize = compressedSize || view.getUint32(offset + 20, true);
const actualUncompressedSize = uncompressedSize || view.getUint32(offset + 24, true);
```

**Results**:
- ✅ 100% ZIP file compatibility (Lode Runner, Hover Blade, etc.)
- ✅ Global CDN acceleration
- ✅ Zero maintenance serverless deployment
- ✅ Complete feature parity with local deployment
- ✅ Enterprise-grade reliability and performance

### Language Persistence Implementation (Previous Update)
**Problem**: When users clicked game screenshots to load emulator, page would refresh but lose language setting and revert to Chinese.

**Solution**: Implemented comprehensive language persistence system:
- **URL Parameter Storage**: Language setting stored as `lang` parameter in URL
- **Initialization Priority**: URL parameter → Browser language detection → Default (Chinese)
- **Language Toggle**: Updates URL parameter using `history.replaceState()` for immediate persistence
- **Screenshot Click**: Preserves current language when refreshing page to load emulator
- **Sharing Support**: URLs with language parameters maintain language for recipients

## Future Considerations

### Potential Enhancements
- Save state functionality
- Multiplayer support
- Additional emulator cores
- Mobile touch controls
- Game rating system
- User-contributed content
- Progressive Web App (PWA) features

### Maintenance Tasks
- Regular game database updates
- Wikipedia description refreshes
- Archive.org link validation
- Performance monitoring
- Security updates
- Cloudflare configuration optimization

## Development Environment

### Required Tools
- Node.js 18+ (for local development)
- Wrangler CLI (for Cloudflare deployment)
- Modern web browser (Chrome, Firefox, Safari)
- Git (for version control)
- Text editor with JavaScript/TypeScript support

### Testing Approach
- Manual testing for game functionality
- Automated ZIP file testing (`test-zip-files.js`)
- Cross-browser compatibility testing
- Performance benchmarking
- Cloudflare Pages deployment testing

## Lessons Learned

### Technical Insights
- CORS issues require backend proxy for audio support
- ZIP file handling needs careful Content-Type management and multiple strategies
- Focus management is critical for embedded applications
- Caching significantly improves user experience
- Cloudflare Pages Functions provide excellent serverless proxy capabilities
- DecompressionStream requires careful async handling
- Archive.org has unique ZIP file access patterns
- **GS² / `bazfast3`** only accepts a **raw 512-byte block image** (`.po`, exactly 819 200 B for 3.5" 800K); it rejects a `.woz` bitstream outright (`BazFast: refusing … not a 512-byte block image`) — convert with `tools/woz2po.py` first
- **GS² needs Cross-Origin Isolation** (COOP/COEP) for `SharedArrayBuffer` (pthreads); without it the core won't run — set in `server.js` and `_headers`
- **The "browser virtual FS" already exists** — `index.html` fetches the disk and `FS.writeFile`s it into `/uploads/`, then mounts with `-ds…=`; you do **not** need to modify GS² to accept a browser-sourced image, only to supply the right *format* (`.po`, not `.woz`)
- **Canvas sizing for GS²**: the canvas must keep the IIgs `1288:928` (≈1.39) landscape ratio; forcing `width:100%` *and* `height:100%` in a tall wrapper makes GS² letterbox into a tiny band (and a missing definite width collapses it to `1x1` → black screen). Keep a definite width and derive height from the aspect ratio.
- **archive.org download endpoints are flaky** (intermittent 502/503): for critical assets (disks, screenshots) prefer a **local copy** in the repo served by `express.static('.')`, referenced by a leading-`/` path, rather than a bare filename routed through `/proxy/game/`
- **Windows + Python**: `/tmp` maps to a nonexistent `C:\TMP`; pass the real temp path (`%LOCALAPPDATA%\Temp`) when running `tools/woz2po.py`
- **A stuck 6502 in a tiny PC loop** (e.g. `$6A5F–$6A67` repeating across millions of cycles) means the boot monitor is idling, not a healthy GS/OS desktop — a mount can succeed while the OS still fails to boot if needed sectors are missing

### Process Improvements
- Automated tools reduce manual work dramatically
- Comprehensive documentation prevents confusion
- Incremental development allows for user feedback
- Version control is essential for complex refactoring
- Testing infrastructure is crucial for deployment confidence
- Multi-environment support increases accessibility

### User Experience
- Mouse lock functionality greatly improves gameplay
- Search functionality must be intuitive and fast
- Visual feedback is important for all interactions
- Mobile responsiveness requires careful consideration
- Language persistence is crucial for user experience
- Global CDN significantly improves loading times
- Serverless deployment provides better reliability

---

*This document serves as a comprehensive guide for future development and maintenance of the Apple IIgs emulator project, including both local and Cloudflare Pages deployment scenarios.*
