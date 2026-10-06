# Atualização visual geral do Juris Pro — 05/10/2026

## Problema e resultado esperado

O layout de referência aplicava a paleta clara apenas ao dashboard e às parcerias. As outras rotas internas recebiam uma classe de compatibilidade que mantinha a aparência escura anterior. O layout agora aplica a apresentação de referência a todas as páginas internas. Login e portais também selecionam a apresentação e a logo adequadas ao modo escolhido.

A atualização conserva campos, valores, opções, handlers, consultas, autorização e documentos emitidos. O modo clássico continua disponível pelo seletor existente. A navegação escura e dourada acompanha a referência visual aprovada; as áreas de trabalho usam cards claros, bordas discretas, campos legíveis e ações douradas.

## Alterações de apresentação

- Paleta compartilhada para clientes, casos/processos, triagem, agenda e configurações da agenda, tarefas, grupos e Kanban, produtividade, relatórios, notificações, publicações, recibos, documentos, Smart Drive, financeiro e configurações administrativas.
- Estados de foco, hover, campos desabilitados, badges de prazo/SLA e mensagens de sucesso/erro compatíveis com a superfície clara.
- Scrim escuro de modais mantido; painéis, dropdowns e formulários usam a paleta de referência.
- Gráficos financeiros com eixos e legendas escuros, receitas douradas, despesas escuras e tooltip branco. Agregações, consultas e séries preservadas.
- Prévia do gerador usa variáveis CSS com fallback para os valores clássicos. Arquivos DOCX, geração, histórico e conteúdo jurídico não foram modificados nesta atualização.
- Portais usam a logo clara em referência, nos estados de acesso, autenticado e indisponível. Impressão e autenticação preservadas.
- Nome institucional antigo remanescente no financeiro e na demonstração substituído pela configuração central da marca.

## Validação e limites

TypeScript e compilação Vite final passaram. ESLint focalizado não encontrou erros nos nove componentes TSX alterados; permanece uma advertência anterior de dependência de hook em TeamPage. A seleção efetiva da CLI Vercel coincide com o manifesto de envio em todos os caminhos, tamanhos e hashes SHA-1: 161 arquivos, 5.402.446 bytes, 358 imports locais, 77 casos de exclusão. O conjunto de fontes tem SHA-256 `58c0d705b889f2229c596cf403c7e32867302bea03611d20a53107dd20b618e2` nesta revisão. O manifesto registra a coleta anterior ao commit final, sobre `40066ac`, com mudanças locais declaradas.

A comparação consolidada aprovou 168 cenários em desktop e celular, nos visuais novo e clássico, incluindo formulários, seletores, prévias e estados de acesso. Campos, opções, valores, botões, links, consultas e RPCs mantêm identidade com a versão anterior, exceto os textos institucionais explicitamente atualizados. Nos 84 cenários do visual novo, 3.469 amostras de contraste passaram e nenhuma tela teve overflow horizontal. Não houve ErrorBoundary, exceção JavaScript ou chamada de rede externa. Dezesseis verificações de cancelamento preservaram o rascunho.

O relatório consolidado conserva a proveniência de 143 cenários v7, 17 v8 e 8 v9; as duas revisões finais acrescentam somente correções de apresentação delimitadas. A validação estática revisou a mudança final e confirmou nove inversões exatas de componentes, 48 arquivos de API/Auth/bibliotecas/router sem alteração de conteúdo e 13 assets públicos intactos. O CSS fonte final tem SHA-256 `666bad3ff2043a77c70504f5a176fcac9ac26541335220cbd2d6076faa9a2b2e`; o CSS compilado local tem SHA-256 `c0ebe2c1eea4b805acbefdf57e3d0adec2d64799f25ef540ac8055065bffe91c`.

No modo clássico, cinco excessos horizontais anteriores foram preservados e registrados: detalhes de cliente (115 px), detalhes de caso (143 px) e três estados de equipe (36 px). O visual novo corrige esses pontos. As tabelas continuam roláveis, sem ocultar colunas ou ações.

Evidência local: `D:/sistema-juridico-juris-pro/tmp/general-visual-verified-20261005/general-visual-report.json`, SHA-256 `047d163850322fa4df638694d2faf97e047a1d5442849a2889b76ef809018185`; resumo no mesmo diretório em `verification-summary.json`. Os relatórios anteriores e as capturas foram preservados.

A matriz visual usa router, páginas e bibliotecas reais com transporte e sessão fictícios. Não há conexão ao Supabase real, submissão de ações de negócio, convites reais, alteração de usuários ou dados do escritório durante esse teste. A verificação remota de publicação será registrada depois da implantação e da conferência anônima do domínio.

Nenhuma migração SQL, função Edge, configuração de Auth, permissão financeira, cadastro ou arquivo histórico faz parte desta entrega. A conferência visual não substitui a homologação posterior das funções de negócio pendentes.

## Destino verificado

- Repositório: `Lealweed/sistema-juridico-juris-pro`.
- Branch: `codex/visual-producao-compat`; PR existente: https://github.com/Lealweed/sistema-juridico-juris-pro/pull/4.
- Projeto Vercel: `prj_RT4saSl2wdhp3yNFNlyxTzkDaHz7` — `sistema-juridico-juris-pro`.
- Organização: `team_y35fbHQP9VHZ6K0Ft02Swbds` — `leals-projects-f521ffce`.
- Domínio: https://www.diogeneslimaadv.com/.
- Versão anterior disponível para recuperação do frontend: `dpl_GUPdZQ7oFFywAMdf5annDJmPSD7E`, commit `40066ac0a7614239b6caa4db79698323339e3e50`.

Os demais projetos dessa conta Vercel não fazem parte da publicação.
