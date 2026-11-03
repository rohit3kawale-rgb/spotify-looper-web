import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '../api/client';
import useStore from '../store';

export default function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const { formatTime, setError } = useStore();

  const debouncedSearch = useMemo(() => {
    let timer = null;
    return (q) => {
      clearTimeout(timer);
      if (!q.trim()) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      timer = setTimeout(async () => {
        try {
          const data = await apiClient.search(q);
          setResults(data.tracks || []);
        } catch (err) {
          console.error('Search failed:', err);
          setResults([]);
        } finally {
          setSearching(false);
        }
      }, 300);
    };
  }, []);

  const handlePlayTrack = async (track) => {
    try {
      await apiClient.control('play', { uris: [track.uri] });
      setError(`Now playing: ${track.name}`);
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      setError(`Failed to play ${track.name}: ${err.message}`);
    }
  };

  return (
    <div className="card space-y-4">
      <div className="section-header">
        <span>Search</span>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); debouncedSearch(query); }} className="relative">
        <input
          type="text"
          placeholder="Search tracks, artists, albums..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); debouncedSearch(e.target.value); }}
          className="input-field pl-10"
        />
        <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-spotify-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </form>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        <AnimatePresence>
          {(results || []).length > 0 && (results || []).map((track, index) => {
            // Support both raw Spotify format and transformed format
            const albumArtUrl = track.albumArtUrl || track.album?.images?.[0]?.url || '';
            const artistNames = Array.isArray(track.artists)
              ? track.artists.map(a => (typeof a === 'string' ? a : a?.name)).filter(Boolean).join(', ')
              : '';
            const durationMs = track.duration_ms || track.durationMs || 0;

            const trackEl = (
              <motion.div
                key={track.id || track.uri || track.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-spotify-light-gray/30 group cursor-pointer"
              >
                <div className="w-10 h-10 bg-spotify-light-gray rounded flex-shrink-0 flex items-center justify-center overflow-hidden">
                  {albumArtUrl ? (
                    <img src={albumArtUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm">🎵</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{track.name}</p>
                  <p className="text-xs text-spotify-gray/60 truncate">
                    {artistNames} • {formatTime(durationMs)}
                  </p>
                </div>
                <button
                  onClick={() => handlePlayTrack(track)}
                  className="opacity-0 group-hover:opacity-100 w-8 h-8 bg-spotify-green rounded-full flex items-center justify-center text-spotify-black hover:scale-105 transition-all"
                  title="Play this track"
                >
                  ▶
                </button>
              </motion.div>
            );
            return trackEl;
          })}
        </AnimatePresence>
        {query.trim() && !searching && results.length === 0 && (
          <p className="text-sm text-spotify-gray text-center py-4">
            No results found for "{query}"
          </p>
        )}
        {!query.trim() && (
          <p className="text-sm text-spotify-gray text-center py-4">
            Type to search Spotify catalog
          </p>
        )}
      </div>
    </div>
  );
}