# Keyboard accessibility validation

7 of 7 checks passed.

| ID | Refs | Check | Expected | Actual | Result |
|---|---|---|---|---|---|
| KB-01 | VFR-11 | the first Tab stop is the "Skip to content" link | Skip to content | Skip to content | PASS |
| KB-02 | VFR-11 | activating the skip link moves focus to the main content | #content | #content | PASS |
| KB-03 | VFR-11 | Tab reaches the navigation, search box, filters, book links and paging controls (25 stops, none is the page body) | no BODY stops | 0 body stops; e.g. Skip to content > Online Bookstore > Catalog > Log in > Register > q > Search > NewestPrice: low to highPrice: | PASS |
| KB-04 | VFR-11 | every focused control shows a visible focus indicator | all 25 visible | 25 of 25 | PASS |
| KB-05 | VFR-11 | the login form can be completed and submitted with the keyboard only (Enter) | logged in | Cart link visible | PASS |
| KB-06 | VFR-11 | opening a dialog moves focus into it | focus inside the dialog | true | PASS |
| KB-07 | VFR-11 | Escape closes the dialog and focus returns to the "Cancel order" button | Cancel order | Cancel order | PASS |
