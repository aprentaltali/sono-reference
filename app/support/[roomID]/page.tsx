'use client';
import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function ClientSupportPage() {
  const params = useParams();
  const roomID = params.roomID;
  const [sharing, setSharing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const startSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setSharing(true);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    } catch (err) {
      console.error("Screen share error:", err);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center', backgroundColor: '#0f172a', color: '#fff', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>Remote Support Portal</h1>
      <p style={{ color: '#94a3b8' }}>Session Code: <strong>{roomID}</strong></p>
      
      {!sharing ? (
        <button 
          onClick={startSharing} 
          style={{ marginTop: '20px', padding: '14px 28px', fontSize: '16px', fontWeight: 'bold', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          Share Screen With Technician
        </button>
      ) : (
        <div style={{ marginTop: '20px' }}>
          <p style={{ color: '#4ade80' }}>● Screen Connection Active</p>
          <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxWidth: '800px', borderRadius: '8px', border: '1px solid #334155' }} />
        </div>
      )}
    </div>
  );
}
