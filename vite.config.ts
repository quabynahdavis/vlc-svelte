import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { sveltePreprocess } from 'svelte-preprocess';

export default defineConfig({
  plugins: [
    svelte({
      preprocess: sveltePreprocess({
        typescript: {
          compilerOptions: {
            module: 'esnext',
            moduleResolution: 'bundler',
            target: 'es2022',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            isolatedModules: true,
            noFallthroughCasesInSwitch: true,
          },
        },
      }),
      hot: !process.env.VITE_TAURI,
    }),
  ],
  build: {
    outDir: 'src-tauri/gen/dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
