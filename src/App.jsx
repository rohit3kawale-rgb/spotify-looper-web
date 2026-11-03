import React, { useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from './api/client';
import useStore from './store';
import AuthScreen from './components/auth/AuthScreen';
import MainLayout from './components/MainLayout';

function App() {
  const { isAuthenticated, sessionToken, setSession, clearSession, setAuthData, setProfile } = useStore();

  // Initialize auth URL on load - only once to prevent duplicate calls
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { auth_url: url, state, verifier } = await apiClient.getAuthUrl();
        setAuthData(url, verifier, state);
      } catch (err) {
        console.error('Failed to get auth URL:', err);
      }
    };

    // Check if we already have a valid session before initializing auth
    const savedToken = localStorage.getItem('spotify_looper_session');
    // Don't generate a fresh auth URL during the OAuth callback — doing so
    // would overwrite the state/verifier in the backend's _OAUTH_STATE_STORE
    // with a new one, causing the code exchange to fail with "Invalid state".
    const params = new URLSearchParams(window.location.search);
    if (!savedToken && !params.get('code')) {
      initAuth();
    }
  }, [setAuthData]);

  // Restore session from localStorage - only when no valid session exists
  useEffect(() => {
    const savedToken = localStorage.getItem('spotify_looper_session');
    if (savedToken && !isAuthenticated) {
      apiClient.setSession(savedToken);
      // Verify session by fetching auth status
      (async () => {
        try {
          const status = await apiClient.checkAuthStatus();
          // status is {connected, user} with user = raw profile from /me
          if (status.connected && status.user) {
            setProfile(status.user);
            setSession(savedToken, status.user);
          } else {
            throw new Error('Not authenticated');
          }
        } catch {
          localStorage.removeItem('spotify_looper_session');
          apiClient.clearSession();
        }
      })();
    }
  }, [isAuthenticated, setSession, setProfile]);

  // Listen for storage changes (logout from another tab)
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'spotify_looper_session' && !e.newValue) {
        clearSession();
        apiClient.clearSession();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [clearSession]);

  return (
    <div className="min-h-screen bg-spotify-black">
      <AnimatePresence mode="wait">
        {isAuthenticated ? (
          <motion.div
            key="main"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <MainLayout />
          </motion.div>
        ) : (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Routes>
              <Route path="/auth/callback" element={<AuthScreen />} />
              <Route path="*" element={<AuthScreen />} />
            </Routes>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;