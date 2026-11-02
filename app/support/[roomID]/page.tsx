'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';

export default function ClientSupportPage() {
  const params = useParams();
  const roomID = params?.roomID as string;
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState('Connecting to secure relay...');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!roomID) return;

    import('peerjs').then(({ default: Peer }) => {
      const peer = new Peer(`client-${roomID}`);

      peer.on('open', () => {
        setStatus('Ready. Click below to share your screen.');
      });

      peer.on('call', async (call) => {
        try {
          setStatus('Technician connected. Requesting screen share...');
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setSharing(true);
          setStatus('Screen sharing active.');

          // Answer the admin's call with the local display stream
          call.answer(stream);

          // Handle if user clicks "Stop Sharing" on the browser native banner
          stream.getVideoTracks()[0].onended = () => {
            setSharing(false);
            setStatus('Screen sharing stopped.');
          };
        } catch (err) {
          console.error("Screen share error:", err);
          setStatus('Screen share cancelled or blocked.');
        }
      });
    });
  }, [roomID]);

  const manualShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setSharing(true);
      setStatus('Screen sharing active.');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center', backgroundColor: '#0f172a', color: '#fff', minHeight: '100vh' }}>
      <h1>IT Support Client Portal</h1>
      <p style={{ color: '#94a3b8' }}>Session: <strong>{roomID}</strong></p>
      <p style={{ color: '#38bdf8', margin: '20px 0' }}>{status}</p>

      {!sharing && (
        <button 
          onClick={manualShare}
          style={{ padding: '12px 24px', fontSize: '16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Start Screen Share
        </button>
      )}

      <div style={{ marginTop: '20px' }}>
        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxWidth: '600px', borderRadius: '8px', border: '1px solid #334155' }} />
      </div>
    </div>
  );
}
