# data/samples — SAMPLE-ONLY seed data

**Everything in this directory is SAMPLE ONLY.** It exists so development and
tests can run without real government data. It is never authoritative.

## The convention

1. **Never fabricate Indian government data.** AISHE codes, district lists,
   state-to-zone mappings, NAAC formats and institutional records must come
   from the official source files supplied by the project owner or NDLI.
2. Every sample file is synthetic and clearly labelled (filename containing
   `sample`, plus a header comment / README note where the format allows).
3. Each loader must state exactly which real file to drop in and where.
4. Real personal data (student names, emails, mobile numbers, APAAR IDs) must
   never appear here. The synthetic legacy dataset generator (milestone M8)
   produces dirty-but-fake records for migration testing.
5. Any figure or record in sample data must not be printed in product UI as a
   real statistic.
6. Sample accounts are created with UNUSABLE passwords; access is via the
   normal registration/approval flows or an admin reset — never a sample
   credential baked into a file (P0).

## Shipped sample files (milestone M2 — loaded by `make seed`)

The loader (`apps/domain/seed.py`, command `manage.py seed_samples`) reads
the JSON files below. It is IDEMPOTENT (natural keys, safe to re-run),
validates every row against a strict whitelist (no extra fields, no
lookup-shaped codes, no oversized values) and NEVER carries usable
passwords for the sample accounts (P0). `--reset` removes only the rows
named here (bounded) and is refused in production without
`--allow-production` (M2-A4).

| File | Natural key | Replaces (real source, to be supplied) |
| --- | --- | --- |
| `zones.json` | `code` | The 6-zone model adopted 2026-10-16 (BRIEF_M2 §6) |
| `states.json` | `code` | Official 36 States/UTs list (names here are SAMPLE labels) |
| `districts.json` | `(state, code)` | Official district master (2 SAMPLE districts per seeded state) |
| `institutions.json` | `code` | Ministry of Education AISHE master directory (synthetic; incl. AISHE-less legacy examples) |
| `clubs.json` | `code` | Real club register (synthetic) |
| `users.json` | `username` | Real officer/authority/student roster (usernames EMP01–EMP07 follow BRIEF_M2 §6; names are SAMPLE placeholders) |
| `memberships.json` | `(username, club)` | Real membership register (synthetic) |
| `authority_assignments.json` | `(username, club, tier, from_date)` | Real authority register (synthetic) |
| `officer_assignments.json` | `(state, username, from_date)` | The State/UT → officer roster of BRIEF_M2 §6 (25 roster states; the remaining 11 States/UTs are seeded WITHOUT an officer and reported as "awaiting officer assignment" by `manage.py verify_domain`) |

⚠️ Zone/state placement note: the officer roster of BRIEF_M2 §6 names 25
states; the other 11 States/UTs are placed in the zone their geography
implies under the same scheme (e.g. Ladakh/Uttarakhand/Himachal
Pradesh/Chandigarh → North; Sikkim → East; Arunachal Pradesh/Nagaland/
Mizoram → North East; Lakshadweep/Andaman & Nicobar → South). Officer
assignment for them is deliberately left OPEN — `verify_domain` reports
them; registrations are never blocked.

## Planned real files (to replace the samples)

| File | Replaces |
| --- | --- |
| Official States/UTs + zone mapping | `states.json` / `zones.json` |
| Official district master | `districts.json` |
| AISHE directory export | `institutions.json` |
