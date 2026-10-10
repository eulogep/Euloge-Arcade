import {ADMIN, PLAYER, SERVICE_ROLE_KEY, SUPABASE_URL} from './helpers';

const headers = {apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json'};

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {...init, headers: {...headers, ...(init.headers ?? {})}});
  if (!res.ok && res.status !== 422) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res;
}

/** Resets e2e accounts and test data on the LOCAL stack only. */
export default async function globalSetup() {
  // Public, backend-free journeys can opt out without weakening the default full-stack suite.
  if (process.env.E2E_SKIP_GLOBAL_SETUP === '1') return;

  if (!SUPABASE_URL.includes('127.0.0.1')) throw new Error('E2E setup must only run against the local stack');
  const list = (await (await rest('/auth/v1/admin/users?per_page=200')).json()) as {users: Array<{id: string; email: string}>};
  for (const u of list.users) {
    if (u.email.endsWith('@euloge.test') && u.email.startsWith('e2e-')) {
      await rest(`/auth/v1/admin/users/${u.id}`, {method: 'DELETE'});
    }
  }
  await rest('/rest/v1/games?slug=like.e2e-*', {method: 'DELETE'});
  await rest('/rest/v1/games?slug=in.(system-breach,lichess-daily-puzzle,krunker,2048,lichess)', {
    method: 'PATCH',
    body: JSON.stringify({link_status: 'unchecked', status: 'published'}),
  });

  for (const u of [ADMIN, PLAYER]) {
    await rest('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({email: u.email, password: u.password, email_confirm: true, user_metadata: {display_name: u.email.split('@')[0]}}),
    });
  }
  const users = (await (await rest('/auth/v1/admin/users?per_page=200')).json()) as {users: Array<{id: string; email: string}>};
  const admin = users.users.find((u) => u.email === ADMIN.email)!;
  await rest(`/rest/v1/profiles?id=eq.${admin.id}`, {method: 'PATCH', body: JSON.stringify({role: 'admin'})});
}
