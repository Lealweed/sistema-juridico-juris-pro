# Preparação da fonte para preview — 05/10/2026

Status: seleção local validada e vínculo local preparado. Nenhum deploy, commit, alteração de variável remota, promoção de domínio ou gravação no banco foi realizado nesta revisão.

O diretório de origem desta entrega é `D:/sistema-juridico-juris-pro/tmp/marca-publica-www`, branch `codex/marca-publica-www`, HEAD `76f183004a5a5cf2b9b365ec52dea5859162021a`. O manifesto registra a fonte selecionada no momento da verificação, incluindo o parser de recibos ainda modificado no diretório de trabalho. Não descreve exclusivamente o conteúdo do commit HEAD.

## Seleção de arquivos

Foi criado `.vercelignore` com uma lista de diretórios e arquivos permitidos, conforme o mecanismo de [allowlist documentado pela Vercel](https://vercel.com/docs/deployments/vercel-ignore). Entram `src`, `api`, `public`, `package.json`, `package-lock.json`, HTML inicial e configurações de Vite, TypeScript, PostCSS, Tailwind e Vercel. O preview deve construir a fonte; o `dist` local fica excluído.

Permanecem excluídos `.git`, `.vercel`, `.env*`, `node_modules`, `tmp`, `dist`, documentação interna, SQL e ferramentas administrativas, modelos originais de `modelos-de_documentos`, backups, arquivos privados e o histórico `update_n8n_flow.js`. As exclusões de arquivos sensíveis também se aplicam dentro dos diretórios permitidos. O conteúdo do arquivo histórico com segredo, dos arquivos de ambiente e dos arquivos privados não foi lido ou reproduzido. A exclusão do upload não remove um segredo do histórico Git nem substitui sua rotação.

As quatro cópias de modelos usadas pelo gerador no navegador continuam em `public/templates`, com os nomes e conteúdos existentes preservados. O único helper que referencia `modelos-de_documentos` por filesystem não é chamado por nenhuma fonte em `src` ou `api`; o gerador ativo usa URLs `/templates/`. O README dentro de `public/templates` fica excluído.

`scripts/verify-preview-source.mjs` verifica a seleção sem fazer upload: passa 12 casos de arquivos necessários, 77 casos de exclusão e 319 dependências locais estáticas de import/export. Lê e calcula SHA256 somente dos arquivos selecionados; os metadados de vínculo da Vercel são inspecionados separadamente. Interrompe se encontrar link simbólico selecionado ou dependência local excluída. Essa verificação local usa `ignore` 5.3.2 já instalado; não instala dependências.

Resultado em `docs/release/2026-10-05-preview-source-manifest.json`: 154 arquivos, 5.320.741 bytes, SHA256 da lista ordenada `61052f27a69c9a73f42f20a9efa77044b493665ac1090ea525b68069db15980b`. O manifesto é evidência da seleção local proposta, não uma confirmação do conjunto efetivamente enviado pela CLI ou de build remoto. O script e o manifesto ficam fora do upload.

## Vínculo confirmado

Os seguintes metadados foram confirmados pela frente principal com a CLI e registrados em `.vercel/project.json` nesta cópia:

| Campo | Valor |
| --- | --- |
| projectId | `prj_RT4saSl2wdhp3yNFNlyxTzkDaHz7` |
| orgId | `team_y35fbHQP9VHZ6K0Ft02Swbds` |
| projectName | `sistema-juridico-juris-pro` |

A configuração remota informada usa Vite, diretório raiz `.` e Node 24. O último build local do parser foi executado com Node 22.23.2 e Vite 7.3.2; não constitui validação do ambiente remoto Node 24. Não foram copiados tokens nem valores de variáveis de ambiente. O diretório `.vercel` permanece ignorado pelo Git e pelo upload.

## Parser de recibos incluído na fonte

O único reparo ainda modificado em `src/lib/receipts.ts` aceita o retorno de `create_receipt_secure` como objeto com `id`, array com um objeto ou UUID escalar. Confere o UUID antes de persistir campos adicionais ou permitir o passo do PDF; se o retorno for inválido, interrompe o fluxo e orienta conferir o recibo que pode já ter sido criado. Não repete a RPC.

SHA256 do arquivo: `bda16cdbdad9684a011dc76f88d201b50c614c52d02bc8ace961462fc658be3a`, igual à fonte usada nos 16 cenários de transporte sintético já aprovados: quatro retornos válidos e doze inválidos; nos inválidos houve uma RPC, nenhum PATCH de extras e nenhum upload. ESLint e build do reparo passaram anteriormente. Como esta revisão só adicionou regras de upload, metadados e documentação, os testes de recibos e os testes visuais não foram repetidos.

O parser pode compor o preview como correção de compatibilidade com a RPC real de retorno composto. A auditoria da frente principal constatou o bucket real de PDF de recibos ausente. O parser não cria o bucket, suas policies ou objetos, e não confirma emissão, upload e leitura de um PDF real. O recibo no banco e seu PDF são passos distintos; a ausência do bucket permanece uma pendência operacional.

## Cuidados para o próximo passo

O upload deve partir desta pasta isolada, preservando `.vercelignore`, e usar o vínculo confirmado. A ação seguinte deve produzir um preview sem `--prod`, sem promoção ou troca de domínio. A seleção deve ser regenerada se a fonte ou as regras mudarem; o manifesto terá naturalmente outro HEAD se o conteúdo for commitado depois desta verificação.

A presença das variáveis de Preview não prova que elas apontam a um banco isolado. A frente principal decidiu tratar o preview como conectado ao backend real: validação pública com GET, login vazio e transporte simulado; sem enviar formulários, cadastrar clientes, emitir recibos, alterar equipe ou criar demandas. É necessário conferir o build remoto e a proteção do preview antes de apresentá-lo como homologado. As mudanças no banco e a restauração do armazenamento de PDF não fazem parte deste pacote de fonte.

