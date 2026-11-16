# TikTok LIVE Games

**One audience. Six ways to play.**

A collection of browser games for portrait TikTok LIVE streams: crowd-powered street racing, a match reactor, an autonomous city drive, a robot adventure, a highway runner, and a community-built garage.

Built with **JavaScript, Three.js, and Node.js**. Run each game locally, try its demo or host controls, and capture the portrait view in OBS or TikTok LIVE Studio.

## Screenshots

Existing project captures show the game and host interfaces. The Dream Garage image shows its workshop sandbox; its current LIVE game has a separate portrait view.

<table>
  <tr>
    <th>NIGHTSHIFT — crowd-powered street racing</th>
    <th>Prism Rush — the community match reactor</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/nightshift-racing.jpg" alt="NIGHTSHIFT racing with a Porsche, crowd controls, and the unlockable garage" width="600"></td>
    <td><img src="docs/screenshots/prism-rush.jpg" alt="Prism Rush gem board, team score, viewer powers, and leaderboard" width="600"></td>
  </tr>
  <tr>
    <th>Dream Garage — workshop sandbox</th>
    <th>TURBOSTRADA — portrait highway race</th>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/dream-garage-workshop.jpg" alt="Dream Garage workshop showing a project car, upgrades, and simulated community contributions" height="400"></td>
    <td align="center"><img src="docs/screenshots/turbostrada.jpg" alt="TURBOSTRADA night race with viewer avatars and a leaderboard" height="400"></td>
  </tr>
</table>

## Choose a game

| Game | What happens | Start on Windows | Guide |
| --- | --- | --- | --- |
| **NIGHTSHIFT** | One crowd-powered supercar races three automatic rivals. Taps build speed; gifts trigger boosts; points unlock cars. | `nightshift-racing/START-NIGHTSHIFT.bat` | [Racing, garage, and LIVE setup](nightshift-racing/README.md) |
| **Prism Rush** | A shared 3D gem board runs smart swaps and cascades. Viewers charge moves, meteors, prisms, and supernovas. | `prism-rush/START.bat` | [Powers, host controls, and relay](prism-rush/README.md) |
| **Echo Rescue** | E-07 explores five floating worlds on autopilot. Gifts build bridges and grant powers; each action returns once as an echo. | `echo-rescue/START.bat` | [Worlds, progression, and viewer actions](echo-rescue/README.md) |
| **Autodrive Live** | An autonomous car explores a fictional city, follows traffic signals, changes lanes, and responds to audience boosts. | `nightdrive-live/START-AUTODRIVE.bat` | [Driving modes and LIVE setup](nightdrive-live/README.md) |
| **TURBOSTRADA** | Viewer avatars run a highway course in Classic, Challenge, Teams, or Elimination mode. | `turbo-autostrada/START.bat` | [Runner setup and modes — Romanian](turbo-autostrada/CITESTE.md) |
| **Dream Garage LIVE** | The audience funds a project car, installs upgrades, and helps it win automatic 400 m duels. | `turbo-autostrada/DREAM-GARAGE.bat` | [LIVE game](turbo-autostrada/DREAM-GARAGE.md) · [Workshop sandbox](turbo-autostrada/DREAM-GARAGE-WORKSHOP.md) |

## Run locally

Use **Node.js 22 or newer** and Edge or Chrome with WebGL2 and hardware acceleration. Windows launchers are included; the Node servers can also be started from a terminal.

Clone the collection:

```powershell
git clone https://github.com/dexterR35/tik-tok-games.git
cd tik-tok-games
```

Choose one game folder, then run its commands:

| Folder | Terminal commands | Local game |
| --- | --- | --- |
| `nightshift-racing` | `npm install`, then `npm start` | `http://127.0.0.1:3316` |
| `prism-rush` | `npm run serve` — bundled assets, no install needed | `http://127.0.0.1:4328` |
| `echo-rescue` | `npm start` — bundled assets, no install needed | `http://127.0.0.1:4317` |
| `nightdrive-live` | `npm install`, then `npm start` | `http://127.0.0.1:4316` |
| `turbo-autostrada` | Copy the configuration below, run `npm install`, then `npm start` | `http://127.0.0.1:3000` |
| `turbo-autostrada` — Dream Garage | `npm install`, then `npm run garage` | `http://127.0.0.1:3210` |

For example, start NIGHTSHIFT from the repository root:

```powershell
cd nightshift-racing
npm install
npm start
```

NIGHTSHIFT includes its playable `dist` files. Run `npm run build` in that folder to refresh its bundled graphics modules after changing dependencies. Prism Rush also provides `npm run build` for its standalone static demo. These are independent projects, with no root install or root build command.

### TURBOSTRADA configuration

From `turbo-autostrada`, create your private configuration:

```powershell
Copy-Item config.example.json config.json
npm install
npm start
```

Set your TikTok username and panel password in `config.json` before connecting or sharing access. Signing keys, if needed, belong in that private file. Local configurations, saves, and logs are ignored by Git.

For the four separate runner launchers, first copy the per-stream templates:

```powershell
Copy-Item lives/clasic.example.json lives/clasic.json
Copy-Item lives/challenge.example.json lives/challenge.json
Copy-Item lives/echipe.example.json lives/echipe.json
Copy-Item lives/eliminare.example.json lives/eliminare.json
```

Set the intended username in each file, then use `LIVE-1-CLASIC.bat` through `LIVE-4-ELIMINARE.bat`. Their ports are **3001–3004**. See [CITESTE.md](turbo-autostrada/CITESTE.md) for the full setup.

## Capture the game

Use a **1080 × 1920** portrait browser source, or capture the game window. Start the local server first and keep it running throughout the broadcast.

| Game | Clean capture URL |
| --- | --- |
| NIGHTSHIFT | `http://127.0.0.1:3316/?broadcast=1` |
| Prism Rush | `http://127.0.0.1:4328/?capture=1` |
| Echo Rescue | `http://127.0.0.1:4317/?capture=1` |
| Autodrive Live | `http://127.0.0.1:4316/?capture=1` |
| TURBOSTRADA | `http://127.0.0.1:3000/?live=1` — use your stream's port for separate launchers |
| Dream Garage LIVE | `http://127.0.0.1:3210/?source=1` |

## Connect your audience

**NIGHTSHIFT, Autodrive Live, and TURBOSTRADA** include local bridges based on the unofficial `tiktok-live-connector`. Use the intended creator account while it is LIVE.

**Echo Rescue, Prism Rush, and Dream Garage LIVE** can receive normalized viewer events through the TURBOSTRADA relay. Start the relay with `node server.js YOUR_TIKTOK_USERNAME` from `turbo-autostrada`, then connect the game through its host panel. Its default WebSocket address is `ws://localhost:3000/ws`.

Demo controls simulate local actions and do not send paid gifts. Static hosted demos do not run a local LIVE bridge. Real TikTok connectivity depends on the connector and service configuration; an on-air test is still required. A connected relay alone does not confirm that an account is LIVE.

## Development

Run checks from the project you are working on:

| Project | Test command |
| --- | --- |
| Echo Rescue | `npm test` |
| Autodrive Live | `npm test` |
| NIGHTSHIFT | `npm test` |
| Prism Rush | `npm test` |
| Dream Garage | `npm run test:garage` in `turbo-autostrada` |

The repository includes the games, bundled browser assets, original asset sources where available, and screenshots. Installed dependencies, personal settings, saved sessions, deployment archives, and local backups stay on your computer.

Third-party assets retain their own licenses and attributions. See [NIGHTSHIFT model credits](nightshift-racing/dist/assets/model-attributions.json), [Autodrive asset credits](nightdrive-live/public/assets/CREDITS.md), [Echo Rescue vendor notes](echo-rescue/public/vendor/README.txt), and [Dream Garage asset notes](turbo-autostrada/public/garage/assets/ASSET-NOTES.md).
