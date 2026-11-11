# Demo cheat sheet: deviations and open items

One page for the final demo. Sources: `docs/sprint-1/Sprint1-Status-and-Deviations.md` (deviations 1 to 8) and `docs/sprint-2/Sprint2-Status-and-Deviations.md` (deviations 9 to 14, section 7).

## Deviations from the submitted documents

| # | Where | What we did differently | Why (one sentence) |
|---|---|---|---|
| 1 | SDD indexes | `_id` appended to sort indexes and API sort keys | Stable paging when books share a price or date |
| 2 | SDD libraries | `bcryptjs` instead of native `bcrypt` | No native builds on student machines; same algorithm, VFR-04 still met |
| 3 | SDD book data | Public book shows `available` and `stockStatus`, not `stock` and `reserved` | Does not expose internal stock to the public |
| 4 | SRS FR-13, FR-14 | Fake payment gateway and console mailer | No provider chosen in Phase 2; adapters use the same interface |
| 5 | SRS VFR-05, 09, 14 | HTTPS, hosting, uptime monitor, daily backup were postponed | Planned in Sprint 2 (TASK-08); partly closed now |
| 6 | Phase 2 pseudo-code | A payment arriving after the customer cancelled is not refunded automatically | Same gap exists in the Phase 2 pseudo-code |
| 7 | OpenAPI API-31 | Payment session is rebuilt by the "Restart payment" button, not returned by `GET /api/orders/{id}` | Approved contract has no field for it |
| 8 | OpenAPI webhook | Webhook answers `{ "received": true }` as the SDD says | Phase 2 documents disagreed; aligned in Sprint 2 (TASK-06, deviation 9) |
| 9 | OpenAPI file | `docs/sprint-2/openapi.yaml` is a copy with one change (webhook 200 response) | Keeps the approved file as submitted |
| 10 | SDD security headers | CSP no longer allows `https:` sources; Permissions-Policy and COEP added | ZAP findings DEF-07, DEF-08 |
| 11 | SDD catalog read | List endpoint reads plain objects and caches the page total for a few seconds | VFR-02 p95 was above 500 ms |
| 12 | Deployment | Public site uses the fake gateway and console mailer; present it as a demo | No provider chosen (deviation 4) |
| 13 | CI | Added OpenAPI validation and `npm audit --omit=dev --audit-level=high` | VFR-15 and VFR-06 |
| 14 | Dependencies | Lock file updated for body-parser and multer | Two high advisories |

## Open items: say these before the teacher asks

- VFR-12: only Edge and Chrome were driven by scripts. Firefox and Safari are not covered by the Sprint 2 evidence.
- VFR-14: backups are run by hand unless the daily backup workflow is enabled with the `MONGODB_URI` secret. An Atlas restore has not been rehearsed.
- VFR-09: no availability figure yet; the uptime workflow needs the `DEPLOY_URL` variable.
- VFR-02 and VFR-03 on the live site: not shown at the target on the free instance.

## Likely questions

- Why is the live site slow on the first request? Free Render instance sleeps after about 15 minutes; first request takes about 50 seconds.
- Is payment real? No. Fake gateway; no card data is stored or logged (VFR-08).
- Where are the requirement-to-test links? `docs/phase-3` traceability table and the Phase 2 validation specification.
