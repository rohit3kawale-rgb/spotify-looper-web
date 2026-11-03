import React, { useEffect } from 'react';
import apiClient from '../../api/client';
import useStore from '../../store';

export default function AuthScreen() {
  const { authUrl, state, setAuthData, setSession, setError, restorePendingVerifier, pendingVerifier } = useStore();

  useEffect(() => {
    // Don't generate a fresh auth URL while handling a callback redirect —
    // that would overwrite the verifier/state we need to exchange the code.
    const params = new URLSearchParams(window.location.search);
    if (params.get('code')) return;
    const init = async () => {
      const { auth_url, verifier: v, state: s } = await apiClient.getAuthUrl();
      setAuthData(auth_url, v, s);
    };
    init();
  }, [setAuthData]);

  useEffect(() => {
    // Restore the PKCE verifier from sessionStorage before handling the callback.
    // (Zustand state is wiped by the full-page redirect back from Spotify.)
    restorePendingVerifier();
  }, [restorePendingVerifier]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    // Read the verifier straight out of sessionStorage rather than relying on
    // the store's pendingVerifier: restorePendingVerifier() above schedules a
    // state update that has not applied by the time this effect runs, so the
    // store value would still be null and the exchange would fail with
    // "PKCE verifier lost", sending the user back to the login screen in a loop.
    const v = sessionStorage.getItem('spotify_looper_verifier');
    const s = sessionStorage.getItem('spotify_looper_state');

    const exchange = async () => {
      try {
        if (!v) throw new Error('PKCE verifier lost. Please try logging in again.');
        if (!s) throw new Error('State parameter lost. Please try logging in again.');
        const data = await apiClient.exchangeCode(code, v, s);
        if (!data || !data.session_token || !data.profile) {
          throw new Error('Authentication verification failed');
        }
        apiClient.setSession(data.session_token);
        setSession(data.session_token, data.profile);
        sessionStorage.removeItem('spotify_looper_verifier');
        sessionStorage.removeItem('spotify_looper_state');
        window.location.href = '/';
      } catch (err) {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    };
    exchange();
  }, [setSession, setError]);

  const handleLogin = () => {
    if (authUrl) window.location.href = authUrl;
  };

  return (
    <div className="min-h-screen bg-spotify-black flex items-center justify-center">
      <div className="bg-spotify-dark-gray p-8 rounded-2xl">
        <h1 className="text-2xl font-bold text-white mb-4">Spotify Looper</h1>
        <button onClick={handleLogin} className="bg-spotify-green text-black px-6 py-3 rounded-full font-semibold">
          Connect to Spotify
        </button>
      </div>
    </div>
  );
}