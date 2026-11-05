import React from 'react';

const deviceIcon = (type) => {
  if (type?.includes('phone') || type?.includes('mobile')) return '📱';
  if (type?.includes('computer')) return '💻';
  if (type?.includes('tv')) return '📺';
  if (type?.includes('speaker')) return '🔊';
  if (type?.includes('game')) return '🎮';
  if (type?.includes('cast')) return '📡';
  return '🖥️';
};

export default function DevicesPanel({ devices, currentDeviceId, onDeviceChange }) {
  return (
    <div className="bg-[#181818] rounded-lg p-5 space-y-4">
      <h2 className="text-white font-bold text-xl">Devices</h2>

      {(!devices || devices.length === 0) ? (
        <p className="text-spotify-gray text-sm text-center py-8">No devices found.</p>
      ) : (
        <div className="space-y-1">
          {devices.map(d => (
            <button
              key={d.id}
              onClick={() => onDeviceChange(d.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-md transition-all text-left ${
                d.id === currentDeviceId
                  ? 'bg-spotify-green/20 border border-spotify-green/40'
                  : 'hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="text-xl">{deviceIcon(d.type)}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${d.id === currentDeviceId ? 'text-spotify-green' : 'text-white'}`}>
                  {d.name}
                </p>
                <p className="text-[11px] text-spotify-gray">{d.type || 'Device'}</p>
              </div>
              {d.is_active && (
                <span className="w-2 h-2 rounded-full bg-spotify-green flex-shrink-0" />
              )}
              {d.id === currentDeviceId && (
                <svg className="w-5 h-5 text-spotify-green flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
