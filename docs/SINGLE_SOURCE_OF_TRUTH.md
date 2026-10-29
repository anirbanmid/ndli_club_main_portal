# Mandatory Architectural Rule: Single Source of Truth Across Modules

**Status:** Hard-Bound Core Architecture Law  
**Applies To:** All future development across Backend, Frontend, and Admin surfaces.

---

## 1. Core Principle

**There is exactly ONE canonical source of truth for all institutional club data, registrations, renewals, and authority assignments across the entire NDLI Club Main Portal.**

Disparate data sources, parallel mock arrays for live views, and fragmented component states are strictly prohibited. Information always flows unidirectionally from the canonical source to all consuming modules.

---

## 2. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                   SINGLE SOURCE OF TRUTH (BACKEND)                     │
│               apps.domain.clubs.get_all_canonical_clubs()              │
│               - Domain PostgreSQL models (`Club`, `Institution`)       │
│               - Persistent renewal storage (`data/signatures/`)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
               ┌────────────────────┴────────────────────┐
               ▼                                         ▼
   GET /api/v1/clubs/showcase/canonical/                       GET /admin/api/v1/activities/clubs/
   (Public Canonical Clubs API)             (Admin Workspace Clubs API)
               │                                         │
               └────────────────────┬────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   UNIFIED CLIENT DATA REPOSITORY                       │
│                     `src/lib/clubRepository.ts`                        │
│          - Primary: Fetches from /api/v1/clubs/showcase/canonical/ on app mount           │
│          - Fallback: INITIAL_CLUBS used strictly for offline hydration │
│          - Realtime Sync: BroadcastChannel + CustomEvent + localStorage │
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

## 3. Strict Rules for Future Development

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
