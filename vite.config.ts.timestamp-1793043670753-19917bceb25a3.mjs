// vite.config.ts
import { defineConfig } from "file:///home/davisville/Projects/redesign/vlc/node_modules/vite/dist/node/index.js";
import { svelte } from "file:///home/davisville/Projects/redesign/vlc/node_modules/@sveltejs/vite-plugin-svelte/src/index.js";
import { sveltePreprocess } from "file:///home/davisville/Projects/redesign/vlc/node_modules/svelte-preprocess/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [
    svelte({
      preprocess: sveltePreprocess({
        typescript: {
          compilerOptions: {
            module: "esnext",
            moduleResolution: "bundler",
            target: "es2022",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            isolatedModules: true,
            noFallthroughCasesInSwitch: true
          }
        }
      }),
      hot: !process.env.VITE_TAURI
    })
  ],
  build: {
    outDir: "src-tauri/gen/dist",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9kYXZpc3ZpbGxlL1Byb2plY3RzL3JlZGVzaWduL3ZsY1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvZGF2aXN2aWxsZS9Qcm9qZWN0cy9yZWRlc2lnbi92bGMvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvZGF2aXN2aWxsZS9Qcm9qZWN0cy9yZWRlc2lnbi92bGMvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCB7IHN2ZWx0ZSB9IGZyb20gJ0BzdmVsdGVqcy92aXRlLXBsdWdpbi1zdmVsdGUnO1xuaW1wb3J0IHsgc3ZlbHRlUHJlcHJvY2VzcyB9IGZyb20gJ3N2ZWx0ZS1wcmVwcm9jZXNzJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHN2ZWx0ZSh7XG4gICAgICBwcmVwcm9jZXNzOiBzdmVsdGVQcmVwcm9jZXNzKHtcbiAgICAgICAgdHlwZXNjcmlwdDoge1xuICAgICAgICAgIGNvbXBpbGVyT3B0aW9uczoge1xuICAgICAgICAgICAgbW9kdWxlOiAnZXNuZXh0JyxcbiAgICAgICAgICAgIG1vZHVsZVJlc29sdXRpb246ICdidW5kbGVyJyxcbiAgICAgICAgICAgIHRhcmdldDogJ2VzMjAyMicsXG4gICAgICAgICAgICBzdHJpY3Q6IHRydWUsXG4gICAgICAgICAgICBlc01vZHVsZUludGVyb3A6IHRydWUsXG4gICAgICAgICAgICBza2lwTGliQ2hlY2s6IHRydWUsXG4gICAgICAgICAgICBmb3JjZUNvbnNpc3RlbnRDYXNpbmdJbkZpbGVOYW1lczogdHJ1ZSxcbiAgICAgICAgICAgIGlzb2xhdGVkTW9kdWxlczogdHJ1ZSxcbiAgICAgICAgICAgIG5vRmFsbHRocm91Z2hDYXNlc0luU3dpdGNoOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIGhvdDogIXByb2Nlc3MuZW52LlZJVEVfVEFVUkksXG4gICAgfSksXG4gIF0sXG4gIGJ1aWxkOiB7XG4gICAgb3V0RGlyOiAnc3JjLXRhdXJpL2dlbi9kaXN0JyxcbiAgICBlbXB0eU91dERpcjogdHJ1ZSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTE3MyxcbiAgICBzdHJpY3RQb3J0OiB0cnVlLFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQW9TLFNBQVMsb0JBQW9CO0FBQ2pVLFNBQVMsY0FBYztBQUN2QixTQUFTLHdCQUF3QjtBQUVqQyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxZQUFZLGlCQUFpQjtBQUFBLFFBQzNCLFlBQVk7QUFBQSxVQUNWLGlCQUFpQjtBQUFBLFlBQ2YsUUFBUTtBQUFBLFlBQ1Isa0JBQWtCO0FBQUEsWUFDbEIsUUFBUTtBQUFBLFlBQ1IsUUFBUTtBQUFBLFlBQ1IsaUJBQWlCO0FBQUEsWUFDakIsY0FBYztBQUFBLFlBQ2Qsa0NBQWtDO0FBQUEsWUFDbEMsaUJBQWlCO0FBQUEsWUFDakIsNEJBQTRCO0FBQUEsVUFDOUI7QUFBQSxRQUNGO0FBQUEsTUFDRixDQUFDO0FBQUEsTUFDRCxLQUFLLENBQUMsUUFBUSxJQUFJO0FBQUEsSUFDcEIsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLGFBQWE7QUFBQSxFQUNmO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsRUFDZDtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
