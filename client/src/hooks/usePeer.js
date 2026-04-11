import { useEffect, useRef } from 'react';
import Peer from 'peerjs';
import useStore from '../store/useStore';
import { TransferManager } from '../utils/transferManager';

// Use the same host and port as the page — Vite proxy forwards /peerjs to :3001
const PEER_HOST = window.location.hostname;
const PEER_PORT = Number(window.location.port) || 443;

export function usePeer() {
  const peerRef = useRef(null);

  const {
    roomCode, isHost, hostPeerId,
    setPeer, setMyPeerId, addPeer, removePeer
  } = useStore();

  const handleProgress = (fileId, metadata, percent, speed, transport) => {
    useStore.getState().updateTransferProgress(fileId, metadata, percent, speed, transport);
  };

  const handleComplete = (fileId, metadata, blobUrl) => {
    useStore.getState().completeTransfer(fileId, metadata, blobUrl);

    // Auto-download behavior like native AirDrop
    try {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = metadata.name || 'nexusdrop-file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.warn('Auto-download blocked by browser protection', e);
    }
  };

  // Helper: configure DataChannel for maximum throughput once connection opens
  const configureDataChannel = (conn) => {
    const dc = conn.dataChannel || conn._dc;
    if (dc) {
      dc.bufferedAmountLowThreshold = 8 * 1024 * 1024; // 8 MB — triggers bufferedamountlow event
    }
  };

  // Helper: wire ICE drop detection for graceful relay fallback
  const wireIceDropDetection = (conn, peerId) => {
    if (conn.peerConnection) {
      conn.peerConnection.oniceconnectionstatechange = () => {
        const state = conn.peerConnection.iceConnectionState;
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          console.warn(`WebRTC ICE failure for ${peerId}! Downgrading quietly back to Relay mode.`);
          addPeer({ id: peerId, conn: null, relayMode: true });
        }
      };
    }
  };

  // 1. Initialize our localized PeerJS instance
  useEffect(() => {
    if (!roomCode) return;

    const peer = new Peer(undefined, {
      host: PEER_HOST,
      port: PEER_PORT,
      path: '/peerjs',
      debug: 2,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          }
        ]
      }
    });

    peer.on('open', (id) => {
      setMyPeerId(id);
    });

    peer.on('error', (err) => console.error('❌ PeerJS Error:', err));

    // IF WE ARE HOST: Listen for incoming datachannels seamlessly
    if (isHost) {
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          console.log('✅ WebRTC successfully punched through firewall to Client:', conn.peer);
          
          configureDataChannel(conn);

          addPeer({
            id: conn.peer,
            name: conn.metadata?.name || 'Unknown',
            type: conn.metadata?.type || 'desktop',
            conn,
            relayMode: false
          });

          wireIceDropDetection(conn, conn.peer);
        });

        // WebRTC Global Interceptor Loop
        conn.on('data', (data) => {
          if (data?.type === 'chat') {
            useStore.getState().addMessage({ ...data, isMe: false });
            // Optionally, act as server relay (if Host): 
            const peers = useStore.getState().peers;
            peers.forEach(p => {
              if (p.id !== conn.peer && p.conn && p.conn.open) p.conn.send(data);
            });
          } else if (data?.type === 'file-ack') {
            TransferManager.receiveAck(data.fileId, data.index);
          } else {
            // Intercept and cleanly map PeerId for transfer failures
            TransferManager.receiveData(
              data,
              (fId, meta, prog, speed, transport) => handleProgress(fId, { ...meta, peerId: conn.peer }, prog, speed, transport),
              (fId, meta, url) => handleComplete(fId, { ...meta, peerId: conn.peer }, url),
              (fId, meta) => {
                console.log(`⚠️ Transfer Watchdog violently timed out for Peer: ${conn.peer}`);
                useStore.getState().removePeer(conn.peer);
              },
              'webrtc',
              (fId, index) => {
                if (conn && conn.open) conn.send({ type: 'file-ack', fileId: fId, index });
              }
            );
          }
        });

        conn.on('error', () => removePeer(conn.peer));
        conn.on('close', () => removePeer(conn.peer));
      });
    }

    peerRef.current = peer;
    setPeer(peer);

    return () => {
      peer.destroy();
      setPeer(null);
    };
  }, [roomCode, isHost, setPeer, setMyPeerId, addPeer, removePeer]);

  // 2. IF WE ARE CLIENT: Dial the Host once admitted
  useEffect(() => {
    if (!isHost && hostPeerId && peerRef.current) {
      console.log('📡 Dialing host peer:', hostPeerId);
      const conn = peerRef.current.connect(hostPeerId, {
        reliable: true,
        serialization: 'binary',   // binary mode — no JSON overhead, maximum throughput
        ordered: true,
        metadata: {
          name: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Device',
          type: navigator.userAgent.includes('Mobile') ? 'phone' : 'desktop'
        }
      });

      conn.on('open', () => {
        console.log('✅ WebRTC data channel physically punched through firewall to Host! Elevating transport link.');
        
        configureDataChannel(conn);

        addPeer({ id: hostPeerId, name: 'Host Device', type: 'desktop', conn, relayMode: false });

        wireIceDropDetection(conn, hostPeerId);
      });

      conn.on('error', (err) => console.error('❌ Connection error:', err));

      // WebRTC Global Interceptor Loop
      conn.on('data', (data) => {
        if (data?.type === 'chat') {
          useStore.getState().addMessage({ ...data, isMe: false });
        } else if (data?.type === 'file-ack') {
          TransferManager.receiveAck(data.fileId, data.index);
        } else {
          TransferManager.receiveData(
            data,
            (fId, meta, prog, speed, transport) => handleProgress(fId, { ...meta, peerId: conn.peer }, prog, speed, transport),
            (fId, meta, url) => handleComplete(fId, { ...meta, peerId: conn.peer }, url),
            (fId, meta) => {
              console.log(`⚠️ Transfer Watchdog violently timed out for Host limit: ${conn.peer}`);
              useStore.getState().removePeer(hostPeerId);
              useStore.setState({ hostPeerId: null, isDisconnected: true });
            },
            'webrtc',
            (fId, index) => {
               if (conn && conn.open) conn.send({ type: 'file-ack', fileId: fId, index });
            }
          );
        }
      });

      // Graceful disconnect — show disconnected UI, don't hard-redirect immediately
      conn.on('close', () => {
        console.warn('⚠️ Connection to host closed');
        useStore.getState().removePeer(hostPeerId);
        useStore.setState({ hostPeerId: null, isDisconnected: true });
      });
    }
  }, [isHost, hostPeerId, addPeer]);

  return peerRef.current;
}
