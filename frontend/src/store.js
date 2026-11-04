import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

const useStore = create(devtools((set, get) => ({
  // Auth
  isAuthenticated: false,
  sessionToken: null,
  accountId: null,
  profile: null,
  authUrl: null,
  verifier: null,
  state: null,
  pendingVerifier: null,

  // Playback
  playback: null,
  devices: [],
  currentDeviceId: null,
  volume: 70,

  // Loop
  loopStartMs: null,
  loopEndMs: null,
  loopMode: 'Forward',
  loopDirection: 1,
  loopEnabled: false,

  // Presets
  presets: [],

  // Search
  searchResults: [],
  searchQuery: '',

  // UI state
  isLoading: false,
  error: null,
  sidebarOpen: true,

  // Actions
  setAuthData: (authUrl, verifier, state) => {
    // Persist the PKCE verifier and state across the full-page redirect to Spotify
    // (Zustand state is wiped on reload, but sessionStorage survives it).
    if (verifier) sessionStorage.setItem('spotify_looper_verifier', verifier);
    if (state) sessionStorage.setItem('spotify_looper_state', state);
    set({ authUrl, verifier, state, pendingVerifier: verifier });
  },

  restorePendingVerifier: () => {
    const v = sessionStorage.getItem('spotify_looper_verifier');
    if (v) set({ pendingVerifier: v });
    // Restore sessionToken too — the OAuth callback reloads the SPA, so the
    // in-memory session is gone. Without it, subsequent API calls are 401s.
    const token = localStorage.getItem('spotify_looper_session');
    if (token) set({ sessionToken: token, isAuthenticated: true });
  },

  setSession: (token, profile) => set({
    sessionToken: token,
    accountId: profile?.id,
    profile,
    isAuthenticated: true
  }),

  setProfile: (profile) => set({ profile }),

  clearSession: () => set({
    sessionToken: null,
    accountId: null,
    profile: null,
    authUrl: null,
    verifier: null,
    pendingVerifier: null,
    state: null,
    isAuthenticated: false,
    playback: null,
    devices: [],
    presets: [],
  }),
  // Clear PKCE state from sessionStorage on logout
  clearAuthState: () => {
    sessionStorage.removeItem('spotify_looper_verifier');
    sessionStorage.removeItem('spotify_looper_state');
  },

  setPlayback: (playback) => set({ playback }),

  setDevices: (devices) => set({ devices }),

  setCurrentDevice: (deviceId) => set({ currentDeviceId: deviceId }),

  setVolume: (volume) => set({ volume }),

  setLoopStart: (ms) => set({ loopStartMs: ms }),

  setLoopEnd: (ms) => set({ loopEndMs: ms }),
  // Update the whole loop state from a WebSocket message. The backend sends
  // keys like loop_start_ms / loop_end_ms / mode / direction / is_enabled.
  setLoopState: (data) => set({
    loopStartMs: data?.loop_start_ms ?? null,
    loopEndMs: data?.loop_end_ms ?? null,
    loopMode: data?.mode ?? 'Forward',
    loopDirection: data?.direction ?? 1,
    loopEnabled: !!data?.is_enabled,
  }),

  setLoopMode: (mode) => set({ loopMode: mode }),

  setLoopDirection: (dir) => set({ loopDirection: dir }),

  setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),

  clearLoop: () => set({
    loopStartMs: null,
    loopEndMs: null,
    loopDirection: 1,
    loopEnabled: false
  }),

  setPresets: (presets) => set({ presets }),

  addPreset: (preset) => set((state) => ({ presets: [...state.presets, preset] })),

  removePreset: (index) => set((state) => ({
    presets: state.presets.filter((_, i) => i !== index)
  })),

  setSearchResults: (results) => set({ searchResults: results }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  // Computed
  getLoopDuration: () => {
    const { loopStartMs, loopEndMs } = get();
    if (loopStartMs !== null && loopEndMs !== null) {
      return loopEndMs - loopStartMs;
    }
    return 0;
  },

  getProgressPercent: () => {
    const { playback, loopStartMs, loopEndMs } = get();
    if (!playback || !playback.item) return 0;
    const progress = playback.progress_ms;
    const duration = playback.item.duration_ms || playback.item.durationMs;
    if (!duration) return 0;
    return (progress / duration) * 100;
  },

  formatTime: (ms) => {
    if (typeof ms !== 'number' || Number.isNaN(ms)) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  },
})));

export default useStore;