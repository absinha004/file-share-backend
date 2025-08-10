# file-share-backend
Backend for file transfer applications

# file-sharing-backend (signaling server)

## Local dev
1. clone repo
2. npm install
3. npm run dev
4. server runs at http://localhost:5000

## API
GET /create-room -> { roomId }
Socket events:
- client -> server:
  - join: { roomId }
  - signal: { to: <socketId>, data: { type, sdp?, candidate? } }

- server -> client:
  - joined: { roomId, peers: [socketId] }
  - peer-joined: { socketId }
  - peer-left: { socketId }
  - signal: { from: socketId, data: {...} }
  - room-full: { roomId }

## Notes
- In-memory rooms (no DB). Rooms reset when server restarts.
- CORS currently permits any origin (change in prod).
