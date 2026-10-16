# Walkthrough: Next-Generation NDLI Club Portal & Pitch Solution

> **Target Audience:** IIT Kharagpur (NDLI Central Management Team) & Ministry of Education, Government of India  
> **Replaces:** Legacy portal at `https://club.ndl.iitkgp.ac.in/`  
> **Development Status:** Operational & Verified on `http://localhost:5173/`  
> **Architecture:** 3-Branch Modular System (Public Landing, Institutional Club Module, IIT KGP Admin Module)

---

## 1. Executive Summary & Pitch Readiness

We have engineered a comprehensive, production-grade primary product prototype designed specifically to win the contract for rebuilding the **National Digital Library of India (NDLI) Club Portal**. 

The solution addresses every critical pain point of the legacy system:
1. **Authentic Brand Identity:** Adheres faithfully to the NDLI Forest Green (`#103125`), Deep Teal (`#1A503E`), Emerald Accent (`#0D7751`), and Warm Amber (`#D97706`) design tokens across all views.
2. **Three-Branch Architecture:**
   - **Branch 1: Main / Common Public Landing Page** (Public Directory, National Telemetry, Public Verification, GIGW 3.0 accessibility).
   - **Branch 2: Institutional Club Module** (Onboarding request, Public Club Profile showcase, Club Dashboard with 360 analytics, Student Roster with Passkey/QR + Bulk CSV + inline editing, Activity creator with notification engine, Grievance ticketing, Dual-factor authority succession, Student Workspace, and the Inter-Institutional Resource & Activity Sharing Shield).
   - **Branch 3: IIT Kharagpur Central Administration Module** (Harmonized with the 7-zone regional governance model `EMP01`-`EMP07`, institutional approvals, ticket SLA dispatch, authority transition sanctioning, and forensic corrupted data healing pipeline).
3. **Cyber Security & CERT-In Standards:** Strict zero-trust cross-campus gate, tamper-evident cryptographic QR hashes, pure client-side PDF downloads with zero external email dispatches, and synthetic RFC 2606 demo addresses (`.example.edu`).
4. **Legacy Data Migration Healing:** A forensic quarantine and healing workflow to recover corrupted legacy records, with every recovered record reconciled and reported.

---

## 2. Interactive 3-Branch Architecture & Capabilities

````carousel
```markdown
### Branch 1: Main Public Portal & Landing Page
- **Brand Palette:** NDLI Forest Green (`#103125`) with Warm Amber accents (`#D97706`).
- **Telemetry Counter:** Sample demo figures labelled SAMPLE ONLY (live national counters ship with the data platform) across 36 States & UTs.
- **Public Directory:** Instant search across Indian states, AISHE codes, and institutions with public profile links.
- **Accessibility:** GIGW 3.0 compliant text-resizing (`A-`, `A`, `A+`), high-contrast toggle, and bilingual readiness.
- **Top Bar Switcher:** Seamless instantaneous tab switching between Public Landing, Club Module, and IIT KGP Admin.
```
<!-- slide -->
```markdown
### Branch 2: Institutional Club Module (360° Management)
- **Club Onboarding:** 4-authority registration wizard (Patron, President, Secretary, Executive Member) with instant local charter PDF generation.
- **Public Club Showcase:** Dedicated public profile (`/club/[id]`) with campus passkey, QR code, active events, and leadership cards.
- **Student Roster Management:**
  - One-by-one addition with inline editing.
  - Bulk CSV import with real-time schema validation and instant parsing.
  - Passkey & dynamic QR code student self-enrollment.
- **Annual Cocurricular Activity Logger:**
  - Online, Offline, and Hybrid event creation.
  - Multi-channel notification simulation (In-App + SMS alerts to enrolled students).
  - NAAC Criterion 3.3.3 & 3.3.4 automated report compiler.
```
<!-- slide -->
```markdown
### Branch 2 Feature: Inter-Institutional Resource & Activity Sharing Shield
- **Geographical Barrier Removal:** Allows institutions to co-host activities and share academic resources across India.
- **Zero-Trust Security Gate:** Every shared syllabus, lecture note, or joint webinar undergoes:
  1. Cryptographic SHA-256 integrity hashing.
  2. Automated MIME-type & malware heuristic sanitization.
  3. Strict read-only airgapped CDN containment.
- **Cross-Campus Co-Hosting:** Multiple colleges can co-host national quizzes and seminars with centralized attendance verification.
```
<!-- slide -->
```markdown
### Branch 2 Feature: Student Dashboard & Authority Governance
- **Student Workspace:**
  - Live reading points, tier progression (Bronze to Diamond Scholar), and rank metrics.
  - Event participation tracker with one-click approved certificate downloads.
  - Cross-institutional peer resource repository.
- **Authority Succession Desk:**
  - Secure transition workflow for Patron, President, Secretary, or Executive Member.
  - Mandates dual-factor confirmation and official institutional document uploads.
  - Forwarded to IIT Kharagpur admin for final sanctioning.
- **Grievance Ticketing System:**
  - Direct issue logging categorized by Passkey, Certificates, Logistics, or Glitches.
  - Real-time SLA tracking and resolution notes from regional IIT KGP managers.
```
<!-- slide -->
```markdown
### Branch 3: Central IIT Kharagpur Administration Module
- **6-Zone Regional Governance (7 Officers):** Integrated operational hierarchy (`EMP01` North to `EMP07` South Zone 2) aligned with the existing regional management blueprint.
- **Charter Approval Desk:** Review pending college applications, inspect AISHE codes, verify authorities, and sanction or request revision.
- **Ticket Dispatcher & SLA Monitor:** Central helpdesk routing issues to specific regional node officers.
- **Authority Transition Gate:** Sanction leadership updates with official seal.
- **Forensic Data Migration Desk:**
  - Solves the legacy corrupted database dilemma.
  - Automated schema healing pipeline (normalizing messy strings, deduplicating records, repairing broken AISHE codes).
  - Quarantined records review with single-click auto-heal.
```
````

---

## 3. How to Test & Demo the Live Portal

The development server is running in daemon mode:
- **Local Application URL:** [http://localhost:5173/](http://localhost:5173/)
- **Live State:** Verified with zero TypeScript compilation warnings (`tsc -b && vite build` clean).

### Guided 8-Step Pitch Walkthrough:

1. **Brand & Branch Navigation:**
   - Open [http://localhost:5173/](http://localhost:5173/). Notice the NDLI brand theme (`#103125` forest green hero and `#D97706` amber accents).
   - In the header, notice the 3 main branches: **"Public Portal"**, **"Club Module"**, and **"IIT KGP Admin"**, plus the glowing **"Pitch Deck"** button.
2. **Review the Built-in Pitch Deck:**
   - Click **"Pitch Deck"** in the top navigation.
   - Walk through the 6 slides covering the Technical Audit of the 2018 Polymer legacy system, Benchmarks, the 3-Branch Architecture, 60-Day Migration, and Value Proposition.
3. **Explore the Institutional Club Module:**
   - Click **"Club Module"** in the header.
   - Switch between the sub-tabs:
     - **360° Analytics:** View annual events, active members, certificates issued, and NAAC 3.3 preview.
     - **Student Roster:** Notice the **"Bulk CSV Import"** button, the active search filter, and the student cards with inline editing.
     - **Annual Activities & Workshops:** View scheduled and live activities. Click **"+ Create New Activity"** to test creating an offline/online event with member notification triggers.
     - **Cross-Campus Sharing Shield:** Inspect the inter-institutional security shield, active co-hosted activities, and verified resource repository.
     - **Student Workspace:** View individual scholar points, tier badges, and approved event participation certificates.
     - **Grievance Desk:** Inspect ticket creation and status tracking.
     - **Authority Succession:** Review the secure dual-OTP and document submission protocol.
4. **Test the Public Club Profile Showcase:**
   - In the Club Module header or from the Public Directory, click **"View Public Profile"** for *Presidency University NDLI Club*.
   - View the campus passkey banner (`PRESI-NDL-4412`), dynamic QR code, 4 executive authorities, and verified annual events.
5. **Test the IIT Kharagpur Administration Module:**
   - Click **"IIT KGP Admin"** in the header.
   - Select between the **7 Regional Officers** (`EMP01` North to `EMP07` South Zone 2) to filter regional workloads.
   - Test approving a pending institutional club application.
   - Review and resolve an active grievance ticket.
   - Click the **"Legacy Forensic Migration"** tab: View corrupted legacy records and click **"Auto-Heal & Validate"** to see how the platform restores broken data through the reconciliation workflow.
6. **Test Student Passkey Join:**
   - In the top header, click **"Join with Passkey"**.
   - Enter `IITKGP-NDL-9021` to simulate instant campus chapter enrollment.
7. **Test Local Official Charter Download:**
   - Navigate to *Register Institute* -> Click *Auto-fill Sample Data* -> Proceed through the 4 steps -> Click **"Download Official Charter PDF"**.
   - Notice that it triggers a local browser file download and native Print dialog with zero external network email calls.
8. **Test Public Certificate Verification:**
   - Navigate to *Verify Certificate* -> Lookup `NDLI-A7KQ-2M4X` to inspect tamper-evident verification details.
