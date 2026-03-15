<div align="center">
  <img src="images/aura-logo.png" alt="Aura Logo" width="120" />
  <h1>AURA</h1>
  <p><strong>High-Performance P2P File Transfer &middot; Engineering Futurist UI</strong></p>
  <p>Local-First. Zero Cloud. Pure Privacy.</p>
</div>

---

## Overview

**Aura** is a premium, offline-first peer-to-peer file transfer utility engineered for maximum throughput and reliability. It bypasses cloud servers completely, utilizing WebRTC Data Channels and local signaling to transfer files directly between devices on your local network or securely across the internet.

Designed with an **"Engineering Futurist"** philosophy, Aura combines the utilitarian precision of an IDE with the sleek aesthetics of a modern automotive dashboard. The result is a highly polished, glassmorphic interface that looks and feels like a specialized engineering tool.

## Core Features

### 🚀 Mega-File Transfer Architecture (5GB+ Optimized)
Aura is custom-built to handle massive files without crashing your browser tab.
- **Zero-RAM Streaming Downloads**: Integrated with the **Service Worker Streams API**, incoming 50MB+ files bypass main memory entirely, piping directly to your disk via a virtual download URL.
- **ReadableStream Slicing**: On the sender side, files are ingested using the `File System Access API` (`file.stream()`), efficiently extracting 64KB chunks on the fly with zero-copy.
- **16MB Backpressure Control**: Implements `bufferedAmountLow` event-driven flow control. If the WebRTC send buffer exceeds 16MB, Aura intelligently pauses the stream and waits for the network to drain, eliminating congestion collapse.
- **SCTP Overhead Reduction**: Custom SDP patching negotiates the `max-message-size` up to 256KB, slashing SCTP framing overhead by up to 4× on large transfers.

### 🛡️ Pure Privacy & Reliability
- **True P2P**: Files stream from device to device. Your data never touches a 3rd-party database.
- **Mobile Wake Lock API**: Actively prevents iOS and Android devices from sleeping or throttling the CPU during background uploads.
- **NAT Traversal**: Integrated Google STUN servers ensure reliable connections across different networks (e.g., Phone on Cellular ↔ Laptop on Wi-Fi).
- **Offline PWA**: Fully functional offline web application powered by a robust caching Service Worker.

### 🌌 "Midnight Engineering" Interface
- **Glassmorphic Node Cards**: Frosted-glass UI elements representing network peers.
- **Circuit Board Animation**: A subtle, hardware-accelerated CSS/Canvas background featuring glowing data-flow traces.
- **Data Pulse Rings**: Minimalist, high-performance CSS `@keyframes` animations tracking peer discovery.
- **Fluid Reponsiveness**: Flexbox and CSS Grid layouts adapting seamlessly from 5" phones to 27" monitors.

## Technical Implementation & Optimizations

Aura has been heavily optimized for cloud-like reliability in a purely P2P environment, addressing common WebRTC limitations.

### 1. Robust Connectivity & NAT Traversal
- **Problem**: Direct connections (e.g., Phone ↔ Laptop) often fail due to strict carrier NATs or subnet firewalls.
- **Fix (`p2p-transfer.js`)**: Integrated Google STUN servers (`stun.l.google.com:19302`) into the `RTCPeer.config` enabling aggressive ICE gathering and NAT hole-punching.
- **Wake Lock API**: Added `navigator.wakeLock.request('screen')` during active transfers to prevent mobile operating systems from sleeping or throttling the CPU, heavily improving mobile upload reliability.
- **ICE Restart**: Implemented automatic `restartIce()` execution upon gathering failure.

### 2. Eliminating Congestion Collapse (10MB+ Transfers)
- **Problem**: Indiscriminately blasting chunks into the WebRTC `DataChannel` floods the local send buffer (`bufferedAmount`), causing massive memory spikes and grinding transfer speeds to a halt for large files.
- **Dynamic Chunking (`file-chunker.js`)**: Intelligently scales chunk sizing based on file weight. Small files use 16KB blocks (ultra-safe for mobile memory), while larger media files utilize 64KB - 256KB for maximum bandwidth saturation.
- **Flow Control via `bufferedAmountLow`**: Heavy implementation of WebRTC backpressure. When `_channel.bufferedAmount` breaches 16MB, Aura ceases sending and yields. Transmission seamlessly resumes only when the browser fires the event-driven `onbufferedamountlow` trigger. Zero artificial `setTimeout` delays.

### 3. Server-Side Infrastructure & Cloud Deployment
- **Frontend Hosting (GitHub Pages)**: The UI and frontend are entirely static and hosted on GitHub Pages. This operates as an offline-first PWA that deeply caches all assets into the user's browser instantly via Service Workers.
- **Signaling Backend (Render)**: The minimal Node.js WebSocket backend — used exclusively for initial IP discovery and WebRTC handshakes (NOT for data transfer) — is deployed on Render's cloud platform.
- **Problem**: Vanilla local servers running raw WebSockets cannot accept cross-origin connections from platforms like GitHub Pages, causing handshake blocks.
- **Fix (`server/index.js`)**: The WebSocket server is now wrapped within a native Node.js HTTP framework. 
- **CORS Configured**: Hardcoded HTTP preflight headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials`) enabling seamless integration between the GitHub Pages frontend and Render backend.
- **WebSocket Heartbeat**: Engineered a `3000ms` ping-pong keep-alive loop to prevent cloud load-balancers (e.g., Render) from dropping idle WebSockets (the notorious '5s timeout' bug). 
- **Robust Cookies**: Cross-origin `peerid` cookies were upgraded with `SameSite=None; Secure; Path=/` to properly persist peer sessions securely.

### 4. Precision UI & UX Handlers
- **Ghost Hover Fix (`styles.css`)**: Eliminated a deceptive CSS bug that caused invisible UI elements to trigger "Success" notifications by enforcing rigorous `pointer-events: none;` on hidden states.
- **Notification Timing**: Eradicated premature "File Completed" flashes. The success toast is now strictly tied to the receiver broadcasting a definitive `transfer-complete` datagram *only after* local Blob assembly or Stream finalization is explicitly finished.
- **Format Agnostic**: Broadened the DOM File Picker bounds to explicitly accept all complex payload types (`*/*`), natively permitting heavy `.mkv`, `.mov`, and `.zip` payload selection.

## System Architecture

```text
.
├── index.html                   # Entry point: Status bar, UI Layout
├── manifest.json                # PWA manifest
├── service-worker.js            # Offline caching & Stream-to-Disk Downloads
├── src/
│   ├── core/
│   │   ├── events.js            # Lightweight Pub/Sub event bus
│   │   ├── aura-connection[...] # WebSocket signaling + Heartbeat
│   │   ├── p2p-transfer.js      # Core WebRTC engine (Backpressure/STUN)
│   │   ├── file-chunker.js      # ReadableStream file slicing
│   │   ├── file-digester.js     # Blob / SW Stream reassembly
│   │   └── bluetooth-disc[...]  # Web Bluetooth API fallback
│   └── ui/
│       ├── components.js        # Node Cards, Dialog UI Logic
│       ├── clipboard.js         # Fallback clipboard polyfill
│       └── styles.css           # "Midnight Engineering" Design System
├── server/
│   └── index.js                 # Network signaling hub (Node.js/WebSocket/CORS)
└── images/                      # PWA icons & branding
```

## Quick Start

### 1. Launch the Signaling Server (Local Hub)
*You can run the signaling server locally or deploy it to a platform like Render.*

```bash
cd server
npm install
npm start
```
*The local hub operates on port **3000** and includes full CORS support for GitHub Pages.*

### 2. Launch the Application
Serve the root directory using any static file server:

```bash
# E.g., using Python
python -m http.server 8000

# E.g., using npx
npx serve .
```

### 3. Connect Devices
1. Open the application URL (e.g., `http://<your-local-ip>:8000` or your GitHub Pages link) on multiple devices.
2. The UI will instantly display the unique "Aura Name" of the devices connected.
3. Devices will automatically negotiate a secure WebRTC connection.
4. **Click/Tap** a Node Card to transfer files.
5. **Right-click / Long-press** to send secure text messages.

---
