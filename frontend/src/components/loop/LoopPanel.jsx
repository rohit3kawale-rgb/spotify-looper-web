import React, { useRef, useState, useEffect, useCallback } from 'react';
import { sendControl } from '../../api/socket';

export default function LoopPanel({
  playback,
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
  onToggleLoop,
}) {
  const [dragging, setDragging] = useState(null); // 'start' | 'end' | null
  const barRef = useRef(null);

  const item = playback?.item;
  const duration = item?.duration_ms || item?.durationMs || 0;
  const progress = playback?.progress_ms || 0;

  // Compute loop range percent from ms values
  const startPct = duration > 0 ? (loopStartMs / duration) * 100 : 0;
  const endPct = duration > 0 ? (loopEndMs / duration) * 100 : 0;

  const handleBarInteraction = useCallback((clientX) => {
    if (!barRef.current || !duration) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  }, [duration]);

  const handleMouseDown = useCallback((e) => {
    const ms = handleBarInteraction(e.clientX);
    if (e.target.classList.contains('loop-thumb-start')) setDragging('start');
    else if (e.target.classList.contains('loop-thumb-end')) setDragging('end');
    else setDragging('both');

    if (dragging === null) {
      if (loopStartMs == null) {
        onSetLoopStart(Math.round(ms));
      } else if (loopEndMs == null) {
        onSetLoopEnd(Math.round(ms));
      }
    }
  }, [handleBarInteraction, dragging, loopStartMs, loopEndMs, onSetLoopStart, onSetLoopEnd]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const ms = Math.round(handleBarInteraction(e.clientX));
      if (dragging === 'start') onSetLoopStart(ms);
      else if (dragging === 'end') onSetLoopEnd(ms);
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, handleBarInteraction, onSetLoopStart, onSetLoopEnd]);

  const hasLoop = loopStartMs != null && loopEndMs != null && loopStartMs < loopEndMs;

  return (
    <div className="bg-[#181818] rounded-lg p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-xl">Loop</h2>
        <button
          onClick={() => onToggleLoop()}
          disabled={!hasLoop && !loopEnabled}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex items-center ${
            loopEnabled && hasLoop
              ? 'bg-spotify-green'
              : 'bg-white/20'
          } disabled:opacity-40`}
          title={loopEnabled ? 'Disable loop' : 'Enable loop'}
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
              loopEnabled && hasLoop ? 'translate-x-[22px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      </div>

      {/* Track context */}
      {item && (
        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-md">
          {item.albumArtUrl ? (
            <img src={item.albumArtUrl} alt="" className="w-10 h-10 rounded object-cover" />
          ) : (
            <div className="w-10 h-10 bg-spotify-light-gray rounded flex items-center justify-center text-xl">🎵</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-medium truncate">{item.name}</p>
            <p className="text-spotify-gray text-xs truncate">
              {Array.isArray(item.artists)
                ? item.artists.map(a => typeof a === 'string' ? a : a?.name).filter(Boolean).join(', ')
                : ''}
            </p>
          </div>
        </div>
      )}

      {/* Loop bar */}
      <div className="space-y-1.5">
        <div
          ref={barRef}
          className="relative h-8 bg-white/10 rounded-full cursor-pointer select-none"
          onMouseDown={handleMouseDown}
          onMouseLeave={() => setDragging(null)}
        >
          {/* Full track background */}
          <div className="absolute inset-0 rounded-full bg-white/5" />

          {/* Loop region */}
          {hasLoop && (
            <div
              className="absolute top-0 bottom-0 bg-spotify-green/30 rounded-full"
              style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
            />
          )}

          {/* Progress overlay within loop */}
          {hasLoop && playback?.is_playing && (
            <div
              className="absolute top-0 bottom-0 bg-white/20 rounded-full"
              style={{
                left: `${startPct}%`,
                width: `${Math.max(0, Math.min(100 - startPct, ((progress - loopStartMs) / (loopEndMs - loopStartMs)) * 100))}%`,
              }}
            />
          )}

          {/* Start thumb */}
          {hasLoop && (
            <div
              className="loop-thumb-start absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow cursor-ew-resize hover:bg-spotify-green transition-colors"
              style={{ left: `calc(${startPct}% - 6px)` }}
            />
          )}

          {/* End thumb */}
          {hasLoop && (
            <div
              className="loop-thumb-end absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow cursor-ew-resize hover:bg-spotify-green transition-colors"
              style={{ left: `calc(${endPct}% - 6px)` }}
            />
          )}

          {/* Playhead */}
          {duration > 0 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-white/60 pointer-events-none"
              style={{ left: `${(progress / duration) * 100}%` }}
            />
          )}
        </div>

        {/* Time labels */}
        <div className="flex justify-between text-[10px] text-spotify-gray font-mono">
          <span>{formatTime(0)}</span>
          {hasLoop && (
            <>
              <span className="text-spotify-green">{formatTime(loopStartMs)}</span>
              <span className="text-spotify-green">{formatTime(loopEndMs)}</span>
            </>
          )}
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { if (duration > 0) onSetLoopStart(progress); }}
          disabled={!item || loopStartMs != null}
          className="flex-1 py-2 rounded-md text-xs font-medium bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Set A
        </button>
        <button
          onClick={() => { if (duration > 0) onSetLoopEnd(progress); }}
          disabled={!item || loopEndMs != null}
          className="flex-1 py-2 rounded-md text-xs font-medium bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Set B
        </button>
        <button
          onClick={() => { onClearLoop(); sendControl('clear_loop'); }}
          disabled={!hasLoop}
          className="flex-1 py-2 rounded-md text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Mode selector */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <span className="text-spotify-gray text-sm">Mode</span>
        <div className="flex gap-1">
          {modes.map(m => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                loopMode === m
                  ? 'bg-spotify-green text-black'
                  : 'bg-white/10 text-spotify-gray hover:text-white hover:bg-white/20'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
