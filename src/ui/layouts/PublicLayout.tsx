import { Outlet } from 'react-router-dom';
import { AppToaster } from '@/ui/widgets/AppToaster';
import { PublicNavbar } from '@/ui/navigation/PublicNavbar';
import { PublicFooter } from '@/ui/navigation/PublicFooter';

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
