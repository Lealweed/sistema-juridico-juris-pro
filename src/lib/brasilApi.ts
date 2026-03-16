type AddressLookup = {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
};

type CompanyLookup = {
  razao_social: string;
  nome_fantasia: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro?: string;
  municipio: string;
  uf: string;
};

function onlyDigits(value: string) {
  return (value || '').replace(/\D/g, '');
}

export async function fetchAddressByCep(cep: string): Promise<AddressLookup> {
  const cepLimpo = onlyDigits(cep);
  if (cepLimpo.length !== 8) {
    throw new Error('CEP inválido.');
  }

  return fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
    .then(async (resp) => {
      if (!resp.ok) {
        throw new Error('Falha ao consultar CEP.');
      }

      const payload = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
      if (!payload || payload.erro === true) {
        throw new Error('CEP inválido.');
      }

      return {
        logradouro: typeof payload.logradouro === 'string' ? payload.logradouro : '',
        bairro: typeof payload.bairro === 'string' ? payload.bairro : '',
        localidade: typeof payload.localidade === 'string' ? payload.localidade : '',
        uf: typeof payload.uf === 'string' ? payload.uf : '',
      };
    })
    .catch((err) => {
      throw new Error(err instanceof Error ? err.message : 'Falha ao consultar CEP.');
    });
}

export async function fetchCompanyByCnpj(cnpj: string): Promise<CompanyLookup> {
  const cnpjLimpo = onlyDigits(cnpj);
  if (cnpjLimpo.length !== 14) {
    throw new Error('CNPJ inválido.');
  }

  return fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`)
    .then(async (resp) => {
      if (!resp.ok) {
        throw new Error('Falha ao consultar CNPJ.');
      }

      const payload = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
      if (!payload) {
        throw new Error('CNPJ inválido.');
      }

      return {
        razao_social: typeof payload.razao_social === 'string' ? payload.razao_social : '',
        nome_fantasia: typeof payload.nome_fantasia === 'string' ? payload.nome_fantasia : '',
        cep: typeof payload.cep === 'string' ? payload.cep : '',
        logradouro: typeof payload.logradouro === 'string' ? payload.logradouro : '',
        numero: typeof payload.numero === 'string' ? payload.numero : '',
        bairro: typeof payload.bairro === 'string' ? payload.bairro : '',
        municipio: typeof payload.municipio === 'string' ? payload.municipio : '',
        uf: typeof payload.uf === 'string' ? payload.uf : '',
      };
    })
    .catch((err) => {
      throw new Error(err instanceof Error ? err.message : 'Falha ao consultar CNPJ.');
    });
}