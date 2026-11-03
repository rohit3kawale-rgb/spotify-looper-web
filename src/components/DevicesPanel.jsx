import React from 'react';
import { motion } from 'framer-motion';

export default function DevicesPanel({ devices, currentDeviceId, onDeviceChange }) {
  return (
    <div className="card space-y-3">
      <div className="section-header">
        <span>Playback Devices</span>
      </div>
      
      <div className="space-y-2">
        {(devices?.length ?? 0) === 0 ? (
          <p className="text-sm text-spotify-gray text-center py-4">
            No devices available
          </p>
        ) : (
          devices.map(device => (
            <motion.button
              key={device.id}
              onClick={() => onDeviceChange(device.id)}
              className={`w-full text-left p-4 rounded-xl transition-all ${
                device.id === currentDeviceId
                  ? 'bg-spotify-green/20 border-2 border-spotify-green'
                  : 'bg-spotify-dark-gray/50 hover:bg-spotify-light-gray/30'
              }`}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  device.is_active ? 'bg-spotify-green' : 'bg-spotify-light-gray/50'
                }`}>
                  <span className="text-xs">🔊</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${device.id === currentDeviceId ? 'text-spotify-green' : 'text-spotify-white'}`}>
                    {device.name}
                  </p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs text-spotify-gray">
                      {device.type}
                    </span>
                    {device.is_active && (
                      <span className="text-xs text-spotify-green">● Active</span>
                    )}
                  </div>
                </div>
              </div>
            </motion.button>
          ))
        )}
      </div>
    </div>
  );
}
