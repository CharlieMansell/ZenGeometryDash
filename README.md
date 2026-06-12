# ⬛ Zen Geometry Dash

A Geometry Dash–style rhythm platformer made for **Zen** 💙 — eight handcrafted
levels, chiptune music, jump pads, orbs, rocket-ship sections, a character
editor, local **2-player co-op**, and a chill **Zen Mode** where you can never
die.

The Windows version is a real desktop app (Electron) — no console window, no
browser tab. macOS/Linux builds run as a tiny single-file server that opens
the game in your browser.

## 🎮 How Zen gets the game

1. Go to this repo's **[Releases](../../releases)** page.
2. Download **`ZenGeometryDash-Setup.exe`** and run it once — the game
   installs with a desktop shortcut. (Or grab
   `ZenGeometryDash-Portable.exe` for a no-install single file.)
   - Windows SmartScreen may warn the first time (the app isn't code-signed)
     — click **More info → Run anyway**.
3. Double-click the shortcut and play!

## 🕹️ Controls

| Action | Player 1 | Player 2 (2-Player mode) |
| --- | --- | --- |
| Jump / fly (hold to repeat) | **Space**, **W**, click, tap left half | **↑**, **Enter**, tap right half |
| Pause | **Esc** / **P** | |
| Restart level | **R** | |
| Toggle sound | **M** | |
| Toggle ☯ Zen Mode (no dying!) | **Z** | |
| Fullscreen (desktop app) | **F11** | |

- 🟡 **Yellow pads** bounce you sky-high automatically.
- 🟡 **Yellow orbs** give a mid-air jump — press while touching one.
- 🌀 **Portals** switch between cube and rocket-ship mode.
- 🏁 Reach the striped flag to win. Fewer attempts = more stars!
- 😎 **Character** on the menu: pick your cube's color and face.
- 👥 **2-Player**: two cubes run together — if either crashes, the team
  restarts. Teamwork!

## 📦 Levels

1. **First Bounce** — learn to jump
2. **Spike Garden** — orbs and double spikes
3. **Sky Surfer** — first rocket-ship ride
4. **Block Party** — platforming gauntlet
5. **Zen Master** — everything at once
6. **Pad Parade** — bounce-pad bonanza
7. **Orbit** — trust the orbs
8. **Twin Peaks** — the full gauntlet

## 🛠️ Development

The game itself is dependency-free HTML5 canvas (`web/`). Two shells wrap it:

```bash
# Electron desktop app (Windows builds in CI)
npm ci
npm start                       # run the desktop app locally
npx electron-builder --win      # build installer + portable exe

# Go server (macOS / Linux release binaries)
go run .                        # serves the game and opens your browser

node tools/check-levels.mjs     # verify all levels are humanly possible
```

- `web/game.js` — engine: physics, collisions, rendering, menus, 2P, skins
- `web/levels.js` — levels, written with a small builder DSL
- `web/audio.js` — procedural chiptune music + sound effects (no audio files)
- `electron/main.js` — desktop app shell
- `main.go` — tiny web server alternative, embeds `web/` into the binary
- `tools/check-levels.mjs` — static playability checks (runs in CI)

GitHub Actions builds everything on every push and keeps a **`latest`**
release updated, so the download link never changes.

Progress (best %, stars, character, settings) is saved locally.
