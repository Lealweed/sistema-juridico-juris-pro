import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const migrationPath='supabase/migrations/20261007125503_office_invitation_registration_guard.sql';
const migration=await fs.readFile(path.join(root,migrationPath));
const officePatch=(await fs.readFile(path.join(root,'supabase/patch_office_mode_phase1.sql'),'utf8')).replaceAll('\r\n','\n');
const exactAdminHelper=officePatch.match(/create or replace function public\.is_office_admin\(p_office_id uuid\)[\s\S]*?\$\$;/)[0];
const docker='C:/Users/Coop Agronorte/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const name='juris-registration-guard-'+crypto.randomBytes(6).toString('hex');
const out=path.join(root,'tmp/office-invitation-registration-native-20261007',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(out,{recursive:true});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [officeA,officeB,adminA,admin2,staff,adminB,guest,guestB,unconfirmed,existing,unknownIdentity,duplicate1,duplicate2]=Array.from({length:13},(_,i)=>id(i+1));
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const evidence={status:'RUNNING',startedAtUtc:new Date().toISOString(),fixtureOnly:true,productionRequests:0,
  restoredCloneRequests:0,realAuthAccountsCreated:0,emailSends:0,network:'none; pull never; no host ports',
  migration:{path:migrationPath,sha256:crypto.createHash('sha256').update(migration).digest('hex')},checks:[],
  limitations:['Native PostgreSQL fictitious Auth UID claims; no GoTrue/JWT/PostgREST/SMTP/browser test',
    'Legacy membership SELECT/UPDATE/DELETE grants and invite SELECT remain; membership ALL policy is narrowed to exact admin; last-admin/identity mutation guards remain outside this patch']};
let started=false;const children=new Set();
function command(args,input='',allowError=false){return new Promise((resolve,reject)=>{
  const c=spawn(docker,args,{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});children.add(c);let output='',error='';
  c.stdout.on('data',x=>output+=x);c.stderr.on('data',x=>error+=x);c.on('error',reject);
  c.on('close',code=>{children.delete(c);if(code&&!allowError)reject(new Error(error.slice(-2500)));else resolve({code,output,error});});c.stdin.end(input);
});}
const sql=(statement,allowError=false)=>command(['exec','-i',name,'psql','-X','-U','qa_bootstrap','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],statement,allowError);
const request=(role,actor,statement,commit=false,isolation='read committed')=>sql('BEGIN ISOLATION LEVEL '+isolation+';SET LOCAL ROLE '+role+";SELECT set_config('request.jwt.claim.sub',"+q(actor??'')+',true);'+statement+';'+(commit?'COMMIT':'ROLLBACK')+';',true);
const object=r=>JSON.parse(r.output.split('\n').findLast(x=>x.startsWith('{')||x.startsWith('[')));
async function rpc(fn,args,actor=adminA,commit=true,role='authenticated'){
  const r=await request(role,actor,'SELECT public.'+fn+'('+args+');',commit);assert.equal(r.code,0,r.error);return object(r);
}
async function denied(fn,args,actor=staff,pattern=/administrator_required/,role='authenticated'){
  const r=await request(role,actor,'SELECT public.'+fn+'('+args+');',true);assert.notEqual(r.code,0,'Request must fail');assert.match(r.error,pattern);
}
async function check(label,run){evidence.step=label;await run();evidence.checks.push({name:label,status:'PASS'});}
async function digest(){const r=await sql(`SELECT jsonb_build_object('members',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM public.office_members t),
  'invites',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM public.office_invites t),
  'profiles',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY user_id)::text,'[]')) FROM public.user_profiles t),
  'auth',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM auth.users t))::text;`);return object(r);}
function session(label){
  const c=spawn(docker,['exec','-i',name,'psql','-X','-U','qa_bootstrap','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
  children.add(c);let output='',error='';c.stdout.on('data',x=>output+=x);c.stderr.on('data',x=>error+=x);
  const done=new Promise((resolve,reject)=>{c.on('error',reject);c.on('close',code=>{children.delete(c);resolve({code,output,error});});});
  return {c,done,wait:async token=>{const end=Date.now()+15000;while(!output.includes(token)){if(Date.now()>end)throw new Error('SESSION_TOKEN_TIMEOUT_'+label);await new Promise(r=>setTimeout(r,75));}}};
}
async function blocked(application){for(let i=0;i<100;i++){const r=await sql("SELECT count(*) FROM pg_stat_activity WHERE application_name="+q(application)+" AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0;");if(r.output.trim()==='1')return;await new Promise(r=>setTimeout(r,75));}throw new Error('EXPECTED_NATIVE_LOCK_NOT_OBSERVED_'+application);}
const create=(email,role='user',actor=adminA,office=officeA)=>rpc('office_invitation_create',q(office)+','+q(email)+','+q(role),actor);
const add=(email,role='user',actor=adminA,office=officeA)=>rpc('office_invitation_add_existing',q(office)+','+q(email)+','+q(role),actor);
try{
  await command(['image','inspect','postgres:17-alpine']);
  await command(['run','-d','--pull=never','--network','none','--name',name,'--label','codex.fixture=registration-20261007',
    '-e','POSTGRES_PASSWORD=fixture-only-no-live-secret','postgres:17-alpine']);started=true;
  for(let i=0;i<70;i++){const r=await command(['exec',name,'pg_isready','-U','postgres'],'',true);if(!r.code)break;if(i===69)throw new Error('FIXTURE_NOT_READY');await new Promise(r=>setTimeout(r,150));}
  await command(['exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],'create role qa_bootstrap superuser login;');
  await sql(`ALTER ROLE postgres RENAME TO fixture_bootstrap;CREATE ROLE postgres NOLOGIN NOSUPERUSER BYPASSRLS;
    CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS;GRANT USAGE,CREATE ON SCHEMA public TO postgres;
    CREATE SCHEMA auth AUTHORIZATION postgres;SET ROLE postgres;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email varchar(255),email_confirmed_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE public.offices(id uuid PRIMARY KEY,name text,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.office_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id),user_id uuid NOT NULL REFERENCES auth.users(id),
      role text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(office_id,user_id),CONSTRAINT office_members_role_check CHECK(role IN('admin','user')));
    CREATE TABLE public.office_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id),email text NOT NULL,role text NOT NULL DEFAULT 'member',
      created_by_user_id uuid REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),accepted_by_user_id uuid REFERENCES auth.users(id),accepted_at timestamptz,
      revoked_at timestamptz,revoked_by_user_id uuid REFERENCES auth.users(id));
    CREATE INDEX office_invites_email_idx ON public.office_invites USING btree(lower(email));
    CREATE INDEX office_invites_office_created_idx ON public.office_invites USING btree(office_id,created_at DESC);
    CREATE UNIQUE INDEX office_invites_office_email_uniq ON public.office_invites USING btree(office_id,lower(email));
    CREATE TABLE public.user_profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id),email text,display_name text,oab text,phone text,whatsapp text,created_at timestamptz NOT NULL DEFAULT now(),office_id uuid REFERENCES public.offices(id));
    CREATE FUNCTION public._ensure_office_id() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN IF new.office_id IS NULL THEN SELECT id INTO new.office_id FROM public.offices ORDER BY created_at,id LIMIT 1;END IF;RETURN new;END$$;
    CREATE TRIGGER tr_user_profiles_ensure_office_id BEFORE INSERT ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public._ensure_office_id();
    ALTER TABLE public.office_members ENABLE ROW LEVEL SECURITY;ALTER TABLE public.office_invites ENABLE ROW LEVEL SECURITY;ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
    ${exactAdminHelper}
    CREATE FUNCTION public.is_office_member(p_office_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM public.office_members m WHERE m.office_id=p_office_id AND m.user_id=auth.uid());$$;
    REVOKE ALL ON FUNCTION public.is_office_admin(uuid) FROM public;GRANT EXECUTE ON FUNCTION public.is_office_admin(uuid) TO authenticated;
    CREATE POLICY office_members_admin_office ON public.office_members FOR ALL TO authenticated USING(public.is_office_member(office_id));
    CREATE POLICY office_members_insert_self ON public.office_members FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
    CREATE POLICY office_members_read_office ON public.office_members FOR SELECT TO authenticated USING(public.is_office_member(office_id));
    CREATE POLICY office_members_read_own ON public.office_members FOR SELECT TO authenticated USING(user_id=auth.uid());
    CREATE POLICY legacy_invite_all ON public.office_invites FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY legacy_profile_self ON public.user_profiles FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
    INSERT INTO public.offices(id,name,created_at) VALUES(${q(officeA)},'Fictitious A','2020-01-01'),(${q(officeB)},'Fictitious B','2020-01-02');
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
      (${q(adminA)},'admin-a@example.invalid',now()),(${q(admin2)},'admin-2@example.invalid',now()),(${q(staff)},'staff@example.invalid',now()),
      (${q(adminB)},'admin-b@example.invalid',now()),(${q(guest)},'guest@example.invalid',now()),(${q(guestB)},'guest-b@example.invalid',now()),
      (${q(unconfirmed)},'unconfirmed@example.invalid',null),(${q(existing)},'existing@example.invalid',now()),
      (${q(unknownIdentity)},'unknown-role@example.invalid',now()),(${q(duplicate1)},'dupe@example.invalid',now()),(${q(duplicate2)},' DUPE@example.invalid ',now());
    INSERT INTO public.office_members(id,office_id,user_id,role) VALUES
      (${q(id(20))},${q(officeA)},${q(adminA)},'admin'),(${q(id(21))},${q(officeA)},${q(admin2)},'admin'),(${q(id(22))},${q(officeA)},${q(staff)},'user'),
      (${q(id(23))},${q(officeB)},${q(adminB)},'admin'),(${q(id(24))},${q(officeA)},${q(existing)},'admin');
    INSERT INTO public.user_profiles(user_id,office_id,email,display_name) VALUES
      (${q(existing)},${q(officeB)},'historical-profile@example.invalid','Historical name'),(${q(staff)},${q(officeB)},'guest@example.invalid','Spoofed profile');
    INSERT INTO public.office_invites(id,office_id,email,role,created_by_user_id,accepted_at,accepted_by_user_id,revoked_at,revoked_by_user_id) VALUES
      (${q(id(30))},${q(officeA)},'historical-accepted@example.invalid','member',${q(adminA)},now(),${q(guest)},null,null),
      (${q(id(31))},${q(officeA)},'historical-revoked@example.invalid','member',${q(adminA)},null,null,now(),${q(adminA)}),
      (${q(id(32))},${q(officeA)},'  GUEST@example.invalid ','member',${q(adminA)},null,null,null,null);
    RESET ROLE;`);
  const original=await digest();
  await check('Migration owner non-superuser BYPASSRLS; rows/constraints/indexes/three policies preserved, one policy narrowed and reapply safe',async()=>{
    await sql('SET ROLE postgres;'+migration.toString());assert.deepEqual(await digest(),original);
    await sql('SET ROLE postgres;'+migration.toString());assert.deepEqual(await digest(),original);
    evidence.version=(await sql('SHOW server_version;')).output.trim();
  });
  await check('Unexpected role constraint aborts transaction without schema or record changes',async()=>{
    await sql("ALTER TABLE public.office_members DROP CONSTRAINT office_members_role_check;ALTER TABLE public.office_members ADD CONSTRAINT office_members_role_check CHECK(role IN('admin','user','owner'));");
    const r=await sql('SET ROLE postgres;'+migration.toString(),true);assert.notEqual(r.code,0);assert.match(r.error,/legacy_role_constraint_changed/);assert.deepEqual(await digest(),original);
    await sql("ALTER TABLE public.office_members DROP CONSTRAINT office_members_role_check;ALTER TABLE public.office_members ADD CONSTRAINT office_members_role_check CHECK(role IN('admin','user'));");
  });
  await check('Actual four invite indexes match production and drifted partial/extra/not-ready/expression contracts fail closed without data changes',async()=>{
    const indexRows=await sql("SELECT jsonb_agg(jsonb_build_object('name',c.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'partial',i.indpred IS NOT NULL) ORDER BY c.relname) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.office_invites'::regclass;");
    evidence.inviteIndexContract=object(indexRows);assert.equal(evidence.inviteIndexContract.length,4);
    const before=await digest();
    const fails=async()=>{const r=await sql('SET ROLE postgres;'+migration.toString(),true);assert.notEqual(r.code,0);assert.match(r.error,/invite_index_contract_changed/);assert.deepEqual(await digest(),before);};
    await sql("CREATE INDEX fixture_extra_invite_index ON public.office_invites(office_id);");await fails();await sql('DROP INDEX public.fixture_extra_invite_index;');
    for(const flag of ['indisvalid','indisready']){
      await sql('UPDATE pg_index SET '+flag+"=false WHERE indexrelid='public.office_invites_office_email_uniq'::regclass;");await fails();
      await sql('UPDATE pg_index SET '+flag+"=true WHERE indexrelid='public.office_invites_office_email_uniq'::regclass;");
    }
    await sql('DROP INDEX public.office_invites_office_email_uniq;CREATE UNIQUE INDEX office_invites_office_email_uniq ON public.office_invites(office_id,lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL;');
    await fails();await sql('DROP INDEX public.office_invites_office_email_uniq;CREATE UNIQUE INDEX office_invites_office_email_uniq ON public.office_invites(office_id,lower(btrim(email)));');
    await fails();await sql('DROP INDEX public.office_invites_office_email_uniq;CREATE UNIQUE INDEX office_invites_office_email_uniq ON public.office_invites(office_id,lower(email));');
    await sql('SET ROLE postgres;'+migration.toString());assert.deepEqual(await digest(),before);
  });
  await check('RPC ACL denies anonymous calls, owner-only helpers and authenticated send reservation; direct insert/update invitation bypass denied',async()=>{
    for(const fn of ['office_invitation_create','office_invitation_add_existing'])await denied(fn,q(officeA)+",'new@example.invalid','user'",null,/permission denied/,'anon');
    await denied('_office_invitation_require_admin',q(officeA)+','+q(adminA),adminA,/permission denied/);
    await denied('_office_invitation_legacy_role',"'user'",adminA,/permission denied/);
    await denied('office_invitation_reserve_send',q(id(32))+','+q(adminA),adminA,/permission denied/);
    const statements=[`INSERT INTO public.office_members(office_id,user_id,role) VALUES(${q(officeA)},${q(guest)},'admin')`,
      `INSERT INTO public.office_invites(office_id,email,role,created_by_user_id) VALUES(${q(officeA)},'bypass@example.invalid','admin',${q(adminA)})`,
      `UPDATE public.office_invites SET role='admin' WHERE id=${q(id(32))}`,`DELETE FROM public.office_invites WHERE id=${q(id(32))}`,`TRUNCATE public.office_invites`];
    for(const statement of statements){const r=await request('authenticated',adminA,statement,true);assert.notEqual(r.code,0);assert.match(r.error,/permission denied/);}
    assert.deepEqual(await digest(),original);
  });
  await check('Only current verified office admin may create/list/revoke/add existing; stale metadata/profile cannot authorize',async()=>{
    await sql(`UPDATE auth.users SET raw_user_meta_data='{"role":"admin","email":"admin-a@example.invalid"}' WHERE id=${q(staff)};`);
    for(const actor of [staff,guest,unconfirmed,adminB]){
      await denied('office_invitation_create',q(officeA)+",'new@example.invalid','user'",actor);
      await denied('office_invitation_add_existing',q(officeA)+",'guest@example.invalid','user'",actor);
      await denied('office_invitation_list',q(officeA),actor);
      await denied('office_invitation_revoke',q(officeA)+','+q(id(32)),actor);
    }
    await denied('office_invitation_create',q(officeA)+",'new@example.invalid','user'",id(999));
    assert.deepEqual(await rpc('office_invitation_list_mine','',staff),[]);
    await denied('office_invitation_list_mine','',unconfirmed,/confirmed_email_required/);
  });
  await check('Collaborator cannot self-promote or remove a peer through legacy raw membership routes; exact office admin retains scoped role update',async()=>{
    const before=await digest();
    const update=await request('authenticated',staff,'UPDATE public.office_members SET role=\'admin\' WHERE user_id='+q(staff)+' AND office_id='+q(officeA),true);
    assert.equal(update.code,0,update.error);assert.match(update.output,/UPDATE 0/);
    const deletion=await request('authenticated',staff,'DELETE FROM public.office_members WHERE user_id='+q(admin2)+' AND office_id='+q(officeA),true);
    assert.equal(deletion.code,0,deletion.error);assert.match(deletion.output,/DELETE 0/);assert.deepEqual(await digest(),before);
    const admin=await request('authenticated',adminA,'UPDATE public.office_members SET role=\'admin\' WHERE user_id='+q(staff)+' AND office_id='+q(officeA),false);
    assert.equal(admin.code,0,admin.error);assert.match(admin.output,/UPDATE 1/);assert.deepEqual(await digest(),before);
    const foreign=await request('authenticated',adminB,'UPDATE public.office_members SET role=\'admin\' WHERE user_id='+q(staff)+' AND office_id='+q(officeA),true);
    assert.equal(foreign.code,0,foreign.error);assert.match(foreign.output,/UPDATE 0/);assert.deepEqual(await digest(),before);
    const forbidden=await request('authenticated',adminA,'UPDATE public.office_members SET role=\'owner\' WHERE user_id='+q(staff)+' AND office_id='+q(officeA),true);
    assert.notEqual(forbidden.code,0);assert.match(forbidden.error,/office_members_role_check/);assert.deepEqual(await digest(),before);
  });
  await check('Normalized duplicate pending legacy invite returns unchanged row; role conflict and invalid roles/email rejected',async()=>{
    const before=await digest();const pending=await create(' guest@EXAMPLE.invalid ','colaboradora');assert.equal(pending.id,id(32));assert.equal(pending.role,'member');
    assert.deepEqual(await digest(),before);await denied('office_invitation_create',q(officeA)+",'guest@example.invalid','admin'",adminA,/pending_role_conflict/);
    for(const role of ['owner','superuser','administrator',''])await denied('office_invitation_create',q(officeA)+",'unknown-role@example.invalid',"+q(role),adminA,/invalid_role/);
    for(const email of ['a@b','bad@x\n.invalid',' ', 'x'.repeat(255)+'@x.invalid'])await denied('office_invitation_create',q(officeA)+','+q(email)+",'user'",adminA,/invalid_email/);
    const finance=await create('finance-job@example.invalid','financeiro');assert.equal(finance.role,'user');
  });
  await check('Real unique index is retained; historical accepted/revoked invites reject reissue explicitly without touching history',async()=>{
    const before=(await sql('SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.office_invites t WHERE id IN('+q(id(30))+','+q(id(31))+');')).output.trim();
    const allBefore=await digest();
    for(const email of ['historical-accepted@example.invalid',' HISTORICAL-ACCEPTED@example.invalid ','historical-revoked@example.invalid']){
      await denied('office_invitation_create',q(officeA)+','+q(email)+",'user'",adminA,/invite_history_requires_existing_account/);
    }
    assert.deepEqual(await digest(),allBefore);
    const after=(await sql('SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.office_invites t WHERE id IN('+q(id(30))+','+q(id(31))+');')).output.trim();assert.equal(after,before);
    const other=await create('historical-accepted@example.invalid','user',adminB,officeB);assert.equal(other.office_id,officeB);
  });
  await check('Confirmed recipient identity comes from Auth; profile spoof and SQL wildcard emails never match',async()=>{
    assert.equal((await rpc('office_invitation_list_mine','',guest))[0].id,id(32));
    await denied('office_invitation_accept',q(id(32)),staff,/invite_unavailable/);
    const patternInvite=await create('guest%@example.invalid');assert.notEqual(patternInvite.id,id(32));
    assert.equal((await rpc('office_invitation_list_mine','',guest)).some(i=>i.id===patternInvite.id),false);
    const noConfirm=await create('unconfirmed@example.invalid');await denied('office_invitation_accept',q(noConfirm.id),unconfirmed,/confirmed_email_required/);
  });
  await check('Acceptance is atomic after a synthetic profile failure and then idempotent; legacy role maps locally without changing invite',async()=>{
    await sql(`CREATE FUNCTION public.fixture_profile_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF new.user_id=${q(guest)} THEN RAISE EXCEPTION 'fixture_profile_failure';END IF;RETURN new;END$$;
      CREATE TRIGGER fixture_profile_failure BEFORE INSERT ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.fixture_profile_failure();`);
    const before=await digest();await denied('office_invitation_accept',q(id(32)),guest,/fixture_profile_failure/);assert.deepEqual(await digest(),before);
    await sql('DROP TRIGGER fixture_profile_failure ON public.user_profiles;DROP FUNCTION public.fixture_profile_failure();');
    const member=await rpc('office_invitation_accept',q(id(32)),guest);assert.equal(member.role,'user');assert.equal(member.office_id,officeA);
    const after=await digest();assert.equal((await rpc('office_invitation_accept',q(id(32)),guest)).id,member.id);assert.deepEqual(await digest(),after);
    assert.equal((await sql('SELECT role FROM public.office_invites WHERE id='+q(id(32))+';')).output.trim(),'member');
  });
  await check('Acceptance in second office supplies explicit profile office despite global-default trigger',async()=>{
    const invitation=await create('guest-b@example.invalid','secretary',adminB,officeB);
    await rpc('office_invitation_accept',q(invitation.id),guestB);
    assert.equal((await sql('SELECT office_id FROM public.user_profiles WHERE user_id='+q(guestB)+';')).output.trim(),officeB);
  });
  await check('Existing membership and historical profile remain unchanged on an accepted invitation',async()=>{
    await sql(`SET ROLE postgres;INSERT INTO public.office_invites(id,office_id,email,role,created_by_user_id) VALUES(${q(id(38))},${q(officeA)},'existing@example.invalid','user',${q(adminA)});RESET ROLE;`);
    const before=(await sql('SELECT md5(to_jsonb(p)::text) FROM public.user_profiles p WHERE user_id='+q(existing)+';')).output.trim();
    const member=await rpc('office_invitation_accept',q(id(38)),existing);assert.equal(member.role,'admin');
    assert.equal((await sql('SELECT md5(to_jsonb(p)::text) FROM public.user_profiles p WHERE user_id='+q(existing)+';')).output.trim(),before);
  });
  await check('Connecting existing confirmed Auth account is exact and idempotent; no Auth/invite/history mutations, no silently changed role',async()=>{
    const pending=await create('unknown-role@example.invalid');const before=await digest();
    const first=await add(' UNKNOWN-ROLE@example.invalid ','lawyer');assert.equal(first.role,'user');
    const after=await digest();assert.equal(after.auth,before.auth);assert.equal(after.invites,before.invites);
    assert.equal((await add('unknown-role@example.invalid','finance')).id,first.id);assert.deepEqual(await digest(),after);
    await denied('office_invitation_add_existing',q(officeA)+",'unknown-role@example.invalid','admin'",adminA,/membership_role_conflict/);assert.deepEqual(await digest(),after);
    await denied('office_invitation_add_existing',q(officeA)+",'missing@example.invalid','user'",adminA,/account_required/);
    await denied('office_invitation_add_existing',q(officeA)+",'unconfirmed@example.invalid','user'",adminA,/confirmed_email_required/);
    await denied('office_invitation_add_existing',q(officeA)+",'dupe@example.invalid','user'",adminA,/account_identity_conflict/);
    await denied('office_invitation_add_existing',q(officeA)+",'unknown-role%@example.invalid','user'",adminA,/account_required/);
    assert.equal((await sql('SELECT accepted_at IS NULL FROM public.office_invites WHERE id='+q(pending.id)+';')).output.trim(),'t');
    assert.equal((await add('existing@example.invalid','admin')).user_id,existing);
  });
  await check('Adding existing account to B supplies B profile while preserving a profile already associated with A',async()=>{
    await sql(`SET ROLE postgres;INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(id(42))},'direct-b@example.invalid',now());RESET ROLE;`);
    const first=await add('direct-b@example.invalid','user',adminB,officeB);assert.equal(first.office_id,officeB);
    assert.equal((await sql('SELECT office_id FROM public.user_profiles WHERE user_id='+q(id(42))+';')).output.trim(),officeB);
    await add('direct-b@example.invalid','member');assert.equal((await sql('SELECT office_id FROM public.user_profiles WHERE user_id='+q(id(42))+';')).output.trim(),officeB);
  });
  await check('Existing actor membership retry ensures a missing profile but never changes own role or historical NULL profile office',async()=>{
    const actor=await add('admin-a@example.invalid','admin');assert.equal(actor.id,id(20));
    assert.equal((await sql('SELECT office_id FROM public.user_profiles WHERE user_id='+q(adminA)+';')).output.trim(),officeA);
    const after=await digest();assert.equal((await add('admin-a@example.invalid','admin')).id,actor.id);assert.deepEqual(await digest(),after);
    await denied('office_invitation_add_existing',q(officeA)+",'admin-a@example.invalid','user'",adminA,/membership_role_conflict/);assert.deepEqual(await digest(),after);
    await sql(`SET ROLE postgres;INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(id(43))},'profile-null@example.invalid',now());
      INSERT INTO public.user_profiles(user_id,office_id,email,display_name) VALUES(${q(id(43))},${q(officeB)},'original@example.invalid','Original');
      UPDATE public.user_profiles SET office_id=null WHERE user_id=${q(id(43))};RESET ROLE;`);
    const original=(await sql('SELECT md5(to_jsonb(p)::text) FROM public.user_profiles p WHERE user_id='+q(id(43))+';')).output.trim();
    await add('profile-null@example.invalid');assert.equal((await sql('SELECT md5(to_jsonb(p)::text) FROM public.user_profiles p WHERE user_id='+q(id(43))+';')).output.trim(),original);
  });
  await check('A synthetic profile failure in add existing rolls back membership and preserves every Auth/invite/profile row',async()=>{
    await sql(`SET ROLE postgres;INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(id(44))},'direct-failure@example.invalid',now());RESET ROLE;
      CREATE FUNCTION public.fixture_direct_profile_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF new.user_id=${q(id(44))} THEN RAISE EXCEPTION 'fixture_direct_profile_failure';END IF;RETURN new;END$$;
      CREATE TRIGGER fixture_direct_profile_failure BEFORE INSERT ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.fixture_direct_profile_failure();`);
    const before=await digest();await denied('office_invitation_add_existing',q(officeA)+",'direct-failure@example.invalid','user'",adminA,/fixture_direct_profile_failure/);assert.deepEqual(await digest(),before);
    await sql('DROP TRIGGER fixture_direct_profile_failure ON public.user_profiles;DROP FUNCTION public.fixture_direct_profile_failure();');
    const accepted=await add('direct-failure@example.invalid');assert.equal(accepted.user_id,id(44));assert.equal((await digest()).auth,before.auth);
  });
  await check('Revoke keeps historical record, is idempotent, refuses accepted/wrong-office invitations and denies recipient acceptance',async()=>{
    const invitation=await create('revoked@example.invalid');const revoked=await rpc('office_invitation_revoke',q(officeA)+','+q(invitation.id));assert.ok(revoked.revoked_at);
    assert.deepEqual(await rpc('office_invitation_revoke',q(officeA)+','+q(invitation.id)),revoked);
    await denied('office_invitation_revoke',q(officeB)+','+q(invitation.id),adminB,/invite_unavailable/);
    await denied('office_invitation_revoke',q(officeA)+','+q(id(32)),adminA,/invite_unavailable/);
    await denied('office_invitation_accept',q(invitation.id),guest,/invite_unavailable/);
    await denied('office_invitation_create',q(officeA)+",'revoked@example.invalid','user'",adminA,/invite_history_requires_existing_account/);
  });
  await check('Reservation is service-only, per invite sixty seconds, validates actor/creator/current pending state and leaks no recipient',async()=>{
    const invitation=await create('delivery@example.invalid');const args=q(invitation.id)+','+q(adminA);
    const before=await digest();const first=await rpc('office_invitation_reserve_send',args,null,true,'service_role');assert.deepEqual(first,{reserved:true,retry_after_seconds:0});
    const second=await rpc('office_invitation_reserve_send',args,null,true,'service_role');assert.equal(second.reserved,false);assert.ok(second.retry_after_seconds>0&&second.retry_after_seconds<=60);
    await denied('office_invitation_reserve_send',q(invitation.id)+','+q(adminB),null,/administrator_required/,'service_role');
    await denied('office_invitation_reserve_send',q(invitation.id)+','+q(staff),null,/administrator_required/,'service_role');
    assert.deepEqual(await digest(),before);
    await sql('SET ROLE postgres;UPDATE public._office_invitation_send_reservations SET reserved_at=clock_timestamp()-interval \'61 seconds\' WHERE invite_id='+q(invitation.id)+';RESET ROLE;');
    assert.equal((await rpc('office_invitation_reserve_send',args,null,true,'service_role')).reserved,true);
    await rpc('office_invitation_revoke',q(officeA)+','+q(invitation.id));await denied('office_invitation_reserve_send',args,null,/invite_unavailable/,'service_role');
    const raw=await request('service_role',null,'SELECT * FROM public._office_invitation_send_reservations;',false);assert.notEqual(raw.code,0);assert.match(raw.error,/permission denied/);
  });
  await check('Revoked/unconfirmed creator cannot authorize a pending invitation or resend and never silently reassigns it',async()=>{
    const invitation=await create('creator-stale@example.invalid','user',admin2);
    await sql('UPDATE public.office_members SET role=\'user\' WHERE user_id='+q(admin2)+' AND office_id='+q(officeA)+';');
    await denied('office_invitation_create',q(officeA)+",'creator-stale@example.invalid','user'",adminA,/administrator_required/);
    await denied('office_invitation_reserve_send',q(invitation.id)+','+q(adminA),null,/administrator_required/,'service_role');
    await sql('UPDATE public.office_members SET role=\'admin\' WHERE user_id='+q(admin2)+' AND office_id='+q(officeA)+';');
  });
  for(const isolation of ['repeatable read','serializable'])await check('Stale authorization snapshots refused for '+isolation,async()=>{
    for(const statement of ["SELECT public.office_invitation_create("+q(officeA)+",'stale@example.invalid','user')",
      'SELECT public.office_invitation_add_existing('+q(officeA)+",'guest@example.invalid','user')",'SELECT public.office_invitation_list('+q(officeA)+')']){
      const r=await request('authenticated',adminA,statement,true,isolation);assert.notEqual(r.code,0);assert.match(r.error,/read_committed_required/);
    }
  });
  await check('Native concurrent duplicate registration waits on office and commits one unchanged pending row',async()=>{
    const a=session('duplicate-a'),b=session('duplicate-b');
    a.c.stdin.write("SET application_name='reg_dup_a';BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',"+q(adminA)+",true);SELECT public.office_invitation_create("+q(officeA)+",'race@example.invalid','user');SELECT 'DUP_A_READY';\n");await a.wait('DUP_A_READY');
    b.c.stdin.write("SET application_name='reg_dup_b';BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',"+q(adminA)+",true);SELECT public.office_invitation_create("+q(officeA)+",' RACE@example.invalid ','member');COMMIT;\n");await blocked('reg_dup_b');
    a.c.stdin.end('COMMIT;\n');assert.equal((await a.done).code,0);b.c.stdin.end();const br=await b.done;assert.equal(br.code,0,br.error);
    assert.equal((await sql("SELECT count(*) FROM public.office_invites WHERE lower(btrim(email))='race@example.invalid' AND office_id="+q(officeA)+';')).output.trim(),'1');
  });
  await check('Native stale admin after office lock wait is revalidated and denied without creating invitation',async()=>{
    const a=session('stale-a'),b=session('stale-b');
    a.c.stdin.write("SET application_name='reg_stale_a';BEGIN;SELECT id FROM public.offices WHERE id="+q(officeA)+" FOR UPDATE;UPDATE public.office_members SET role='user' WHERE user_id="+q(admin2)+" AND office_id="+q(officeA)+";SELECT 'STALE_A_READY';\n");await a.wait('STALE_A_READY');
    b.c.stdin.write("SET application_name='reg_stale_b';BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',"+q(admin2)+",true);SELECT public.office_invitation_create("+q(officeA)+",'stale-admin@example.invalid','user');COMMIT;\n");await blocked('reg_stale_b');
    a.c.stdin.end('COMMIT;\n');assert.equal((await a.done).code,0);b.c.stdin.end();const br=await b.done;assert.notEqual(br.code,0);assert.match(br.error,/administrator_required/);
    assert.equal((await sql("SELECT count(*) FROM public.office_invites WHERE email='stale-admin@example.invalid';")).output.trim(),'0');
    await sql('UPDATE public.office_members SET role=\'admin\' WHERE user_id='+q(admin2)+' AND office_id='+q(officeA)+';');
  });
  await check('Native concurrent existing-account connection admits one membership and one profile, with pending invitation unchanged',async()=>{
    await sql(`SET ROLE postgres;INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(id(46))},'race-account@example.invalid',now());RESET ROLE;`);
    const pending=await create('race-account@example.invalid');const before=await digest();const a=session('add-a'),b=session('add-b');
    a.c.stdin.write("SET application_name='reg_add_a';BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',"+q(adminA)+",true);SELECT public.office_invitation_add_existing("+q(officeA)+",'race-account@example.invalid','user');SELECT 'ADD_A_READY';\n");await a.wait('ADD_A_READY');
    b.c.stdin.write("SET application_name='reg_add_b';BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',"+q(adminA)+",true);SELECT public.office_invitation_add_existing("+q(officeA)+",' RACE-ACCOUNT@example.invalid ','member');COMMIT;\n");await blocked('reg_add_b');
    a.c.stdin.end('COMMIT;\n');const ar=await a.done;assert.equal(ar.code,0);b.c.stdin.end();const br=await b.done;assert.equal(br.code,0,br.error);assert.equal(object(ar).id,object(br).id);
    assert.equal((await sql('SELECT count(*) FROM public.office_members WHERE user_id='+q(id(46))+' AND office_id='+q(officeA)+';')).output.trim(),'1');
    assert.equal((await sql('SELECT count(*) FROM public.user_profiles WHERE user_id='+q(id(46))+';')).output.trim(),'1');
    const after=await digest();assert.equal(after.auth,before.auth);assert.equal(after.invites,before.invites);
    assert.equal((await sql('SELECT accepted_at IS NULL FROM public.office_invites WHERE id='+q(pending.id)+';')).output.trim(),'t');
  });
  await check('Native concurrent service reservations serialize and exactly one is admitted',async()=>{
    const invitation=await create('race-send@example.invalid');const args=q(invitation.id)+','+q(adminA);const a=session('send-a'),b=session('send-b');
    a.c.stdin.write("SET application_name='reg_send_a';BEGIN;SET LOCAL ROLE service_role;SELECT public.office_invitation_reserve_send("+args+");SELECT 'SEND_A_READY';\n");await a.wait('SEND_A_READY');
    b.c.stdin.write("SET application_name='reg_send_b';BEGIN;SET LOCAL ROLE service_role;SELECT public.office_invitation_reserve_send("+args+");COMMIT;\n");await blocked('reg_send_b');
    a.c.stdin.end('COMMIT;\n');const ar=await a.done;assert.equal(ar.code,0);assert.equal(object(ar).reserved,true);
    b.c.stdin.end();const br=await b.done;assert.equal(br.code,0,br.error);assert.equal(object(br).reserved,false);
  });
  await check('Native admin membership lock blocks uncoordinated legacy role change until authorized operation commits',async()=>{
    const a=session('role-lock-a'),b=session('role-lock-b');
    a.c.stdin.write("SET application_name='reg_role_a';BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',"+q(admin2)+",true);SELECT public.office_invitation_create("+q(officeA)+",'held-admin@example.invalid','user');SELECT 'ROLE_A_READY';\n");await a.wait('ROLE_A_READY');
    b.c.stdin.write("SET application_name='reg_role_b';BEGIN;UPDATE public.office_members SET role='user' WHERE user_id="+q(admin2)+" AND office_id="+q(officeA)+";COMMIT;\n");await blocked('reg_role_b');
    a.c.stdin.end('COMMIT;\n');assert.equal((await a.done).code,0);b.c.stdin.end();assert.equal((await b.done).code,0);
    await sql('UPDATE public.office_members SET role=\'admin\' WHERE user_id='+q(admin2)+' AND office_id='+q(officeA)+';');
  });
  await check('Original data remains after final reapply; broad legacy membership non-insert ACL and role constraint explicitly unchanged',async()=>{
    const before=await digest();await sql('SET ROLE postgres;'+migration.toString());assert.deepEqual(await digest(),before);
    const result=object(await sql("SELECT jsonb_build_object('auth_insert',has_table_privilege('authenticated','public.office_members','INSERT'),'auth_update',has_table_privilege('authenticated','public.office_members','UPDATE'),'auth_delete',has_table_privilege('authenticated','public.office_members','DELETE'),'auth_truncate',has_table_privilege('authenticated','public.office_members','TRUNCATE'),'auth_trigger',has_table_privilege('authenticated','public.office_members','TRIGGER'),'service_insert',has_table_privilege('service_role','public.office_members','INSERT'),'invite_auth_select',has_table_privilege('authenticated','public.office_invites','SELECT'));"));
    assert.deepEqual(result,{auth_insert:false,auth_update:true,auth_delete:true,auth_truncate:false,auth_trigger:false,service_insert:true,invite_auth_select:true});
  });
  evidence.status='PASS_NATIVE_POSTGRESQL_FICTITIOUS_ONLY';evidence.finishedAtUtc=new Date().toISOString();delete evidence.step;
}catch(error){evidence.status='FAIL';evidence.finishedAtUtc=new Date().toISOString();evidence.failure=String(error.message).slice(-3000);process.exitCode=1;}
finally{
  for(const child of children)child.kill();
  if(started){const r=await command(['stop',name],'',true);evidence.fixtureStopped=r.code===0;}
  await fs.writeFile(path.join(out,'result-sanitized.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({status:evidence.status,checks:evidence.checks.length,path:path.join(out,'result-sanitized.json'),...(evidence.failure?{failure:evidence.failure}:{})}));
}
