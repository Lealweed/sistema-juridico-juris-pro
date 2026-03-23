import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { RequireAuth } from '@/auth/RequireAuth';
import { RequireRole } from '@/auth/RequireRole';
import { AuthLayout } from '@/ui/layouts/AuthLayout';
import { AppLayout } from '@/ui/layouts/AppLayout';
import { PublicLayout } from '@/ui/layouts/PublicLayout';
import { ErrorBoundary } from '@/ui/primitives/ErrorBoundary';

const LandingPage = lazy(() => import('@/ui/pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const HelixDemoPage = lazy(() => import('@/ui/pages/HelixDemoPage').then((m) => ({ default: m.HelixDemoPage })));
const LoginPage = lazy(() => import('@/ui/pages/LoginPage').then((m) => ({ default: m.LoginPage })));

const DashboardPage = lazy(() => import('@/ui/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ProductivityPage = lazy(() => import('@/ui/pages/ProductivityPage').then((m) => ({ default: m.ProductivityPage })));
const ClientsPage = lazy(() => import('@/ui/pages/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const ClientDetailsPage = lazy(() => import('@/ui/pages/ClientDetailsPage').then((m) => ({ default: m.ClientDetailsPage })));
const CasesPage = lazy(() => import('@/ui/pages/CasesPage').then((m) => ({ default: m.CasesPage })));
const CaseDetailsPage = lazy(() => import('@/ui/pages/CaseDetailsPage').then((m) => ({ default: m.CaseDetailsPage })));
const AgendaPage = lazy(() => import('@/ui/pages/AgendaPage').then((m) => ({ default: m.AgendaPage })));
const AgendaSettingsPage = lazy(() => import('@/ui/pages/AgendaSettingsPage').then((m) => ({ default: m.AgendaSettingsPage })));
const TasksPage = lazy(() => import('@/ui/pages/TasksPage').then((m) => ({ default: m.TasksPage })));
const TasksKanbanPage = lazy(() => import('@/ui/pages/TasksKanbanPage').then((m) => ({ default: m.TasksKanbanPage })));
const TaskDetailsPage = lazy(() => import('@/ui/pages/TaskDetailsPage').then((m) => ({ default: m.TaskDetailsPage })));
const TaskGroupPage = lazy(() => import('@/ui/pages/TaskGroupPage').then((m) => ({ default: m.TaskGroupPage })));
const FinancePage = lazy(() => import('@/ui/pages/FinancePage').then((m) => ({ default: m.FinancePage })));
const FinanceTxDetailsPage = lazy(() =>
  import('@/ui/pages/finance/FinanceTxDetailsPage').then((m) => ({ default: m.FinanceTxDetailsPage })),
);
const PartnersPage = lazy(() => import('@/ui/pages/finance/PartnersPage').then((m) => ({ default: m.PartnersPage })));
const PayablesPage = lazy(() => import('@/ui/pages/finance/PayablesPage').then((m) => ({ default: m.PayablesPage })));
const AiReportsPage = lazy(() => import('@/ui/pages/AiReportsPage').then((m) => ({ default: m.AiReportsPage })));
const ClientPortalPage = lazy(() => import('@/ui/pages/ClientPortalPage').then((m) => ({ default: m.ClientPortalPage })));
const NotificationsPage = lazy(() => import('@/ui/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const PublicationsPage = lazy(() => import('@/ui/pages/PublicationsPage').then((m) => ({ default: m.PublicationsPage })));
const DrivePage = lazy(() => import('@/ui/pages/DrivePage').then((m) => ({ default: m.DrivePage })));
const SettingsPage = lazy(() => import('@/ui/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const TeamPage = lazy(() => import('@/ui/pages/TeamPage').then((m) => ({ default: m.TeamPage })));
const AuditPage = lazy(() => import('@/ui/pages/AuditPage').then((m) => ({ default: m.AuditPage })));

export function AppRouter() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="app-bg-dark min-h-screen grid place-items-center text-sm text-white/70">Carregando…</div>
        }
      >
        <Routes>
          {/* Public */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/demo" element={<HelixDemoPage />} />
          </Route>

          {/* Portal do Cliente (público, sem auth) */}
          <Route path="/portal" element={<ClientPortalPage />} />

          {/* Auth (no sidebar) */}
          <Route element={<AuthLayout />}>
            <Route path="/app/login" element={<LoginPage />} />
          </Route>

          {/* App (protected) */}
          <Route element={<AppLayout />}>
            <Route element={<RequireAuth />}>
              <Route path="/app" element={<DashboardPage />} />
              <Route path="/app/produtividade" element={<ProductivityPage />} />
              <Route path="/app/clientes" element={<ClientsPage />} />
              <Route path="/app/clientes/:clientId" element={<ClientDetailsPage />} />
              <Route path="/app/casos" element={<CasesPage />} />
              <Route path="/app/casos/:caseId" element={<CaseDetailsPage />} />
              <Route path="/app/agenda" element={<AgendaPage />} />
              <Route element={<RequireRole allowed={["admin"]} />}>
                <Route path="/app/agenda/configuracoes" element={<AgendaSettingsPage />} />
              </Route>
              <Route path="/app/tarefas" element={<TasksPage />} />
              <Route path="/app/tarefas/kanban" element={<TasksKanbanPage />} />
              <Route path="/app/tarefas/:taskId" element={<TaskDetailsPage />} />
              <Route element={<RequireRole allowed={["admin"]} />}>
                <Route path="/app/tarefas/lote/:groupId" element={<TaskGroupPage />} />
              </Route>
              <Route path="/app/financeiro" element={<FinancePage />} />
              <Route path="/app/f" element={<FinancePage />} />
              <Route path="/app/financeiro/parceiros" element={<PartnersPage />} />
              <Route path="/app/financeiro/a-pagar" element={<PayablesPage />} />
              <Route path="/app/financeiro/:txId" element={<FinanceTxDetailsPage />} />
              <Route path="/app/portal" element={<Navigate to="/portal" replace />} />

              <Route path="/app/relatorios-ia" element={<AiReportsPage />} />
              <Route path="/app/notificacoes" element={<NotificationsPage />} />
              <Route path="/app/drive" element={<DrivePage />} />
              <Route path="/app/publicacoes" element={<PublicationsPage />} />
              <Route path="/app/configuracoes" element={<SettingsPage />} />

              <Route element={<RequireRole allowed={["admin"]} />}>
                <Route path="/app/configuracoes/equipe" element={<TeamPage />} />
                <Route path="/app/configuracoes/auditoria" element={<AuditPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
