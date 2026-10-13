// Evidence-only server: stable browser fixture while agents finish Rust/docs.
import { defineConfig, mergeConfig } from 'vite';
import base from '../../../../../vite.config.ts';

export default defineConfig(async env => mergeConfig(await base(env), {
  cacheDir: 'outputs/usage-static-vite-cache',
  server: { host: '127.0.0.1', port: 24202, strictPort: true, hmr: false, watch: null },
}));
