# Autodrive Live

An autonomous open-city driving game for a 9:16 TikTok LIVE broadcast, built with Three.js and a local Node.js bridge. Version 2 uses an original matte Atlas S4, varied original traffic models, a detailed district map and interpolated motion.

## Start on Windows

Double-click `START-AUTODRIVE.bat` (the previous launcher also works), or run:

```powershell
cd C:\Users\Dexter\Desktop\projects\tiktok\nightdrive-live
npm install
npm start
```

- Control room: http://localhost:4316
- Clean portrait game: http://localhost:4316/?capture=1
- Local MCP endpoint: http://localhost:4316/mcp

In OBS, create a Browser Source using the portrait URL, width **1080**, height **1920**, and 60 FPS if the computer supports it. Keep the server running. The control room can stay open in another window. Each game view currently runs its own deterministic simulation from page load; do not reload the broadcast source during a stream. Likes, boosts, mode, and route preference are shared through the server. The first connected game view supplies MCP telemetry; `telemetryAgeMs` identifies stale readings.

## Controls and interactions

- **Safe drive:** lower target speeds and longer following distances.
- **Fast lane:** faster cruise and more assertive safe-gap overtakes.
- **Hardcore:** highest target speeds and tighter headway, with the same collision and red-light constraints.
- **Explore / Highway / City:** replans beyond the current visible section. The chosen road type begins after approximately 500–800 m; nearby traffic and the current road remain continuous. Turns are selected randomly from valid north/east/west grid connections, without U-turns or self-intersections. The city is fictional, not GPS data.
- **Tap tap:** test 10 likes. Every 100 likes grants five seconds of boost.
- **Rose / Turbo:** test five- and fifteen-second boosts. These buttons simulate events; they do not purchase or send TikTok gifts.
- **Space:** test a turbo boost. **C** or double-click the game: switch camera height.
- **M** or click the minimap: open the world map. Its +/− controls zoom the map; **Escape** closes it. Districts, canal cells, traffic signals, current location and the planned route use the same world coordinates as the 3D scene.
- Optional synthesized engine audio is off until enabled.

Boost time stacks up to 60 seconds. Boosts raise desired speed; they do not override obstacle braking, turn speed limits, red lights, or available lane gaps. Test buttons remain available while LIVE is connected and contribute to the session counters.

## TikTok LIVE

Enter the creator's username in the control room while that account is LIVE. The bridge receives likes, gifts, and viewer counts through the unofficial `tiktok-live-connector`. Cumulative gift streaks are counted once on completion, with bounded deduplication. Gifts grant 5–30 seconds based on gift metadata, not a cash-value claim. No viewer totals or gift activity are fabricated in demo mode.

A real account connection has **not** been verified in this prototype. TikTok changes or a signing-service requirement can prevent connection; failures appear in the control room. If your connector provider requires a signing key, supply `TIKTOK_SIGN_API_KEY` in the server environment. No session cookies are collected. See the [connector documentation](https://ttlc.docs.isaackogan.com/configuration/options/).

## Autonomous driving

The driver uses SI units and a fixed 60 Hz timestep. Longitudinal movement uses an Intelligent Driver Model style acceleration controller with time headway, relative velocity, comfortable braking and an independent stopping-distance envelope. Adjacent lanes are evaluated against front and rear gaps; the lateral transition uses a quintic interpolation with zero endpoint velocity and acceleration. Corners use quintic Bezier curves with zero curvature at their straight-road joins and sufficient radius to keep the offset lanes moving forward. Arc-length samples are reconstructed with continuous Hermite tangents. Lookahead curvature limits corner speed before the turn. Red signals act as stationary leaders. A final bumper-gap clamp protects the modeled lane corridors when the preceding car brakes suddenly. Cross traffic traverses city junctions only during the red phase and clears before green.

The speedometer and odometer account for the offset lane's arc length and lateral travel. Lane-change progress follows forward speed, so stopping for traffic also pauses sideways motion. The renderer interpolates the previous and current physics state independently of screen refresh rate. The chase camera damps both position and orientation. Its field of view stays fixed. Normal requestAnimationFrame scheduling is primary; a dedicated timer worker recovers rendering if Chromium throttles an occluded embedded preview while its document is still visible. Recovery remains active until animation callbacks have been stable for twelve frames. The FPS counter measures rendered frame calls, including recovery calls; screen presentation and OBS capture can impose their own limits. Background documents pause deliberately.

The world streams a bounded 5×5 set of city blocks, prunes old route samples, and uses a floating render origin. Block plans are generated in a worker and committed one per frame. Instanced traffic and city geometry reduce draw submissions. Road runs end at junction boundaries, eliminating overlapping asphalt surfaces. Directional shadow coverage is aligned to a fixed world texel grid; cars use contact shadows. Bloom, clearcoat and reflective environment lighting are absent.

The fictional districts are **Riverside**, **Old Quarter**, **Central Heights**, and **East Works**. Their architecture includes textured masonry, pilasters, balconies, shopfronts, service alleys, rooftop equipment, stepped towers, warehouses, parks and canal bridges. The original vehicles are smooth lofted bodies with window pillars, mirrors, grilles, door details, squared lamps and modeled wheels. This remains a procedural browser game with simplified vehicle dynamics. The map is fictional, and passing the modeled safety checks is not a proof covering every possible traffic scenario.

### Game modules

| Module | Responsibility |
| --- | --- |
| `simulation.js` | Lane planning, route curves, traffic, lights, acceleration and safety constraints |
| `motion.js` | Fixed physics clock and frame interpolation |
| `frame-pump.js` | Browser frame scheduling and occlusion recovery |
| `world.js` | WebGL rendering, camera, traffic transforms, stable lighting |
| `vehicles.js` | Original matte vehicle geometry and instancing templates |
| `city-plan.js` / `city-worker.js` | Deterministic district generation off the render thread |
| `city.js` | Materials, textures and streamed GPU instances |
| `navigation.js` | Minimap and zoomable world map |

The optional `/?qa=turn` URL starts a local visual check before the first city bend with traffic spawning disabled. Normal studio and broadcast URLs use the full game. Render telemetry includes FPS, frame time, draw calls, geometry counts and render CPU time; this is diagnostic data, not a guarantee for every machine or capture setup.

## MCP

Stateless HTTP MCP, protocol `2025-03-26`, JSON responses at `http://localhost:4316/mcp`. Supports initialization, notifications, `ping`, `tools/list` and `tools/call`:

| Tool | Arguments |
| --- | --- |
| `get_drive_state` | `{}` |
| `set_drive_mode` | `{"mode":"safe"}`, `"fast"`, or `"hardcore"` |
| `set_drive_route` | `{"route":"mixed"}`, `"highway"`, or `"city"` |
| `trigger_boost` | `{"seconds":15}`; range 1–30 |

This endpoint is available for you to add to an MCP client; no global client settings are changed. The bridge binds to loopback and validates browser origins. It is intended for local broadcasting, not public hosting.

## Verification

```powershell
npm test
```

Ten tests cover 50 km of route sampling/pruning, ten simulated minutes per driving mode with repeated boosts and both lane-distance and world-space oriented-body collision checks, continuous turn headings, forward motion through offset corners, consistent physics at 30/60/144 Hz, non-overlapping road slabs, red-light braking, gift streak deduplication, boost timers, HTTP modules, WebSocket events, MCP controls and origin rejection.

Original asset details: [public/assets/CREDITS.md](public/assets/CREDITS.md). Interface fonts use Google Fonts with system fallbacks; game geometry and textures are local. The retired imported car and its attribution are archived in `artifacts/` and are not served by the game.
