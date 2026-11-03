import React, { useState } from 'react';
import { motion } from 'framer-motion';
import apiClient from '../../api/client';

export default function PresetsPanel({
  presets,
  onLoadPreset,
  onSavePreset,
  onDeletePreset,
  playback,
  loopStartMs,
  loopEndMs,
  loopMode,
}) {
  const [newPresetName, setNewPresetName] = useState('');
  const [showSave, setShowSave] = useState(false);

  const canSave = playback?.item && loopStartMs && loopEndMs && loopStartMs < loopEndMs;

  const handleSave = () => {
    if (!newPresetName.trim()) return;
    onSavePreset(newPresetName);
    setNewPresetName('');
    setShowSave(false);
  };

  return (
    <div className="card space-y-4">
      <div className="section-header">
        <span>Presets</span>
        <button
          onClick={() => canSave && setShowSave(true)}
          className="btn-primary text-sm py-2 px-4"
          disabled={!canSave}
        >
          Save
        </button>
      </div>

      {showSave && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-2"
        >
          <input
            type="text"
            placeholder="Preset name..."
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setShowSave(false);
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!newPresetName.trim()}
              className="btn-primary text-sm py-2 px-4 flex-1"
            >
              Save Preset
            </button>
            <button
              onClick={() => setShowSave(false)}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {presets.length === 0 ? (
          <p className="text-sm text-spotify-gray text-center py-4">
            No presets yet
          </p>
        ) : (
          presets.map((preset, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-spotify-dark-gray/50 p-4 rounded-lg space-y-2 group"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{preset.name}</p>
                  <p className="text-xs text-spotify-gray truncate max-w-[200px]">
                    {preset.track_name || 'Unknown track'} - {preset.artist || 'Unknown artist'}
                  </p>
                </div>
                <button
                  onClick={() => onDeletePreset(index)}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                >
                  ✕
                </button>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span>
                  Set: {preset.start_ms || 0} → {preset.end_ms || 0}
                </span>
                <span className="text-spotify-green">{preset.mode || 'loop'}</span>
              </div>

              <button
                onClick={() => onLoadPreset({ ...preset, index })}
                className="w-full btn-secondary text-sm py-2 mt-2"
              >
                Load
              </button>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}