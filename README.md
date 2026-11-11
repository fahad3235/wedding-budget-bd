# Wedding Budget BD — বিয়ের বাজেট বিডি

An offline, bilingual (EN/বাংলা) wedding budget planner for Bangladesh. Set a total
wedding budget, cap each spending category, log every expense (paid or planned),
track vendor contracts and payments, and see at a glance how much is left — and
what each guest is costing you.

## Problem

A Bangladeshi wedding means dozens of vendors, advances, and last-minute costs
spread across notebooks, chats, and memory. Families routinely overshoot their
budget because no single place tracks what was promised, what was paid, and what
is still due. This app puts the whole picture on one page, works fully offline,
and keeps the data in the browser — no account, no server, no fees.

## Features

- **Total budget + guest count** — overall spent (paid), planned, committed,
  remaining, % of budget used, and cost per guest (paid and committed).
- **10 wedding categories** — Venue & Hall, Food & Catering, Decoration &
  Flowers, Photography & Video, Bride & Groom Attire, Guest Gifts & Favours,
  Invitations & Cards, Music & Entertainment, Transport & Accommodation,
  Miscellaneous — each with an optional spending cap, live spent/left figures,
  progress bar, and over-cap flag.
- **Expense log** — add, edit, and delete expenses (description, category,
  amount, date, optional vendor, Paid/Planned status) with inline validation
  and a category filter.
- **Vendor payments** — vendor name, service category, contract total, amount
  paid so far; due amount computed automatically, "mark paid in full" button,
  fully-paid / overpaid badges.
- **Spending breakdown chart** — bar chart of spending by category.
- **Data tools** — JSON export, strict-validated JSON import (wrong app,
  version, or malformed data is rejected with your data untouched), and
  typed-`DELETE` erase-all.
- **Bilingual** — full EN/বাংলা toggle (persisted), Bengali digits in
  Bengali mode, localStorage persistence, responsive down to 390px, zero
  network requests.

## Stack

- Pure static site: HTML + CSS + vanilla JavaScript (no framework, no CDN,
  no build step).
- Money stored as integer paisa (1 BDT = 100 paisa) — no floating-point error.
- All Bengali strings are `\uXXXX` escapes in the shipped sources
  (pure-ASCII files); the UI renders them as normal Bengali.

## Prerequisites

Any modern browser. For tests: Node.js 18+ and a headless Chromium
(`headless_shell` from the Playwright cache, or set `CHROME_BIN`).

## Install / run

```sh
# just open it — no server or install needed
open index.html
# or serve locally
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Dev commands

```sh
node --test tests/logic.test.js   # 13 node unit tests (pure engine)
node tests/smoke.js               # 60 headless-Chrome smoke checks (raw CDP)
```

The smoke test loads `index.html?asof=2026-11-11` so dates are deterministic.

## Env

None. No keys, no backend, no analytics. Data lives only in the browser's
`localStorage` under key `wedding-budget-bd:v1`.

## Testing

- `tests/logic.test.js` — 13/13 pass: hand-verified totals (৳1,000,000 budget,
  500 guests → paid ৳450,000, planned ৳380,000, committed ৳830,000, remaining
  ৳170,000, 83%, ৳1,660/guest), category caps incl. over-cap, vendor due /
  fully-paid / overpaid, every validation error, export/import round-trip and
  strict import rejection.
- `tests/smoke.js` — 60/60 pass in headless Chrome: settings save, expense
  add/edit/delete, cap editing, vendor add + mark-paid-in-full, persistence
  across reload, export/erase/import round-trip, Bengali toggle + digits,
  390px no-overflow on all 5 tabs, zero non-file network requests,
  0 console/page errors.

See `TEST_RESULTS.md` for the exact numbers.

## Deployment

Static site — publish the repo root on GitHub Pages (branch `main`, folder `/`).
Live: https://fahad3235.github.io/wedding-budget-bd/

## Limitations

- Amounts are user-entered estimates, not live prices; vendor rates must be
  verified against the actual contract before paying.
- Data is stored only in one browser's localStorage — export a JSON backup
  before clearing browser data or switching devices.
- Single-wedding scope: one budget at a time (export/import to switch).
- Dates are limited to 2020-01-01 through 3 years from today; amounts to
  ৳100,000,000 per entry.

## Status

Built 2026-11-11 (factory run #301, 11:00 slot). Complete MVP, tested as above.
Personal planning tool — not accounting software.
