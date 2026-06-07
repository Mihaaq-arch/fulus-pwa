import { useEffect, useRef, useState } from 'react';
import gasScript from '../fulus-gas.js?raw';

const CLIENT_ID = '1041543886873-7baa1h32dkjmjrbrthjqo4q4qe4f64j1.apps.googleusercontent.com';

const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/script.projects',
].join(' ');

const getToken = () => {
    const token = localStorage.getItem('fulus_access_token');
    const expiry = Number(localStorage.getItem('fulus_token_expiry'));
    return token && Date.now() < expiry ? token : null;
};

function generateKey(len = 48) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(len)))
        .map(b => chars[b % chars.length]).join('');
}

// ── STEP 1: sudah selesai di M1-S2 ──────────────────────────
// spreadsheet ID sudah ada di localStorage

// ── STEP 2: Buat Apps Script project (bound ke spreadsheet) ──
async function createScriptProject(token, spreadsheetId) {
    const res = await fetch('https://script.googleapis.com/v1/projects', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: 'Fulus GAS',
            parentId: spreadsheetId,
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || res.statusText;
        if (res.status === 403 && msg.includes('Apps Script API')) {
            throw new Error('__APPS_SCRIPT_API_DISABLED__');
        }
        throw new Error(`Script API error ${res.status}: ${msg}`);
    }
    const { scriptId } = await res.json();
    return scriptId;
}

// ── STEP 3: Upload script content ────────────────────────────
async function uploadScriptContent(token, scriptId, secretKey) {
    const patched = gasScript.replace(
        'CHANGE_WITH_YOUR_KEY_MIN_32_CHARACTERS',
        secretKey,
    );
    const res = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            files: [
                { name: 'fulus-gas', type: 'SERVER_JS', source: patched },
                {
                    name: 'appsscript',
                    type: 'JSON',
                    source: JSON.stringify({
                        timeZone: 'Asia/Makassar',
                        dependencies: {},
                        exceptionLogging: 'STACKDRIVER',
                        runtimeVersion: 'V8',
                        webapp: {
                            executeAs: 'USER_DEPLOYING',
                            access: 'ANYONE',
                        },
                    }),
                },
            ],
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Upload error ${res.status}: ${err?.error?.message || res.statusText}`);
    }
}

// ── STEP 4: Deploy sebagai Web App ───────────────────────────
async function deployWebApp(token, scriptId) {
    // Buat version dulu
    const verRes = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/versions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Fulus v1' }),
    });
    if (!verRes.ok) {
        const err = await verRes.json().catch(() => ({}));
        throw new Error(`Version error ${verRes.status}: ${err?.error?.message || verRes.statusText}`);
    }
    const { versionNumber } = await verRes.json();

    // Deploy version tersebut
    const depRes = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/deployments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            versionNumber,
            manifestFileName: 'appsscript',
            description: 'Fulus auto-deploy',
        }),
    });
    if (!depRes.ok) {
        const err = await depRes.json().catch(() => ({}));
        throw new Error(`Deploy error ${depRes.status}: ${err?.error?.message || depRes.statusText}`);
    }
    const data = await depRes.json();
    const deployId = data.deploymentId;
    return `https://script.google.com/macros/s/${deployId}/exec`;
}

// ── STEP 5: Verify ping ──────────────────────────────────────
async function verifyPing(url) {
    await fetch(`${url}?action=ping`, { method: 'GET', mode: 'no-cors' });
    // no-cors = opaque response, tidak bisa dibaca — tapi kalau tidak throw berarti request sampai
}

async function initSheets(gasUrl, gasKey) {
    const res = await fetch(`${gasUrl}?action=setup&key=${gasKey}`);
    if (!res.ok) throw new Error(`Setup sheets failed: ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`Setup sheets error: ${data.error}`);
}
// ── STEPS config (untuk UI) ──────────────────────────────────
const STEPS = [
    { id: 'spreadsheet', label: 'Membuat spreadsheet' },
    { id: 'script', label: 'Membuat Apps Script' },
    { id: 'upload', label: 'Mengupload script' },
    { id: 'deploy', label: 'Mendeploy Web App' },
    { id: 'verify', label: 'Verifikasi koneksi' },
    { id: 'sheets', label: 'Menyiapkan sheets' },
];

export default function OnboardingScreen({ t, onComplete }) {
    const tokenClientRef = useRef(null);
    const [phase, setPhase] = useState('login'); // login | setup | done | error
    const [currentStep, setCurrentStep] = useState(0); // index ke STEPS
    const [error, setError] = useState('');
    const [errorStep, setErrorStep] = useState(null);
    const [showApiPrompt, setShowApiPrompt] = useState(false);

    const runSetup = async (token) => {
        setPhase('setup');
        setCurrentStep(0);
        setError('');
        setErrorStep(null);

        try {
            const saved = await loadConfigFromDrive(token);
            if (saved?.gasUrl && saved?.gasKey) {
                localStorage.setItem('fulus_spreadsheet_id', saved.spreadsheetId);
                localStorage.setItem('fulus_script_id', saved.scriptId);
                localStorage.setItem('fulus_gas_url', saved.gasUrl);
                localStorage.setItem('fulus_gas_key', saved.gasKey);
                await initSheets(saved.gasUrl, saved.gasKey);
                setPhase('done');
                setTimeout(onComplete, 800);
                return;
            }

            // New user — jalankan setup penuh
            let spreadsheetId = localStorage.getItem('fulus_spreadsheet_id');
            if (!spreadsheetId) {
                const res = await fetch('https://www.googleapis.com/drive/v3/files', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'Fulus Data', mimeType: 'application/vnd.google-apps.spreadsheet' }),
                });
                if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
                spreadsheetId = (await res.json()).id;
                localStorage.setItem('fulus_spreadsheet_id', spreadsheetId);
            }
            setCurrentStep(1);

            let scriptId = localStorage.getItem('fulus_script_id');
            if (!scriptId) {
                scriptId = await createScriptProject(token, spreadsheetId);
                localStorage.setItem('fulus_script_id', scriptId);
            }
            setCurrentStep(2);

            let secretKey = localStorage.getItem('fulus_gas_key');
            if (!secretKey) secretKey = generateKey();
            await uploadScriptContent(token, scriptId, secretKey);
            localStorage.setItem('fulus_gas_key', secretKey);
            setCurrentStep(3);

            const gasUrl = await deployWebApp(token, scriptId);
            localStorage.setItem('fulus_gas_url', gasUrl);
            setCurrentStep(4);

            await verifyPing(gasUrl);
            setCurrentStep(5);

            await initSheets(gasUrl, secretKey);

            await saveConfigToDrive(token, { spreadsheetId, scriptId, gasUrl, gasKey: secretKey });

            setPhase('done');
            setTimeout(onComplete, 800);

        } catch (err) {
            if (err.message === '__APPS_SCRIPT_API_DISABLED__') {
                setShowApiPrompt(true);
                setPhase('error');
                return;
            }
            setError(err.message);
            setErrorStep(currentStep);
            setPhase('error');
        }
    };

    useEffect(() => {
        // Kalau sudah fully configured, skip semua
        if (localStorage.getItem('fulus_gas_url')) { onComplete(); return; }

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
                    if (response.error) { setError(response.error); setPhase('error'); return; }
                    localStorage.setItem('fulus_access_token', response.access_token);
                    localStorage.setItem('fulus_token_expiry', Date.now() + response.expires_in * 1000);
                    runSetup(response.access_token);
                },
            });
        };
        document.body.appendChild(script);
        return () => document.body.removeChild(script);
    }, []);

    const container = {
        background: t.bg, minHeight: '100dvh', maxWidth: 430,
        margin: '0 auto', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Sora', sans-serif", padding: '0 32px',
    };

    // ── LOGIN ────────────────────────────────────────────────
    if (phase === 'login') return (
        <div style={container}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💸</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: t.text, marginBottom: 8 }}>Fulus</div>
            <div style={{ fontSize: 13, color: t.subtext, textAlign: 'center', marginBottom: 40, lineHeight: 1.6 }}>
                Login dengan Google untuk mulai.<br />
                Data kamu tersimpan di Google Drive kamu sendiri.
            </div>
            <button
                onClick={() => tokenClientRef.current?.requestAccessToken({ prompt: 'consent' })}
                style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: '#fff', border: '1.5px solid #dadce0',
                    borderRadius: 12, padding: '12px 24px',
                    fontSize: 14, fontWeight: 600, color: '#3c4043',
                    cursor: 'pointer', boxShadow: '0 1px 3px #0002',
                }}
            >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={20} height={20} alt="" />
                Login dengan Google
            </button>
        </div>
    );

    // ── SETUP PROGRESS ───────────────────────────────────────
    if (phase === 'setup' || phase === 'done') return (
        <div style={container}>
            <div style={{ fontSize: 32, marginBottom: 24 }}>{phase === 'done' ? '✅' : '⚙️'}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 24 }}>
                {phase === 'done' ? 'Fulus siap dipakai!' : 'Menyiapkan Fulus...'}
            </div>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {STEPS.map((s, i) => {
                    const done = phase === 'done' || i < currentStep;
                    const active = i === currentStep && phase === 'setup';
                    return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                                background: done ? t.accent : active ? t.accent + '30' : t.card,
                                border: `2px solid ${done || active ? t.accent : t.border}`,
                                color: done ? (t === t ? '#fff' : '#13141f') : t.accent,
                                transition: 'all 0.3s',
                            }}>
                                {done ? '✓' : active ? '…' : i + 1}
                            </div>
                            <span style={{
                                fontSize: 13, color: done ? t.text : active ? t.accent : t.subtext,
                                fontWeight: active ? 700 : 400, transition: 'all 0.3s',
                            }}>
                                {s.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Progress bar */}
            <div style={{ width: '100%', height: 4, background: t.border, borderRadius: 2, marginTop: 24 }}>
                <div style={{
                    height: 4, borderRadius: 2, background: t.accent,
                    width: `${phase === 'done' ? 100 : (currentStep / STEPS.length) * 100}%`,
                    transition: 'width 0.4s',
                }} />
            </div>
        </div>
    );

    // ── ERROR ────────────────────────────────────────────────
    if (phase === 'error' && showApiPrompt) return (
        <div style={container}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>🔧</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 12, textAlign: 'center' }}>
                Satu langkah lagi
            </div>
            <div style={{ fontSize: 13, color: t.subtext, textAlign: 'center', marginBottom: 28, lineHeight: 1.7 }}>
                Apps Script API perlu diaktifkan sekali di akun Google kamu.<br />
                Klik tombol di bawah, aktifkan, lalu kembali ke sini.
            </div>
            <a href="https://script.google.com/home/usersettings"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    display: 'block', width: '100%', boxSizing: 'border-box',
                    background: t.accent, color: '#fff',
                    borderRadius: 12, padding: '14px',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    textAlign: 'center', textDecoration: 'none', marginBottom: 12,
                }}
            >
                Aktifkan Apps Script API →
            </a>
            <button
                onClick={() => {
                    setShowApiPrompt(false);
                    const token = getToken();
                    if (token) runSetup(token);
                    else setPhase('login');
                }}
                style={{
                    width: '100%', background: 'none',
                    border: `1.5px solid ${t.border}`,
                    borderRadius: 12, padding: '13px',
                    fontSize: 13, color: t.subtext, cursor: 'pointer',
                }}
            >
                Sudah diaktifkan, coba lagi
            </button>
        </div >
    );
    if (phase === 'error') return (
        <div style={container}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 8 }}>
                Gagal di step: {errorStep !== null ? STEPS[errorStep]?.label : ''}
            </div>
            <div style={{ fontSize: 12, color: '#f87171', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
                {error}
            </div>
            <button
                onClick={() => {
                    const token = getToken();
                    if (token) { runSetup(token); }
                    else { setPhase('login'); setError(''); }
                }}
                style={{
                    background: 'none', border: `1.5px solid ${t.border}`,
                    borderRadius: 12, padding: '12px 24px',
                    fontSize: 13, color: t.subtext, cursor: 'pointer',
                }}
            >
                Coba Lagi
            </button>
        </div>
    );

    return null;
}// Cari fulus-config.json di Drive user
async function loadConfigFromDrive(token) {
    const res = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=name%3D'fulus-config.json'&spaces=drive&fields=files(id,name)",
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const { files } = await res.json();
    if (!files?.length) return null;

    // Baca isi file
    const fileRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!fileRes.ok) return null;
    return await fileRes.json(); // { spreadsheetId, scriptId, gasUrl, gasKey }
}

// Simpan config ke Drive sebagai fulus-config.json
async function saveConfigToDrive(token, config) {
    const blob = new Blob([JSON.stringify(config)], { type: 'application/json' });
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({
        name: 'fulus-config.json',
        mimeType: 'application/json',
    })], { type: 'application/json' }));
    form.append('file', blob);

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
}