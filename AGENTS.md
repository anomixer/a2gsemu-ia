# Agent Development Context

## Project Overview

This is an Apple IIgs online emulator project that allows users to play classic Apple IIgs games directly in their web browser. The project has evolved through multiple iterations and now serves 181 carefully curated games with rich descriptions, modern web features, and full Cloudflare Pages deployment support.

## Architecture

### Frontend
- **Main File**: `index.html` (renamed from `index_emularity_v8.html`)
- **Game Database**: `games.js` (181 games with English/Chinese names)
- **Emulator core**:
  - **`mame0239` branch**: Emularity framework with the MAME Apple IIgs core (`mameapple2gs.js.gz` / `mameapple2gs.wasm.gz`, ~66 MB).
  - **`main` branch (this branch)**: **GS² (GSSquared)** Apple IIgs core compiled to WebAssembly — `gs2/GSSquared.js` + `gs2/GSSquared.wasm` + `gs2/GSSquared.data` (~4.9 MB wasm + ~3 MB data, SIMD). Fast, native ProDOS/WOZ support, no BIOS mount needed (BIOS is baked into `GSSquared.data`). See the [GS² Engine](#gs2-gssquared-engine---main-branch) section for the full dev process.
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

> Note: on the **`mame0239` branch** the core (`mameapple2gs.js.gz` / `mameapple2gs.wasm.gz`) and BIOS are **not stored in the repository** — they are fetched at runtime through the proxy endpoints above. On the **`main` branch** the GS² core **is** stored in the repo under `gs2/` (see below), and is served locally via `express.static('.')` / Cloudflare Pages.

## GS² (GSSquared) Engine — `main` Branch

The `main` branch uses the **GS²** (GSSquared) Apple IIgs core, a WebAssembly port (SDL3 + Emscripten). The MAME baseline is preserved in `mame0239`; GS² is markedly faster (~5 MB wasm vs 66 MB) and boots native ProDOS without a separate BIOS mount.

### Core files (in-repo, `gs2/`)
- `gs2/GSSquared.js` — Emscripten runtime + glue (SDL3, audio, canvas, FS)
- `gs2/GSSquared.wasm` — the core (~4.9 MB, SIMD build)
- `gs2/GSSquared.data` — preloaded data: BIOS ROMs (`/resources/roms/apple2gs/*.rom`), default system configs, etc. (~3 MB)
- `gs2/resources/` — runtime resource tree unpacked into the virtual FS
- `gs2/coi-serviceworker.js` — COI service worker (only needed when the host can't set COOP/COEP headers, e.g. GitHub Pages)

> `loader.js` and `browserfs.min.js` are MAME/Emularity-only; they are **not loaded** by `index.html` on the `main` branch.

### How a game launches (`index.html` → `startEmulator`)
1. **Assemble the disk list** from the `games.js` entry: `file`→slot 5 d1, `file2`→slot 5 d2, `hard1`→slot 7 d1, `hard2`→slot 7 d2. (ROM 3 slot 5 = normal 3.5" 800K floppy; slot 6 = 141K floppy; slot 7 = optional fast `bazfast3` SmartPort/HDD.)
2. **Download all disks first** (`downloadWithRetry`, exponential backoff) — resolves each path via `buildFileUrl()`:
  - leading `/` → served locally from the repo root (`express.static('.')`); bare game assets such as `00playable.woz` use the Archive.org game proxy
   - `http(s)://` full URL → `/proxy/url/`
   - `...zip/inner` → `/proxy/zip/` or `/proxy/game/`
3. **Download and write into the Emscripten FS** in `preRun`: `FS.mkdir('/uploads')`, `FS.writeFile('/uploads/<name>', bytes)`, plus the supplied `gs2/resources/gs2/IIgs.gs2` profile copied to `/uploads/IIgs.gs2`. This profile selects `apple2gs_rom3` and declares `bazfast3` in slot 7.
4. **Launch** `gs2/GSSquared.js` with `Module.arguments = ['/uploads/IIgs.gs2', '-ds5d1=/uploads/<f>', …]`. ROM 3's normal 800K floppy is slot 5; slot 7 `bazfast3` is reserved for fast SmartPort/HDD use.

This is the "browser virtual FS" mount path — the disk bytes are fetched on the JS side and written into the core's virtual FS; no GS² modification is needed to accept a browser-sourced disk image.

### GS² hotkeys (replaces the MAME menu)
- **F1** — capture mouse (then click the canvas to lock; Esc to release)
- **F2** — display / CRT shader
- **F4** — slot / device panel
- **F6** — joystick
- **F7** — CRT shader toggle (GS²: **F7 is *not* save state** — GS² has no save/restore in this build; the old MAME F7 / Shift+F7 save-state features are gone on this branch)
- **F9** — speed control
- **Ctrl+F12** — soft reset / reboot

### WOZ disk support (the 4th & Inches work)
GS²'s `bazfast3` supports `.woz` directly. When the original WOZ is available, use it unchanged; do not perform a WOZ→`.po` conversion for the browser build.

- **Tool**: `tools/woz2po.py` — decodes a WOZ2 3.5" 800K disk to a raw block image.
  - Parses WOZ2 chunks (`TMAP` track map, `TRKS` descriptors: start-block u16, block-count u16, bit-count u32).
  - Latches each track's GCR bitstream into nibbles (bit-7 latch), scans every position for the data prologue `D5 AA AD`, and decodes the following **683 6&2-encoded nibbles → 512 bytes** (bit-buffer).
  - A real data prologue is followed by 683 valid 6&2 nibbles; the tool applies a **90% valid-nibble threshold** to skip false prologue hits in the 4&4 address field.
  - Missing/undecodable sectors are zero-filled; output is always exactly 819 200 bytes.
  - Run: `python tools/woz2po.py <in.woz> <out.po>` (Windows: pass the full temp path, since Python's `/tmp` maps to a nonexistent `C:\TMP`).
- **4th & Inches** uses the original `"file": "00playable.woz"` entry from `origin/v0.284`; it is fetched through the proxy and mounted unchanged.
- The previous `4th-and-inches.po` experiment was a bad conversion and has been removed from the repository.
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

1. **Game Library Expansion** (70 → 160 games)
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

13. **GS² (GSSquared) Engine Migration + direct WOZ mounting** (August 2026, formerly `gs2`, now `main`)
    - **Branch base**: `gs2` branches off `main` (merge-base is main's tip), and the GS² engine + `roms/` disk images were added on top of that tree.
    - **Core swap**: dropped the MAME/Emularity stack (`loader.js`, `browserfs.min.js` no longer loaded) and the 66 MB MAME core; added the GS² core under `gs2/` (`GSSquared.js`/`.wasm`/`.data`). GS² boots native ProDOS with the BIOS baked into `GSSquared.data` — no BIOS mount step.
    - **Launch rewrite** in `index.html`: `startEmulator()` assembles disks (ordinary files on slot 5 d1/d2, hard disks on slot 7 d1/d2), downloads them, writes them into the Emscripten FS (`FS.writeFile('/uploads/…')`) plus the supplied `IIgs.gs2` config, then launches `gs2/GSSquared.js` with `-ds…=` mount args.
    - **COOP/COEP** headers added in `server.js` + `_headers` (Cloudflare Pages) so `SharedArrayBuffer` is available for the pthreads build.
    - **Direct WOZ mount**: GS² accepts `.woz` directly. The browser downloads `00playable.woz`, writes the exact bytes into `/uploads/`, and passes that path to the S5D1 mount argument. No runtime conversion is needed.
    - **4th & Inches wiring**: `games.js` uses the original `00playable.woz` and the bare `00playable_screenshot.png`, both fetched through the Archive.org game proxy; no local copy is stored.
    - **Status / known limits**: the disk mounts and the 6502 runs (verified via console), while full in-browser play is still being validated. GS² has **no save/restore** in this build (MAME F7 / Shift+F7 save-state are gone; F7 is now the CRT-shader toggle).
14. **GS² initial layout and hard-disk boot fixes** (August 2026, formerly `gs2`, now `main`)
    - **Initial canvas position**: the main container previously used `height: calc(100vh - 80px)`, while the real header height is content-dependent. That left the emulator content region with the wrong height and could make the first canvas render appear below the centred frame until the scale toggle dispatched a resize event.
    - **Layout fix**: `body` is now a column flex container and `.main-container` uses `flex: 1` with `min-height: 0`, so the available emulator height follows the actual header. Native mode keeps its definite 704px width/aspect ratio while `max-width`/`max-height` prevent overflow and preserve centering; scale-to-fit remains opt-in through `.scale-fit`.
    - **Hard-disk controller fix**: the generated `/uploads/iigs_800k.gs2` now declares `[[cards]] slot = 7, card = "pdblock3"`. Previously hard-disk files were downloaded and passed as `-ds7dN`, but no slot 7 controller existed, so a disk could appear requested without being usable for boot.
    - **Duplicate-card correction**: GS²'s Apple IIgs platform already installs the default slot 5 `bazfast3`; declaring another `bazfast3` in the generated config causes `Multiple instances of card bazfast3 are not allowed`. The runtime config now leaves slot 5 implicit.
    - **Verification**: `git diff --check`, `node --check server.js`, `node --check games.js`, and an inline-script syntax check all pass. A browser/manual boot test is still recommended for each disk format, especially the partially decoded 4th & Inches `.po` image.
15. **Use the supplied IIgs boot profile** (August 2026, formerly `gs2`, now `main`)
    - **Symptom**: a temporary experiment incorrectly treated the profile's slot 7 `bazfast3` as the normal floppy controller.
    - **Fix**: `startEmulator()` fetches that profile unchanged, writes it to `/uploads/IIgs.gs2`, maps ordinary `file`/`file2` to S5D1/S5D2, and leaves slot 7 for HDD use. A `preRun` readback verifies each browser virtual FS disk's byte length and logs its first boot byte, plus verifies the stored config contains slot 7 `bazfast3`.
16. **Diagnose `not a startup disk`** (August 2026, formerly `gs2`, now `main`)
    - **Correction**: ROM 3 already provides S5 (800K) and S6 (160K) floppy drives, and boots in order 7 → 6 → 5. Keep ordinary 800K game images on S5; do not force them onto S7 merely because the profile declares a faster `bazfast3` SmartPort there. The `preRun` FS readback makes missing/partial writes immediately visible in the browser console.
    - **Virtual FS status**: the browser path is implemented end-to-end (`fetch` → `Uint8Array` → `FS.writeFile` → `FS.readFile` length/boot-byte verification → `-ds5d1=/uploads/...`). `preRun` now rethrows verification/write errors so GS² cannot continue with an empty or partial image and mask the real failure as `not a startup disk`.
17. **Restore the original 4th & Inches WOZ image** (August 2026, formerly `gs2`, now `main`)
    - The earlier WOZ→`.po` conversion was an incorrect assumption for GS². GS² supports WOZ directly through `bazfast3`, so the partial/incorrect `4th-and-inches.po` must not be used for this game.
    - `games.js` is restored to the original `"file": "00playable.woz"` entry from `origin/v0.284`. The browser flow downloads that WOZ and writes its bytes unchanged into `/uploads/` before mounting it at S5D1.

18. **v2.2 Game Library Expansion + UI Persistence** (October 2026)
    - **28 new 2026/2025 homebrew/port games added** to `games.js` (total: 160 games):
      - **DOOM IIgs** — 65816 assembly port by Webifi; `hard1` on slot 7; requires 14.3 MHz hint in desc.
      - **Sinistar.gs** — dual-disk (SystemDisk + sinistargs.2mg); `diskSlots: ["s7d1", "s7d2"]` (both on S7 so GS² boots SystemDisk from S7D1 first).
      - **Pitfall GS** — single self-bootable `.2mg`; `diskSlots: ["s7d1"]`.
      - **Montezuma's Revenge GS** — single self-bootable `.po`; `diskSlots: ["s7d1"]`.
      - **The Ocelot Cemetery** — dual-disk (SystemDisk + game `.po`); `diskSlots: ["s7d1", "s7d2"]`.
      - **The Vera Cruz Affair** — dual-disk (SystemDisk + game `.po`); `diskSlots: ["s7d1", "s7d2"]` (2025 port).
      - **The Sydney Affair** — dual-disk (SystemDisk + game `.po`); `diskSlots: ["s7d1", "s7d2"]` (2025 port).
      - **The Santa Fe Case** — dual-disk (SystemDisk + game `.po`); `diskSlots: ["s7d1", "s7d2"]` (2025 port).
      - **The Secret of Anubis** — dual-disk (SystemDisk + game `.po`); `diskSlots: ["s7d1", "s7d2"]` (2025 port).
      - **19 Brutal Deluxe games added** (total 160) - incl. Dragon Lair series, Space Ace HD, Cogito Return, etc.
    - **Dual-disk S7 slot policy**: GS² boots in order S7 → S6 → S5. For dual-disk games using a ProDOS SystemDisk + a game disk, both disks must be assigned to the **same slot** (e.g., `["s7d1", "s7d2"]`). Mixing slots (e.g., SystemDisk on S5D1 + game disk on S7D1) causes GS² to try the game disk first and fail with `unable to load prodos`. Single self-bootable disks can go directly to S7D1.
    - **SystemDisk Local Optimization**: Replaced all external Archive.org URLs and dynamic proxy lookups for `SystemDisk.2mg` across the entire database with the local repo path `/roms/SystemDisk.2mg`. This leverages Cloudflare CDN caching and improves boot reliability and speed for all dual-disk games.
    - **Sort mode localStorage persist**: `currentSortMode` is loaded from `localStorage.getItem('sortMode')` on init and saved on each click. Initial button label is set from the persisted value.
    - **Language localStorage persist**: Priority chain is now `URL param → localStorage ('language') → browser language detection`. Language is written to localStorage both on init (when URL param present) and on every toggle. This replaces URL-param-only persistence so direct navigation to `/` retains the last chosen language.
    - **i18n sort labels**: Sort button labels (`A→Z`, `Z→A`, `Old→New`, `New→Old`) are fully translated via the `i18n` system and update immediately on language switch.

19. **v2.2 Core Enhancements & Bug Fixes** (October 2026)
    - **Active/Playing Game Highlighting**: UI now explicitly indicates which game is active/booting using a green border and background (`.playing` and `.active` classes) based on the URL `?game=` parameter, surviving page reloads and ensuring absolute consistency.
    - **GS² v1.0 Upgrade & 14.3MHz Automatic Acceleration**: Upgraded GS² engine from v0.10 to v1.0 (`v1.0.1969`). In GS² v1.0, the core officially parses `speed = "14.3mhz"` and `display = "rgb"` directly from `.gs2` machine profiles via `parse_speed()`. Integrated dynamic speed injection into `/uploads/IIgs.gs2` for high-performance demanding titles (e.g., *DOOM IIgs*, *Space Ace* series, *Dragon's Lair* series) so they automatically launch at 14.3 MHz with smooth gameplay without requiring manual user switching.
    - **Hardware Expansion Injection**: Dynamically injected `card = "second_sight"` configuration on slot 3 into `IIgs.gs2` for games explicitly requiring it (e.g., *Cogito Return*), enhancing color support.
    - **ZIP Extractor Filename Fix**: Resolved `DecompressionStream` ZIP extraction failure causing HTTP 404s for games like *Enoncés mathématiques (FR)* that contain spaces (`%20`) by running `decodeURIComponent` on the `archiveEntry` filename before passing it to `JSZip`.
    - **Game Roster Refinement**: Upgraded several `.woz` entries to more reliable `.2mg` dual-disk setups containing `SystemDisk` (e.g., *Full Metal Planet*, *Mazer II*, *Columns GS*). Added *Apple IIgs Karate* to the game list.
    - **S7 Hard Disk Optimization**: Massively updated the game database links, replacing `s5` floppy images (`.woz`) with `s7` hard disk compatible formats (`.2mg` / `.po`) for over 90% of the library. Booting and playing from the Slot 7 SmartPort hard drive provides significantly faster read/write speeds, drastically improving load times and overall gameplay experience.
    - **Version bumped to v2.3** in `index.html` titles, `README.md`, and `README_EN.md`.

20. **v2.3 Game Library Addition: SilkyGS (2026)** (October 2026)
    - **SilkyGS Added**: Added Lucas Scharenbroich's 2026 NES port pack to `games.js` (total: 162 games).
    - **Dual-disk S7 Setup**: Configured with `file: "/roms/SystemDisk.2mg"` on S7D1 and `file2: "https://github.com/lscharen/silky-gs/releases/latest/download/SilkyGS.2mg"` on S7D2 (`diskSlots: ["s7d1", "s7d2"]`).
    - **Automatic 14.3MHz Acceleration**: Included in the 14.3MHz auto-acceleration list for smooth 60fps Super Hi-Res rendering.
    - **Core Update**: Integrated the updated GS² v1.0 engine binaries (`GSSquared.wasm`, `GSSquared.js`, `GSSquared.data`).

21. **v2.3 Game Library Addition: Freegemas (2026)** (October 2026)
    - **Freegemas Added**: Added anomixer's 2026 Apple IIgs native 65816 assembly port of the open-source Match-3 puzzle classic to `games.js` (total: 163 games).
    - **Single-disk S7 Setup**: Configured with `file: "https://github.com/anomixer/freegemas/releases/latest/download/freegemas.2mg"` on S7D1 (`diskSlots: ["s7d1"]`), self-booting directly into the GS/OS S16 environment.
    - **Audiovisual Integration**: 320x200 SHR 4bpp with per-scanline palettes, wood grain background cache blitting, Ensoniq 5503 DOC double-buffered BGM streaming, native PCM sound effects, full mouse/keyboard controls, Time Trial and Endless modes, and persistent high score saving.

22. **v2.3 Game Library Addition: Ultima I (1992)** (November 2026)
    - **Ultima I Added**: Added the enhanced Apple IIgs port of Richard Garriott's legendary CRPG *Ultima I: The First Age of Darkness* to `games.js` (total: 164 games).
    - **Dual-disk S7 Setup**: Configured with `file: "/roms/GSOS601.zip/GSOS601.po"` on S7D1 and `file2: "https://www.whatisthe2gs.apple2.org.za/files/UltimaI/2Image/Ultima_I.zip/Ultima%20I/Ultima.2mg"` on S7D2 (`diskSlots: ["s7d1", "s7d2"]`), booting via GS/OS 6.0.1 and mounting Ultima I on S7D2.
    - **Enhanced IIgs Features**: Programmed by Rebecca "Burger" Heineman and published by Vitesse / Origin Systems; features Super Hi-Res color graphics, Ensoniq MIDI-synth music and audio effects, and fast hard drive performance without disk-swapping.

23. **v2.3 Game Library Addition: Vindicators (1989)** (November 2026)
    - **Vindicators Added**: Added Atari's unreleased tank combat arcade port by Westwood Studios (published by Tengen) to `games.js` (total: 165 games).
    - **Dual-disk S7 Setup**: Configured with `file: "/roms/SystemDisk.2mg"` on S7D1 and `file2: "Vindicators_1989_Tengen_Atari_Games_unreleased.2mg"` on S7D2 (`diskSlots: ["s7d1", "s7d2"]`), allowing ProDOS to boot first and seamlessly launch the game.
    - **Arcade Action & Lore**: Multi-directional scrolling tank combat, 2-player simultaneous co-op, star-based upgrade system, fuel tension mechanic, and full bilingual documentation based on preservation archive materials.

24. **v2.3 Game Library Addition: Warlock (1988)** (November 2026)
    - **Warlock Added**: Added French developer ERE Informatique's action-platformer *Warlock* (published by Three Sixty) to `games.js` (total: 166 games).
    - **Single-disk S7 Setup**: Configured with `file: "https://www.whatisthe2gs.apple2.org.za/files/Warlock/2Image/Warlock.zip/Warlock/Warlock.2mg"` on S7D1 (`diskSlots: ["s7d1"]`), extracted on the fly from the ZIP archive and self-booting directly on the Slot 7 SmartPort hard drive controller.
    - **IIgs Ghosts & Goblins Equivalent**: Platform jumping, magical staff fireballs, spell power resource management, and boss battles against 'The Unspeakable One'.

25. **v2.3 Game Library Addition: SenseiPlay (2023)** (November 2026)
    - **SenseiPlay Added**: Added Ninjaforce's (digarok) modern lightweight NTP music module player to `games.js` classified under `tool` (total: 167 titles).
    - **Single-disk S7 Setup**: Configured with `file: "https://github.com/digarok/senseiplay/releases/download/v2.0/senseiplay800.2mg"` on S7D1 (`diskSlots: ["s7d1"]`), self-booting directly via ProDOS 8.
    - **NinjaTrackerPlus Engine**: Full 65816 assembly implementation driving the Ensoniq 5503 DOC synthesizer chip with graphic animated VU meters, jukebox playback mode (`OA-P`), and minimal memory footprint.

26. **v2.3 Game Library Addition: Your Tour of the Apple IIGS (1986)** (November 2026)
    - **Tour of the IIgs Added**: Added Apple Computer's official bundled interactive educational onboarding software to `games.js` classified under `edu` (total: 168 titles).
    - **Single-disk S7 Setup**: Configured with `file: "https://www.whatisthe2gs.apple2.org.za/files/YourTouroftheAppleIIGS/2Image/Your_Tour_of_the_Apple_IIGS.zip/Your%20Tour%20of%20the%20Apple%20IIgs/Tour%20of%20the%20Apple%20IIgs.2mg"` on S7D1 (`diskSlots: ["s7d1"]`), extracted on the fly from the ZIP archive and self-booting directly on the Slot 7 SmartPort hard drive controller.
    - **Historic Desktop Tutorial**: Interactive lessons on GUI mouse navigation, file management, window operations, disk formatting, and hardware capabilities with Super Hi-Res graphics and Ensoniq sound.

27. **v2.3 Game Library Addition: Alter Ego (2026)** (November 2026)
    - **Alter Ego Added**: Added anomixer's 2026 Apple IIgs native silky-gs port of Denis Grachev's acclaimed puzzle-platformer to `games.js` (total: 169 games).
    - **Single-disk S7 Setup**: Configured with `file: "https://github.com/anomixer/alter-ego/releases/latest/download/AlterEgo.2mg"` on S7D1 (`diskSlots: ["s7d1"]`), self-booting straight into `/SYSTEM/START` on GS/OS.
    - **Automatic 14.3MHz Acceleration**: Injected with `speed: "14.3mhz"` for buttery 60fps SHR rendering. Symmetrical mirror-image dual-figure movement, compact OAM sprites, dirty-grid rendering, and full FamiTone music and sound effects.

28. **v2.4 Dual-Kernel Architecture: GS² + MAME Switcher** (November 2026)
    - **Dual-Kernel Architecture**: Integrated both GS² (GSSquared) and MAME (mameapple2gs) engines seamlessly into the main branch.
    - **GS² as Default**: Retained GS² as the ultra-fast default core (`currentCore = 'gs2'`), starting in seconds with ~5MB wasm + ~3MB data and native ProDOS/WOZ support.
    - **Header Core Switcher**: Placed `#coreToggle` in the top right header (`⚡ 核心: GS²` / `🕹️ 核心: MAME`), allowing users to toggle between GS² and MAME with a single click.
    - **Persistence & Isolation**: Core selection is stored in `localStorage.setItem('emulatorCore', core)` and synced with URL parameters (`?core=mame` / `?core=gs2`). Page reload on toggle ensures clean Emscripten contexts with zero memory leaks.
    - **Clean Conditional Loading**: `browserfs.min.js` and `loader.js` are loaded synchronously via `document.write` only when `core === 'mame'`, preventing global `window.Module` namespace pollution in GS² mode.
    - **Dynamic Instructions & Shortcuts**: Right info drawer dynamically updates hotkeys and usage tips based on active core (GS²: F1/F2/F4/F7/F9/Ctrl+F12 vs MAME: Tab menu, P pause, F7/Shift+F7 save states, F10/F11/F12, Scroll Lock game keys).
    - **ZipGS 16MHz Auto-Acceleration in MAME**: Automatically generates and mounts `apple2gs.cfg` (`<port tag=":a2_config" value="7" />`) for high-performance titles (Alter Ego, DOOM, SilkyGS, Space Ace) under MAME.
    - **Full Bilingual i18n**: All new buttons, badges, tooltips, and shortcut tables fully translated into Traditional Chinese and English.

## Key Files

### Core Application (repository root)
- `index.html` - Main application (HTML + CSS + JavaScript)
- `server.js` - Local backend proxy server
- `games.js` - Game database (181 games)
- `package.json` - Dependencies and scripts

### GS² branch (in-repo core + disk images)
- `gs2/GSSquared.js` / `gs2/GSSquared.wasm` / `gs2/GSSquared.data` - GS² (GSSquared) WASM core + preloaded BIOS/resources
- `gs2/coi-serviceworker.js` - COI service worker (for hosts that can't set COOP/COEP)
- `_headers` - Cloudflare Pages COOP/COEP headers (required for `SharedArrayBuffer`)
- `00playable.woz` / `00playable_screenshot.png` - Archive.org assets fetched at launch for 4th & Inches; no local copies are stored
- `roms/GSOS601.zip` / `roms/SpaceAce2.po` - Space Ace 2 hard-disk images (slot 7); `GSOS601.zip` contains `GSOS601.po` and is unpacked in-browser because Cloudflare Pages limits individual files to 25 MiB.
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
- **GS² / `bazfast3`** supports `.woz` directly as well as raw `.po`; prefer the original WOZ and do not convert it unless a separate target explicitly requires `.po`
- **GS² needs Cross-Origin Isolation** (COOP/COEP) for `SharedArrayBuffer` (pthreads); without it the core won't run — set in `server.js` and `_headers`
- **The "browser virtual FS" already exists** — `index.html` fetches the disk (including `.woz`) and `FS.writeFile`s the unchanged bytes into `/uploads/`, then mounts with `-ds…=`
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

## GS2 branch development log (2026-08-19)

### WASM artifact compatibility investigation

- The `gs2` branch originally had a working core with a layout problem: the
  emulator canvas started in the wrong position and became correct only after
  pressing the scale button.
- Copying only `GSSquared.wasm` from `C:\dev\gssquared` was not sufficient.
  The Emscripten output must be treated as one build artifact set:
  `GSSquared.js`, `GSSquared.wasm`, and `GSSquared.data`.
- A newer complete build from `C:\dev\gssquared` (project `0.10.1842`, git
  `a6590fb`) was tested. Although its three artifacts matched each other, it
  produced a black screen with this repository's existing `index.html` shell.
  The artifacts were therefore restored to the versions tracked by this repo.
- Do not replace only one of the three GS2 artifacts. If the upstream shell or
  startup ABI changes, update the shell integration and all three artifacts as
  one change.

### Canvas layout fix

- The initial fit problem came from applying the scale-button behavior only
  after user interaction. GS2 now applies the fit layout when initialization
  completes and dispatches a resize pass.
- `.scale-fit` previously forced a canvas to `width: 100%` and `height: 100%`.
  That stretched the canvas and could clip the right edge because a canvas does
  not apply `object-fit` like an image.
- `index.html` now calculates the canvas size from the `.iframe-wrapper`
  dimensions while preserving the GS2 `1288:928` aspect ratio. A
  `ResizeObserver` repeats the calculation when the browser or side panels
  resize.
- A 32-pixel safety margin is reserved so startup glyphs at the nominal right
  edge (for example, the Apple IIgs ROM copyright line) remain visible.

### Verification

- `git diff --check` passed after the layout changes.
- Manual browser testing confirmed the canvas is centered on first launch and
  no longer clips the rightmost startup text at the tested browser size.
- The remaining first-frame clipping was caused by startup timing: SDL updated
  its canvas output size after the first CSS fit pass. The final fix repeats
  the fit/resize sequence immediately, on the next animation frame, after
  100ms, and after 500ms. This matches the manual scale-button/browser-resize
  behavior that corrected the presentation.

### Browser HUD defaults and Emscripten rebuild (2026-08-19)

- `C:\dev\gssquared\src\ui\OSD.cpp` hides only the WebAssembly mouse
  open-drawer button with `__EMSCRIPTEN__`; the F4 key path is unchanged.
  Native Windows/Linux/macOS builds retain the original mouse drawer.
- The a2g browser shell writes `/persistent/system_settings.toml` during
  `Module.preRun` with `[hud] drives = false` (stats remains false), so
  Display > HUD > Drives is off at startup but remains user-toggleable.
- A rebuild with `C:\dev\gssquared\buildweb.bat` (project `0.10.1842`, git
  `a6590fb`) produced a coherent matching trio, but it is not compatible with
  this branch's existing `index.html` shell and causes a black screen. Those
  files were reverted; the shell-compatible trio from the previous working
  commit remains in `gs2/`. Do not deploy the newer trio until the shell/runtime
  ABI difference is resolved.
- The source-side change is guarded to Emscripten, so it does not alter native
  GSSquared functionality. Existing unrelated dirty files were left untouched.

### Artifact provenance investigation (2026-08-19)

- Git history shows the shell-compatible artifact trio was first added by
  `4b2f4d6` on 2026-08-17 10:48 (+0800). The a2g repo records no source commit,
  emsdk version, or exact linker command for that build.
- The closest available GSSquared history point is `641bc4c` at 10:06 (+0800).
  The failed rebuild used `a6590fb` (2026-08-19), after rendering/web changes
  and the large AppleII refactor `c914232`; it is not the old artifact's source
  baseline.
- The current local Emscripten is 5.0.7. The old artifact's exact toolchain
  flags cannot be recovered from a2g alone; use the older GSSquared baseline
  before attempting another a2g replacement.

### Latest-source a2g compatibility adapter (2026-08-19)

- The a2g shell now installs the same idempotent `FS.mkdir`/`FS.rmdir`
  behavior used by the current GSSquared web shell before writing virtual disks.
- The latest `a6590fb` source was rebuilt with the Emscripten-only OSD change and
  the matching `.js/.wasm/.data` trio was copied together for browser testing.
- This keeps the source on the latest GSSquared line; a2g-specific behavior is
  isolated in `index.html` rather than requiring a permanent source fork.

### Web hover rail disabled (2026-08-19)

- `src/ui/HoverControls.cpp` now disables the Reset/Capture/Debug/Speed/Display
  hover rail only under `__EMSCRIPTEN__`. The browser build does not expose the
  native debugger, and the rail otherwise appears when the pointer reaches the
  left edge of gameplay.
- The native GSSquared UI and all keyboard shortcuts remain unchanged. The
  rebuilt `.js/.wasm/.data` trio was copied together into `gs2/`.

### Consolidated development record (2026-08-19)

The complete latest-source integration sequence was:

1. The original working GS² artifact trio was identified in a2g commit
   `4b2f4d6` (2026-08-17 10:48 +0800). Its exact upstream source/toolchain was
   not recorded.
2. A rebuild from current GSSquared source `a6590fb` was first tested as a
   drop-in replacement and produced a black screen. The old shell-compatible
   trio was restored and the failure was documented.
3. The a2g shell was adapted to the current Emscripten runtime with idempotent
   virtual-FS mkdir/rmdir behavior, while retaining browser disk injection,
   `Module.arguments`, slot mapping, and startup settings.
4. The current source was rebuilt as a complete matching `.js/.wasm/.data`
   set. This latest-source build runs successfully in a2g, so a permanent
   source fork is not required.
5. Web-only C++ behavior is guarded by `__EMSCRIPTEN__`: the mouse OSD open
   affordance is hidden (F4 still toggles the drawer), and the left hover rail
   (Reset/Capture/Debug/Speed/Display) is disabled because web debugger
   controls are unsupported. Native builds are unchanged.
6. `Display > HUD > Drives` starts off through the a2g browser shell's
   `/persistent/system_settings.toml`; users can enable it during a run.

Always deploy the three generated core files together. The current a2g shell
adapter and web-only behavior are the supported path for future GSSquared
updates; do not replace only the wasm or revert to the old source baseline
unless a regression investigation specifically requires it.

### Per-game GS² mount slots (2026-08-19)

- `games.js` now derives a `diskSlots` array aligned with `file`/`file2`:
  `.po` block images default to `s7d1`/`s7d2` for accelerated SmartPort access;
  WOZ and other floppy formats default to `s5d1`/`s5d2` for IWM compatibility.
- A game can override the classification explicitly, for example
  `"diskSlots": ["s5d1", "s5d2"]` after a failed S7 boot test.
- `index.html` validates the `s[5-7]d[1-2]` spec and passes the selected slot
  directly as `-ds<slot>d<drive>=...`. `hard1`/`hard2` remain fixed at S7D1/S7D2.
- Current initial PO candidates are routed to S7; test failures should be
  recorded per title and changed to an explicit S5 override rather than changing
  the global default.
- `Serve & Volley` and `Windwalker` have now been explicitly classified back to
  S5 after boot testing. The same override mechanism is ready for other titles.
- `.2mg` block images are included in the initial S7 test group alongside `.po`;
  WOZ remains on S5. This is a test routing policy, not a claim that every 2MG
  image is boot-compatible from SmartPort.

### Current slot-test status and UX wording (2026-08-19)

- The initial `.po` S7 test found two exceptions: `Serve & Volley` and
  `Windwalker` must use S5. They now carry explicit `diskSlots` overrides.
- Seven `.2mg` titles were also tested and require S5: `Battle Chess`,
  `Cogito`, `GBA Championship Basketball: Two on Two`, `Sea Strike`,
  `Sensei`, `Silent Service`, and `Space Shark`.
- The remaining `.2mg` entries are currently S7 test candidates. Record each
  failed boot and add an explicit S5 `diskSlots` override per title.
- User-facing mouse guidance now consistently says `ESC/F1` restores the mouse
  cursor in both Chinese and English README/UI text.
- `poLarge: true` marks `.po` images larger than 800K that must remain on S7.
  `index.html` shows the slot icon as greyed-out/disabled for these titles and
  blocks the slot-5 toggle. `Time Pilot GS` is the first title using this flag.

### GS² branding and title UI (2026-08-19)

- The gs2 web title is localized as `Apple IIgs 線上模擬器 v2.3 快速載入版 ⚡` in Chinese and
  `Apple IIgs Online Emulator v2.3 Fast Load Edition ⚡` in English.
- Keep the Apple favicon beside the title; it is intentionally not replaced by
  the GS² mark.
- The upper-right GSSquared link uses `gs2/gssquared-mark.png`, links to
  `https://github.com/anomixer/gssquared`, and exposes the tooltip/accessible
  label `Powered by GSSquared`.
- The GS² v2.3 README feature list documents the right-mouse-button shortcut for
  accelerating emulation speed.
- Slot 5/slot 7 choices made with the title disk button are persisted per game
  in `localStorage` (`gs2.diskSlots`). If the emulator is already running, the
  page reloads with the selected game so the new mount slot is actually applied.
- The README titles include the v2.3 naming; project branding details belong to
  the application UI rather than the README header.
- README usage sections now document persistent per-game disk-slot selection and
  automatic restart when switching slots during emulation.

### v2.4 Dual-Kernel (GS² + MAME) & CFFA2 Slot 7 Hard Drive Acceleration (November 2026)

- **Dual-Kernel Architecture (GS² + MAME)**:
  - Switched between GS² and MAME kernels directly via the top-right brand logos (`logo/mame-logo.png` and `gs2/gssquared-mark.png`).
  - Selected kernel is rendered in full color with subtle glow; inactive kernel is grayscale with reduced opacity.
  - Title text protected from overflowing the action buttons via `padding: 0 310px 0 90px;` and `text-overflow: ellipsis`.
  - MAME WASM binary (`mameapple2gs.wasm.gz`, ~27.4MB uncompressed) is pre-downloaded and passed into Emularity via `{ wasmBinary: wasmBytes }` to bypass Emularity XHR hanging, combined with in-memory caching in `server.js`.
- **MAME CFFA2 Slot 7 Hard Drive Controller & 8MB RAM Expansion**:
  - Automatically expands Apple IIgs memory to 8MB using `-ramsize 8M` by default, matching GS²'s 8MB configuration and resolving memory limits for heavy titles like DOOM IIgs and GS/OS.
  - Implemented `-sl7 cffa2` support in `startMameEmulator`.
  - For block images (`.2mg`, `.po`, `.hdv`) and games with `hard1`/`hard2` or Slot 7 configurations, MAME now mounts them via `-sl7 cffa2 -hard1 /emulator/<disk1>` (and `-hard2` for secondary hard disks).
  - Floppy images (`.woz`, `.dsk`) continue to mount on Slot 5 (`-flop3` / `-flop4`).
  - Unified the 💽 slot toggle button across both GS² and MAME kernels: users can freely toggle games between Slot 7 (CFFA2 HD) and Slot 5 (3.5" Floppy) in MAME just like in GS², with per-game preferences persisted in `localStorage`.
  - Firmware ROMs (`cffa2.zip`, `a2cffa2.zip`, and `cffa20eec02.bin`) stored in `/roms/` and mounted to virtual FS on boot.
  - Gives MAME high-speed hard disk booting and file transfer parity with the GS² engine.
- **ZipGS 16MHz Auto-Acceleration & Real-Time Speed Selector**:
  - Automatically injects `cfg/apple2gs.cfg` (`:a2_config` mask `7`, value `7`) and `-cfg_directory /emulator` into MAME for high-speed demanding games (DOOM IIgs, Alter Ego, Space Ace, Dragon's Lair, SilkyGS).
  - Added a real-time speed selector dropdown button (`#speedBtn`, e.g. `2.8MHz ▼`) positioned immediately to the left of the Open Source Site (`#archiveBtn`) button in MAME mode.
  - Dropdown options: `1MHz (相容模式)`, `2.8MHz (原生標準)`, `8MHz (ZipGS)`, `16MHz (極速加速)` (removed 14MHz due to MAME sub-cycle sync overhead causing slowdown).
  - Intelligently defaults to `2.8MHz` for normal games and `16MHz` for high-speed demanding titles.
  - Per-game speed selections are persisted in `localStorage` (`mame.speed.<gameId>`) and URL parameter (`?speed=`), enabling immediate hot-restarting at the selected speed upon user click.
  - Isolated speed settings per-game so switching games cleans up previous speed parameters and restores the target game's default/saved speed.
  - Hidden automatically under GS² kernel mode and displayed only under MAME mode.
  - Cleaned up `gameTitleBar` by removing redundant kernel badge next to the game title.
  - Updated auto-acceleration game description banner in `games.js` to dual-kernel format: `(GS²: 14.3MHz / MAME: 16MHz)`.

- **v2.4 Game Library Addition: Oubliette GS (2026)**:
  - Added Dan Henderson & Walter Tengler's November 2026 Apple IIgs dungeon puzzle game *Oubliette GS* to `games.js`.
  - Configured with `file: "https://github.com/8-Bit-Shack/8-Bit-Shack-Free-Games/releases/latest/download/game_oubliette_gs.zip/game_oubliette_gs/OublietteGS.po"`, `screenshot: "https://whatisthe2gs.com/assets/titles/oubliette-iigs/shot1.png"`, and `diskSlots: ["s7d1"]`.
  - Upgraded `extractZipEntry` in `index.html` to handle nested zip directories with backslashes or slashes resiliently.

- **v2.4 Game Library Additions: Athanor 1: l'éveil, Utopia, and Futuria (October–November 2026)**:
  - Added three 2026 Brutal Deluxe Software Apple IIgs releases by Antoine Vignau & Olivier Zardini to `games.js`:
    - **Athanor 1: l'éveil (2026)**: 12th-century Italian abbey occult mystery text adventure ported from Erik Safar's 2014 game. Dual-disk S7 setup: `file: "/roms/SystemDisk.2mg"`, `file2: "https://www.brutaldeluxe.fr/products/apple2gs/athanor/athanor_gb.po"`, `diskSlots: ["s7d1", "s7d2"]`, cover screenshot from `whatisthe2gs.com`.
    - **Utopia (2026)**: Sci-fi fantasy adventure by William Demas, originally on TRS-80 (1981) and Mac (1985). Reverse-engineered from 68000 and 100% rewritten in 65816 assembly with MIDI synth music. Dual-disk S7 setup: `file: "/roms/SystemDisk.2mg"`, `file2: "https://www.brutaldeluxe.fr/products/apple2gs/utopia/utopia.2mg"`, `diskSlots: ["s7d1", "s7d2"]`.
    - **Futuria (2026)**: Sequel to Utopia set in 2190 battling Futurian robots. 65816 assembly port with Ensoniq DOC cantata MIDI synth music. Dual-disk S7 setup: `file: "/roms/SystemDisk.2mg"`, `file2: "https://www.brutaldeluxe.fr/products/apple2gs/futuria/futuria.2mg"`, `diskSlots: ["s7d1", "s7d2"]`.

- **v2.4 Game Library Additions: Wolfenstein 3D, Ms. Pac-Man, and Galaga GS (2026)**:
  - Added three landmark 2026 community ports to `games.js`:
    - **Wolfenstein 3D (2026)**: Webifi's native 65816 port directly based on the original DOS engine with direct screen rendering, dithered 16-color palette, distance shading, and DOS weapon sprites. Configured with `file: "https://github.com/Webifi/iigs-wolfenstein3d/releases/download/v0.2.0/wolf-hd.hdv"`, `diskSlots: ["s7d1"]`, and high-speed auto-acceleration (`speed: "14.3mhz"` / MAME 16MHz).
    - **Ms. Pac-Man** (`精靈小姐`): Jawaid Bazyar's test-driven arcade Z80 to 65816 port with provable algorithmic identity, authentic ghost AI, fruit mechanics, Super Hi-Res graphics, and arcade sound. Configured with `file: "https://github.com/jawaidbazyar2/mspacman/releases/latest/download/MsPacMan.2mg"`, `diskSlots: ["s7d1"]`.
    - **Galaga GS (2026)**: Steve Vavruska's arcade shooter port based on Xgalaga using Lucas Scharenbroich's Generic Tile Engine (GTE) expanded to 128 sprites, featuring dynamic starfields, smooth animations, authentic sound, and keyboard/mouse control. Configured with dual-disk S7 setup: `file: "/roms/SystemDisk.2mg"`, `file2: "https://github.com/vavruska/GalagaGS/releases/download/V1.0/GalagaGS1.0.po"`, `diskSlots: ["s7d1", "s7d2"]`, and high-speed auto-acceleration (`speed: "14.3mhz"` / MAME 16MHz).

- **v2.4 Game Library Additions: WORDLE GS (2022) and GS.Adventure (2021)**:
  - Added two community homebrews to `games.js`:
    - **WORDLE GS (2022)**: Dan Malec's open-source C port of the global word-guessing phenomenon for the Apple IIgs using ORCA/C and Apple2GSBuildPipeline. Includes desktop window UI, session stats, shareable codes, and custom puzzle input. Configured with dual-disk S7 setup: `file: "/roms/SystemDisk.2mg"`, `file2: "https://github.com/dmalec/Wordle.GS/releases/latest/download/WordleGS.2mg"`, `diskSlots: ["s7d1", "s7d2"]` (with automatic prerelease asset redirection in `buildFileUrl`).
    - **GS.Adventure (2021)**: Peter Hirschberg's native Apple IIgs port of Warren Robinett's legendary Atari 2600 console game Adventure. Features classic castle mazes, dragons, items, and the famous Easter egg. Configured with dual-disk S7 setup: `file: "/roms/SystemDisk.2mg"`, `file2: "https://github.com/peterhirschberg/GS.Adventure/releases/latest/download/GS.Adventure.po"`, `diskSlots: ["s7d1", "s7d2"]`. Controls: WASD to move, Space to drop items, '1' to start/reset, '2' to select game, 'J' to toggle joystick.

- **v2.4 Game Library Additions: GS.Asteroids (2021) and Pac-Man (2021)**:
  - Added two Peter Hirschberg arcade creations to `games.js`:
    - **GS.Asteroids (2021)**: Faithful clone of Atari's 1979 vector arcade classic Asteroids for the Apple IIgs, incorporating sound and pipeline code from Jeremy Rand's BuGS. Features two graphics modes ('Fast' for stock Apple IIgs and 'Fancy' for accelerator cards, toggled via 'F' key). Configured with `file: "https://github.com/peterhirschberg/GS.Asteroids/releases/latest/download/GS.Asteroids.2mg"`, `diskSlots: ["s7d1"]`.
    - **Pac-Man** (`小精靈` / `GS.Pacman`): Native 65816 assembly port of Namco's 1980 arcade phenomenon built from scratch to run on the GS/OS desktop, featuring authentic maze, power pellets, fruits, and ghost AI. Configured with dual-disk S7 setup: `file: "/roms/SystemDisk.2mg"`, `file2: "https://github.com/peterhirschberg/GS.Pacman/releases/latest/download/GS.Pacman.2mg"`, `diskSlots: ["s7d1", "s7d2"]`. Controls: WASD / arrow keys to move, '1' to start, '8' to toggle cheat mode, '9' to skip level, 'J'/'K' for joystick toggle.

- **v2.4 Game Library Addition: Night Driver GS (2022)** (`暗夜狂飆 GS`):
  - Added Ian Schmidt & Fatdog Projects' homebrew arcade port of Atari's 1976 classic *Night Driver* to `games.js` (total: 181 games).
  - Authentic implementation running original coin-op 6502 machine code in 65816 emulation mode with IIgs Super Hi-Res rendering for roadside pylons.
  - Configured with Archive.org item `nd11_20221223` (`file: "nd11.po"`, `screenshot: "00_coverscreenshot.png"`, `diskSlots: ["s7d1"]`). ProDOS 8 self-booting with key customization support.

---

*This document serves as a comprehensive guide for future development and maintenance of the Apple IIgs emulator project, including both local and Cloudflare Pages deployment scenarios.*
