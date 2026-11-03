import React, { useEffect } from 'react';
import apiClient, { API_BASE } from '../api/client';
import useStore from '../store';
import Header from './Header';
import Sidebar from './Sidebar';
import TrackPanel from './track/TrackPanel';
import LoopPanel from './loop/LoopPanel';
import PresetsPanel from './presets/PresetsPanel';
import DevicesPanel from './DevicesPanel';
import SearchPanel from './SearchPanel';
import RoomPanel from './RoomPanel';

export default function MainLayout() {
  const {
    profile,
    playback,
    devices,
    currentDeviceId,
    volume,
    loopStartMs,
    loopEndMs,
    loopMode,
    loopDirection,
    loopEnabled,
    presets,
    setPlayback,
    setLoopState,
    setDevices,
    setCurrentDevice,
    setVolume,
    setLoopStart,
    setLoopEnd,
    setLoopMode,
    setLoopEnabled,
    setPresets,
    formatTime,
    getProgressPercent,
    getLoopDuration,
    setError,
    toggleSidebar,
    sidebarOpen,
    isLoading,
  } = useStore();

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const pb = await apiClient.getPlayback();
        if (pb && Object.keys(pb).length > 0) setPlayback(pb);
      } catch { /* not fatal — WS will update */ }
      try {
        const devs = await apiClient.getDevices();
        if (devs.devices) setDevices(devs.devices);
      } catch { /* not fatal */ }
      try {
        const ps = await apiClient.getPresets();
        setPresets(ps.presets || []);
      } catch { /* not fatal */ }
    };
    loadInitial();

    let ws;
    const connectWs = () => {
      const token = localStorage.getItem('spotify_looper_session');
      if (!token) return;
      const wsUrl = `${API_BASE.replace('http', 'ws')}/ws?token=${token}`;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'playback') setPlayback(msg.data);
        if (msg.type === 'loop_state') setLoopState(msg.data);
        if (msg.type === 'devices') setDevices(msg.data);
        if (msg.type === 'error') setError(msg.data.error);
      };
      ws.onclose = () => {
        // Auto-reconnect after a short delay
        setTimeout(connectWs, 3000);
      };
    };
    connectWs();
    return () => ws?.close();
  }, [setPlayback, setLoopState, setDevices, setError, setPresets]);

  const handleControl = async (action, data) => {
    try {
      await apiClient.control(action, data);
    } catch (err) {
      setError(err.message || 'Control failed');
    }
  };

  const handleLoadPreset = async (preset) => {
    try {
      const result = await apiClient.loadPreset(preset.index);
      if (result.ok) {
        setError(`Loaded preset: ${result.preset.name}`);
        setTimeout(() => setError(null), 3000);
      }
    } catch (err) {
      setError('Failed to load preset');
    }
  };

  const handleSavePreset = async (name) => {
    try {
      await apiClient.addPreset({ name });
      const data = await apiClient.getPresets();
      setPresets(data.presets || []);
    } catch (err) {
      setError('Failed to save preset');
    }
  };

  const handleDeletePreset = async (index) => {
    try {
      await apiClient.removePreset(index);
      const data = await apiClient.getPresets();
      setPresets(data.presets || []);
    } catch (err) {
      setError('Failed to delete preset');
    }
  };

  const handleCreateRoom = async () => {
    try {
      const room = await apiClient.createRoom();
      window.location.href = `/room/${room.room_id}`;
    } catch (err) {
      setError('Failed to create room');
    }
  };

  const handleJoinRoom = (roomId) => {
    window.location.href = `/room/${roomId}`;
  };

  const handleLeaveRoom = () => {
    window.location.href = '/';
  };

  const progressPercent = getProgressPercent();
  const loopProgressPercent = loopStartMs !== null && loopEndMs !== null && loopEndMs > loopStartMs
    ? Math.max(0, Math.min(100, ((playback?.progress_ms || 0) - loopStartMs) / (loopEndMs - loopStartMs) * 100))
    : 0;
  const loopDuration = getLoopDuration();

  return (
    <div className="min-h-screen bg-spotify-black text-spotify-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header profile={profile} onLogout={async () => {
                  try { await apiClient.logout(); } catch {}
                  localStorage.removeItem('spotify_looper_session');
                  apiClient.clearSession();
                  window.location.href = '/';
                }} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <TrackPanel
                  playback={playback}
                  progressPercent={progressPercent}
                  volume={volume}
                  onPlayPause={() => handleControl(playback?.is_playing ? 'pause' : 'play')}
                  onSeek={(pos) => handleControl('seek', { position_ms: pos })}
                  onVolumeChange={(vol) => { setVolume(vol); handleControl('volume', { percent: vol }); }}
                  devices={devices}
                  currentDeviceId={currentDeviceId}
                  onDeviceChange={(id) => { setCurrentDevice(id); handleControl('transfer', { device_id: id, force_play: true }); }}
                  formatTime={formatTime}
                />
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
                    try { await apiClient.setSegment(ms, loopEndMs); } catch {}
                  }}
                  onSetLoopEnd={async (ms) => {
                    setLoopEnd(ms);
                    try { await apiClient.setSegment(loopStartMs, ms); } catch {}
                  }}
                  onClearLoop={async () => {
                    try { await apiClient.controlLoop('clear_loop'); } catch {}
                    setLoopStart(null); setLoopEnd(null); setLoopEnabled(false);
                  }}
                  onModeChange={async (mode) => {
                    setLoopMode(mode);
                    try { await apiClient.controlLoop('set_mode', { mode }); } catch {}
                  }}
                />
                <RoomPanel
                  roomId={null}
                  isConnected={false}
                  onCreateRoom={handleCreateRoom}
                  onJoinRoom={handleJoinRoom}
                  onLeaveRoom={handleLeaveRoom}
                />
              </div>
              <div className="space-y-6">
                <PresetsPanel
                  presets={presets}
                  onLoadPreset={handleLoadPreset}
                  onSavePreset={handleSavePreset}
                  onDeletePreset={handleDeletePreset}
                  playback={playback}
                  loopStartMs={loopStartMs}
                  loopEndMs={loopEndMs}
                  loopMode={loopMode}
                />
                <DevicesPanel
                  devices={devices}
                  currentDeviceId={currentDeviceId}
                  onDeviceChange={(id) => { setCurrentDevice(id); handleControl('transfer', { device_id: id, force_play: true }); }}
                />
                <SearchPanel />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}