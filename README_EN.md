# <img src="favicon.ico" alt="Apple" height="24" style="vertical-align: middle; margin-right: 8px;"> Apple IIgs Online Emulator v2.0

🎮 **Experience classic Apple IIgs games and software in your browser!**

[![GitHub](https://img.shields.io/badge/GitHub-anomixer/a2gsemu--ia-green?logo=github)](https://github.com/anomixer/a2gsemu-ia)
[![Node.js](https://img.shields.io/badge/Node.js-Backend-brightgreen?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**🌍 Language / 語言**: **English** | [繁體中文](README.md)

<p align="center">
  <a href="https://www.kansasfest.org/2026/01/apple-iigs-theme/" target="_blank">
    <img src="logo/iigs-40th.png" alt="Apple IIgs 40th Anniversary" width="400">
  </a>
</p>

## ✨ Key Features

- 🎯 **130 Selected Games** - Including classic RPGs, action, puzzle games and more
- 🔊 **Full Audio Support** - Complete sound output via proxy backend (Cloudflare Pages / local server.js)
- 📱 **Responsive Design & Dual Side-Drawers** - Full mobile and desktop compatibility; redesigned dual sliding drawers supporting mouse width resizing and auto-collapse threshold for smaller desktop viewports (< 1200px)
- 🔍 **Screen Scale Toggle** - Integrated "Switch to Native 1x / Switch to Scale to Fit" button next to mute control, with memory persistence and dynamic aspect ratio scaling
- 🎮 **Mouse Lock Feature** - Click game screen to lock mouse, press ESC/F1 to restore the mouse cursor
- 🔍 **Smart Search** - Search by Chinese/English game names, descriptions, years
- 🌍 **One-Click Language Toggle** - Single button in top-right corner for instant language switching with persistent settings
- 📦 **Multi-Format Support** - Supports .woz, .2mg, .po, .dsk and other disk formats
- 🌐 **Multiple Data Sources** - Supports Archive.org, custom URLs, ZIP files
- ⚡ **Fast Loading** - 24-hour file caching for improved loading speed
- 📄 **Three Runtime Versions** - GS² accelerated, MAME full, and zero-backend simple versions

---

## 🚀 Quick Start

### Three Running Versions
This project ships with three independent runtime versions:

#### 🔊💽 v2.0 Accelerated (`main` branch / GSSquared core / Highly Recommended)
Uses the GS² (GSSquared) WebAssembly core for fast startup and disk access:
- ✅ **Adjustable emulation speed** - Hold the right mouse button to accelerate emulation; speed can also be adjusted through the GS² UI
- ✅ **Accelerated floppy access** - Compatible floppy images can use slot 7 for faster loading; incompatible games remain on slot 5
- ✅ **WOZ / PO / 2MG support** - Images are mounted directly through the browser virtual filesystem
- ✅ **Native GS² display and audio** - Smaller core and faster startup

#### 🔊 Full Version (`mame0239` branch / MAME core / Recommended)
Uses a proxy backend (this repo's `server.js` or Cloudflare Pages Functions):
- ✅ **Complete Audio Support** - Sound works perfectly
- ✅ **ZIP File Support** - Supports compressed file formats
- ✅ **24-Hour Caching** - Improved loading speed
- ✅ **CORS Resolution** - Perfect cross-origin solution
- ✅ **Scale to Fit** - Toggle between Native 1x and Scale to Fit

#### 🔇 Simple Version (`OneHtmlFile` branch)
Pure static hosting (e.g., GitHub Pages), embedding the Internet Archive emulator via iframe:
- 🔇 **Silent Mode** - Audio only available inside the IA site
- 📱 **Pure Frontend** - No backend service required
- 🌐 **Direct Embedding** - Click game to load IA emulator directly
- ⚠️ **Limited Features** - No ZIP file support, scale-to-fit, or custom audio

### Method 1: Full Functionality Mode (Recommended)
Try it online: https://a2gsemu-ia.pages.dev

```bash
# 1. Download project
git clone https://github.com/anomixer/a2gsemu-ia.git
cd a2gsemu-ia

# 2. Install dependencies
npm install

# 3. Start server
npm start

# 4. Open browser
# Visit http://localhost:3000
```

### Method 2: Simple Mode
Try it online: https://anomixer.github.io/a2gsemu-ia

**Simple Mode Features:**
- **Zero Backend Dependencies**: Pure static HTML/JS architecture, directly embedding the Internet Archive emulator via iframe.
- **UI Parity**: Features the exact same "Dual Sliding Drawers" and "Responsive Auto-collapse" design as the full version.
- **Limitations**: Due to cross-origin iframe restrictions, this version does not support scale-to-fit screen aspect ratio or custom audio configurations.

```bash
# 1. Download project (checkout simple mode branch)
git clone -b OneHtmlFile https://github.com/anomixer/a2gsemu-ia.git
cd a2gsemu-ia

# 2. Use any HTTP server
npx http-server
# or
python -m http.server 8000

# 3. Open browser and visit http://localhost:8080 (or the port shown)
```

---

## 🎮 How to Use

### Basic Operations
1. **Select Game** - Click any game from the left list
2. **View Information** - Game screenshot and details will appear in the center
3. **Start Game** - Click the screenshot to start loading the emulator
4. **Language Toggle** - Use the single button in top-right corner for instant language switching
5. **Enjoy Gaming** - Use keyboard controls, supports fullscreen mode

### Keyboard Controls
- **Arrow Keys** `↑ ↓ ← →` - Movement/Selection
- **Space Bar** `Space` - Action/Jump/Shoot
- **Enter** - Start game/Confirm
- **Esc** - Pause/Cancel/Release mouse lock
- **Number Keys** `1-9` - Number input
- **Letter Keys** `A-Z` - Letter input

### Advanced Features
- **Mouse Lock** - Click game screen to lock mouse, press `ESC/F1` to restore the mouse cursor
- **Collapsible Split Drawers** - Left and right drawers support drag-to-resize, auto-collapse on screens under 768px, and secure anchor alignment for sliding triggers
- **Persistent Screen Scaling** - Saves chosen screen mode to local storage, automatically preserving state across sessions
- **Persistent Disk Slot Selection** - Use the disk icon beside a game title to switch slot 5/slot 7; the choice is saved per game, and switching during emulation automatically restarts with the new mount
- **Fullscreen Mode** - Click `⛶ Fullscreen` button
- **MAME Settings (`mame0239` branch only)** - Press `Tab` to open the MAME menu for adjustments
- **MAME Save/Load (`mame0239` branch only)** - `Shift+F7` saves and `F7` loads; the GS² build on `main` currently has no save/restore, and uses `F7` for the CRT shader toggle
- **Language Persistence** - Language settings are automatically saved, won't change after page reload or clicking game screenshots
- **URL Sharing** - Share URLs with language parameters, recipients will see the same language interface

---

## 📚 Game Collection

### 🎯 Game Types
- **RPG** - The Bard's Tale, Dragon Wars, etc.
- **Action** - California Games, Marble Madness, etc.
- **Puzzle** - Tetris, Columns, Block Out, etc.
- **Adventure** - Beyond Zork series, Space Quest series, etc.
- **Simulation** - Pirates!, Balance of Power, etc.

### 📊 Statistics
- **Total**: 130 games and software
- **Era**: 1986-2024
- **Language**: Complete bilingual interface with one-click switching
- **Descriptions**: Each game has detailed 400-word descriptions
- **Proxy Support**: 44 full URLs converted to `/proxy/url/` format for improved loading stability

---

## 🛠️ Technical Architecture

### Frontend Technology
- **HTML5 Canvas** - Game rendering
- **Emularity** - Emulator core
- **MAME** - Apple IIgs simulation engine
- **Responsive CSS** - Adapts to various screen sizes
- **Complete i18n System** - Full bilingual support with persistent language settings
  - Single-button language toggle (🇺🇸 En ↔ 🇹🇼 中文)
  - Browser language auto-detection on first load
  - URL parameter storage for language persistence and sharing
  - Complete UI translation including tips, controls, MAME settings
  - Bilingual game information display with instant language switching

### Backend Technology (Optional)
- **Node.js + Express** - Server framework
- **Proxy Service** - Solves CORS issues, provides complete audio
- **File Caching** - 24-hour caching mechanism
- **ZIP Support** - Direct extraction from ZIP files
- **Pre-download** - Auto pre-downloads core files for faster loading

### Version and Deployment Architecture
This project provides three independent runtime versions with complementary trade-offs:

#### 🔊💽 GS² Accelerated Version (`main` branch)
- **Core loading**: GS² WebAssembly core and resources are bundled under `gs2/`
- **Disk access**: Select accelerated slot 7 or floppy slot 5 based on game compatibility

#### 🔊 Full Version (`mame0239` branch)
- **Hosted at**: Cloudflare Pages (a2gsemu-ia.pages.dev) or local `server.js`
- **Audio Support**: Complete audio, sound works normally
- **File Support**: Supports all formats including ZIP files
- **Caching Mechanism**: 24-hour file caching
- **Core Loading**: MAME core & BIOS fetched via `/proxy/mame/`, `/proxy/bios/` proxies (not bundled in the repo)

#### 🔇 Simple Version (`OneHtmlFile` branch)
- **Hosted at**: GitHub Pages (anomixer.github.io/a2gsemu-ia)
- **Audio Support**: Silent mode, audio only inside the IA site
- **File Support**: Basic formats, no ZIP file support
- **Loading Method**: Embeds the Archive.org emulator directly via iframe

### Data Sources
- **Internet Archive** - Primary game file source
- **Custom URLs** - Supports any HTTP/HTTPS source
- **ZIP Files** - Supports compressed file formats
- **Full URL ID** - Supports complete URL as game ID

---

## 📁 Project Structure

```
a2gsemu-ia/
├── 📄 Core Files
│   ├── index.html              # Main application (full functionality)
│   ├── server.js               # Node.js backend server (proxy service)
│   ├── games.js               # Game database (130 games)
│   └── package.json           # Project configuration and dependencies
│
├── 🎮 GS² Core (`main` branch)
│   ├── gs2/GSSquared.js       # Emscripten runtime and GS² launcher
│   ├── gs2/GSSquared.wasm     # GS² WebAssembly core
│   ├── gs2/GSSquared.data     # BIOS, ROMs, and preloaded resources
│   ├── gs2/resources/         # GS² virtual filesystem resources
│   └── gs2/gssquared-mark.png # GSSquared brand mark
│
├── 🎮 MAME Loader (`mame0239` branch)
│   ├── browserfs.min.js       # Browser file system (MAME/Emularity)
│   └── loader.js              # Emularity loader (MAME/Emularity)
│   (MAME core & BIOS are fetched at runtime via /proxy/ from Internet Archive, not bundled)
│
├── 💾 Hard Disk Images
│   ├── roms/GSOS601.zip       # Compressed ProDOS hard-disk image (unpacked at load)
│   └── roms/SpaceAce2.po      # Game hard-disk image for GS²
│
├── ☁️ Cloudflare Pages (repo root)
│   ├── functions/proxy/[[path]].js  # Pages Functions proxy handler
│   ├── _redirects             # Route rules
│   └── wrangler.toml          # Cloudflare Pages configuration
│
├── 🎨 Resource Files
│   ├── favicon.ico            # Website icon
│   └── logo/                  # Logo resources
│       ├── iigs-40th.png      # 40th anniversary logo
│       └── emularity_color_small.png
│
├── 📚 Documentation
│   ├── README.md              # Project documentation (Chinese)
│   ├── README_EN.md           # Project documentation (English)
│   ├── agent.md               # Development documentation
│   └── LICENSE                # MIT License
│
├── ⚙️ CI/CD
│   ├── .github/workflows/cf-deploy.yml  # GitHub Actions auto-deploy (on push to main)
│   ├── .gitignore             # Git ignore list
│   └── package-lock.json      # Dependency lock file
│
├── 📦 Auxiliary Cloudflare Scripts
│   └── cf-deploy/             # Worker version & deploy/test scripts
│       ├── worker.js          # Standalone Worker version
│       ├── wrangler-worker.toml # Worker configuration
│       ├── cloudflare_deploy.md # Deployment guide
│       ├── deploy-windows.bat / deploy.sh  # Manual deployment scripts
│       ├── test-deployment.js / test-zip-files.js  # Test scripts
│       └── update-games-for-cloudflare.js  # Game data conversion tool
│
└── 📦 Dependencies
    └── node_modules/          # Node.js dependencies (generated after npm install)
        ├── express/           # Web framework
        ├── cors/              # CORS handling
        ├── compression/       # File compression
        ├── adm-zip/           # ZIP file processing
        ├── jszip/             # ZIP file processing (frontend)
        └── node-fetch/        # HTTP requests
```

### File Descriptions

#### 🎯 Main Files
- **`index.html`** - Main application, full functionality with a proxy backend
- **`server.js`** - Node.js backend server providing `/proxy/*` proxy services and full functionality
- **`games.js`** - Game database containing complete information for 130 games
- **Simple Version (no backend)** - lives on the separate `OneHtmlFile` branch, pure static hosting

#### 🔧 Technical Files
- **`browserfs.min.js`** - Browser file system simulation
- **`loader.js`** - Emularity emulator loader
- **MAME core & BIOS** - Not bundled in the repo; fetched at runtime via `/proxy/mame/`, `/proxy/bios/` proxies

#### 📋 Configuration Files
- **`package.json`** - Project configuration, dependency management, script definitions
- **`.gitignore`** - Git version control ignore list
- **`wrangler.toml`** - Cloudflare Pages configuration (repo root)

---

## 🌐 Deployment Guide

### Local Deployment (Recommended)
```bash
# 1. Download project
git clone https://github.com/anomixer/a2gsemu-ia.git
cd a2gsemu-ia

# 2. Install dependencies
npm install

# 3. Start server
npm start

# 4. Open browser
# Visit http://localhost:3000
```

### Cloudflare Pages Deployment
This project fully supports Cloudflare Pages deployment with global CDN acceleration.

The Pages config (`wrangler.toml`, `_redirects`, `functions/`) lives at the **repository root**, so deployment runs from the root:

```bash
# Manual deploy (run from the repository root)
npm run deploy-pages
# or
wrangler pages deploy . --project-name=a2gsemu-ia
```

**Auto-deploy**: Pushing to the `main` branch triggers GitHub Actions (`.github/workflows/cf-deploy.yml`) automatically — no manual step needed.

**Cloudflare Pages Features**:
- ✅ **Global CDN** - 300+ data centers worldwide acceleration
- ✅ **Auto Scaling** - No maintenance required, automatic traffic handling
- ✅ **Full Functionality** - Supports all ZIP files and proxy features
- ✅ **HTTPS** - Secure connections enabled by default
- ✅ **Zero Cost** - Free static website hosting

For detailed deployment instructions, see `cf-deploy/cloudflare_deploy.md`

### Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Traditional Server
```bash
# Use PM2 for process management
npm install -g pm2
pm2 start server.js --name "a2gsemu-ia"
pm2 startup
pm2 save
```

---

## 🤝 Contributing Guide

Welcome to contribute new games, fix bugs, or improve features!

### Adding New Games
1. Edit `games.js` to add game data
2. Ensure game files are accessible
3. Add appropriate screenshots and descriptions
4. Test that games run properly

### Reporting Issues
- Use [GitHub Issues](https://github.com/anomixer/a2gsemu-ia/issues)
- Provide detailed error information and reproduction steps
- Include browser version and operating system information

### Submitting Pull Requests
1. Fork the project
2. Create a feature branch
3. Commit changes
4. Create Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

### Third-Party Resources
- **Game Files** - From Internet Archive, following their respective licenses
- **Emularity** - Internet Archive open-source emulator framework
- **MAME** - Multiple Arcade Machine Emulator, GPL licensed

---

## 🙏 Acknowledgments

- **Internet Archive** - Providing invaluable game preservation services
- **MAME Team** - Excellent emulator engine
- **Emularity Project** - Making browser emulation possible
- **Apple** - Creating the classic Apple IIgs computer
- **Game Developers** - Creating these timeless classics

---

## 📞 Contact Information

- **GitHub**: [anomixer/a2gsemu-ia](https://github.com/anomixer/a2gsemu-ia)
- **Issues**: [Report Issues](https://github.com/anomixer/a2gsemu-ia/issues)
- **Discussions**: [Discussion Forum](https://github.com/anomixer/a2gsemu-ia/discussions)

---

<div align="center">

**🎮 Enjoy the classic Apple IIgs gaming experience! 🎮**

Made with ❤️ by [anomixer](https://github.com/anomixer)

</div>
