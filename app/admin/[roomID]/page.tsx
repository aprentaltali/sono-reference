'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Peer from 'peerjs';

export default function AdminDashboard() {
  const params = useParams();
  const roomID = params.roomID as string;
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const peer = new Peer();

    peer.on('open', () => {
      // Automatically call the client running on this session ID
      setTimeout(() => {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(() => {}); // dummy call to unlock media if needed
        const call = peer.call(`client-${roomID}`, (window as any).localStream || new MediaStream());
        
        call.on('stream', (remoteStream) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            setConnected(true);
          }
        });
      }, 2000); // Wait 2 seconds for client to load
    });
  }, [roomID]);

  return (
    <div style={{ backgroundColor: '#020617', color: '#f8fafc', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>Remote Support Console</h2>
        <span style={{ background: '#1e293b', padding: '6px 12px', borderRadius: '6px', fontSize: '14px' }}>
          Session: {roomID} {connected ? '🟢 (Connected)' : '🟡 (Waiting for client...)'}
        </span>
      </header>

      <main style={{ marginTop: '20px', textAlign: 'center' }}>
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          style={{ width: '90vw', height: '80vh', background: '#000', borderRadius: '8px', border: '1px solid #334155' }} 
        />
      </main>
    </div>
  );
}
