// wedding-budget-bd -- pure budget engine (no DOM, no storage).
// Money is integer paisa (1 BDT = 100 paisa) to avoid float error.
// Works in the browser (window.WB) and in node (module.exports).
(function (root) {
  'use strict';

  const APP = 'wedding-budget-bd';
  const VERSION = 1;
  const MAX_BDT = 100000000; // 10 crore BDT ceiling for any single amount
  const MAX_GUESTS = 100000;
  const MIN_DATE = '2020-01-01';

  const CATEGORIES = [
    { id: 'venue', en: 'Venue & Hall', bn: '\u09ad\u09c7\u09a8\u09cd\u09af\u09c1 \u0993 \u09b9\u09b2' },
    { id: 'food', en: 'Food & Catering', bn: '\u0996\u09be\u09ac\u09be\u09b0 \u0993 \u0995\u09cd\u09af\u09be\u099f\u09be\u09b0\u09bf\u0982' },
    { id: 'decor', en: 'Decoration & Flowers', bn: '\u09b8\u09be\u099c\u09b8\u099c\u09cd\u099c\u09be \u0993 \u09ab\u09c1\u09b2' },
    { id: 'photo', en: 'Photography & Video', bn: '\u09ab\u099f\u09cb\u0997\u09cd\u09b0\u09be\u09ab\u09bf \u0993 \u09ad\u09bf\u09a1\u09bf\u0993' },
    { id: 'attire', en: 'Bride & Groom Attire', bn: '\u09ac\u09b0-\u0995\u09a8\u09c7\u09b0 \u09aa\u09cb\u09b6\u09be\u0995' },
    { id: 'gifts', en: 'Guest Gifts & Favours', bn: '\u0985\u09a4\u09bf\u09a5\u09bf \u0989\u09aa\u09b9\u09be\u09b0' },
    { id: 'invites', en: 'Invitations & Cards', bn: '\u0986\u09ae\u09a8\u09cd\u09a4\u09cd\u09b0\u09a3\u09aa\u09a4\u09cd\u09b0' },
    { id: 'music', en: 'Music & Entertainment', bn: '\u09b8\u0982\u0997\u09c0\u09a4 \u0993 \u09ac\u09bf\u09a8\u09cb\u09a6\u09a8' },
    { id: 'transport', en: 'Transport & Accommodation', bn: '\u09aa\u09b0\u09bf\u09ac\u09b9\u09a8 \u0993 \u0986\u09ac\u09be\u09b8\u09a8' },
    { id: 'misc', en: 'Miscellaneous', bn: '\u09ac\u09bf\u09ac\u09bf\u09a7' },
  ];

  function categoryById(id) {
    return CATEGORIES.find((c) => c.id === id) || null;
  }

  function toPaisa(bdt) {
    return Math.round(bdt * 100);
  }

  function isInt(n) {
    return typeof n === 'number' && Number.isInteger(n);
  }

  let uidCounter = 0;
  function uid(prefix) {
    uidCounter += 1;
    return prefix + Date.now().toString(36) + uidCounter.toString(36) +
      Math.floor(Math.random() * 1296).toString(36);
  }

  function newState() {
    const caps = {};
    CATEGORIES.forEach((c) => { caps[c.id] = 0; });
    return {
      app: APP, version: VERSION,
      totalBudgetPaisa: 0, guests: 0,
      caps: caps, expenses: [], vendors: [], lang: 'en',
    };
  }

  function validDateString(s, asOf) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
    if (s < MIN_DATE) return false;
    const max = new Date(asOf || new Date());
    max.setFullYear(max.getFullYear() + 3);
    return s <= max.toISOString().slice(0, 10);
  }

  // ---- validation ----
  function validateExpense(e, asOf) {
    const errs = [];
    if (!categoryById(e.categoryId)) errs.push('bad-category');
    if (typeof e.desc !== 'string' || e.desc.trim().length === 0) errs.push('empty-desc');
    if (typeof e.desc === 'string' && e.desc.trim().length > 80) errs.push('desc-too-long');
    if (!isInt(e.amountPaisa) || e.amountPaisa < 1 || e.amountPaisa > toPaisa(MAX_BDT)) errs.push('bad-amount');
    if (!validDateString(e.date, asOf)) errs.push('bad-date');
    if (e.status !== 'paid' && e.status !== 'planned') errs.push('bad-status');
    if (e.vendor !== undefined && e.vendor !== null && typeof e.vendor !== 'string') errs.push('bad-vendor');
    if (typeof e.vendor === 'string' && e.vendor.length > 60) errs.push('vendor-too-long');
    return errs;
  }

  function validateVendor(v) {
    const errs = [];
    if (typeof v.name !== 'string' || v.name.trim().length === 0) errs.push('empty-name');
    if (typeof v.name === 'string' && v.name.trim().length > 60) errs.push('name-too-long');
    if (!categoryById(v.categoryId)) errs.push('bad-category');
    if (!isInt(v.contractPaisa) || v.contractPaisa < 1 || v.contractPaisa > toPaisa(MAX_BDT)) errs.push('bad-contract');
    if (!isInt(v.paidPaisa) || v.paidPaisa < 0 || v.paidPaisa > toPaisa(MAX_BDT)) errs.push('bad-paid');
    return errs;
  }

  // ---- mutations (return {ok, ...} ; mutate a deep copy only on success) ----
  function addExpense(state, e, asOf) {
    const errs = validateExpense(e, asOf);
    if (errs.length) return { ok: false, errors: errs };
    const exp = {
      id: uid('e'), categoryId: e.categoryId, desc: e.desc.trim(),
      amountPaisa: e.amountPaisa, date: e.date,
      vendor: (e.vendor || '').trim(), status: e.status,
    };
    state.expenses.push(exp);
    return { ok: true, expense: exp };
  }

  function editExpense(state, id, e, asOf) {
    const idx = state.expenses.findIndex((x) => x.id === id);
    if (idx === -1) return { ok: false, errors: ['not-found'] };
    const errs = validateExpense(e, asOf);
    if (errs.length) return { ok: false, errors: errs };
    state.expenses[idx] = {
      id: id, categoryId: e.categoryId, desc: e.desc.trim(),
      amountPaisa: e.amountPaisa, date: e.date,
      vendor: (e.vendor || '').trim(), status: e.status,
    };
    return { ok: true, expense: state.expenses[idx] };
  }

  function deleteExpense(state, id) {
    const before = state.expenses.length;
    state.expenses = state.expenses.filter((x) => x.id !== id);
    return { ok: state.expenses.length === before - 1 };
  }

  function addVendor(state, v) {
    const errs = validateVendor(v);
    if (errs.length) return { ok: false, errors: errs };
    const ven = {
      id: uid('v'), name: v.name.trim(), categoryId: v.categoryId,
      contractPaisa: v.contractPaisa, paidPaisa: v.paidPaisa,
    };
    state.vendors.push(ven);
    return { ok: true, vendor: ven };
  }

  function updateVendorPaid(state, id, paidPaisa) {
    const ven = state.vendors.find((x) => x.id === id);
    if (!ven) return { ok: false, errors: ['not-found'] };
    if (!isInt(paidPaisa) || paidPaisa < 0 || paidPaisa > toPaisa(MAX_BDT)) {
      return { ok: false, errors: ['bad-paid'] };
    }
    ven.paidPaisa = paidPaisa;
    return { ok: true, vendor: ven };
  }

  function deleteVendor(state, id) {
    const before = state.vendors.length;
    state.vendors = state.vendors.filter((x) => x.id !== id);
    return { ok: state.vendors.length === before - 1 };
  }

  function setTotalBudget(state, paisa) {
    if (!isInt(paisa) || paisa < 0 || paisa > toPaisa(MAX_BDT)) return { ok: false, errors: ['bad-budget'] };
    state.totalBudgetPaisa = paisa;
    return { ok: true };
  }

  function setGuests(state, n) {
    if (!isInt(n) || n < 0 || n > MAX_GUESTS) return { ok: false, errors: ['bad-guests'] };
    state.guests = n;
    return { ok: true };
  }

  function setCategoryCap(state, catId, paisa) {
    if (!categoryById(catId)) return { ok: false, errors: ['bad-category'] };
    if (!isInt(paisa) || paisa < 0 || paisa > toPaisa(MAX_BDT)) return { ok: false, errors: ['bad-cap'] };
    state.caps[catId] = paisa;
    return { ok: true };
  }

  // ---- derived ----
  function totals(state) {
    let paid = 0, planned = 0;
    state.expenses.forEach((e) => {
      if (e.status === 'paid') paid += e.amountPaisa;
      else planned += e.amountPaisa;
    });
    const committed = paid + planned;
    const remaining = state.totalBudgetPaisa - committed;
    const pctUsed = state.totalBudgetPaisa > 0
      ? Math.round((committed / state.totalBudgetPaisa) * 10000) / 100 : 0;
    const perGuestSpent = state.guests > 0 ? Math.round(paid / state.guests) : 0;
    const perGuestPlanned = state.guests > 0 ? Math.round(committed / state.guests) : 0;
    let vendorContract = 0, vendorPaid = 0;
    state.vendors.forEach((v) => { vendorContract += v.contractPaisa; vendorPaid += v.paidPaisa; });
    return {
      totalBudgetPaisa: state.totalBudgetPaisa, guests: state.guests,
      paidPaisa: paid, plannedPaisa: planned, committedPaisa: committed,
      remainingPaisa: remaining, pctUsed: pctUsed,
      perGuestSpentPaisa: perGuestSpent, perGuestPlannedPaisa: perGuestPlanned,
      vendorContractPaisa: vendorContract, vendorPaidPaisa: vendorPaid,
      vendorDuePaisa: vendorContract - vendorPaid,
      overBudget: remaining < 0,
    };
  }

  function categoryTotals(state) {
    return CATEGORIES.map((c) => {
      let paid = 0, planned = 0, count = 0;
      state.expenses.forEach((e) => {
        if (e.categoryId !== c.id) return;
        count += 1;
        if (e.status === 'paid') paid += e.amountPaisa;
        else planned += e.amountPaisa;
      });
      const cap = state.caps[c.id] || 0;
      const spent = paid + planned;
      return {
        id: c.id, en: c.en, bn: c.bn, capPaisa: cap,
        paidPaisa: paid, plannedPaisa: planned, spentPaisa: spent,
        remainingPaisa: cap - spent, count: count,
        pctOfCap: cap > 0 ? Math.round((spent / cap) * 10000) / 100 : (spent > 0 ? Infinity : 0),
        overCap: cap > 0 && spent > cap,
      };
    });
  }

  function vendorWithDue(v) {
    const due = v.contractPaisa - v.paidPaisa;
    return {
      id: v.id, name: v.name, categoryId: v.categoryId,
      contractPaisa: v.contractPaisa, paidPaisa: v.paidPaisa,
      duePaisa: due, fullyPaid: due <= 0, overpaid: due < 0,
    };
  }

  function chartData(state) {
    return categoryTotals(state)
      .filter((c) => c.spentPaisa > 0)
      .sort((a, b) => b.spentPaisa - a.spentPaisa);
  }

  // ---- import / export ----
  function exportPayload(state) {
    return JSON.stringify({
      app: APP, version: VERSION,
      totalBudgetPaisa: state.totalBudgetPaisa, guests: state.guests,
      caps: state.caps, expenses: state.expenses, vendors: state.vendors,
    });
  }

  function validateImport(payload, asOf) {
    let data;
    try { data = JSON.parse(payload); } catch (e) { return { ok: false, errors: ['not-json'] }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['not-object'] };
    const errs = [];
    if (data.app !== APP) errs.push('wrong-app');
    if (data.version !== VERSION) errs.push('wrong-version');
    if (!isInt(data.totalBudgetPaisa) || data.totalBudgetPaisa < 0 || data.totalBudgetPaisa > toPaisa(MAX_BDT)) errs.push('bad-budget');
    if (!isInt(data.guests) || data.guests < 0 || data.guests > MAX_GUESTS) errs.push('bad-guests');
    if (!data.caps || typeof data.caps !== 'object' || Array.isArray(data.caps)) errs.push('bad-caps');
    else {
      CATEGORIES.forEach((c) => {
        const v = data.caps[c.id];
        if (!isInt(v) || v < 0 || v > toPaisa(MAX_BDT)) errs.push('bad-cap:' + c.id);
      });
    }
    if (!Array.isArray(data.expenses)) errs.push('bad-expenses');
    else {
      const ids = new Set();
      data.expenses.forEach((e, i) => {
        if (!e || typeof e !== 'object') { errs.push('bad-expense:' + i); return; }
        if (typeof e.id !== 'string' || !e.id || ids.has(e.id)) errs.push('bad-expense-id:' + i);
        ids.add(e.id);
        validateExpense(e, asOf).forEach((x) => errs.push('expense:' + i + ':' + x));
      });
    }
    if (!Array.isArray(data.vendors)) errs.push('bad-vendors');
    else {
      const ids = new Set();
      data.vendors.forEach((v, i) => {
        if (!v || typeof v !== 'object') { errs.push('bad-vendor:' + i); return; }
        if (typeof v.id !== 'string' || !v.id || ids.has(v.id)) errs.push('bad-vendor-id:' + i);
        ids.add(v.id);
        validateVendor(v).forEach((x) => errs.push('vendor:' + i + ':' + x));
      });
    }
    if (errs.length) return { ok: false, errors: errs };
    return { ok: true, data: data };
  }

  function importState(payload, asOf) {
    const v = validateImport(payload, asOf);
    if (!v.ok) return v;
    const d = v.data;
    const st = newState();
    st.totalBudgetPaisa = d.totalBudgetPaisa;
    st.guests = d.guests;
    st.caps = d.caps;
    st.expenses = d.expenses;
    st.vendors = d.vendors;
    return { ok: true, state: st };
  }

  const api = {
    APP, VERSION, CATEGORIES, MAX_BDT, MAX_GUESTS, MIN_DATE,
    categoryById, toPaisa, newState, uid,
    validateExpense, validateVendor, validDateString,
    addExpense, editExpense, deleteExpense,
    addVendor, updateVendorPaid, deleteVendor,
    setTotalBudget, setGuests, setCategoryCap,
    totals, categoryTotals, vendorWithDue, chartData,
    exportPayload, validateImport, importState,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WB = api;
})(typeof window !== 'undefined' ? window : globalThis);
