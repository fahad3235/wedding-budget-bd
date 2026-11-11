// wedding-budget-bd -- DOM glue: render, forms, persistence, i18n.
(function () {
  'use strict';
  const WB = window.WB;
  const STR = window.WB_I18N;
  const STORE_KEY = 'wedding-budget-bd:v1';

  const params = new URLSearchParams(location.search);
  const ASOF = params.get('asof') || null; // deterministic "today" for tests
  function todayStr() {
    if (ASOF) return ASOF;
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];
  function toBn(s) { return String(s).replace(/[0-9]/g, (d) => BN_DIGITS[+d]); }

  let state = load();
  let editingExpenseId = null;
  let expFilter = '';

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return WB.newState();
      const v = WB.validateImport(raw, ASOF);
      if (v.ok) {
        const st = v.data;
        st.lang = (st.lang === 'bn' || st.lang === 'en') ? st.lang : 'en';
        return st;
      }
      return WB.newState();
    } catch (e) { return WB.newState(); }
  }
  function save() {
    try {
      const copy = JSON.parse(JSON.stringify(state));
      copy.lang = state.lang;
      localStorage.setItem(STORE_KEY, JSON.stringify(copy));
    } catch (e) { /* storage full/blocked: app still works in-memory */ }
  }

  function t(key) { return STR[state.lang][key] || STR.en[key] || key; }

  function fmt(paisa) {
    const neg = paisa < 0;
    const abs = Math.abs(paisa) / 100;
    let s = (neg ? '-' : '') + '\u09f3' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return state.lang === 'bn' ? toBn(s) : s;
  }
  function fmtNum(n) {
    const s = Number(n).toLocaleString('en-US');
    return state.lang === 'bn' ? toBn(s) : s;
  }
  function fmtPct(x) {
    if (x === Infinity) return '\u221e';
    const s = x.toFixed(2).replace(/\.00$/, '') + '%';
    return state.lang === 'bn' ? toBn(s) : s;
  }
  function parseBdtInput(val) {
    if (val === '' || val === null || val === undefined) return null;
    const n = Number(val);
    if (!isFinite(n)) return null;
    return WB.toPaisa(n);
  }

  const $ = (id) => document.getElementById(id);

  // ---- i18n ----
  function applyLang() {
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    $('title').textContent = t('title');
    $('subtitle').textContent = t('subtitle');
    $('footerText').textContent = t('footer');
    $('langBtn').textContent = t('langBtn');
    $('expSubmit').textContent = editingExpenseId ? t('expUpdate') : t('expSave');
    $('expCancel').hidden = !editingExpenseId;
    $('exportBtn').textContent = t('exportBtn');
    $('importBtn').textContent = t('importBtn');
    $('eraseBtn').textContent = t('eraseBtn');
    $('tab-dash').textContent = t('tabDash');
    $('tab-cats').textContent = t('tabCats');
    $('tab-exp').textContent = t('tabExp');
    $('tab-ven').textContent = t('tabVen');
    $('tab-data').textContent = t('tabData');
    $('expStatus').options[0].textContent = t('statusPaid');
    $('expStatus').options[1].textContent = t('statusPlanned');
    document.title = t('title');
  }

  // ---- tabs ----
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'panel-' + tab; });
    });
  });
  $('langBtn').addEventListener('click', () => {
    state.lang = state.lang === 'bn' ? 'en' : 'bn';
    save(); applyLang(); renderAll();
  });

  // ---- dashboard ----
  function renderDash() {
    const tot = WB.totals(state);
    $('statPaid').textContent = fmt(tot.paidPaisa);
    $('statPlanned').textContent = fmt(tot.plannedPaisa);
    $('statCommitted').textContent = fmt(tot.committedPaisa);
    $('statRemaining').textContent = fmt(tot.remainingPaisa);
    $('statPct').textContent = fmtPct(tot.pctUsed);
    $('pctBar').style.width = Math.min(100, tot.pctUsed) + '%';
    $('pctBar').classList.toggle('over', tot.overBudget);
    $('statPerGuest').textContent = fmt(tot.perGuestPlannedPaisa);
    $('statPerGuestPaid').textContent = fmt(tot.perGuestSpentPaisa);
    $('statVendorContract').textContent = fmt(tot.vendorContractPaisa);
    $('statVendorPaid').textContent = fmt(tot.vendorPaidPaisa);
    $('statVendorDue').textContent = fmt(tot.vendorDuePaisa);
    $('overBanner').hidden = !tot.overBudget;
    $('overBanner').textContent = tot.overBudget ? t('dashOver') : '';
    $('budgetInput').value = state.totalBudgetPaisa ? (state.totalBudgetPaisa / 100) : '';
    $('guestsInput').value = state.guests ? state.guests : '';

    const chart = WB.chartData(state);
    const wrap = $('chartWrap');
    wrap.innerHTML = '';
    $('chartEmpty').hidden = chart.length > 0;
    $('chartEmpty').textContent = t('dashChartEmpty');
    $('dashEmpty').hidden = state.expenses.length > 0;
    $('dashEmpty').textContent = t('dashEmpty');
    if (chart.length) {
      const max = chart[0].spentPaisa;
      chart.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'chart-row';
        const name = document.createElement('span');
        name.className = 'cname';
        name.textContent = state.lang === 'bn' ? c.bn : c.en;
        const track = document.createElement('div');
        track.className = 'chart-track';
        const fill = document.createElement('div');
        fill.className = 'chart-fill';
        fill.style.width = Math.round((c.spentPaisa / max) * 100) + '%';
        track.appendChild(fill);
        const val = document.createElement('span');
        val.className = 'cval';
        val.textContent = fmt(c.spentPaisa);
        row.appendChild(name); row.appendChild(track); row.appendChild(val);
        wrap.appendChild(row);
      });
    }
  }

  // ---- categories ----
  function renderCats() {
    const list = $('catList');
    list.innerHTML = '';
    WB.categoryTotals(state).forEach((c) => {
      const row = document.createElement('div');
      row.className = 'cat-row';
      row.setAttribute('data-cat', c.id);
      const head = document.createElement('div');
      head.className = 'cat-head';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = state.lang === 'bn' ? c.bn : c.en;
      const capInput = document.createElement('input');
      capInput.type = 'number'; capInput.min = '0'; capInput.step = '1';
      capInput.setAttribute('aria-label', t('catCap'));
      capInput.value = c.capPaisa ? (c.capPaisa / 100) : '';
      capInput.placeholder = t('catCap');
      capInput.addEventListener('change', () => {
        const p = parseBdtInput(capInput.value);
        const r = (p === null || p === 0) && capInput.value !== '' && capInput.value !== '0'
          ? { ok: false } : WB.setCategoryCap(state, c.id, p === null ? 0 : p);
        if (!r.ok) {
          $('capErr').hidden = false;
          $('capErr').textContent = t('errBadCap');
          return;
        }
        $('capErr').hidden = true;
        save(); renderAll();
      });
      head.appendChild(name); head.appendChild(capInput);
      const meta = document.createElement('p');
      meta.className = 'cat-meta';
      const spentTxt = t('catSpent') + ': ' + fmt(c.spentPaisa);
      const leftTxt = t('catRemaining') + ': ' + fmt(c.remainingPaisa);
      const cntTxt = fmtNum(c.count) + ' ' + t('catExpenses');
      meta.textContent = spentTxt + ' \u00b7 ' + leftTxt + ' \u00b7 ' + cntTxt;
      if (c.overCap) {
        const over = document.createElement('span');
        over.className = 'over-txt';
        over.textContent = ' \u00b7 ' + t('catOver');
        meta.appendChild(over);
      }
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('div');
      fill.className = 'bar-fill' + (c.overCap ? ' over' : '');
      fill.style.width = c.capPaisa ? Math.min(100, c.pctOfCap) + '%' : (c.spentPaisa > 0 ? '100%' : '0%');
      bar.appendChild(fill);
      row.appendChild(head); row.appendChild(bar); row.appendChild(meta);
      list.appendChild(row);
    });
  }

  // ---- expenses ----
  function expenseOptions() {
    const mk = (sel, includeAll) => {
      sel.innerHTML = '';
      if (includeAll) {
        const o = document.createElement('option');
        o.value = ''; o.textContent = 'All';
        sel.appendChild(o);
      }
      WB.CATEGORIES.forEach((c) => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = state.lang === 'bn' ? c.bn : c.en;
        sel.appendChild(o);
      });
    };
    mk($('expCat'), false);
    mk($('expFilter'), true);
    mk($('venCat'), false);
    $('expFilter').value = expFilter;
  }

  function renderExpenses() {
    const list = $('expList');
    list.innerHTML = '';
    const rows = state.expenses
      .filter((e) => !expFilter || e.categoryId === expFilter)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    $('expEmpty').hidden = rows.length > 0;
    $('expEmpty').textContent = t('expEmpty');
    rows.forEach((e) => {
      const li = document.createElement('li');
      const cat = WB.categoryById(e.categoryId);
      const main = document.createElement('div');
      main.className = 'grow';
      const title = document.createElement('strong');
      title.textContent = e.desc;
      const sub = document.createElement('div');
      sub.className = 'cat-meta';
      const catName = state.lang === 'bn' ? cat.bn : cat.en;
      sub.textContent = catName + ' \u00b7 ' + (state.lang === 'bn' ? toBn(e.date) : e.date) +
        (e.vendor ? ' \u00b7 ' + e.vendor : '');
      main.appendChild(title); main.appendChild(sub);
      const badge = document.createElement('span');
      badge.className = 'badge' + (e.status === 'paid' ? ' paid' : '');
      badge.textContent = e.status === 'paid' ? t('expPaidBadge') : t('expPlannedBadge');
      const amt = document.createElement('strong');
      amt.textContent = fmt(e.amountPaisa);
      const editBtn = document.createElement('button');
      editBtn.className = 'btn mini'; editBtn.type = 'button';
      editBtn.textContent = t('expEdit');
      editBtn.addEventListener('click', () => startEditExpense(e.id));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn mini danger'; delBtn.type = 'button';
      delBtn.textContent = t('expDelete');
      delBtn.addEventListener('click', () => {
        if (!window.confirm(t('confirmDelete'))) return;
        WB.deleteExpense(state, e.id);
        save(); renderAll();
      });
      li.appendChild(main); li.appendChild(badge); li.appendChild(amt);
      li.appendChild(editBtn); li.appendChild(delBtn);
      list.appendChild(li);
    });
  }

  function startEditExpense(id) {
    const e = state.expenses.find((x) => x.id === id);
    if (!e) return;
    editingExpenseId = id;
    $('expDesc').value = e.desc;
    $('expCat').value = e.categoryId;
    $('expAmount').value = e.amountPaisa / 100;
    $('expDate').value = e.date;
    $('expVendor').value = e.vendor || '';
    $('expStatus').value = e.status;
    $('expSubmit').textContent = t('expUpdate');
    $('expCancel').hidden = false;
    document.querySelector('[data-tab="exp"]').click();
    $('expDesc').focus();
  }

  $('expCancel').addEventListener('click', () => {
    editingExpenseId = null;
    $('expForm').reset();
    $('expDate').value = todayStr();
    $('expSubmit').textContent = t('expSave');
    $('expCancel').hidden = true;
    $('expErr').hidden = true;
  });

  $('expForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const errEl = $('expErr');
    const showErr = (key) => { errEl.hidden = false; errEl.textContent = t(key); };
    const amountPaisa = parseBdtInput($('expAmount').value);
    const payload = {
      categoryId: $('expCat').value,
      desc: $('expDesc').value,
      amountPaisa: amountPaisa === null ? 0 : amountPaisa,
      date: $('expDate').value,
      vendor: $('expVendor').value,
      status: $('expStatus').value,
    };
    const errs = WB.validateExpense(payload, ASOF);
    if (errs.length) {
      if (errs.includes('empty-desc') || errs.includes('desc-too-long')) return showErr('errEmptyDesc');
      if (errs.includes('bad-amount')) return showErr('errBadAmount');
      if (errs.includes('bad-date')) return showErr('errBadDate');
      return showErr('errBadAmount');
    }
    let r;
    if (editingExpenseId) r = WB.editExpense(state, editingExpenseId, payload, ASOF);
    else r = WB.addExpense(state, payload, ASOF);
    if (!r.ok) return showErr('errBadAmount');
    errEl.hidden = true;
    editingExpenseId = null;
    $('expForm').reset();
    $('expDate').value = todayStr();
    $('expSubmit').textContent = t('expSave');
    $('expCancel').hidden = true;
    save(); renderAll();
  });

  $('expFilter').addEventListener('change', () => {
    expFilter = $('expFilter').value;
    renderExpenses();
  });

  // ---- vendors ----
  function renderVendors() {
    const list = $('venList');
    list.innerHTML = '';
    $('venEmpty').hidden = state.vendors.length > 0;
    $('venEmpty').textContent = t('venEmpty');
    state.vendors.forEach((v) => {
      const vd = WB.vendorWithDue(v);
      const cat = WB.categoryById(v.categoryId);
      const li = document.createElement('li');
      const main = document.createElement('div');
      main.className = 'grow';
      const title = document.createElement('strong');
      title.textContent = v.name;
      const sub = document.createElement('div');
      sub.className = 'cat-meta';
      const catName = state.lang === 'bn' ? cat.bn : cat.en;
      sub.textContent = catName + ' \u00b7 ' + t('venContract') + ': ' + fmt(v.contractPaisa) +
        ' \u00b7 ' + t('venPaid') + ': ' + fmt(v.paidPaisa) + ' \u00b7 ' + t('venDue') + ': ' + fmt(vd.duePaisa);
      main.appendChild(title); main.appendChild(sub);
      if (vd.fullyPaid) {
        const b = document.createElement('span');
        b.className = 'badge paid';
        b.textContent = vd.overpaid ? t('venOverpaid') : t('venFullyPaid');
        li.appendChild(main); li.appendChild(b);
      } else {
        li.appendChild(main);
      }
      const paidInput = document.createElement('input');
      paidInput.type = 'number'; paidInput.min = '0'; paidInput.step = '1';
      paidInput.value = v.paidPaisa / 100;
      paidInput.style.width = '130px';
      paidInput.setAttribute('aria-label', t('venUpdatePaid'));
      const updBtn = document.createElement('button');
      updBtn.className = 'btn mini'; updBtn.type = 'button';
      updBtn.textContent = t('venUpdatePaid');
      updBtn.addEventListener('click', () => {
        const p = parseBdtInput(paidInput.value);
        const r = p === null ? { ok: false } : WB.updateVendorPaid(state, v.id, p);
        if (!r.ok) { $('venErr').hidden = false; $('venErr').textContent = t('errBadPaid'); return; }
        $('venErr').hidden = true;
        save(); renderAll();
      });
      const fullBtn = document.createElement('button');
      fullBtn.className = 'btn mini'; fullBtn.type = 'button';
      fullBtn.textContent = t('venMarkPaid');
      fullBtn.addEventListener('click', () => {
        WB.updateVendorPaid(state, v.id, v.contractPaisa);
        save(); renderAll();
      });
      const delBtn = document.createElement('button');
      delBtn.className = 'btn mini danger'; delBtn.type = 'button';
      delBtn.textContent = t('expDelete');
      delBtn.addEventListener('click', () => {
        if (!window.confirm(t('confirmDelete'))) return;
        WB.deleteVendor(state, v.id);
        save(); renderAll();
      });
      li.appendChild(paidInput); li.appendChild(updBtn); li.appendChild(fullBtn); li.appendChild(delBtn);
      list.appendChild(li);
    });
  }

  $('venForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const errEl = $('venErr');
    const showErr = (key) => { errEl.hidden = false; errEl.textContent = t(key); };
    const contract = parseBdtInput($('venContract').value);
    const paid = parseBdtInput($('venPaid').value);
    const payload = {
      name: $('venName').value,
      categoryId: $('venCat').value,
      contractPaisa: contract === null ? 0 : contract,
      paidPaisa: paid === null ? 0 : paid,
    };
    const errs = WB.validateVendor(payload);
    if (errs.length) {
      if (errs.includes('empty-name') || errs.includes('name-too-long')) return showErr('errBadName');
      if (errs.includes('bad-contract')) return showErr('errBadContract');
      if (errs.includes('bad-paid')) return showErr('errBadPaid');
      return showErr('errBadContract');
    }
    const r = WB.addVendor(state, payload);
    if (!r.ok) return showErr('errBadContract');
    errEl.hidden = true;
    $('venForm').reset();
    save(); renderAll();
  });

  // ---- settings ----
  $('settingsForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const errEl = $('settingsErr');
    const budget = parseBdtInput($('budgetInput').value);
    const guests = $('guestsInput').value === '' ? 0 : Number($('guestsInput').value);
    const rb = WB.setTotalBudget(state, budget === null ? 0 : budget);
    if (!rb.ok) { errEl.hidden = false; errEl.textContent = t('errBadBudget'); return; }
    const rg = WB.setGuests(state, guests);
    if (!rg.ok) { errEl.hidden = false; errEl.textContent = t('errBadGuests'); return; }
    errEl.hidden = true;
    $('settingsOk').hidden = false;
    $('settingsOk').textContent = t('settingsSaved');
    save(); renderAll();
  });

  // ---- data tab ----
  $('exportBtn').addEventListener('click', () => {
    $('exportText').value = WB.exportPayload(state);
  });
  $('importBtn').addEventListener('click', () => {
    const r = WB.importState($('importText').value, ASOF);
    if (!r.ok) {
      $('importFail').hidden = false;
      $('importFail').textContent = t('importFail');
      $('importOk').hidden = true;
      return;
    }
    state = r.state;
    state.lang = state.lang || 'en';
    $('importFail').hidden = true;
    $('importOk').hidden = false;
    $('importOk').textContent = t('importOk');
    save(); applyLang(); expenseOptions(); renderAll();
  });
  $('eraseBtn').addEventListener('click', () => {
    if ($('eraseInput').value !== 'DELETE') {
      $('eraseWrong').hidden = false;
      $('eraseWrong').textContent = t('eraseWrong');
      $('erasedMsg').hidden = true;
      return;
    }
    state = WB.newState();
    state.lang = 'en';
    editingExpenseId = null;
    $('eraseWrong').hidden = true;
    $('erasedMsg').hidden = false;
    $('erasedMsg').textContent = t('erasedMsg');
    $('eraseInput').value = '';
    save(); applyLang(); expenseOptions(); renderAll();
  });

  function renderAll() {
    renderDash(); renderCats(); renderExpenses(); renderVendors();
  }

  // ---- init ----
  $('expDate').value = todayStr();
  expenseOptions();
  applyLang();
  renderAll();

  // test hooks (used by tests/smoke.js only)
  window.__wbbd = {
    get state() { return state; },
    exportPayload: () => WB.exportPayload(state),
    importPayload: (s) => {
      const r = WB.importState(s, ASOF);
      if (r.ok) { state = r.state; save(); applyLang(); expenseOptions(); renderAll(); }
      return r;
    },
    eraseAll: () => {
      state = WB.newState(); state.lang = 'en'; editingExpenseId = null;
      save(); applyLang(); expenseOptions(); renderAll();
    },
    setLang: (l) => { state.lang = l; save(); applyLang(); renderAll(); },
  };
})();
