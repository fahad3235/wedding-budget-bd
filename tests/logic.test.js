// wedding-budget-bd -- node unit tests for logic.js (pure engine).
// Run: node --test tests/logic.test.js
// All expected values were hand-computed; see TEST_RESULTS.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const WB = require('../logic.js');

const BDT = (taka) => Math.round(taka * 100); // BDT -> paisa
const ASOF = '2026-11-11';

function scenario() {
  const st = WB.newState();
  WB.setTotalBudget(st, BDT(1000000));
  WB.setGuests(st, 500);
  WB.setCategoryCap(st, 'venue', BDT(450000));
  WB.setCategoryCap(st, 'food', BDT(350000));
  WB.addExpense(st, { categoryId: 'venue', desc: 'Hall advance', amountPaisa: BDT(400000), date: '2026-10-01', vendor: 'Community centre', status: 'paid' }, ASOF);
  WB.addExpense(st, { categoryId: 'food', desc: 'Catering booking', amountPaisa: BDT(300000), date: '2026-10-05', vendor: '', status: 'planned' }, ASOF);
  WB.addExpense(st, { categoryId: 'decor', desc: 'Stage flowers', amountPaisa: BDT(50000), date: '2026-10-10', vendor: 'Dream Decor', status: 'paid' }, ASOF);
  WB.addExpense(st, { categoryId: 'photo', desc: 'Photo + video', amountPaisa: BDT(80000), date: '2026-10-12', vendor: '', status: 'planned' }, ASOF);
  WB.addVendor(st, { name: 'Dream Decor', categoryId: 'decor', contractPaisa: BDT(500000), paidPaisa: BDT(200000) });
  return st;
}

test('data: 10 categories, ids unique, venue first', () => {
  assert.equal(WB.CATEGORIES.length, 10);
  const ids = WB.CATEGORIES.map((c) => c.id);
  assert.equal(new Set(ids).size, 10);
  assert.equal(WB.categoryById('venue').en, 'Venue & Hall');
  assert.equal(WB.categoryById('food').bn, 'খাবার ও ক্যাটারিং');
  assert.equal(WB.categoryById('nope'), null);
  assert.equal(WB.MAX_BDT, 100000000);
});

test('totals: hand-verified scenario (1,000,000 budget, 500 guests)', () => {
  const st = scenario();
  const t = WB.totals(st);
  assert.equal(t.paidPaisa, BDT(450000)); // 400k venue + 50k decor
  assert.equal(t.plannedPaisa, BDT(380000)); // 300k food + 80k photo
  assert.equal(t.committedPaisa, BDT(830000));
  assert.equal(t.remainingPaisa, BDT(170000));
  assert.equal(t.pctUsed, 83);
  assert.equal(t.perGuestPlannedPaisa, BDT(1660)); // 830000/500
  assert.equal(t.perGuestSpentPaisa, BDT(900)); // 450000/500
  assert.equal(t.vendorContractPaisa, BDT(500000));
  assert.equal(t.vendorPaidPaisa, BDT(200000));
  assert.equal(t.vendorDuePaisa, BDT(300000));
  assert.equal(t.overBudget, false);
});

test('totals: over-budget flag and negative remaining', () => {
  const st = WB.newState();
  WB.setTotalBudget(st, BDT(100000));
  WB.addExpense(st, { categoryId: 'misc', desc: 'X', amountPaisa: BDT(120000), date: '2026-11-01', vendor: '', status: 'paid' }, ASOF);
  const t = WB.totals(st);
  assert.equal(t.remainingPaisa, BDT(-20000));
  assert.equal(t.pctUsed, 120);
  assert.equal(t.overBudget, true);
});

test('totals: zero budget and zero guests give 0s, no NaN', () => {
  const st = WB.newState();
  const t = WB.totals(st);
  assert.equal(t.pctUsed, 0);
  assert.equal(t.perGuestPlannedPaisa, 0);
  assert.equal(t.perGuestSpentPaisa, 0);
});

test('categoryTotals: venue 400k/450k cap = 88.89%, food 300k/350k', () => {
  const st = scenario();
  const cats = WB.categoryTotals(st);
  const venue = cats.find((c) => c.id === 'venue');
  assert.equal(venue.spentPaisa, BDT(400000));
  assert.equal(venue.remainingPaisa, BDT(50000));
  assert.equal(venue.pctOfCap, 88.89);
  assert.equal(venue.overCap, false);
  assert.equal(venue.count, 1);
  const food = cats.find((c) => c.id === 'food');
  assert.equal(food.plannedPaisa, BDT(300000));
  assert.equal(food.remainingPaisa, BDT(50000));
  const decor = cats.find((c) => c.id === 'decor');
  assert.equal(decor.spentPaisa, BDT(50000));
  assert.equal(decor.capPaisa, 0);
  assert.equal(decor.pctOfCap, Infinity); // spent with no cap
  assert.equal(decor.overCap, false);
});

test('categoryTotals: over-cap flag', () => {
  const st = WB.newState();
  WB.setCategoryCap(st, 'music', BDT(10000));
  WB.addExpense(st, { categoryId: 'music', desc: 'Band', amountPaisa: BDT(15000), date: '2026-11-01', vendor: '', status: 'planned' }, ASOF);
  const m = WB.categoryTotals(st).find((c) => c.id === 'music');
  assert.equal(m.overCap, true);
  assert.equal(m.pctOfCap, 150);
  assert.equal(m.remainingPaisa, BDT(-5000));
});

test('chartData: sorted desc, only categories with spending', () => {
  const st = scenario();
  const ch = WB.chartData(st);
  assert.equal(ch.length, 4);
  assert.equal(ch[0].id, 'venue');
  assert.equal(ch[1].id, 'food');
  assert.equal(ch[2].id, 'photo');
  assert.equal(ch[3].id, 'decor');
});

test('settings: budget/guests/cap validation', () => {
  const st = WB.newState();
  assert.equal(WB.setTotalBudget(st, BDT(500000)).ok, true);
  assert.equal(st.totalBudgetPaisa, BDT(500000));
  assert.equal(WB.setTotalBudget(st, -1).ok, false);
  assert.equal(WB.setTotalBudget(st, BDT(100000001)).ok, false);
  assert.equal(WB.setTotalBudget(st, 1.5).ok, false);
  assert.equal(WB.setGuests(st, 300).ok, true);
  assert.equal(WB.setGuests(st, -1).ok, false);
  assert.equal(WB.setGuests(st, 100001).ok, false);
  assert.equal(WB.setGuests(st, 2.5).ok, false);
  assert.equal(WB.setCategoryCap(st, 'venue', BDT(1000)).ok, true);
  assert.equal(WB.setCategoryCap(st, 'nope', BDT(1000)).ok, false);
  assert.equal(WB.setCategoryCap(st, 'venue', -5).ok, false);
});

test('expense validation: each bad field rejected', () => {
  const st = WB.newState();
  const base = { categoryId: 'venue', desc: 'Hall', amountPaisa: BDT(1000), date: '2026-11-01', vendor: '', status: 'paid' };
  assert.deepEqual(WB.validateExpense({ ...base, categoryId: 'nope' }, ASOF), ['bad-category']);
  assert.deepEqual(WB.validateExpense({ ...base, desc: '   ' }, ASOF), ['empty-desc']);
  assert.deepEqual(WB.validateExpense({ ...base, desc: 'x'.repeat(81) }, ASOF), ['desc-too-long']);
  assert.deepEqual(WB.validateExpense({ ...base, amountPaisa: 0 }, ASOF), ['bad-amount']);
  assert.deepEqual(WB.validateExpense({ ...base, amountPaisa: -5 }, ASOF), ['bad-amount']);
  assert.deepEqual(WB.validateExpense({ ...base, amountPaisa: BDT(100000001) }, ASOF), ['bad-amount']);
  assert.deepEqual(WB.validateExpense({ ...base, date: '2019-12-31' }, ASOF), ['bad-date']);
  assert.deepEqual(WB.validateExpense({ ...base, date: '2026-02-30' }, ASOF), ['bad-date']);
  assert.deepEqual(WB.validateExpense({ ...base, date: '2030-01-01' }, ASOF), ['bad-date']); // >3y ahead of 2026-11-11
  assert.deepEqual(WB.validateExpense({ ...base, status: 'maybe' }, ASOF), ['bad-status']);
  assert.equal(WB.validateExpense(base, ASOF).length, 0);
  assert.equal(WB.addExpense(st, base, ASOF).ok, true);
  assert.equal(st.expenses.length, 1);
  assert.equal(WB.addExpense(st, { ...base, amountPaisa: 0 }, ASOF).ok, false);
  assert.equal(st.expenses.length, 1); // rejected add does not mutate
});

test('expense edit/delete round-trip', () => {
  const st = scenario();
  const id = st.expenses[0].id;
  const r = WB.editExpense(st, id, { categoryId: 'venue', desc: 'Hall final', amountPaisa: BDT(410000), date: '2026-10-02', vendor: '', status: 'paid' }, ASOF);
  assert.equal(r.ok, true);
  assert.equal(WB.totals(st).paidPaisa, BDT(460000));
  assert.equal(WB.editExpense(st, 'missing', { categoryId: 'venue', desc: 'x', amountPaisa: BDT(1), date: '2026-11-01', vendor: '', status: 'paid' }, ASOF).ok, false);
  assert.equal(WB.deleteExpense(st, id).ok, true);
  assert.equal(WB.totals(st).paidPaisa, BDT(50000));
  assert.equal(WB.deleteExpense(st, id).ok, false);
});

test('vendor: due math, fully-paid, overpaid, update validation', () => {
  const st = scenario();
  const v = st.vendors[0];
  let vd = WB.vendorWithDue(v);
  assert.equal(vd.duePaisa, BDT(300000));
  assert.equal(vd.fullyPaid, false);
  assert.equal(WB.updateVendorPaid(st, v.id, BDT(500000)).ok, true);
  vd = WB.vendorWithDue(st.vendors[0]);
  assert.equal(vd.duePaisa, 0);
  assert.equal(vd.fullyPaid, true);
  assert.equal(WB.updateVendorPaid(st, v.id, BDT(500001)).ok, true);
  vd = WB.vendorWithDue(st.vendors[0]);
  assert.equal(vd.overpaid, true);
  assert.equal(vd.duePaisa, BDT(-1));
  assert.equal(WB.updateVendorPaid(st, v.id, -1).ok, false);
  assert.equal(WB.updateVendorPaid(st, 'missing', BDT(1)).ok, false);
  assert.equal(WB.addVendor(st, { name: '', categoryId: 'decor', contractPaisa: BDT(1), paidPaisa: 0 }).ok, false);
  assert.equal(WB.addVendor(st, { name: 'X', categoryId: 'nope', contractPaisa: BDT(1), paidPaisa: 0 }).ok, false);
  assert.equal(WB.deleteVendor(st, v.id).ok, true);
  assert.equal(st.vendors.length, 0);
});

test('export/import round-trip preserves scenario exactly', () => {
  const st = scenario();
  const payload = WB.exportPayload(st);
  assert.ok(payload.includes('"app":"wedding-budget-bd"'));
  const r = WB.importState(payload, ASOF);
  assert.equal(r.ok, true);
  assert.deepEqual(WB.totals(r.state), WB.totals(st));
  assert.equal(r.state.expenses.length, 4);
  assert.equal(r.state.vendors.length, 1);
  assert.equal(r.state.caps.venue, BDT(450000));
});

test('import validation: rejects wrong app, bad version, bad amounts, dup ids', () => {
  const st = scenario();
  const good = JSON.parse(WB.exportPayload(st));
  const bad1 = JSON.stringify({ ...good, app: 'other-app' });
  assert.equal(WB.validateImport(bad1, ASOF).ok, false);
  const bad2 = JSON.stringify({ ...good, version: 2 });
  assert.equal(WB.validateImport(bad2, ASOF).ok, false);
  const bad3 = JSON.stringify({ ...good, totalBudgetPaisa: -5 });
  assert.equal(WB.validateImport(bad3, ASOF).ok, false);
  const bad4 = JSON.parse(WB.exportPayload(st));
  bad4.expenses[1].id = bad4.expenses[0].id;
  assert.equal(WB.validateImport(JSON.stringify(bad4), ASOF).ok, false);
  const bad5 = JSON.parse(WB.exportPayload(st));
  bad5.expenses[0].amountPaisa = 0;
  assert.equal(WB.validateImport(JSON.stringify(bad5), ASOF).ok, false);
  assert.equal(WB.validateImport('{not json', ASOF).ok, false);
  assert.equal(WB.validateImport('[]', ASOF).ok, false);
  assert.equal(WB.validateImport(JSON.stringify({ ...good, caps: { venue: 'x' } }), ASOF).ok, false);
});
