/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pagesBuild = process.env.ADMIN_PAGES_BUILD === 'true';
const root = new URL('.', import.meta.url).pathname;

export default defineConfig(({ mode }) => ({
    root,
    plugins: [react()],
    ...(mode === 'test' ? { server: { fs: { allow: [new URL('../..', import.meta.url).pathname] } } } : {}),
    test: {
        setupFiles: [new URL('../../test/dialog-test-setup.ts', import.meta.url).pathname],
    },
    base: pagesBuild ? '/admin/' : './',
    build: {
        outDir: pagesBuild ? '../../dist/admin' : 'dist',
        emptyOutDir: !pagesBuild,
        sourcemap: false,
        rollupOptions: {
            ...(pagesBuild ? {} : { maxParallelFileOps: 128 }),
        },
    },
}));
