// Use nullish coalescing (??) so an empty string for VITE_API_URL
// is treated as valid (same-origin), not falsy (falling back to localhost).
const API_BASE = import.meta.env.VITE_API_URL ?? '';

let sessionToken = null;

const getHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
  return headers;
};

const apiClient = {
  setSession(token) {
    sessionToken = token;
    // Persist across page reloads — the OAuth callback navigates away from
    // the SPA and back, so in-memory state alone loses the session.
    if (token) localStorage.setItem('spotify_looper_session', token);
  },
  clearSession() {
    sessionToken = null;
    localStorage.removeItem('spotify_looper_session');
  },
  async getAuthUrl() {
    const res = await fetch(`${API_BASE}/api/auth/url`);
    const data = await res.json();
    return { auth_url: data.auth_url, verifier: data.verifier, state: data.state };
  },
  async checkAuthStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/status`, { headers: getHeaders() });
      if (!res.ok) return { connected: false };
      const data = await res.json();
      return data;
    } catch (e) {
      return { connected: false };
    }
  },
  async getPlayback() {
    const res = await fetch(`${API_BASE}/api/playback`, { headers: getHeaders() });
    return res.json();
  },
  async getLoopState() {
    const res = await fetch(`${API_BASE}/api/loop/state`, { headers: getHeaders() });
    return res.json();
  },
  async saveLoopState(data) {
    const res = await fetch(`${API_BASE}/api/loop/state`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async control(action, data = {}) {
    const res = await fetch(`${API_BASE}/api/loop/control`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ action, ...data })
    });
    return res.json();
  },
  async setSegment(start_ms, end_ms) {
    const res = await fetch(`${API_BASE}/api/loop/segment`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ start_ms, end_ms })
    });
    return res.json();
  },
  async getPresets() {
    const res = await fetch(`${API_BASE}/api/presets`, { headers: getHeaders() });
    const data = await res.json();
    return data.presets || [];
  },
  async addPreset(data) {
    const res = await fetch(`${API_BASE}/api/presets`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return res.json();
  },
  async removePreset(index) {
    const res = await fetch(`${API_BASE}/api/presets/${index}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return res.json();
  },
  async loadPreset(presetId) {
    const res = await fetch(`${API_BASE}/api/preset/load`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ presetId })
    });
    return res.json();
  },
  async search(q, type = 'track', limit = 10) {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}`, { headers: getHeaders() });
    return res?.ok ? await res.json() : { tracks: [] };
  },
  async getDevices() {
    const res = await fetch(`${API_BASE}/api/devices`, { headers: getHeaders() });
    return res.json();
  },
  async logout() {
    const res = await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: getHeaders()
    });
    return res.json();
  },
  async exchangeCode(code, state) {
    // The state parameter is a JWT embedding the PKCE verifier. No shared
    // server state needed — the verifier travels with the callback, solving
    // the ephemeral Fly.io machine problem and mobile sessionStorage clearing.
    const res = await fetch(`${API_BASE}/api/auth/callback`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ code, state })
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async listRooms() {
    const res = await fetch(`${API_BASE}/api/rooms`, { headers: getHeaders() });
    const data = await res.json();
    // Backend wraps the list in { rooms: [...] }.
    return Array.isArray(data) ? data : (data.rooms || []);
  },
  async createRoom(name) {
    const res = await fetch(`${API_BASE}/api/rooms`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name })
    });
    return res.json();
  },
  async controlLoop(action, data = {}) {
    const res = await fetch(`${API_BASE}/api/loop/control`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ action, ...data })
    });
    return res.json();
  },
  async toggleLoop() {
    const res = await fetch(`${API_BASE}/api/loop/control`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ action: 'toggle_loop' })
    });
    return res.json();
  },
  async setLoopSegment(start_ms, end_ms) {
    const res = await fetch(`${API_BASE}/api/loop/segment`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ start_ms, end_ms })
    });
    return res.json();
  },
  async advanceIteration() {
    const res = await fetch(`${API_BASE}/api/loop/iteration`, {
      method: 'POST',
      headers: getHeaders()
    });
    return res.json();
  },
};

export default apiClient;
export { API_BASE };
