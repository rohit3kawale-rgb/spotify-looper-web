import React from 'react';
import { motion } from 'framer-motion';
import useStore from '../store';

export default function Sidebar() {
  const { sidebarOpen } = useStore();

  if (!sidebarOpen) return null;

  return (
    <motion.aside
      initial={{ x: -280 }}
      animate={{ x: 0 }}
      exit={{ x: -280 }}
      transition={{ duration: 0.2 }}
      className="w-72 bg-spotify-dark-gray border-r border-spotify-light-gray/20 p-6 flex flex-col gap-6"
    >
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-spotify-gray uppercase tracking-wider">Menu</h2>
        <nav className="space-y-1">
          <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-spotify-light-gray text-spotify-white font-medium">
            <span>🏠</span> Looper
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-spotify-light-gray/50 text-spotify-gray hover:text-spotify-white transition-colors">
            <span>📂</span> Presets
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-spotify-light-gray/50 text-spotify-gray hover:text-spotify-white transition-colors">
            <span>🔌</span> Devices
          </a>
        </nav>
      </div>

      <div className="space-y-2 mt-auto">
        <h2 className="text-xs font-semibold text-spotify-gray uppercase tracking-wider">Info</h2>
        <div className="card text-xs text-spotify-gray space-y-1">
          <p className="font-semibold text-spotify-white">Spotify Looper Web</p>
          <p>Real-time Web API + PKCE OAuth</p>
          <p className="text-spotify-green">Status: Connected</p>
        </div>
      </div>
    </motion.aside>
  );
}
