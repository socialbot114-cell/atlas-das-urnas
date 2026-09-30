import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const maplibreDist = fileURLToPath(new URL("./node_modules/maplibre-gl/dist/", import.meta.url));
const mapWorkers = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

function maplibreWorkers() {
  return {
    name: "maplibre-workers",
    configureServer(server) {
      for (const name of mapWorkers) {
        server.middlewares.use(`/${name}`, (_request, response) => {
          response.setHeader("Content-Type", "text/javascript; charset=utf-8");
          response.end(readFileSync(`${maplibreDist}${name}`));
        });
      }
    },
    generateBundle() {
      for (const name of mapWorkers) {
        this.emitFile({ type: "asset", fileName: name, source: readFileSync(`${maplibreDist}${name}`) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), maplibreWorkers()],
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
