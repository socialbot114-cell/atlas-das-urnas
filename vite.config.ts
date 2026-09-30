import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // MapLibre inclui o renderer GL e os formatos de estilo no mesmo pacote (284 KB gzip).
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/echarts/")) return "charts-vendor";
          if (id.includes("/node_modules/maplibre-gl/")) return "maps-vendor";
        },
      },
    },
  },
});
