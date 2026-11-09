# National Digital Library of India (NDLI) Club Main Portal
## Master Technical Architecture, Governance & Project Handoff Documentation

- **Project:** National Digital Library of India (NDLI) Club Main Portal
- **Sponsoring Body:** Ministry of Education, Government of India / IIT Kharagpur
- **Authoritative Branch:** `main`
- **Current HEAD:** `90bdf76` (all 8/8 CI jobs green on GitHub Actions — Run ID `42601486585`)
- **Primary Repositories:**
  - `D:\GitHub\ndli_club_main_portal` (Django 5.2 + React 19 + TypeScript + Vite + PostgreSQL)
  - `c:\Users\HP\Documents\antigravity\calm-faraday` (Local Active Workspace)
- **Status:** **Production Ready** — Complete enterprise role separation, offline-first school identity, cryptographic security hardening, safe descriptor resolution, and single-source-of-truth governance.

---

## 1. Executive Overview & Mission

The **NDLI Club Main Portal** is a mission-critical, national-scale digital infrastructure designed for the National Digital Library of India (MoE, GoI). It federates thousands of Higher Education Institutions (HEIs) and Schools across India into an active, verified, reading and intellectual collaboration network.

The platform provides:
1. **Multi-Tier Institutional Governance**: Distinct operational workflows for HEIs (Universities/Colleges) and Schools.
2. **Offline-First School Tangible Identity**: DPDP Act (2023) compliant student identity management for minors without requiring online accounts or passwords.
3. **Disciplinary Sub-Club Ecosystem**: Academic departmental sub-clubs ($1 + N$ counting) with isolated faculty coordination, temporary password strength enforcement, and student-account hijack protection.
4. **Tamper-Evident Event Lifecycle**: Dynamic 30-minute attendance gating ($T-10\text{m}$ to $T+20\text{m}$) and HMAC-SHA256 cryptographic certificate minting with DigiLocker integration.
5. **Universal Module Navigation**: Persistent high-level navigation across all four functional portal modules via the universal `<Header>`.
6. **Zero-Trust Security Baseline**: Comprehensive mitigation of all Critical (C1–C6), High (H1–H8), Medium (M1–M7), Low (L1–L4), Frontend (A1–A9), and Infrastructure (B1–B8) vulnerabilities.
7. **Strict Territory & Descriptor Safety**: Zero arbitrary `Club.objects.first()` fallbacks; robust `_linked_club()` descriptor resolution preventing `Club.DoesNotExist` crashes on unlinked accounts.
8. **Administrative Member Oversight Desk (Module 4)**: Clear separation of Main Admin authority governance from student workstations. Authentic institution banner rendering, single-source-of-truth telemetry (active HEI sub-club units and genuine student enrollments), zero inclusion of administrative personnel in scholar rosters, and database migration (`0008`) purging legacy rogue profiles.
9. **Multi-Domain Curated Digital Libraries (3-Tier)**: Full resource link validation across all official National Digital Library of India portals (`ndli.iitkgp.ac.in`, `ndl.iitkgp.ac.in`, and `www.ndl.gov.in`).

---

## 2. Core Technology Stack

| Layer | Technologies & Frameworks | Description |
| :--- | :--- | :--- |
| **Backend Framework** | Python 3.12, Django 5.2, Django REST Framework 3.18 | High-throughput, strictly-typed RESTful service architecture. |
| **Database & ORM** | PostgreSQL 16+ (Render Managed Pooler / Port 6543) | Relational persistence with transaction isolation and deterministic migrations. |
| **Caching & Messaging** | Redis 7+ with `ResilientRedisCache`, Celery | Distributed caching with automatic in-process fallback upon broker outages. |
| **Frontend Architecture** | React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4 | Universal Single Page Application (SPA) with client routing and SSR pre-rendering. |
| **Icons & Design System** | Lucide React, WAI-ARIA Accessible Design | Government-grade, high-contrast accessible design system with KaTeX math rendering. |
| **Cryptography & Signatures** | HMAC-SHA256, PBKDF2 (600,000 rounds), Argon2id | Cryptographically sealed tokens, QR payloads, and national certificate credentials. |
| **Edge & Containerization** | Docker (Alpine/Slim), Nginx Reverse Proxy | Non-root `appuser`, strict Content-Security-Policy (CSP), HSTS, and nosniff enforcement. |
| **Continuous Integration** | GitHub Actions (8 Parallel Gated Jobs) | SAST, Mypy type-check, Pytest + Postgres, Ruff lint, Vite build + Axe a11y, Pip/Npm audits, Lighthouse, and Playwright E2E. |

---

## 3. Four-Module Architectural Blueprint

The application is structured into four primary branches, accessible from the universal top `<Header>` navigation bar:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              UNIVERSAL PORTAL ARCHITECTURE                             │
└────────────────────────────────────────────────────────────────────────────────────────┘

  MODULE 1: Public Portal (Landing & Directory)
  ├── Institutional Charter Directory & Public Search
  ├── Public Club Details & Event Calendars
  ├── Verifiable Certificate Authentication Engine (/verify)
  └── Multi-Tier Registration Wizards (HEI & School)

  MODULE 2: Institutional Club Module (CAMPUS 360°)
  ├── Institutional Club Governance & 360° Management
  ├── Statutory Authority Quorum Management (Patron, President, Secretary)
  ├── Transparent View-Only Mode for Student Executive Members
  ├── Disciplinary Sub-Clubs Formation & Coordinator Provisioning (HEI)
  ├── Offline-First School Roster & A4 Membership Card Printing (School)
  └── Institutional & Collaborative Event Management

  MODULE 3: Central Admin & Nodal Command (IIT Kharagpur)
  ├── Charter Application Review & Approval State Machine
  ├── 6-Zone Regional Support Desk Management (EMP01–EMP07)
  ├── Zonal Officer Renewal Desk & State-wise Outreach Directives
  ├── 3-Tier Grievance Redressal SLA Escalation Ladder
  └── State Penetration & Retention Deficit Analytics

  MODULE 4: Club Member & Scholar Module
  ├── Student Scholar Workspace: Points, Badges, Event Action, DigiLocker Vault
  ├── Student Executive Desk: Scholar Workspace + View-Only Campus Link
  ├── Departmental Coordinator Desk: Sub-Club Roster, Suspensions, Cert Sign-offs
  └── Administrative Member Oversight: Main Admin Roster View + Return to Module 2
```

---

## 4. Multi-Tier Institutional Role Separation & Quorum

The system enforces unambiguous boundaries between institutional statutory officers, student executives, faculty coordinators, and student scholars.

### Authority Matrix

| Role | Classification | Module 2: Campus (Institutional) | Module 4: Club Member Module |
| :--- | :--- | :--- | :--- |
| **Patron** | Main Admin | **Full Mutation Authority**: Approve/reject rosters and individual join requests, form sub-clubs, set member validity (1–6 yrs), create events, sign event certificates, alter branding & passkeys. | **Administrative Oversight Desk**: Institutional roster telemetry, filtering by Dept/Year/Sub-club, 1-click jump to Module 2. **No fake student profile.** |
| **President** | Main Admin | **Full Mutation Authority**: Form disciplinary sub-clubs, provision coordinator temporary passwords, approve join requests, update branding, create events. | **Administrative Oversight Desk**: Institutional roster oversight. No student reading points or self-participation badges. |
| **Secretary** | Main Admin | **Full Mutation Authority**: Member approvals, event creation, conductor assignments, roster management, branding updates. | **Administrative Oversight Desk**: Institutional roster oversight. |
| **Executive Council Member** *(HEI Only)* | Student Executive | **View-Only Mode**: Complete operational visibility (analytics, rosters, events) for fair transparency. **Forbidden from mutations**: Cannot confirm/reject join requests (`MAIN_CLUB_ADMIN_GATE` 403), cannot update branding (`_is_main_club_admin` 403), cannot create events (403), cannot delete members or alter passkeys. | **Full Scholar Access**: Active student scholar workspace with reading points, tier badges (Bronze/Silver/Gold/Platinum), event action window, and certificate vault. |
| **Sub-Club Coordinator** *(HEI Only)* | Sub-Admin | **No Access**: Completely isolated from central club governance, university-wide branding, and main passkeys. Cannot create main-club events. | **Departmental Coordinator Desk**: Manage students assigned to their academic sub-club, temporarily suspend/unsuspend students, and sign off certificates for sub-club events. |
| **Student Member** | Club Member | **No Access**: Restricted from administrative settings and governance actions. | **Student Scholar Workspace**: Reading points telemetry, 30-min event attendance, certificate download, DigiLocker storage, and personal library curation. |

### Sub-Club Coordinator Account Provisioning & Protection Guards

1. **Faculty-Only Guard (`_is_student_account`)**:
   - Sub-club coordinators must be institutional faculty members.
   - When provisioning (`SubClubListView.post`) or editing (`SubClubDetailView.patch`), the backend rejects existing student accounts (`Category.STUDENT_MEMBER`, `SubRole.STUDENT_MEMBER`, `SubRole.CLUB_EXECUTIVE`, or any user with a `StudentMemberProfile`).
   - Returns `HTTP 400 Bad Request` with `code="invalid_coordinator"` and detail `"this email already belongs to an existing student account — pick a different action."`
   - Prevents accidental student role conversions and credential overwrites.
2. **Temporary Password Strength Enforcement (M6)**:
   - Initial temporary passwords and password updates for coordinators must strictly pass `validate_password_strength()` before accounts are created or updated.
   - Weak passwords immediately return `HTTP 400 Bad Request` (`code="invalid_password"`).
3. **Provisioning by Main Admin**:
   - In `SubClubManagementPanel.tsx`, a Main Admin inputs Coordinator Name, Email, Phone, and an Initial Temporary Password (with a 1-click generator).
   - The backend creates a real PostgreSQL `User` account:
     - `category = Category.CLUB_ADMIN`
     - `sub_role = SubRole.SUBCLUB_COORDINATOR`
     - `club = club`
     - `sub_club = sub_club`
     - `must_change_password = True` (Single Source of Truth)
     - `is_active = True`
4. **First Login Password Interception**:
   - When the coordinator signs in with the temporary password, `EnforcedPasswordChangeModal.tsx` intercepts the session before granting workspace access.
   - The coordinator defines their private password, setting `must_change_password = False`.
   - The Main Admin no longer has access to the coordinator's credentials. Zero SMTP dependency.

---

## 5. Safe Descriptor Resolution & Territory Isolation

### 1. `_linked_club(user)` Helper
`User.club` is a ForeignKey with `default="", null=False, to_field="code", db_constraint=False`. For a clubless account (`club_id=""`), direct attribute access (`user.club`) triggers a database descriptor query that misses and raises `Club.DoesNotExist`. Standard `getattr(user, "club", None)` does not suppress this exception.

The `_linked_club(user)` helper safely catches `Club.DoesNotExist` and returns `None`. It is universally applied across:
- `_is_main_club_admin`
- `_is_main_club_authority`
- All branches of `StudentMemberMeView`

### 2. Elimination of Arbitrary `Club.objects.first()` Fallbacks
In `StudentMemberMeView` (`/api/v1/members/me/`):
- **Main Admin Desk**: A clubless Main Admin account is presented with an honest empty desk (`StudentMemberProfile.objects.none()`). IIT Kharagpur Admins without a club receive their duty-scoped aggregate via `scope_clubs()`.
- **Coordinator Desk**: A clubless coordinator receives an empty desk, never another institution's sub-clubs.
- **Student Workspace**: A student account without a linked club receives an honest `HTTP 404 Not Found` (`"No club is linked to this account."`), and no profile is created in an arbitrary club.

---

## 6. Offline-First School Identity (DPDP Act 2023 Compliance)

For primary, secondary, and senior secondary schools, individual online accounts for minors are eliminated to adhere strictly to the Digital Personal Data Protection (DPDP) Act 2023.

1. **Bulk CSV Ingestion**:
   - School authorities upload an annual student roster via `SchoolBulkUploadPanel.tsx`.
   - The system validates fields, removes malicious formula characters (preventing CSV injection), and generates deterministic, collision-free Student UIDs:
     $$\text{UID} = \text{SCH}-[\text{StateCode}]-[\text{ClubCode}]-[\text{Class}]-[\text{Serial}]$$
2. **Printable A4 Membership Card Sheets**:
   - `SchoolMembershipCardPrintModal.tsx` renders a standardized $2 \times 4$ grid (8 cards per A4 page) complete with:
     - Official NDLI Club logo and Ministry of Education banner.
     - School name, student name, class, section, and deterministic UID.
     - Cryptographic verification QR code linking directly to the portal verification engine.
     - Print-optimized CSS (`@media print`) for physical issuance by the school principal.
3. **Attendance via Post-Event CSV Upload**:
   - School event participants are recorded offline by teachers and uploaded in batch via `EventParticipantUploadView`, crediting institutional participation metrics without minor authentication credentials.

---

## 7. Comprehensive Security Hardening & Remediation Index

All verified vulnerabilities from the prior security audit and subsequent refinement passes have been reconciled, unit tested, and permanently deployed to `main`:

### Critical Vulnerabilities (C1 – C6)
- **C1 (Password Reset Token Leak)**: Fixed in `6214224`. Anonymous `forgot-check` endpoint stopped returning plaintext tokens in HTTP response bodies; tokens are cryptographically hashed, single-use, and throttled.
- **C2 (Emergency Reset Privilege Escalation)**: Fixed in `d74f616`. Removed fake 6-character TOTP bypass (`"123456"`, etc.); locked endpoint to `CategoryGate("admin")` with real TOTP secret verification.
- **C3 (Known Hardcoded Passwords in Migrations)**: Fixed in `feebac9`, `447a066`, `a7040e9`. Removed unconditional `Password@123` overrides from data migrations 0004, 0005, and 0006; non-destructively flagged legacy seed accounts with `must_change_password=True`.
- **C4 (Unauthenticated Enrollment Takeover & Auto-Activate)**: Fixed in `2582773`. `StudentJoinRegisterView` rejects existing emails with `400 email_exists`, ignores client-supplied `auto_activate` booleans, removes public club code passkey fallbacks, enforces `validate_password_strength`, and throttles requests per IP.
- **C5 (Unauthenticated Student Membership Termination)**: Fixed in `2582773`. `TerminateMembershipView` requires valid new-club passkey resolution, returns uniform 404s to prevent account enumeration, prevents self-club loops, throttles requests, and records audit logs.
- **C6 (Hardcoded Master Password Backdoors in Activities)**: Fixed in `8b98d09` & `3d232f6`. Removed all backdoor password strings (`"admin123"`, `"Admin@123"`, `"Password@123"`) from `EventCertificateApprovalView` and `VerifyEmployeePasswordView`; bound approvals strictly to authenticated host-club authority sessions.

### High Vulnerabilities & Role Boundaries (H1 – H8)
- **H1 (X-Forwarded-For Rate Limit Spoofing)**: Fixed in `132e0f9`. Throttling `client_ip()` updated to read the rightmost untrusted hop rather than the client-controlled first hop.
- **H2 (Captcha Backdoor & Lockout Dead Code)**: Fixed in `2126292`. Gated `DEV_TEST` bypass string strictly to `settings.DEBUG`; wired `record_login_failure` and `locked_until` directly into `password_login`.
- **H3 (Unauthenticated Authority Revocation)**: Fixed in `60057ce`. Throttled authority deactivation endpoints and unified email check response bodies to prevent directory harvesting.
- **H4 (School Roster Authorization Scoping)**: Fixed in `ea009ba`. Enforced `_is_main_club_authority(actor, club)` on roster upload, approval, rejection, and card fetch endpoints.
- **H5 (Student Roster IDOR via URL Parameter)**: Fixed in `ea009ba`. Prohibited cross-club student profile queries for student accounts; scoped access strictly to authenticated club authorities.
- **H6 (Sub-Club & Branding Authority Mutations)**: Fixed in `babfa48` and refined in `ec6ffcf`. Replaced `AllowAny` with `IsAuthenticated + MAIN_CLUB_ADMIN_GATE`; eliminated `User.objects.first()` fallbacks; restricted branding updates strictly to Main Admins (Patron, President, Secretary), rejecting Student Executives with 403 Forbidden.
- **H7 (Curated Library IDOR & Defacement)**: Fixed in `1bfbba7`. Enforced owner/club matching on library PATCH, DELETE, and resource addition endpoints; restricted anonymous reads to `is_published_to_community=True`.
- **H8 (Event Creation Authority Scoping)**: Fixed in `3d232f6` and refined in `ec6ffcf`. Restricted event creation strictly to `_is_main_club_admin(user, club)` or superusers; rejected student executives and coordinators with lingering authority assignment records. Masked attendee PII from unauthorized viewers.
- **Join Decision Scoping**: Refined in `ec6ffcf`. Individual `JoinRequestConfirmView` and `JoinRequestRejectView` upgraded to `MAIN_CLUB_ADMIN_GATE` (returns 403 for student executives).

### Medium Vulnerabilities (M1 – M7)
- **M1 (Pre-Approval Passkey Oracle)**: Fixed in `ea009ba`. Added rate-limiting sliding window on `CheckPreapprovalView`.
- **M2 (Unthrottled Auth Endpoints & Weak Reset Confirm)**: Fixed in `a995b6f`. Applied `_throttled` wrappers on reset confirm and club mutation views; enforced `validate_password_strength`.
- **M3 (Arbitrary File Uploads & Unsafe Media Serving)**: Fixed in `5fb6d2f`. Configured canonical `MEDIA_ROOT` and `MEDIA_URL`; validated extensions, file sizes, and image integrity via Pillow; served media with `nosniff` headers.
- **M4 (CSV Formula Injection / CSV Spreadsheet Exploits)**: Fixed in `6aff3c7`. Applied `roster_csv.neutralize_cell` across all activity CSV exporters and attendance manifest downloads.
- **M5 (Demo Credentials Leaking in Production Bundle)**: Fixed in `ee68c0c`, `7bd3cff`, `179074f`. Gated all test credential buttons and quick-fill panels behind `import.meta.env.DEV` or `VITE_SHOW_TEST_PANELS==='1'`.
- **M6 (Admin & Coordinator Password Policy)**: Fixed in `8071042` and extended in `ec6ffcf`. Enforced `validate_password_strength` on admin user creation, update, club password reset, and coordinator temporary password provisioning.
- **M7 (Weak Docker-Compose Secrets Defaults)**: Fixed in `8071042`. Required explicit environment variable overrides in compose definitions, removing insecure defaults.

### Low, Frontend & Infrastructure Findings (L1 – L4, A1 – A9, B1 – B8)
- **L1 (PBKDF2 Iterations)**: Increased iterations to 600,000 rounds in `hashers.py` per OWASP recommendations.
- **L2 (API Docs Exposure)**: Gated `/api/schema/` and `/api/docs/` to `settings.DEBUG`.
- **L3 / B3 (Cookie Hardening)**: Enforced `SESSION_COOKIE_SECURE = True` and `CSRF_COOKIE_SECURE = True`. Corrected `CSRF_COOKIE_HTTPONLY` to ensure React frontend CSRF token interoperability (`c962247`).
- **A4 (Client-Side Captcha Bypass Removal)**: Removed client-only captcha bypass in club renewal security challenges (`bc76712`).
- **A5 (Open Redirect Sanitization)**: Fixed tab/newline open-redirect bypasses in `returnTo.ts` using strict URL origin matching.
- **A6 (Joining Link Scheme Allowlist)**: Enforced strict `http://` and `https://` schemes on event joining links, blocking `javascript:` stored XSS (`9f7d1cb`).
- **A7 (Query String Passkey Removal)**: Dropped `?passkey=` query branch in `App.tsx`, adhering to URL fragment (`#passkey=`) privacy rules.
- **A8 (Resume Token Storage Migration)**: Migrated onboarding draft tokens from `localStorage` to `sessionStorage` (`179074f`, `4385d00`).
- **A9 (Dead Code Removal)**: Removed obsolete `charterGenerator.ts` and `RegisterClubView.tsx`.
- **B1 (Docker Build Context Protection)**: Created root `.dockerignore` excluding `.env`, `.git`, `.venv`, `db.sqlite3`, and identity documents (`5591b9c`).
- **B4 (Nginx Production Security Headers)**: Added strict Content-Security-Policy (CSP), HSTS, and X-Content-Type-Options to `infra/nginx.conf`.
- **B5 (Secret Key Denylist)**: Added startup assertion in `prod.py` rejecting weak or default `SECRET_KEY` strings.
- **B6 (Local Compose Port Binding)**: Pinned MinIO container tag and bound ports strictly to `127.0.0.1`.
- **B7 (GitHub Actions Workflow Hardening)**: Added top-level `permissions: { contents: read }` and pinned `browser-driver-manager` in CI (`5591b9c`).
- **B8 (Vendored Swagger Assets)**: Vendored `swagger-init.js` locally, eliminating runtime HTML scraping from production hosts (`9f7d1cb`).

### 7.3 Module 4 Administrative Member Oversight Desk Revamp

In response to institutional governance requirements, the **Module 4 Administrative Member Oversight Desk** was completely re-engineered as an authoritative, real-time command dashboard for all Main Admins (**Patron**, **President**, and **Secretary**) across both HEIs and Schools:

1. **Role Separation & Executive Guardrails**:
   - Main Admins (Patron, President, Secretary) share the identical comprehensive governance layout.
   - Student Executives (`CLUB_EXECUTIVE`) remain cleanly partitioned: they have view-only access in Module 2 and retain their dedicated Student Member workspace in Module 4. Non-student administrative accounts never have dummy student profiles.

2. **Automated Notification Engine & Interactive Bell Centre**:
   - Centralized, standalone notification generator `generate_club_oversight_notifications(club, days_remaining, upcoming_renewal_date, is_overdue)` in `backend.apps.members.services`.
   - Automated server-pushed & client-computed priority notifications:
     - Renewal warnings at **30 days** and **15 days** prior to club registration expiry.
     - Grace-period and overdue renewal warnings (`X Days Expired`) with non-negative formatting.
     - IIT Kharagpur zonal officer endorsements (charter approvals, activity approvals, renewal logs).
   - High-visibility notification centre with unread badge count, "Mark all read", backdrop click dismissal, and close button.
   - Live Click-to-Modal:
     - Clicking a renewal alert opens the `RenewalApplicationModal` with renewal requirements and direct navigation to Module 2.
     - Clicking an endorsement opens the `ApprovalDetailsModal` with the official IIT Kharagpur certification seal and verification timestamp.

3. **Multi-Institution Support (HEIs & Schools)**:
   - For Higher Education Institutions (HEIs), queries `StudentMemberProfile` for genuine student scholars.
   - For K-12 Schools, automatically queries `SchoolStudentRoster` (offline tangible identity), populating active scholars, roster counts, and enrollment trend lines for school administrative officers without requiring minor online accounts.

4. **5 Dynamic KPI Cards**:
   - **Event Count KPI**: Total events organized with completed vs upcoming event ratio.
   - **Validity Countdown Timer KPI**: Dynamic countdown in days (`X Days Remaining`), status indicator (Normal, 30-Day Warning, 15-Day Critical, Expired), quick "Renew Now" action trigger, and subscript displaying the last renewal date.
   - **3-Tier Library Telemetry KPI**: Real-time click and interaction telemetry tracking usage across Tier 1 (Club Official), Tier 2 (Personal Study), and Tier 3 (Inter-Club Community Hub) libraries.
   - **Certificates Issued KPI**: Total official certificates issued till date for the institutional club, HMAC-SHA256 verifiable.
   - **Enrolled Scholars KPI**: Active vs suspended scholar ratio.

5. **Animated Line Graph Telemetry**:
   - Dual-metric animated SVG trend graph illustrating the last 5 years of activity:
     - Events Hosted (Emerald trend line with SVG keyframe stroke animation and translucent emerald fill).
     - Scholars Enrolled (Indigo trend line with SVG keyframe stroke animation and translucent indigo fill).
   - Interactive SVG data points with hover tooltips displaying exact annual metrics, with clean dismissal on mouse leave.

6. **Institutional Administrative Roster**:
   - Main Club Leaders (Patron, President, Secretary) with direct email, phone, and active authority badges. Resolved using latest appointment ordering (`-from_date, -id`) to guarantee SSOT without historical overwrite.
   - Departmental Sub-Club Coordinators with discipline tags, names, and contact channels.

7. **Advanced Filterable Scholars Roster**:
   - Comprehensive scholar table showing Name, Email, Roll Number, Department / Class, Sub-Club membership badges, Enrollment Year, Validity Date, and Status.
   - Real-time instant filters: Full-text search, Department / Class dropdown, Sub-Club dropdown, Enrollment Year dropdown, and Status filter (All / Active / Suspended).

8. **Event Lifecycle Hub & Query Optimization**:
   - High-visibility Upcoming Event cards (Date, Category, Mode, Start Time).
   - Completed Events table with historical participation and attendee counts, optimized using `annotate(attendee_tally=Count("attendees"))` to eliminate N+1 queries.

9. **Secure 3-Tier Library Click Telemetry**:
   - Model field `clicks_count` added to `CuratedResourceLink` with migration `0002_curatedresourcelink_clicks_count.py`.
   - Endpoint `POST /api/v1/sharing/resources/<id>/click/` tracks learner interactions using atomic `F("clicks_count") + 1` with IP sliding-window rate limiting (120 req/min) to prevent DDoS and click-fraud.

---

## 8. Verification Suite & CI/CD Status

The project enforces an automated 8-job GitHub Actions workflow on every push to `main`. Every job must pass green:

```
✓ main CI · 42601486585 (commit 90bdf76)
Triggered via push

JOBS:
  ✓ SAST (bandit)                                Passed in 13s
  ✓ Type check (mypy)                            Passed in 28s (0 issues in 71 files)
  ✓ Tests (pytest + Postgres)                    Passed in 4m13s (710 passed, 952 subtests passed)
  ✓ Lint (ruff)                                  Passed in 8s
  ✓ Frontend build + axe accessibility           Passed in 47s (Clean bundle + 0 a11y violations)
  ✓ Dependency audit (pip-audit + npm audit)     Passed in 36s (0 known vulnerabilities)
  ✓ Lighthouse (a11y hard gate)                  Passed in 1m37s (Category score ≥ 0.90)
  ✓ E2E + axe (Playwright, V8)                   Passed in 1m12s (All 27 integration specs passed)
```

### Local Verification Commands

```bash
# 1. Backend Lint & Type Checks
cd backend
.\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\mypy.exe apps/accounts apps/domain apps/clubs apps/members apps/activities tests/test_campus_module.py

# 2. Backend Automated Test Suite
.\.venv\Scripts\pytest.exe tests/test_campus_module.py -v

# 3. Frontend Typecheck, Build & SSR Prerender
cd ..\frontend
npm run lint
npm run build
```

---

## 9. Client Handover & Production Deployment Checklist

When preparing for final institutional handover to the Ministry of Education / IIT Kharagpur operational team:

1. **Purge Development Demo Accounts**:
   ```bash
   python manage.py purge_demo_accounts --confirm
   ```
2. **Verify Inactive Demo UI Panels**:
   - Ensure the production environment does NOT set `VITE_SHOW_TEST_PANELS=1`.
   - In production builds (`npm run build`), all quick-fill buttons and demo account badges are automatically excluded from the bundle.
3. **Database Migrations Sequence**:
   ```bash
   python manage.py migrate --noinput
   ```
4. **Environment Variables Configuration**:
   - `DJANGO_SETTINGS_MODULE=config.settings.prod`
   - `DATABASE_URL=postgresql://<user>:<password>@<host>:6543/<db>?sslmode=require`
   - `REDIS_URL=rediss://<user>:<password>@<host>:<port>`
   - `DJANGO_SECRET_KEY=<cryptographically-random-50-character-string>`
   - `SESSION_COOKIE_SECURE=True`
   - `CSRF_COOKIE_SECURE=True`
   - `MEDIA_ROOT=/var/data/ndli_media`
5. **Future SMTP Activation Seam**:
   - Outgoing email alerts and password reset links are architected around standard Django email backends. When an SMTP server is provisioned, set `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, and `EMAIL_HOST_PASSWORD` in production environment settings. No core schema changes are required.

---

## 10. Repository File Manifest

```
ndli_club_main_portal/
├── Handoff.md                           # Master Project Documentation & Architecture (this document)
├── README.md                            # High-level repository orientation
├── .github/
│   └── workflows/
│       └── ci.yml                       # Hardened 8-job CI pipeline
├── backend/
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py                  # Core configuration & cookie security
│   │   │   ├── dev.py                   # Local development settings
│   │   │   └── prod.py                  # Hardened production settings (secret key gate)
│   │   └── urls.py                      # Root URL routing & API docs DEBUG gate
│   ├── apps/
│   │   ├── accounts/                    # Auth, User model, policies, hashers, throttles
│   │   ├── activities/                  # Events, 30-min window, certificate sign-offs
│   │   ├── certificates/                # HMAC-SHA256 crypto signing, DigiLocker
│   │   ├── clubs/                       # Club management, sub-clubs, branding
│   │   ├── core/                        # Middleware, cache, frontend SPA serving
│   │   ├── domain/                      # Institution, Club, SubClub, Zone models
│   │   ├── governance/                  # MCC insights, central directives, audits
│   │   ├── members/                     # Student profiles, school roster, points engine
│   │   ├── onboarding/                  # Registration wizards, resume tokens
│   │   └── sharing/                     # 3-tier curated libraries & NDLI domain validation
│   └── tests/
│       └── test_campus_module.py        # 39+ end-to-end campus security & role tests
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx               # Universal top header & Module Switcher (Modules 1-4)
│   │   │   ├── ClubModuleView.tsx       # Module 2: Institutional Campus Dashboard
│   │   │   ├── AdminModuleView.tsx      # Module 3: Central Admin Command Desk
│   │   │   ├── AdminMccPanels.tsx       # MCC insights, renewal desk, penetration modals
│   │   │   ├── NotificationBell.tsx     # High-visibility notification flyout
│   │   │   ├── activities/              # Event modals, cards, 2-phase approval modals
│   │   │   ├── auth/                    # Login, EnforcedPasswordChangeModal, forgot password
│   │   │   ├── clubs/                   # Sub-club management & coordinator password generator
│   │   │   ├── members/                 # MemberModuleView (Scholar, Coordinator, Admin desks)
│   │   │   ├── onboarding/              # HEI & School registration wizards, resume modals
│   │   │   └── sharing/                 # CuratedLibraryHub 3-tier interactive repository
│   │   ├── lib/
│   │   │   ├── campusApi.ts             # Typed API client for campus & member endpoints
│   │   │   ├── adminApi.ts              # Typed API client for central administration
│   │   │   └── authApi.ts               # Authentication & password management client
│   │   └── App.tsx                      # Root application router & branch state orchestrator
│   └── e2e/                             # Playwright integration & accessibility specs
└── infra/
    ├── nginx.conf                       # Edge reverse-proxy with strict CSP/HSTS headers
    ├── docker-compose.yml               # Local service composition (127.0.0.1 bindings)
    └── docker/
        └── backend.Dockerfile           # Non-root secure container image
```
