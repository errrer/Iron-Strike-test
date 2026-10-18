# IRON STRIKE

A free, browser-based **3D first-person shooter** in the style of modern arena shooters. No install, no build step - it is plain ES modules + [Three.js](https://threejs.org).

**Play:** enable GitHub Pages (see below) and open the URL, or run it locally.

## Features

- **3 game modes**
  - **Team Deathmatch** - 5v5, first team to 30 kills
  - **1v1 Duel** - you vs one bot, first to 10 kills
  - **Free For All** - 8 players, first to 20 kills
- **4 maps** - *Warehouse* (indoor containers + catwalk), *Dust* (desert village), *Skyline* (rooftop at dusk), *Frostbite* (snow compound with watchtowers)
- **8 weapons** - pick a primary and a secondary before every match

| Slot | Weapon | Type | Notes |
|---|---|---|---|
| Primary | **VMP** | SMG | Fastest-firing primary, great mobility |
| Primary | **M4A1** | Assault rifle | Balanced and accurate |
| Primary | **AK-47** | Assault rifle | Hard-hitting, heavy recoil |
| Primary | **Kar98k** | Sniper | Bolt-action, 4x scope, one-shot body kill |
| Primary | **Model 680** | Shotgun | Pump action, 10 pellets |
| Secondary | **G18** | Machine pistol | Full-auto, 1100 RPM |
| Secondary | **M1911** | Pistol | Semi-auto, 3 shots to kill |
| Secondary | **.357 Magnum** | Revolver | 2 shots to kill |

- Bots with line-of-sight vision, reaction time, burst fire, strafing and A\* pathfinding (3 difficulty levels)
- Hitscan ballistics with damage fall-off, headshots, recoil, spread, ADS and sprint
- Health regeneration, kill feed, hit markers, damage direction indicators, radar, scoreboard
- Procedural textures and WebAudio sound; guns are either your own baked models (the **VMP** is a custom FBX model) or detailed procedural stand-ins

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Shift | Sprint |
| C | Crouch |
| Space | Jump |
| Left mouse | Fire |
| Right mouse | Aim down sights |
| R | Reload |
| 1 / 2 / Q / mouse wheel | Switch weapon |
| V | Toggle first / third person camera (also in the menu and pause settings) |
| Tab (hold) | Scoreboard |
| Esc | Pause |

## Multiplayer (V0.3)

Click **MULTIPLAYER** on the main menu.

- **Host a game** - creates a room and shows a **6-letter code**. Pick the mode, map and your loadout in the lobby, then press START MATCH.
- **Join a game** - type the host's code. You can also join a match that is already running.
- Up to **18 players** per room (1v1 Duel is limited to 2). All 3 modes and all 4 maps work online; Team Deathmatch auto-balances the teams.
- Pause does not stop the match online. Esc / "Leave match" takes you out of the room.

How it works: there is no game server. Players connect directly to each other with WebRTC (via [PeerJS](https://peerjs.com), loaded from a CDN, using its free public signalling server). The host's browser runs the match and streams the state to everyone else, with lag compensation for hits. So it keeps working on GitHub Pages, but:

- The host needs a decent connection (an 18-player room uploads roughly 1.5-2 Mbit/s). If the host closes the tab, the room ends.
- Movement is trusted from each client, so it is made for playing with friends, not for ranked/anti-cheat play.
- Very strict firewalls / some mobile networks can block WebRTC; the free PeerJS relay usually gets around that.

Tests: `python3 tests/mp-test.py` runs a host plus up to 18 simulated clients over a fake in-memory network.

## Run locally

ES modules need a web server (opening `index.html` directly from disk will not work):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Three.js is loaded from the jsDelivr CDN (see the import map in `index.html`). To run fully offline, download `three.module.js` (r160) into a `vendor/` folder and point the import map at it.

## Deploy to GitHub Pages

1. Create a new GitHub repository and push this folder to the `main` branch.
2. In the repo go to **Settings -> Pages -> Build and deployment -> Source** and choose **GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) publishes the site on every push. Your game will be live at `https://<your-username>.github.io/<repo-name>/`.

## Project layout

```
index.html          page + import map
css/style.css       menu + HUD styling
js/main.js          menu, settings, game flow
js/game.js          match logic, player, shooting, modes
js/bots.js          bot AI
js/weapons.js       weapon stats + procedural gun models
js/maps.js          the four maps (pure data, unit-testable)
js/physics.js       collision, ray casting, navigation graph
js/world.js         builds the Three.js scene from a map
js/hud.js           HUD, radar, kill feed, scoreboard
js/audio.js         procedural sound effects
js/gunmodels.js     gun models: loads baked assets + procedural stand-ins
assets/fbx/         source FBX models (vmp.fbx)
assets/models/      baked models the game loads (vmp.json)
tools/              FBX -> game model converter + preview scripts
tests/              map/nav test + headless smoke test
```

## Tests

```bash
node tests/nav-test.mjs   # every map has a connected nav graph and valid spawns
python3 tests/smoke.py    # headless Chromium (Playwright): plays all modes with a stubbed Three.js
```

## Using your own gun models (FBX)

The VMP uses a custom model. To add more, model them in Blender (or anything that exports binary FBX) and bake them:

```bash
cp my_m4a1.fbx assets/fbx/m4a1.fbx
python3 tools/fbx2model.py assets/fbx/m4a1.fbx m4a1 --length 0.85 --preview /tmp/m4a1.png
```

Then register it on the weapon in `js/weapons.js` (the `grip` / `fore` values are the names of the parts where the hands go):

```js
m4a1: { ..., asset: { id: 'm4a1', grip: 'grip', fore: 'handguard' } }
```

Tips for the converter (Python 3 + numpy only, no Blender needed):
- Name a part `Stock` (or `Butt...`) so it knows which end is the back, and a part starting with `Mag` so it knows which way is down. Otherwise pass `--forward -x` / `--up +y` yourself.
- Each part becomes one mesh coloured from its material's *Diffuse Color*. Textures and UVs are ignored.
- `--length` is the gun's overall length in metres (the VMP is 0.62). The converter centres the model on the receiver and points the muzzle down -Z.
- Use `--muzzle x,y,z` if the muzzle flash should come from somewhere other than the front-most point.
- The `--preview` PNG shows side / iso / top / front views so you can check orientation and colours.

If a model file is missing the game silently falls back to the procedural stand-in.

## Adding content

- **New weapon:** add an entry to `WEAPONS` in `js/weapons.js` and list its id in `PRIMARIES` or `SECONDARIES`.
- **New map:** write a builder function in `js/maps.js` (boxes, buildings, stairs helpers) and register it in `MAP_BUILDERS` / `MAP_INFO`.

## Disclaimer

Fan-made, non-commercial hobby project. It is not affiliated with, endorsed by, or sponsored by any game publisher or studio. Weapon names describe real-world firearms and are used descriptively; all code, models, textures and sounds are generated procedurally.

## License

MIT (see `LICENSE`). Three.js is MIT licensed by its authors.

## Easter egg

Type `richtofen` anywhere (menu or in a match) and every soldier turns into the Richtofen model; type it again to turn it off. The model lives in `assets/models/richtofen.json`, baked from an OBJ with `python3 tools/obj2model.py model.obj richtofen`. It only changes your own screen, also in multiplayer.
