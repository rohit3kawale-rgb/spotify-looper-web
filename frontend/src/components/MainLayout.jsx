import React, { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';
import useStore from '../store';
import Header from './Header';
import Sidebar from './Sidebar';
import LoopPanel from './loop/LoopPanel';
import PresetsPanel from './presets/PresetsPanel';
import DevicesPanel from './DevicesPanel';
import SearchPanel from './SearchPanel';
import RoomPanel from './RoomPanel';
import PlayerBar from './PlayerBar';

export default function MainLayout() {
  const {
    profile, playback, devices, currentDeviceId,
    loopStartMs, loopEndMs, loopMode, loopDirection, loopEnabled,
    presets,
    setPlayback, setLoopState, setDevices, setCurrentDevice, setLoopStart,
    setLoopEnd, setLoopMode, setLoopEnabled, setPresets,
    formatTime, getProgressPercent, getLoopDuration, setError,
  } = useStore();

  const [roomId, setRoomId] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);

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
      // Restore loop state from REST — the WS may not have reconnected yet,
      // and in-memory server state is lost on restart. Without this the
      // loop segment / mode / "g" (groove) all reset on every refresh.
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
    connectSocket();
    return () => disconnectSocket();
  }, [setPlayback, setLoopState, setDevices, setLoopStart, setLoopEnd, setLoopMode, setLoopEnabled, setPresets]);

  useEffect(() => {
    if (roomId) window.location.href = `/room/${roomId}`;
  }, [roomId]);

  useEffect(() => {
    const handleConn = (connected) => setWsConnected(connected);
    const el = document.getElementById('ws-status');
    if (el) setWsConnected(el.dataset.connected === '1');
    return () => {};
  }, []);

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

  const progressPercent = getProgressPercent();
  const loopProgressPercent = loopStartMs !== null && loopEndMs !== null && loopEndMs > loopStartMs
    ? Math.max(0, Math.min(100, ((playback?.progress_ms || 0) - loopStartMs) / (loopEndMs - loopStartMs) * 100))
    : 0;
  const loopDuration = getLoopDuration();

  return (
    <div className="h-screen flex flex-col bg-spotify-black text-spotify-white overflow-hidden">
      {/* Top row: sidebar + main area */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header profile={profile} onLogout={async () => {
            try { await apiClient.logout(); } catch {}
            localStorage.removeItem('spotify_looper_session');
            apiClient.clearSession();
            window.location.href = '/';
          }} />
          <main className="flex-1 overflow-y-auto px-6 py-4">
            <div className="max-w-7xl mx-auto">
              {/* Welcome header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-white">
                  Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}
                </h1>
                {profile?.display_name && (
                  <p className="text-spotify-gray text-sm mt-0.5">{profile.display_name}</p>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                {/* Main column — loop control + room */}
                <div className="xl:col-span-2 space-y-5">
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
                    onSetLoopStart={async (ms) => {
                      setLoopStart(ms);
                      if (loopEndMs != null && ms < loopEndMs) {
                        try { await apiClient.setSegment(ms, loopEndMs); } catch {}
                      }
                      // Persist so the loop survives refresh / restart.
                      try { await apiClient.saveLoopState({ loop_start_ms: ms, loop_end_ms: loopEndMs, is_enabled: true }); } catch {}
                    }}
                    onSetLoopEnd={async (ms) => {
                      setLoopEnd(ms);
                      if (loopStartMs != null && loopStartMs < ms) {
                        try { await apiClient.setSegment(loopStartMs, ms); } catch {}
                      }
                      try { await apiClient.saveLoopState({ loop_start_ms: loopStartMs, loop_end_ms: ms, is_enabled: true }); } catch {}
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

                {/* Sidebar column — presets, devices, search */}
                <div className="space-y-5">
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
                  <DevicesPanel
                    devices={devices}
                    currentDeviceId={currentDeviceId}
                    onDeviceChange={async (id) => {
                      setCurrentDevice(id);
                      // Actually transfer playback on Spotify — otherwise the
                      // UI shows a selection but nothing changes server-side.
                      try {
                        await apiClient.control('transfer', { device_id: id, force_play: true });
                      } catch { /* non-fatal — optimistic UI already flipped */ }
                    }}
                  />
                  <SearchPanel />
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Bottom player bar */}
      <PlayerBar />
    </div>
  );
}
