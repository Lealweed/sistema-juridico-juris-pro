import { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  LogOut,
  Phone,
  Save,
  User,
} from 'lucide-react';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';
import { getErrorMessage } from '@/lib/errors';

// ─── Tipos ─────────────────────────────────────────────────────────────────

type MemberProfile = {
  userId: string;
  email: string;
  displayName: string;
  phone: string;
  whatsapp: string;
  role: string;
};

// ─── Página principal ───────────────────────────────────────────────────────

export function MemberPortalPage() {
  // ── Estado de auth ──
  const [authed, setAuthed] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // ── Perfil ──
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // ── Formulário de edição ──
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formWhatsapp, setFormWhatsapp] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Verificar sessão ativa no load ──
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setAuthed(true);
        void loadProfile(data.session.user.id, data.session.user.email ?? '');
      }
    });
  }, []);

  // ── Sincroniza form quando perfil carrega ──
  useEffect(() => {
    if (!profile) return;
    setFormName(profile.displayName);
    setFormPhone(profile.phone);
    setFormWhatsapp(profile.whatsapp);
  }, [profile]);

  // ─── Funções ──────────────────────────────────────────────────────────────

  async function loadProfile(userId: string, email: string) {
    if (!supabase) return;
    setLoadingProfile(true);
    try {
      // Perfil
      const { data: p } = await supabase
        .from('user_profiles')
        .select('display_name, phone, whatsapp')
        .eq('user_id', userId)
        .maybeSingle();

      // Cargo no escritório (primeiro membership)
      const { data: m } = await supabase
        .from('office_members')
        .select('role')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      setProfile({
        userId,
        email,
        displayName: p?.display_name || email.split('@')[0],
        phone: p?.phone || '',
        whatsapp: p?.whatsapp || '',
        role: m?.role || 'member',
      });
    } finally {
      setLoadingProfile(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput.trim(),
        password: passwordInput,
      });
      if (error) throw new Error(error.message);
      if (!data.user) throw new Error('Usuário não encontrado.');
      setAuthed(true);
      await loadProfile(data.user.id, data.user.email ?? '');
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, 'E-mail ou senha inválidos.'));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthed(false);
    setProfile(null);
    setEmailInput('');
    setPasswordInput('');
    setFeedback(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !profile) return;
    setSaving(true);
    setFeedback(null);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: formName.trim() || null,
          phone: formPhone.trim() || null,
          whatsapp: formWhatsapp.trim() || null,
        })
        .eq('user_id', profile.userId);

      if (error) throw error;

      setProfile((prev) =>
        prev
          ? { ...prev, displayName: formName.trim(), phone: formPhone.trim(), whatsapp: formWhatsapp.trim() }
          : prev
      );
      setFeedback({ ok: true, text: 'Dados salvos com sucesso!' });
    } catch (err: unknown) {
      setFeedback({ ok: false, text: getErrorMessage(err, 'Erro ao salvar.') });
    } finally {
      setSaving(false);
    }
  }

  const ROLE_LABEL: Record<string, string> = {
    admin: 'Administrador',
    lawyer: 'Advogado(a)',
    secretary: 'Secretaria',
    finance: 'Financeiro',
    member: 'Membro',
  };

  // ─── Env check ───────────────────────────────────────────────────────────

  if (!hasSupabaseEnv || !supabase) {
    return (
      <div className="min-h-screen bg-[#08090b] flex flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-xl font-semibold text-white">Portal Indisponível</h1>
        <p className="text-sm text-white/50 text-center max-w-sm">
          Configuração de ambiente não encontrada.
        </p>
      </div>
    );
  }

  // ─── Tela de Login ───────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#08090b] flex flex-col items-center px-4 py-10">
        <img
          src="/brand/logo.jpg"
          alt="Logo"
          className="h-16 w-auto rounded-xl shadow-lg"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />

        <div className="mt-8 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h1 className="text-xl font-semibold text-white">Portal da Equipe</h1>
          <p className="mt-1 text-sm text-white/50">
            Entre com seu e-mail e senha para acessar e atualizar seus dados.
          </p>

          <form className="mt-5 grid gap-3" onSubmit={handleLogin}>
            <label className="text-sm text-white/80">
              E-mail
              <input
                className="input mt-1"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="voce@escritorio.com.br"
                autoFocus
                required
              />
            </label>

            <label className="text-sm text-white/80">
              Senha
              <div className="relative mt-1">
                <input
                  className="input w-full pr-10"
                  type={showPwd ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Sua senha"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-white/40 hover:text-white/80"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {authError && (
              <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                {authError}
              </div>
            )}

            <button className="btn-primary mt-1" type="submit" disabled={authLoading}>
              {authLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-xs text-white/30">
          Este portal é exclusivo para membros da equipe do escritório.
        </p>
      </div>
    );
  }

  // ─── Tela Autenticada ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0c10] via-[#10131a] to-[#181c24] flex flex-col items-center px-4 py-10">
      {/* Cabeçalho */}
      <div className="w-full max-w-xl flex items-center justify-between mb-8">
        <img
          src="/brand/logo.jpg"
          alt="Logo"
          className="h-14 w-auto rounded-xl border border-white/10 shadow-xl"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-4" />
          Sair
        </button>
      </div>

      {/* Card do membro */}
      {loadingProfile ? (
        <div className="text-white/50 text-sm mt-10">Carregando perfil...</div>
      ) : profile ? (
        <div className="w-full max-w-xl space-y-4">
          {/* Identificação */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex items-center gap-4">
            <div className="size-14 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
              <User className="size-7 text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white leading-tight">{profile.displayName}</p>
              <p className="text-sm text-white/50">{profile.email}</p>
              <span className="mt-1 inline-block rounded-full bg-amber-400/10 border border-amber-400/20 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                {ROLE_LABEL[profile.role] ?? profile.role}
              </span>
            </div>
          </div>

          {/* Formulário de edição */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-base font-semibold text-white mb-1">Meus Dados</h2>
            <p className="text-xs text-white/40 mb-4">
              Mantenha seu nome e telefone atualizados para as automações do escritório.
            </p>

            <form onSubmit={handleSave} className="grid gap-4">
              {/* Nome */}
              <label className="text-sm text-white/70">
                Nome completo
                <input
                  className="input mt-1"
                  type="text"
                  value={formName}
                  onChange={(e) => { setFormName(e.target.value); setFeedback(null); }}
                  placeholder="Dr. João da Silva"
                />
              </label>

              {/* Telefone */}
              <label className="text-sm text-white/70">
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 text-white/40" /> Telefone
                </span>
                <input
                  className="input mt-1"
                  type="tel"
                  inputMode="numeric"
                  value={formPhone}
                  onChange={(e) => { setFormPhone(e.target.value); setFeedback(null); }}
                  placeholder="Ex: 1132223333"
                />
              </label>

              {/* WhatsApp */}
              <label className="text-sm text-white/70">
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 text-green-400" /> WhatsApp (notificações)
                </span>
                <input
                  className="input mt-1"
                  type="tel"
                  inputMode="numeric"
                  value={formWhatsapp}
                  onChange={(e) => { setFormWhatsapp(e.target.value); setFeedback(null); }}
                  placeholder="Ex: 5511999999999"
                />
              </label>

              {/* Feedback */}
              {feedback && (
                <div
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    feedback.ok
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-red-400/30 bg-red-500/10 text-red-200'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Save className="size-4" />
                {saving ? 'Salvando...' : 'Salvar dados'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="text-white/50 text-sm mt-10">Nenhum perfil encontrado para este usuário.</div>
      )}
    </div>
  );
}
