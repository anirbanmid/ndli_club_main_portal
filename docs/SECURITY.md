# Security — NDLI Club Main Portal (M1: enforced)

**Status: M1 delivered** — threat notes, header policy, credential rules, rate
limits and the SendGrid handover checklist (BRIEF_M1.md §6). The M0 baseline
(secrets via env, httpsOnly cookies, CSRF, PostgreSQL-only prod, pip-audit +
bandit in CI) still holds and is not repeated here.

## Threat notes (STRIDE-style, M1 scope)

| Threat | Mitigation (pinned by tests) |
| --- | --- |
| **S**poofing | email-only OTP (hashed at rest, single-use, TTL), Argon2id passwords, TOTP 2FA for the admin module, per-club Official Institutional Passkey for F5 |
| **T**ampering | append-only audit log with SHA-256 hash chain; mutation paths raise; chain verification in T5 |
| **R**epudiation | every auth/lifecycle event audited with actor, request id, IP, user-agent, timestamp (T5: exactly one row per action) |
| **I**nformation disclosure | tokens live in URL **fragments**, never query strings; no secret in any response body/audit row (T1); object scoping returns 404 not 403 (T4) |
| **D**enial of service | layered rate limits + lockouts (table below), all env-tunable |
| **E**levation of privilege | deny-by-default policy layer, module matrix, sub-role narrowing, fail-closed (T3/T4) |

## Header policy (every response — 200 **and** 4xx/5xx, T6)

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | camera / microphone / geolocation / payment / usb all denied |
| `Content-Security-Policy` | `script-src 'self'` — **no `unsafe-inline`** (T6 fails the build if one appears); `style-src 'self' 'unsafe-inline'` = documented **M10 tightening target** |
| `X-Request-ID` | **server-generated** (uuid4 hex); a client-supplied value is ignored |

## Credential + token rules

- **Passwords:** Argon2id (`argon2-cffi==25.1.0`, pinned), min length 10, common
  passwords denied, no expiry nagging; `must_change_password` forces a change on
  first use. Passwords are set through `create_user(password=...)` — never stored
  in plaintext or reversibly.
- **Email OTP (F1 verification):** 6 digits · single-use · TTL **10 min** ·
  stored **hashed only** · max **5 sends/hour** per recipient+purpose · max **5
  verify attempts** then a **15-min lockout** · **email is the ONLY channel**
  (there is no SMS transport anywhere — T2 asserts it).
- **Link tokens (F2 welcome / F4 forgot):** 32-byte random, stored hashed,
  single-use, purpose-bound, account-bound. Welcome validity **72 h**,
  forgot-password **30 min**. Delivered **only** via the email channel, and the
  token rides in the URL **fragment** (`#token=…`) — never the query string.
- **TOTP (staff MFA):** `pyotp` (pinned); replay window bounded; one-time
  recovery codes (hashed at rest).
- **Official Institutional Passkey (F5 break-glass):** one **per club**
  (M1-A6), generated at club onboarding, hashed at rest, rotatable. Max **5
  wrong attempts** then a **15-min lockout**. Wrong passkey → **403 + audited**.
  F5 requires BOTH an authenticated admin session (with TOTP) AND the correct
  passkey; it must work with the email provider completely **down** (T7).
  The new password is shown **once** to the admin and handed over **manually**;
  the account is flagged `must_change_password`.

## Rate limits / lockouts (env-tunable via `M1_*`, see `apps/accounts/conf.py`)

| Limit | Default |
| --- | --- |
| OTP sends per recipient+hour | 5 |
| OTP verify attempts before lockout | 5 → lock 15 min |
| Login attempts per IP / 5 min | 10 |
| Login attempts per account / 5 min | 5 → lock 15 min |
| Password-reset requests per address / hour | 3 |
| Passkey failures before lockout | 5 → lock 15 min |

## Build-failing rules (from M1)

1. **No token, OTP, session id, user id, request id or credential in ANY URL,
   query string, referrer, log line or QR payload** (T1 sweeps every route).
2. **No secret in an audit row** (T5).
3. **CSP `script-src` never gains `unsafe-inline`** (T6).
4. **Views never branch on `request.user`** — the central policy layer decides
   (T3 grep pin).

## SendGrid configuration handover checklist (M10 / before client delivery)

The SendGrid driver is **built and unit-tested now** (stubbed HTTP transport,
zero real API calls) but deliberately **unconfigured** — `SENDGRID_API_KEY` empty
⇒ the console driver. Tests never touch a network mail service.

At handover, with the client's SendGrid account:

1. Create an API key with **mail-send scope only**; store it as
   `SENDGRID_API_KEY` in the server `.env` (never in the repo).
2. Set `EMAIL_PROVIDER=sendgrid` (or leave it empty — the key's presence
   auto-selects SendGrid). `DEFAULT_FROM_EMAIL` must be a verified sender.
3. Verify the sending domain: **SPF + DKIM** (and DMARC policy if the client
   runs one).
4. Real-mail smoke (three flows, to real inboxes): welcome (F2),
   change-password, forgot-password (F4) — confirm delivery, that links work,
   and that a second click on the same link is refused (single-use).
5. Confirm the switch needed **no code change** (driver selection is config).
6. Re-run the full suite — it stays green **offline** by design.
7. Record the key owner + rotation date in the handover runbook; rotate the key
   at handover time if it was shared during setup.

## CERT-In / STQC alignment notes

- Time-stamped, tamper-evident audit trail (hash chain) covering authentication
  and privileged actions — the CERT-In log-order shape.
- Credential storage: memory-hard Argon2id; secrets hashed at rest (OTP, link
  tokens, passkeys, recovery codes).
- Session revocation on password change; forced password change after
  break-glass; account lockout on brute force.
