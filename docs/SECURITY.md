# Security — NDLI Club Main Portal

**Status: STUB. The threat model and full checklist are delivered in milestone
M1** (with the accounts app: OTP login, sessions, rate limiting, CSP/HSTS).
This placeholder exists from M0 as required by the spec (section 4).

## Baseline already in place (M0)

- Secrets via environment variables only; `.env.example` documents every
  variable; no secrets committed to the repository.
- Session cookies: httpOnly, SameSite=Lax; Secure in production settings.
- CSRF protection middleware enabled; state-changing requests require the CSRF
  token (enforced app-wide in M1's auth flow).
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`; HSTS in `config.settings.prod`.
- PostgreSQL only in production (`config.settings.prod` refuses to start on
  SQLite or a missing `DATABASE_URL`); parameterised queries via the ORM.
- CI: dependency audit (pip-audit, npm audit) and SAST (bandit) from M0.
- Build-failing rule (from M1 onward): no token, user id, request id, APAAR id
  or credential ever appears in a URL, query string, referrer, log line or QR
  payload.

## Delivered in M1

- Threat model (STRIDE-style) and OWASP Top 10 / ASVS L2 checklist.
- Passwordless OTP login (email/SMS adapters, console driver in dev) with
  hashed single-use OTPs, expiry, rate limiting and lockout.
- Staff password + TOTP; Argon2 for stored passwords.
- Strict CSP, HSTS, security headers, session revocation and login audit.
- Alignment notes for CERT-In / STQC expectations.
