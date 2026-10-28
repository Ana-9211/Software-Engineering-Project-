# Online Bookstore: Sprint 2 status, evidence and deviations

Sprint 2: 26 to 30 October 2026. Backlog: GitHub Project "Online Bookstore Backlog", milestone Sprint 2.

All numbers below were measured on one Windows laptop (Intel Core i7-13700H, 16 GB RAM) with a local single-node MongoDB 7.0 replica set. They are not measurements of a deployed system. Raw results are in `docs/sprint-2/evidence/`; the scripts are in `validation/`.

## 1. Audit of the open Sprint 2 issues

"Met" means the behaviour already existed on the default branch and was re-verified. "Fixed" means a change was needed; the branch name is given.

| Issue | Requirement | Result | Evidence |
|---|---|---|---|
| FR-03, 06, 10, 14, 16, 17, 18, 21, 23, 26, 27, 28 | Password reset, filters, wishlist, confirmation e-mail, cancel, reviews, profile, out of stock, sales report, categories, review removal, platform report | Met | Server tests (Phase 3 notes map each FR to test names); `e2e/e2e.mjs` 41 of 41 steps; `validation/live-api.mjs` 257 of 257 checks. FR-14 sends one e-mail through the console mailer; delivery time to a real mailbox is not measurable (deviation 4). |
| TASK-04 (DEF-01) | Restart checkout when the customer holds the last copies | Fixed (`fix/task-04-last-copy-checkout`) | 3 new tests in `checkout.test.js`; they fail without the change. |
| TASK-05 (DEF-04, 05) | Admin dashboard and report screens: error state with retry | Fixed (`fix/task-05-error-states`) | Client tests 23 to 28. |
| TASK-06 (DEF-06) | Webhook response schema equals the SDD | Fixed (`fix/task-06-webhook-schema`) | `docs/sprint-2/openapi.yaml` changes only that response; a test checks nothing else differs. |
| TASK-07 (DEF-07, 08) | Tighter CSP, Permissions-Policy | Fixed (`fix/task-07-csp-permissions-policy`) | `security.test.js`. |
| VFR-01 | Page load 3 s or less, p95 | Met for one user, laptop and live | Laptop: Lighthouse mobile largest paint 1.4 to 2.1 s on 11 pages. Live (free tier, 3 pages): mobile largest paint 1.6 to 1.8 s, desktop 0.6 to 1.2 s (`evidence/live-lighthouse-results.json`). Not measured with 100 concurrent browsers, and not as a p95 over many page loads. |
| VFR-02 | Search and browse 500 ms or less, p95 | Met on the laptop; **not met on the live site as measured** | Laptop (fix in `perf/vfr-02-catalog-p95`, 10,000 books): p95 87, 64, 91 ms, before the fix 228, 401, 255 ms. Live: p95 1876 and 1350 ms, median about 620 ms, measured from the author's laptop (section 6). The median is close to the plain network round trip to the service (about 610 ms for the health check), so most of it is distance and not catalog work, but the requirement was not shown to hold on the live site. |
| VFR-03 | 100 users, error rate under 1 % | Met on the laptop; live only partly tested | Laptop: 0.00 % errors in 6 runs of 3000 requests at 100 users. Live: 0.00 % errors at 20 users (2 runs of 100 requests); 100 users were not tried on the free instance. |
| VFR-05 | HTTPS | Met on the live site (headers and redirect); TLS version not checked | Live: HTTPS works, plain HTTP gets a 301 to HTTPS, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, CSP and Permissions-Policy present (`evidence/live-health-and-headers.json`). The TLS protocol version was not inspected. |
| VFR-06 | Injection, XSS, CSRF protection | Met, plus `fix/runtime-dependency-audit` | `npm audit --omit=dev`: 2 high and 2 moderate advisories before, 0 after. CI now fails on high advisories. Login limit observed live after PR #79 (per-account login limiter, `RATE_LIMIT_ACCOUNT=10`, `TRUST_PROXY_HOPS=1`): 401 for attempts 1 to 10, 429 for 11 to 13 (`evidence/live-rate-limit-after-fix.md`). |
| VFR-07 | Lockout after 5 failures | Met | Live check AUTH-26, clock-controlled test. |
| VFR-08 | No card data stored or logged | Met | Live checks ORD-13, ORD-17, DB-12. |
| VFR-09 | 99 % availability, checks every 5 minutes | Partly met | `.github/workflows/uptime.yml` runs every 5 minutes against `$DEPLOY_URL/api/health`. The health endpoint answers 200 (checked once, about 5 minutes after a restart). Whether the variable `DEPLOY_URL` is set and what the scheduled runs show was not checked from here; no availability percentage has been measured. |
| VFR-10 | Responsive 360 to 1920 px | Met | `e2e.mjs` steps at 360 and 1920 px. |
| VFR-11 | Lighthouse accessibility 90 or more | Met on the laptop and live | Laptop: 100 on 11 pages. Live: 100 on the home, catalog and book pages, mobile and desktop. |
| VFR-12 | Latest 2 versions of Chrome, Firefox, Edge, Safari | Partly met | Edge and Chrome driven by the scripts; Safari and older versions not tested. |
| VFR-14 | Transactional orders, daily backup | Partly met | Transaction tests pass. `server/scripts/backup-db.js` backs up, restores and verifies; a local rehearsal restored 13 collections with matching counts. A daily schedule exists only after deployment. |
| TASK-08 | Deploy, monitor, keep-alive, re-run performance | Deployed; monitor and performance partly done | Live at https://online-bookstore-zux7.onrender.com with Atlas; guide in `docs/sprint-2/deployment.md`. The performance re-run was small (section 6). The monitor needs the `DEPLOY_URL` variable and its first runs checked. |
| TASK-09 | 2-minute video | Done | `docs/demo/sprint2-demo.mp4` (121 s), made by `docs/demo/record-sprint2-demo.mjs`. |
| TASK-10 | Final documentation, freeze | Documentation done; the freeze is a manual step (section 4) | |

## 2. Test results on the integrated Sprint 2 code

| Check | Result |
|---|---|
| Server tests (`npm test`) | 526 passed |
| Client tests (`npm run test:client`) | 28 passed |
| Lint | 0 errors |
| Browser walkthrough (`node e2e/e2e.mjs`) | 41 of 41 steps |
| Live API and workflow checks (`validation/live-api.mjs`) | 257 of 257 |
| Data integrity (`validation/integrity.mjs`) | 43 of 43 |
| Keyboard accessibility (`validation/keyboard.mjs`) | 7 of 7 |
| Rate limiting (`validation/rate-limit.mjs`, separate server) | 5 of 5 |

To run the browser walkthrough locally the global rate limit must be raised (`RATE_LIMIT_GLOBAL=5000`); the default of 300 per window is hit by one IP.

## 3. New deviations from the submitted documents

| # | Document | Deviation | Reason |
|---|---|---|---|
| 9 | OpenAPI | `docs/sprint-2/openapi.yaml` is a copy of the approved file with one change (webhook 200 response). The Phase 2 file is untouched. | Keeps the approved document as submitted and records the change (DEF-06). |
| 10 | SDD (security headers) | CSP no longer allows `https:` sources; `style-src` is tightened; Permissions-Policy and Cross-Origin-Embedder-Policy are added. | ZAP findings DEF-07 and DEF-08. |
| 11 | SDD (catalog read) | The list endpoint reads plain objects and caches the page total for a few seconds. | VFR-02: p95 was above 500 ms in the earlier measurement. |
| 12 | Deployment | The public service (free Render instance) uses the fake payment gateway and the console mailer, so no real payment or e-mail happens and e-mail links appear in the service log. It must be presented as a demo. | No provider was chosen (deviation 4). |
| 13 | CI | Two steps added: OpenAPI validation and `npm audit --omit=dev --audit-level=high`. | VFR-15 and VFR-06. |
| 14 | Dependencies | Lock file updated for body-parser and multer. | Two high advisories. |

Deviation 5 is partly closed: HTTPS and hosting exist (section 6). The uptime monitor needs the `DEPLOY_URL` variable, and backups are manual with no daily schedule.

## 4. Freeze steps (TASK-10), for the repository owner

1. Merge the Sprint 2 pull requests and make sure CI is green on the default branch.
2. Settings > Branches: add a rule for `phase-1-requirements` that requires a pull request and a passing check and does not allow bypassing. Do the same for `main` if it is used.
3. Tag the final state: `git tag sprint-2-final && git push origin sprint-2-final`.
4. Close the finished issues and move them to Done on the project board.
5. Agree in the team chat that nothing is merged after the freeze.

## 5. Traceability

Requirement to issue: `docs/backlog/backlog.csv`. Requirement to test: Phase 3 notes (server tests) and `docs/sprint-2/evidence/live-api-results.md` (check IDs such as AUTH-26, ORD-13). Defect to fix: section 1 above.

## 6. Deployed results (live site)

Target: https://online-bookstore-zux7.onrender.com, measured on 28 October 2026 from the author's laptop, over the public internet only. The service runs on the Render free tier with a MongoDB Atlas free cluster and holds the demo data (12 books). A cold start after idle takes about 50 seconds; the measurements below were taken after the instance was awake (a warm-up request was sent first), so they do not include a cold start.

| Measure | Laptop (local database, 10,000 books) | Live (free tier, 12 books) |
|---|---|---|
| Load test | 100 users, 3000 requests, p50 22 to 24 ms, p95 64 to 91 ms, p99 396 to 683 ms, 0.00 % errors, about 95 requests/s | 20 users, 100 requests per run, two runs: p50 623 and 618 ms, p95 1876 and 1350 ms, p99 2517 and 2270 ms, 0.00 % errors, about 10 requests/s |
| Round trip of `/api/health` | not applicable | min 534, median 610, max 1023 ms (8 requests) |
| Lighthouse performance | 83 to 100 on 11 pages (mobile) | mobile 97 home, 98 catalog, 95 book; desktop 97, 93, 92 |
| Lighthouse accessibility | 100 on 11 pages | 100 on all 6 runs |
| Lighthouse best practices / SEO | not recorded for SEO | best practices 96 on all 6 runs; SEO 91 on all 6 runs |

How to read this:
- The live load test is a polite, small profile on purpose (a free instance, and a limit of 300 requests per 15 minutes per IP). With 100 samples per run the p95 is rough. It is not the 100-user, 10,000-book scenario, so it does not replace the laptop figures and the two columns are not comparable.
- The live median of about 620 ms is about the same as the plain network round trip, so the catalog work itself is small. The p95 of 1.3 to 1.9 s is above the 500 ms target. The requirement is not demonstrated on the live site.
- Lighthouse was run once per page and form factor with Lighthouse 12.8.2 (the catalog desktop run failed once and was repeated). Mobile uses the default emulation.

Rate limit: the login limit is 20 per 15 minutes per IP and gave a 429 at the 21st attempt on the laptop (`evidence/rate-limit-results.md`). On the live site, before the fix, 22 wrong logins with a valid CSRF token all returned 401 and no 429 appeared (`evidence/live-rate-limit-results.json`). That is now **observed live after PR #79** (per-account login limiter, `RATE_LIMIT_ACCOUNT=10`, `TRUST_PROXY_HOPS=1`): after deploying commit `d6b624b`, 13 wrong logins for one e-mail address returned 401 for attempts 1 to 10 and 429 for attempts 11 to 13 (`evidence/live-rate-limit-after-fix.md`). This was one run from one browser. The forgot-password and resend-verification routes rely on the per-address limiter only, because their success responses are not counted by the account limiter. The global limit of 300 was not tested.

Raw files, all in `docs/sprint-2/evidence/` with the prefix `live-`: `live-loadtest-results.json`, `live-lighthouse-results.json`, `live-rate-limit-results.json`, `live-health-and-headers.json`.

## 7. Still open

- VFR-12: only Edge and Chrome were driven by scripts. Firefox, Safari and older browser versions were not tested for Sprint 2 (an earlier Phase 4 draft ran Firefox on the laptop; it is not part of this evidence).
- VFR-14: no daily backup schedule; backups are run by hand (`deployment.md`, section 7). A restore from Atlas has not been rehearsed.
- VFR-09: set `DEPLOY_URL`, then read the first scheduled runs of the Uptime check workflow and record the result; no availability figure exists yet.
- VFR-02 and VFR-03 on the live site: not shown at the target; a repeat from a closer location, or against a paid instance with the 10,000-book data, would be needed.
- FR-13 and FR-14 still use the fake gateway and console mailer (deviation 4).

