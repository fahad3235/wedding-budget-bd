# wedding-budget-bd — test results

Run date: 2026-11-11. All values below were produced by running the tests,
not assumed.

## Node unit tests — 13/13 pass

`node --test tests/logic.test.js` → 13 pass, 0 fail.

Hand-verified scenario (budget ৳1,000,000; guests 500; caps venue ৳450,000,
food ৳350,000; expenses: venue paid ৳400,000; food planned ৳300,000; decor
paid ৳50,000; photo planned ৳80,000; vendor Dream Decor contract ৳500,000,
paid ৳200,000):

- paid ৳450,000; planned ৳380,000; committed ৳830,000; remaining ৳170,000;
  83% used; per-guest committed ৳1,660; per-guest paid ৳900.
- Vendor due ৳300,000; contract ৳500,000; paid ৳200,000.
- Venue ৳400,000 / ৳450,000 cap = 88.89%, ৳50,000 left; food ৳300,000 /
  ৳350,000; decor spent with no cap → pct Infinity, overCap false.
- Over-budget case: budget ৳100,000 + paid ৳120,000 → remaining −৳20,000,
  120%, overBudget true.
- Zero budget / zero guests → 0% and ৳0 per guest (no NaN).
- Chart data sorted desc: venue, food, photo, decor (4 rows).
- Validation: bad category, empty/81-char description, amount 0 / negative /
  over ৳100,000,000, date before 2020-01-01, impossible date 2026-02-30,
  date >3 years ahead, bad status — all rejected; rejected adds do not mutate.
- Edit/delete round-trip: edit 400,000 → 410,000 moves paid to ৳460,000;
  delete returns paid to ৳50,000.
- Vendor: pay to contract → due ৳0, fullyPaid; pay ৳1 over → overpaid,
  due −৳1.
- Export/import round-trip preserves totals, 4 expenses, 1 vendor, caps.
- Import rejection: wrong app, wrong version, negative budget, duplicate
  expense ids, zero-amount expense, non-JSON, non-object, bad cap type.

Repairs: 1 test-side fix only (JSON.stringify emits `"app":"x"` with no
space after the colon; the assertion expected a space). 0 app bugs found
by the unit tests.

## Headless-Chrome smoke tests — 60/60 pass

`node tests/smoke.js` (raw CDP, headless_shell-1187, `?asof=2026-11-11`) →
60 checks, 0 failed, 0 console/page errors.

Covered: defaults (5 tabs, 10 category rows, empty states); settings save
(budget ৳1,000,000 + 500 guests → remaining ৳1,000,000.00); empty-description
rejection; add venue paid ৳400,000 → paid ৳400,000.00, per-guest paid
৳800.00, remaining ৳600,000.00; add food planned ৳300,000 → committed
৳700,000.00, 70%, per-guest ৳1,400.00; venue cap ৳450,000 → ৳50,000.00
left; edit 400,000 → 410,000; delete planned expense → planned ৳0.00;
vendor add (contract ৳500,000, paid ৳200,000 → due ৳300,000.00) + mark
paid in full → "Fully paid" badge, due ৳0.00; persistence across reload
(remaining ৳590,000.00, vendor kept); export/erase/import round-trip via
test hooks; wrong-app import rejected with data intact; bad UI import
rejected; wrong erase word rejected, `DELETE` erases; Bengali toggle
(title, digits ৳৪০০,০০০.০০, tab label) + persistence; 390px no horizontal
overflow on all 5 tabs; zero non-file network requests.

Repairs: 2 test-side fixes (date-desc list ordering for the edit/delete
row selectors; Bengali য় is stored decomposed — য + nukta — in i18n.js,
so the expected title literal was corrected to the same sequence).
0 app bugs found by the smoke tests.

## Notes

- One known Unicode subtlety, documented not hidden: Bengali য় appears
  both as precomposed U+09DF and decomposed U+09AF U+09BC; the app stores
  the decomposed form (as typed in the source) and the smoke expectation
  was aligned to it. Rendering is identical either way.
- Sources are pure ASCII (Bengali as `\uXXXX` escapes); verified with
  `grep -P '[^\x00-\x7F]'` over `*.js`/`*.html`/`*.css` → zero matches.
