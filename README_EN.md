# <img src="favicon.ico" alt="Apple" height="24" style="vertical-align: middle; margin-right: 8px;"> Apple IIgs Online Emulator

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
- 🔊 **Smart Audio Support** - Auto-detects backend service, seamless sound/silent mode switching
- 📱 **Responsive Design** - Supports desktop and mobile devices
- 🎮 **Mouse Lock Feature** - Click game screen to lock mouse, press Esc to release
- 🔍 **Smart Search** - Search by Chinese/English game names, descriptions, years
- 🌍 **One-Click Language Toggle** - Single button in top-right corner for instant language switching with persistent settings
- 📦 **Multi-Format Support** - Supports .woz, .2mg, .po, .dsk and other disk formats
- 🌐 **Multiple Data Sources** - Supports Archive.org, custom URLs, ZIP files
- ⚡ **Fast Loading** - 24-hour file caching for improved loading speed
- 🔄 **Auto Fallback** - Automatically switches to IA Loader mode when backend unavailable

---

## 🚀 Quick Start

### Smart Mode Detection
This project features intelligent detection that automatically determines the runtime environment and selects the optimal mode:

#### 🔊 Full Functionality Mode (Recommended)
When `server.js` is detected running:
- ✅ **Complete Audio Support** - Sound works perfectly
- ✅ **ZIP File Support** - Supports compressed file formats
- ✅ **Auto Pre-download** - Core files pre-loaded
- ✅ **24-Hour Caching** - Improved loading speed
- ✅ **CORS Resolution** - Perfect cross-origin solution

#### 🔇 IA Embedded Mode (Auto Fallback)
Automatically switches when detecting:
- 📁 Direct HTML file opening (`file://` protocol)
- 🌐 Generic HTTP server (like `npx http-server`)
- ❌ Backend service not running

This mode features:
- 🔇 **Silent Mode** - Uses Archive.org embedded emulator
- 📱 **Pure Frontend** - No backend service required
- 🌐 **Direct Embedding** - Click game to load IA emulator directly
- ⚠️ **Limited Features** - No ZIP file support or custom audio

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

```bash
# 1. Download project
git clone https://github.com/anomixer/a2gsemu-ia.git
cd a2gsemu-ia

# 2. Use any HTTP server
npx http-server
# or
python -m http.server 8000

# 3. Open browser
# System will auto-redirect to index_old.html (IA Embedded Mode)
```

### Method 3: Direct File Opening
Double-click the `index.html` file, system will auto-redirect to `index_old.html` using IA Embedded Mode.

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
- **Mouse Lock** - Click game screen to lock mouse, press `Esc` to release
- **Fullscreen Mode** - Click `⛶ Fullscreen` button
- **MAME Settings** - Press `Tab` to open MAME menu for adjustments
- **Save/Load** - `Shift+F7` to save, `F7` to load
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
- **Smart Detection** - Auto-detects backend service status
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

### Dual-Mode Architecture
This project uses intelligent dual-mode architecture that automatically selects the optimal mode based on runtime environment:

#### 🔊 Full Functionality Mode (`server.js`)
- **Detection Condition**: Detects `/proxy/bios/apple2gs.zip` endpoint response non-404
- **Audio Support**: Complete audio, sound works normally
- **File Support**: Supports all formats including ZIP files
- **Caching Mechanism**: 24-hour file caching
- **Pre-download**: Auto pre-downloads core files

#### 🔇 IA Embedded Mode (`index_old.html`)
- **Detection Conditions**: 
  - `file://` protocol (direct file opening)
  - HTTP server returns 404 (generic HTTP server)
  - Network errors or timeouts
- **Audio Support**: Silent mode, click "Open IA Website" for audio
- **File Support**: Basic formats, no ZIP file support
- **Loading Method**: Direct Archive.org emulator embedding

#### Smart Detection Process
```javascript
// Detection Logic
1. Check protocol → file:// ? Redirect to index_old.html
2. Test endpoint → fetch('/proxy/bios/apple2gs.zip')
3. Check response → 404 ? Redirect to index_old.html
4. Other status → Use full functionality mode
```

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
│   ├── index.html              # Main application (Smart detection + Full functionality)
│   ├── index_old.html          # IA Embedded mode (Chinese)
│   ├── index_en_old.html       # IA Embedded mode (English)
│   ├── server.js               # Node.js backend server
│   ├── games.js               # Game database (130 games)
│   └── package.json           # Project configuration and dependencies
│
├── 🎮 Emulator Core
│   ├── browserfs.min.js       # Browser file system
│   ├── loader.js              # Emularity loader
│   └── mameapple2gs.wasm.gz   # MAME Apple IIgs core
│
├── 🎨 Resource Files
│   ├── favicon.ico            # Website icon
│   └── logo/                  # Logo resources
│       └── emularity_color_small.png
│
├── 📚 Documentation
│   ├── README.md              # Project documentation (Chinese)
│   ├── README_EN.md           # Project documentation (English)
│   ├── agent.md               # Development documentation
│   └── LICENSE                # MIT License
│
├── ⚙️ Configuration Files
│   ├── .gitignore             # Git ignore list
│   ├── package-lock.json      # Dependency lock file
│   └── .vscode/               # VS Code settings
│       └── settings.json
│
├── 📦 Cloudflare Deployment
│   └── cf-deploy/             # Cloudflare Pages deployment files
│       ├── functions/         # Pages Functions (proxy service)
│       ├── _redirects         # Route redirect rules
│       ├── wrangler.toml      # Cloudflare Pages configuration
│       ├── worker.js          # Standalone Worker version
│       ├── cloudflare_deploy.md # Deployment guide
│       ├── deploy-windows.bat # Windows deployment script
│       ├── deploy.sh          # Linux/macOS deployment script
│       └── test-*.js          # Test scripts
│
└── 📦 Dependencies
    └── node_modules/          # Node.js dependencies (generated after npm install)
        ├── express/           # Web framework
        ├── cors/              # CORS handling
        ├── compression/       # File compression
        ├── adm-zip/           # ZIP file processing
        ├── node-fetch/        # HTTP requests
        └── ...               # Other dependencies
```

### File Descriptions

#### 🎯 Main Files
- **`index.html`** - Main application with smart detection, auto-selects optimal mode
- **`index_old.html`** - IA Embedded mode (Chinese), pure frontend, no backend required
- **`index_en_old.html`** - IA Embedded mode (English), pure frontend, no backend required
- **`server.js`** - Node.js backend server providing proxy services and full functionality
- **`games.js`** - Game database containing complete information for 130 games

#### 🔧 Technical Files
- **`browserfs.min.js`** - Browser file system simulation
- **`loader.js`** - Emularity emulator loader
- **`mameapple2gs.wasm.gz`** - MAME Apple IIgs emulator core

#### 📋 Configuration Files
- **`package.json`** - Project configuration, dependency management, script definitions
- **`.gitignore`** - Git version control ignore list
- **`.vscode/settings.json`** - VS Code editor settings

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
This project fully supports Cloudflare Pages deployment with global CDN acceleration:

```bash
# 1. Install Wrangler CLI
npm install -g wrangler

# 2. Login to Cloudflare (Windows users recommend using cmd)
cmd /c "wrangler login"

# 3. Deploy to Cloudflare Pages
cd cf-deploy
cmd /c "wrangler pages deploy .. --project-name=a2gsemu-ia"
```

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