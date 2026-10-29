/**
 * M5-D1 Master Login Gate (IIT Kharagpur Central Master Administration & 6 Regional Zones).
 *
 * Full fidelity reproduction of the Master Access Gateway from `templates/index.html` & `templates/employee.html`:
 * - Deep emerald gradient background with glowing ambient radial lights
 * - Solid #0A1A10 lock card with 22px border radius
 * - Amber header badge "🔒 Secure Enterprise Access Gateway"
 * - Prominent central NDLI Club Logo with orbital running light trail
 * - Org link with NDLI seal linking to ndl.iitkgp.ac.in
 * - 2-column fields grid (User ID / Email + Password with Show/Hide toggle)
 * - Anti-bot alphanumeric captcha verification widget with refresh
 * - Big amber gradient unlock button "🔓 Unlock System Access →"
 * - 7 Nodal Officers Quick-Select directory chips with regional pastel color accents
 * - Error shake animation and clear alerts
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  AuthApiError,
  fetchSession,
  passwordLogin,
  SessionPayload,
} from '../../lib/authApi';
import { ApiError } from '../../lib/api';
import {
  consumeInterruptedRoute,
  isSafeLocalPath,
  peekInterruptedRoute,
} from '../../lib/returnTo';
import type { AppRoute } from '../../lib/route';

interface LoginViewProps {
  initialNext?: string;
  onNavigate?: (route: AppRoute) => void;
  onSignedIn?: (session: SessionPayload) => void;
  fullViewport?: boolean;
}

type FlowError =
  | { kind: 'verdict' | 'rate-limit'; message: string }
  | { kind: 'network' | 'server'; message?: string };

const CAPTCHA_SRC = '/api/v1/accounts/captcha/';

function flowErrorFrom(err: unknown): FlowError {
  if (err instanceof ApiError) {
    if (err.kind === 'network') return { kind: 'network', message: 'Network error. Please check your connection.' };
    const detail = err instanceof AuthApiError ? err.detail : null;
    if (err.kind === 'rate-limit') {
      return { kind: 'rate-limit', message: detail ?? err.message };
    }
    if (detail !== null) return { kind: 'verdict', message: detail };
    return { kind: 'server', message: 'Authentication server error.' };
  }
  return { kind: 'server', message: 'Unable to authenticate. Please try again.' };
}

const NODAL_OFFICERS = [
  { id: 'EMP01', name: 'Rohan Sharma', zone: 'North', bg: '#E2F0FB', color: '#1E5F8C' },
  { id: 'EMP02', name: 'Pooja Verma', zone: 'Central', bg: '#EDE9FB', color: '#5B45A8' },
  { id: 'EMP03', name: 'Amit Patel', zone: 'West', bg: '#FDEFD9', color: '#92500B' },
  { id: 'EMP04', name: 'Debabrata Ghosh', zone: 'East', bg: '#D9EFE4', color: '#0A5C3E' },
  { id: 'EMP05', name: 'M. Singh', zone: 'North East', bg: '#FBE9EC', color: '#9F1239' },
  { id: 'EMP06', name: 'K. Venkatesh', zone: 'South 1', bg: '#E4F3F7', color: '#17637A' },
  { id: 'EMP07', name: 'Ananya Nair', zone: 'South 2', bg: '#E4F3F7', color: '#17637A' },
];

export const LoginView: React.FC<LoginViewProps> = ({
  initialNext = '',
  onNavigate,
  onSignedIn,
  fullViewport = true,
}) => {
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [captchaSrc, setCaptchaSrc] = useState(() => `${CAPTCHA_SRC}?t=${Date.now()}`);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<FlowError | null>(null);
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);

  const [returnTo] = useState<string | null>(() => {
    const next = initialNext.trim();
    return isSafeLocalPath(next) ? next : peekInterruptedRoute();
  });

  const refreshCaptcha = (): void => {
    setCaptcha('');
    setCaptchaSrc(`${CAPTCHA_SRC}?t=${Date.now()}`);
  };

  const returnToInterruptedRoute = (): void => {
    const stored = consumeInterruptedRoute();
    const target = returnTo !== null && isSafeLocalPath(returnTo) ? returnTo : stored;
    if (target !== null && isSafeLocalPath(target)) {
      window.location.assign(target);
      return;
    }
    onNavigate?.({ tab: 'home', certId: '', next: '', slug: '' });
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const existing = await fetchSession();
        if (cancelled || existing === null) return;
        setSession(existing);
        onSignedIn?.(existing);
        returnToInterruptedRoute();
      } catch (err) {
        if (!cancelled) setError(flowErrorFrom(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const established = await passwordLogin(
        employeeCode.trim(),
        password,
        captcha.trim(),
      );
      setSession(established);
      onSignedIn?.(established);
    } catch (err) {
      setError(flowErrorFrom(err));
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      refreshCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const selectOfficer = (id: string) => {
    setEmployeeCode(id);
    if (passwordRef.current) {
      passwordRef.current.focus();
    }
  };

  const content = (
    <div className={`lock-card ${shaking ? 'shake-anim' : ''}`} id="lock-card-box">
      <span className="lock-header-badge">
        <span>🔒</span> Secure Enterprise Access Gateway
      </span>

      {/* PROMINENT CENTRAL NDLI CLUB LOGO WITH GLOWING LIGHT TRAIL */}
      <div className="logo-trail-container">
        <svg className="logo-trail-svg" viewBox="0 0 96 96">
          <defs>
            <linearGradient id="lightTrailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="30%" stopColor="#FDE68A" />
              <stop offset="70%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="92" height="92" rx="14" className="trail-track" pathLength="500" />
          <rect x="2" y="2" width="92" height="92" rx="14" className="trail-light-runner" pathLength="500" />
        </svg>
        <div className="logo-white-card">
          <img
            src="/static/img/ndli_club_logo.png"
            alt="NDLI Club Logo"
            className="brand-logo-img"
          />
        </div>
      </div>

      <div className="lock-org-line">
        <a
          href="https://ndl.iitkgp.ac.in"
          target="_blank"
          rel="noopener noreferrer"
          title="Visit Official National Digital Library of India Portal"
        >
          <img
            src="/static/img/NDLI_Main_Logo_Small_Green.png"
            alt="NDLI"
            style={{ height: '18px', width: '18px', verticalAlign: '-4px', marginRight: '6px', objectFit: 'contain', display: 'inline' }}
          />
          National Digital Library of India
        </a>
      </div>

      <h1 className="lock-title">NDLI Club Management System</h1>
      <p className="lock-sub">
        IIT Kharagpur Central Master Administration Office • 6 Regional Nodal Zones
      </p>

      {/* Error alert banner */}
      {error && (
        <div
          id="lock-alert"
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(248, 113, 113, 0.4)',
            color: '#FCA5A5',
            padding: '0.45rem 0.75rem',
            borderRadius: '8px',
            fontSize: '0.78rem',
            fontWeight: 600,
            marginBottom: '0.65rem',
            textAlign: 'left',
          }}
        >
          <span>⚠️ </span>
          {'message' in error && error.message
            ? error.message
            : 'Authentication failed. Please verify credentials and captcha.'}
        </div>
      )}

      {/* MASTER LOGIN FORM */}
      <form id="master-lock-form" onSubmit={handleSignIn}>
        <div className="lock-fields-grid">
          <div className="lock-form-group">
            <label htmlFor="lock-identifier">User ID / Email</label>
            <input
              type="text"
              id="lock-identifier"
              className="lock-input"
              placeholder="e.g. EMP01 or admin@iitkgp.ac.in"
              required
              autoComplete="username"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
            />
          </div>

          <div className="lock-form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <label htmlFor="lock-password" style={{ margin: 0 }}>Password</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', color: '#34d399', fontSize: '0.72rem', cursor: 'pointer', padding: 0 }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              id="lock-password"
              className="lock-input"
              placeholder="Enter password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {/* ANTI-BOT CAPTCHA VERIFICATION WIDGET */}
        <div className="lock-form-group" style={{ marginBottom: '0.65rem' }}>
          <label htmlFor="lock-captcha-input">Security Verification (Anti-Bot Captcha)</label>
          <div className="captcha-container">
            <img
              src={captchaSrc}
              alt="Security captcha"
              style={{
                height: '34px',
                width: '120px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                background: '#ffffff',
                objectFit: 'contain',
              }}
            />
            <button
              type="button"
              className="btn-captcha-refresh"
              onClick={refreshCaptcha}
              title="Generate New Captcha"
            >
              ↻ Refresh
            </button>
            <input
              type="text"
              id="lock-captcha-input"
              className="lock-input"
              style={{ flex: 1, padding: '0.45rem 0.65rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' }}
              placeholder="Enter Code"
              maxLength={8}
              required
              autoComplete="off"
              value={captcha}
              onChange={(e) => setCaptcha(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn-unlock"
          id="btn-master-unlock"
          disabled={busy || !employeeCode.trim() || !password || !captcha.trim()}
          style={{ opacity: busy ? 0.7 : 1 }}
        >
          <span>🔓</span> {busy ? 'Verifying Credentials…' : 'Unlock System Access →'}
        </button>
      </form>

      {/* QUICK CREDENTIAL ASSISTANT FOR 7 OPERATIONAL ZONES */}
      <div style={{ marginTop: '0.85rem', borderTop: '1px dashed rgba(255, 255, 255, 0.15)', paddingTop: '0.65rem', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#FCD34D' }}>
            7 Nodal Officers Directory (Click to select):
          </span>
          <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Quick-Select</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {NODAL_OFFICERS.map((off) => {
            const isSelected = employeeCode.trim().toUpperCase() === off.id;
            return (
              <button
                key={off.id}
                type="button"
                onClick={() => selectOfficer(off.id)}
                style={{
                  background: isSelected ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                  border: isSelected ? '1px solid #34d399' : '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  padding: '3px 7px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1px',
                  minWidth: '85px',
                  flex: '1 1 85px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, color: '#FFFFFF', fontSize: '0.70rem' }}>{off.id}</span>
                  <span style={{ fontSize: '0.58rem', background: off.bg, color: off.color, padding: '1px 4px', borderRadius: '4px', fontWeight: 700 }}>
                    {off.zone}
                  </span>
                </div>
                <span style={{ color: '#cbd5e1', fontSize: '0.62rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {off.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="lock-footer-info">
        National Digital Library of India Club Management System • Central Administration &amp; 6 Regional Zones
      </div>
    </div>
  );

  if (fullViewport) {
    return (
      <div id="app-lock-gate" className="lock-screen-overlay">
        {content}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0' }}>
      {content}
    </div>
  );
};
