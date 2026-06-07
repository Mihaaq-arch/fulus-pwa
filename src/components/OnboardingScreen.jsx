import { useEffect, useRef, useState } from 'react';

const CLIENT_ID = '1041543886873-7baa1h32dkjmjrbrthjqo4q4qe4f64j1.apps.googleusercontent.com';
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/script.projects',
].join(' ');

const getToken = () => {
    const token = localStorage.getItem('fulus_access_token');
    const expiry = Number(localStorage.getItem('fulus_token_expiry'));
    return token && Date.now() < expiry ? token : null;
};

async function createSpreadsheet(token) {
    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fulus Data', mimeType: 'application/vnd.google-apps.spreadsheet' }),
    });
    if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
    const { id } = await res.json();
    localStorage.setItem('fulus_spreadsheet_id', id);
    return id;
}

export default function OnboardingScreen({ t, onComplete }) {
    const tokenClientRef = useRef(null);
    const [step, setStep] = useState('login'); // login | creating | error
    const [error, setError] = useState('');

    const runSetup = async (token) => {
        setStep('creating');
        try {
            await createSpreadsheet(token);
            onComplete();
        } catch (err) {
            setError(err.message);
            setStep('error');
        }
    };

    useEffect(() => {
        // Kalau token masih valid (misal refresh page), skip login langsung setup
        const token = getToken();
        if (token) { runSetup(token); return; }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => {
            tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (response) => {
                    if (response.error) { setError(response.error); setStep('error'); return; }
                    localStorage.setItem('fulus_access_token', response.access_token);
                    localStorage.setItem('fulus_token_expiry', Date.now() + response.expires_in * 1000);
                    runSetup(response.access_token);
                },
            });
        };
        document.body.appendChild(script);
        return () => document.body.removeChild(script);
    }, []);

    const containerStyle = {
        background: t.bg, minHeight: '100dvh', maxWidth: 430,
        margin: '0 auto', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Sora', sans-serif", padding: '0 32px',
    };

    if (step === 'creating') return (
        <div style={containerStyle}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
            <div style={{ fontSize: 14, color: t.subtext }}>Menyiapkan spreadsheet...</div>
        </div>
    );

    if (step === 'error') return (
        <div style={containerStyle}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 13, color: '#f87171', textAlign: 'center', marginBottom: 24 }}>{error}</div>
            <button onClick={() => { setStep('login'); setError(''); }} style={{
                background: 'none', border: `1.5px solid ${t.border}`,
                borderRadius: 12, padding: '12px 24px',
                fontSize: 13, color: t.subtext, cursor: 'pointer',
            }}>Coba Lagi</button>
        </div>
    );

    return (
        <div style={containerStyle}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💸</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: t.text, marginBottom: 8 }}>Fulus</div>
            <div style={{ fontSize: 13, color: t.subtext, textAlign: 'center', marginBottom: 40, lineHeight: 1.6 }}>
                Login dengan Google untuk mulai.<br />
                Data kamu tersimpan di Google Drive kamu sendiri.
            </div>
            <button onClick={() => tokenClientRef.current?.requestAccessToken({ prompt: 'consent' })} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#fff', border: '1.5px solid #dadce0',
                borderRadius: 12, padding: '12px 24px',
                fontSize: 14, fontWeight: 600, color: '#3c4043',
                cursor: 'pointer', boxShadow: '0 1px 3px #0002',
            }}>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={20} height={20} alt="" />
                Login dengan Google
            </button>
        </div>
    );
}