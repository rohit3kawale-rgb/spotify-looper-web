import React from 'react';
import { motion } from 'framer-motion';

export default function LoopPanel({
  playback,
  progressPercent,
  loopStartMs,
  loopEndMs,
  loopMode,
  loopDirection,
  loopEnabled,
  loopProgressPercent,
  loopDuration,
  formatTime,
  modes,
  onSetLoopStart,
  onSetLoopEnd,
  onClearLoop,
  onModeChange,
}) {
  const currentPos = playback?.progress_ms ?? playback?.positionMs ?? 0;

  return (
    <div className="card space-y-6">
      <div className="section-header">
        <span>Loop Control</span>
        <span className="text-xs text-spotify-green">
          {loopEnabled ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => onSetLoopStart(currentPos)}
          className="btn-secondary text-sm"
        >
          Set A (Start)
        </button>
        <button
          onClick={() => onSetLoopEnd(currentPos)}
          className="btn-secondary text-sm"
        >
          Set B (End)
        </button>
        <button
          onClick={onClearLoop}
          className="btn-secondary text-sm text-red-400 hover:text-red-300"
        >
          Clear Loop
        </button>
      </div>

      <div className="space-y-3 bg-spotify-black/40 p-4 rounded-xl">
        <div className="flex justify-between text-sm">
          <span className="text-spotify-gray">A: <strong className="text-spotify-white">{loopStartMs ? formatTime(loopStartMs) : 'Not set'}</strong></span>
          <span className="text-spotify-gray">B: <strong className="text-spotify-white">{loopEndMs ? formatTime(loopEndMs) : 'Not set'}</strong></span>
          <span className="text-spotify-gray">Duration: <strong className="text-spotify-white">{loopStartMs && loopEndMs ? formatTime(loopDuration) : 'Not set'}</strong></span>
        </div>

        {loopStartMs !== null && loopEndMs !== null && (
          <div className="space-y-1">
            <div className="slider-container">
              <div className="slider-fill bg-spotify-green" style={{ width: `${Math.max(0, Math.min(100, loopProgressPercent))}%` }} />
            </div>
            <div className="flex justify-between text-xs text-spotify-gray/60">
              <span>{formatTime(loopStartMs)}</span>
              <span>{formatTime(loopEndMs)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Loop Mode</span>
        <select
          value={loopMode}
          onChange={(e) => onModeChange(e.target.value)}
          className="bg-spotify-light-gray text-spotify-white text-sm rounded-lg px-4 py-2 border-none focus:outline-none"
        >
          <option value="Forward">Forward</option>
          <option value="Ping-Pong">Ping-Pong</option>
          <option value="Crossfade">Crossfade</option>
        </select>
      </div>
    </div>
  );
}
