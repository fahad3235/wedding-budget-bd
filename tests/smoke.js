// wedding-budget-bd -- headless-Chrome smoke test via raw CDP (no puppeteer).
// Usage: node tests/smoke.js
// Exits non-zero on any failed assertion; fails on page console errors.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 9361;
const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?asof=2026-11-11';
let failures = 0;
let count = 0;
const pageErrors = [];
function check(name, cond, extra) {
  count++;
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const CHROME_BIN = process.env.CHROME_BIN ||
    require('os').homedir() + '/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell';
  const chrome = spawn(CHROME_BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/wbbd-smoke-' + process.pid,
    'about:blank',
  ], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 50 && targets.length === 0; i++) {
    await wait(200);
    try {
      targets = JSON.parse(await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/json/list', (r) => {
          let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d));
        }).on('error', rej);
      }));
    } catch (e) { /* retry */ }
  }
  if (!targets.length) { console.log('FAIL - chrome did not start'); process.exit(2); }
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res) => { ws.onopen = res; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push('console.error: ' + JSON.stringify(msg.params.args).slice(0, 300));
    }
  };
  function send(method, params) {
    return new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const nav = async (url) => { await send('Page.navigate', { url }); await wait(1400); };
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
    return r.result ? r.result.result.value : undefined;
  };
  const clickTab = async (name) => ev(`document.querySelector('[data-tab="${name}"]').click()`);
  const BN_TITLE = '\u09ac\u09bf\u09af\u09bc\u09c7\u09b0 \u09ac\u09be\u099c\u09c7\u099f \u09ac\u09bf\u09a1\u09bf'; // decomposed য় = য + nukta, as in i18n.js
  const setExp = (desc, cat, amount, date, vendor, status) => ev(
    `document.getElementById('expDesc').value=${JSON.stringify(desc)};` +
    `document.getElementById('expCat').value=${JSON.stringify(cat)};` +
    `document.getElementById('expAmount').value=${JSON.stringify(String(amount))};` +
    `document.getElementById('expDate').value=${JSON.stringify(date)};` +
    `document.getElementById('expVendor').value=${JSON.stringify(vendor)};` +
    `document.getElementById('expStatus').value=${JSON.stringify(status)};` +
    `document.getElementById('expSubmit').click()`);

  // ---- Load: defaults ----
  await nav(BASE);
  check('page title is Wedding Budget BD', (await ev('document.title')) === 'Wedding Budget BD');
  check('subtitle present', (await ev(`document.getElementById('subtitle').textContent`)).length > 40);
  check('5 tabs', (await ev(`document.querySelectorAll('.tab').length`)) === 5);
  check('10 category rows', (await ev(`document.querySelectorAll('#catList .cat-row').length`)) === 10);
  check('expenses empty state shown', (await ev(`document.getElementById('expEmpty').hidden`)) === false);
  check('dashboard empty state shown', (await ev(`document.getElementById('dashEmpty').hidden`)) === false);
  check('remaining is ৳0.00 with no budget', (await ev(`document.getElementById('statRemaining').textContent`)) === '\u09f30.00');

  // ---- Settings: budget 1,000,000 + 500 guests ----
  await ev(`document.getElementById('budgetInput').value='1000000'; document.getElementById('guestsInput').value='500'; document.getElementById('settingsForm').dispatchEvent(new Event('submit'))`);
  check('settings saved message', (await ev(`document.getElementById('settingsOk').hidden`)) === false);
  check('remaining is ৳1,000,000.00', (await ev(`document.getElementById('statRemaining').textContent`)) === '\u09f31,000,000.00');

  // ---- Validation: empty description rejected ----
  await clickTab('exp');
  await ev(`document.getElementById('expDesc').value=''; document.getElementById('expCat').value='venue'; document.getElementById('expAmount').value='1000'; document.getElementById('expDate').value='2026-10-01'; document.getElementById('expStatus').value='paid'; document.getElementById('expSubmit').click()`);
  check('empty desc shows inline error', (await ev(`document.getElementById('expErr').hidden`)) === false);
  check('no expense added on bad submit', (await ev(`document.querySelectorAll('#expList li').length`)) === 0);

  // ---- Add venue paid 400,000 ----
  await setExp('Hall advance', 'venue', 400000, '2026-10-01', 'Community centre', 'paid');
  check('1 expense listed', (await ev(`document.querySelectorAll('#expList li').length`)) === 1);
  check('expense shows Paid badge', (await ev(`document.querySelector('#expList .badge').textContent`)) === 'Paid');
  await clickTab('dash');
  check('paid is ৳400,000.00', (await ev(`document.getElementById('statPaid').textContent`)) === '\u09f3400,000.00');
  check('per guest paid is ৳800.00', (await ev(`document.getElementById('statPerGuestPaid').textContent`)) === '\u09f3800.00');
  check('remaining is ৳600,000.00', (await ev(`document.getElementById('statRemaining').textContent`)) === '\u09f3600,000.00');
  check('chart has 1 row', (await ev(`document.querySelectorAll('#chartWrap .chart-row').length`)) === 1);

  // ---- Add food planned 300,000 ----
  await clickTab('exp');
  await setExp('Catering booking', 'food', 300000, '2026-10-05', '', 'planned');
  await clickTab('dash');
  check('planned is ৳300,000.00', (await ev(`document.getElementById('statPlanned').textContent`)) === '\u09f3300,000.00');
  check('committed is ৳700,000.00', (await ev(`document.getElementById('statCommitted').textContent`)) === '\u09f3700,000.00');
  check('pct used is 70%', (await ev(`document.getElementById('statPct').textContent`)) === '70%');
  check('per guest committed is ৳1,400.00', (await ev(`document.getElementById('statPerGuest').textContent`)) === '\u09f31,400.00');
  check('chart has 2 rows', (await ev(`document.querySelectorAll('#chartWrap .chart-row').length`)) === 2);

  // ---- Category cap: venue 450,000 -> 50,000 left ----
  await clickTab('cats');
  await ev(`const i=document.querySelector('[data-cat="venue"] input'); i.value='450000'; i.dispatchEvent(new Event('change'))`);
  check('venue cap row shows ৳50,000.00 left', (await ev(`document.querySelector('[data-cat="venue"] .cat-meta').textContent`)).includes('\u09f350,000.00'));
  check('venue cap row shows 1 expense', (await ev(`document.querySelector('[data-cat="venue"] .cat-meta').textContent`)).includes('1'));

  // ---- Edit expense: venue 400,000 -> 410,000 ----
  await clickTab('exp');
  await ev(`document.querySelectorAll('#expList li')[1].querySelector('.btn.mini').click()`); // venue row (date-desc sort: food first)
  check('edit mode: submit says Save changes', (await ev(`document.getElementById('expSubmit').textContent`)) === 'Save changes');
  await ev(`document.getElementById('expAmount').value='410000'; document.getElementById('expSubmit').click()`);
  await clickTab('dash');
  check('paid is ৳410,000.00 after edit', (await ev(`document.getElementById('statPaid').textContent`)) === '\u09f3410,000.00');

  // ---- Delete expense (confirm stubbed true) ----
  await clickTab('exp');
  await ev(`window.confirm = () => true; document.querySelectorAll('#expList li')[0].querySelector('.btn.mini.danger').click()`); // delete food (planned) row
  check('1 expense left after delete', (await ev(`document.querySelectorAll('#expList li').length`)) === 1);
  await clickTab('dash');
  check('planned is ৳0.00 after delete', (await ev(`document.getElementById('statPlanned').textContent`)) === '\u09f30.00');

  // ---- Vendor: add + due math + mark paid in full ----
  await clickTab('ven');
  await ev(`document.getElementById('venName').value='Dream Decor'; document.getElementById('venCat').value='decor'; document.getElementById('venContract').value='500000'; document.getElementById('venPaid').value='200000'; document.getElementById('venForm').dispatchEvent(new Event('submit'))`);
  check('1 vendor listed', (await ev(`document.querySelectorAll('#venList li').length`)) === 1);
  await clickTab('dash');
  check('vendor due is ৳300,000.00', (await ev(`document.getElementById('statVendorDue').textContent`)) === '\u09f3300,000.00');
  check('vendor paid is ৳200,000.00', (await ev(`document.getElementById('statVendorPaid').textContent`)) === '\u09f3200,000.00');
  await clickTab('ven');
  await ev(`document.querySelector('#venList li .btn.mini:nth-of-type(2)').click()`); // mark paid in full (2nd mini button)
  check('fully-paid badge appears', (await ev(`document.querySelector('#venList .badge.paid').textContent`)) === 'Fully paid');
  await clickTab('dash');
  check('vendor due is ৳0.00 after full payment', (await ev(`document.getElementById('statVendorDue').textContent`)) === '\u09f30.00');

  // ---- Persistence across reload ----
  await nav(BASE);
  check('budget persists after reload', (await ev(`document.getElementById('statRemaining').textContent`)) === '\u09f3590,000.00');
  await clickTab('ven');
  check('vendor persists after reload', (await ev(`document.querySelectorAll('#venList li').length`)) === 1);

  // ---- Export / erase / import round-trip via test hooks ----
  const payload = await ev(`window.__wbbd.exportPayload()`);
  check('export payload is wedding-budget-bd v1', payload.includes('"app":"wedding-budget-bd"') && payload.includes('"version":1'), payload.slice(0, 120));
  check('export carries Hall advance', payload.includes('Hall advance'));
  await ev(`window.__wbbd.eraseAll()`);
  check('eraseAll empties expenses', (await ev(`window.__wbbd.exportPayload()`)).includes('"expenses":[]'));
  const imp = await ev(`JSON.stringify(window.__wbbd.importPayload(${JSON.stringify(payload)}))`);
  check('import valid payload ok', imp.includes('"ok":true'), imp);
  check('import restores Hall advance', (await ev(`window.__wbbd.exportPayload()`)).includes('Hall advance'));
  const badImp = await ev(`JSON.stringify(window.__wbbd.importPayload('{"app":"land-tax-bd","version":1}'))`);
  check('import wrong app rejected', badImp.includes('"ok":false'));
  check('invalid import leaves data intact', (await ev(`window.__wbbd.exportPayload()`)).includes('Hall advance'));

  // ---- Bad import via UI textarea; good import succeeds ----
  await clickTab('data');
  await ev(`document.getElementById('importText').value='{not json'; document.getElementById('importBtn').click()`);
  check('bad UI import shows error', (await ev(`document.getElementById('importFail').hidden`)) === false);
  await ev(`document.getElementById('importText').value=${JSON.stringify(payload)}; document.getElementById('importBtn').click()`);
  check('good UI import succeeds', (await ev(`document.getElementById('importOk').hidden`)) === false);

  // ---- Typed-DELETE erase via UI; wrong word rejected ----
  await ev(`document.getElementById('eraseInput').value='delete'; document.getElementById('eraseBtn').click();`);
  check('wrong erase word rejected', (await ev(`document.getElementById('eraseWrong').hidden`)) === false);
  check('wrong erase keeps data', (await ev(`window.__wbbd.exportPayload()`)).includes('Hall advance'));
  await ev(`document.getElementById('eraseInput').value='DELETE'; document.getElementById('eraseBtn').click();`);
  check('DELETE erases data', (await ev(`window.__wbbd.exportPayload()`)).includes('"expenses":[]'));
  check('erase success message shows', (await ev(`document.getElementById('erasedMsg').hidden`)) === false);

  // ---- BN toggle ----
  await clickTab('dash');
  await ev(`document.getElementById('budgetInput').value='1000000'; document.getElementById('guestsInput').value='500'; document.getElementById('settingsForm').dispatchEvent(new Event('submit'))`);
  await clickTab('exp');
  await setExp('Hall advance', 'venue', 400000, '2026-10-01', '', 'paid');
  await clickTab('dash');
  await ev(`document.getElementById('langBtn').click()`);
  check('BN toggle: title in Bengali', (await ev(`document.getElementById('title').textContent`)) === BN_TITLE);
  check('BN toggle: paid in Bengali digits', (await ev(`document.getElementById('statPaid').textContent`)) === '\u09f3\u09ea\u09e6\u09e6,\u09e6\u09e6\u09e6.\u09e6\u09e6');
  check('BN toggle: tab label in Bengali', (await ev(`document.getElementById('tab-dash').textContent`)) === '\u09a1\u09cd\u09af\u09be\u09b6\u09ac\u09cb\u09b0\u09cd\u09a1');
  await nav(BASE);
  check('BN toggle persists after reload', (await ev(`window.__wbbd.state.lang`)) === 'bn');
  await ev(`document.getElementById('langBtn').click()`);
  check('back to EN', (await ev(`window.__wbbd.state.lang`)) === 'en');

  // ---- Mobile 390px: no horizontal overflow on any tab ----
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav(BASE);
  for (const tab of ['dash', 'cats', 'exp', 'ven', 'data']) {
    await clickTab(tab);
    await wait(300);
    const overflow = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
    check('390px no overflow on ' + tab + ' tab', overflow <= 0, 'overflow=' + overflow);
  }

  // ---- Zero network requests: app is fully offline (only file:// loads) ----
  const reqs = await ev(`performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith('file://')).length`);
  check('zero non-file network requests', reqs === 0, 'non-file=' + reqs);

  check('no console/page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  chrome.kill();
  console.log('\n' + count + ' checks, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL - harness error: ' + e.message); try { chrome.kill(); } catch (_) {} process.exit(2); });
