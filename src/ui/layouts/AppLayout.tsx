import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/ui/navigation/Sidebar';
import { Topbar } from '@/ui/navigation/Topbar';

export function AppLayout() {
  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100 app-bg-dark theme-dark">
      <div className="mx-auto flex min-h-dvh max-w-[1400px]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="min-w-0 flex-1 px-4 pb-10 pt-6 sm:px-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

