/**
 * Separate admin/analyst documents share this rendering code, not a login entry page.
 * api.js owns authentication; this file renders
 * API data, forwards explicit admin commands and manages the Superset iframe.
 * Epoch/query counters reject responses from old sessions or searches, and textContent
 * keeps untrusted API strings from becoming executable markup.
 */

import { embedDashboard } from '@superset-ui/embedded-sdk';
import * as api from './api.js';

const $ = id => document.getElementById(id);
let epoch = 0;
let clientNameVersion = 0;
let clientNameTimer = null;
const portalRole = document.body.dataset.loginRole;
let selectedOrder = null;
let activePanel = null;
let orderPoll = null;
let orderPollBusy = false;
let scheduleDirty = false;
let reportPoll = null;
let embedded = null;
let embedVersion = 0;
let orderVersion = 0;
let accountVersion = 0;
let suspensionAccount = null;
let suspensionSearchVersion = 0;
let suspensionSearchTimer = null;
const searches = { orders: { page: 0, version: 0, params: {} }, clients: { page: 0, version: 0, params: {} } };
const time = value => value ? new Date(value).toLocaleString() : 'Not recorded';
const amount = value => value == null ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
const money = value => value == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Never render API data as HTML. Text nodes also keep recorded reasons and emails safe.
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function table(target, columns, rows, empty = 'No records found.') {
  const container = $(target);
  container.replaceChildren();
  if (!rows.length) { container.append(node('p', empty, 'empty')); return; }
  const result = node('table');
  const head = node('tr');
  columns.forEach(([title]) => { const cell = node('th', title); cell.scope = 'col'; head.append(cell); });
  const thead = node('thead'); thead.append(head); result.append(thead);
  const body = node('tbody');
  rows.forEach(row => {
    const tr = node('tr');
    columns.forEach(([, read]) => {
      const value = read(row);
      const cell = node('td');
      cell.append(value instanceof Node ? value : document.createTextNode(String(value ?? '—')));
      tr.append(cell);
    });
    body.append(tr);
  });
  result.append(body); container.append(result);
}
function facts(target, values) {
  const list = node('dl', null, 'facts');
  values.forEach(([label, value]) => { const item = node('div'); item.append(node('dt', label), node('dd', value ?? '—')); list.append(item); });
  $(target).replaceChildren(list);
}
function link(label, action) {
  const button = node('button', label, 'link');
  button.type = 'button';
  button.addEventListener('click', () => run(button, action));
  return button;
}
function check(version) {
  if (version !== epoch || !api.claims()) throw new DOMException('Session changed', 'AbortError');
}
async function run(button, action) {
  $('message').hidden = true;
  if (button) button.disabled = true;
  try { await action(); }
  catch (error) {
    if (error.name !== 'AbortError') { $('message').textContent = error.message || 'The request failed.'; $('message').hidden = false; }
  } finally { if (button) button.disabled = (button.id === 'generate-report' && button.dataset.queued === 'true')
    || (button.id === 'action-submit' && $('action-resource').value === 'accounts' && !suspensionAccount); }
}
function form(id, action) {
  $(id).addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, key === 'password' ? value : value.trim()]));
    run(event.submitter, () => action(values));
  });
}
function click(id, action) { $(id).addEventListener('click', event => run(event.currentTarget, action)); }

function closeDashboard() {
  embedVersion++;
  embedded?.unmount();
  embedded = null;
  $('dashboard-mount').replaceChildren();
  $('dashboard-status').textContent = 'Choose a dashboard to load its published data.';
}
function showPanel(name) {
  if (name !== 'reports' && (portalRole !== 'ADMIN' || !api.claims()?.roles.includes('ADMIN'))) return;
  activePanel = name;
  scheduleOrderPoll();
  if (name !== 'reports') closeDashboard();
  document.querySelectorAll('.panel').forEach(panel => { panel.hidden = panel.id !== `${name}-panel`; });
  document.querySelectorAll('[data-panel]').forEach(button => {
    if (button.dataset.panel === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}
window.addEventListener('staff-session-ended', () => {
  epoch++;
  clearTimeout(orderPoll); activePanel = null;
  clientNameVersion++; clearTimeout(clientNameTimer);
  $('client-name-query').value = '';
  $('admin-client-name-query').value = '';
  $('admin-client-name-results').replaceChildren();
  $('client-name-results').replaceChildren();
  $('client-name-activity').replaceChildren();
  clearTimeout(reportPoll);
  scheduleDirty = false;
  closeDashboard();
  selectedOrder = null;
  $('workspace').hidden = true; $('session').hidden = true; $('login-panel').hidden = false;
  $('identity').textContent = '';
  ['order-detail', 'account-detail'].forEach(id => { $(id).hidden = true; });
  ['orders-results', 'clients-results', 'audit-results', 'timeline', 'pricing', 'order-json', 'order-summary',
    'account-summary', 'positions', 'cash', 'action-result'].forEach(id => $(id).replaceChildren());
  document.querySelectorAll('form').forEach(element => element.reset());
  resetSuspensionPicker();
  for (const [name, state] of Object.entries(searches)) {
    state.params = {}; state.page = 0; state.version++; state.pending = false; state.signature = null;
    $(`${name}-prev`).disabled = true; $(`${name}-next`).disabled = true; $(`${name}-page`).textContent = '';
  }
});

function showSchedule(schedule) {
  const current = schedule?.currentLocalTime || '19:00';
  $('cutoff-time').textContent = `${current} · New York`;
  $('cutoff-coverage').textContent = `Same day, midnight inclusive through ${current} exclusive. Later trades remain in audit.`;
  if (!scheduleDirty) $('report-time').value = schedule?.nextLocalTime || current;
  $('report-schedule-status').textContent = schedule?.effectiveFrom
    ? `Today: ${current}. From ${schedule.effectiveFrom}: ${schedule.nextLocalTime} America/New_York. Applies to all staff; existing reports are preserved.`
    : 'Changes take effect tomorrow; published reports keep their original cutoff.';
}
$('report-time').addEventListener('input', () => { scheduleDirty = true; });
form('report-schedule-form', async values => {
  const version = epoch;
  const saved = await api.request('analytics/report-schedule', { method: 'PUT', body: { localTime: values.localTime } });
  check(version);
  scheduleDirty = false;
  showSchedule(saved);
});

click('generate-report', async () => {
  const version = epoch;
  await api.request('analytics/report-requests', { method: 'POST', body: {} });
  check(version);
  await refreshStatus();
});

async function refreshStatus() {
  const version = epoch;
  const status = await api.request('analytics/status');
  check(version);
  $('sync-summary').textContent = status.pipeline?.sourceHeartbeatAt
    ? `Source heartbeat: ${time(status.pipeline.sourceHeartbeatAt)} · Approximate lag: ${Math.max(0, Math.round(status.pipeline.lagSeconds || 0))}s`
    : 'Waiting for the first source heartbeat. Audit data may not be loaded yet.';
  $('published-date').textContent = status.latestPublishedBatch?.reportDate || 'Not published yet';
  if (!$('pdf-report-date').value && status.latestPublishedBatch?.reportDate) $('pdf-report-date').value = status.latestPublishedBatch.reportDate;
  $('published-status').textContent = status.latestPublishedBatch ? `Published ${time(status.latestPublishedBatch.completedAt)}` : 'The first report is available after a successful daily batch.';
  const request = status.latestReportRequest;
  $('manual-report-status').textContent = request
    ? request.status === 'published'
      ? `Report ready through ${time(request.cutoffAt)}. Download today's PDF or reopen a dashboard; chart caches may take 30 seconds to refresh.`
      : request.status === 'failed' ? request.error || 'Report generation failed. Try again.'
        : `Queued through ${time(request.cutoffAt)}. Waiting for synchronization and the reporting worker.`
    : 'No manual report requested.';
  $('generate-report').dataset.queued = String(request?.status === 'queued');
  $('generate-report').disabled = request?.status === 'queued';
  clearTimeout(reportPoll);
  if (request?.status === 'queued') reportPoll = setTimeout(() => run(null, refreshStatus), 3000);
  $('batch-status').textContent = status.latestBatch?.status || 'No attempts yet';
  showSchedule(status.reportSchedule);
  $('batch-date').textContent = status.latestBatch ? `Report ${status.latestBatch.reportDate} · Started ${time(status.latestBatch.startedAt)}` : `Scheduled daily at ${status.cutoffLocalTime || '19:00'} America/New_York.`;
}
async function dashboards() {
  const version = epoch;
  const entries = await api.request('analytics/dashboards');
  check(version);
  $('dashboard-key').replaceChildren();
  if (!entries.length) $('dashboard-key').append(new Option('No dashboards configured yet', ''));
  entries.forEach(entry => $('dashboard-key').append(new Option(entry.title, entry.dashboardKey)));
}
async function connect() {
  if (!api.claims()?.roles.includes(portalRole)) {
    await api.logout().catch(() => {});
    throw new Error(`This page requires ${portalRole} access. Use the correct role-specific login page.`);
  }
  // Verify access with a real API call before displaying any staff workspace.
  try { await refreshStatus(); }
  catch (error) { await api.logout().catch(() => {}); throw error; }
  const user = api.claims();
  const admin = portalRole === 'ADMIN';
  $('identity').textContent = `${user.name || user.email || user.sub} · ${user.roles.join(', ')}`;
  document.querySelectorAll('[data-admin]').forEach(element => { element.hidden = !admin; });
  $('login-panel').hidden = true; $('workspace').hidden = false; $('session').hidden = false;
  $('login-form').reset(); $('token-form').reset();
  showPanel(admin ? 'orders' : 'reports');
  await Promise.all([dashboards(), ...(admin ? [search('orders', 0)] : [])]);
}
// MFA challenges are held only in memory and grant no staff API access.
let mfaChallenge = null;
let mfaPurpose = 'login';
const mfaPanel = document.createElement('section');
mfaPanel.hidden = true;
mfaPanel.innerHTML = `<h2 id="mfa-title">Verify your identity</h2><p id="mfa-instructions"></p>
  <img id="mfa-qr" width="220" height="220" alt="Authenticator enrollment QR code" hidden>
  <p id="mfa-secret"></p><form id="mfa-form" class="stack">
  <label>Authenticator or recovery code<input name="code" autocomplete="one-time-code" maxlength="16" required></label>
  <button type="submit">Verify</button><button type="button" id="mfa-cancel" class="secondary">Start over</button></form>`;
$('login-panel').append(mfaPanel);
const mfaControls = document.createElement('details');
mfaControls.innerHTML = `<summary>Authenticator security</summary><p>Enter your email and password above first.</p>
  <button type="button" id="mfa-replace">Replace authenticator</button>`;
$('login-form').after(mfaControls);
const mfaStatus = document.createElement('p');
mfaStatus.setAttribute('role', 'status');
mfaControls.after(mfaStatus);
const recoveryPanel = document.createElement('section');
recoveryPanel.hidden = true;
recoveryPanel.innerHTML = '<h2>Save these recovery codes</h2><p>Each works once. Store them privately. They are only displayed now.</p><pre id="mfa-recovery"></pre><button type="button" id="mfa-saved">I saved my codes</button>';
$('login-panel').append(recoveryPanel);
function showMfa(challenge, purpose) {
  forgotButton.hidden=true;
  mfaStatus.textContent = '';
  mfaChallenge = challenge; mfaPurpose = purpose;
  $('login-form').hidden = true; mfaControls.hidden = true;
  $('token-form').closest('details').hidden = true;
  mfaPanel.hidden = false;
  $('mfa-title').textContent = challenge.enrollmentRequired ? 'Set up your authenticator' : 'Verify your identity';
  $('mfa-instructions').textContent = challenge.enrollmentRequired ? 'Download Google Authenticator, Microsoft Authenticator, or another compatible authenticator app. Scan this QR code and enter the six-digit code to finish signing in. Setup is required.' : 'Enter an authenticator code or an unused recovery code.';
  $('mfa-qr').hidden = !challenge.qrDataUrl;
  if (challenge.qrDataUrl) $('mfa-qr').src = challenge.qrDataUrl;
  $('mfa-secret').textContent = challenge.secret ? `Manual setup key: ${challenge.secret}` : '';
  $('mfa-form').elements.code.focus();
}
function resetMfa() {
  forgotButton.hidden=false;
  mfaChallenge = null; mfaPanel.hidden = true; $('mfa-qr').removeAttribute('src'); $('mfa-secret').textContent = '';
  $('mfa-form').reset(); $('login-form').hidden = false; mfaControls.hidden = false;
  $('token-form').closest('details').hidden = false;
}
form('login-form', async values => {
  try { const challenge = await api.login(values.email, values.password);
    if (challenge?.mfaRequired) showMfa(challenge, challenge.purpose || 'login'); else await connect();
  } finally { $('login-form').elements.password.value = ''; }
});
for (const [id, purpose] of [['mfa-replace', 'replace']]) {
  click(id, async () => {
    const fields = $('login-form').elements;
    try { showMfa(await api.startMfa(fields.email.value.trim(), fields.password.value, purpose), purpose); }
    finally { fields.password.value = ''; }
  });
}
form('mfa-form', async values => {
  if (!mfaChallenge) throw new Error('Start sign-in again.');
  const result = await api.completeMfa(mfaChallenge.challengeToken, values.code, mfaPurpose);
  if (result.mfaRequired) { showMfa(result, result.purpose); return; }
  resetMfa();
  if (result.recoveryCodes?.length) {
    $('login-form').hidden = true; mfaControls.hidden = true; forgotButton.hidden = true;
    $('token-form').closest('details').hidden = true;
    mfaStatus.textContent = 'Save your recovery codes to finish signing in.';
    $('mfa-recovery').textContent = result.recoveryCodes.join('\n'); recoveryPanel.hidden = false;
  } else await connect();
});
click('mfa-cancel', resetMfa);
click('mfa-saved', async () => { $('mfa-recovery').textContent = ''; recoveryPanel.hidden = true; resetMfa(); await connect(); });
// Reset UI exists independently on both staff login documents. No email code
// ever grants access: a successful password reset returns to the MFA login flow.
const resetPanel=document.createElement('section');resetPanel.hidden=true;
resetPanel.className='reset-recovery';
resetPanel.innerHTML=`<h2>Reset your password</h2><p class="muted">Your authenticator or a recovery code is still required after resetting your password.</p>
  <form id="reset-request-form" class="stack"><label>Email address<input name="email" type="email" autocomplete="email" required></label><button>Send reset code</button></form>
  <p id="reset-notice" role="status"></p>
  <form id="reset-code-form" class="stack" hidden><label>Email reset code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
    <button>Verify email code</button><button type="button" id="reset-resend" class="secondary">Resend code</button></form>
  <form id="reset-password-form" class="stack" hidden>
    <label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="72" required></label>
    <label>Confirm new password<input name="confirmation" type="password" autocomplete="new-password" required></label>
    <ul class="reset-rules"><li id="reset-length">○ 12 to 72 characters</li><li id="reset-match">○ Passwords match</li><li id="reset-different">○ Must differ from your current password (checked securely when you submit).</li></ul>
    <button>Update password</button></form><button type="button" id="reset-back" class="secondary">Back to sign in</button>`;
$('login-panel').append(resetPanel);
const forgotButton=document.createElement('button');forgotButton.type='button';forgotButton.id='forgot-password';forgotButton.textContent='Forgot password?';forgotButton.className='secondary';mfaControls.after(forgotButton);
let resetToken='';let verifiedResetToken='';let resetRequestedAt=0;
click('forgot-password',()=>{resetPanel.hidden=false;$('login-form').hidden=true;mfaControls.hidden=true;forgotButton.hidden=true;$('token-form').closest('details').hidden=true;});
click('reset-back',()=>{resetToken='';verifiedResetToken='';resetPanel.hidden=true;$('reset-request-form').reset();$('reset-code-form').reset();$('reset-code-form').hidden=true;$('reset-password-form').reset();$('reset-password-form').hidden=true;$('reset-request-form').hidden=false;$('reset-notice').textContent='';resetMfa();forgotButton.hidden=false;});
async function requestResetCode(email) {
  if(Date.now()-resetRequestedAt<60000) throw new Error('Wait one minute before requesting another code.');
  const result=await api.forgotPassword(email);resetToken=result.requestToken;verifiedResetToken='';resetRequestedAt=Date.now();
  $('reset-notice').textContent='If an account matches that address, a code will arrive shortly. Check your inbox and spam folder. Codes expire after 10 minutes.';
  $('reset-request-form').hidden=true;$('reset-code-form').hidden=false;$('reset-code-form').reset();$('reset-password-form').hidden=true;
}
form('reset-request-form',values=>requestResetCode(values.email));
click('reset-resend',()=>requestResetCode($('reset-request-form').elements.email.value.trim()));
form('reset-code-form',async values=>{
  const result=await api.verifyResetCode(resetToken,values.code);verifiedResetToken=result.resetToken;resetToken='';
  $('reset-code-form').reset();$('reset-code-form').hidden=true;$('reset-password-form').hidden=false;$('reset-notice').textContent='Email code verified. Choose a new password.';
});
$('reset-password-form').addEventListener('input',()=>{
  const fields=$('reset-password-form').elements;const password=fields.newPassword.value;
  $('reset-length').textContent=`${password.length>=12 && password.length<=72?'✓':'○'} 12 to 72 characters`;
  $('reset-match').textContent=`${password && password===fields.confirmation.value?'✓':'○'} Passwords match`;
  $('reset-different').textContent='○ Must differ from your current password (checked securely when you submit).';
});
form('reset-password-form',async values=>{
  if(values.newPassword!==values.confirmation) throw new Error('Passwords must match.');
  try {
    const result=await api.resetPassword(verifiedResetToken,values.newPassword);
    verifiedResetToken='';$('reset-password-form').reset();$('reset-password-form').hidden=true;$('reset-notice').textContent=result.message;
  } catch(error) {
    if(error.message.includes('different from your current password')) $('reset-different').textContent='✕ Choose a password different from your current password.';
    throw error;
  }
});
form('token-form', async values => { api.useToken(values.token); await connect(); });
click('logout', () => api.logout());
click('refresh-status', refreshStatus);
document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.panel)));

async function search(name, page, background = false) {
  const version = epoch;
  const state = searches[name];
  if (background && state.pending) return;
  const queryVersion = ++state.version;
  state.pending = true;
  const params = new URLSearchParams({ ...state.params, page, size: 20 });
  if (!background) $(`${name}-results`).replaceChildren(node('p', `Loading ${name}…`, 'empty'));
  if (!background) {
    $(`${name}-prev`).disabled = true; $(`${name}-next`).disabled = true;
    $(`${name}-page`).textContent = '';
  }
  let result;
  try { result = await api.request(`admin/${name === 'orders' ? 'trades' : 'clients'}?${params}`); }
  catch (error) {
    if (queryVersion === state.version) state.pending = false;
    if (!background && version === epoch && queryVersion === state.version) {
      state.signature = null;
      $(`${name}-results`).replaceChildren(node('p', 'Could not load results. Try the search again.', 'empty'));
    }
    throw error;
  }
  if (queryVersion === state.version) state.pending = false;
  check(version);
  if (queryVersion !== state.version) return;
  const signature = JSON.stringify(result);
  if (background && signature === state.signature) return;
  state.signature = signature;
  state.page = page;
  if (name === 'orders') {
    table('orders-results', [['Client', row => row.clientName || 'Unknown client'], ['Order', row => link(row.orderId, () => openOrder(row.orderId))], ['Symbol', row => row.symbol],
      ['Side', row => row.orderSide], ['Quantity', row => amount(row.quantity)], ['Status', row => row.status], ['Placed', row => time(row.placedAt)]], result.items);
  } else {
    table('clients-results', [['Client', row => link(row.email || row.clientId, () => openAccount(row.accountId))],
      ['Account ID', row => row.accountId], ['Cash', row => money(row.cashBalance)], ['Suspended', row => row.suspended ? 'Yes' : 'No'],
      ['Positions', row => row.openPositions]], result.items);
  }
  $(`${name}-prev`).disabled = page === 0;
  $(`${name}-next`).disabled = page + 1 >= result.page.totalPages;
  $(`${name}-page`).textContent = result.page.totalElements ? `Page ${page + 1} of ${result.page.totalPages} · ${result.page.totalElements} results` : '0 results';
}
form('orders-form', async values => {
  const filters = Object.fromEntries(Object.entries(values).filter(([, value]) => value));
  for (const field of ['orderId', 'clientId', 'fillId', 'instrumentId']) {
    if (filters[field] && !uuid.test(filters[field])) throw new Error(`${field} must be a UUID.`);
  }
  for (const field of ['from', 'to']) if (filters[field]) filters[field] = new Date(filters[field]).toISOString();
  searches.orders.params = filters;
  await search('orders', 0);
});
click('reset-orders', async () => { $('orders-form').reset(); searches.orders.params = {}; await search('orders', 0); });
form('clients-form', async values => { searches.clients.params = { q: values.q }; await search('clients', 0); });
for (const name of ['orders', 'clients']) {
  // Pager controls retain their computed disabled state after a completed request.
  for (const [direction, delta] of [['prev', -1], ['next', 1]]) {
    $(`${name}-${direction}`).addEventListener('click', () => run(null, () => search(name, searches[name].page + delta)));
  }
}

async function openOrder(id) {
  const version = epoch; const detailVersion = ++orderVersion;
  $('order-detail').hidden = true;
  const [timeline, pricing] = await Promise.all([api.request(`admin/orders/${id}/timeline`), api.request(`admin/orders/${id}/pricing`)]);
  check(version); if (detailVersion !== orderVersion) return;
  selectedOrder = id;
  const order = timeline.order;
  facts('order-summary', [['Client', order.clientName || 'Unknown client'], ['Client ID', order.clientId], ['Order ID', id], ['Instrument', order.symbol], ['Status', order.status],
    ['Side / quantity', `${order.orderSide} / ${amount(order.quantity)}`], ['Cash movement', money(order.cashChange)], ['Account ID', order.accountId]]);
  $('timeline').replaceChildren();
  if (!timeline.events.length) $('timeline').append(node('li', 'No lifecycle evidence recorded.'));
  timeline.events.forEach(event => {
    const title = event.eventType === 'rejected' && event.terminal === false ? 'Execution attempt rejected · may retry' : event.eventType;
    const item = node('li');
    item.append(node('strong', title), node('p', `${time(event.eventAt)}${event.provenance === 'snapshot' ? ' · Imported snapshot; history may be incomplete' : ''}`));
    if (event.rejectionReason) item.append(node('p', event.rejectionReason));
    $('timeline').append(item);
  });
  table('pricing', [['Phase', row => row.phase], ['Decision', row => row.decision], ['Bid', row => amount(row.quote?.bid)],
    ['Ask', row => amount(row.quote?.ask)], ['Provider time', row => time(row.quote?.asOf)], ['Observed', row => time(row.observedAt)],
    ['Stale', row => row.quote?.stale == null ? 'Unknown' : row.quote.stale ? 'Yes' : 'No'], ['Reason', row => row.reason]], pricing, 'No pricing evidence was recorded for this order.');
  $('order-json').textContent = JSON.stringify({ ...timeline, pricing }, null, 2);
  $('order-detail').hidden = false;
  $('order-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
click('export-order', async () => {
  const version = epoch; const id = selectedOrder;
  if (!id) return;
  const blob = await api.request(`admin/orders/${id}/export`, { download: true });
  check(version);
  const url = URL.createObjectURL(blob); const anchor = node('a');
  anchor.href = url; anchor.download = `order-${id}-audit.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function openAccount(id) {
  const version = epoch; const detailVersion = ++accountVersion;
  $('account-detail').hidden = true;
  const detail = await api.request(`admin/accounts/${id}`);
  check(version); if (detailVersion !== accountVersion) return;
  const account = detail.account;
  facts('account-summary', [['Email', account.email], ['Account ID', account.accountId], ['Client ID', account.clientId],
    ['Cash', money(account.cashBalance)], ['Suspended', account.suspended ? 'Yes' : 'No'], ['As of', time(account.asOf)]]);
  table('positions', [['Symbol', row => row.symbol], ['Name', row => row.instrumentName], ['Quantity', row => amount(row.quantity)]], detail.positions, 'No open positions.');
  table('cash', [['Occurred', row => time(row.occurredAt)], ['Type', row => row.changeType], ['Symbol', row => row.symbol],
    ['Cash change', row => money(row.cashDelta)], ['Holding change', row => amount(row.holdingDelta)]], detail.recentActivity, 'No recorded cash movements.');
  $('account-detail').hidden = false;
  $('account-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
form('action-form', async values => {
  if (values.resource === 'accounts' && (!suspensionAccount || suspensionAccount.accountId !== values.id))
    throw new Error('Choose a person from the account suggestions first.');
  if (!uuid.test(values.id)) throw new Error('Resource ID must be a UUID.');
  if (!values.reason) throw new Error('A reason is required.');
  const version = epoch;
  const target = values.resource === 'accounts' ? { ...suspensionAccount } : null;
  $('action-result').textContent = '';
  await api.request(`admin/${values.resource}/${values.id}/${values.action}`, { method: 'POST', body: { reason: values.reason } });
  check(version);
  $('action-result').textContent = `${values.action === 'suspend' ? 'Suspension applied' : 'Suspension removed'} for ${target?.fullName || target?.email || values.id}. Copied account details update after synchronization.`;
  if (target && suspensionAccount?.accountId === target.accountId) {
    suspensionAccount.suspended = values.action === 'suspend';
    showSuspensionSelection();
  }
});
click('load-audit', async () => {
  const version = epoch;
  const result = await api.request('admin/audit-log?page=0&size=20');
  check(version);
  table('audit-results', [['When', row => time(row.occurredAt)], ['Actor', row => row.actorEmail || row.actorId],
    ['Action', row => row.action], ['Account', row => row.targetAccountId], ['Reason', row => row.reason]], result.items);
});

form('dashboard-form', async () => {
  const key = $('dashboard-key').value;
  if (!key) throw new Error('No dashboards are configured yet.');
  closeDashboard();
  const version = epoch; const embedding = embedVersion;
  $('dashboard-status').textContent = 'Loading dashboard…';
  try {
    const initial = await api.request(`analytics/dashboards/${encodeURIComponent(key)}/guest-token`, { method: 'POST', body: {} });
    check(version); if (embedding !== embedVersion) return;
    const mount = node('div'); $('dashboard-mount').append(mount);
    let first = true;
    const dashboard = await embedDashboard({
      id: initial.dashboardId, supersetDomain: initial.supersetUrl, mountPoint: mount,
      // The SDK renews this short-lived token; credentials stay in the backend.
      fetchGuestToken: async () => {
        check(version);
        if (first) { first = false; return initial.guestToken; }
        try { return (await api.request(`analytics/dashboards/${encodeURIComponent(key)}/guest-token`, { method: 'POST', body: {} })).guestToken; }
        catch (error) { $('dashboard-status').textContent = 'Dashboard access expired. Sign in or open the dashboard again.'; throw error; }
      },
      dashboardUiConfig: { hideTitle: true, filters: { expanded: true } },
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
    if (embedding !== embedVersion || version !== epoch) { dashboard.unmount(); return; }
    embedded = dashboard;
    $('dashboard-status').textContent = 'Showing published report data. Use the dashboard filters to explore it.';
  } catch (error) {
    if (embedding === embedVersion) $('dashboard-status').textContent = 'Dashboard could not load. Check report availability and try again.';
    throw error;
  }
});

// Downloads use authenticated API requests; the browser never receives DB credentials.
async function downloadPdf(path, filename) {
  const version = epoch;
  const blob = await api.request(path, { download: true });
  check(version);
  const url = URL.createObjectURL(blob);
  const anchor = node('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
form('report-pdf-form', values => downloadPdf(`analytics/reports/${encodeURIComponent(values.day)}/pdf`, `report-${values.day}.pdf`));
form('audit-pdf-form', values => downloadPdf(`admin/audit-log/pdf?${new URLSearchParams(values)}`, `audit-log-${values.from}-${values.to}.pdf`));
click('export-order-pdf', () => {
  if (!selectedOrder) throw new Error('Open an order first.');
  return downloadPdf(`admin/orders/${selectedOrder}/pdf`, `order-${selectedOrder}-audit.pdf`);
});

// Debounce typed prefixes and reject stale responses so slower searches cannot
// replace suggestions for a newer query. Names render as text, never HTML.
function nameSuggestions(inputId, resultsId, adminLookup = false) {
$(inputId).addEventListener('input', () => {
  clearTimeout(clientNameTimer);
  const searchVersion = ++clientNameVersion;
  const version = epoch;
  const query = $(inputId).value.trim();
  $('client-name-activity').replaceChildren();
  $(resultsId).replaceChildren(node('p', query ? 'Searching…' : 'Type a name to see suggestions.'));
  if (!query) return;
  clientNameTimer = setTimeout(() => run(null, async () => {
    const rows = await api.request(`analytics/clients/suggestions?q=${encodeURIComponent(query)}`);
    check(version); if (searchVersion !== clientNameVersion) return;
    table(resultsId, [['Name', row => link(row.fullName || [row.firstName,row.lastName].filter(Boolean).join(' '), async () => {
      const selectedVersion = ++clientNameVersion;
      $(inputId).value = row.fullName || query;
      if (adminLookup) { searches.clients.params = { q: row.fullName || query }; await search('clients', 0); return; }
      const activity = await api.request(`analytics/clients/${row.clientId}/activity`);
      check(version); if (selectedVersion !== clientNameVersion) return;
      table('client-name-activity', [['Report date', item => item.reportDate], ['Trades', item => item.tradeCount],
        ['Traded amount', item => money(item.tradedNotional)]], activity, 'No published trades for this client yet.');
    })], ['Client ID', row => row.clientId]], rows, 'No matching names found.');
  }), 250);
});

}
nameSuggestions('client-name-query', 'client-name-results');
nameSuggestions('admin-client-name-query', 'admin-client-name-results', true);

function scheduleOrderPoll() {
  clearTimeout(orderPoll);
  if (portalRole !== 'ADMIN' || !api.claims() || activePanel !== 'orders') return;
  const version = epoch;
  orderPoll = setTimeout(async () => {
    if (version !== epoch || activePanel !== 'orders') return;
    if (!document.hidden && !orderPollBusy) {
      orderPollBusy = true;
      try {
        await search('orders', searches.orders.page, true);
        if (version === epoch) $('orders-live-status').textContent = 'Updates automatically every 3 seconds while visible. Copied trades can have a short synchronization delay.';
      } catch (error) {
        if (version === epoch && api.claims()) $('orders-live-status').textContent = 'Updates delayed. Retrying automatically…';
      } finally { orderPollBusy = false; }
    }
    if (version === epoch) scheduleOrderPoll();
  }, 3000);
}

function showSuspensionSelection() {
  if (!suspensionAccount) return;
  const account = suspensionAccount;
  $('action-client-selected').textContent = `${account.fullName || account.email} · ${account.email || 'Email not recorded'} · Account ${account.accountId} · ${account.suspended ? 'Suspended' : 'Active'}`;
}
function resetSuspensionPicker() {
  clearTimeout(suspensionSearchTimer);
  suspensionSearchVersion++;
  suspensionAccount = null;
  $('action-form').elements.id.value = '';
  $('action-client-query').value = '';
  $('action-client-results').replaceChildren();
  $('action-client-selected').textContent = 'Choose a person before applying an account action.';
  const accounts = $('action-resource').value === 'accounts';
  $('action-client-picker').hidden = !accounts;
  $('action-id-field').hidden = accounts;
  $('action-form').elements.id.readOnly = accounts;
  $('action-submit').disabled = accounts;
}
$('action-resource').addEventListener('change', resetSuspensionPicker);
$('action-client-query').addEventListener('input', () => {
  clearTimeout(suspensionSearchTimer);
  const queryVersion = ++suspensionSearchVersion;
  const version = epoch;
  suspensionAccount = null;
  $('action-form').elements.id.value = '';
  $('action-submit').disabled = true;
  $('action-result').textContent = '';
  $('action-client-selected').textContent = 'Choose a person before applying an account action.';
  const query = $('action-client-query').value.trim();
  $('action-client-results').replaceChildren(node('p', query ? 'Searching…' : 'Type a name to see account suggestions.'));
  if (!query || portalRole !== 'ADMIN' || $('action-resource').value !== 'accounts') return;
  suspensionSearchTimer = setTimeout(() => run(null, async () => {
    const accounts = await api.request(`admin/clients/suggestions?q=${encodeURIComponent(query)}`);
    check(version); if (queryVersion !== suspensionSearchVersion) return;
    table('action-client-results', [['Person', account => link(account.fullName || account.email || account.clientId, async () => {
      // Selection requires an account UUID returned by the admin-only lookup.
      if (!uuid.test(account.accountId)) throw new Error('This account cannot be selected.');
      suspensionSearchVersion++;
      suspensionAccount = account;
      $('action-form').elements.id.value = account.accountId;
      $('action-client-query').value = account.fullName || account.email || '';
      $('action-client-results').replaceChildren();
      showSuspensionSelection();
      $('action-submit').disabled = false;
      $('action-form').elements.action.focus();
    })], ['Email', account => account.email], ['Account', account => account.accountId],
      ['Status', account => account.suspended ? 'Suspended' : 'Active']], accounts, 'No matching accounts found.');
  }), 250);
});
resetSuspensionPicker();
