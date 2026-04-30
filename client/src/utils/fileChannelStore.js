// Module-level store for dedicated file transfer DataChannels
// Kept outside Zustand to avoid mutation issues
const channels = new Map();

export function setFileChannel(peerId, dc) {
  channels.set(peerId, dc);
}

export function getFileChannel(peerId) {
  const dc = channels.get(peerId);
  return (dc && dc.readyState === 'open') ? dc : null;
}

export function removeFileChannel(peerId) {
  channels.delete(peerId);
}
