import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '../api/client';
import useStore from '../store';

export default function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const { setError } = useStore();

  const debouncedSearch = useMemo(() => {
    let timer = null;
    return (q) => {
      clearTimeout(timer);
      if (!q.trim()) { setResults([]); setSearching(false); return; }
      setSearching(true);
      timer = setTimeout(async () => {
        try {
          const data = await apiClient.search(q);
          setResults(data.tracks || []);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      }, 350);
    };
  }, []);

  const handlePlay = async (track) => {
    try {
      // Spotify's play endpoint requires an active device. If the user hasn't
      // transferred playback yet, the request 404s with "No active device".
      // Fall back to the first available device when none is selected.
      const store = useStore.getState();
      let deviceId = store.currentDeviceId;
      if (!deviceId && store.devices?.length) {
        deviceId = store.devices[0].id;
      }
      await apiClient.controlLoop('play', {
        uris: [track.uri],
        device_id: deviceId,
      });
      setTimeout(() => setError(`Now playing: ${track.name}`), 0);
      setTimeout(() => setError(null), 2500);
    } catch (err) {
      setError(err.message || `Failed to play ${track.name}`);
    }
  };

  return (
    <div className="bg-[#181818] rounded-lg p-5 space-y-4">
      <h2 className="text-white font-bold text-xl">Search</h2>

      {/* Search input */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-spotify-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="What do you want to listen to?"
          value={query}
          onChange={e => { setQuery(e.target.value); debouncedSearch(e.target.value); }}
          className="w-full bg-white/10 border border-white/10 rounded-full pl-10 pr-4 py-2.5 text-white text-sm placeholder-spotify-gray/60 focus:outline-none focus:border-spotify-green/60 focus:bg-white/15 transition-colors"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="w-4 h-4 text-spotify-green animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10" />
            </svg>
          </div>
        )}
      </div>

      {/* Results */}
      <AnimatePresence>
        {results.length > 0 ? (
          <div className="space-y-0.5 max-h-72 overflow-y-auto pr-1">
            {results.map((track, i) => {
              const artUrl = track.albumArtUrl || track.album?.images?.[0]?.url || '';
              const artists = Array.isArray(track.artists)
                ? track.artists.map(a => typeof a === 'string' ? a : a?.name).filter(Boolean).join(', ')
                : '';
              return (
                <motion.div
                  key={track.id || track.uri || i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5 transition-colors group cursor-pointer"
                  onClick={() => handlePlay(track)}
                >
                  {artUrl ? (
                    <img src={artUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-spotify-light-gray rounded flex items-center justify-center flex-shrink-0 text-lg">🎵</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{track.name}</p>
                    <p className="text-spotify-gray text-xs truncate">{artists}</p>
                  </div>
                  <div className="text-spotify-gray text-xs tabular-nums flex-shrink-0 mr-2">
                    {Math.floor((track.duration_ms || track.durationMs || 0) / 60000)}:{String(Math.floor(((track.duration_ms || track.durationMs || 0) % 60000) / 1000)).padStart(2, '0')}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-spotify-green flex items-center justify-center text-black opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19" /></svg>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : query.trim() && !searching ? (
          <p className="text-spotify-gray text-sm text-center py-6">No results for "{query}"</p>
        ) : !query.trim() ? (
          <p className="text-spotify-gray text-sm text-center py-6">Search for tracks, artists, or albums</p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
