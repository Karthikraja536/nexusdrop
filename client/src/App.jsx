import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import HostRoom from './pages/HostRoom';
import JoinRoom from './pages/JoinRoom';
import JoinedRoom from './pages/JoinedRoom';
import LobbyScreen from './pages/LobbyScreen';
import { useSignaling } from './hooks/useSignaling';
import { usePeer } from './hooks/usePeer';

// Invisible wrapper that acts as the global background WebRTC networking engine
function NetworkEngine() {
  usePeer();
  useSignaling();
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <NetworkEngine />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host" element={<HostRoom />} />
        <Route path="/join" element={<JoinRoom />} />
        <Route path="/lobby" element={<LobbyScreen />} />
        <Route path="/room" element={<JoinedRoom />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
