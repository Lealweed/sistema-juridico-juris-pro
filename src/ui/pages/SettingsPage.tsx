import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { acceptOfficeInvite, listMyOfficeInvites } from '@/lib/offices';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { getErrorMessage } from '@/lib/errors';

type Office = {
  id: string;
  name: string;
  created_at: string;
};

type OfficeMemberRow = {
  id: string;
  office_id: string;
  user_id: string;
  role: 'admin' | 'finance' | 'staff' | 'member' | string;
  created_at: string;
  profile?: {
    email: string | null;
    display_name: string | null;
    phone?: string | null;
    whatsapp?: string | null;
  } | null;
};

type OfficeInviteRow = {
  id: string;
  office_id: string;
  email: string;
  role: string;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

function roleLabel(role: string) {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'finance':
      return 'Financeiro';
    case 'staff':
      return 'Operacional';
    default:
      return 'Membro';
  }
}

function isOfficeMembersPolicyError(msg: string) {
  return msg.toLowerCase().includes('infinite recursion detected in policy for relation "office_members"');
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policyBlocked, setPolicyBlocked] = useState(false);

  const [meId, setMeId] = useState<string>('');

  const [office, setOffice] = useState<Office | null>(null);
  const [members, setMembers] = useState<OfficeMemberRow[]>([]);
  const [invites, setInvites] = useState<OfficeInviteRow[]>([]);

  // legacy manual add
  const [addEmail, setAddEmail] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState<'member' | 'admin' | 'finance' | 'staff'>('member');

  // new invite flow
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin' | 'finance' | 'staff'>('member');

  const [saving, setSaving] = useState(false);
  const [myWhatsapp, setMyWhatsapp] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [memberContacts, setMemberContacts] = useState<Record<string, { phone: string; whatsapp: string }>>({});

  const myMember = useMemo(() => members.find((m) => m.user_id === meId) || null, [members, meId]);
  const isAdmin = myMember?.role === 'admin';

  async function load() {
    setLoading(true);
    setError(null);
    setPolicyBlocked(false);

    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();
      setMeId(user.id);

      // load invites even when office query fails
      const myInvites = await listMyOfficeInvites().catch(() => [] as OfficeInviteRow[]);
      setInvites((myInvites || []) as OfficeInviteRow[]);

      // Carrega WhatsApp do próprio perfil
      const { data: selfProfile } = await sb
        .from('user_profiles')
        .select('whatsapp')
        .eq('user_id', user.id)
        .maybeSingle();
      setMyWhatsapp((selfProfile as any)?.whatsapp || '');

      // Find my office by membership
      const { data: myMembership, error: memErr } = await sb
        .from('office_members')
        .select('office_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (memErr) {
        if (isOfficeMembersPolicyError(memErr.message || '')) {
          setPolicyBlocked(true);
          setOffice(null);
          setMembers([]);
          setLoading(false);
          return;
        }
        throw new Error(memErr.message);
      }
      const officeId = myMembership?.office_id as string | undefined;

      if (!officeId) {
        setOffice(null);
        setMembers([]);
        setLoading(false);
        return;
      }

      const [{ data: officeRow, error: oErr }, { data: ms, error: msErr }] = await Promise.all([
        sb.from('offices').select('id,name,created_at').eq('id', officeId).maybeSingle(),
        sb.from('office_members').select('id,office_id,user_id,role,created_at').eq('office_id', officeId).order('created_at', { ascending: true }),
      ]);

      if (oErr) throw new Error(oErr.message);
      if (msErr) {
        if (isOfficeMembersPolicyError(msErr.message || '')) {
          setPolicyBlocked(true);
          setOffice((officeRow || null) as Office | null);
          setMembers([]);
          setLoading(false);
          return;
        }
        throw new Error(msErr.message);
      }

      const members = (ms || []) as OfficeMemberRow[];
      const userIds = Array.from(new Set(members.map((m) => m.user_id).filter(Boolean)));

      // Avoid PostgREST relationship cache errors by fetching profiles separately.
      let profMap = new Map<string, any>();
      if (userIds.length) {
        const { data: profs } = await sb.from('user_profiles').select('user_id,email,display_name,phone,whatsapp').in('user_id', userIds).limit(1000);
        profMap = new Map((profs || []).map((p: any) => [p.user_id, p]));
      }

      setOffice((officeRow || null) as Office | null);
      const mappedMembers = members.map((m) => ({
        ...m,
        profile: m.user_id && profMap.get(m.user_id) ? profMap.get(m.user_id) : null,
      })) as OfficeMemberRow[];
      setMembers(mappedMembers);
      setMemberContacts(
        mappedMembers.reduce((acc, m) => {
          acc[m.user_id] = {
            phone: String(m.profile?.phone || ''),
            whatsapp: String(m.profile?.whatsapp || ''),
          };
          return acc;
        }, {} as Record<string, { phone: string; whatsapp: string }>),
      );
      setLoading(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e, String(e)));
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addMember() {
    // legacy/manual add (kept) — requires user to have logged in once
    if (!isAdmin) {
      setError('Apenas admin pode adicionar membros.');
      return;
    }
    const email = addEmail.trim().toLowerCase();
    if (!email) return;
    if (!office) return;

    setSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { data: prof, error: pErr } = await sb
        .from('user_profiles')
        .select('user_id,email')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();

      if (pErr) throw new Error(pErr.message);
      const userId = prof?.user_id as string | undefined;
      if (!userId) throw new Error('Usuário não encontrado.');

      const { error: iErr } = await sb.from('office_members').insert({ office_id: office.id, user_id: userId, role: addRole });
      if (iErr) throw new Error(iErr.message);

      setAddEmail('');
      setAddRole('member');
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function addMemberByUserId() {
    if (!isAdmin) {
      setError('Apenas admin pode adicionar membros.');
      return;
    }
    const userId = addUserId.trim();
    if (!office) return;
    if (!isUuid(userId)) {
      setError('Informe um user_id UUID válido.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { error: iErr } = await sb.from('office_members').insert({ office_id: office.id, user_id: userId, role: addRole });
      if (iErr && !String(iErr.message || '').toLowerCase().includes('duplicate')) throw new Error(iErr.message);

      setAddUserId('');
      setAddRole('member');
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function createInvite() {
    if (!isAdmin) {
      setError('Apenas admin pode criar convites.');
      return;
    }
    if (!office) return;

    setSaving(true);
    setError(null);

    try {
      await createOfficeInvite({ officeId: office.id, email: inviteEmail, role: inviteRole });
      setInviteEmail('');
      setInviteRole('member');
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function acceptInvite(inviteId: string) {
    setSaving(true);
    setError(null);

    try {
      await acceptOfficeInvite(inviteId);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function saveMyWhatsapp() {
    if (!meId) return;
    setSavingProfile(true);
    setError(null);
    setProfileNotice(null);
    try {
      const sb = requireSupabase();
      const normalizedWhatsapp = myWhatsapp.trim();
      const { data: updatedProfile, error: uErr } = await sb
        .from('user_profiles')
        .update({ whatsapp: normalizedWhatsapp || null })
        .eq('user_id', meId)
        .select('user_id')
        .maybeSingle();
      if (uErr) throw new Error(uErr.message);
      if (!updatedProfile) {
        throw new Error('Nao foi possivel atualizar seu WhatsApp. Verifique as permissoes RLS da tabela user_profiles.');
      }
      setProfileNotice({ type: 'ok', text: 'WhatsApp salvo com sucesso.' });
    } catch (e: unknown) {
      const message = getErrorMessage(e, String(e));
      setError(message);
      setProfileNotice({ type: 'err', text: message });
    } finally {
      setSavingProfile(false);
    }
  }

  // (revogar convite) será adicionado quando listarmos convites do escritório para admin

  async function setRole(memberId: string, role: string) {
    if (!isAdmin) {
      setError('Apenas admin pode alterar permissões.');
      return;
    }
    if (!office) return;

    setSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();
      const { error: uErr } = await sb.from('office_members').update({ role }).eq('id', memberId);
      if (uErr) throw new Error(uErr.message);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(memberId: string) {
    if (!isAdmin) {
      setError('Apenas admin pode remover membros.');
      return;
    }
    if (!office) return;
    if (!confirm('Remover este membro do escritório?')) return;

    setSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();
      const { error: dErr } = await sb.from('office_members').delete().eq('id', memberId);
      if (dErr) throw new Error(dErr.message);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveMemberContacts(userId: string) {
    if (!isAdmin) return;
    const draft = memberContacts[userId] || { phone: '', whatsapp: '' };

    setSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { error: upErr } = await sb.from('user_profiles').upsert(
        {
          user_id: userId,
          phone: draft.phone.trim() || null,
          whatsapp: draft.whatsapp.trim() || null,
        },
        { onConflict: 'user_id' },
      );
      if (upErr) throw new Error(upErr.message);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Configurações</h1>
        <p className="text-sm text-white/60">Escritório, membros e permissões.</p>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}
      {policyBlocked ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          A política RLS de <strong>office_members</strong> está com recursão infinita. A tela continua acessível,
          mas ações de membros/permissões ficam bloqueadas até ajustar as policies no Supabase.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-sm font-semibold text-white">Meu Perfil</div>
          <div className="mt-3 grid gap-3">
            <label className="text-sm text-white/80">
              WhatsApp (para notificações n8n)
              <input
                className="input"
                inputMode="tel"
                value={myWhatsapp}
                onChange={(e) => {
                  setMyWhatsapp(e.target.value);
                  setProfileNotice(null);
                }}
                placeholder="Ex: 5511999999999"
              />
            </label>
            <p className="text-xs text-white/50">Formato internacional sem espaços ou hífen. Usado pelo n8n para cobrança de tarefas.</p>
            {profileNotice ? (
              <div
                className={`rounded-xl border px-3 py-2 text-sm ${
                  profileNotice.type === 'ok'
                    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                    : 'border-red-400/30 bg-red-500/10 text-red-100'
                }`}
              >
                {profileNotice.text}
              </div>
            ) : null}
            <button
              className="btn-primary !text-sm"
              disabled={savingProfile}
              onClick={() => void saveMyWhatsapp()}
            >
              {savingProfile ? 'Salvando…' : 'Salvar WhatsApp'}
            </button>
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold text-white">Escritório</div>
          {loading ? <div className="mt-3 text-sm text-white/60">Carregando…</div> : null}

          {!loading && !office ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              Nenhum escritório vinculado ao seu usuário.
            </div>
          ) : null}

          {!loading && office ? (
            <div className="mt-3 grid gap-3">
              <Field label="Nome" value={office.name} />
              <Field label="Seu papel" value={roleLabel(myMember?.role || 'member')} />
              <Field label="Membros" value={String(members.length)} />
              
              {isAdmin ? (
                <div className="grid gap-2">
                  <Link className="block w-full rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm font-semibold text-white transition-colors hover:bg-white/10" to="/app/configuracoes/membros">
                    👥 Membros do Escritório (informações e configurações)
                  </Link>
                  <Link className="block w-full rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm font-semibold text-amber-200 transition-colors hover:bg-white/10" to="/app/configuracoes/auditoria">
                    🛡️ Auditoria e Logs
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="text-sm font-semibold text-white">Seus Convites</div>

          {invites.length ? (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
              <div className="text-sm font-semibold text-amber-100">Convites pendentes para você</div>
              <div className="mt-2 grid gap-2">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{inv.email}</div>
                      <div className="mt-1 text-xs text-white/60">Papel: {roleLabel(inv.role)}</div>
                    </div>
                    <button className="btn-primary !rounded-lg !px-3 !py-2 !text-xs" disabled={saving} onClick={() => void acceptInvite(inv.id)}>
                      Aceitar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {office && isAdmin && !policyBlocked ? (
            <div className="mt-4 grid gap-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">Criar convite (por e-mail)</div>
                <div className="mt-2 text-xs text-white/60">A pessoa precisa fazer login com esse e-mail para conseguir aceitar.</div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-white/80">
                    E-mail
                    <input
                      className="input"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@dominio.com"
                    />
                  </label>

                  <label className="text-sm text-white/80">
                    Papel
                    <select className="select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin' | 'finance' | 'staff')}>
                      <option value="member">Membro</option>
                      <option value="staff">Operacional</option>
                      <option value="finance">Financeiro</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={saving} onClick={() => void createInvite()}>
                    {saving ? 'Salvando…' : 'Criar convite'}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">Adicionar membro direto</div>
                <div className="mt-2 text-xs text-white/60">Você pode adicionar por e-mail (usuário já logado) ou por user_id UUID.</div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-white/80">
                    E-mail do usuário
                    <input className="input" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="email@dominio.com" />
                  </label>

                  <label className="text-sm text-white/80">
                    Papel
                    <select className="select" value={addRole} onChange={(e) => setAddRole(e.target.value as 'member' | 'admin' | 'finance' | 'staff')}>
                      <option value="member">Membro</option>
                      <option value="staff">Operacional</option>
                      <option value="finance">Financeiro</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-ghost" disabled={saving} onClick={() => void addMember()}>
                    {saving ? 'Salvando…' : 'Adicionar por e-mail'}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                  <label className="text-sm text-white/80">
                    User ID (UUID)
                    <input
                      className="input"
                      value={addUserId}
                      onChange={(e) => setAddUserId(e.target.value)}
                      placeholder="ex: c3dbb1b9-bd1f-4320-95ce-0df6a7e4f5f1"
                    />
                  </label>
                  <button className="btn-primary self-end" disabled={saving} onClick={() => void addMemberByUserId()}>
                    {saving ? 'Salvando…' : 'Adicionar por ID'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {office && !policyBlocked ? (
            <div className="mt-4 grid gap-2">
              {members.map((m) => {
                const draft = memberContacts[m.user_id] || { phone: '', whatsapp: '' };
                return (
                  <div key={m.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {m.profile?.display_name || m.profile?.email || m.user_id}
                          {m.user_id === meId ? <span className="badge badge-gold ml-2">você</span> : null}
                        </div>
                        <div className="mt-1 text-xs text-white/60">{m.profile?.email || '—'}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          className="select !mt-0 !w-[160px]"
                          disabled={!isAdmin || m.user_id === meId || saving}
                          value={m.role}
                          onChange={(e) => void setRole(m.id, e.target.value)}
                        >
                          <option value="member">Membro</option>
                          <option value="staff">Operacional</option>
                          <option value="finance">Financeiro</option>
                          <option value="admin">Admin</option>
                        </select>

                        <button
                          className="btn-ghost !rounded-lg !px-3 !py-2 !text-xs"
                          disabled={!isAdmin || m.user_id === meId || saving}
                          onClick={() => void removeMember(m.id)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                      <input
                        className="input !mt-0"
                        placeholder="Telefone"
                        value={draft.phone}
                        onChange={(e) =>
                          setMemberContacts((prev) => ({
                            ...prev,
                            [m.user_id]: { ...(prev[m.user_id] || { phone: '', whatsapp: '' }), phone: e.target.value },
                          }))
                        }
                        disabled={!isAdmin || saving}
                      />
                      <input
                        className="input !mt-0"
                        placeholder="WhatsApp (n8n)"
                        value={draft.whatsapp}
                        onChange={(e) =>
                          setMemberContacts((prev) => ({
                            ...prev,
                            [m.user_id]: { ...(prev[m.user_id] || { phone: '', whatsapp: '' }), whatsapp: e.target.value },
                          }))
                        }
                        disabled={!isAdmin || saving}
                      />
                      <button
                        className="btn-primary !text-xs"
                        disabled={!isAdmin || saving}
                        onClick={() => void saveMemberContacts(m.user_id)}
                      >
                        Salvar contato
                      </button>
                    </div>
                  </div>
                );
              })}

              {!loading && members.length === 0 ? <div className="text-sm text-white/60">Sem membros.</div> : null}
            </div>
          ) : null}

          {policyBlocked ? (
            <div className="mt-3 text-xs text-amber-100/90">
              Gestão de membros temporariamente indisponível por erro de policy RLS em <code>office_members</code>.
            </div>
          ) : null}

          {!office ? <div className="mt-3 text-xs text-white/60">Aceite um convite para entrar em um escritório.</div> : null}
        </Card>

        <Card>
          <div className="text-sm font-semibold text-white">Integração n8n</div>
          <div className="mt-3 grid gap-3">
            <p className="text-xs text-white/60 mb-2">Veja como conectar o n8n ao sistema, acessar endpoints e obter o secret de autenticação.</p>
            <Link className="btn-primary !text-sm" to="/app/configuracoes/n8n-docs">
              📄 Documentação de Integração n8n
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
