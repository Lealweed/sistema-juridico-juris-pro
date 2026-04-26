import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchAddressByCep, fetchCompanyByCnpj } from '@/lib/brasilApi';
import { Card } from '@/ui/widgets/Card';
import { ClientAvatar } from '@/ui/widgets/ClientAvatar';
import { formatCpf, isValidCpf, onlyDigits } from '@/lib/cpf';
import { formatCnpj, isValidCnpj } from '@/lib/cnpj';
import { formatBrPhone } from '@/lib/phone';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { getErrorMessage } from '@/lib/errors';

/** user_id reservado para leads captados automaticamente (site/n8n/webhook) */
const LEAD_BOT_ID = '00000000-0000-0000-0000-000000000000';

type ClientRow = {
  id: string;
  name: string;
  person_type: 'pf' | 'pj' | null;
  birth_date: string | null;
  cpf: string | null;
  cnpj: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  avatar_path: string | null;
  user_id: string | null;
  created_at: string;
};

function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

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

  // new personal fields
  const [newRg, setNewRg] = useState('');
  const [newBirthDate, setNewBirthDate] = useState('');
  const [newCivilStatus, setNewCivilStatus] = useState('');
  const [newProfession, setNewProfession] = useState('');
  const [newNationality, setNewNationality] = useState('');

  // Portal PIN
  const [newPortalPin, setNewPortalPin] = useState('');

  // legal representative
  const [hasRepresentative, setHasRepresentative] = useState(false);
  const [repName, setRepName] = useState('');
  const [repCpf, setRepCpf] = useState('');
  const [repRg, setRepRg] = useState('');

  // address
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [stateUf, setStateUf] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [addressLookupLoading, setAddressLookupLoading] = useState(false);
  const [companyLookupLoading, setCompanyLookupLoading] = useState(false);
  const [lastCepLookup, setLastCepLookup] = useState('');
  const [lastCnpjLookup, setLastCnpjLookup] = useState('');

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

      // Filtro primário: contact_type='client' (schema atualizado)
      let { data, error: qErr } = await sb
        .from('clients')
        .select('id,name,person_type,birth_date,cpf,cnpj,whatsapp,phone,email,avatar_path,user_id,created_at')
        .eq('contact_type', 'client')
        .order('created_at', { ascending: false });

      // Fallback: migração pendente — usa heurística legacy por user_id
      if (qErr?.message?.includes('contact_type')) {
        console.debug('[Clientes] contact_type não encontrado, usando filtro legacy por user_id.');
        const fallback = await sb
          .from('clients')
          .select('id,name,person_type,birth_date,cpf,cnpj,whatsapp,phone,email,avatar_path,user_id,created_at')
          .neq('user_id', LEAD_BOT_ID)
          .not('user_id', 'is', null)
          .order('created_at', { ascending: false });
        data = fallback.data;
        qErr = fallback.error;
      }

      if (qErr) throw new Error(qErr.message);
      setRows((data || []) as ClientRow[]);
      setLoading(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao carregar clientes.'));
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

    setNewRg('');
    setNewBirthDate('');
    setNewCivilStatus('');
    setNewProfession('');
    setNewNationality('');
    setHasRepresentative(false);
    setRepName('');
    setRepCpf('');
    setRepRg('');

    setCep('');
    setStreet('');
    setNumber('');
    setComplement('');
    setNeighborhood('');
    setCity('');
    setStateUf('');
    setLookupError(null);
    setAddressLookupLoading(false);
    setCompanyLookupLoading(false);
    setLastCepLookup('');
    setLastCnpjLookup('');

    setAvatarFile(null);
    setAvatarPreview(null);

    setNewPortalPin('');
  }

  useEffect(() => {
    if (!createOpen) return;

    const cepDigits = onlyDigits(cep);
    if (cepDigits.length !== 8 || cepDigits === lastCepLookup) return;

    let active = true;
    setAddressLookupLoading(true);
    setLookupError(null);

    fetchAddressByCep(cepDigits)
      .then((address) => {
        if (!active) return;
        setStreet(address.logradouro || '');
        setNeighborhood(address.bairro || '');
        setCity(address.localidade || '');
        setStateUf((address.uf || '').toUpperCase());
        setLastCepLookup(cepDigits);
      })
      .catch((err) => {
        if (!active) return;
        setLookupError(err instanceof Error ? getErrorMessage(err, 'Erro') : 'Falha ao consultar CEP.');
      })
      .finally(() => {
        if (!active) return;
        setAddressLookupLoading(false);
      });

    return () => {
      active = false;
    };
  }, [cep, createOpen, lastCepLookup]);

  useEffect(() => {
    if (!createOpen || personType !== 'pj') return;

    const cnpjDigits = onlyDigits(newCnpj);
    if (cnpjDigits.length !== 14 || cnpjDigits === lastCnpjLookup) return;

    let active = true;
    setCompanyLookupLoading(true);
    setLookupError(null);

    fetchCompanyByCnpj(cnpjDigits)
      .then(async (company) => {
        if (!active) return;

        const resolvedName = company.razao_social || company.nome_fantasia || '';
        if (resolvedName) setNewName(resolvedName);

        const companyCepDigits = onlyDigits(company.cep || '');
        if (companyCepDigits) {
          setCep(formatCep(companyCepDigits));
          setLastCepLookup(companyCepDigits);
        }

        setStreet(company.logradouro || '');
        setNumber(company.numero || '');
        setNeighborhood(company.bairro || '');
        setCity(company.municipio || '');
        setStateUf((company.uf || '').toUpperCase());
        setLastCnpjLookup(cnpjDigits);

        if (companyCepDigits.length === 8) {
          try {
            const address = await fetchAddressByCep(companyCepDigits);
            if (!active) return;
            setStreet(address.logradouro || company.logradouro || '');
            setNeighborhood(address.bairro || company.bairro || '');
            setCity(address.localidade || company.municipio || '');
            setStateUf((address.uf || company.uf || '').toUpperCase());
          } catch {
            if (!active) return;
            setLastCepLookup('');
          }
        }
      })
      .catch((err) => {
        if (!active) return;
        setLookupError(err instanceof Error ? getErrorMessage(err, 'Erro') : 'Falha ao consultar CNPJ.');
      })
      .finally(() => {
        if (!active) return;
        setCompanyLookupLoading(false);
      });

    return () => {
      active = false;
    };
  }, [createOpen, lastCnpjLookup, newCnpj, personType]);

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

      // Build extra notes
      const extraLines: string[] = [];
      if (newRg.trim()) extraLines.push(`RG: ${newRg.trim()}`);
      if (newCivilStatus.trim()) extraLines.push(`Est. Civil: ${newCivilStatus.trim()}`);
      if (newProfession.trim()) extraLines.push(`Profissão: ${newProfession.trim()}`);
      if (newNationality.trim()) extraLines.push(`Nacionalidade: ${newNationality.trim()}`);
      if (hasRepresentative) {
        const repLine = ['Representante:', repName.trim(), repCpf.trim() ? `CPF: ${repCpf.trim()}` : '', repRg.trim() ? `RG: ${repRg.trim()}` : '']
          .filter(Boolean).join(' ');
        extraLines.push(repLine);
      }
      const extraBlock = extraLines.length ? `\n${extraLines.join('\n')}` : '';

      const payload: any = {
        contact_type: 'client',
        user_id: user.id,
        person_type: personType,
        name: newName.trim(),
        whatsapp: onlyDigits(newWhatsapp),
        email: newEmail.trim() || null,
        phone: onlyDigits(newPhone) || null,
        birth_date: newBirthDate || null,
        notes: `${sourceTag}${extraBlock} ${newNotes.trim()}`.trim(),
        gov_login_hint: govLoginHint.trim() || null,
        gov_notes: govNotes.trim() || null,
        address_cep: onlyDigits(cep) || null,
        address_street: street.trim() || null,
        address_number: number.trim() || null,
        address_complement: complement.trim() || null,
        address_neighborhood: neighborhood.trim() || null,
        address_city: city.trim() || null,
        address_state: stateUf.trim() || null,
        portal_pin: newPortalPin.trim() || null,
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
          .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type || undefined });
        if (up.error) throw new Error(up.error.message);

        const { error: uErr } = await sb
          .from('clients')
          .update({ avatar_path: path, avatar_updated_at: new Date().toISOString() })
          .eq('id', created.id);
        if (uErr) throw new Error(uErr.message);
      }

      setCreateOpen(false);
      resetForm();
      setSaving(false);
      await load();
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Falha ao criar cliente.');
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
          <p className="text-sm text-white/60">Clientes confirmados — cadastros realizados pelo escritório.</p>
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
                            <label className="text-sm text-white/80 md:col-span-2">
                              Senha do Portal (PIN)
                              <input
                                className="input"
                                value={newPortalPin}
                                onChange={(e) => setNewPortalPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="PIN numérico (até 6 dígitos)"
                                inputMode="numeric"
                                maxLength={6}
                              />
                              <span className="text-xs text-white/50">Defina uma senha numérica para o acesso do cliente ao portal digital.</span>
                            </label>
              <label className="text-sm text-white/80">
                Tipo
                <select className="input" value={personType} onChange={(e) => setPersonType(e.target.value as 'pf' | 'pj')}>
                  <option value="pf">Pessoa Física (CPF)</option>
                  <option value="pj">Pessoa Jurídica (CNPJ)</option>
                </select>
              </label>

              <label className="text-sm text-white/80">
                Nome / Razão Social
                <input
                  className="input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={companyLookupLoading}
                />
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
                    disabled={companyLookupLoading}
                    value={newCnpj}
                    onChange={(e) => {
                      setLookupError(null);
                      setLastCnpjLookup('');
                      setNewCnpj(formatCnpj(e.target.value));
                    }}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                  />
                  <div className="mt-1 text-xs text-white/50">
                    {companyLookupLoading ? 'Buscando CNPJ...' : 'Ao completar 14 dígitos, a razão social e o endereço serão preenchidos.'}
                  </div>
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
                <select className="input" value={newSourceChannel} onChange={(e) => setNewSourceChannel(e.target.value as 'advogado' | 'recepcao' | 'web' | 'indicacao' | 'outro')}>
                  <option value="advogado">Advogado</option>
                  <option value="recepcao">Recepção</option>
                  <option value="web">Web</option>
                  <option value="indicacao">Indicação</option>
                  <option value="outro">Outro</option>
                </select>
              </label>

              {personType === 'pf' ? (
                <>
                  <label className="text-sm text-white/80">
                    RG
                    <input className="input" value={newRg} onChange={(e) => setNewRg(e.target.value)} />
                  </label>
                  <label className="text-sm text-white/80">
                    Data de Nascimento
                    <input type="date" className="input" value={newBirthDate} onChange={(e) => setNewBirthDate(e.target.value)} />
                  </label>
                  <label className="text-sm text-white/80">
                    Estado Civil
                    <select className="input" value={newCivilStatus} onChange={(e) => setNewCivilStatus(e.target.value)}>
                      <option value="">—</option>
                      <option value="Solteiro(a)">Solteiro(a)</option>
                      <option value="Casado(a)">Casado(a)</option>
                      <option value="Divorciado(a)">Divorciado(a)</option>
                      <option value="Viúvo(a)">Viúvo(a)</option>
                      <option value="União Estável">União Estável</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </label>
                  <label className="text-sm text-white/80">
                    Profissão
                    <input className="input" value={newProfession} onChange={(e) => setNewProfession(e.target.value)} />
                  </label>
                  <label className="text-sm text-white/80">
                    Nacionalidade
                    <input className="input" value={newNationality} onChange={(e) => setNewNationality(e.target.value)} placeholder="Ex.: Brasileira" />
                  </label>

                  <label className="md:col-span-2 flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={hasRepresentative}
                      onChange={(e) => setHasRepresentative(e.target.checked)}
                    />
                    Possui Representante Legal
                  </label>

                  {hasRepresentative ? (
                    <>
                      <label className="text-sm text-white/80">
                        Nome do Representante
                        <input className="input" value={repName} onChange={(e) => setRepName(e.target.value)} />
                      </label>
                      <label className="text-sm text-white/80">
                        CPF do Representante
                        <input className="input" value={repCpf} onChange={(e) => setRepCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
                      </label>
                      <label className="text-sm text-white/80">
                        RG do Representante
                        <input className="input" value={repRg} onChange={(e) => setRepRg(e.target.value)} />
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}

              <label className="text-sm text-white/80 md:col-span-2">
                Observações
                <textarea className="input min-h-[84px]" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
              </label>

              <div className="md:col-span-2">
                <div className="text-sm font-semibold text-white">Endereço (opcional)</div>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-white/80">
                    CEP
                    <input
                      className="input"
                      value={cep}
                      onChange={(e) => {
                        setLookupError(null);
                        setLastCepLookup('');
                        setCep(formatCep(e.target.value));
                      }}
                      inputMode="numeric"
                      disabled={addressLookupLoading}
                    />
                    <div className="mt-1 text-xs text-white/50">
                      {addressLookupLoading ? 'Buscando CEP...' : 'Ao completar 8 dígitos, rua, bairro, cidade e UF serão preenchidos.'}
                    </div>
                  </label>
                  <label className="text-sm text-white/80">
                    Rua
                    <input
                      className="input"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      disabled={addressLookupLoading || companyLookupLoading}
                    />
                  </label>
                  <label className="text-sm text-white/80">
                    Número
                    <input
                      className="input"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      disabled={companyLookupLoading}
                    />
                  </label>
                  <label className="text-sm text-white/80">
                    Complemento
                    <input className="input" value={complement} onChange={(e) => setComplement(e.target.value)} />
                  </label>
                  <label className="text-sm text-white/80">
                    Bairro
                    <input
                      className="input"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      disabled={addressLookupLoading || companyLookupLoading}
                    />
                  </label>
                  <label className="text-sm text-white/80">
                    Cidade
                    <input
                      className="input"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      disabled={addressLookupLoading || companyLookupLoading}
                    />
                  </label>
                  <label className="text-sm text-white/80">
                    UF
                    <input
                      className="input"
                      value={stateUf}
                      onChange={(e) => setStateUf(e.target.value.toUpperCase().slice(0, 2))}
                      disabled={addressLookupLoading || companyLookupLoading}
                    />
                  </label>
                </div>
                {lookupError ? <div className="mt-2 text-xs text-red-200">{lookupError}</div> : null}
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
                            <div className="flex items-center gap-2">
                              {c.name}
                              <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Cliente</span>
                            </div>
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
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white">{c.name}</span>
                        <span className="shrink-0 inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Cliente</span>
                      </div>
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
