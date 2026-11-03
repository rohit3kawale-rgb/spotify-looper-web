import React from 'react';
import { motion } from 'framer-motion';
import useStore from '../store';

export default function Header({ profile, onLogout }) {
  const { toggleSidebar, sidebarOpen } = useStore();

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-spotify-light-gray/20 bg-spotify-dark-gray">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="btn-icon"
          aria-label="Toggle sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">Spotify Looper</h1>
      </div>
      
      <div className="flex items-center gap-4">
        {profile && (
          <div className="hidden md:flex items-center gap-3">
            <motion.span 
              whileHover={{ scale: 1.05 }}
              className="text-sm text-spotify-white"
            >
              {profile.display_name || profile.id}
            </motion.span>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="w-8 h-8 bg-spotify-green rounded-full flex items-center justify-center"
              title={profile.id}
            >
              <span className="text-spotify-black font-bold text-sm">
                {profile.display_name?.[0]?.toUpperCase() || 'U'}
              </span>
            </motion.div>
          </div>
        )}
        
        <button
          onClick={onLogout}
          className="btn-secondary text-sm"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
