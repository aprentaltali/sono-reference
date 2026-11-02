'use client';
import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Peer from 'peerjs';

export default function ClientSupportPage() {
  const params = useParams();
  const roomID = params.roomID as string;
  const [sharing, setSharing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setSharing(true);

      // Connect to PeerJS cloud network using the roomID as the peer ID
      const peer = new Peer(`client-${roomID}`);
      
      peer.on('call', (call) => {
        call.answer(stream); // Answer incoming call from admin and send screen stream
      });
    } catch (err) {
      console.error("Screen share error:", err);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center', backgroundColor: '#0f172a', color: '#fff', minHeight: '100vh' }}>
      <h1>Remote Support Portal</h1>
      <p style={{ color: '#94a3b8' }}>Session Code: <strong>{roomID}</strong></p>
      {!sharing ? (
        <button onClick={startSharing} style={{ marginTop: '20px', padding: '14px 28px', fontSize: '16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
          Share Screen With Technician
        </button>
      ) : (
        <p style={{ color: '#4ade80', marginTop: '20px' }}>● Screen is live and streaming to technician</p>
      )}
      <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }} />
    </div>
  );
}
