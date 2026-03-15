# Aura — Local P2P File Transfer

> **100% Free • Offline-First • Zero Cloud • Pure Privacy**

Aura is a peer-to-peer file transfer utility that sends files directly between devices on your local network. No cloud servers. No subscriptions. No data leaves your network.

---

## Features

- **Peer-to-Peer Transfer**: Files move directly from one device's RAM to another using WebRTC Data Channels
- **Offline-First PWA**: Works completely offline after the first load — all assets cached by Service Worker
- **Bluetooth Discovery**: Find nearby devices using Web Bluetooth API (Chrome/Edge)
- **LAN Auto-Discovery**: Devices on the same network are automatically discovered  
- **Zero Cloud Architecture**: No STUN/TURN servers, no external dependencies — ICE candidates are local-only
- **Privacy Badge**: Clear "LOCAL ONLY" indicator ensures users know their data stays private
- **Modern Dark UI**: Premium dark theme with glassmorphism, micro-animations, and Inter typography
- **Cross-Platform**: Works on any device with a modern browser

## Architecture

```
.
├── index.html                  # Main application page
├── manifest.json               # PWA manifest
├── src/
│   ├── core/
│   │   ├── events.js                    # Event bus (pub/sub)
│   │   ├── aura-connection-manager.js   # WebSocket signaling
│   │   ├── p2p-transfer.js              # WebRTC P2P engine
│   │   ├── file-chunker.js              # File splitting
│   │   ├── file-digester.js             # File reassembly
│   │   └── bluetooth-discovery.js       # Web Bluetooth API
│   ├── ui/
│   │   ├── components.js               # UI components & bootstrap
│   │   ├── clipboard.js                # Clipboard polyfill
│   │   └── styles.css                  # Dark theme CSS
│   └── service-worker/
│       └── sw.js                       # Offline caching
├── server/
│   ├── index.js                # Local signaling server (Node.js)
│   └── package.json
├── images/                     # App icons
├── sounds/                     # Notification sounds
└── docker-compose.yml          # Docker deployment
```

## Quick Start

### 1. Start the signaling server
```bash
cd server
npm install
npm start
```

### 2. Serve the frontend
```bash
# Using any static file server, e.g.:
npx serve .
```

### 3. Open on multiple devices
Navigate to the server URL from multiple devices on the same network. Devices auto-discover each other.

### Docker
```bash
docker-compose up
```

## How It Works

1. **Discovery**: Devices connect to a local WebSocket signaling server
2. **Handshake**: WebRTC session descriptions are exchanged via signaling
3. **Direct Transfer**: Files stream directly peer-to-peer over WebRTC Data Channels
4. **Bluetooth Fallback**: Optional Bluetooth discovery for offline pairing

## Privacy

- No data leaves your local network — ever
- No external STUN/TURN servers
- No analytics, tracking, or telemetry
- No accounts or sign-ups required
- The signaling server runs on YOUR network

## License

MIT License
