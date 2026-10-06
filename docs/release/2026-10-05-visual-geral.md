# Atualização visual geral do Juris Pro — 05/10/2026

## Problema e resultado

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
- Cópia usada para a publicação: `D:/sistema-juridico-juris-pro/tmp/visual-producao-compat-20261005`. Os arquivos de evolução funcional pendentes no checkout principal não foram incluídos nesta implantação.
- Projeto Vercel: `prj_RT4saSl2wdhp3yNFNlyxTzkDaHz7` — `sistema-juridico-juris-pro`.
- Organização: `team_y35fbHQP9VHZ6K0Ft02Swbds` — `leals-projects-f521ffce`.
- Domínio: https://www.diogeneslimaadv.com/.
- Versão anterior disponível para recuperação do frontend: `dpl_GUPdZQ7oFFywAMdf5annDJmPSD7E`, commit `40066ac0a7614239b6caa4db79698323339e3e50`.

Os demais projetos dessa conta Vercel não fazem parte da publicação.

## Artefato final da Vercel

- Commit de código enviado à branch: `d11fd4f4afe8d711228887fc153563f9bb3d7fec`, autor com o e-mail Git informado pelo administrador, `coopagrecdn@gmail.com`. Esse e-mail também foi configurado apenas neste repositório, sem alterar a configuração global ou os demais projetos.
- Implantação final de produção criada sem atribuir o domínio: `dpl_G3W5MRL7XCdk34YCJf2e3DMtnhQ8`.
- URL do artefato: https://sistema-juridico-juris-qrshqlfjj-leals-projects-f521ffce.vercel.app.
- Estado `READY`, destino `production` e nome do projeto verificados pela CLI oficial. Compilação remota concluída em 06/10/2026 00:55 UTC (05/10/2026, horário local).
- Ícone, logo clara, logo escura, procuração e contrato trabalhista publicados conferem byte a byte por SHA-256 e tamanho com os cinco arquivos locais revisados. Evidência: `tmp/general-visual-remote-assets-v9.json` na cópia candidata.
- CSS remoto: `/assets/index-DQqsArit.css`, 124.086 bytes, SHA-256 `8d0d5052ef7db551b4b5941108125b8849d9a8cc72be53b7b510a2ec00658473`.

O CSS local e o remoto têm hashes brutos diferentes. A investigação encontrou somente 21 diferenças numéricas em tokens de `oklab()`, com delta máximo exato de `0.0000002`; todos os 243 trechos entre números são literalmente iguais, incluindo unidades, seletores, declarações e espaços. O critério inicial de arredondar cada token a seis casas reprovou um caso de fronteira (`-.0107555` / `-.0107554`), e esse relatório foi preservado. A aceitação numérica separada exige limite absoluto de `0.000001` por token e identidade literal de todo o restante do CSS; ela não permite diferenças nas regras ou dimensões.

A comparação final aprovou o critério explícito `PASS_OKLAB_ABSOLUTE_TOLERANCE_ONLY`: 242 tokens em 71 funções, 243 trechos não numéricos iguais e nenhum desvio acima do limite. O relatório novo preserva o resultado reprovado do critério inicial, sem declarar igualdade bruta. Relatório: `tmp/general-visual-compiled-css-v9-absolute-tolerance-report.json`, SHA-256 `ab014c3d48603ecbae4ef8a7f7b243ce607d1e78f3a8096a6abd6616969399e1`. Os 56 casos sintéticos do comparador passaram, incluindo diferenças acima do limite, unidades, números fora de `oklab()` e regras adicionais.

## Publicação no domínio oficial

A CLI respondeu à promoção com HTTP 409, informando que a candidata já era a implantação de produção atual. A versão realmente atendida pelo domínio foi então confirmada de forma independente: a inspeção de `https://www.diogeneslimaadv.com` resolveu `dpl_G3W5MRL7XCdk34YCJf2e3DMtnhQ8`, e um GET público retornou HTTP 200 com o stylesheet final `/assets/index-DQqsArit.css`. Não foi preciso remapear domínios manualmente nem alterar outro projeto. O retorno da CLI foi preservado em `tmp/general-visual-production-promote-20261005.txt`.

A primeira conferência anônima completou dez contextos, com zero erros reais de aplicação/rede/assets, zero overflow e zero imagens visíveis quebradas. Os dois estados de login no celular reprovaram somente um critério genérico de quantidade de texto (>100 caracteres); o cartão legítimo tinha 87 caracteres porque a lateral institucional fica oculta nessa largura. Capturas confirmam título, campos e ação presentes. Esse relatório foi preservado em `tmp/general-public-visual-2026-10-06T01-01-39-705Z-e2174081`. O teste foi ajustado para verificar o conteúdo e os controles visíveis próprios da tela, mantendo todos os critérios de marca, carregamento, estilo, proteção e rede. Nenhuma fonte da aplicação precisou mudar por essa reprovação do teste.

A rodada pública final passou **10/10 contextos** em 06/10/2026 01:04:51 UTC (05/10/2026 no horário local): homepage, login, agenda sem sessão, portal do cliente e portal da equipe, em 1280/390 px. Os oito estados de acesso usam a superfície clara; os dois acessos anônimos à agenda redirecionam ao login. Houve zero overflow horizontal, zero imagem visível quebrada, zero erro real JavaScript/console/rede/HTTP e nenhum asset JS/CSS falhou. Dezoito arquivos JavaScript, um stylesheet e as três logos foram conferidos; o CSS público tem o mesmo SHA-256 e tamanho da candidata final.

O teste criou sessões anônimas novas, sem importar cookies ou credenciais, sem preencher/enviar formulários e sem permitir acesso a backend/Auth/provedores. Vinte bloqueios intencionais de fontes/telemetria e quatro abortos de mídia após HTTP 200/206 foram conservados e separados de falhas reais; não foram ocultados. Isso valida o carregamento público e os guards de acesso, sem declarar homologação autenticada das funções do escritório.

Evidência final na cópia candidata: `tmp/general-public-visual-2026-10-06T01-04-28-260Z-91579280/report.json`, SHA-256 `a800162839311f7b4d78c07a84c92b110503722c54e008abe8aa11b646977d08`; resumo no mesmo diretório em `summary-sanitized.json`, SHA-256 `7e63017e908db5a208b9e6ac06ff4da32f489d1b9f99a5a46d6589c788d52864`.

## Correção complementar do endereço sem www

Após a publicação, uma verificação adicional encontrou dois registros A no apex `diogeneslimaadv.com`: `216.198.79.1` (Vercel) e `2.57.91.91` (estacionamento Hostinger). Os dois servidores autoritativos e os resolvedores Google/Cloudflare confirmaram o conflito. O destino Vercel foi testado com HTTPS/Host/SNI e TLS válido: HTTP 308 para `www`, preservando `/app` e `/app/agenda`. O segundo IP respondeu uma página de estacionamento, sem aplicação do escritório. Evidência anterior: `D:/sistema-juridico-juris-pro/tmp/apex-dns-readonly-2026-10-06T01-11-37-747Z/evidence-with-paths.json`, SHA-256 `642b12170b90bbc514fbd3e125ce3efa5cb6b1300fdf4e24b2ddfca2ffdde184`.

O administrador confirmou a remoção manual **somente de A @ → 2.57.91.91**, mantendo A @ → 216.198.79.1. O controle automático do navegador falhou ao iniciar em duas tentativas, então a operação foi realizada pelo usuário no painel Hostinger, com orientação específica. Não houve mudança no banco nem atuação automatizada no painel DNS.

A primeira leitura depois da remoção confirmou atualização parcial: Hermes passou a responder somente o IP Vercel, enquanto Artemis ainda conservava os dois; Google e Cloudflare também mantinham respostas antigas. AAAA permaneceu ausente e `www` conservou o CNAME `64fa862ec74f6496.vercel-dns-017.com` nas quatro fontes. Os registros antigos têm TTL de 14.400 segundos (4 horas), portanto algumas redes podem manter o destino anterior até a expiração de seu cache. Esta leitura não declara propagação global concluída. Evidência: `D:/sistema-juridico-juris-pro/tmp/apex-dns-after-removal-2026-10-06T01-15-12-707Z/evidence.json`, SHA-256 `3463675853c3ac99c10eb114e90a7347a4566e1c01284c6e2125888ced2a7880`.

Durante a convergência, o endereço confirmado para uso é **https://www.diogeneslimaadv.com/app**. A configuração de DNS e seus registros podem ser localizados em Domínios → Gerenciar → DNS/Nameservers, conforme a [orientação oficial da Hostinger](https://www.hostinger.com/support/1583249-how-to-manage-dns-records-at-hostinger/). As verificações seguintes foram conservadas sem substituir as evidências anteriores.

A conferência pontual às 01:16:12 UTC voltou a observar os dois A nos dois servidores autoritativos, com flags AA e consultas sem recursão. O serial SOA subiu de `2026100308` para `2026100601`. A resposta anterior com somente o IP Vercel não foi estável, portanto o estado registrado é **publicação DNS variável/convergindo**, com propagação ainda incompleta. Nenhum apontamento adicional foi alterado. Evidência preservada em `authoritative-followup.json` no diretório da leitura após a remoção, SHA-256 `897b57affb38e7a7eac7408c8f7ddc924e9daeecf7b71de5be353c6e0f201604`.

O administrador conferiu novamente o painel e confirmou que **restou somente A @ → 216.198.79.1**. Essa confirmação foi registrada separadamente da publicação DNS observada. A última conferência pontual, após 60 segundos em duas esperas de 30, ainda encontrou respostas variáveis: Artemis retornou um IP em uma consulta e os dois em outra; Hermes conservou os dois. `www` permaneceu correto. Uma conferência independente pelo resolvedor nativo do Windows também observou Artemis com somente Vercel e Hermes com os dois IPs. O estado final desta entrega é **visual publicado e validado em www; configuração do apex corrigida no painel pelo administrador; publicação autoritativa e caches ainda convergindo**. A evidência final está em `D:/sistema-juridico-juris-pro/tmp/apex-dns-final-point-check-2026-10-06T01-19-47-877Z/evidence.json`, SHA-256 `c5b819c10ae46c1c8047401b56bd21faf30cd746ae4de288a19eb549c7ee41e5`.

## Uso e continuidade

Salve qualquer formulário aberto antes de recarregar a aba. Use Ctrl+F5 e mantenha o seletor **Visual → Novo** na barra superior; a escolha anterior por **Clássico** continua disponível para retorno e conserva a apresentação anterior.

Esta entrega conclui a padronização visual e sua publicação. A integração da branch em `main` permanece em revisão na PR #4. Homologação real de login, agenda entre contas, regras financeiras, gestão da equipe, integrações externas e os novos modelos jurídicos pertence à etapa funcional, separada desta validação visual.
