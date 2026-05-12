# Peer-to-Peer File Sharing Application

A premium, cloud-free, Peer-to-Peer file sharing application built with React, WebRTC, and Framer Motion. This project enables devices to stream raw binary data directly and securely to each other over the local network, strictly bypassing centralized cloud-storage dependencies. 

It features a high-end, glassmorphic UI design, fast network-based device discovery, and an optimized WebRTC file transfer engine.

## ✨ Core Features

- **Direct WebRTC Data Channels**: Files are mathematically chunked into precise ArrayBuffers and transmitted directly between peer nodes for maximum speed and security.
- **Real-Time Signaling Server**: Built on Node.js, Express, and Socket.io to manage instant room creation, peer discovery, and WebRTC handshakes seamlessly.
- **Glassmorphic Spatial UI**: A meticulously designed interface using Tailwind CSS and Framer Motion, featuring smooth animations, modern frosted glass aesthetics, and responsive bento-grid layouts.
- **Instant QR Connectivity**: Physical presence and room joining are streamlined via a custom HTML5 `<canvas>` QR code generation and scanning system for rapid mobile-to-desktop bridging.
- **Local P2P WebRTC Chat**: Includes a sub-second, direct text messaging system integrated directly over the established WebRTC connection.
- **Zero Cloud Storage**: Total privacy by design. Data never touches a remote server—only the WebRTC connection metadata is routed through the signaling backend.

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion, Zustand (State Management), React Router DOM.
- **Backend / Signaling**: Node.js, Express, Socket.io.
- **Core Networking**: Native WebRTC (RTCPeerConnection, RTCDataChannel).
- **Utilities**: JSZip (archiving), html5-qrcode / qrcode (joining mechanisms).

## ⚙️ Architecture & Local Setup

The project is structured as a full-stack monorepo with distinct client and server directories.

### 1. Start the Signaling Server
```bash
cd server
npm install
npm run dev
```
*The server will start on `http://localhost:3000` (or the configured PORT).*

### 2. Start the Client Application
Open a new terminal window:
```bash
cd client
npm install
npm run dev
```
*The React application will start on `http://localhost:3001`. Access it via `localhost` or your local network IP (e.g., `http://192.168.x.x:3001`) to connect devices.*

## 🤝 How It Works

1. **Host a Room**: A user initializes a room. The signaling server assigns a unique Room ID.
2. **Join a Room**: A peer joins via the Room ID or by scanning the generated QR code.
3. **WebRTC Handshake**: The server exchanges ICE candidates and SDP offers/answers between the two clients.
4. **Direct Transfer**: Once connected, the peers communicate directly. Files are chunked, transmitted, and reassembled on the receiver's end with real-time progress indicators.
