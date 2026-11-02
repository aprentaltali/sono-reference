'use client';
import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function ClientSupportPage() {
  const params = useParams();
  const roomID = params?.roomID as string;
  const [sharing, setSharing] = useState(false);
  const [peerReady, setPeerReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Dynamically load PeerJS only in the browser to prevent SSR build crashes
    import('peerjs').then(({ default: Peer }) => {
      if (!roomID) return;
      const peer = new Peer(`client-${roomID}`);
      
      peer.on('open', () => setPeerReady(true));

      peer.on('call', async (call) => {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          if (videoRef.current) videoRef.current.srcObject = stream;
          setSharing(true);
          call.answer(stream);
        } catch (err) {
          console.error("Screen share error:", err);
        }
      });
    });
  }, [roomID]);

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center', backgroundColor: '#0f172a', color: '#fff', minHeight: '100vh' }}>
      <h1>Remote Support Portal</h1>
      <p style={{ color: '#94a3b8' }}>Session Code: <strong>{roomID}</strong></p>
      <p style={{ color: peerReady ? '#4ade80' : '#facc15' }}>
        {peerReady ? '🟢 Ready for technician connection' : 'Connecting to signaling network...'}
      </p>
      <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxWidth: '800px', marginTop: '20px', borderRadius: '8px' }} />
    </div>
  );
}
