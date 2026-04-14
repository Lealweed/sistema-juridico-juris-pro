import { Toaster } from 'react-hot-toast';

export function AppToaster() {
  return <Toaster position="top-right" toastOptions={{ duration: 4000 }} />;
}
