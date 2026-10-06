# Apresentação compatível com a versão publicada — ensaio local

Status desta etapa: **port mínimo de Tailwind 4 compilado e comparação de 24 pares aprovada**, com dados fictícios. Não houve publicação, conexão ao backend real, execução de SQL ou alteração de dados do escritório. Os resultados abaixo distinguem a primeira árvore, o candidato compatível de dependências e a migração do compilador.

## Origem e limite da extração

O worktree `tmp/visual-producao-compat-20261005`, branch `codex/visual-producao-compat`, parte de `e6862a5`: a versão compatível com os contratos publicados de `5b48226`, com a marca pública e o parser de retorno de recibos já corrigidos. O desenho do shell e do Dashboard foi extraído de `19dec09`, sem os guardas financeiros, as RPCs novas, as bibliotecas de equipe ou outras mudanças de backend dessa versão.

As fontes existentes alteradas nesta extração foram:

- `src/ui/layouts/AppLayout.tsx`, `src/ui/navigation/Sidebar.tsx` e `Topbar.tsx`: menu escuro, destaque dourado, cabeçalho claro e navegação móvel.
- `src/ui/pages/DashboardPage.tsx`: apresentação clara, cartões, gráficos e fila de tarefas, calculados a partir das consultas já usadas na base.
- `src/index.css`: regras delimitadas para o shell e as superfícies adaptadas. Os tokens novos usam o formato aceito por `hsl(var(...))` do Tailwind 3.
- `src/main.tsx`: somente inicialização da preferência visual.

São novos o helper de apresentação `src/lib/workspaceVisual.ts`, o seletor `src/ui/components/WorkspaceVisualSwitcher.tsx` e as quatro cópias de apresentação clássica em `src/ui/legacy/`. A página de Parceiros e seus helpers de cadastro/edição/exclusão permanecem os da base: só a paleta recebe as regras delimitadas. A nova entrada de menu aponta para `/app/financeiro/parceiros`, rota administrativa que já existia.

O novo shell conserva as demais páginas operacionais em sua paleta escura original. A opção Clássico mantém o layout, a navegação e o Dashboard da base. Não foi criado um CRM com leads, contratos e gráficos fictícios; as referências visuais orientam a apresentação, e os números apresentados vêm das respostas acessíveis à conta. Indicador ou série indisponível aparece como indisponível, sem fabricar zero. As limitações de quantidade das consultas continuam explícitas no painel.

## Preferência e preservação de formulário

O modo é resolvido uma vez na inicialização: parâmetro `visual=reference` ou `visual=classic`, preferência da mesma sessão e configuração `VITE_WORKSPACE_VISUAL`, nessa ordem. Sem escolha válida, o padrão continua Clássico. A preferência de tema claro/escuro existente funciona no modo clássico e fora do shell novo; não modifica as páginas escuras preservadas dentro dele.

O seletor Visual avisa que a troca recarrega a página e pede confirmação. Cancelar conserva a tela e o rascunho. Confirmar conserva caminho, parâmetros e fragmento da URL, acrescentando a escolha de visual. A navegação comum não muda o modo nem remonta formulários por alteração de tema.

## Evidência da validação T3

`npm ci --ignore-scripts`, com o lock da base, instalou 402 pacotes. O audit dessa árvore informou **23 ocorrências: 3 low, 4 moderate e 16 high**. Nenhuma correção automática ou alteração de dependência foi feita nesta extração. Resultados de outra branch ou de Tailwind 4 não validam essa árvore.

`npm run build` passou após a extração. ESLint seletivo dos 11 arquivos TS/TSX novos ou alterados, `node --check` do harness e `git diff --check` passaram. Após os ajustes delimitados de contraste, `npx vite build` passou novamente; não houve alteração de TypeScript nesses ajustes.

O novo `scripts/check-visual-production.mjs` passou **14/14 cenários** em Chromium/Chrome local, em **2026-10-05T14:33:08Z**, utilizando o roteador, RequireAuth, RequireRole, páginas e helpers reais com transporte sintético. O teste bloqueia rede externa por interceptação e CSP, e recusa RPC inesperada. Foram verificados:

- Todas as consultas de Dashboard Novo e Clássico iguais para `admin` e o papel legado `user`, incluindo campos, filtros, limites e opções.
- As rotas e restrições existentes do menu lateral, mais a entrada administrativa de Parcerias; links móveis apontam para rotas existentes. Usuário comum é redirecionado ao tentar abrir Parcerias, e falta de sessão redireciona para login.
- Radar de processos nos dois modos, filtros de tarefas, estado vazio e falhas no carregamento principal, indicadores opcionais e séries dos gráficos.
- Cadastro, edição e exclusão de Parceiros com os payloads do helper legado. Cancelamento da troca visual conserva rascunhos reais das páginas Parceiros e Clientes; troca confirmada conserva rota e preferência durante a navegação.
- Desktop de 1440 px e celular de 390 px sem transbordamento horizontal nas capturas; menu móvel abre e fecha com Escape. Cinco medições de contraste passaram o mínimo de 4,5: item ativo do menu, texto secundário, legenda de gráfico, campo e botão Salvar de Parceiros.

O ensaio confirmou 140 arquivos protegidos com o mesmo blob Git da base, incluindo Auth, roteador, APIs, bibliotecas de negócio, widgets, páginas operacionais, ativos e manifests. O checkout havia convertido `receipts.ts` para CRLF; a root restaurou apenas os bytes LF da versão já validada, mantendo o blob e a lógica. SHA256 físico confirmado: `bda16cdbdad9684a011dc76f88d201b50c614c52d02bc8ace961462fc658be3a`.

O CSS compilado desse ensaio tem SHA256 `0e62ea98da74fbf8c4cef2b9da05ae98e6812276250119e95426e7a11fadd1aa`. O relatório registrou zero erros de página e zero solicitações externas.

As oito capturas e `visual-production-report.json` estão fora do worktree, em:

`C:/Users/Coop Agronorte/.codex/visualizations/2026/10/02/01a0feab-e732-7ca0-8d43-a5a3b0ed9f93/visual-producao-compat-20261005`

O relatório contém somente operações e identidades fictícias. Para repetir o ensaio após build, executar `node scripts/check-visual-production.mjs`, apontando `PLAYWRIGHT_PACKAGE_ROOT` para o runtime disponível e, se necessário, `JURIS_BROWSER_PATH` para o Chromium/Chrome local. `JURIS_PREVIEW_DIR` permite salvar evidências fora do repositório. O modo opcional `JURIS_PREVIEW_ONLY=1` serve exclusivamente a fixture local para inspeção; ele não conecta o sistema ao Supabase.

## Limites e próximo passo

Esse resultado comprova a extração de apresentação no ambiente fictício. Não comprova Auth, RLS, Realtime, SMTP, WhatsApp, geração de documentos, Storage ou implantação reais. Esses contratos permanecem os da base e dependem das verificações específicas de cada entrega. A nova página de Parceiros não substitui um módulo completo de processos em parceria como o desenho fornecido.

A root identificou marca antiga adicional em algumas exportações, recibos e mensagens da base; esses locais não foram modificados durante o primeiro ensaio acima. As etapas posteriores abaixo registram as exceções explícitas e mantêm a proteção de Auth, roteador e negócio.

## Fotografia T3 com dependências compatíveis e marca revisada

A root atualizou cinco locais somente para a marca institucional: `AiReportsPage.tsx`, `CaseDetailsPage.tsx`, `ReceiptsPage.tsx`, `pdfGenerator.ts` e `receiptPdf.ts`. A assinatura histórica do profissional persistido no recibo, narrativa e valores não foram substituídos. Os SHA256 aprovados estão no guard do harness. A última alteração de `receiptPdf.ts` foi a compressão PNG sem perda, SHA256 `5c953a2c6c56abcdff603626aa3aa5f82ca42e1b0287cbeb4d44e2289e48b59c`; a root comprovou pixels idênticos antes/depois da compressão. Essa compressão ocorreu depois da captura de telas e não muda o conteúdo delas.

A instalação compatível da root preservou Tailwind 3 e passou em `npm ci --ignore-scripts` e build com Vite 7.3.6. A classificação da root informou zero alertas de produção e seis high na cadeia de desenvolvimento T3/braces. Esses números descrevem esse candidato, não a árvore inicial com 23 alertas. Os manifestos T3 têm SHA256 `db396b2b578714a9813842aab776b999d296fb07d922752058b5e5685d7e3d62` e `82a33b9389b1a00dbf5392501372d73e864a0af9aee635604dbeb878a03da8c6`.

O modo de matriz do harness (`JURIS_VISUAL_MATRIX=1`) passou **24/24 contextos** em `2026-10-05T14:45:04.210Z`, totalizando **6.131 elementos visíveis**. Cada contexto usa navegador novo, viewport de 1440×1000 ou 390×844, modo Novo ou Clássico e seis estados: Dashboard, Clientes, cadastro de cliente, prazo da Agenda, formulário de tarefa e campos de geração de documentos. Foram preenchidos rascunhos fictícios, sem salvar ou baixar documentos. O relógio é fixo em `2026-10-05T09:00:00.000Z`, idioma pt-BR e fuso America/Asuncion; animações, transições e caret são desativados somente pelo harness, com espera por fontes, imagens e frames antes da captura.

Os 24 PNGs, `visual-matrix-report.json`, `t3-source-manifest.json` e cópias da configuração anterior estão fora do worktree em:

`C:/Users/Coop Agronorte/.codex/visualizations/2026/10/02/01a0feab-e732-7ca0-8d43-a5a3b0ed9f93/visual-producao-compat-20261005-t3-compatible`

A fotografia registra texto, valor dos campos, retângulos e estilos computados de todos os elementos visíveis. Houve zero erro de página, rede externa, RPC inesperada ou gravação de negócio. O CSS manteve SHA256 `0e62ea98da74fbf8c4cef2b9da05ae98e6812276250119e95426e7a11fadd1aa`. Os ensaios próprios da root de recibo PDF, dossiê PDF e procuração DOCX com dados fictícios passaram separadamente; essa evidência não é substituída pela matriz de telas.

## Port mínimo do compilador T4

O mecanismo T21 segue a integração oficial [Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite) e as diferenças explicitadas no [guia de atualização](https://tailwindcss.com/docs/upgrade-guide), conferidos em 05/10. Foram portados os arquivos de configuração CJS, tema legado estático, plugin oficial, merge dos aliases e somente as regras de compatibilidade necessárias; o stylesheet inteiro da root não foi copiado.

Tailwind e `@tailwindcss/vite` usam 4.3.3; PostCSS usa 8.5.28 e `autoprefixer` foi retirado. Todas as especificações de dependências de execução e scripts permaneceram as do candidato T3. Entre pacotes retidos no lock, somente Tailwind 3.4.17→4.3.3 e PostCSS 8.5.29→8.5.28 mudaram. `npm install --ignore-scripts --no-audit` e o primeiro `npm run build` passaram. A instalação limpa posterior `npm ci --offline --ignore-scripts --no-audit` passou com 354 pacotes; os resultados finais estão abaixo.

Foram renomeados **106 tokens de espaçamento em 50 arquivos TSX**, mantendo os seletores e margens do T3, e removidas exatamente 20 ocorrências antes inativas nos mesmos três arquivos identificados no ensaio T21 anterior. `scripts/visual-production-t21-contracts.json` registra os hashes físicos antes/depois desses transforms e as configurações exatas. Nenhuma expressão de negócio, consulta, payload, handler de gravação ou regra de Auth foi transformada. O guard não libera módulos inteiros: exige os hashes registrados para cada arquivo mecanicamente alterado, além dos blobs originais dos demais arquivos protegidos.

`.vercelignore` passou a permitir explicitamente `tailwind.config.cjs` e `tailwind.legacy-theme.json`; as exclusões de ambiente, dados privados e artefatos permanecem. `.gitignore` recebeu somente `/tmp/` e `/.env*`, SHA256 `449a700727ccf7e8c2fbeaae078ad69f182ce233d0e09ea9f5ec2269bd19102f`. O script local de seleção de fontes da root permanece fora do upload e é aceito pelo SHA256 exato `5446406a02fd93f56f7242f9398aa9be46ac28c578fab8a89508c94111f2034e`.

## Comparação estabilizada e correção de degradês

A primeira fotografia de Dashboard Clássico ainda continha uma animação JavaScript de Recharts. O CSS de teste já bloqueava animações CSS, mas isso não bloqueia alterações de atributos SVG pelo gráfico. O harness passou a exigir no mínimo 1.800 ms e 12 frames consecutivos sem alteração do SVG, com limite de 10 segundos. Essa espera afeta somente a evidência de navegador.

O CSS T3 foi recompilado em uma fixture descartável **offline**, usando o lock/config preservados, e reproduziu exatamente o SHA256 original `0e62ea98da74fbf8c4cef2b9da05ae98e6812276250119e95426e7a11fadd1aa`. Seus bytes estão em `t3-compatible/t3-frozen.css`. Para servir esse CSS à aplicação atual na recaptura, o harness renomeia somente os seletores de espaçamento para os aliases comprovados; não altera declarações, custom properties ou cores. Apenas os dois Dashboards Clássico foram recapturados no T3. `visual-matrix-consolidated.json` conserva os outros 22 contextos e registra as duas substituições; relatórios e PNGs originais permanecem intactos.

A comparação estabilizada encontrou uma diferença concreta de cor dos degradês clássicos: interpolação oklab do T4, enquanto o T3 usa sRGB. Foram acrescentadas somente quatro regras CSS para as direções `bg-gradient-to-b`, `br`, `l` e `r`, preservando sRGB. A configuração, os TSX e os contratos de negócio permaneceram iguais. As direções também aparecem no avatar de fallback clássico; por isso a fotografia T4 final recapturou os 24 contextos após esse ajuste.

Em **2026-10-05T15:13:22.554Z**, a matriz final passou **24/24**, com 6.131 elementos visíveis. A comparação tem **zero alteração de texto, valor de campo, geometria ou estilo não cromático; deslocamento máximo de 0 px**. O comparador registra, sem ocultar, 196 serializações cromáticas e 936 termos inertes: raio uniforme de cápsula acima das dimensões do elemento e sombras totalmente zeradas. Offsets e spreads das sombras visíveis continuam comparados exatamente; sua cor também é coberta pelo comparador de imagens.

Os **24 pares de PNG passaram**, com diferença máxima de **1/255 por canal** e **zero pixels acima de 3/255**. O limite de contraste 4,5 não foi relaxado. O CSS final tem SHA256 `6686230ad19666010f9b63d2c4b1f50d7aa55762b8acdeb0b356af0352862d0a`.

Uma verificação dirigida adicional renderizou as quatro direções com stops opacos e translúcidos, usando os dois CSS compilados reais: **8/8 combinações aprovadas**, máximo 1/255 e zero pixels acima de 3/255. O navegador omite o keyword sRGB padrão em `background-image`; o teste confere a custom property compilada e os pixels, sem exigir uma serialização que o navegador não emite.

As evidências finais estão fora do worktree, sob a pasta de visualizações desta tarefa:

- `visual-producao-compat-20261005-t4-final`: 24 PNGs, `visual-matrix-report.json`, `visual-dom-comparison.json` e `visual-image-comparison.json`.
- `visual-producao-compat-20261005-t3-dashboard-settled`: dois PNGs e relatório de recaptura T3.
- `visual-producao-compat-20261005-t4-dashboard-settled`: recaptura T4 intermediária, que preserva a diferença de degradês antes da correção.
- `visual-producao-compat-20261005-gradients`: oito pares dirigidos, relatórios de CSS e comparação de pixels.
- `visual-producao-compat-20261005-t4`: matriz intermediária e JSONs de audit completo e de produção, ambos com **zero alertas**.

O merge dos dois pontos de entrada de `cn` passou oito composições reais, incluindo frações, negativo, responsivo, hover e substituição dos aliases por tokens normais. ESLint seletivo dos arquivos de apresentação, helpers, config CJS e Vite passou. A revisão independente da root preservou o AST de 43 arquivos operacionais, normalizando somente literais de classe e o slot `activeClass`; os sete arquivos de UI/marca/clássico foram revistos separadamente. Nenhuma nova RPC de permissões foi copiada para essa versão.

## Validação do candidato final pelo lock

Após estabilizar o runtime e revisar o pacote, `npm ci --offline --ignore-scripts --no-audit` passou com **354 pacotes**, seguido de `npm run build` (**tsc e Vite 7.3.6, código 0**). O build reproduziu o CSS final `6686230ad19666010f9b63d2c4b1f50d7aa55762b8acdeb0b356af0352862d0a`. O aviso herdado de chunks maiores que 500 kB continua presente; não é falha de compilação.

O harness funcional passou novamente **14/14 em 2026-10-05T15:25:07.031Z** com esse CSS final, preservando contratos de consulta, rotas e filtros de papel, Radar, cadastro/edição/exclusão de Parceiros, fallback clássico, rascunho cancelado e contraste. Não houve erro de página nem rede externa. A evidência está em:

`C:/Users/Coop Agronorte/.codex/visualizations/2026/10/02/01a0feab-e732-7ca0-8d43-a5a3b0ed9f93/visual-producao-compat-20261005-t4-final-functional/visual-production-report.json`

O guard recusou o primeiro arranque após a root atualizar o manifesto versionado de fontes; somente o hash explícito desse arquivo já revisto (`bf632c029a59f4c3c7156dae58fd7295169d0a37aa454bd8b1597d0b96bda145`) foi acrescentado às exceções. Não foi criada uma liberação geral de documentos, scripts ou bibliotecas. A execução funcional completa posterior passou. Os JSONs de audit completo e `--omit=dev` confirmam **zero alertas em ambas as árvores**; o lock não foi modificado pela instalação limpa. ESLint seletivo, checagem de sintaxe dos harnesses e `git diff --check` passaram. Nenhum processo de prévia ou navegador ficou em execução.

## Revisão independente do pacote local

A root gerou `docs/release/2026-10-05-preview-source-manifest.json` e o ZIP local `D:/sistema-juridico-juris-pro/tmp/visual-producao-compat-20261005-t4-candidate.zip`. A revisão independente em **2026-10-05T15:20:12.524871Z** confirmou **161 nomes únicos, 5.392.527 bytes de fontes e correspondência byte a byte de cada entrada com o arquivo local e o hash do manifesto**. Config CJS, tema legado, ambos os layouts e as logos aprovadas estão presentes; o config JS antigo está ausente. O parser de recibos e a versão final do PDF permanecem nos hashes aprovados.

Não há caminhos Git, ambiente, vínculo Vercel, dados privados, documentos, scripts, `tmp`, symlinks ou reparse points no ZIP. O destino jurídico foi confirmado pelos metadados exatos do manifesto. Isso confirma a seleção local; não valida ambiente remoto ou permissões de implantação.

- Conjunto de fontes: SHA256 `54c7135fac92571aab1ff2df84fa9f7fdcca767c3ecd9099936b3d49c41740bd`.
- ZIP: SHA256 `88bfb99d8963a018e6a05da42468cdfbb370f9cb3dad753c0cce1e32d1bc31b2`.
- Evidência própria: `visual-producao-compat-20261005-t4-final/package-independent-review.json`.

O HEAD `e6862a5` é a base e **não identifica sozinho os bytes locais alterados**; o manifesto identifica este candidato. O ZIP contém fontes e não inclui configurações de ambiente ou vínculo local ao Vercel. Nenhum upload, commit, preview ou publicação foi realizado por essa revisão. O backend de qualquer preview deve ser tratado como dados de produção até haver confirmação independente de isolamento.
