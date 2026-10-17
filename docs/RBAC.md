# RBAC — NDLI Club Main Portal

**Status: STUB. The full permission matrix and enforcement layer are delivered
in milestone M1.** This file is the placeholder required by the spec (section
3) so the document exists from M0.

## Roles (spec section 3)

| Role | Scope |
| --- | --- |
| Anonymous | Public landing, directory, certificate verifier |
| Student Member | Own profile, own club membership |
| Club Executive | Club operations (activities, roster) |
| Club Secretary | Club operations + authority workflows |
| Club President | Club operations + authority workflows |
| Club Patron | Highest club authority |
| Regional Officer (EMP01–EMP07) | Zone-scoped institutions only |
| Central Admin (IIT KGP) | All institutions, staff functions |
| Super Admin | Platform administration |

## Principles (to be enforced in M1)

- **Deny by default.** Every endpoint lists allowed roles explicitly.
- One central policy layer: DRF permission classes plus object-level checks.
- Querysets are scoped by institution (and zone for officers) to prevent IDOR.
- Automated tests assert **both** the allowed and the denied roles for every
  endpoint, including adversarial cases (cross-zone reads, cross-institution
  roster access).

## Deliverables in M1

- Permission matrix (role × endpoint × allowed/denied) in this file.
- `apps/accounts` role model and the central policy layer.
- Adversarial tests: EMP03 must never read EMP05 data; a student must never
  read another institution's roster.
