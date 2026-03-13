import { Outlet } from 'react-router-dom';

import { PublicNavbar } from '@/ui/navigation/PublicNavbar';
import { PublicFooter } from '@/ui/navigation/PublicFooter';

export function PublicLayout() {
  return (
    <div className="min-h-dvh app-bg theme-light">
      <PublicNavbar />
      <main>
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
