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
| VFR-01 | Page load 3 s or less, p95 | Met for one user | Lighthouse (mobile emulation, slow 4G), largest paint 1.4 to 2.1 s on 11 pages. Not measured under 100 concurrent browsers. |
| VFR-02 | Search and browse 500 ms or less, p95 | Fixed (`perf/vfr-02-catalog-p95`) | 10,000 books, 100 users, 1 s think time, separate load process. Before: p95 228, 401, 255 ms. After: p95 87, 64, 91 ms. |
| VFR-03 | 100 users, error rate under 1 % | Met | 0.00 % errors in all 6 runs above (3000 requests each). |
| VFR-05 | HTTPS | Fixed in code (`feat/task-08-deploy-config`); live check needs the deployment | Redirect test with `X-Forwarded-Proto`. TLS version cannot be tested locally. |
| VFR-06 | Injection, XSS, CSRF protection | Met, plus `fix/runtime-dependency-audit` | `npm audit --omit=dev`: 2 high and 2 moderate advisories before, 0 after. CI now fails on high advisories. |
| VFR-07 | Lockout after 5 failures | Met | Live check AUTH-26, clock-controlled test. |
| VFR-08 | No card data stored or logged | Met | Live checks ORD-13, ORD-17, DB-12. |
| VFR-09 | 99 % availability, checks every 5 minutes | Partly met | `.github/workflows/uptime.yml` (5-minute check, also keep-alive) is ready; it starts when the repository variable `DEPLOY_URL` is set. No availability window has run yet. |
| VFR-10 | Responsive 360 to 1920 px | Met | `e2e.mjs` steps at 360 and 1920 px. |
| VFR-11 | Lighthouse accessibility 90 or more | Met | Score 100 on all 11 pages (`evidence/lighthouse-results.json`); axe step in `e2e.mjs`; keyboard checks 7 of 7. |
| VFR-12 | Latest 2 versions of Chrome, Firefox, Edge, Safari | Partly met | Edge and Chrome driven by the scripts; Safari and older versions not tested. |
| VFR-14 | Transactional orders, daily backup | Partly met | Transaction tests pass. `server/scripts/backup-db.js` backs up, restores and verifies; a local rehearsal restored 13 collections with matching counts. A daily schedule exists only after deployment. |
| TASK-08 | Deploy, monitor, keep-alive, re-run performance | Prepared, not done | Dockerfile, `render.yaml`, uptime workflow. Needs the owner's Render and Atlas accounts. |
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
| 12 | Deployment | The planned public service still uses the fake payment gateway and the console mailer, so no real payment or e-mail happens and e-mail links appear in the service log. It must be presented as a demo. | No provider was chosen (deviation 4). |
| 13 | CI | Two steps added: OpenAPI validation and `npm audit --omit=dev --audit-level=high`. | VFR-15 and VFR-06. |
| 14 | Dependencies | Lock file updated for body-parser and multer. | Two high advisories. |

Deviation 5 (HTTPS, hosting, monitor, backups not set up) stays open until the deployment exists.

## 4. Freeze steps (TASK-10), for the repository owner

1. Merge the Sprint 2 pull requests and make sure CI is green on the default branch.
2. Settings > Branches: add a rule for `phase-1-requirements` that requires a pull request and a passing check and does not allow bypassing. Do the same for `main` if it is used.
3. Tag the final state: `git tag sprint-2-final && git push origin sprint-2-final`.
4. Close the finished issues and move them to Done on the project board.
5. Agree in the team chat that nothing is merged after the freeze.

## 5. Traceability

Requirement to issue: `docs/backlog/backlog.csv`. Requirement to test: Phase 3 notes (server tests) and `docs/sprint-2/evidence/live-api-results.md` (check IDs such as AUTH-26, ORD-13). Defect to fix: section 1 above.
