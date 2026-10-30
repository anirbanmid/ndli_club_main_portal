# Mandatory Architectural Rule: Single Source of Truth Across Modules

**Status:** Hard-Bound Core Architecture Law  
**Applies To:** All development across Backend, Frontend, and Admin surfaces.

---

## 1. Core Principle

**There is exactly ONE canonical source of truth for all institutional club data, registrations, renewals, authority assignments, and employee activity ledgers across the entire NDLI Club Main Portal.**

Disparate data sources, parallel mock arrays, fragmented component states, and backdoored database records are strictly prohibited. Information always flows unidirectionally from the canonical source of origin to all consuming modules.

---

## 2. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                   SINGLE SOURCE OF TRUTH (BACKEND)                     │
│               apps.domain.clubs.get_all_canonical_clubs()              │
│               - Domain PostgreSQL models (`Club`, `Institution`)       │
│               - Persistent renewal storage (`data/signatures/`)        │
│               - Ledger Integrity Engine (`apps.domain.integrity`)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
               ┌────────────────────┴────────────────────┐
               ▼                                         ▼
   GET /api/v1/clubs/showcase/canonical/       GET /admin/api/v1/activities/clubs/
   (Public Canonical Clubs API)             (Admin Workspace Clubs API)
               │                                         │
               └────────────────────┬────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   UNIFIED CLIENT DATA REPOSITORY                       │
│                     `src/lib/clubRepository.ts`                        │
│          - Primary: Fetches from /api/v1/clubs/showcase/canonical/     │
│          - Fallback: INITIAL_CLUBS used strictly for offline hydrate   │
│          - Realtime Sync: BroadcastChannel + CustomEvent               │
└───────────────┬───────────────────────────────┬────────────────────────┘
                │                               │
                ▼                               ▼
  ┌───────────────────────────┐   ┌───────────────────────────┐
  │ Module 2: CAMPUS Module   │   │ Module 3: Employee Portal │
  │ Institutional Club Cards  │   │ Universal Club Search     │
  └─────────────┬─────────────┘   └─────────────▲─────────────┘
                │                               │
                │     Realtime Sync Engine      │
                │     (BroadcastChannel API)    │
                └───────────────────────────────┘
```

---

## 3. Strict Rules for Development

### Rule 1: No Competing In-Memory Mock Data in Production Views
- Frontend components must NEVER maintain private, hardcoded lists of clubs, dates, or authority records.
- `mockData.ts` (`INITIAL_CLUBS`) is strictly an offline hydration fallback and initial bootstrap seed. It must never diverge from or compete with backend data.

### Rule 2: Universal Endpoints Must Use `apps.domain.clubs`
- All backend views serving club listings or certificate verifications must query `apps.domain.clubs.get_all_canonical_clubs()` or `apps.domain.clubs.get_club_dates()`.
- Both `/api/v1/clubs/showcase/canonical/` (public) and `/admin/api/v1/activities/clubs/` (employee workspace) return identical records with identical approval dates, registration numbers, and renewal dates.

### Rule 3: Realtime Synchronization on Mutations
- Whenever an employee, authority, or automated system mutates a club record (e.g. registration renewal, charter approval, authority succession, or profile edit):
  1. The backend persists the state immediately.
  2. The frontend dispatches `notifyClubUpdated(clubId, updates)` via `src/lib/clubRepository.ts`.
  3. All open modules across all tabs (Campus Module 2, Universal Search, Public Profiles) listen via `subscribeToClubUpdates()` and reactively re-render the updated state without requiring manual page reloads.

### Rule 4: Data Consistency in Search and Directory
- Any club discoverable in Universal Club Search (Employee Portal) MUST be present in Campus Module 2 (Institutional Club Cards) and vice versa, with identical metadata and dates.

---

## 4. State-Gated Origin & Hard Check Gate (Sealing Backdoors)

To guarantee that no club is created without legitimate origin:

```
[ New Club Formation / Charter Approval / Test Seed ]
                        │
                        ▼
       [ 1. State Verification & Duty Lookup ]
   (Extract club.state -> Resolve officer via OfficerAssignment)
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
  [ No Officer Assigned ]    [ Assigned Officer Found ]
         │                             │
    [ Hard Gate Abort ]                ▼
  (Block creation & log     [ 2. Atomic Transaction (DB Transaction.atomic) ]
   error to Admin)          ├── Write Club record to central database
                            └── Write immutable 'Club Approval' log to
                                ActivityLog (employee=officer, club_code=club.code)
```

1. **Origin Verification Law:**
   Every club in the central database MUST originate from an authentic, immutable `Club Approval` log entry under the Regional Officer assigned to that State.
2. **State Gating:**
   When any club is submitted or approved, the system checks `club.institution.state` and resolves the assigned officer via `apps.domain.assignments.officer_assignment_for_state()`.
3. **Hard Check Gate:**
   - Any raw creation that bypasses the Regional Officer gate is intercepted by the `domain_club_ssot_gate` signal (`apps.domain.signals`).
   - If a club belongs to a State with no assigned Regional Officer in `OfficerAssignment`, the creation is rejected and aborted (`LedgerIntegrityError`).

---

## 5. Continuous Auto-Monitoring & Self-Healing Engine

The system includes a dedicated auto-monitoring and self-repair engine located at `apps.domain.integrity.LedgerIntegrityEngine`.

### Key Functions
- **Bidirectional Ledger Audit:** Scans all active clubs in `Club.objects.filter(is_sample=False)` against `ActivityLog.objects.filter(support_type="Club Approval")`.
- **Auto-Repair:** If any club is missing its `Club Approval` log, or if a legacy log had an empty `club_code`, the engine resolves the jurisdictional officer for the state and automatically heals the record by writing the exact `club_code`, timestamp, and priority flag.
- **Pre-Flight Hook:** Triggered automatically on `GET /admin/api/v1/activities/` so that employee activity history is guaranteed to reflect the latest reconciled truth on load.
- **Management CLI:** Can be executed anytime via:
  ```bash
  python backend/manage.py reconcile_ledger [--strict]
  ```
- **Integrity Status API:** Available at `GET /admin/api/v1/activities/integrity/` for real-time telemetry.

---

## 6. Bidirectional Cross-Verification & UI Parity

1. **Admin Regional Officer Performance Matrix:**
   - Displays real counts of approved clubs, support logs, phone calls, and training sessions derived directly from the verified ledger.
2. **Employee Node Dashboard:**
   - Displays the quota count matching the officer's state-approved clubs.
   - The **Activity History** tab highlights all `Club Approval` records with `★ State Sanctioned` priority, locked status (`🔒 Permanent Record`), and the verified `Club Ref` code.
   - Sub-filters allow officers to isolate `★ Club Approvals`, `Support & Calls`, and `Trainings & Workshops`.
