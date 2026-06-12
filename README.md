# ⬛ Zen Geometry Dash

A Geometry Dash–style rhythm platformer made for **Zen** 💙 — five handcrafted
levels, chiptune music, jump pads, orbs, rocket-ship sections, and a chill
**Zen Mode** where you can never die.

The whole game compiles into a **single exe**: a tiny Go web server with the
game embedded inside. Double-click it and it opens in your browser. No
installs, no internet needed.

## 🎮 How Zen gets the game

1. Go to this repo's **[Releases](../../releases)** page.
2. Download **`ZenGeometryDash.exe`** from the latest release.
3. Double-click it. The game opens in the browser automatically.
   - Windows SmartScreen may warn the first time (the exe isn't signed) —
     click **More info → Run anyway**.
   - If Defender blocks the download, open **Windows Security → Virus &
     threat protection → Protection history**, find the entry and choose
     **Actions → Allow**. (Unsigned hobby exes sometimes get false-flagged;
     the build embeds version info and keeps symbols to minimise this.)
   - Keep the little black window open while playing; close it to quit.

There are also `ZenGeometryDash-mac` and `ZenGeometryDash-linux` builds.

## 🕹️ Controls

| Action | Keys |
| --- | --- |
| Jump (hold to keep jumping) | **Space**, **↑**, **W**, click, or tap |
| Fly the rocket up | hold jump |
| Pause | **Esc** or **P** |
| Restart level | **R** |
| Toggle sound | **M** |
| Toggle ☯ Zen Mode (no dying!) | **Z** |

- 🟡 **Yellow pads** bounce you sky-high automatically.
- 🟡 **Yellow orbs** give a mid-air jump — press while touching one.
- 🌀 **Portals** switch between cube and rocket-ship mode.
- 🏁 Reach the striped flag to win. Fewer attempts = more stars!

## 📦 Levels

1. **First Bounce** — learn to jump
2. **Spike Garden** — orbs and double spikes
3. **Sky Surfer** — first rocket-ship ride
4. **Block Party** — platforming gauntlet
5. **Zen Master** — everything at once

## 🛠️ Development

Requirements: Go 1.24+ (and Node for the level checker). No other dependencies.

```bash
go run .                        # build & play locally
node tools/check-levels.mjs     # verify all levels are humanly possible
GOOS=windows GOARCH=amd64 go build -ldflags "-s -w -H=windowsgui" -o ZenGeometryDash.exe .
```

- `main.go` — tiny web server, embeds `web/` into the binary
- `web/game.js` — engine: physics, collisions, rendering, menus
- `web/levels.js` — levels, written with a small builder DSL
- `web/audio.js` — procedural chiptune music + sound effects (no audio files)
- `tools/check-levels.mjs` — static playability checks (runs in CI)

GitHub Actions builds Windows/macOS/Linux binaries on every push and keeps a
**`latest`** release updated, so the download link never changes.

Progress (best %, stars, Zen Mode setting) is saved in the browser's
localStorage.
