import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/ui/navigation/Sidebar';
import { Topbar } from '@/ui/navigation/Topbar';
import { AppToaster } from '@/ui/widgets/AppToaster';
import { getWorkspaceVisual, isReferenceSurface } from '@/lib/workspaceVisual';
import { ClassicAppLayout } from '@/ui/legacy/ClassicAppLayout';

export function AppLayout() {
  return getWorkspaceVisual() === 'reference' ? <ReferenceAppLayout /> : <ClassicAppLayout />;
}

function ReferenceAppLayout() {
  const { pathname } = useLocation();
  const adapted = isReferenceSurface(pathname);
  return (
    <div className="workspace-reference workspace-light min-h-dvh bg-[#f5f5f4] text-[#172026]">
      <AppToaster />
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className={`${adapted ? 'workspace-surface' : 'workspace-legacy-content app-bg-dark theme-dark text-neutral-100'} min-w-0 flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-7`}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

