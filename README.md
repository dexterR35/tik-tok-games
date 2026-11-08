# tik-tok-games

A browser arcade for TikTok LIVE with an avatar printer and eight multiplayer games.

## Play locally

Open `dist/index.html` in Edge or Chrome. Choose **Dragon Raid** or any other game and select **Start demo**. The demo sends taps and gifts automatically. Use **Tap ×10** and **Gift** to add your own. In **Print**, select **Send test gift** to try the portrait queue.

If your browser restricts the local connection when opening the file directly, run this from the repository folder and open [the arcade on localhost](http://127.0.0.1:8765/).

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

## Play on TikTok LIVE

1. Connect [TikFinity Desktop](https://tikfinity.zerody.one/tiktok/obsoverlays) to your LIVE on the same computer as the arcade.
2. In the arcade, select **Connect TikFinity**. Once it shows **Connected**, select a game and choose **Start LIVE round**. The Print workshop accepts eligible gifts while its tab is open.
3. Viewers can type `!join`, tap the LIVE, or send a gift. In **Color Duel**, type `!red` or `!blue` before your first action to pick a team.
4. Use **Stream mode** for OBS or TikTok LIVE Studio capture. Press **Esc** to return to the controls. Switching games ends the active round and keeps its result until the next round in that game.

## Raid countdown and Hero

**Boss Raid** and **Dragon Raid** lock their difficulty at the start of each round. Leave **Raid viewer estimate** on Auto to use the latest TikFinity viewer count. Enter a number to size the raid for the people you expect to play. Auto uses one viewer if the LIVE count is unavailable and four in demo mode.

- Enemy HP and dragon armor scale by the square root of the viewer estimate, rounded to whole points. Scaling uses up to 100 viewers.
- The countdown starts at 60 seconds and drops by about five seconds each time the viewer count doubles, with a 35-second minimum.
- One tap deals one damage. Dragon damage breaks armor before reducing HP. Gifts deal bonus damage. The final result names the highest-damage player as **Hero**, with leaderboard order breaking ties.

| Viewers used | Countdown | Boss HP | Dragon HP | Dragon armor |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 60 s | 240 | 260 | 90 |
| 4 | 50 s | 480 | 520 | 180 |
| 16 | 40 s | 960 | 1,040 | 360 |
| 32 | 35 s | 1,358 | 1,471 | 509 |

The arcade queues viewer actions in arrival order and processes them in batches. A like packet can represent several taps, with up to 500 counted per packet. Each action retains its viewer and arrival time, so taps received before the deadline can still score while the queue drains. Repeated event IDs are filtered when available. Actions stop scoring when the round ends.

## Games

| Game | Goal |
| --- | --- |
| Print | Eligible gifts queue portraits. Set the minimum diamond value in **Gifts**. Completed gift streaks count as one portrait. Initials are drawn when a profile image is unavailable. |
| Turbo Sprint | Tap to race to 1,000 m in 30 seconds. Gifts trigger turbo. |
| LIVE Tower | Build 24 blocks in 35 seconds. Every 10 team taps add a block. Gifts add 2 to 4. |
| Boss Raid | Defeat the robot before time runs out. Gifts deal 18, 30, or 42 damage. |
| Dragon Raid | Break the dragon's armor, then defeat it. Gifts deal up to 76 damage. |
| Meteor Shield | Protect the base through seven impacts, one every five seconds. Taps charge the shield and gifts repair the base. |
| Color Duel | Build a 120-point lead or lead at the end of 35 seconds. |
| LIVE Vault | Open three locks in 35 seconds. Each lock takes 55 tap points. Gifts add at least 55 points. |
| Orbital Rescue | Fuel the shuttle, rescue three pods, and reach the end of the route in 40 seconds. Gifts refuel and boost the shuttle. |
