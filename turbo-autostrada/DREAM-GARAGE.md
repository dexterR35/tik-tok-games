# Dream Garage LIVE — TikTok game

**DREAM-GARAGE.bat** launches the game in a dedicated portrait app window. The main screen is the 9:16 LIVE game, with no parts menus or website navigation.

Use Window Capture in TikTok LIVE Studio, or use `http://127.0.0.1:3210/?source=1` as an OBS browser source at **1080 × 1920**. The source URL hides all mouse-revealed host buttons. Press **F** for fullscreen in the app window.

## Actual game loop

1. **Build / 35 seconds:** workshop income and viewer gifts fund real upgrades. A part delivery animates onto the screen and installs on the 3D car automatically. No host shopping clicks are needed.
2. **Travel / 4 seconds:** the game shows the 3D district and heads for Dockside.
3. **Head-to-head race:** two cars run a full-throttle 400 m race. The rival alternates between 5% faster and 5% slower than your unboosted pace. Its pace is set at the start; audience boosts only accelerate your car. Live speeds, gear, progress, and the distance gap update throughout the race.
4. **Results / 7 seconds:** show both finishing times, the winner, finish speed, and workshop reward. Then return to the garage for the next round.
5. Once every category has an upgrade, the community funds the next project car. Its predecessor is saved with its contributors in the collection.

The game uses 13 component categories and the original Blender models and part assets. Supporting-part requirements, traction, power, heat, engine condition, and automatic servicing affect the build and test.

## Viewer actions

- **Gifts:** add fictional workshop credits, charge boost, and show the sender on the game. During a race, gifts also give an immediate speed burst and temporary extra power; larger gifts give stronger bursts. Gift-funded parts install automatically during the build phase.
- **Likes / taps:** immediately increase your car's speed during a race, add temporary power, and recharge community nitrous. Boost stacking is capped. Outside a race, taps charge the next race's boost meter.
- **Chat 1 / 2 / 3:** vote for Street, Track, or Show priorities. Each chatter has one current vote per build phase.
- **Chat color names:** red, orange, blue, green, white, black, or purple repaint the community car.
- **Follows:** add 100 workshop credits and 10 boost charge.
- **Chat `hood` / `rev`:** open or close the bonnet and rev the engine in the garage. Clicking the bonnet or car does the same locally; drag to orbit.

Progress continues without gifts: the workshop generates 40 credits per second during building. Races pay 400 credits plus 200 for a win. All amounts are fictional game credits, not TikTok Coins or cash.

## How the car and the duel are calculated (2026-11-16)

All of this is covered by `tests/physics.test.mjs` (`npm run test:garage`).

- **Engine and gearbox.** The engine has a torque curve; power is torque × rpm and peaks at about 82% of the redline. The car has 5 or 6 gears (transmission upgrades add a gear and cut the shift time from 0.26 s to 0.07 s). Gearing never creates power: it only decides where on the curve the engine works and when it has to shift. A test checks that the car never gains kinetic energy faster than the engine can deliver it.
- **Traction.** Rear-wheel drive with weight transfer: `F_max = (m·g + downforce) · μ·rear / (1 − μ·h/L)`. The mid-engine Vanta launches hardest, the nose-heavy Atlas has the most power and the least traction. Stability (suspension, body kit, a little camber) lets the car use more of that limit.
- **Setup is a real choice.** Short final drive wins when the build has grip to spare, long final drive when it has power to spare. Camber has a sweet spot around 1–2°. Boost adds power, heat and wear.
- **Heat.** Temperature follows engine load and is carried away by the radiator and by airflow at speed. A stock car never overheats. The hottest legal build (stage 3 turbo at 1.2× boost) loses power above 112 °C unless it has full cooling.
- **Upgrades never hurt.** Every part, at every level, on every car, in both events, is checked to never make the car slower.
- **Frame rate does not matter.** The run is integrated in fixed 10 ms steps, so a slow computer and a fast one get the same time.
- **Audience help is linear.** A like or a coin adds a fixed amount of kinetic energy. 100 likes in one TikTok message are worth exactly the same as 100 single likes, and thirty 1-coin gifts the same as one 30-coin gift. Energy that does not fit under the speed envelope waits in a small bank instead of being lost.
- **Same effect on every car.** The energy is scaled with the car's power-to-weight, so the same likes move a starter car and a finished build by the same share of the race. About 2 likes a second, or one 30-coin gift, is what turns a loss against the +5% rival into a win.
- **The build never stalls.** When a car is finished (every part at level 3) the crew moves to the next owned car that still has work to do.
- **Graphics.** The race runs on a night road with street lamps, a city skyline moving in parallax, speed streaks and a finish gantry; both cars stay in frame. Lights glow (bloom). On a slow computer the glow turns itself off; `?fx=0` forces it off and `?fx=1` keeps it on.
- **Safety.** The save is written with a backup copy (`garage-live.json.bak`), restored automatically if the main file is damaged, and written on exit.

## Host controls and LIVE integration

Press **H** in the game for `host.html`, the separate control panel. Keep it off the broadcast. It has simulated gift buttons, test taps, chat votes, pause/resume, next phase, an immediate **START DUEL** button, and a choice of alternating, easier (−5%), or harder (+5%) rivals. Difficulty changes apply to the next race.

To use real events, start the existing TURBOSTRADA TikTok server with the intended LIVE account, then select its port in Host controls and click **CONNECT EVENT SERVER**. Dream Garage reads that server's normalized gifts, likes, chat, and follows. It does not send chat messages or connect to TikTok independently.

Positive incremental gift metadata units award 50 fictional workshop credits each. The existing server handles streak deltas; zero-value final notifications do not award credits again. A mock event server verifies the transport path and batches. **An actual TikTok LIVE account session has not been verified in this task.** The game displays DEMO until the event server reports a real LIVE connection.

Keys: **Space** tap to accelerate / rev in garage, **R** start duel now, **H** host panel, **P** pause/resume, **N** next phase, **G** simulated Toolbox, **T** simulated taps, **1/2/3** test vote, **S** sound, **F** fullscreen. The on-screen **TAP TAP** button simulates one local tap; viewers tap in TikTok through the event bridge.

## Persistence and capture windows

The server stores the LIVE game separately in `data/garage-live.json`; the server is authoritative and capture windows cannot overwrite its state. The earlier workshop sandbox and its save remain available at `workshop.html` and are separate from the LIVE game.

One authoritative simulation runs in the local Node game server. Every app or capture window renders that same game state. Races, timers, gifts, and saves keep running when a window is hidden behind LIVE Studio. Opening OBS or another game window does not double-count gifts. The game restarts with the saved build and a fresh build phase when the server restarts.

The server listens only on this computer. Chrome, Node.js, and the installed project dependencies are required; Blender is only needed to edit/regenerate the assets. Closing the server stops the LIVE connection. The dedicated game window can be closed normally.

## Development and assets

Run `npm run test:garage`. Checks cover economy, save migration, parts, physics, servicing, gift streak deltas, votes, automatic purchases, car collection, capture mirroring, host controls, and a mocked TikTok bridge. Duel checks cover exact ±5% rival pace, baseline wins/losses, taps overturning a loss, gift strength, capped boosts, and paused input.

Original Blender source, GLBs, part thumbnails, generated artwork, and the exact image-generation prompt are in `public/garage/assets`; see `ASSET-NOTES.md`. Advanced sandbox notes are preserved in `DREAM-GARAGE-WORKSHOP.md`.
