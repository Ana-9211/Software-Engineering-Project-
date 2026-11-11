# System Validation Report

Online Bookstore. This report collects the system-level validation evidence for the final submission. Every figure comes from a run whose raw output is stored in `docs/sprint-2/evidence/`; each section names the date of the run and the script that produced it. Nothing here was re-measured when this report was written, except where a date says so. Unit and coverage results are in the other three reports in this folder.

## 1. Summary

| Validation | Script | Run date | Checks | Passed | Result |
|---|---|---|---|---|---|
| Live API and workflow checks | `validation/live-api.mjs` | 2026-10-27 | 257 | 257 | PASS |
| Data integrity | `validation/integrity.mjs` | Sprint 2 | 43 | 43 | PASS |
| Keyboard accessibility | `validation/keyboard.mjs` | Sprint 2 | 7 | 7 | PASS |
| Rate limiting (separate server) | `validation/rate-limit.mjs` | Sprint 2 | 5 | 5 | PASS |
| Browser walkthrough, all roles | `e2e/e2e.mjs` | Sprint 2 | 41 | 41 | PASS (Edge only) |
| Lighthouse, main customer pages | `validation/lighthouse.mjs` | 2026-10-27 | 12 pages | see section 5 | see section 5 |
| Load test | `validation/loadtest.mjs` | 27 and 28 Oct | see section 6 | | partly met |

## 2. Live API and workflow checks

257 of 257 checks passed against a running server with a real database, no mocks. Each row has an ID, the requirements it covers, the expected and the actual result; the full table is in `docs/sprint-2/evidence/live-api-results.md`.

| Prefix | Area | Checks | Passed |
|---|---|---|---|
| AUTH | Registration, email verification, login, session | 37 | 37 |
| AZ | Roles, ownership and access control | 34 | 34 |
| CAT | Catalog, search, filters | 24 | 24 |
| CART | Cart and wishlist | 18 | 18 |
| ORD | Checkout, stock reservation, payment, orders | 37 | 37 |
| EXP | Reservation expiry and late payment | 4 | 4 |
| CON | Concurrent checkout | 6 | 6 |
| SEL | Seller journey: application, listing, inventory, fulfilment | 37 | 37 |
| IMG | Seller journey: book images | 13 | 13 |
| REV | Seller journey: reviews | 6 | 6 |
| ADM | Administrator journey | 23 | 23 |
| ERR | Error handling and uniform error body | 11 | 11 |
| SEC | Security headers, log hygiene, audit trail, secrets | 6 | 6 |
| HLT | Health endpoint | 1 | 1 |

## 3. Security validation

The plan is section 9.4 of the SRS and validation specification. Results:

| Activity | Requirement | Evidence | Result |
|---|---|---|---|
| Password storage and lockout after 5 failures | VFR-04, VFR-07 | live check AUTH-26 (clock-controlled), `bcryptjs` cost 10 or higher | Met |
| HTTPS only | VFR-05 | `live-health-and-headers.json`: plain HTTP gets a 301 to HTTPS, HSTS `max-age=31536000; includeSubDomains`; TLS version not checked | Met (TLS version open) |
| Injection, XSS, CSRF | VFR-06 | live `SEC-*` checks; ZAP baseline findings DEF-07 and DEF-08 fixed in Sprint 2 (CSP, Permissions-Policy, COEP) | Met |
| Rate limiting | VFR-06 | `rate-limit-results.md` (5 of 5); live per-account limiter: 401 for attempts 1 to 10, 429 for 11 to 13 (`live-rate-limit-after-fix.md`, one run) | Met |
| Access control by role | FR-29 | live `AZ-*` checks (34) | Met |
| No card data stored or logged | VFR-08 | live checks ORD-13, ORD-17, DB-12 | Met |
| Dependency audit | VFR-06 | `npm audit --omit=dev --audit-level=high` runs in CI on every pull request; 0 vulnerabilities on the final lock file | Met |

## 4. Data integrity and accessibility

- Data integrity: 43 of 43 checks (`integrity-results.md`). Reserved stock equals the units held by open orders for every book; no unpaid order stays open more than 3 minutes past its expiry.
- Keyboard accessibility: 7 of 7 checks (`keyboard-results.md`): skip link, focus order, dialog focus.

## 5. Lighthouse (VFR-11 accessibility 90 or more, VFR-10 responsive)

Local run 2026-10-27:

| Page | Accessibility | Performance | LCP (ms) | CLS |
|---|---|---|---|---|
| S-01 Catalog | 100 | 98 | 2108 | 0 |
| S-02 Book details | 100 | 83 | 2009 | 0.302 |
| S-05 Login | 100 | 99 | 1723 | 0 |
| S-03 Register | 100 | 99 | 1829 | 0 |
| S-08 Cart | 100 | 96 | 2108 | 0.025 |
| S-10 Checkout | 100 | 99 | 1799 | 0 |
| S-13 My orders | 100 | 100 | 1370 | 0 |
| S-16 Profile | 100 | 100 | 1446 | 0 |
| S-19 Seller listings | 100 | 99 | 1979 | 0 |
| S-20 Listing form | 100 | 99 | 1934 | 0 |
| S-24 Admin dashboard | 100 | 99 | 1942 | 0 |
| S-26 Approvals | 100 | 99 | 1956 | 0 |

Lowest accessibility score: 100. VFR-11 met on the local run. The live site scored 100 on the home, catalog and book pages on mobile and desktop (`live-lighthouse-results.json`, 6 runs).
Responsive layout at 360 and 1920 px is exercised by `e2e/e2e.mjs`.

## 6. Performance (VFR-02, VFR-03)

| Run | Books | Users | Requests | Error rate | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|---|---|---|---|
| perf-branch run 1 | 10000 | 100 | 3000 | 0.00% | 21.8 | 87.1 | 683.4 |
| perf-branch run 2 | 10000 | 100 | 3000 | 0.00% | 23.7 | 63.7 | 395.8 |
| perf-branch run 3 | 10000 | 100 | 3000 | 0.00% | 23.9 | 90.8 | 396.1 |
| before (default branch) run 1 | 10000 | 100 | 3000 | 0.00% | 40 | 228.2 | 800.9 |
| before (default branch) run 2 | 10000 | 100 | 3000 | 0.00% | 50.5 | 400.9 | 1055.7 |
| before (default branch) run 3 | 10000 | 100 | 3000 | 0.00% | 52.9 | 255.1 | 499.6 |
| live warm run 1 | 12 | 20 | 100 | 0.00% | 622.9 | 1875.8 | 2516.5 |
| live warm run 2 | 12 | 20 | 100 | 0.00% | 617.8 | 1349.6 | 2269.8 |

The laptop runs meet VFR-03 (100 users, 0.00% errors). On the live free-tier instance, p95 is above the 500 ms target (VFR-02) and only 20 concurrent users were tested, so VFR-02 and VFR-03 are not shown as met on the live site.

## 7. Requirement status

| Requirement | Status | Note |
|---|---|---|
| FR-01 to FR-30 | Met | live, e2e and server tests; mapping in `docs/phase-3` |
| VFR-02 response time | Met locally, not live | see section 6 |
| VFR-03 100 users | Met locally, partly live | see section 6 |
| VFR-04 to VFR-08 security | Met | section 3 |
| VFR-09 availability 99% | Partly met | uptime workflow runs every 5 minutes against `/api/health`; no availability figure yet |
| VFR-10, VFR-11 | Met | section 5 |
| VFR-12 browsers | Partly met | Edge and Chrome driven by scripts; `BROWSER_NAME=firefox\|webkit` support added for Firefox and WebKit runs; not yet run against the final build |
| VFR-13 coverage 70% | Met | see Code Coverage Report |
| VFR-14 transactions and daily backup | Partly met | transaction tests pass; daily backup workflow exists and needs the `MONGODB_URI` and `BACKUP_PASSPHRASE` secrets |
| VFR-15 API documented | Met | `docs/sprint-2/openapi.yaml`, validated in CI |

## 8. Known gaps

- Firefox, Safari and older browser versions were not tested (VFR-12).
- No uptime figure yet (VFR-09). An Atlas restore has not been rehearsed (VFR-14).
- The live site uses a fake payment gateway and console mailer, so e-mail delivery time cannot be measured (FR-14).
- The live performance figures come from one free-tier instance and one location.

## 9. How to reproduce

Start the server with demo data (see `docs/phase-3/Phase3-Implementation-Notes.md`), then from the repository root:

```
node validation/live-api.mjs
node validation/integrity.mjs
node validation/keyboard.mjs
node validation/rate-limit.mjs
node validation/lighthouse.mjs
SERVER_LOG=<server log> node e2e/e2e.mjs
```
