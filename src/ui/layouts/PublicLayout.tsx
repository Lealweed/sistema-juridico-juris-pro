import { Outlet } from 'react-router-dom';
import { PublicNavbar } from '@/ui/navigation/PublicNavbar';
import { PublicFooter } from '@/ui/navigation/PublicFooter';
import { AppToaster } from '@/ui/widgets/AppToaster';

export default function PublicLayout() {
  return (
    <div className="min-h-dvh app-bg theme-light">
      <AppToaster />
      <PublicNavbar />
      <main>
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
