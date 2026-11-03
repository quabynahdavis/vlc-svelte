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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/lucide-svelte')) {
            return 'lucide-icons';
          }
          if (id.includes('node_modules/fuse.js')) {
            return 'fuse';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
