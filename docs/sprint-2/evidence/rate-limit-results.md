# Rate limiting validation

5 of 5 checks passed.

| ID | Refs | Check | Expected | Actual | Result |
|---|---|---|---|---|---|
| RL-01 | ST-23, VFR-06 | authentication endpoints are limited: the 21st login attempt in the window gets 429 (limit 20) | 20 x 401 then 429 | first 429 at attempt 21; 20 x 401, 5 x 429 | PASS |
| RL-02 | ST-23 | the 429 answer uses the uniform error body with RATE_LIMITED | 429 { error: { code: RATE_LIMITED } } | 429 {"error":{"code":"RATE_LIMITED","message":"Too many requests, please try again later","det | PASS |
| RL-03 | ST-23 | other authentication endpoints share the limit (register) | 429 | 429 | PASS |
| RL-04 | ST-23, VFR-06 | the global API limit applies (limit 300 per window in this run) | 200 x 300 (minus earlier requests), then 429 | 271 x 200, 49 x 429 | PASS |
| RL-05 | ST-23 | the service stays responsive for the health check while limited | process answers | 429 | PASS |
