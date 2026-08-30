import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const projectRoot = __dirname;
  const clientRoot = path.resolve(projectRoot, 'apps/client');

  // On Vercel this build is copied into dist/booking (see scripts/copy-client-build.mjs)
  // and served under /booking, so asset URLs need that prefix. Local/Capacitor builds
  // (no VERCEL env var) keep the default root-relative base.
  const base = process.env.VERCEL ? '/booking/' : '/';

  return {
    root: clientRoot,
    base,
    publicDir: path.resolve(projectRoot, 'public'),
    server: {
      port: 3001,
      host: '0.0.0.0',
      fs: {
        allow: [projectRoot]
      }
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, '.')
      }
    },
    build: {
      outDir: path.resolve(projectRoot, 'dist-client'),
      emptyOutDir: true
    }
  };
});

