# UNO Together

A responsive real-time multiplayer UNO-style web game with private rooms, invite codes, live turns, chat, and cumulative scoring.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder run:
   ```bash
   npm install
   npm start
   ```
3. Open http://localhost:3000 in multiple browser windows/devices on the same network (for other devices, use the computer's LAN IP and allow the port through the firewall).

## Deploy publicly (Render)

1. Create a GitHub repository and upload the contents of this folder.
2. In Render, choose **New > Web Service** and connect the repository.
3. Set **Build Command** to `npm install` and **Start Command** to `npm start`.
4. Deploy. Share the resulting HTTPS URL with friends; create a room and share its six-character code.

The service uses WebSockets (Socket.IO). Choose a host that supports persistent WebSocket connections. The included implementation stores rooms in server memory, so rooms reset when the server restarts or redeploys. For a larger/production launch, add Redis-backed Socket.IO scaling and persistent storage.

## Rules / current implementation

- 2–10 players, 7 cards each.
- Match by color or value; wild cards choose the active color.
- Skip, Reverse, Draw Two, Wild, and Wild Draw Four.
- Draw one card (or the pending penalty) to end your turn.
- UNO button records that you called UNO; the game also includes a brief catch window for a missed call.
- Round winner receives the total value of opponents' remaining cards. First player to 300 points wins the game.
- Host can start the game and start another round.

This is an original UNO-inspired implementation for casual play, not an official Mattel product. The project is not affiliated with or endorsed by Mattel.
