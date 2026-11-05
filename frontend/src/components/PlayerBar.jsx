import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import apiClient from '../api/client';
import { sendControl } from '../api/socket';
import useStore from '../store';

export default function PlayerBar() {
  const {
    playback,
    devices,
    currentDeviceId,
    volume,
    setVolume,
    setCurrentDevice,
    setError,
    formatTime,
  } = useStore();

  const [localSeek, setLocalSeek] = useState(null); // ms while dragging
  const [hoverMs, setHoverMs] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  // Time-based progress: anchor = store progress at last sync; we extrapolate
  // from that with the wall clock instead of a per-frame counter.
  const anchorRef = useRef({ at: Date.now(), progressMs: 0 });
  const [renderTick, setRenderTick] = useState(0);

  const item = playback?.item;
  const isPlaying = !!playback?.is_playing;
  const duration = item?.duration_ms || item?.durationMs || 0;

  // Reset the extrapolation anchor whenever the server sends new progress.
  useEffect(() => {
    if (playback?.progress_ms != null) {
      anchorRef.current = { at: Date.now(), progressMs: playback.progress_ms };
    }
  }, [playback?.progress_ms]);

  // While playing, tick the clock to keep the bar moving between WS updates.
  useEffect(() => {
    if (!isPlaying || isDragging) return;
    let raf;
    const loop = () => {
      setRenderTick((t) => t + 1);
      raf = setTimeout(loop, 200);
    };
    raf = setTimeout(loop, 200);
    return () => clearTimeout(raf);
  }, [isPlaying, isDragging]);

  const computeProgress = useCallback(() => {
    if (!isPlaying || !duration) return anchorRef.current.progressMs;
    const elapsed = Date.now() - anchorRef.current.at;
    return Math.min(anchorRef.current.progressMs + elapsed, duration);
  }, [isPlaying, duration]);

  const progress = isDragging && localSeek != null ? localSeek : computeProgress();
  const progressPercent = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
  const hoverPercent = hoverMs != null && duration > 0 ? Math.min(100, (hoverMs / duration) * 100) : null;

  const trackName = item?.name || '';
  const artistNames = Array.isArray(item?.artists)
    ? item.artists.map(a => (typeof a === 'string' ? a : a?.name)).filter(Boolean).join(', ')
    : '';
  // Defensive: album art path can vary; never let a missing field throw.
  const albumArtUrl = item?.albumArtUrl || item?.album?.images?.[0]?.url || '';

  const sliderRef = useRef(null);

  const posToMs = useCallback((clientX) => {
    if (!sliderRef.current || !duration) return null;
    const rect = sliderRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.floor(pos * duration);
  }, [duration]);

  const commitSeek = useCallback((ms) => {
    anchorRef.current = { at: Date.now(), progressMs: ms }; // optimistic
    apiClient.control('seek', { position_ms: ms });
  }, []);

  const handleMouseDown = useCallback((e) => {
    const ms = posToMs(e.clientX);
    if (ms == null) return;
    setIsDragging(true);
    setLocalSeek(ms);
  }, [posToMs]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => setLocalSeek(posToMs(e.clientX));
    const onUp = (e) => {
      const ms = posToMs(e.clientX);
      setIsDragging(false);
      if (ms != null) commitSeek(ms);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, posToMs, commitSeek]);

  // Touch support for mobile seeking
  const handleTouch = useCallback((e) => {
    const t = e.touches?.[0];
    if (!t) return;
    const ms = posToMs(t.clientX);
    if (ms == null) return;
    if (e.type === 'touchend') commitSeek(ms);
    else setLocalSeek(ms);
  }, [posToMs, commitSeek]);

  const handlePlayPause = useCallback(() => {
    const action = isPlaying ? 'pause' : 'play';
    // Optimistic UI flip
    useStore.getState().setPlayback({ ...playback, is_playing: !isPlaying });
    if (!sendControl(action)) {
      apiClient.control(action).catch((err) =>
        setError(err.message || 'Control failed'));
    }
  }, [isPlaying, playback, setError]);

  const handleSkip = useCallback((action) => {
    if (!sendControl(action)) {
      apiClient.control(action).catch((err) =>
        setError(err.message || 'Control failed'));
    }
  }, [setError]);

  const handleVolumeChange = useCallback((vol) => {
    setVolume(vol);
    if (!sendControl('volume', { percent: vol })) {
      apiClient.control('volume', { percent: vol }).catch(() => {});
    }
  }, [setVolume]);

  const handleDeviceChange = useCallback((deviceId) => {
    setCurrentDevice(deviceId);
    apiClient.control('transfer', { device_id: deviceId, force_play: true })
      .catch(() => {});
  }, [setCurrentDevice]);

  const hasTrack = !!item;

  return (
    <motion.div
      initial={{ y: 90 }}
      animate={{ y: 0 }}
      className="fixed bottom-0 left-0 right-0 z-50 bg-spotify-black/95 backdrop-blur-sm border-t border-white/5"
      style={{ height: '90px' }}
    >
      <div className="h-full flex items-center gap-4 px-4">
        {/* Left: track info */}
        <div className="flex items-center gap-3 w-[30%] min-w-[180px]">
          {albumArtUrl ? (
            <img
              src={albumArtUrl}
              alt=""
              className="w-14 h-14 rounded-md object-cover shadow-lg flex-shrink-0"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
            />
          ) : (
            <div className="w-14 h-14 bg-spotify-light-gray rounded-md flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-spotify-gray" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
          <div className="min-w-0 overflow-hidden">
            <p className="text-sm font-medium truncate text-white">
              {trackName || 'Not playing'}
            </p>
            <p className="text-xs truncate text-spotify-gray mt-0.5">
              {artistNames || '—'}
            </p>
          </div>
        </div>

        {/* Center: controls + progress */}
        <div className="flex-1 flex flex-col items-center gap-1.5 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => handleSkip('previous')}
              disabled={!hasTrack}
              className="text-spotify-gray hover:text-white transition-colors disabled:opacity-30"
              aria-label="Previous"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            <motion.button
              onClick={handlePlayPause}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition disabled:opacity-40"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                {isPlaying ? (
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                ) : (
                  <path d="M8 5v14l11-7z" />
                )}
              </svg>
            </motion.button>

            <button
              onClick={() => handleSkip('next')}
              disabled={!hasTrack}
              className="text-spotify-gray hover:text-white transition-colors disabled:opacity-30"
              aria-label="Next"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" transform="translate(4 0)" />
              </svg>
            </button>
          </div>

          <div className="w-full flex items-center gap-2">
            <span className="text-[11px] text-spotify-gray font-mono w-10 text-right tabular-nums">
              {formatTime(Math.floor(progress))}
            </span>
            <div
              ref={sliderRef}
              className="group relative flex-1 h-1 rounded-full bg-white/20 cursor-pointer touch-none"
              onMouseDown={handleMouseDown}
              onMouseMove={(e) => !isDragging && setHoverMs(posToMs(e.clientX))}
              onMouseLeave={() => setHoverMs(null)}
              onTouchStart={handleTouch}
              onTouchMove={handleTouch}
              onTouchEnd={handleTouch}
            >
              {/* hover preview fill */}
              {hoverPercent != null && !isDragging && (
                <div
                  className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
                  style={{ width: `${hoverPercent}%` }}
                />
              )}
              {/* progress fill */}
              <div
                className="absolute inset-y-0 left-0 bg-white group-hover:bg-spotify-green rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
              {/* thumb */}
              <div
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow transition-opacity ${
                  isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                style={{ left: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] text-spotify-gray font-mono w-10 tabular-nums">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right: volume + device */}
        <div className="flex items-center gap-3 w-[30%] min-w-[180px] justify-end">
          <div className="hidden md:flex items-center gap-2">
            <svg className="w-4 h-4 text-spotify-gray hover:text-white cursor-pointer" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-24 h-1 accent-spotify-green cursor-pointer"
              aria-label="Volume"
            />
          </div>

          {devices?.length > 0 && (
            <select
              value={currentDeviceId || ''}
              onChange={(e) => handleDeviceChange(e.target.value)}
              className="bg-spotify-dark-gray text-spotify-gray hover:text-white text-xs rounded-full px-3 py-1.5 border border-transparent hover:border-white/20 focus:outline-none max-w-[130px] truncate cursor-pointer transition"
              aria-label="Playback device"
            >
              <option value="">Device…</option>
              {devices.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.is_active ? ' ●' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </motion.div>
  );
}
