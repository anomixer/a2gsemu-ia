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
- **Cloudflare**: Pages Functions in `cf-deploy/functions/proxy/[[path]].js`
- **Features**: ZIP support, URL validation, 24-hour caching, CORS resolution

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

## Key Files

### Core Application
- `index.html` - Main application (HTML + CSS + JavaScript)
- `server.js` - Local backend proxy server
- `games.js` - Game database (130 games, 44 URLs converted to proxy format)
- `package.json` - Dependencies and scripts

### Cloudflare Deployment (`cf-deploy/`)
- `functions/proxy/[[path]].js` - Pages Functions proxy handler
- `_redirects` - Route configuration
- `wrangler.toml` - Cloudflare Pages configuration
- `worker.js` - Standalone Worker version
- `cloudflare_deploy.md` - Deployment guide
- `deploy-windows.bat` / `deploy.sh` - Automated deployment scripts
- `test-zip-files.js` - ZIP functionality testing
- `update-games-for-cloudflare.js` - Game data conversion tool

### Development Tools
- `wikipedia-desc-updater.js` - Automated description generator
- `src/game-expander.ts` - Game library expansion tool
- `generate-from-gamelist.js` - Legacy expansion script
- `expand_games_python.py` - Python expansion tool
- `Expand-Games.ps1` - PowerShell expansion tool

### Documentation
- `README.md` - Main project documentation (Chinese)
- `README_EN.md` - Main project documentation (English)
- `agent.md` - This development context document

## Technical Decisions

### Game Data Structure
```javascript
{
  name: "English Name",           // Primary display name
  nameCh: "中文名稱",             // Chinese translation
  year: 1987,                     // Release year
  developer: "Developer Name",    // Developer/Publisher
  type: "Game",                   // Category
  desc: "400-word description",   // Rich description
  descCh: "400字中文描述",        // Chinese description
  itemId: "archive_id",          // Archive.org item ID or full URL
  file: "disk1.woz",             // Primary game file
  file2: "disk2.woz",            // Secondary game file (optional)
  screenshot: "/proxy/url/...",   // Screenshot (converted to proxy format)
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
```bash
cd cf-deploy
wrangler pages deploy .. --project-name=a2gsemu-ia
# Global CDN deployment with full functionality
```

### 3. Static Hosting
- Direct file serving (limited functionality)
- No ZIP support or audio
- Automatic fallback to IA embedded mode

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