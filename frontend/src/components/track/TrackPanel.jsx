import React from 'react';
import { motion } from 'framer-motion';

export default function TrackPanel({
  playback,
  progressPercent,
  volume,
  onPlayPause,
  onSeek,
  onVolumeChange,
  devices,
  currentDeviceId,
  onDeviceChange,
  formatTime,
}) {
  const item = playback?.item;
  // Support both the transformed format (albumArtUrl, artists as strings)
  // used by the WS/REST endpoints and the raw Spotify format (album.images,
  // artists as objects) that some code paths may still pass through.
  const albumArtUrl = item?.albumArtUrl
    || item?.album?.images?.[0]?.url
    || '';
  const artistNames = Array.isArray(item?.artists)
    ? item.artists.map(a => (typeof a === 'string' ? a : a?.name)).filter(Boolean).join(', ')
    : '';
  const albumName = item?.album?.name || '';
  const duration = item?.duration_ms || item?.durationMs || 0;
  const progress = playback?.progress_ms || 0;

  return (
    <div className="card space-y-6">
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="w-24 h-24 md:w-32 md:h-32 bg-spotify-light-gray rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
          {albumArtUrl ? (
            <img src={albumArtUrl} alt="Album Art" className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl">🎵</span>
          )}
        </div>

        <div className="flex-1 text-center md:text-left space-y-2">
          <h2 className="text-2xl font-bold truncate">
            {item?.name || 'Not playing'}
          </h2>
          <p className="text-spotify-gray text-lg truncate">
            {artistNames || 'Select a track on Spotify'}
          </p>
          <p className="text-xs text-spotify-gray/60 truncate">
            {albumName}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={onPlayPause}
            disabled={!item}
            className="w-14 h-14 bg-spotify-green rounded-full flex items-center justify-center text-spotify-black hover:scale-105 transition-transform disabled:opacity-50"
          >
            <span className="text-xl">{playback?.is_playing ? '⏸' : '▶'}</span>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div 
          className="slider-container"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            onSeek(Math.floor(pos * duration));
          }}
        >
          <div className="slider-fill" style={{ width: `${progressPercent}%` }} />
          <div className="slider-thumb" style={{ left: `${progressPercent}%` }} />
        </div>

        <div className="flex justify-between text-xs text-spotify-gray">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-2 border-t border-spotify-light-gray/20">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <span>🔊</span>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="w-32 accent-spotify-green cursor-pointer"
          />
          <span className="text-xs text-spotify-gray">{volume}%</span>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <span className="text-xs text-spotify-gray">Device:</span>
          <select
            value={currentDeviceId || ''}
            onChange={(e) => onDeviceChange(e.target.value)}
            className="bg-spotify-light-gray text-spotify-white text-xs rounded-lg px-3 py-2 border-none focus:outline-none"
          >
            {devices && devices.map(d => (
              <option key={d.id} value={d.id}>
                {d.name} {d.is_active ? ' (Active)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
