# 🕹️ Zen's Games

An arcade of games built by **Zen & Dad** 💙 — all inside one desktop app.
Pick a game from the hub, customise your characters (they follow you into
every game!), and play solo or together.

## 🎮 The games

| | Game | What it is |
| --- | --- | --- |
| 🔺 | **Geometry Dash** | Rhythm auto-runner: jump the spikes, ride the rockets, reach the flag. 8 levels, Zen Mode, 2-player co-op. |
| 🍄 | **Cube Quest** | Co-op platform adventure: run, jump, stomp grumps, grab every coin. 4 worlds, checkpoints, springs and moving platforms. |
| 🚀 | *Coming soon…* | Star Squadron, Turbo Cubes, Snake Battle, Brick Buster, Dungeon Cubes… |

## ⬇️ How Zen gets it

1. Go to this repo's **[Releases](../../releases)** page.
2. Download **`ZensGames-Setup.exe`** and run it once — the arcade installs
   with a desktop shortcut. (Or grab `ZensGames-Portable.exe` for a
   no-install single file.)
   - Windows SmartScreen may warn the first time (the app isn't code-signed)
     — click **More info → Run anyway**.
3. Double-click the shortcut and pick a game!

## 🕹️ Controls

| Action | Player 1 | Player 2 |
| --- | --- | --- |
| Geometry Dash — jump | **Space**, **W**, click, tap left half | **↑**, **Enter**, tap right half |
| Cube Quest — move | **A** / **D** | **←** / **→** |
| Cube Quest — jump | **W** or **Space** | **↑** or **Enter** |
| Pause | **Esc** / **P** | |
| Restart level | **R** | |
| Sound on/off | **M** | |
| Fullscreen (desktop app) | **F11** | |

In 1-player mode both control sets steer Player 1.

😎 **Characters:** open "Characters" in any game's menu — Player 1 and
Player 2 each pick their own color and face, and the choice is shared by
every game in the arcade.

## 🛠️ Development

The games are dependency-free HTML5 canvas. Two shells wrap them:

```bash
# Electron desktop app (Windows builds in CI)
npm ci
npm start                       # run the arcade locally
npx electron-builder --win      # build installer + portable exe

# Go server (macOS / Linux release binaries)
go run .                        # serves the arcade and opens your browser

node tools/check-levels.mjs     # verify Geometry Dash levels are beatable
```

- `web/index.html` — the arcade hub
- `web/shared/` — character skins + procedural chiptune audio (used by all games)
- `web/geometry/` — Geometry Dash (engine, levels, menus)
- `web/platformer/` — Cube Quest (engine, levels, menus)
- `electron/main.js` — desktop app shell
- `main.go` — tiny web server alternative, embeds `web/` into the binary

GitHub Actions builds everything on every push and keeps a **`latest`**
release updated, so the download link never changes.

### Adding a new game

1. Create `web/<your-game>/index.html` + `game.js` (include
   `../shared/skins.js` and `../shared/audio.js` for characters & music).
2. Add a card for it in `web/index.html`.
3. Push — CI ships it inside the same exe.
