import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const userA = '30000000-0000-4000-8000-000000000001';
const userB = '30000000-0000-4000-8000-000000000002';
const officeA = '20000000-0000-4000-8000-000000000001';
const officeB = '20000000-0000-4000-8000-000000000002';
const tokenA = 'FICTITIOUS_VERIFIED_REQUEST_TOKEN_A';
const tokenB = 'FICTITIOUS_VERIFIED_REQUEST_TOKEN_B';

const bundled = await build({
  stdin: { contents: "export { getDocumentOfficeContext, loadDocumentClients } from './src/lib/documentScopedAccess';", resolveDir: project, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  plugins: [{ name: 'synthetic-auth-provider-only', setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabaseDb$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents:
      'export function requireSupabase(){return globalThis.documentAccessFixture.client;}\n' +
      'export async function getAuthedUser(){return {id:globalThis.documentAccessFixture.currentUserId};}' }));
    b.onResolve({ filter: /^@\// }, args => {
      const path = resolve(project, 'src', args.path.slice(2) + '.ts');
      if (!existsSync(path)) throw new Error('Unexpected dependency in document-only access helper.');
      return { path };
    });
  } }],
});
const access = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));

function fixture(overrides = {}) {
  const state = { currentUserId: userA, sessionUserId: userA, token: tokenA, role: 'user', officeId: officeA,
    requests: [], verifications: [], sessionMissing: false, tokenOwnerMismatch: false, membershipMissing: false,
    membershipError: false, switchAfterMembership: false, changeOfficeAfterClients: false,
    revokeAfterClients: false, injectForeignClient: false, ...overrides };
  const client = createClient('https://synthetic-documents.invalid', 'FICTITIOUS_PUBLIC_KEY_NOT_A_REAL_CREDENTIAL', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      const headers = new Headers(options.headers);
      assert.equal(options.method || 'GET', 'GET', 'Document helper must never mutate data');
      const table = url.pathname.split('/').at(-1);
      const authorization = headers.get('authorization');
      assert.equal(authorization, 'Bearer ' + tokenA, 'Every Data API request must retain the captured verified actor');
      state.requests.push({ table, userFilter: url.searchParams.get('user_id'), officeFilter: url.searchParams.get('office_id'), authorization });
      let rows;
      if (table === 'office_members') {
        assert.equal(url.searchParams.get('user_id'), 'eq.' + userA);
        assert.equal(url.searchParams.get('limit'), '1');
        assert.equal(url.searchParams.get('order'), 'created_at.desc');
        if (state.membershipError) return new Response(JSON.stringify({ code:'SYNTHETIC_ERROR', message:'Synthetic membership failure' }), { status:500, headers:{'content-type':'application/json'} });
        rows = state.membershipMissing ? [] : [{ office_id: state.officeId, role: state.role, user_id: userA }];
        if (state.switchAfterMembership) { state.currentUserId = userB; state.sessionUserId = userB; state.token = tokenB; }
      } else if (table === 'clients') {
        assert.equal(url.searchParams.get('office_id'), 'eq.' + officeA);
        rows = [{ id:'10000000-0000-4000-8000-000000000001', office_id:state.injectForeignClient?officeB:officeA,
          name:'CLIENTE FICTÍCIO ALFA', cpf:'000.000.000-00', phone:null, email:null }];
        if (state.changeOfficeAfterClients) state.officeId = officeB;
        if (state.revokeAfterClients) state.membershipMissing = true;
      } else throw new Error('Unexpected table request: ' + table);
      const body = headers.get('accept')?.includes('pgrst.object') ? (rows[0] || null) : rows;
      return new Response(JSON.stringify(body), { status:200, headers:{'content-type':'application/json'} });
    } },
  });
  client.auth.getSession = async () => ({ data:{ session: state.sessionMissing ? null : { access_token:state.token, user:{id:state.sessionUserId} } }, error:null });
  client.auth.getUser = async token => {
    state.verifications.push(token);
    return { data:{ user:{ id:state.tokenOwnerMismatch?userB:token===tokenA?userA:userB } }, error:null };
  };
  state.client = client;
  globalThis.documentAccessFixture = state;
  return state;
}

for (const role of ['admin', 'user']) test('real SDK retains verified identity and filters document clients for canonical ' + role, async () => {
  const state = fixture({ role });
  const context = await access.getDocumentOfficeContext();
  assert.deepEqual(context, { userId:userA, officeId:officeA });
  const clients = await access.loadDocumentClients(context);
  assert.equal(clients.length, 1);
  assert.equal(clients[0].name, 'CLIENTE FICTÍCIO ALFA');
  assert.equal('office_id' in clients[0], false, 'Keep the published ClientLite interface unchanged');
  assert.ok(state.verifications.length >= 2 && state.verifications.every(token => token === tokenA));
  assert.ok(state.requests.filter(request => request.table === 'clients').every(request => request.officeFilter === 'eq.' + officeA));
  assert.ok(state.requests.every(request => request.table === 'office_members' || request.table === 'clients'));
});

test('profile-name and stored-role aliases cannot authorize documents', async () => {
  for (const role of ['owner', 'adm', 'advogado', 'finance', 'assistant', '', null]) {
    const state = fixture({ role });
    await assert.rejects(access.getDocumentOfficeContext(), /Sem permissão/);
    assert.equal(state.requests.filter(request => request.table === 'clients').length, 0);
    assert.equal(state.requests.some(request => request.table === 'user_profiles'), false);
  }
});

test('missing sessions and mismatched token owners are denied before Data API requests', async () => {
  for (const option of [{ sessionMissing:true }, { tokenOwnerMismatch:true }]) {
    const state = fixture(option);
    await assert.rejects(access.getDocumentOfficeContext(), /conta mudou/);
    assert.equal(state.requests.length, 0);
  }
});

test('account switch during membership lookup never returns an office or queries clients', async () => {
  const state = fixture({ switchAfterMembership:true });
  await assert.rejects(access.getDocumentOfficeContext(), /conta mudou/);
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].authorization, 'Bearer ' + tokenA);
  assert.equal(state.requests.some(request => request.table === 'clients'), false);
});

test('expected office or actor mismatches cannot query document clients', async () => {
  const state = fixture();
  await assert.rejects(access.loadDocumentClients({ userId:userA, officeId:officeB }), /escritório mudou/);
  assert.equal(state.requests.some(request => request.table === 'clients'), false);
  state.requests.length = 0;
  await assert.rejects(access.loadDocumentClients({ userId:userB, officeId:officeA }), /conta mudou/);
  assert.equal(state.requests.length, 0);
});

test('membership lookup errors and missing membership fail closed', async () => {
  for (const option of [{ membershipError:true }, { membershipMissing:true }]) {
    const state = fixture(option);
    await assert.rejects(access.getDocumentOfficeContext(), /confirmar o acesso|Sem permissão/);
    assert.equal(state.requests.some(request => request.table === 'clients'), false);
  }
});

test('client responses collected across a primary-office change or revocation are discarded', async () => {
  for (const option of [{ changeOfficeAfterClients:true }, { revokeAfterClients:true }]) {
    fixture(option);
    await assert.rejects(access.loadDocumentClients({ userId:userA, officeId:officeA }), /escritório mudou|Sem permissão/);
  }
});

test('a foreign-office row in an otherwise successful client response is rejected', async () => {
  fixture({ injectForeignClient:true });
  await assert.rejects(access.loadDocumentClients({ userId:userA, officeId:officeA }), /não corresponde/);
});
