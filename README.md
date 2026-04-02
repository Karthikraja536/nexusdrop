# 🌌 NexusDrop

**NexusDrop** is a premium, cloud-free, Peer-to-Peer file sharing application forged with React, WebRTC, and Framer Motion. Heavily inspired by 2027-era Spatial Computing UI mechanics, it allows devices to stream raw binary data cleanly and directly to each other securely over the local network—strictly avoiding centralized cloud-storage dependencies.

## ✨ Core Features
- **Raw WebRTC Data Channels**: Files are mathematically chunked into exact 64KB ArrayBuffers and piped directly between peer nodes organically.
- **Unified Node/Express Rendering**: The Socket.io Signaling infrastructure reliably doubles as the single monolithic web host serving minified React components transparently.
- **Glassmorphic Spatial UI**: Orchestrated with a meticulously unified Design Token grid specifically imitating cutting-edge Frosted Glass layers from standard premium ecosystems.
- **Automated QR Shredder Engine**: Physical presence is heavily enforced using a custom, high-performance HTML5 `<canvas>` rendering algorithm. `requestAnimationFrame` fires at 60Hz to strategically delete bits of the Room Access QR array precisely until total decay hits at exactly 30 seconds consistently!
- **Local P2P WebRTC Chat**: Sub-second text messaging bypasses routing limits cleanly over direct connections.

## ⚙️ Architecture & Start Sequence

NexusDrop is intentionally packed as a fully assembled monolith.

### Initialization
```bash
git clone https://github.com/YourUsername/nexusdrop.git
cd nexusdrop/server
npm install
npm run start
```

*Note: The frontend is physically mapped securely to the `node` environment internally! You just effortlessly open `http://localhost:3001` natively in the desktop!*
