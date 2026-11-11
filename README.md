# Online Bookstore

A MERN (MongoDB, Express, React, Node.js) e-commerce platform for buying and selling books. Customers browse, buy and review books; sellers list and fulfil them; administrators moderate the platform. Software Engineering course project.

Live demo (free tier, fake payment gateway and console mailer, first request after idle takes about 50 seconds): https://online-bookstore-zux7.onrender.com

## Team

| Name | SRN | GitHub |
|---|---|---|
| Manasvi B | PES1UG24CS261 | cyberbacardi |
| Meda Sahasra Siri | PES1UG24CS267 | Sahasra2117 |
| Monika | PES1UG24CS274 | Monika-Tanwar-203 |
| Anagha N | PES1UG24CS058 | Ana-9211 |

## Run it

Requires Node.js 20 or newer. MongoDB must run as a replica set (checkout uses transactions); `npm run dev:db` starts one locally.

```bash
npm ci
cp .env.example server/.env      # then set JWT_SECRET and CSRF_SECRET
npm run dev:db                   # local replica set on port 27017
npm run seed:demo                # categories, a seller, a customer, 12 books
npm run dev:server               # API on http://localhost:5000
npm run dev:client               # web app on http://localhost:5173
```

Full instructions (administrator seeding, single-origin run, demo accounts): `docs/phase-3/Phase3-Implementation-Notes.md`. Deployment: `docs/sprint-2/deployment.md`.

## Checks

```bash
npm run lint
npm test                 # server tests (Jest, in-memory MongoDB replica set)
npm run test:client      # client tests (Vitest)
npm run build
node server/scripts/validate-openapi.mjs
```

The same steps, plus a runtime dependency audit, run in GitHub Actions on every push and pull request (`.github/workflows/ci.yml`).

## Documents

| Deliverable | Location |
|---|---|
| Phase 1: SRS and validation plan | `docs/phase-1/` |
| Phase 2: architecture, design, OpenAPI, validation specification | `docs/phase-2/` |
| Phase 3: implementation notes and requirement traceability | `docs/phase-3/` |
| Backlog (55 items) and sprint plan | `docs/backlog/` |
| Sprint 1 status, deviations and video | `docs/sprint-1/`, `docs/demo/sprint1-demo.mp4` |
| Sprint 2 status, evidence, deviations, deployment guide and video | `docs/sprint-2/`, `docs/demo/sprint2-demo.mp4` |

Layout: `server/` (Express API), `client/` (React app), `e2e/` and `validation/` (browser walkthrough, load, accessibility and API check scripts).
