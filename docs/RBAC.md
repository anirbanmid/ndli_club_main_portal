# RBAC — NDLI Club Main Portal (M1: enforced)

**Status: M1 delivered.** The permission matrix below is enforced by one central
policy layer (`apps/accounts/policies.py` + `apps/core/scoping.py`), verified by
the named adversarial pins T3/T4 in `backend/tests/`. M2 extends the same layer
with the real assignment tables (State/UT → officer, institution/club FKs).

## Access model (PLAN_ACCESS_ARCHITECTURE.md §1) — 4 categories

| Category | Who | Sub-roles |
| --- | --- | --- |
| `general_public` | Anonymous / public visitors | `anonymous` |
| `club_admin` | Club authorities | `club_executive`, `club_secretary`, `club_president`, `club_patron` |
| `student_member` | Student members | `student_member` |
| `iit_kgp_admin` | IIT Kgp employees (Module 3) | `central_admin`, `regional_officer`, `super_admin_ops` |

An account without a profile is **denied everywhere** (fail-closed).

## Module matrix (category × module)

| Module (namespace) | `general_public` | `club_admin` | `student_member` | `iit_kgp_admin` |
| --- | --- | --- | --- | --- |
| **public** (`/api/v1/public/`, health, cert verifier) | ✅ | ✅ | ✅ | ✅ |
| **club** (`/api/v1/club/`) | ❌ | ✅ | ✅ | ❌ |
| **admin** (`/api/admin/`) | ❌ | ❌ | ❌ | ✅ |

Rules (all pinned by tests):

- **Deny by default.** `DenyAll` is the DRF default permission; every route must
  be explicitly mapped to a module + allowed categories.
- **The admin prefix is the only admin door** — no business surface is reachable
  outside `/api/admin/`, and nothing under it is reachable by non-`iit_kgp_admin`.
- Sub-roles narrow further *inside* a module (e.g. governance actions require
  `central_admin`/`regional_officer`; `super_admin_ops` is ops-only).
- A **pending-approval** account (`account_state=pending_approval`) is denied
  everywhere until approved (F2).
- `must_change_password` blocks everything except the change-password route.
- The admin module requires the **second factor** (TOTP, `mfa_verified` session
  flag) in addition to the login.
- Unknown module/scope names are rejected **early** (before any data access).

## Object scoping (IDOR rules)

Scoping keys are on the profile: `institution_code`, `zone_code`, `club_code`
(plain audited fields in M1 — see ASSUMPTIONS M1-A1; real FKs arrive in M2).

| Actor | May see | Never sees (→ 404, not 403) |
| --- | --- | --- |
| Regional Officer (`EMP01`–`EMP07`) | own **zone** only | other zones (`EMP03` ↛ `EMP05` data) |
| Central Admin | **all** zones (Module 3 is boss of the EMPs, §3b) | — |
| `super_admin_ops` | platform ops only | **every business surface (403)** |
| Student member | **itself** only | any other institution's roster |
| Club admin | own **club** only | other clubs' data; `/api/admin/`; governance |
| Anonymous | public module only | every non-public route (no data leakage) |

Out-of-scope objects raise **404 Not Found** — the response must not confirm that
the object exists.

## Named adversarial pins (CI must prove all)

**T3 matrix** (`tests/test_m1_t3_matrix.py`): deny-all default · module membership
matrix · sub-role narrowing · general public never enters club/admin · each
category stays in its niche · pending account denied · must-change-password
caging · admin second factor · early rejection of unknown module/scope ·
scope violation → 404 · **route walker: no endpoint missing from the matrix** ·
public routes are the only open ones · **views never branch on `request.user`**
(the policy layer is the single decision point).

**T4 IDOR** (`tests/test_m1_t4_idor_scope.py`): `EMP03` never reads `EMP05` data ·
`EMP03` reads its own zone · Central Admin sees every zone · Regional Officer
never sees governance beyond its zone · student never reads another institution's
roster · student sees only itself · student never reaches governance · club admin
never reads another club · club admin never reaches `/api/admin/` or governance ·
no niche but admin reaches the admin module · ops-only Super Admin is 403 on
every business surface · anonymous is denied on every non-public module and
gets no data · the admin module is reachable only under its prefix.

## Enforcement architecture

- `apps/accounts/policies.py` — DRF permission classes (`DenyAll` default,
  module gate, sub-role narrowing). No scattered `if request.user` in views
  (pinned: a grep-based test fails the build if one appears).
- `apps/core/scoping.py` — `ObjectScope` resolves the caller's institution /
  zone / club and filters querysets; out-of-scope lookups raise 404.
- `apps/accounts/routing.py` — F2 approval routing hook (State/UT → responsible
  officer). Returns `None` until M2 seeds the assignment table; callers route by
  zone scope meanwhile (a Regional Officer may act only inside their own zone).

## Roadmap (M2+)

- Real State/UT → officer assignment table (seeds from `data/samples`).
- Scoping keys become FKs (Zone / State / Institution / Club / Authority /
  Membership models).
- Permission matrix rows become data (per-endpoint config) instead of code
  constants — the route walker keeps enforcing completeness.
