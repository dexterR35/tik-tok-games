# Prism Rush — TikTok LIVE match reactor

An original automated 3D match game in a 9:16 capture frame. Made with Three.js, JavaScript and a local Node.js session server. All pieces, lighting, powers, particles and animations are generated in code; Blender is optional for future custom models.

## Start

1. Install Node.js 22 or newer if it is not already available.
2. Double-click **START.bat**. It opens a portrait game window using Edge or Chrome. No npm install or build is needed.
3. Press **H** for host controls, or open **HOST-CONTROLS.bat** while the server is running.
4. Press **F** for fullscreen. **Space** pauses/resumes; **1–4** test the four powers; **T** adds 25 test taps.

You can also tap/click the gem board or the team charge meter. Each direct tap contributes one local test tap and immediately emits a small sparkle. Taps are batched every 120 ms before reaching the game. The desktop “Tap tap” test button adds 25 taps at once. Real TikTok taps still arrive through the relay.

The game: http://localhost:4328/ · Host: http://localhost:4328/host

For OBS or LIVE Studio, add the browser source `http://localhost:4328/?capture=1` at **1080 × 1920**, **60 FPS**. It displays only the portrait game. Capture the app window instead if your streaming application does not support browser sources. Keep the Node server running throughout the stream.

The wide browser layout includes test controls. On narrow screens the game occupies the available portrait frame; use H or the separate host panel for controls. Audio starts muted; the musical-note button enables synthesized sounds.

## Viewer participation

| Viewer action | Result |
| --- | --- |
| 100 team taps | A free smart move, credited to the viewer whose packet completes the meter. Excess taps carry over. |
| Rose | Smart move: compare every legal swap through complete seeded cascades, up to the 32-wave safety bound. |
| Finger Heart / GG | Meteor: compare all 56 board cells, then create and detonate the best 3 × 3 nova. |
| Heart | Prism: compare all 336 cell/color combinations, then detonate the strongest color-clear. A viewer color vote restricts the search to that color's 56 placements. |
| Galaxy | Supernova: double-prism board clear. |
| Chat a color name | Vote for the next prism target: red, orange, yellow, green, blue or purple. Each viewer has one replaceable vote. |

Gift names are configurable aliases, not price claims. An unmapped gift earns a smart move. A gift cannot make an impossible arrangement count as a match; meteor/prism/supernova explicitly create a power item. The best available smart move may be a 3-match when no stronger move exists.

An active viewer's name appears above the board, and all points in that action's cascades belong to that viewer. Idle time uses reactor autopilot. Demo names include “demo”; host tests show “TEST” above the board. Connecting a relay disables demo actions and clears simulated/test participants and their pending actions. Never connect this game to another game's real stream accidentally: select the intended relay/account in the host panel.

The capture HUD shows the number of choices scanned and predicted points. The desktop Cascade Scanner adds the number of legal moves that create a 4+ power, predicted waves/gems, and the latest viewer's actual result. These are counts and exact seeded forecasts, not claimed winning probabilities. Move utility is `forecast points + 480 × prisms created + 240 × novas created + 120 × beams created`; this rewards useful power creation as well as immediate points. No unplayed future turn is counted. Color votes are consumed when a prism starts; votes arriving during its animation remain for the next prism.

## Real TikTok connection

The local edition uses the relay already installed in the sibling `turbo-autostrada` project. Start that relay separately:

```powershell
cd C:\Users\Dexter\Desktop\projects\tiktok\turbo-autostrada
node server.js YOUR_TIKTOK_USERNAME
```

In Prism Rush host controls, enter its WebSocket URL, normally `ws://localhost:3000/ws` (use the relay's printed port), check the gift mappings, and select **Connect relay**. “Relay connected” and “TikTok LIVE” are separate states. A running relay does not prove the selected account is on air. No TikTok password is requested by this game.

This adapter accepts the existing relay's `{type:'batch',events:[...]}`, `status`, `like`, `gift` and `chat` packets. That relay reports gift-streak deltas in `coins`; `total / repeat` identifies the unit value. Zero-value final packets grant nothing. Repeated units are retained as queued actions and rotated fairly with other viewers' actions. This is not a direct adapter for arbitrary raw TikTok/TikFinity payloads.

The existing relay uses the [unofficial TikTok Live Connector](https://github.com/zerodytrash/TikTok-Live-Connector). Its ability to receive real events depends on TikTok and the relay configuration. An actual on-air account test remains necessary.

## Match mathematics

- Board: **7 columns × 8 rows**, six gem colors. Only orthogonally adjacent swaps are allowed. Invalid swaps do not alter the board or random generator.
- **3 in a row/column:** clear the matched cells.
- **4 in a line:** preserve one anchor and create a beam in that line's direction.
- **5 or more in a line:** create one prism. This takes priority over an intersecting match.
- **T/L/cross intersections:** merge overlapping runs and create one nova. Each cleared cell is counted once.
- **Beam:** clears its row or column. **Nova:** clears its clipped 3 × 3 area. **Prism:** clears the voted color, or the most common color if there are no votes. A prism swapped with a normal gem clears that gem's color.
- Two adjacent powers may be swapped without a color match. Beam combinations clear crosses, nova combinations use radius two, and double prisms clear the board. Hit powers chain once each. New power anchors survive their creation wave.
- After each wave, survivors retain their order within each column, fall into the lowest available cells, and new gems form a contiguous column immediately above the board. A single vacancy drops one new gem by one row. Refills use a seeded xorshift generator. Planning copies never consume the live generator.
- A stable board without legal moves is visibly reforged. Cascades have a safety bound of 32 waves before explicit stabilization. These recovery actions do not invent points.

Wave score: `60 × cleared cells × min(cascade index, 12) + 180 × activated powers + 240 × created powers`. Scores support millions and continue across rounds; safe-integer saturation prevents precision overflow.

## Champions, chests and long sessions

The default champion round is five minutes. The timer waits for an active cascade to settle before awarding the viewer with the most round points. Ties use viewer ID order. The champion receives a named in-game trophy, then the next round begins automatically. No cash, physical prize or random prize drawing is implemented.

Every 500 cleared gems unlocks a shared team chest. Lifetime score, chests, trophies, queued actions, board, seeded generator, active animation and current round save to `data/session.json` every five seconds and on graceful shutdown. The last eight champions are retained. Abrupt power loss may lose the most recent five seconds.

All local game windows, browser capture sources and host controls observe **one authoritative server session**. The browser renders between 20 Hz state snapshots; opening a second view does not duplicate actions. Disconnects retry every five seconds while the reactor continues locally. Pause preserves pending actions and phase timing, including elapsed time when resuming a saved drop.

Limits: 5,000 participants; 512 queued action groups; 14 recent internal log events; 640 particle slots; eight shockwave slots. Large repeated gift/tap charges coalesce into action units. Queue overflow is reported in the signal log. Under sustained overload the queue can become long; its current size is visible above the board.

## Hosted demo

The private hosted version is a standalone browser demo, clearly marked **HOSTED DEMO**. A module Web Worker runs the simulation and candidate searches separately from Three.js rendering. It saves to that browser's local storage; separate tabs run independent demo sessions. Real TikTok connection and shared host controls require the local server. The hosted version never tries to reach your computer's relay.

## Performance and validation

The renderer uses shared geometries/materials, instanced grid/shadows/particles/glows/streaks, fixed effect pools, no realtime shadow maps, no postprocessing, capped pixel ratio and automatic resolution reduction after sustained slow frames. Gem cuts have stronger bevel shading; explosions add colored shard bursts, sparks, localized glow, beam clears and prism rays. Meteors have a visible incoming comet. Reduced-motion settings suppress shake and bright secondary effects.

The shared motion model uses a **210 ms swap**, **240 ms burst**, and **265–420 ms distance-based drop including spring landing**, compared with the original 300/430/630 ms phases. The client caches effect lookups and advances its animation clock monotonically so network snapshots do not rewind an animation. [Three.js renderer documentation](https://threejs.org/docs/pages/WebGLRenderer) describes the underlying renderer controls. Actual FPS depends on GPU, capture resolution, browser throttling and other streaming software; 60 FPS is a target, not a guarantee.

`npm test` covers exact 3/4/5/T/L results, power combinations, gravity, 150 deterministic initial boards, 2,500 legal moves, a simulated four-hour run, persistence during animations, queues, tap attribution, streak deltas, round awards, HTTP/SSE shared state, command origin checks and delivery from a real mock WebSocket relay. New checks exhaustively compare candidate utilities, verify forecast points/gems/waves against actual play, exercise the worker message boundary, test refill entry positions, and ensure every drop has fully landed before the next logical wave. The four-hour test accelerates game time; it is not a four-hour GPU endurance measurement.

The original version's browser QA verified the 9:16 frame, named test powers, shared host pause, champion award/round rollover, clear console and 60 FPS at preview size. Visual verification of the 1.1 animation update was blocked because the computer-use safety layer could not confidently identify the Windows browser URL. Refresh the running game with Ctrl+R to load the updated renderer. This update's actual frame rate, a real TikTok session, and a 1080 × 1920 capture load still need testing with the user's streaming software.

`npm run build` copies the self-contained public assets into `dist/` for static hosting. Three.js 0.187.0 and the two fonts are bundled with their licenses. Gameplay requires no CDN, downloaded models or remote image assets.
