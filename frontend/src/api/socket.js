// Single shared WebSocket for playback state + low-latency control.
// One connection per tab: MainLayout opens it, PlayerBar/DevicesPanel
// send controls through it. Avoids duplicate tickers/broadcasts.
import useStore from '../store';
import { API_BASE } from './client';

let ws = null;
let reconnectTimer = null;
const listeners = new Set(); // components wanting a connection-status signal

function wsBase() {
  // Same-origin deploy: API_BASE is '' so fall back to the page origin.
  const origin = (API_BASE && API_BASE.trim()) || window.location.origin;
  return origin.replace(/^http/, 'ws'); // http→ws, https→wss
}

function notify(connected) {
  listeners.forEach((fn) => fn(connected));
}

export function connectSocket() {
  const token = localStorage.getItem('spotify_looper_session');
  if (!token) return;
  disconnectSocket();

  try {
    ws = new WebSocket(`${wsBase()}/ws?token=${token}`);
  } catch {
    return;
  }

  ws.onopen = () => notify(true);

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    const s = useStore.getState();
    if (msg.type === 'playback') s.setPlayback(msg.data);
    else if (msg.type === 'loop_state') s.setLoopState(msg.data);
    else if (msg.type === 'devices') s.setDevices(msg.data);
    else if (msg.type === 'error') s.setError(msg.data.error);
  };

  ws.onclose = () => {
    notify(false);
    ws = null;
    reconnectTimer = setTimeout(connectSocket, 3000);
  };

  ws.onerror = () => { try { ws.close(); } catch {} };
}

export function disconnectSocket() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) {
    ws.onclose = null; // don't reconnect on intentional close
    try { ws.close(); } catch {}
    ws = null;
  }
  notify(false);
}

// Returns true if the command went over the open socket (low-latency path).
// Caller falls back to REST when it returns false.
export function sendControl(action, data = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'control', data: { action, ...data } }));
    return true;
  }
  return false;
}

export function onConnectionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isSocketOpen() {
  return !!ws && ws.readyState === WebSocket.OPEN;
}
