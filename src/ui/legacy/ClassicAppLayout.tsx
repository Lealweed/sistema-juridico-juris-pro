import { Outlet } from 'react-router-dom';
import { ClassicSidebar } from './ClassicSidebar';
import { ClassicTopbar } from './ClassicTopbar';
import { AppToaster } from '@/ui/widgets/AppToaster';

export function ClassicAppLayout() {
  return (
    <div className="workspace-classic min-h-dvh bg-neutral-950 text-neutral-100 app-bg-dark theme-dark">
      <AppToaster />
      <div className="mx-auto flex min-h-dvh max-w-[1400px]">
        <ClassicSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <ClassicTopbar />
          <main className="min-w-0 flex-1 px-4 pb-10 pt-6 sm:px-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
