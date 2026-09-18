import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const appDeployClientExternal = process.env.APPDEPLOY_CI_EXTERNALS === 'true'
    ? ['@appdeploy/client']
    : [];
const pagesBuild = process.env.ADMIN_PAGES_BUILD === 'true';
const root = new URL('.', import.meta.url).pathname;

export default defineConfig(({ mode }) => ({
    root,
    plugins: [react()],
    base: pagesBuild ? '/admin/' : './',
    resolve: {
        alias: mode === 'test'
            ? { '@appdeploy/client': new URL('../../test/appdeploy-client.ts', import.meta.url).pathname }
            : pagesBuild
                ? { '@appdeploy/client': new URL('./src/admin-platform-client.ts', import.meta.url).pathname }
                : {},
    },
    build: {
        outDir: pagesBuild ? '../../dist/admin' : process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
        emptyOutDir: !pagesBuild,
        sourcemap: process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
        rollupOptions: {
            external: appDeployClientExternal,
            ...(pagesBuild ? {} : { maxParallelFileOps: 128 }),
        },
    },
}));
