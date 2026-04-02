import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode intentionally removed: it double-invokes effects in dev,
// which calls peer.destroy() and kills WebRTC connections immediately.
createRoot(document.getElementById('root')).render(
  <App />
)
