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

## Planned sample files (milestone M2)

| File (planned) | Replaces (real source, to be supplied) |
| --- | --- |
| `states_sample.csv` | Official 36 States/UTs list |
| `districts_sample.csv` | Official district master |
| `zones_sample.csv` | EMP01–EMP07 zone names and state-to-zone mapping (only EMP01 "North" and EMP07 "South 2" are named in the source material) |
| `aishe_directory_sample.csv` | Ministry of Education AISHE master directory |

Status in M0: no seed files are shipped yet — this README documents the
convention. The `make seed` target (`manage.py seed_samples`) is wired and
prints this status until the M2 loaders arrive.
