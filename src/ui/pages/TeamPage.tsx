import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { createOfficeInvite } from '@/lib/offices';
import { Card } from '@/ui/widgets/Card';
import { Activity, Briefcase, CheckCircle, Clock, Users } from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';

type Member = {
  id: string;
  user_id: string;
  role: string;
  email: string;
  full_name: string;
  oab_number?: string;
  oab_uf?: string;
  phone?: string;
  whatsapp?: string;
  created_at: string;
  stats?: {
    activeCases: number;
    tasksDone: number;
    tasksOverdue: number;
  };
};

type ProfileForm = {
  fullName: string;
  oabNumber: string;
  oabUf: string;
  phone: string;
  whatsapp: string;
};

const TEAM_ALLOWED_EMAIL_DOMAINS = String(import.meta.env.VITE_TEAM_ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function hasAllowedTeamDomain(email: string) {
  if (!TEAM_ALLOWED_EMAIL_DOMAINS.length) return true;
  const domain = email.split('@')[1]?.trim().toLowerCase() || '';
  return TEAM_ALLOWED_EMAIL_DOMAINS.includes(domain);
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['Acesso total', 'Financeiro', 'Excluir casos', 'Gerenciar equipe'],
  lawyer: ['Criar/Editar casos', 'Gerenciar tarefas', 'Ver clientes', 'Adicionar andamentos'],
  secretary: ['Ver agenda', 'Adicionar clientes básicos', 'Lançar tarefas simples'],
  finance: ['Ver financeiro', 'Gerar faturas', 'Aprovar pagamentos', 'Relatórios financeiros']
};

export function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('lawyer');
  const [inviting, setInviting] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    fullName: '',
    oabNumber: '',
    oabUf: '',
    phone: '',
    whatsapp: '',
  });

  useEffect(() => {
    loadTeam();
  }, []);

  useEffect(() => {
    if (!selectedMember) {
      setProfileForm({ fullName: '', oabNumber: '', oabUf: '', phone: '', whatsapp: '' });
      return;
    }

    setProfileForm({
      fullName: selectedMember.full_name || '',
      oabNumber: selectedMember.oab_number || '',
      oabUf: selectedMember.oab_uf || '',
      phone: selectedMember.phone || '',
      whatsapp: selectedMember.whatsapp || '',
    });
    setProfileFeedback(null);
  }, [selectedMember]);

  async function loadTeam() {
    try {
      setLoading(true);
      const sb = requireSupabase();
      const user = await getAuthedUser();

      // 1) Descobre o office do usuário atual
      const { data: myMembership, error: memErr } = await sb
        .from('office_members')
        .select('office_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (memErr) throw memErr;
      const officeId = myMembership?.office_id as string | undefined;
      if (!officeId) {
        setMembers([]);
        setLoading(false);
        return;
      }

      // 2) Carrega membros do office (sem fallback para outros offices)
      const { data, error } = await sb
        .from('office_members')
        .select('id, user_id, role, created_at')
        .eq('office_id', officeId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const userIds = (data || []).map((m: any) => m.user_id).filter(Boolean) as string[];
      if (!userIds.length) {
        setMembers([]);
        setLoading(false);
        return;
      }

      // 3) Carrega perfis; se faltar perfil, ainda exibimos o membro para permitir correção/cadastro
      const { data: profilesData } = await sb
        .from('user_profiles')
        .select('user_id, display_name, email, oab_number, oab_uf, phone, whatsapp')
        .in('user_id', userIds)
        .limit(1000);

      const profilesMap = new Map((profilesData || []).map((p: any) => [p.user_id, p]));

      // 4) Constrói membros sem filtrar placeholders/domínios: mostrar todos os vínculos do office
      const enriched: Member[] = (data || []).map((m: any) => {
        const p = profilesMap.get(m.user_id) || {};
        const email = String(p.email || '').trim().toLowerCase();
        const displayName = String(p.display_name || '').trim();

        return {
          ...m,
          email: email || '—',
          full_name: displayName || email || `Usuário ${String(m.user_id || '').slice(0, 8)}`,
          oab_number: p.oab_number || '',
          oab_uf: p.oab_uf || '',
          phone: p.phone || '',
          whatsapp: p.whatsapp || '',
          stats: { activeCases: 0, tasksDone: 0, tasksOverdue: 0 },
        } as Member;
      });

      setMembers(enriched);
      if (enriched.length > 0 && !selectedMember) {
        setSelectedMember(enriched[0]);
      } else if (selectedMember) {
        const updated = enriched.find((m) => m.id === selectedMember.id);
        if (updated) setSelectedMember(updated);
        else setSelectedMember(enriched[0] || null);
      }
    } catch (err) {
      console.error('Erro ao carregar equipe:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    const normalizedInviteEmail = inviteEmail.trim().toLowerCase();
    if (!hasAllowedTeamDomain(normalizedInviteEmail)) {
      const allowedText = TEAM_ALLOWED_EMAIL_DOMAINS.join(', ');
      setInviteError(`Use um e-mail do domínio permitido: ${allowedText}`);
      setInviteSuccess(null);
      return;
    }

    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();
      const { data: myMembership } = await sb
        .from('office_members')
        .select('office_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!myMembership?.office_id) throw new Error('Escritório não encontrado.');
      await createOfficeInvite({ officeId: myMembership.office_id as string, email: normalizedInviteEmail, role: inviteRole });
      setInviteSuccess(`Convite enviado para ${normalizedInviteEmail}`);
      setInviteEmail('');
    } catch (err: unknown) {
      setInviteError(getErrorMessage(err, 'Erro ao enviar convite.'));
    } finally {
      setInviting(false);
    }
  }

  async function updateRole(memberId: string, newRole: string) {
    const sb = requireSupabase();
    const { error } = await sb
      .from('office_members')
      .update({ role: newRole })
      .eq('id', memberId);

    if (error) {
      alert('Erro ao atualizar cargo: ' + error.message);
    } else {
      loadTeam();
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm('Tem certeza que deseja remover este membro da equipe? O acesso dele será revogado imediatamente.')) return;

    const sb = requireSupabase();
    const { error } = await sb
      .from('office_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      alert('Erro ao remover: ' + error.message);
    } else {
      loadTeam();
      setSelectedMember(null);
    }
  }

  async function updateProfile(userId: string, fullName: string, oabNumber: string, oabUf: string, phone: string, whatsapp: string) {
    try {
      setSavingProfile(true);
      setProfileFeedback(null);

      const sb = requireSupabase();
      const normalizedOabUf = oabUf.trim().toUpperCase();
      const { data: updatedProfile, error } = await sb
        .from('user_profiles')
        .upsert(
          {
            user_id: userId,
            display_name: fullName.trim() || null,
            oab_number: oabNumber.trim() || null,
            oab_uf: normalizedOabUf || null,
            phone: phone.trim() || null,
            whatsapp: whatsapp.trim() || null,
          },
          { onConflict: 'user_id' },
        )
        .select('user_id')
        .maybeSingle();

      if (error) throw error;
      if (!updatedProfile) {
        throw new Error('Nenhum perfil foi atualizado. Verifique as permissoes RLS da tabela user_profiles.');
      }

      setProfileFeedback({ type: 'ok', text: 'Perfil salvo com sucesso.' });
      await loadTeam();
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Erro ao atualizar perfil.');
      setProfileFeedback({ type: 'err', text: message });
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Gestão de Equipe & Desempenho</h1>
        <p className="text-sm text-white/60">Controle de acessos (RBAC) e produtividade dos colaboradores.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Coluna Esquerda: Lista e Convite */}
        <div className="xl:col-span-1 space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 font-semibold flex justify-between items-center">
              Membros Ativos
              <span className="badge bg-white/10 text-white/70">{members.length}</span>
            </div>
            {loading ? (
              <div className="p-6 text-center text-white/50">Carregando equipe...</div>
            ) : members.length === 0 ? (
              <div className="p-6 text-center text-white/50">Nenhum membro encontrado.</div>
            ) : (
              <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                {members.map((m) => (
                  <button 
                    key={m.id} 
                    onClick={() => setSelectedMember(m)}
                    className={`w-full text-left p-4 flex items-center justify-between transition-colors ${selectedMember?.id === m.id ? 'bg-amber-400/10 border-l-2 border-amber-400' : 'hover:bg-white/5'}`}
                  >
                    <div>
                      <div className="font-medium text-white">{m.full_name}</div>
                      <div className="text-xs text-white/50 font-mono mt-1">{m.role.toUpperCase()}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">Convidar Novo Membro</h3>
            <form onSubmit={handleInvite} className="space-y-3">
              <div>
                <input 
                  type="email" 
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400"
                  placeholder="E-mail (ex: advogado@castro.adv.br)"
                  required
                />
              </div>
              <div className="flex gap-2">
                <select 
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400"
                >
                  <option value="admin">Sócio / Admin</option>
                  <option value="lawyer">Advogado</option>
                  <option value="secretary">Secretaria</option>
                  <option value="finance">Financeiro</option>
                </select>
                <Button type="submit" disabled={inviting} className="shrink-0">
                  {inviting ? '...' : 'Convidar'}
                </Button>
              </div>
              {inviteError && (
                <p className="text-xs text-red-400 mt-1">{inviteError}</p>
              )}
              {inviteSuccess && (
                <p className="text-xs text-green-400 mt-1">{inviteSuccess}</p>
              )}
            </form>
          </Card>
        </div>

        {/* Coluna Direita: Dashboard do Membro Selecionado */}
        <div className="xl:col-span-2 space-y-4">
          {selectedMember ? (
            <>
              {/* Resumo do Membro */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
                  <div className="flex items-center gap-3 mb-2">
                    <Briefcase className="w-5 h-5 text-blue-400" />
                    <span className="text-sm font-semibold text-blue-100">Cargo</span>
                  </div>
                  <div className="text-base font-bold text-white capitalize">{selectedMember.role}</div>
                </Card>
                <Card className="p-4 bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-100">OAB</span>
                  </div>
                  <div className="text-base font-bold text-white">
                    {selectedMember.oab_number
                      ? `${selectedMember.oab_number}${selectedMember.oab_uf ? `/${selectedMember.oab_uf}` : ''}`
                      : '—'}
                  </div>
                </Card>
                <Card className="p-4 bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20">
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <span className="text-sm font-semibold text-amber-100">Membro desde</span>
                  </div>
                  <div className="text-base font-bold text-white">
                    {new Date(selectedMember.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                  </div>
                </Card>
              </div>

              {/* Matriz Visual de Permissões */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{selectedMember.full_name}</h3>
                    <p className="text-sm text-white/50">{selectedMember.email === '—' ? 'Sem e-mail cadastrado' : selectedMember.email}</p>
                    {selectedMember.phone && (
                      <p className="text-xs text-white/40 mt-0.5">Tel: {selectedMember.phone}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select 
                      value={selectedMember.role}
                      onChange={(e) => updateRole(selectedMember.id, e.target.value)}
                      className="bg-neutral-900 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-amber-400"
                    >
                      <option value="admin">Administrador</option>
                      <option value="lawyer">Advogado</option>
                      <option value="secretary">Secretária</option>
                      <option value="finance">Financeiro</option>
                    </select>
                    <button 
                      onClick={() => removeMember(selectedMember.id)}
                      className="text-red-400 border border-red-400/30 hover:bg-red-400/10 px-3 py-1.5 rounded-lg text-sm transition-colors"
                    >
                      Revogar Acesso
                    </button>
                  </div>
                </div>

                {['admin', 'lawyer'].includes(selectedMember.role) && (
                  <div className="mb-5 bg-blue-900/10 border border-blue-500/20 rounded-xl p-4">
                    <div className="text-sm font-semibold text-blue-200 mb-2">Integração PJe (Intimações Automáticas)</div>
                    <div className="flex flex-wrap gap-3 items-end">
                      <label className="text-xs text-white/60 flex-1 min-w-[120px]">
                        Número OAB
                        <input
                          className="input mt-1 !py-2 !text-sm"
                          placeholder="Ex: 12345"
                          value={profileForm.oabNumber}
                          onChange={(e) => {
                            setProfileForm((current) => ({ ...current, oabNumber: e.target.value }));
                            setProfileFeedback(null);
                          }}
                        />
                      </label>
                      <label className="text-xs text-white/60 w-24">
                        UF OAB
                        <input
                          className="input mt-1 !py-2 !text-sm uppercase"
                          placeholder="Ex: SP"
                          maxLength={2}
                          value={profileForm.oabUf}
                          onChange={(e) => {
                            setProfileForm((current) => ({ ...current, oabUf: e.target.value.toUpperCase() }));
                            setProfileFeedback(null);
                          }}
                        />
                      </label>
                    </div>
                    <p className="text-[10px] text-white/40 mt-2">Ao preencher, o sistema fará a varredura automática do Diário de Justiça Eletrônico Nacional vinculando as intimações ao perfil.</p>
                  </div>
                )}

                <div className="mb-5 bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="text-sm font-semibold text-white/80 mb-2">Dados de Contato (Para N8N / Automações)</div>
                  {profileFeedback ? (
                    <div
                      className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
                        profileFeedback.type === 'ok'
                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                          : 'border-red-400/30 bg-red-500/10 text-red-100'
                      }`}
                    >
                      {profileFeedback.text}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3 items-end">
                    <label className="text-xs text-white/60 flex-1 min-w-[180px]">
                      Nome completo
                      <input
                        className="input mt-1 !py-2 !text-sm"
                        placeholder="Ex: João da Silva"
                        value={profileForm.fullName}
                        onChange={(e) => {
                          setProfileForm((current) => ({ ...current, fullName: e.target.value }));
                          setProfileFeedback(null);
                        }}
                      />
                    </label>
                    <label className="text-xs text-white/60 flex-1 min-w-[140px]">
                      Telefone
                      <input
                        className="input mt-1 !py-2 !text-sm"
                        placeholder="Ex: 1132223333"
                        inputMode="tel"
                        value={profileForm.phone}
                        onChange={(e) => {
                          setProfileForm((current) => ({ ...current, phone: e.target.value }));
                          setProfileFeedback(null);
                        }}
                      />
                    </label>
                    <label className="text-xs text-white/60 flex-1 min-w-[160px]">
                      WhatsApp (notificações n8n)
                      <input
                        className="input mt-1 !py-2 !text-sm"
                        placeholder="Ex: 5511999999999"
                        inputMode="tel"
                        value={profileForm.whatsapp}
                        onChange={(e) => {
                          setProfileForm((current) => ({ ...current, whatsapp: e.target.value }));
                          setProfileFeedback(null);
                        }}
                      />
                    </label>
                    <button
                      onClick={() => void updateProfile(selectedMember.user_id, profileForm.fullName, profileForm.oabNumber, profileForm.oabUf, profileForm.phone, profileForm.whatsapp)}
                      disabled={savingProfile}
                      className="btn-primary !px-4 !py-2 !h-[38px] !text-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingProfile ? 'Salvando...' : 'Salvar Perfil'}
                    </button>
                  </div>
                </div>

                <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-semibold">O que este perfil pode fazer:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {ROLE_PERMISSIONS[selectedMember.role]?.map((perm, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-white/70">
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                        {perm}
                      </div>
                    ))}
                    {/* Exemplo visual de bloqueio para papéis não-admin */}
                    {selectedMember.role !== 'admin' && (
                      <div className="flex items-center gap-2 text-sm text-white/40 line-through">
                        <span className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center shrink-0 text-[8px]">x</span>
                        Acesso financeiro restrito
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl p-10 text-white/40">
              <Users className="w-12 h-12 mb-3 opacity-20" />
              <p>Selecione um membro ao lado para ver o desempenho e configurar permissões.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
