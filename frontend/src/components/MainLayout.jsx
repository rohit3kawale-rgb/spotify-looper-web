import React, { useEffect, useState, useRef } from 'react';
import apiClient from '../api/client';
import { connectSocket, disconnectSocket, onConnectionChange } from '../api/socket';
import useStore from '../store';
import Header from './Header';
import Sidebar from './Sidebar';
import LoopPanel from './loop/LoopPanel';
import PresetsPanel from './presets/PresetsPanel';
import DevicesPanel from './DevicesPanel';
import RoomPanel from './RoomPanel';
import PlayerBar from './PlayerBar';

export default function MainLayout() {
  const {
    profile, playback, devices, currentDeviceId,
    loopStartMs, loopEndMs, loopMode, loopDirection, loopEnabled,
    presets,
    setPlayback, setLoopState, setDevices, setCurrentDevice, setLoopStart,
    setLoopEnd, setLoopMode, setLoopEnabled, setPresets,
    formatTime, getProgressPercent, getLoopDuration, setError, setSearchResults,
    setSearchQuery,
  } = useStore();

  const [roomId, setRoomId] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const mainRef = useRef(null);

  useEffect(() => {
    const m = window.location.pathname.match(/^\/room\/([a-zA-Z0-9_-]+)$/);
    if (m) setRoomId(m[1]);
  }, []);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const pb = await apiClient.getPlayback();
        if (pb && Object.keys(pb).length > 0) setPlayback(pb);
      } catch {}
      try {
        const devs = await apiClient.getDevices();
        if (devs.devices) setDevices(devs.devices);
      } catch {}
      try {
        const ps = await apiClient.getPresets();
        setPresets(ps);
      } catch {}
      try {
        const ls = await apiClient.getLoopState();
        if (ls) {
          setLoopState({
            loop_start_ms: ls.segmentStartMs || null,
            loop_end_ms: ls.segmentEndMs || null,
            mode: ls.mode || 'Forward',
            direction: 1,
            is_enabled: !!(ls.segmentStartMs && ls.segmentEndMs),
          });
        }
      } catch {}
    };
    loadInitial();
    const unsub = onConnectionChange(setWsConnected);
    connectSocket();
    return () => { disconnectSocket(); unsub(); };
  }, [setPlayback, setLoopState, setDevices, setLoopStart, setLoopEnd, setLoopMode, setLoopEnabled, setPresets]);

  useEffect(() => {
    if (roomId) window.location.href = `/room/${roomId}`;
  }, [roomId]);

  const handleLoadPreset = async (preset) => {
    try {
      const result = await apiClient.loadPreset(preset.index);
      if (result.ok) {
        setError(`Loaded preset: ${result.preset.name}`);
        setTimeout(() => setError(null), 3000);
      }
    } catch { setError('Failed to load preset'); }
  };

  const handleSavePreset = async (name) => {
    try {
      await apiClient.addPreset({ name });
      const data = await apiClient.getPresets();
      setPresets(data);
    } catch { setError('Failed to save preset'); }
  };

  const handleDeletePreset = async (index) => {
    try {
      await apiClient.removePreset(index);
      const data = await apiClient.getPresets();
      setPresets(data);
    } catch { setError('Failed to delete preset'); }
  };

  const handleCreateRoom = async () => {
    try {
      const room = await apiClient.createRoom();
      window.location.href = `/room/${room.room_id}`;
    } catch { setError('Failed to create room'); }
  };

  const handleJoinRoom = (id) => { window.location.href = `/room/${id}`; };

  const handleLeaveRoom = () => {
    if (roomId) {
      window.history.replaceState({}, '', '/');
      setRoomId(null);
    } else {
      window.location.href = '/';
    }
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults([]); return; }
    try {
      const data = await apiClient.search(query);
      setSearchResults(data.tracks || []);
    } catch { setSearchResults([]); }
  };

  const progressPercent = getProgressPercent();
  const loopProgressPercent = loopStartMs !== null && loopEndMs !== null && loopEndMs > loopStartMs
    ? Math.max(0, Math.min(100, ((playback?.progress_ms || 0) - loopStartMs) / (loopEndMs - loopStartMs) * 100))
    : 0;
  const loopDuration = getLoopDuration();

  // Now playing card data
  const item = playback?.item;
  const albumArtUrl = item?.albumArtUrl || item?.album?.images?.[0]?.url || '';
  const artistNames = Array.isArray(item?.artists)
    ? item.artists.map(a => typeof a === 'string' ? a : a?.name).filter(Boolean).join(', ')
    : '';
  const trackName = item?.name || '';
  const duration = item?.duration_ms || item?.durationMs || 0;
  const progress = playback?.progress_ms || 0;
  const isPlaying = !!playback?.is_playing;

  return (
    <div className="h-screen bg-spotify-black text-spotify-white overflow-hidden flex flex-col">
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <Sidebar />

        {/* Center content */}
        <div ref={mainRef} className="flex-1 overflow-y-auto relative"
          style={{ background: 'linear-gradient(180deg, rgba(30,30,30,0.9) 0%, #121212 40%)' }}
        >
          {/* Sticky search header */}
          <Header
            profile={profile}
            onLogout={async () => {
              try { await apiClient.logout(); } catch {}
              localStorage.removeItem('spotify_looper_session');
              apiClient.clearSession();
              window.location.href = '/';
            }}
            onToggleSearch={() => setShowSearch(s => !s)}
          >
            {/* Search overlay */}
            {showSearch && (
              <div className="absolute top-full left-0 right-0 bg-[#242424] border-b border-white/10 shadow-2xl z-50 max-h-[70vh] overflow-y-auto">
                <div className="max-w-2xl mx-auto py-6 px-6">
                  <div className="relative">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-spotify-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="What do you want to listen to?"
                      autoFocus
                      onChange={(e) => handleSearch(e.target.value)}
                      onBlur={() => setTimeout(() => setShowSearch(false), 200)}
                      className="w-full bg-white/10 border border-white/10 rounded-full pl-12 pr-4 py-3 text-white text-base placeholder-spotify-gray focus:outline-none focus:border-spotify-green/60 focus:bg-white/15 transition-colors"
                    />
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-4 space-y-0.5">
                      {searchResults.slice(0, 10).map((track) => (
                        <div
                          key={track.id || track.uri}
                          className="flex items-center gap-3 p-2.5 rounded-md hover:bg-white/10 cursor-pointer group"
                          onClick={async () => {
                            try {
                              const store = useStore.getState();
                              let deviceId = store.currentDeviceId;
                              if (!deviceId && store.devices?.length) deviceId = store.devices[0].id;
                              await apiClient.controlLoop('play', { uris: [track.uri], device_id: deviceId });
                              setShowSearch(false);
                            } catch (e) { setError(e.message || 'Failed to play'); }
                          }}
                        >
                          <img
                            src={track.albumArtUrl || track.album?.images?.[0]?.url || ''}
                            alt=""
                            className="w-10 h-10 rounded object-cover flex-shrink-0"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{track.name}</p>
                            <p className="text-spotify-gray text-xs truncate">
                              {Array.isArray(track.artists)
                                ? track.artists.map(a => typeof a === 'string' ? a : a?.name).filter(Boolean).join(', ')
                                : ''}
                            </p>
                          </div>
                          <div className="text-spotify-gray text-xs tabular-nums flex-shrink-0 mr-2">
                            {Math.floor((track.duration_ms || track.durationMs || 0) / 60000)}:{String(Math.floor(((track.duration_ms || track.durationMs || 0) % 60000) / 1000)).padStart(2, '0')}
                          </div>
                          <div className="w-8 h-8 rounded-full bg-spotify-green flex items-center justify-center text-black opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19" /></svg>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Header>

          {/* Content area */}
          <div className="px-6 pb-28">
            {/* Greeting */}
            <div className="mb-8 mt-2">
              <h1 className="text-white font-bold text-3xl tracking-tight">
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}
              </h1>
              {profile?.display_name && (
                <p className="text-spotify-gray text-base mt-1">{profile.display_name}</p>
              )}
            </div>

            {/* Quick picks row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-10">
              {[
                { label: 'My Loops', desc: `${presets.length} saved`, icon: (
                  <svg className="w-8 h-8 text-white opacity-80" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                )},
                { label: 'Live Room', desc: roomId ? `Room ${roomId.slice(-4)}` : 'Connect', icon: (
                  <svg className="w-8 h-8 text-white opacity-80" viewBox="0 0 24 24" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>
                )},
                { label: 'Devices', desc: `${devices?.length || 0} available`, icon: (
                  <svg className="w-8 h-8 text-white opacity-80" viewBox="0 0 24 24" fill="currentColor"><path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>
                )},
                { label: 'Recent', desc: 'Your history', icon: (
                  <svg className="w-8 h-8 text-white opacity-80" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
                )},
              ].map(card => (
                <button
                  key={card.label}
                  className="group flex items-center gap-4 bg-white/8 hover:bg-white/15 rounded-md overflow-hidden transition-all text-left h-20"
                >
                  <div className="w-20 h-20 flex-shrink-0 bg-gradient-to-br from-violet-700 to-transparent flex items-center justify-center">
                    {card.icon}
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-white font-bold text-sm truncate">{card.label}</p>
                    <p className="text-spotify-gray text-xs">{card.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Left column — loop control + room */}
              <div className="xl:col-span-2 space-y-8">
                <LoopPanel
                  playback={playback}
                  progressPercent={progressPercent}
                  loopStartMs={loopStartMs}
                  loopEndMs={loopEndMs}
                  loopMode={loopMode}
                  loopDirection={loopDirection}
                  loopEnabled={loopEnabled}
                  loopProgressPercent={loopProgressPercent}
                  loopDuration={loopDuration}
                  formatTime={formatTime}
                  modes={['Forward', 'Ping-Pong', 'Crossfade']}
                  onToggleLoop={async () => {
                    setLoopEnabled(!loopEnabled);
                    try { await apiClient.controlLoop('toggle_loop'); } catch {}
                  }}
                  onSetLoopStart={async (ms) => {
                    setLoopStart(ms);
                    if (loopEndMs != null && ms < loopEndMs) {
                      try { await apiClient.setSegment(ms, loopEndMs); } catch {}
                      try { await apiClient.saveLoopState({ loop_start_ms: ms, loop_end_ms: loopEndMs, is_enabled: true }); } catch {}
                    }
                  }}
                  onSetLoopEnd={async (ms) => {
                    setLoopEnd(ms);
                    if (loopStartMs != null && loopStartMs < ms) {
                      try { await apiClient.setSegment(loopStartMs, ms); } catch {}
                      try { await apiClient.saveLoopState({ loop_start_ms: loopStartMs, loop_end_ms: ms, is_enabled: true }); } catch {}
                    }
                  }}
                  onClearLoop={async () => {
                    try { await apiClient.controlLoop('clear_loop'); } catch {}
                    setLoopStart(null); setLoopEnd(null); setLoopEnabled(false);
                    try { await apiClient.saveLoopState({ loop_start_ms: null, loop_end_ms: null, is_enabled: false }); } catch {}
                  }}
                  onModeChange={async (mode) => {
                    setLoopMode(mode);
                    try { await apiClient.controlLoop('set_mode', { mode }); } catch {}
                    try { await apiClient.saveLoopState({ mode }); } catch {}
                  }}
                />
                <RoomPanel
                  roomId={roomId}
                  isConnected={wsConnected}
                  onCreateRoom={handleCreateRoom}
                  onJoinRoom={handleJoinRoom}
                  onLeaveRoom={handleLeaveRoom}
                />
              </div>

              {/* Right column — Now Playing + Presets + Devices */}
              <div className="space-y-6">
                {/* Now Playing Card */}
                <div className="bg-[#181818] rounded-lg overflow-hidden border border-white/5">
                  <div className="p-5">
                    <h2 className="text-white font-bold text-lg tracking-tight mb-4">Now Playing</h2>
                    {item ? (
                      <>
                        <div className="relative aspect-square rounded-md overflow-hidden shadow-2xl mb-4">
                          <img
                            src={albumArtUrl}
                            alt="Album art"
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                          {isPlaying && (
                            <div className="absolute bottom-3 right-3 flex gap-0.5 items-end h-5">
                              {[1,2,3,4].map(i => (
                                <div key={i} className="w-1 bg-spotify-green rounded-full"
                                  style={{
                                    height: `${6 + i * 3}px`,
                                    animation: `pulseSlow ${0.4 + i * 0.1}s ease-in-out infinite`,
                                    animationDelay: `${i * 0.1}s`,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-white font-bold text-lg truncate">{trackName}</p>
                            <p className="text-spotify-gray text-sm">{artistNames}</p>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-4 space-y-1.5">
                          <div className="h-1 bg-white/20 rounded-full overflow-hidden cursor-pointer group">
                            <div
                              className="h-full bg-white rounded-full transition-all duration-150 group-hover:bg-spotify-green"
                              style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-spotify-gray font-mono">
                            <span>{formatTime(progress)}</span>
                            <span>{formatTime(duration)}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="aspect-square rounded-md bg-[#282828] flex flex-col items-center justify-center gap-3">
                        <svg className="w-16 h-16 text-spotify-gray/30" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                        <p className="text-spotify-gray text-sm">No track selected</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Presets */}
                <div className="bg-[#181818] rounded-lg p-5 border border-white/5">
                  <PresetsPanel
                    presets={presets}
                    onLoadPreset={handleLoadPreset}
                    onSavePreset={handleSavePreset}
                    onDeletePreset={handleDeletePreset}
                    playback={playback}
                    loopStartMs={loopStartMs}
                    loopEndMs={loopEndMs}
                    loopMode={loopMode}
                    formatTime={formatTime}
                  />
                </div>

                {/* Devices */}
                <div className="bg-[#181818] rounded-lg p-5 border border-white/5">
                  <DevicesPanel
                    devices={devices}
                    currentDeviceId={currentDeviceId}
                    onDeviceChange={async (id) => {
                      setCurrentDevice(id);
                      try {
                        await apiClient.control('transfer', { device_id: id, force_play: true });
                      } catch { /* non-fatal */ }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom player bar */}
      <PlayerBar />
    </div>
  );
}
