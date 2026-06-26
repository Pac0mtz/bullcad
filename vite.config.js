import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Replit-friendly Vite config: binds 0.0.0.0 and allows the preview host.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
    // Allow Replit / generic preview proxies to connect.
    allowedHosts: true,
    hmr: { clientPort: 443 },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
});
