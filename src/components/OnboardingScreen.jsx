import { useEffect, useRef } from 'react';

const CLIENT_ID = '1041543886873-7baa1h32dkjmjrbrthjqo4q4qe4f64j1.apps.googleusercontent.com';
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/script.projects',
].join(' ');

export default function OnboardingScreen({ t, onComplete }) {
    const tokenClientRef = useRef(null);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => {
            tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (response) => {
                    if (response.error) {
                        console.error('OAuth error:', response.error);
                        return;
                    }
                    localStorage.setItem('fulus_access_token', response.access_token);
                    localStorage.setItem('fulus_token_expiry', Date.now() + (response.expires_in * 1000));

                    console.log('Token OK, scopes:', response.scope);
                    onComplete();
                },
            });
        };
        document.body.appendChild(script);
        return () => document.body.removeChild(script);
    }, []);

    const handleLogin = () => {
        tokenClientRef.current?.requestAccessToken({ prompt: 'consent' });
    };

    return (
        <div style={{
            background: t.bg, minHeight: '100dvh', maxWidth: 430,
            margin: '0 auto', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Sora', sans-serif", padding: '0 32px',
        }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💸</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: t.text, marginBottom: 8 }}>Fulus</div>
            <div style={{ fontSize: 13, color: t.subtext, textAlign: 'center', marginBottom: 40, lineHeight: 1.6 }}>
                Login dengan Google untuk mulai.<br />
                Data kamu tersimpan di Google Drive kamu sendiri.
            </div>
            <button onClick={handleLogin} style={{
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