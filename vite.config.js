import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work from any GitHub Pages sub-path (username.github.io/repo-name/).
export default defineConfig({ plugins: [react()], base: './' });
