import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import apiClient from '../api/client';
import useStore from '../store';

export default function RoomPanel({ roomId, isConnected, onCreateRoom, onJoinRoom, onLeaveRoom }) {
  const [rooms, setRooms] = useState([]);
  const [showRoomList, setShowRoomList] = useState(false);
  const { setError } = useStore();

  useEffect(() => {
    const loadRooms = async () => {
      try {
        const roomList = await apiClient.listRooms();
        setRooms(Array.isArray(roomList) ? roomList : []);
      } catch (err) {
        console.error('Failed to load rooms:', err);
      }
    };
    loadRooms();
  }, []);

  const copyShareUrl = () => {
    if (roomId) {
      const url = `${window.location.origin}/room/${roomId}`;
      navigator.clipboard.writeText(url);
      setError('Room link copied to clipboard!');
      setTimeout(() => setError(null), 3000);
    }
  };

  if (!roomId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <div className="section-header">
          <span>Rooms</span>
          <button onClick={onCreateRoom} className="btn-primary text-sm">
            Create Room
          </button>
        </div>

        {showRoomList && rooms && rooms.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {rooms?.map(room => (
              <motion.button
                key={room.room_id}
                onClick={() => onJoinRoom(room.room_id)}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-full text-left p-4 rounded-xl bg-spotify-dark-gray/50 hover:bg-spotify-light-gray/30 transition-colors flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{room.name}</p>
                  <p className="text-xs text-spotify-gray">
                    {room.user_count} user{room.user_count !== 1 ? 's' : ''} • Owner: {room.owner_id.slice(0, 8)}
                  </p>
                </div>
                <span className="text-spotify-green text-sm">Join</span>
              </motion.button>
            ))}
          </div>
        )}

        {!showRoomList && rooms.length > 0 && (
          <button
            onClick={() => setShowRoomList(true)}
            className="btn-secondary text-sm w-full"
          >
            Browse {rooms.length} public room{rooms.length !== 1 ? 's' : ''}
          </button>
        )}

        {rooms.length === 0 && (
          <p className="text-sm text-spotify-gray text-center py-4">
            No public rooms yet. Create the first one!
          </p>
        )}
      </motion.div>
    );
  }

  // In a room
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
    >
      <div className="section-header">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-spotify-green' : 'bg-red-400'}`} />
          <span>Room: {roomId.slice(0, 12)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyShareUrl} className="btn-secondary text-sm" title="Copy share link">
            🔗 Copy Link
          </button>
          <button onClick={onLeaveRoom} className="btn-secondary text-sm text-red-400 hover:text-red-300">
            Leave
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-spotify-gray">
          Share this link to invite others:
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={`${window.location.origin}/room/${roomId}`}
            className="input-field flex-1 bg-spotify-black/40"
          />
          <button onClick={copyShareUrl} className="btn-primary">
            Copy
          </button>
        </div>
      </div>
    </motion.div>
  );
}