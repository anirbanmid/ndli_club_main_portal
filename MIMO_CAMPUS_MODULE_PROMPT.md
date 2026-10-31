# MASTER TASK INSTRUCTION & PROMPT: INSTITUTIONAL CLUB MODULE (CAMPUS)
**Role:** Super Senior Full-Stack Architect & Principal Lead Engineer  
**Target Execution Agents:** MIMo (MiniMax / Open-Source Local Engine), Claude 3.5 Sonnet, GPT-4o  
**Repository Context:** `D:\GitHub\ndli_club_main_portal` (Django 5.x + React 19 + TypeScript + TailwindCSS + PostgreSQL)  
**Standard of Verification:** Zero Mock Logic, 100% Relational Single Source of Truth (SSOT), Pass All Linters (`ruff`, `mypy`, `oxlint`), Unit Tests (`pytest`), and Playwright E2E.

---

## 1. MISSION OBJECTIVE
You are tasked with engineering the core **Institutional Club Module (CAMPUS)** for the National Digital Library of India (NDLI) Club Portal. This module is the national flagship for establishing academic clubs across all 36 States and Union Territories.

You must implement the complete specification with strict adherence to architectural separation between:
1. **Type A: Higher Educational Institutions (HEI)** (Universities/Colleges: 1 Main Club + N Sub-Clubs, 4-tier authority quorum, self-service authenticated student accounts, 3-tier libraries, event collaboration engine, gamification).
2. **Type B: Schools (Offline-First Tangible Identity Architecture)** (Primary/Secondary/Higher Secondary: 1 single club, 3-tier authority quorum, bulk CSV member upload with **Deterministic Student UIDs (`SCH-[State]-[Club]-[Class]-[Serial]`)**, **Printable NDLI Club Membership Cards Sheet (A4 PDF)**, and bulk ZIP participation certificates with permanently stamped Student UIDs).

---

## 2. STRUCTURAL ARCHITECTURE & GOVERNANCE RULES

### A. Higher Educational Institutions (HEI)
* **Federated Club Structure:** 1 Main Club + arbitrary disciplinary Sub-Clubs (e.g., Chemistry, Cultural, Robotics).
* **National Club Counting Law:** 
  $$\text{Total Clubs} = \text{Main Club (1)} + \sum \text{Sub-Clubs}(N)$$
  *Example:* Institution ABC with 1 Main Club and 5 Sub-Clubs counts as $1 + 5 = 6$ clubs nationally.
* **4-Tier Authority Quorum:**
  1. **Patron:** Head of Institution (VC / Principal / Director)
  2. **President:** Faculty Coordinator / Dean / Librarian
  3. **Secretary:** Librarian / Assistant Librarian
  4. **Executive Member:** Student Council Lead / Nominee
* **Sub-Club Formation Lifecycle:**
  - Formed directly by Main Club Patron, President, or Secretary from their dashboard.
  - **Does NOT require IIT KGP central/regional officer approval.**
  - Main Club authorities assign a **Sub-Club Coordinator** for each Sub-Club.
* **Strict Permission Split:**
  - **Main Club Authorities:** Exclusive authority to permanently ADD and REMOVE student accounts from the club.
  - **Sub-Club Coordinator:** May block/suspend or edit/modify members assigned to their respective sub-club; approves participation certificates for events conducted under their sub-club.

### B. Schools (Offline-First Tangible Identity)
* **Single Club Model:** Exactly 1 Main Club. No sub-clubs allowed.
* **3-Tier Authority Quorum:**
  1. **Patron:** Head of Institution (HM / Principal)
  2. **President:** Any Teacher
  3. **Secretary:** Librarian / Any Teacher
  *(Executive Member is omitted for Schools).*
* **Management, Tangible Identity & Certifications:**
  - Authorities directly manage members via Bulk CSV Upload (`Full Name`, `Gender`, `Class`, `Section`, optional `Guardian Phone`).
  - **Deterministic Student UID Generation:** Auto-assigns stable UID formatted as `SCH-[State Code]-[Club ID]-[Class]-[Serial]` (e.g. `SCH-WB-0042-IXB-015`).
  - **Printable Membership Cards Sheet (A4 PDF):** Generates an A4 sheet (grid of 8-10 cards per page) with School Name, NDLI Club Logo, Student Name, Class, Section, Student UID, and QR verification code for physical distribution to school students.
  - Events are created on the club dashboard, notices are posted on campus, and post-event attendance is recorded via CSV upload.
  - **Bulk Certificates:** Downloaded as a consolidated ZIP file, with each certificate carrying the verifiable `NDLI-XXXX-XXXX` certificate ID and the student's **UID**.

---

## 3. REGISTRATION WIZARD & ONBOARDING GATING

### Landing Gate:
- Public Landing Page has CTA: `"Register Institutional Club"`.
- Modal prompts selection: `[ Higher Education Institution ]` vs `[ School ]`.

### Registration Fields:
* **HEI First Page:**
  - Institution Name *
  - AISHE Code (optional)
  - Affiliation Code or Registration No. *
  - Club Name *
  - State / UT * (Dropdown of 36 States/UTs)
  - Zone * (Auto-fetched from DB via State -> Zone foreign key)
  - District * (Dropdown filtered by selected State)
  - CTA: `"Start the wizard"`
* **School First Page:**
  - Institution Name *
  - Affiliation Code or Registration No. *
  - Club Name *
  - State / UT *
  - Zone * (Auto-fetched)
  - District *
  - CTA: `"Start the wizard"`

### Authority Pages & 7-Day Tokenized Resume Engine:
- Wizard advances through authority detail pages:
  - HEI: Patron -> President -> Secretary -> Executive.
  - School: Patron -> President -> Secretary.
- Each page collects: Full Name *, Email Address *, Phone (10-digit, optional), Designation *.
- **7-Day Auto-Save Draft & Resume Token:**
  - Generates a cryptographically random token (`secrets.token_urlsafe(18)`).
  - Stores SHA-256 hash in `OnboardingDraft.resume_token_hash` with `resume_token_expires_at = now + 7 days`.
  - Raw token presented to applicant with one-click copy: *"Use this token to resume your uncompleted form anytime within 7 days."*
  - Dedicated `"Resume Application"` modal on portal landing restores exact draft state.
  - Draft purged on final submission or after 7 days.
- **Authority De-Duplication Check Gate:**
  - Next to Email field, user clicks `"Check"`.
  - Backend queries `AuthorityAssignment` for active status matching that email.
  - If registered in another club: Prompt dialog:
    *"This email ID is already registered as [Post] of [Institution Name]. Would you like to deactivate that account?"*
  - If applicant clicks `"YES"`:
    1. Deactivates that email's prior authority assignment (status='ended').
    2. Sends email notification to all remaining authorities of the previous institution.
    3. Pushes a High Alert notification to the previous club dashboard and halts its administrative actions until that vacant authority post is refilled via the Authority Succession Desk.
    4. Allows assignment of the email to the new draft.
  - If applicant clicks `"NO"`: System requires entering a distinct email address.
- **NO OTP VERIFICATION** during club formation.
- **Supporting Document Upload:**
  - Official institution letterhead pad signed and stamped by the head of the institution, containing an endorsement declaration for the submitted club authorities (PDF/JPEG <= 300KB).
- **Submission & Regional Routing:**
  - Generates unique tracking `Application ID`.
  - Enqueues `CharterApplication` for the responsible IIT KGP Zonal Officer (`EMP01`–`EMP07`) based on State/Zone mapping.
  - Officer verifies document and sanctions or rejects.
  - Upon sanction: Authorities receive email with verification link + Club ID, Registration No., Passkey.
  - Authorities click verification link to set their passwords (login ID is email).
  - **Emergency Super-Power:** Only IIT KGP Central Admin can reset club authority passwords (protected by TOTP verification).

---

## 4. STUDENT & MEMBER ONBOARDING FLOWS

### A. HEI Students (Self-Service)
1. Student clicks `"Student Passkey Join"` or scans Club QR code.
2. Form opens with fields:
   - Institutional Passkey * (auto-filled if scanned QR)
   - Full Name (As on Certificate) *
   - Gender * (Male / Female / Other)
   - Student Email *
   - Create Password *
   - Department *
   - Roll / Reg. No. *
3. Student clicks `"Verify Passkey & Join Club"` -> verification email is dispatched.
4. Upon clicking verification link, application enters Club Authority `"Membership Approval"` tab.
5. Authority has `"Approve All"` and `"Approve Selected"` controls.
6. Upon approval, record moves to `"Existing Member"` tab.
7. Authority sets membership validity: `1 yr`, `2 yr`, `3 yr`, `4 yr`, `5 yr`, `6 yr`.
   - On expiration date, account automatically transitions to inactive/expired.
8. Authority can assign student to Sub-Club(s). If unassigned, student is member of Main Club only.
9. Student can also select their preferred Sub-Club(s) inside their Member Module.
10. Roster Filters: Filter by Year, Department, Gender, Main Club, Sub-Club.
11. **Suspension vs. Removal:**
    - Sub-Club Coordinator can temporarily block/suspend (student receives event notifications but login is locked until reinstated).
    - Permanent removal can ONLY be executed by Main Club Authorities.

### B. School Students (Offline-First Tangible Identity)
1. School authority uploads CSV containing:
   `Full Name`, `Gender`, `Class`, `Section`, and optional `Guardian Phone`.
2. Validation check verifies format and previews entries.
3. System assigns a deterministic **Student UID**: `SCH-[State]-[Club]-[Class]-[Serial]` (e.g., `SCH-WB-0042-IXB-015`).
4. Authority clicks `"Approve"` -> entries move to `"Existing Member"` tab.
5. Authority can click **"Download Membership Cards (PDF)"** to generate a printable sheet (8-10 cards per A4 page) for physical distribution to students.
6. No student accounts, no passwords, no email requirement (DPDP Act compliant).
7. Filter by Year, Class, Gender.

---

## 5. MEMBER MODULE (HEI ONLY) & 3-TIER LIBRARIES

### Student Member Dashboard:
- Telemetrics of student's personal activity.
- Active & upcoming Event Cards.
- Profile Completion Section: Profile Photo, Date of Birth (auto-computes age), Hobbies, Address, State, PIN Code, Social links (Facebook, Instagram, X).
- Gamification Points & Badges: Points awarded for profile completion, event participation, reading club library resources, and community contributions. Badges: `Copper` -> `Silver` -> `Gold` -> `Platinum`.
- In-session `"Change Password"` capability.

### 3-Tier Curated Libraries:
- **Strict Content Law:** Links MUST belong to the main NDLI website (`ndli.iitkgp.ac.in`). External links are strictly rejected by URL validation.
- Organized into topic-wise subdirectories.
- **Tier 1: Club Library:** Created by Club Admins & Sub-Club Coordinators. Read-only for club members.
- **Tier 2: Personal Library:** Created by individual students for personal study.
- **Tier 3: Community Library:** Shared inter-club repository. Students can publish their personal library into the Community Library. All club members can read community libraries; only the original author can edit.

---

## 6. EVENT CREATION, MULTI-CLUB COLLABORATION & DUAL CERTIFICATES

### Event Modals:
- Only Main Club Authorities (Patron/President/Secretary) can create events.
- Modal Choice: `[ Institutional Event ]` vs `[ Multi-Club Event ]`.

### A. Institutional Event:
- Choose scope: `Main Club` (auto-selects all sub-clubs) or check specific `Sub-Clubs`.
- Input Details: Title *, Description *, Joining Link (optional), Event Conductors (+ affiliations, multiple allowed), Upload Poster (JPEG/PDF <= 300KB, optional), Start Date & Time *, End Date & Time *.
- Click `"Save"` -> Created in Editable Draft mode.
- Click `"Publish"` -> Freezes event, sends emails with poster attachment to eligible student members, and triggers real-time dashboard notifications.

### B. Multi-Club Event (Inter-Institutional Collaboration):
- Host selects partner institutions via search modal (+Add multiple).
- Clicks `"Request Collaboration"` -> partner institutions receive Collaboration Notification + Collaboration Card on dashboard with `[ Accept ]` and `[ Reject ]`.
- If partner rejects accidentally: Host gets **exactly 1 retry** chance.
- If all partners reject: System auto-cancels and prompts conversion to an Institutional Event.
- Once accepted by partners: Host clicks `"Start Event Creation"` -> selects details -> Publishes.

### Dynamic 30-Minute Attendance Window:
- Event card renders a `"Participate"` button.
- Active exactly from **10 minutes before start time** to **20 minutes after start time** (30-minute window).
- Outside this window, attendance is locked.

### Post-Event Certificate Issuance:
1. At event end time, event closes and renders `"Approve Certificate"`.
2. Authority must verify identity via re-authentication password gate.
3. Approval scope:
   - Institutional Event: Main Club Authorities.
   - Sub-Club Event: Assigned Sub-Club Coordinator.
   - Multi-Club Event: Respective club authorities approve their own students.
4. Authority selects `"Approve All"` or `"Approve Selected"`.
5. **Dual Certificate Outputs:**
   - **Participant Certificate:** Verifiable alphanumeric ID (`NDLI-XXXX-XXXX`), downloadable by HEI students; bulk ZIP download for School authorities with Student UIDs permanently embedded.
   - **Event Conductor Certificate:** Automatically fetches transparent PNG institution logo, signing authority signature PNG & affiliation, and conductor details into a formal landscape certificate PDF.

---

## 7. UNIFIED LOGIN GATES & FORGOT PASSWORD WORKFLOW
- All login gates replicate the previous project's clean, accessible design.
- **"Forgot Password" Feature:**
  - Inputs: `Email ID` + `Role` (`Club Authority` vs `Club Member (Student Only)`).
  - Backend verifies match in database.
  - If found: Sends 72-hour reset token link via email; displays:
    *"An email has been sent to your registered email id with password reset link and it will be valid for 72 hours."*
  - If no match found: Displays:
    *"No database found, please register yourself first."*

---

## 8. STEP-BY-STEP IMPLEMENTATION ROADMAP FOR MIMO

```
Phase 1: Database Migrations & Models
  ├── Domain: Extend Institution, Add SubClub, Logo/Signature fields
  ├── Onboarding: Extend OnboardingDraft with 7-day resume token & HEI/School type
  ├── Members: Add StudentMemberProfile, SchoolStudentRoster (with student_uid), Validity logic
  ├── Libraries: Add CuratedLibrary, CuratedResourceLink with ndli.iitkgp.ac.in check
  └── Events: Add ClubEvent, EventConductor, EventCollaboration, EventAttendance

Phase 2: Backend APIs & Security Services
  ├── Onboarding APIs: Draft save/resume, authority email de-duplication check, letterhead upload
  ├── Sub-Club APIs: Create sub-club, assign coordinator, coordinator scoped permissions
  ├── Roster APIs: Approve all/selected, validity setter, school CSV bulk processor + UID generator
  ├── Card Printing: Printable A4 Membership Cards PDF generator
  ├── Event APIs: Collaboration invite/accept/retry, 30-min window gate, conductor certificate synthesis
  └── Auth APIs: Universal forgot-password with 72-hour reset token, central admin TOTP reset

Phase 3: Frontend Component Assembly
  ├── Registration Modals: HEI (4-tier) and School (3-tier) wizards + 7-day token resume
  ├── Club Dashboard: Sub-club manager, authority succession, branding upload
  ├── School Roster & Print: SchoolBulkUploadPanel, SchoolMembershipCardPrintModal
  ├── Event System: Creation modals, collaboration cards, live attendance countdown
  ├── 3-Tier Libraries: NDLI resource picker, directory navigation, community sharing
  └── Member Portal: Student dashboard, gamified badges, profile modal

Phase 4: Verification & Gate Audit
  ├── pytest backend/ (100% test pass on new test suites)
  ├── ruff & mypy checks
  ├── Playwright E2E full user journeys
  └── SSOT ledger audit check
```
