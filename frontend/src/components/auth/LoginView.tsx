/**
 * M5-D1 Master Login Gate (Universal Secure Access Gateway).
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
 * - Error shake animation and clear alerts
 * - Zero viewport overflow: compact dimensions perfectly calibrated for laptop and mobile screens
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import ndliClubLogo from '../../assets/img/ndli_club_logo.png';
import ndliMainLogoSmallGreen from '../../assets/img/NDLI_Main_Logo_Small_Green.png';

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

  const returnToInterruptedRoute = useCallback((): void => {
    const stored = consumeInterruptedRoute();
    const target = returnTo !== null && isSafeLocalPath(returnTo) ? returnTo : stored;
    if (target !== null && isSafeLocalPath(target)) {
      window.location.assign(target);
      return;
    }
    onNavigate?.({ tab: 'home', certId: '', next: '', slug: '' });
  }, [returnTo, onNavigate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const existing = await fetchSession();
        if (cancelled || existing === null) return;
        onSignedIn?.(existing);
        returnToInterruptedRoute();
      } catch (err) {
        if (!cancelled) setError(flowErrorFrom(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onSignedIn, returnToInterruptedRoute]);

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
            src={ndliClubLogo}
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
            src={ndliMainLogoSmallGreen}
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

      <div className="lock-footer-info">
        National Digital Library of India Club Management System • Central Administration &amp; Regional Nodal Operations
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
