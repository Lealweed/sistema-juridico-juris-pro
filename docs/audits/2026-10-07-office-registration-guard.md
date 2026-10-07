# Cadastro de equipe: correção focada e ensaio local

Estado desta frente: **preparado e testado localmente, sem aplicação ao Supabase real, sem alteração da cópia restaurada e sem criação de contas ou envio de e-mail real**. Esta evidência não declara implantação concluída nem homologação do escritório.

A migração nova foi criada pelo comando oficial `supabase migration new office_invitation_registration_guard`, com o CLI 2.119 existente, em `supabase/migrations/20261007125503_office_invitation_registration_guard.sql`. Seu SHA256 é `0dc7e873f330f2507cb47dc83f4efefc741e6d6e926ed8416798c3627a022a4e`. Nenhuma migração anterior foi alterada por esta frente e este arquivo não deve ser aplicado por `db push` junto com o conjunto funcional antigo.

## Contrato do banco

`office_invitation_create(office_id,email,role)` cria um convite pendente; `office_invitation_list(office_id)` atende a administração; `office_invitation_list_mine()` encontra somente o e-mail confirmado atual de Auth; `office_invitation_accept(invite_id)` aceita atomicamente; `office_invitation_revoke(office_id,invite_id)` revoga sem excluir. Os nomes dos argumentos SQL são `p_office_id`, `p_email`, `p_role` e `p_invite_id`. As funções retornam JSONB: create/revoke devolvem o convite, accept devolve o vínculo e list/list_mine devolvem arrays.

`office_invitation_add_existing(p_office_id,p_email,p_role)` atende a escolha do usuário de criar a conta diretamente no painel Supabase. A função conecta uma conta Auth já existente e confirmada ao escritório. Exige uma única identidade por e-mail com igualdade exata após trim/casefold, sem `ILIKE`; não recebe senha, não cria Auth, não altera Auth, não envia e-mail e não fabrica aceite do destinatário. O convite pendente existente permanece integralmente preservado. Um vínculo já existente só é retornado se o papel solicitado coincide; divergência produz `membership_role_conflict` sem regravar o papel. Perfil ausente é criado com office_id explícito; perfil existente, inclusive office_id NULL ou de outro escritório, fica intacto.

Papéis de `office_members` continuam estritamente `admin`/`user`. Somente o pedido literal `admin` cria administrador. Títulos de trabalho e aliases aprovados, inclusive financeiro, são interpretados localmente como `user`. Convites históricos que armazenam `member` ou outros aliases permitidos não são normalizados em disco. Um duplicado pendente compatível retorna sua linha original; conflito ou criador sem administração atual exige uma ação explícita, sem reassociação silenciosa. Convites anteriormente aceitos/revogados ficam em seus próprios IDs quando um novo convite é criado.

As mutações exigem Read Committed, bloqueiam a linha de escritório e revalidam Auth confirmado/vínculo de administração exato após a espera. Locks FOR SHARE de Auth e do vínculo mantêm essa decisão durante a operação, inclusive diante de UPDATE legado que não bloqueia o escritório. O aceite também bloqueia o convite e preserva o papel de um vínculo preexistente. Vínculo/perfil/aceite pertencem à mesma transação; falha no perfil desfaz as alterações anteriores.

Há uma reserva dedicada `office_invitation_reserve_send(p_invite_id,p_actor_id)`, executável somente por service_role, com janela de 60 segundos por convite e validação de ator/criador/estado atual. Retorna `{reserved,retry_after_seconds}`. A tabela de reservas tem RLS e nenhum acesso direto concedido aos papéis API. Esta reserva não envia e-mail; o fluxo SMTP/Edge não foi homologado nesta frente.

## Alteração de autoridade e preservação

O preflight exige o catálogo legado: tipos Auth corretos (`email varchar(255)`), role check admin/user, unique de escritório/usuário, ausência de índice unique adicional em convites, owners e papéis confiáveis, colunas sem grants próprios, RLS compatível, ausência de triggers de mutação em membros/convites e quatro policies de membros exatas. O helper `is_office_admin(uuid)` permanece intacto, fixado por MD5 de sua definição (`9d803f5a80ed995478eda592b347b52d`). Drift aborta a transação.

A policy `office_members_admin_office`, originalmente ALL para qualquer membro, passa a USING/WITH CHECK do helper administrativo exato. As três outras policies, todos os constraints, perfis, vínculos e convites originais são preservados e comparados dentro da transação. Esta é a única mudança planejada de policy; o rótulo resumido do primeiro ensaio não deve ser interpretado como preservação dessa policy específica sem mudança.

INSERT e os quatro privilégios de manutenção (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) de membros são retirados de PUBLIC/anon/authenticated. SELECT/UPDATE/DELETE continuam concedidos, sujeitos à policy administrativa. Todas as permissões de escrita/manutenção de convites são retiradas desses papéis. Owner/service continuam disponíveis para manutenção legítima. Os RPCs públicos retiram EXECUTE de PUBLIC/anon antes dos grants específicos; helpers privados não são executáveis por authenticated/service.

Não há DELETE de dados nem backfill de papéis/perfis/convites, alteração de helper global, publicação de Edge Function, ajuste financeiro ou de políticas de outros módulos. A implantação ainda precisa do preflight atualizado, cópia/preservação e frontend correspondente, sob condução da raiz.

## Testes e limites

Ensaio final em `postgres:17-alpine` local, versão 17.11, Docker network none/pull never/sem portas publicadas, com Auth e dados exclusivamente fictícios. **26 grupos passaram**, incluindo ACLs, administração por escritório, metadata/perfil adulterado, usuário sem confirmação, papéis inválidos, duplicidade de identidade, duplicado pendente normalizado sem regravação, históricos preservados, falhas de perfil com rollback, aceite idempotente, inserção explícita do perfil no segundo escritório e conexão direta idempotente sem alteração de Auth/convites.

As provas concorrentes observaram bloqueios nativos via `pg_blocking_pids`: dois creates produzem um único pendente; dois add_existing produzem um vínculo/perfil; administrador rebaixado enquanto espera é recusado após o lock; duas reservas admitem uma só solicitação; rebaixamento legado do administrador espera a transação autorizada terminar. Collaborator não consegue promover o próprio papel ou excluir um colega; admin do escritório mantém UPDATE de papéis válidos e admin de outro escritório não altera as linhas.

Evidência final: `tmp/office-invitation-registration-native-20261007/2026-10-07T13-09-51.788Z/result-sanitized.json`, SHA256 `ec17a2247b74abe62db0d52c29bda211977446aa0ec9e79872358ee6ac197f6e`. Teste em `tests/officeInvitationRegistration.database.test.mjs`, SHA256 `ea78470c1464c5ee8790d9ef34b20299295a52fd81b998f272c3962f413dba97`. A primeira execução com erro de comparação de FK e a execução intermediária de 23 grupos ficam preservadas nos diretórios anteriores; a comparação final usa OIDs/colunas/FK do catálogo, sem depender da qualificação textual do schema.

Limites: o teste usa Auth UID fictício e não comprova GoTrue/JWT, PostgREST, navegador, SMTP, clone restaurado ou produção. SELECT legado de convites permanece no escopo anterior, inclusive sua policy baseada em perfil. Guards adicionais para identidade imutável do vínculo, perda do último administrador e exclusão/rebaixamento próprios não são implantados aqui. O cliente deve mostrar esses limites e não chamar esta correção de auditoria completa de segurança.

Foram consultados o [changelog oficial](https://supabase.com/changelog), a [atualização PostgreSQL 17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) e as [orientações oficiais de funções](https://supabase.com/docs/guides/database/functions). Nenhuma das mudanças específicas de ltree/pgcrypto/operators é usada por este patch.
