# Aura — Frequently Asked Questions

### What is Aura?
Aura is a 100% free, offline-first, peer-to-peer file transfer utility. It enables direct device-to-device file sharing on your local network with zero cloud involvement.

### How does the transfer work?
Aura uses WebRTC Data Channels for direct peer-to-peer file transfer. Files move directly from one device's RAM to the other's — no intermediary server ever touches your data.

### Is it really offline?
Yes. After loading Aura once, the Service Worker caches all application assets. The app continues to function with zero internet connection. Transfers happen entirely on your local network.

### What about privacy?
- No files are ever uploaded to any cloud server
- No external STUN/TURN servers are used
- No analytics, tracking, or telemetry
- No accounts or sign-ups
- The signaling server runs on YOUR local network

### What is the Bluetooth feature?
Aura can use the Web Bluetooth API (available in Chrome and Edge) to discover nearby devices. This is useful for the initial handshake when devices aren't on the same WiFi network. Once paired, high-speed transfers proceed over LAN.

### How do devices discover each other?
Devices connect to a lightweight WebSocket signaling server running on your local network. The server groups devices by IP subnet — only devices on the same network can see each other.

### Is there a file size limit?
No. WebRTC Data Channels can handle files of any size. The transfer is chunked into 64KB pieces with partition-based flow control for reliability.

### What browsers are supported?
Aura works on all modern browsers with WebRTC support:
- Chrome / Chromium / Edge / Brave
- Firefox
- Safari (14+)
- Opera

Web Bluetooth (for device scanning) is currently available in Chrome, Edge, and Opera only.

### Can I self-host Aura?
Yes! Just run the Node.js signaling server on any machine on your network and serve the frontend files with any static file server or use the included Docker setup.

[← Back](/README.md)
