# Inventário para a evolução visual de todas as rotas — 05/10/2026

**Estado: inventário estático concluído; este documento não comprova execução de navegador.** A leitura foi feita no candidato `tmp/visual-producao-compat-20261005`, a partir de `src/router/AppRouter.tsx`, layouts, páginas e CSS. Não houve alteração de página, função de negócio, autenticação, API, banco ou Git nesta frente.

O router declara **32 caminhos protegidos: 30 telas e dois redirecionamentos**, além de cinco caminhos fora do shell e um fallback. Entre os protegidos, 11 caminhos exigem `admin` (um é redirecionamento), um exige `admin` ou `user` e 20 têm somente `RequireAuth` no router. As permissões internas de cada ação e as regras do backend permanecem separadas desse inventário de navegação.

## Matriz completa de rotas protegidas

Legenda: **A** = `RequireAuth`; **ADM** = `RequireAuth` + `RequireRole(['admin'])`; **ADM/USER** = `RequireAuth` + `RequireRole(['admin','user'])`. Parâmetros de detalhe devem usar somente registros fictícios da QA.

| Nº | Caminho | Guard | Componente / destino | Estados e ações visuais a conferir |
| --- | --- | --- | --- | --- |
| 1 | `/app` | A | `DashboardPage` / variante clássica | Cards, métricas, abas, tarefas/prioridades, calendário, feed; dados/vazio/loading/erro; variantes classic/reference |
| 2 | `/app/produtividade` | A | `ProductivityPage` | Semana, formulário/checklist, rascunho/enviado, edição bloqueada, histórico e aba do gestor; mensagens de erro/sucesso |
| 3 | `/app/clientes` | A | `ClientsPage` | Busca/filtros, listagem desktop/mobile, formulário inline de novo cliente, pessoa física/jurídica, campos/máscaras e consultas auxiliares pendentes/erro |
| 4 | `/app/triagem` | A | `TriagePage` | Filtros/lista de leads, seleção, modal de detalhes e apresentação da conversão; vazio/loading/erro |
| 5 | `/app/clientes/:clientId` | A | `ClientDetailsPage` | Leitura/edição, processos, documentos, vínculos/timeline, mensagens, honorários e agenda; modais de reunião/honorários; inexistente/loading/erro |
| 6 | `/app/casos` | A | `CasesPage` | Filtros/listagem, formulário inline de novo caso, associação/remoção de clientes; vazio/loading/erro |
| 7 | `/app/casos/:caseId` | A | `CaseDetailsPage` | Dados e edição, clientes envolvidos, documentos/timeline, valores/parcelas e modal de cobrança Pix; dados longos/loading/erro/inexistente |
| 8 | `/app/agenda` | A | `AgendaPage` | Escopos/seleção de agendas, mês/semana/lista, navegação de datas, formulário inline de agenda/item, seletor de processo e painel de lembretes |
| 9 | `/app/agenda/configuracoes` | ADM | `AgendaSettingsPage` | Carregamento de preferências, controles de antecedência, formulário/save desabilitado/erro; acesso negado a não admin |
| 10 | `/app/tarefas` | A | `TasksPage` | Filtros de status/responsável, tarefas delegadas, formulário inline, responsáveis, subtarefas/anexos e apresentação de criação em lote |
| 11 | `/app/tarefas/kanban` | A | `TasksKanbanPage` | Colunas e cards vazios/preenchidos, arraste, menus/ações de status, subtarefas e overflow por coluna; loading/erro |
| 12 | `/app/tarefas/:taskId` | A | `TaskDetailsPage` | Leitura/edição/status/responsável, etapas, anexos, descrição longa; modal de nova etapa e estado salvando |
| 13 | `/app/tarefas/lote/:groupId` | ADM | `TaskGroupPage` | Resumo total/abertas/concluídas/canceladas, responsáveis e links de detalhe; lote vazio/loading/erro; acesso negado |
| 14 | `/app/recibos` | A | `ReceiptsPage` | Busca de cliente/dropdown, criação rápida de cliente, formulário/edição, parcelas de cartão, preview pequeno e modal iframe, tabela/ações/PDF/status; estados de emissão/erro |
| 15 | `/app/financeiro` | ADM | `FinancePage` | Cards executivos, caixa aberto/fechado, entrada/saída rápida, gráficos expandidos, filtros/lista e formulário inline de lançamento |
| 16 | `/app/financeiro/categorias` | ADM | `CategoriesPage` | Formulário inline novo/edição, tipos receita/despesa, tabela/cards, cancelar, confirmação nativa de exclusão; saving/erro |
| 17 | `/app/financeiro/parceiros` | ADM | `PartnersPage` | Lista e formulário inline novo/edição, contato longo, cancelar/erro/saving; variante reference já existente |
| 18 | `/app/financeiro/a-pagar` | ADM | `PayablesPage` | Filtros todos/pendentes/pagos, repasses, editor inline percentual/fixo, apresentação de pagar/desfazer/excluir; saving/erro |
| 19 | `/app/financeiro/:txId` | ADM | `FinanceTxDetailsPage` | Formulário de lançamento, planejado/pago/cancelado, datas/valores/observações, repasse percentual/fixo e exclusão nativa; inexistente/erro |
| 20 | `/app/documentos/gerar` | ADM/USER | `DocumentsGeneratorPage` | Dropdown de cliente, grupos/modelos, campos obrigatórios, preview HTML inline, ações desabilitadas/prontas/gerando, histórico e botões DOCX/print/copiar |
| 21 | `/app/portal` | A | Redirect para `/portal` | Navegação/retorno; o destino está fora de `AppLayout` e tem autenticação própria de cliente |
| 22 | `/app/relatorios-ia` | A | `AiReportsPage` | Cards/gráficos/resumos, período e blocos por atividade, resumo semanal pendente/pronto/erro e apresentação do envio WhatsApp |
| 23 | `/app/relatorios-equipe` | ADM | `TeamReportsPage` | Filtros/cards/lista, drawer de detalhes, status/comentário de revisão, copiar e estados de saving/erro/resumo parcial |
| 24 | `/app/relatorio-atividades` | A | `ActivityReportPage` | Formulário/contagens/texto, dia/histórico, loading/save/sucesso/erro; apresentação de envio e relatórios existentes |
| 25 | `/app/notificacoes` | A | `NotificationsPage` | Filtros/cartões lidos/não lidos, links e apresentação de ações de leitura; vazio/loading/erro |
| 26 | `/app/drive` | A | `DrivePage` | Busca/tipo/visibilidade, cards/lista, painel inline de upload/file input, público/privado, análise em andamento e download; vazio/loading/erro |
| 27 | `/app/publicacoes` | A | `PublicationsPage` | Busca e lidas/não lidas, lista/detalhe, texto HTML longo `prose-invert`, atualização/loading/erro |
| 28 | `/app/configuracoes` | A | `SettingsPage` | Contato próprio, convites/vínculos e blocos condicionais administrativos, formulários/listas/feedback; guardar visibilidade original por papel |
| 29 | `/app/configuracoes/n8n-docs` | A | `SettingsN8nDocsPage` | Instruções/blocos de código/texto selecionável; quebra de linha e contraste sem revelar valores reais na QA |
| 30 | `/app/configuracoes/equipe` | ADM | Redirect para `/app/configuracoes/membros` | Redirecionamento correto e guard administrativo; não contar como uma segunda tela de equipe |
| 31 | `/app/configuracoes/membros` | ADM | `MembersSettingsPage` | Cards de orientação/links da equipe; conteúdo longo, navegação e acesso negado |
| 32 | `/app/configuracoes/auditoria` | ADM | `AuditPage` | Filtros tabela/ação/busca, registros e expansão de JSON com dados fictícios; vazio/loading/erro, monospace e overflow |

`RequireRole` normaliza owner/admin/administrator/adm para admin, advogado/lawyer/finance para finance e aliases de equipe para colaborador; `user` permanece `user`. A matriz registra os `allowed` do router atual, incluindo o guard ADM/USER de documentos. Essa frente visual não muda aliases, fallback de papel, vínculos, guards, visibilidade de ações ou RLS.

## Rotas fora do shell

| Caminho | Componente / layout | Verificação de regressão |
| --- | --- | --- |
| `/` | `LandingPage` / `PublicLayout` | Marca pública, formulário, menu mobile, navegação e ausência de vazamento das regras do workspace |
| `/demo` | `HelixDemoPage` / `PublicLayout` | Conteúdo demonstrativo, menus/abas e identidade independente do app |
| `/portal` | `ClientPortalPage`, sem `AppLayout` | Entrada do cliente, PIN/sessão própria, navegação móvel, documentos/processos/mensagens com fixture; o portal não é um modal React |
| `/portal/membro` | `MemberPortalPage`, sem `AppLayout` | Login próprio, perfil, reset/senha e estados autenticado/desconectado/erro com fixture |
| `/app/login` | `LoginPage` / `AuthLayout` | Formulário, erro/loading e redirecionamento; comparar antes/depois da navegação para o workspace |
| `*` | Redirect para `/` | Rota inexistente continua voltando à página pública |

`TeamPage`, `ReportsPage`, `OrgSelectPage` e arquivos sob `pages/demo/` existem na árvore, mas não têm caminho próprio declarado neste router. Não adicionam rotas à contagem acima.

## Modais, drawers e superfícies fora da página

Na leitura do candidato, **não foi encontrada chamada `createPortal` ou `ReactDOM.createPortal` em `src`**. `main.tsx` importa `createRoot` de `react-dom/client` para montar o aplicativo; isso não cria um portal de modal. Os overlays abaixo são JSX `fixed` dentro da árvore das páginas; herdam o escopo do workspace quando o `main` recebe a classe de superfície. Uma futura implementação com portal para `document.body` precisará de marcador explícito e regras próprias, porque deixará de ser descendente de `.workspace-surface`.

| Origem | Superfície | Ponto visual a conferir |
| --- | --- | --- |
| `TriagePage` / `LeadDetailsModal` | Detalhes de lead | Backdrop preto/translúcido, cartão escuro, texto, rolagem, conversão pendente e fechar |
| `ClientDetailsPage` | Agendar reunião | Container `bg-slate-900`, data/hora, título, botões e saving/disabled |
| `ClientDetailsPage` | Lançar honorários | Container `bg-slate-900`, valor/máscara, parcelas, campos longos e cancelamento |
| `CaseDetailsPage` | Cobrança Pix | Backdrop `bg-black/70`, painel, valor/parcelas e estado de envio; sem cobrança real na QA |
| `TaskDetailsPage` | Nova etapa | Backdrop/painel, nome/responsável, seletor e botões salvando |
| `ReceiptsPage` / `PreviewModal` | Preview ampliado | Moldura/fechar; **iframe `srcDoc` tem documento/CSS próprio** e não recebe o CSS da página externa |
| `TeamReportsPage` / `DetailsDrawer` | Detalhes/revisão | Backdrop `bg-black/60`, painel lateral `bg-neutral-950`, header/copy/close, scroll interno e status sem perder semântica de cor |
| `Topbar` e `ClassicTopbar` | Menu mobile | Drawer de navegação deliberadamente escuro, ativo/foco/fechar; z-index e overlay acima da página |
| `NotificationsBell` | Dropdown da barra | Fora de `main`, mas dentro do shell; largura, foco, contraste e overflow em mobile |
| `AppToaster` | `react-hot-toast` | Fora de `main`, mas declarado no layout; inspecionar DOM efetivo, estilos da biblioteca e legibilidade de sucesso/erro |
| `ReceiptsPage` e `DocumentsGeneratorPage` | Seletor de cliente | Dropdown absoluto dentro do formulário; busca, seleção, vazio, lista longa, foco/blur e sobreposição |
| `AgendaPage` | Seletor de processo / lembretes | Painéis inline; não aplicar regras de backdrop de modal a esses cards |
| `DocumentsGeneratorPage` | Preview/print | HTML inline recebe CSS do workspace; janela aberta para impressão tem documento próprio. Preservar texto, modelo e impressão |
| Páginas financeiras e produtividade | `window.confirm` | Diálogo nativo do navegador; não é um modal estilizado pelo CSS do app |

Os formulários de novo cliente/caso/tarefa/agenda, lançamento financeiro, parceiro, categoria e upload do Drive são **painéis inline**, apesar do estado `createOpen`/`uploadOpen`. Abrir esses estados é obrigatório para verificar o estilo; captura somente da listagem não cobre o formulário.

## Tema e máscaras CSS encontradas

No snapshot lido, `ReferenceAppLayout` mantém o shell claro, mas consulta `isReferenceSurface()`: somente `/app` e `/app/financeiro/parceiros` entram em `.workspace-surface`; as demais telas recebem `.workspace-legacy-content.app-bg-dark.theme-dark`. Portanto o tema dessas duas telas não comprova as outras 28 telas protegidas.

`getStoredTheme()` usa `castrocrm.theme`, aceitando `light` e retornando `dark` por padrão. `applyTheme()` grava `data-app-theme` no elemento `html`. O modo visual é resolvido uma vez na inicialização, na ordem URL `visual`, sessão e configuração, para não remontar formulários durante navegação. Esse contrato de comportamento deve permanecer.

O CSS `html[data-app-theme='light']` existente exclui descendentes de `.workspace-reference`. A classe `.workspace-surface` faz a adaptação dos utilitários escuros e `.workspace-legacy-content` força `color-scheme: dark`. A alteração global precisa conferir também `color-scheme` dos selects, data/hora, autofill e controles nativos; recolorir somente texto/fundo não cobre esses estados.

As regras atuais de superfície alcançam `.text-white`, tons com opacidade, `.border-white/*`, fundos `.bg-white/*`, `.bg-black/10` a `/50`, neutros/slate/cores hex específicas, gradientes e sombras, `.btn-primary`, `.btn-ghost`, `.btn-icon`, `.input`, `.select`, badges e estados semânticos. Conferir os seguintes limites ao generalizar:

- Preservar a navegação deliberadamente escura (`workspace-sidebar`/`workspace-navigation-dark`), incluindo ativo, hover, foco e menu mobile.
- Preservar backdrops `bg-black/60` e `/70`; a cor do painel deve mudar sem remover a separação visual do overlay.
- Preservar texto branco sobre botões sólidos de ação; seletores amplos de `.text-white` também atingem esses filhos.
- Tratar `!bg-*`, `!text-*`, hover/focus/disabled, placeholders e classes `prose-invert`; `!important` e estilos inline podem vencer o mapeamento geral.
- Conferir inputs/file input, select/options, data/hora e textarea em ambos os temas armazenados; um toast/dropdown fora de `main` não é coberto automaticamente por `.workspace-surface`.
- Cards legados usam `backdrop-blur`, sombra e transformação no hover. Generalizar só dentro do workspace; não alterar cartões públicos ou o papel branco dos documentos.
- Não modificar CSS interno de iframe, HTML de impressão, template DOCX/PDF ou o conteúdo do preview como parte da adaptação do shell.
- Se surgir `createPortal`, marcar o container próprio do overlay ou usar um marcador temporário no body enquanto o workspace estiver montado. Conferir entrada/saída do app para não transportar essas regras às rotas públicas.

## Checklist para execução da QA

1. Conferir os 32 caminhos e os dois redirects, com fixture para os cinco parâmetros de detalhes/lote: cliente, caso, tarefa, lançamento e grupo. Usar admin para alcançar todas as páginas permitidas e os papéis existentes para confirmar os redirects/ações negadas, sem enfraquecer guards.
2. Comparar `reference` com tema armazenado `light` e `dark`; repetir `classic` com os dois valores para verificar a preservação da opção clássica. Conferir recarga, URL de detalhe e navegação entre módulos sem remontar/perder rascunho.
3. Para cada tela, mostrar dados, vazio e estados loading/erro disponíveis; abrir todo formulário inline, modal/drawer/dropdown listado. Conferir foco, seleção, hover, disabled, texto longo e rolagem em desktop/mobile.
4. Inspecionar os overlays pela árvore DOM efetiva. Contar como coberto somente o estado realmente aberto; rota de lista não cobre detalhe, impressão, iframe ou drawer.
5. Voltar do workspace para login/home/portais, verificando o tema global e as máscaras CSS. Conferir overflow horizontal e menu mobile sem alterar comportamento de navegação.
6. Comparar a mudança com a baseline de produção: limitar o diff de implementação ao layout/estilos autorizados. Preservar router, guards, chamadas API, payloads, cálculos, idempotência, autoria, arquivos e funções de negócio.

Este inventário não inicia nenhuma operação de produção. A execução visual deve usar os fixtures/transportes locais já autorizados; emissão, cobrança, convite, upload, exclusão e mensagens reais ficam fora deste levantamento.
