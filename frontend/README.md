# Next-Generation NDLI Club Main Portal (`ndli_club_main_portal`)

[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Architecture](https://img.shields.io/badge/Architecture-3--Branch%20Modular-103125)]()

> **Official Modernization Platform for the National Digital Library of India (NDLI) Club**  
> Developed for Indian Institute of Technology Kharagpur & Ministry of Education, Government of India.  
> Directly supersedes the obsolete 2018 Polymer/Vaadin portal at `https://club.ndl.iitkgp.ac.in/`.

---

## 🏛️ Executive Architectural Overview

The portal is architected around a unified **Three-Branch Modular Model** that decouples public discovery, decentralized college club operations, and central regional governance:

```
┌────────────────────────────────────────────────────────────────────────┐
│             NEXT-GENERATION NDLI CLUB ARCHITECTURE (3 BRANCHES)        │
└────────────────────────────────────────────────────────────────────────┘

  BRANCH 1: PUBLIC COMMON LANDING
  ├── Live National Telemetry (live counts in production; prototype shows SAMPLE ONLY demo figures)
  ├── Searchable Institutional Directory (By State, District, AISHE, Name)
  ├── Public Certificate Verifier (Cryptographic Lookup & Dynamic QR Scan)
  └── GIGW 3.0 Accessibility (A+/A- font resizing, High Contrast, Bilingual)

  BRANCH 2: INSTITUTIONAL CLUB MODULE (360° CAMPUS MANAGEMENT)
  ├── 4-Authority Onboarding Wizard (Patron, President, Secretary, Executive)
  ├── Public Club Showcase Page (Custom URL, Campus Passkey, Dynamic QR Code)
  ├── 360° Club Analytics & Direct NAAC Criterion 3.3.3/3.3.4 Report Exporter
  ├── Dynamic Student Roster (Inline Editing, Single Add, Bulk CSV Import)
  ├── Cocurricular Activity Logger (Online, Offline, Hybrid with Notification Triggers)
  ├── Dual-Factor Authority Succession Desk (Dual-Verified Leadership Handoff)
  ├── Student Scholar Workspace (Reading Points, Tier Badging, Certificate Vault)
  └── Inter-Institutional Sharing Shield (Secure Cross-Campus Resource & Activity Hub)

  BRANCH 3: IIT KHARAGPUR CENTRAL ADMINISTRATION MODULE
  ├── 6-Zone Regional Governance Model (7 officers: EMP01 North to EMP07 South Zone 2)
  ├── Institutional Charter Verification & Sanction Gate
  ├── Central Grievance & Technical SLA Dispatcher
  ├── Authority Transition Seal & Approvals
  └── Forensic Data Migration & Quarantine Healing Desk
```

---

## 🛡️ Key Innovations & Ground-Reality Solutions

1. **Inter-Institutional Resource & Activity Sharing Shield:**
   - Breaks geographical barriers between premier institutes (IITs, NITs) and rural colleges.
   - Protected by SHA-256 cryptographic integrity verification, MIME-type heuristics, and airgapped CDN isolation.
2. **Solving the Missing AISHE Code Reality:**
   - Preserves legacy internal database primary keys (`club_id`) so historical links never break.
   - Automated fuzzy string-matching (Levenshtein / Jaro-Winkler) against the Ministry of Education's master AISHE list.
   - Soft-claim onboarding prompts on first login tied to NAAC Criterion 3.3.3 audit downloads.
3. **Solving Personal Student Emails (`@gmail.com`):**
   - Retains relational join tables (`club_members`) and passkey transaction logs directly from the database rather than relying on email domain matching.
   - Uses historical event attendance tables and certificate logs as permanent academic audit trails.
   - Provides a 1-click college link fallback on the student's first OTP login for any severed orphan records.
4. **Migration Without Undocumented Legacy Dependencies:**
   - The legacy backend is consistent with Django REST Framework (DRF) [TO CONFIRM in Phase 1].
   - Relies on the self-documenting `django_migrations` table to automatically reverse-engineer the complete schema history without needing undocumented external knowledge.
5. **Authentic NDLI Brand Palette:**
   - Primary: Deep Forest Green (`#103125`), NDLI Green (`#1A503E`), Emerald Accent (`#0D7751`).
   - Complementary: Warm Amber (`#D97706`, `#F59E0B`) and clean canvas backgrounds (`#F4F8F6`).

---

## 📅 Turnkey 120-Day Implementation Roadmap

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        120-DAY PHASED TURNKEY ROLLOUT TIMELINE                         │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [Phase 1: Days 1–25]   Forensic Discovery, Airgapped Salvage & Schema Reconstruction
  [Phase 2: Days 26–55]  Enterprise Backend & 3-Branch Feature Deepening
  [Phase 3: Days 56–80]  Data Cleansing, Dry-Run Ingestion & Quarantine Review
  [Phase 4: Days 81–100] 100-Club Regional Pilot (UAT), CERT-In Audit & 50k Load Tests
  [Phase 5: Days 101–115] Edge-Case Polish, Regional Training & Disaster Failover Drills
  [Phase 6: Days 116–120] Final Delta Sync, Controlled DNS Cutover & National Launch
  
  ★ FAST-TRACK TARGET: Technical Readiness & UAT Complete by Day 85 (35-Day Buffer)
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### Installation & Local Run
```bash
# Navigate to repository
cd D:\GitHub\ndli_club_main_portal

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The application will be accessible locally at `http://localhost:5173/`.

---

## 📚 Repository Documentation Index

Comprehensive strategic, architectural, and operational documentation is available in the `docs/` folder:

- **[docs/PITCH_PROPOSAL.md](docs/PITCH_PROPOSAL.md):** Executive technical and commercial pitch proposal submitted to IIT Kharagpur and the Ministry of Education.
- **[docs/ARCHITECTURE_PLAN.md](docs/ARCHITECTURE_PLAN.md):** Detailed architectural blueprint, component mapping, and technical audit.
- **[docs/WALKTHROUGH.md](docs/WALKTHROUGH.md):** Interactive demo walkthrough script and test verification guide.

---

*Repository maintained for future operations, development, and deployment of the NDLI Club Portal.*
