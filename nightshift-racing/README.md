# NIGHTSHIFT — Live Street Racing

A 9:16 community racing game for TikTok LIVE. One crowd-powered car races three automatic rivals. Four distinct detailed models are included: Ferrari 458, Porsche 911 GT3, Lamborghini Aventador SVJ and Bugatti Chiron Profilée. All retain matte finishes, with no bloom, light halos or wet-road glare.

## Start on Windows

Double-click **START-NIGHTSHIFT.bat**. Keep its terminal open while playing. The browser opens after the server is ready.

Node.js 22 or newer is required. The launcher installs missing dependencies. The local game and LIVE bridge run at **http://127.0.0.1:3316**.

Alternatively:

```powershell
npm install
npm run build
npm start
```

The hosted version is a playable demo. TikTok connectivity needs the local launcher; static hosting does not run the Node.js bridge.

## Racing

- A three-second launch countdown, then a **30-second race by default**. Choose **60-second Endurance** in settings for a longer battle.
- **Hard** and **Relentless** rival difficulty. Rivals accelerate to close a lead, respond to crowd momentum, and push again during the final seven seconds. They never teleport or change the finishing order after the race.
- Cars accelerate, shift gears and steer automatically. Each manual tap adds **1.5 km/h** of crowd power, up to **+140 km/h**. Power gradually decays while active. After 0.9 seconds with no taps, it drops quickly: keep the audience engaged.
- About five continuous manual taps per second can win either duration and difficulty without gifts. Stopping early lets the bots recover. A fully upgraded car still needs audience help to beat the lead rival.
- The timer follows elapsed wall-clock time. Slow rendering or a background tab cannot stretch a race indefinitely. At zero the result is locked and points are awarded once.
- The results screen lasts seven seconds, then the next race starts automatically. Disable automatic races in settings to hold the result.

## Garage and points

| Car | Unlock | Base speed bonus |
| --- | --- | --- |
| Ferrari 458 Italia | Starter | — |
| Porsche 911 GT3 | 750 points | +8 km/h |
| Lamborghini Aventador SVJ | 2,000 points | +15 km/h |
| Bugatti Chiron Profilée | 5,000 points | +23 km/h |

Every car uses a different GLB file and geometry. The garage thumbnails are rendered from the actual 3D assets. Click a locked car without enough points to inspect it. Buy and equip cars with points; selections during a race apply to the next race. Existing earned points and purchased garage slots are preserved from the earlier game.

Finishing awards are 400 / 220 / 130 / 70 points, plus up to 150 for effective taps and up to 250 for gifts. Upgrades spend points. Progress stays in browser local storage, separately for local and hosted origins.

## Gifts

| Coin value per gift | Game tier | Additional speed | Duration |
| --- | --- | --- | --- |
| 1–9 | Rose | +24 km/h | 3 seconds |
| 10–99 | Energy | +50 km/h | 5 seconds |
| 100–999 | Galaxy | +92 km/h | 7 seconds |
| 1,000+ | Beast Mode | +155 km/h | 9 seconds |

Repeated gifts refresh and strengthen their tier, with bounded power and duration. Combined boost speed is capped at +210 km/h. A countdown gift is held until the start. Gift names in the game describe tiers; actual LIVE gifts map by their coin value. Test buttons are free simulations and never send real gifts. Streak messages award only newly received gifts, ignoring the duplicated final message.

## 1k / 2k / 10k audiences

Race Control includes **Auto**, **Solo**, **1,000**, **2,000** and **10,000** audience settings. Auto uses TikTok's reported viewer count. Audience size scales LIVE likes so a large audience cannot instantly produce unbounded speed. Manual test taps stay unscaled.

The LIVE divisor is `max(1, viewers × 0.03)`. At 1,000 / 2,000 / 10,000 viewers, about 150 / 300 / 1,500 likes a second gives the equivalent of five manual taps a second. Raw likes are preserved in race/session totals; only acceleration is scaled. The **SIMULATE CROWD** button supplies this sample participation rate for the chosen audience. It is clearly labelled and separate from a connected LIVE session.

The local bridge aggregates likes and gifts every 100 ms. Each network tick contains at most one like event and four gift tiers. It does not create a car or DOM element per viewer. Gift deduplication history is time-limited and size-limited; slow stream consumers are disconnected before their send buffers grow indefinitely.

Automated checks simulate 1k, 2k and 10k crowds at five likes/second/person, including **1.5 million likes during a 30-second 10k-viewer race**, and a 10k-person gift burst. The SSE bridge also verifies a 50,000-like burst without loss. These are local synthetic tests; real TikTok connectivity and capacity with a live 10k audience remain unverified.

## Connect TikTok LIVE

1. Start the local launcher and go LIVE on TikTok.
2. Enter your TikTok username in Race Control and press the arrow.
3. Check for **TIKTOK LIVE** before broadcasting the game.

The connector is unofficial and can be affected by TikTok or its signing service. If your connector service requires it, set the **TIKTOK_SIGN_API_KEY** environment variable before starting. Do not enter passwords into the username field. The bridge listens only on 127.0.0.1.

## Broadcast and controls

Use **BROADCAST VIEW**, or **http://127.0.0.1:3316/?broadcast=1**, for the portrait-only game. Capture at 1080 × 1920 in OBS / TikTok LIVE Studio if local browser sources are supported; otherwise use window capture and crop to the game.

- **Space** or the acceleration button: one tap. Holding Space does not auto-repeat.
- **1 / 2 / 3 / 4:** simulate the four gift tiers.
- **C:** change camera; cameras also change automatically.
- **M:** toggle engine sound (muted by default).
- **Escape:** leave broadcast view.

## Build and verification

```powershell
npm test
npm run build
```

All models, fonts, graphics modules, Meshopt and Draco decoders are bundled locally. Performance mode reduces resolution and disables dynamic shadows. See **dist/credits.html** and **dist/assets/model-attributions.json** for model authors, licenses, changes and source links.
