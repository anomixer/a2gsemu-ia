# Agent Development Context

## Project Overview

This is an Apple IIgs online emulator project that allows users to play classic Apple IIgs games directly in their web browser. The project has evolved through multiple iterations and now serves 130 carefully curated games with rich descriptions, modern web features, and full Cloudflare Pages deployment support.

## Architecture

### Frontend
- **Main File**: `index.html` (renamed from `index_emularity_v8.html`)
- **Game Database**: `games.js` (130 games with English/Chinese names)
- **Emulator**: Uses Emularity framework with MAME Apple IIgs core
- **Features**: Mouse lock, full-screen mode, intelligent search, responsive design

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

> Note: the MAME core (`mameapple2gs.js.gz` / `mameapple2gs.wasm.gz`) and BIOS are **not stored in the repository** — they are fetched at runtime through the proxy endpoints above.

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

## Key Files

### Core Application (repository root)
- `index.html` - Main application (HTML + CSS + JavaScript)
- `server.js` - Local backend proxy server
- `games.js` - Game database (130 games)
- `package.json` - Dependencies and scripts

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