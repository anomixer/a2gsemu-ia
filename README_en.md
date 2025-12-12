# <img src="favicon.ico" alt="Apple" height="24" style="vertical-align: middle; margin-right: 8px;"> Apple IIgs Emulator - Frontend Version

**[中文版](README.md) | [Chinese Version](README.md)**

An Apple IIgs game emulator web interface based on Internet Archive, bringing 80s classic games to your browser!

**🚀 Frontend Version Features: Single HTML file, no installation required, ready to use!**

**⭐ Server Version Features: Node.js proxy, completely solves CORS issues, supports full audio!**
- Reference: [README_SERVER.md](README_SERVER.md)

![Apple IIgs Logo](https://img.shields.io/badge/Apple_IIgs-1986-green?style=for-the-badge&logo=apple)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Single File](https://img.shields.io/badge/Single_File-✓-success?style=for-the-badge)
[![GitHub Pages](https://img.shields.io/badge/demo-online-success?style=for-the-badge)](https://anomixer.github.io/a2gsemu-ia/)

## 📦 Project Features

### 🎯 Single HTML File Design
- **Zero Dependencies** - No external files or databases required
- **Instant Use** - Download and open directly in browser
- **Easy Deployment** - Upload to any web server to run
- **Fully Offline** - HTML/CSS/JavaScript all embedded
- **File Size** - Only ~50KB, lightweight and fast

### 🌍 Multi-Language Support
- **Bilingual Interface** - Traditional Chinese and English versions
- **One-Click Switch** - Language toggle button in top-right corner
- **Complete Translation** - All interface text, instructions, and game info in both languages
- **Optimized Fonts** - English version uses Arial font for better readability

### 🎮 Game Collection
- **28+ Selected Software**, covering action, adventure, RPG, sports, puzzle genres
- Classic titles including Prince of Persia, Tetris, The Bard's Tale
- Special collection: Total Replay - 100 Apple IIe games compilation

### 🖥️ User Interface
- **Full Traditional Chinese Interface** - Perfect for Taiwanese players
- **Three-column layout**: Game List | Emulator Screen | Instructions
- **Draggable panels** - Adjust left/right panel widths for optimal display
- **Real-time search** - Find games quickly
- **Responsive design** - Supports desktop and tablet devices

### 🎯 Emulator Features
- **640x200 native resolution** display, authentic Apple IIgs aspect ratio
- **Fullscreen mode** for immersive gaming experience
- **MAME emulator** integration with save/load functionality
- **One-click Archive.org** full audio control panel
- **Auto state saving** to browser local storage

### 📖 Complete Documentation
- Detailed game information (year, developer, publisher, description)
- General controls (arrow keys, spacebar, enter, etc.)
- MAME emulator advanced operation guide
- CPU speed adjustment, video settings, audio settings

## 🚀 Quick Start

### Method 1: Online Use (Recommended)
Visit the GitHub Pages deployment:
https://anomixer.github.io/a2gsemu-ia/

### Method 2: Download Single HTML File
1. **Download `index_en.html`**
```
wget https://raw.githubusercontent.com/anomixer/a2gsemu-ia/main/index_en.html
```

2. **Double-click to open**

Open `index_en.html` with any modern browser!

- Windows: Double-click file, open with default browser
- macOS: Double-click file, or drag to browser
- Linux: `xdg-open index_en.html` or `firefox index_en.html`

### Method 3: Clone Full Project
```
git clone https://github.com/anomixer/a2gsemu-ia.git
cd a2gsemu-ia
```

Then open `index_en.html` in browser

### Method 4: Local Server (Optional)
For testing or development:

Python 3
```
python -m http.server 8000
```

Node.js (requires http-server)
```
npx http-server
```

PHP
```
php -S localhost:8000
```

Visit `http://localhost:8000`

## 🎮 Usage Instructions

### Basic Controls
1. Select a game from the left game list
2. Wait 10-30 seconds for loading (first load is slower)
3. Use keyboard controls:
   - **Arrow Keys**: Move/select
   - **Space**: Action/jump/shoot
   - **Enter**: Start game/confirm
   - **Esc**: Pause/cancel

### Advanced Features

#### Fullscreen Mode
Click the top-right "⛶ Fullscreen" button, click again to exit

#### Audio Control
Click "🔊 Enable Audio" to open Archive.org full control panel in new tab

#### Save/Load
- **Save**: `Shift` + `F7`
- **Load**: `F7`
- Supports 10 save slots (0-9)

#### MAME Menu
1. Press `Scroll Lock` to enter MAME UI mode
2. Press `Tab` to open menu
3. Select **Machine Configuration** to adjust:
   - CPU Speed (speed up/slow down game)
   - Video Options (screen settings)
   - Audio Options (audio settings)
   - Input Settings (key settings)

#### Panel Size Adjustment
Drag the green separator lines `⋮` on left/right sides to adjust width

## 📝 Game List

### 🎯 Action Games
- **Prince of Persia** - 1989
- **Paperboy** - 1988
- **The Immortal** - 1990
- **Rastan** - 1990
- **Crystal Quest** - 1988
- **Arkanoid** - 1987
- **Marble Madness** - 1988

### 🗺️ Adventure Games
- **Space Quest II** - 1988
- **The King of Chicago** - 1988
- **Déjà Vu** - 1987
- **Tass Times In Tonetown** - 1986
- **Shadowgate** - 1988

### ⚔️ Role Playing
- **The Bard's Tale** - 1987

### 🏃 Sports Games
- **Hardball!** - 1987
- **Winter Games** - 1987
- **California Games** - 1989
- **World Games** - 1987
- **Zany Golf** - 1988

### 🧩 Puzzle Games
- **Shanghai** - 1987
- **Battle Chess** - 1989
- **Pipe Dream** - 1990
- **Tetris** - 1988

### 🗺️ Simulation/Strategy Games
- **Defender of the Crown** - 1988
- **Destroyer** - 1987

### 🎓 Educational Software
- **Charlie Brown's ABCs** - 1990
- **Talking Stickybear Alphabet** - 1988

### ⚙️ Utilities
- **List Plus** - 1989

### ⭐ Special Collection
- **Total Replay** (100-game compilation) - 2024
- **Pitch Dark** - 2023

## 🔧 Technical Architecture

### Single File Design

- index_en.html ← Main file, contains all functionality
- README_en.md ← Documentation
- LICENSE ← License terms

**index_en.html contains:**
- HTML5 structure
- CSS3 styles (embedded `<style>`)
- JavaScript code (embedded `<script>`)
- Game database (JSON format)
- Complete usage instructions

### Frontend Technologies
- **Pure HTML5 + CSS3 + JavaScript (ES6+)**
- No frameworks or build tools required
- No Node.js, npm, webpack needed
- Compatibility: IE11+ / Edge / Chrome / Firefox / Safari

### Emulator Source
- **Internet Archive** - Game ROMs and emulator (loaded via iframe)
- **MAME** - Apple IIgs hardware emulation
- **Emularity** - Browser-based emulator framework

### Browser Support
- ✅ Chrome/Edge 90+ (recommended)
- ✅ Firefox 88+
- ✅ Safari 14+
- ⚠️ Mobile device support limited (keyboard operation constraints)

## ⚠️ Limitations & Notes

### Technical Limitations
1. **Slow initial loading** (10-30 seconds)
   - Requires downloading emulator and ROM files from Internet Archive
   - Recommended: stable internet connection

2. **Limited audio control**
   - iframe embedding restrictions, cannot directly control volume
   - Click "Enable Audio" button to operate in new tab

3. **Poor mobile experience**
   - Requires physical keyboard operation
   - Touchscreen cannot simulate all keys

4. **Save games depend on browser**
   - Clearing browser cache will lose saves
   - Saves not shared between different browsers/devices

### Copyright Notice
- All game ROMs from [Internet Archive](https://archive.org)
- For personal learning and nostalgic use only
- Commercial use must comply with original copyright holders

### Compatibility Issues
- Some games may not run properly
- Certain key combinations may be intercepted by browser
- Fullscreen mode may have limitations in some browsers

## 🤝 Contributing

Welcome PRs and Issues!

### Adding Games
Add to the `games` array in `index_en.html`:

```
{
id: 'archive_org_identifier',
name: 'Game English Name',
nameEn: 'Game English Name',
year: '1987',
type: 'game', // game, edu, tool, special
desc: 'Game description...',
developer: 'Developer',
publisher: 'Publisher'
}
```

### Finding IDs
1. Visit https://archive.org/details/softwarelibrary_apple2gs_games
2. Find the desired game
3. Click to enter, the last part of the URL is the ID
   - Example: `https://archive.org/details/wozaday_Tetris_IIgs`
   - ID is: `wozaday_Tetris_IIgs`

### Modification Suggestions
Since this is a single HTML file, when modifying:
- Keep HTML/CSS/JavaScript embedded structure
- Test to ensure all functions work normally
- Keep readability before minification (newlines and comments)

## 📚 Reference Resources

### Apple IIgs Related
- [Apple II Wikipedia](https://en.wikipedia.org/wiki/Apple_II_series)
- [Virtual Apple](https://www.virtualapple.org/) - Online Apple II emulator
- [Apple II Documentation](https://www.apple2.org/)

### Emulator Related
- [MAME Official Website](https://www.mamedev.org/)
- [Internet Archive Software Library](https://archive.org/details/softwarelibrary)
- [Emularity GitHub](https://github.com/db48x/emularity)

### Game Databases
- [MobyGames - Apple IIgs](https://www.mobygames.com/platform/apple-iigs/)
- [Apple II Games](https://www.apple2.org/games/)

## 🌟 Why Choose Single HTML File?

### Advantages
✅ **Minimal deployment** - Upload one file  
✅ **Zero configuration** - No dependencies to install  
✅ **Easy sharing** - Email, cloud drive direct sharing  
✅ **Version control** - Single file easier to track changes  
✅ **Offline use** - Download and use without internet (games need internet)  
✅ **Cross-platform** - Windows/macOS/Linux universal  

### Disadvantages
⚠️ **Larger file** - All resources embedded (but still only ~50KB)  
⚠️ **Harder to modularize** - All functions in one file  
⚠️ **Not suitable for large projects** - Good for small/medium single-page applications  

## 📄 License

This project uses **MIT License**

**Note**: Game ROMs and disks copyright belongs to original developers, this project only provides interface integration.

## 🙏 Acknowledgments

- **Internet Archive** - Providing game ROMs and emulator services
- **MAME Development Team** - Excellent multi-platform emulator
- **Emularity Project** - Making emulators run in browsers
- **Apple Computer** - Creating the Apple IIgs
- **All Game Developers** - Bringing us wonderful childhood memories

📧 Contact
GitHub Issues: Submit problems

GitHub Profile: @anomixer

⭐ If this project helps you, please give it a Star!

🎮 Enjoy the fun of retro gaming!

📦 Single HTML File - Simple, Fast, Effective!

Made with ❤️ by anomixer