import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { ClientAvatar } from '@/ui/widgets/ClientAvatar';
import { formatCpf, isValidCpf, onlyDigits } from '@/lib/cpf';
import { formatCnpj, isValidCnpj } from '@/lib/cnpj';
import { formatBrPhone } from '@/lib/phone';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

type ClientRow = {
  id: string;
  name: string;
  person_type: 'pf' | 'pj' | null;
  cpf: string | null;
  cnpj: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  avatar_path: string | null;
  user_id: string | null;
  created_at: string;
};

export function ClientsPage() {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);

  // form
  const [personType, setPersonType] = useState<'pf' | 'pj'>('pf');
  const [newName, setNewName] = useState('');
  const [newCpf, setNewCpf] = useState('');
  const [newCnpj, setNewCnpj] = useState('');
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newSourceChannel, setNewSourceChannel] = useState<'advogado' | 'recepcao' | 'web' | 'indicacao' | 'outro'>('recepcao');

  const [govLoginHint, setGovLoginHint] = useState('');
  const [govNotes, setGovNotes] = useState('');

  // address
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [stateUf, setStateUf] = useState('');

  // avatar
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 25;

  const filtered = useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter(c => 
        c.name.toLowerCase().includes(needle) || 
        (c.cpf && c.cpf.includes(needle)) ||
        (c.cnpj && c.cnpj.includes(needle)) ||
        (c.whatsapp && c.whatsapp.includes(needle))
      );
    }
    return out;
  }, [rows, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));

  const ordered = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { data, error: qErr } = await sb
        .from('clients')
        .select('id,name,person_type,cpf,cnpj,whatsapp,phone,email,avatar_path,user_id,created_at')
        .order('created_at', { ascending: false });

      if (qErr) throw new Error(qErr.message);
      setRows((data || []) as ClientRow[]);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar clientes.');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setPersonType('pf');
    setNewName('');
    setNewCpf('');
    setNewCnpj('');
    setNewWhatsapp('');
    setNewEmail('');
    setNewPhone('');
    setNewNotes('');
    setNewSourceChannel('recepcao');
    setGovLoginHint('');
    setGovNotes('');

    setCep('');
    setStreet('');
    setNumber('');
    setComplement('');
    setNeighborhood('');
    setCity('');
    setStateUf('');

    setAvatarFile(null);
    setAvatarPreview(null);
  }

  async function onCreate() {
    if (!newName.trim()) return;

    if (!newWhatsapp.trim()) {
      setError('WhatsApp é obrigatório.');
      return;
    }

    if (personType === 'pf') {
      if (!newCpf.trim()) {
        setError('CPF é obrigatório.');
        return;
      }
      if (!isValidCpf(newCpf)) {
        setError('CPF inválido.');
        return;
      }
    } else {
      if (!newCnpj.trim()) {
        setError('CNPJ é obrigatório.');
        return;
      }
      if (!isValidCnpj(newCnpj)) {
        setError('CNPJ inválido.');
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();

      const sourceTag = `[#origem:${newSourceChannel}]`;

      const payload: any = {
        user_id: user.id,
        person_type: personType,
        name: newName.trim(),
        whatsapp: onlyDigits(newWhatsapp),
        email: newEmail.trim() || null,
        phone: onlyDigits(newPhone) || null,
        notes: `${sourceTag} ${newNotes.trim()}`.trim(),
        gov_login_hint: govLoginHint.trim() || null,
        gov_notes: govNotes.trim() || null,
        address_cep: onlyDigits(cep) || null,
        address_street: street.trim() || null,
        address_number: number.trim() || null,
        address_complement: complement.trim() || null,
        address_neighborhood: neighborhood.trim() || null,
        address_city: city.trim() || null,
        address_state: stateUf.trim() || null,
      };

      if (personType === 'pf') {
        payload.cpf = onlyDigits(newCpf);
        payload.cnpj = null;
      } else {
        payload.cnpj = onlyDigits(newCnpj);
        payload.cpf = null;
      }

      const { data: created, error: iErr } = await sb.from('clients').insert(payload).select('id,office_id').single();
      if (iErr) throw new Error(iErr.message);

      // Optional avatar upload
      if (avatarFile && created?.id && created?.office_id) {
        const ext = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `office/${created.office_id}/client/${created.id}/avatar.${ext}`;

        const up = await sb.storage
          .from('client_avatars')
          .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type || undefined } as any);
        if (up.error) throw new Error(up.error.message);

        const { error: uErr } = await sb
          .from('clients')
          .update({ avatar_path: path, avatar_updated_at: new Date().toISOString() } as any)
          .eq('id', created.id);
        if (uErr) throw new Error(uErr.message);
      }

      setCreateOpen(false);
      resetForm();
      setSaving(false);
      await load();
    } catch (err: any) {
      const msg = err?.message || 'Falha ao criar cliente.';
      // Friendly duplicate doc message
      if (String(msg).includes('clients_office_cpf_uniq')) setError('Este CPF já está cadastrado.');
      else if (String(msg).includes('clients_office_cnpj_uniq')) setError('Este CNPJ já está cadastrado.');
      else setError(msg);
      setSaving(false);
    }
  }

  function docLabel(c: ClientRow) {
    if (c.person_type === 'pj') return `CNPJ: ${c.cnpj || '—'}`;
    if (c.person_type === 'pf') return `CPF: ${c.cpf || '—'}`;
    return `Doc: ${c.cpf || c.cnpj || '—'}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Clientes</h1>
          <p className="text-sm text-white/60">Base real (Supabase).</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          Novo cliente
        </button>
      </div>

      {createOpen ? (
        <Card>
          <div className="grid gap-4">
            <div className="text-sm font-semibold text-white">Novo cliente</div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-white/80">
                Tipo
                <select className="input" value={personType} onChange={(e) => setPersonType(e.target.value as any)}>
                  <option value="pf">Pessoa Física (CPF)</option>
                  <option value="pj">Pessoa Jurídica (CNPJ)</option>
                </select>
              </label>

              <label className="text-sm text-white/80">
                Nome / Razão Social
                <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </label>

              {personType === 'pf' ? (
                <label className="text-sm text-white/80">
                  CPF <span className="text-red-200">*</span>
                  <input
                    className="input"
                    value={newCpf}
                    onChange={(e) => setNewCpf(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                </label>
              ) : (
                <label className="text-sm text-white/80">
                  CNPJ <span className="text-red-200">*</span>
                  <input
                    className="input"
                    value={newCnpj}
                    onChange={(e) => setNewCnpj(formatCnpj(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                  />
                </label>
              )}

              <label className="text-sm text-white/80">
                WhatsApp <span className="text-red-200">*</span>
                <input
                  className="input"
                  value={newWhatsapp}
                  onChange={(e) => setNewWhatsapp(formatBrPhone(e.target.value))}
                  placeholder="(00) 90000-0000"
                  inputMode="tel"
                />
              </label>

              <label className="text-sm text-white/80">
                E-mail
                <input className="input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </label>

              <label className="text-sm text-white/80">
                Telefone (opcional)
                <input
                  className="input"
                  value={newPhone}
                  onChange={(e) => setNewPhone(formatBrPhone(e.target.value))}
                  placeholder="(00) 0000-0000"
                  inputMode="tel"
                />
              </label>

              <div className="text-sm text-white/80">
                Foto (opcional)
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-11 w-11 overflow-hidden rounded-full border border-white/10 bg-white/5">
                    {avatarPreview ? <img src={avatarPreview} className="h-full w-full object-cover" /> : null}
                  </div>
                  <label className="btn-ghost !rounded-lg !px-3 !py-2 !text-xs">
                    {avatarFile ? 'Trocar foto' : 'Adicionar foto'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setAvatarFile(f);
                        setAvatarPreview(f ? URL.createObjectURL(f) : null);
                      }}
                    />
                  </label>
                  {avatarFile ? (
                    <button
                      type="button"
                      className="btn-ghost !rounded-lg !px-3 !py-2 !text-xs"
                      onClick={() => {
                        setAvatarFile(null);
                        setAvatarPreview(null);
                      }}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              </div>

              <label className="text-sm text-white/80">
                Origem do cadastro
                <select className="input" value={newSourceChannel} onChange={(e) => setNewSourceChannel(e.target.value as any)}>
                  <option value="advogado">Advogado</option>
                  <option value="recepcao">Recepção</option>
                  <option value="web">Web</option>
                  <option value="indicacao">Indicação</option>
                  <option value="outro">Outro</option>
                </select>
              </label>

              <label className="text-sm text-white/80 md:col-span-2">
                Observações
                <textarea className="input min-h-[84px]" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
              </label>

              <div className="md:col-span-2">
                <div className="text-sm font-semibold text-white">Endereço (opcional)</div>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-white/80">
                    CEP
                    <input className="input" value={cep} onChange={(e) => setCep(e.target.value)} inputMode="numeric" />
                  </label>
                  <label className="text-sm text-white/80">
                    Rua
                    <input className="input" value={street} onChange={(e) => setStreet(e.target.value)} />
                  </label>
                  <label className="text-sm text-white/80">
                    Número
                    <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} />
                  </label>
                  <label className="text-sm text-white/80">
                    Complemento
                    <input className="input" value={complement} onChange={(e) => setComplement(e.target.value)} />
                  </label>
                  <label className="text-sm text-white/80">
                    Bairro
                    <input className="input" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
                  </label>
                  <label className="text-sm text-white/80">
                    Cidade
                    <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
                  </label>
                  <label className="text-sm text-white/80">
                    UF
                    <input className="input" value={stateUf} onChange={(e) => setStateUf(e.target.value.toUpperCase().slice(0, 2))} />
                  </label>
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm font-semibold text-white">Gov.br (sem senha)</div>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-white/80">
                    Dica de login (ex.: e-mail/telefone)
                    <input className="input" value={govLoginHint} onChange={(e) => setGovLoginHint(e.target.value)} />
                  </label>
                  <label className="text-sm text-white/80 md:col-span-2">
                    Observações de acesso/recuperação
                    <textarea className="input min-h-[84px]" value={govNotes} onChange={(e) => setGovNotes(e.target.value)} />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button disabled={saving} onClick={onCreate} className="btn-primary">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                disabled={saving}
                onClick={() => {
                  setCreateOpen(false);
                  resetForm();
                }}
                className="btn-ghost"
              >
                Cancelar
              </button>
            </div>

            {error ? <div className="text-sm text-red-200">{error}</div> : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="w-full sm:w-72">
            <input
              className="input !mt-0 !py-2 !text-sm"
              placeholder="Buscar por nome, CPF/CNPJ ou WhatsApp..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="text-xs text-white/50">
            {filtered.length} cliente{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}
        {error && !createOpen ? <div className="text-sm text-red-200">{error}</div> : null}

        {!loading && !error ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-white/50">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Contato</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((c) => (
                    <tr key={c.id} className="border-t border-white/10">
                      <td className="px-4 py-3 font-medium text-white">
                        <div className="flex items-center gap-3">
                          <ClientAvatar name={c.name} avatarPath={c.avatar_path} size={36} />
                          <div>
                            <div>{c.name}</div>
                            <div className="text-xs text-white/50">{docLabel(c)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        <div className="grid gap-0.5">
                          <div>WhatsApp: {c.whatsapp || '—'}</div>
                          <div className="text-xs text-white/50">{c.email || '—'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs" to={`/app/clientes/${c.id}`}>
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}

                  {ordered.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-white/60" colSpan={3}>
                        Nenhum cliente cadastrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:hidden">
              {ordered.map((c) => (
                <Link
                  key={c.id}
                  to={`/app/clientes/${c.id}`}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
                >
                  <div className="flex items-start gap-3">
                    <ClientAvatar name={c.name} avatarPath={c.avatar_path} size={44} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{c.name}</div>
                      <div className="mt-1 text-xs text-white/50">{docLabel(c)}</div>
                      <div className="mt-2 text-xs text-white/60">
                        <div>WhatsApp: {c.whatsapp || '—'}</div>
                        <div className="mt-0.5 text-white/50">{c.email || '—'}</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-amber-200">Abrir →</div>
                </Link>
              ))}

              {ordered.length === 0 ? <div className="text-sm text-white/60">Nenhum cliente encontrado.</div> : null}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="btn-ghost !px-3 !py-1.5 !text-xs disabled:opacity-30"
                >
                  Anterior
                </button>
                <div className="text-xs text-white/50">
                  Página {page} de {totalPages}
                </div>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="btn-ghost !px-3 !py-1.5 !text-xs disabled:opacity-30"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        ) : null}
      </Card>
    </div>
  );
}
