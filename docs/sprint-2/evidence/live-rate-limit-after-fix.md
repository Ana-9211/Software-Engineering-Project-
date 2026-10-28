# Live login rate limit after the fix

| | |
|---|---|
| Date | 28 October 2026 |
| Target | https://online-bookstore-zux7.onrender.com |
| Deployed commit | `d6b624b` (merge of pull request #79, per-account login limiter) |
| Settings | `RATE_LIMIT_ACCOUNT=10`, `TRUST_PROXY_HOPS=1` |
| Runs | One run, from one browser |

## Check

13 wrong logins for one made-up e-mail address, each with a valid CSRF token.

| Attempts | Status |
|---|---|
| 1 to 10 | 401 |
| 11, 12, 13 | 429 |

The limit of 10 failed attempts per e-mail address was observed on the live site.

## Before the fix

22 wrong logins with a valid CSRF token all returned 401 and no 429 appeared. See `live-rate-limit-results.json`, and section 6 of `../Sprint2-Status-and-Deviations.md` for the earlier reading of that result.

## Limits of this evidence

- One run, one browser, one e-mail address. It was not repeated and not tried from several addresses.
- The global limit of 300 requests per window was not tested.
