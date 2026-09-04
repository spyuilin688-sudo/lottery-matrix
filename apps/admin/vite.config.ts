import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const appDeployClientExternal = process.env.APPDEPLOY_CI_EXTERNALS === 'true'
    ? ['@appdeploy/client']
    : [];

export default defineConfig(({ mode }) => ({
    plugins: [react()],
    base: './',
    resolve: {
        alias: mode === 'test'
            ? { '@appdeploy/client': new URL('../../test/appdeploy-client.ts', import.meta.url).pathname }
            : {},
    },
    build: {
        outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
        sourcemap: process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
        rollupOptions: {
            external: appDeployClientExternal,
            maxParallelFileOps: 128,
        },
    },
}));
