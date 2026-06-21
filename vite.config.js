import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pwaIconPath = path.resolve(__dirname, "src/assets/wgcc.png");
const pwaIconFileName = "assets/wgcc.png";

function createManifest() {
  return {
    name: "WGCC Restaurant",
    short_name: "WGCC",
    description: "Order ahead from the Walkerton Golf & Curling Club Restaurant clubhouse menu.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7ef",
    theme_color: "#102a1c",
    icons: [
      {
        src: `/${pwaIconFileName}`,
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any"
      },
      {
        src: `/${pwaIconFileName}`,
        sizes: "1254x1254",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}

function wgccPwaIcons() {
  return {
    name: "wgcc-pwa-icons",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === "/assets/wgcc.png") {
          response.setHeader("Content-Type", "image/png");
          response.end(fs.readFileSync(pwaIconPath));
          return;
        }

        if (request.url === "/manifest.webmanifest") {
          response.setHeader("Content-Type", "application/manifest+json");
          response.end(JSON.stringify(createManifest(), null, 2));
          return;
        }

        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: pwaIconFileName,
        source: fs.readFileSync(pwaIconPath)
      });

      this.emitFile({
        type: "asset",
        fileName: "manifest.webmanifest",
        source: JSON.stringify(createManifest(), null, 2)
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), wgccPwaIcons()]
});
