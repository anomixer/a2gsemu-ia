# Agent Development Context

## Project Overview

This is an Apple IIgs online emulator project that allows users to play classic Apple IIgs games directly in their web browser. The project has evolved through multiple iterations and now serves 123 carefully curated games with rich descriptions and modern web features.

## Architecture

### Frontend
- **Main File**: `index.html` (renamed from `index_emularity_v8.html`)
- **Game Database**: `games.js` (123 games with English/Chinese names)
- **Emulator**: Uses Emularity framework with MAME Apple IIgs core
- **Features**: Mouse lock, full-screen mode, intelligent search, responsive design

### Backend
- **Server**: `server.js` (Node.js + Express)
- **Proxy Routes**: Handles CORS issues for game files, screenshots, BIOS, MAME engine
- **ZIP Support**: Direct extraction from ZIP files using `adm-zip`
- **Caching**: 24-hour file caching for performance
- **Security**: URL validation for external resources

## Development History

### Major Tasks Completed

1. **Game Library Expansion** (70 → 123 games)
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

## Key Files

### Core Application
- `index.html` - Main application (HTML + CSS + JavaScript)
- `server.js` - Backend proxy server
- `games.js` - Game database (123 games)
- `package.json` - Dependencies and scripts

### Development Tools
- `wikipedia-desc-updater.js` - Automated description generator
- `src/game-expander.ts` - Game library expansion tool
- `generate-from-gamelist.js` - Legacy expansion script
- `expand_games_python.py` - Python expansion tool
- `Expand-Games.ps1` - PowerShell expansion tool

### Documentation
- `README.md` - Main project documentation
- `README_SERVER.md` - Backend server documentation
- `WIKIPEDIA_UPDATER_GUIDE.md` - Wikipedia updater guide
- `GAME_EXPANSION_GUIDE.md` - Game expansion guide
- `EXPANSION_SUMMARY.md` - Expansion process summary

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
  itemId: "archive_id",          // Archive.org item ID
  filename: ["disk1.woz"],       // Game files
  screenshot: "screenshot.jpg"    // Screenshot filename
}
```

### URL Handling
- **Traditional**: `itemId + filename` → `https://archive.org/download/{itemId}/{filename}`
- **Full URL**: Direct URLs starting with `https://`
- **ZIP Files**: `zipUrl/filename` → `/proxy/zip/{zipUrl}/{filename}`

### Search Implementation
- Multi-field search: name, nameCh, desc, year, developer
- Case-insensitive matching
- Real-time filtering with "no results" feedback
- Focus management to prevent conflicts with emulator

### Proxy Endpoints
- `/proxy/game/:itemId/:filename` - Game files
- `/proxy/url/*` - External URLs (screenshots, etc.)
- `/proxy/zip/:zipUrl/:filename` - ZIP file extraction
- `/proxy/bios/:filename` - BIOS files
- `/proxy/mame/:filename` - MAME engine files

## Development Patterns

### Error Handling
- Graceful fallbacks for missing files
- Comprehensive logging with emoji indicators
- User-friendly error messages
- Automatic retry mechanisms

### Performance Optimization
- 24-hour caching for all proxied files
- Lazy loading of game screenshots
- Efficient search algorithms
- Minimal DOM manipulation

### Code Organization
- Separation of concerns (frontend/backend)
- Modular tool architecture
- Comprehensive test coverage
- Clear documentation standards

## Future Considerations

### Potential Enhancements
- Save state functionality
- Multiplayer support
- Additional emulator cores
- Mobile touch controls
- Game rating system
- User-contributed content

### Maintenance Tasks
- Regular game database updates
- Wikipedia description refreshes
- Archive.org link validation
- Performance monitoring
- Security updates

## Development Environment

### Required Tools
- Node.js 18+ (for backend server)
- Modern web browser (Chrome, Firefox, Safari)
- Git (for version control)
- Text editor with TypeScript support

### Testing Approach
- Manual testing for game functionality
- Automated tests for expansion tools
- Cross-browser compatibility testing
- Performance benchmarking

### Deployment Options
- Static hosting (frontend only)
- Node.js hosting (full functionality)
- Docker containerization
- CDN integration for assets

## Lessons Learned

### Technical Insights
- CORS issues require backend proxy for audio support
- ZIP file handling needs careful Content-Type management
- Focus management is critical for embedded applications
- Caching significantly improves user experience

### Process Improvements
- Automated tools reduce manual work dramatically
- Comprehensive documentation prevents confusion
- Incremental development allows for user feedback
- Version control is essential for complex refactoring

### User Experience
- Mouse lock functionality greatly improves gameplay
- Search functionality must be intuitive and fast
- Visual feedback is important for all interactions
- Mobile responsiveness requires careful consideration
- Language persistence is crucial for user experience - users expect their language choice to be remembered
- URL-based language storage enables sharing and bookmarking with preferred language
- Automatic browser language detection provides good defaults for first-time users

## Recent Updates

### Language Persistence Implementation (Latest)
**Problem**: When users clicked game screenshots to load emulator, page would refresh but lose language setting and revert to Chinese.

**Solution**: Implemented comprehensive language persistence system:
- **URL Parameter Storage**: Language setting stored as `lang` parameter in URL
- **Initialization Priority**: URL parameter → Browser language detection → Default (Chinese)
- **Language Toggle**: Updates URL parameter using `history.replaceState()` for immediate persistence
- **Screenshot Click**: Preserves current language when refreshing page to load emulator
- **Sharing Support**: URLs with language parameters maintain language for recipients

**Technical Implementation**:
```javascript
// Language initialization with URL priority
const initialUrlParams = new URLSearchParams(window.location.search);
const urlLang = initialUrlParams.get('lang');
if (urlLang === 'en' || urlLang === 'zh') {
    currentLanguage = urlLang;
} else {
    // Fallback to browser detection
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('en')) {
        currentLanguage = 'en';
    }
}

// Language toggle with URL persistence
function switchLanguage() {
    currentLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
    const url = new URL(window.location.href);
    url.searchParams.set('lang', currentLanguage);
    window.history.replaceState({}, '', url.toString());
    updateUI();
}

// Screenshot click with language preservation
gameScreenshot.addEventListener('click', async () => {
    if (!pendingStartGame) return;
    const url = new URL(window.location.href);
    url.searchParams.set('game', pendingStartGame.id);
    url.searchParams.set('lang', currentLanguage); // Preserve language
    window.location.href = url.toString();
});
```

**Result**: Complete language persistence across all user interactions, URL sharing, and page refreshes.

---

*This document serves as a comprehensive guide for future development and maintenance of the Apple IIgs emulator project.*