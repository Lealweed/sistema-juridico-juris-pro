import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SpeedInsights } from '@vercel/speed-insights/react';

import './index.css';
import { AppRouter } from './router/AppRouter';
import { AuthProvider } from '@/auth/authStore';
import { initTheme } from '@/lib/theme';

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRouter />
        <SpeedInsights />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
