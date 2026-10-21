// Tokens live in memory for this small test console. Reloading requires sign-in.
// The decoded claims choose navigation only; the backend verifies every request.
let session = null;
let generation = 0;
let pendingRefresh = null;

export function claims() { return session?.claims; }

function decode(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), c => c.charCodeAt(0))));
  } catch { throw new Error('The access token is not valid.'); }
}

function save(pair) {
  const user = decode(pair.accessToken);
  // SUPER_ADMIN is an admin with extra auth-server rights (staff security).
  if (!Array.isArray(user.roles) || !user.roles.some(role => ['ADMIN', 'ANALYST', 'SUPER_ADMIN'].includes(role))) {
    throw new Error('This console requires an ADMIN or ANALYST account.');
  }
  session = { ...pair, claims: user };
}

async function unpack(response, download = false) {
  if (response.ok && download) return response.blob();
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback = { 401: 'Please sign in again.', 403: 'Your account does not have permission.',
      404: 'The requested record was not found.', 502: 'A service is unavailable. Check that the stacks are running.',
      503: 'Reporting data is temporarily unavailable.' };
    const detail = data?.detail || data?.message || fallback[response.status] || `Request failed (${response.status}).`;
    throw new Error(Array.isArray(detail) ? detail.join(' ') : detail);
  }
  return data;
}

function auth(path, body) {
  return fetch(`/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), credentials: 'omit', signal: AbortSignal.timeout(20000) }).then(response => unpack(response));
}

export async function login(email, password) {
  const pair = await auth('login', { email, password });
  // Neither answer has tokens: an MFA challenge, or a new account's required password change (D3).
  if (pair.mfaRequired || pair.passwordChangeRequired) return pair;
  try { save(pair); generation++; }
  catch (error) {
    // A client account can authenticate, but it cannot start a staff session.
    await auth('logout', { refreshToken: pair.refreshToken }).catch(() => {});
    throw error;
  }
}

export function startMfa(email, password, purpose) {
  return auth(purpose === 'enroll' ? 'mfa/setup' : 'mfa/replace/start', { email, password });
}
export async function completeMfa(challengeToken, code, purpose) {
  const result = await auth(`mfa/${purpose === 'login' ? 'verify' : purpose === 'enroll' ? 'enable' : purpose === 'replace' ? 'replace/verify' : 'replace/enable'}`, { challengeToken, code });
  if (result.accessToken) { save(result); generation++; }
  return result;
}

export function forgotPassword(email) { return auth('forgot-password',{email}); }
export function verifyResetCode(requestToken,code) { return auth('verify-reset-code',{requestToken,code}); }
export function resetPassword(resetToken,newPassword) { return auth('reset-password',{resetToken,newPassword}); }
// Staff security D3: replace the temporary password; the answer is the authenticator setup challenge.
export async function changeTemporaryPassword(email, password, newPassword) {
  const result = await auth('change-temporary-password', { email, password, newPassword });
  if (result.accessToken) { save(result); generation++; }
  return result;
}

export function useToken(accessToken) { save({ accessToken }); generation++; }

export function clearSession() {
  session = null;
  generation++;
  window.dispatchEvent(new Event('staff-session-ended'));
}

export async function logout() {
  // Finish any rotation first so logout revokes the current refresh token.
  await pendingRefresh?.catch(() => {});
  const refreshToken = session?.refreshToken;
  clearSession();
  if (refreshToken) await auth('logout', { refreshToken });
}

async function refresh() {
  if (!session?.refreshToken) { clearSession(); throw new Error('Session expired. Please sign in again.'); }
  // One rotating refresh token must never be sent in concurrent refresh requests.
  if (!pendingRefresh) {
    const version = generation;
    const token = session.refreshToken;
    const task = auth('refresh', { refreshToken: token }).then(pair => {
      if (version !== generation) throw new DOMException('Session changed', 'AbortError');
      save(pair);
    }).catch(error => {
      if (version === generation) clearSession();
      throw error;
    }).finally(() => { if (pendingRefresh === task) pendingRefresh = null; });
    pendingRefresh = task;
  }
  await pendingRefresh;
}

export async function request(path, { method = 'GET', body, download = false } = {}) {
  if (!session) throw new Error('Please sign in first.');
  const version = generation;
  const usedToken = session.accessToken;
  const send = () => fetch(`/api/v1/${path}`, {
    method, credentials: 'omit', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${session.accessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let response = await send();
  if (version !== generation) throw new DOMException('Session changed', 'AbortError');
  if (response.status === 401) {
    if (session.accessToken === usedToken) await refresh();
    if (version !== generation) throw new DOMException('Session changed', 'AbortError');
    response = await send();
    if (response.status === 401) clearSession();
  }
  return unpack(response, download);
}
