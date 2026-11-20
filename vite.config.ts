import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";
import fs from "fs";
import { STATIC_PAGES, renderStaticHtml } from "./src/lib/seo/static-pages";

/**
 * After the build, writes a plain-HTML copy of index.html for each public tool
 * page (dist/tools/.../index.html) with that page's title, description and
 * readable text. nginx serves these files for those exact addresses (see the
 * PR #193 nginx note; `serve -s` itself always answers with dist/index.html),
 * so crawlers and link previews that do not run JavaScript read real content.
 * React replaces it on load. Content lives in src/lib/seo/static-pages.ts.
 */
function staticPagesPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "static-pages",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const indexPath = path.join(outDir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const indexHtml = fs.readFileSync(indexPath, "utf8");
      const siteUrl = process.env.VITE_PUBLIC_SITE_URL?.trim() || "https://formanova.ai";
      for (const page of STATIC_PAGES) {
        const dir = path.join(outDir, page.path);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.html"), renderStaticHtml(indexHtml, page, siteUrl));
      }
    },
  };
}

/**
 * Converts render-blocking <link rel="stylesheet"> tags to non-render-blocking
 * async pattern. Emits both a high-priority preload hint (so the browser's
 * preload scanner fetches the CSS immediately during HTML parse) and a
 * media="print" link (so CSS never blocks rendering). onload swaps media to
 * "all" once the file is ready.
 */
function asyncCssPlugin(): Plugin {
  return {
    name: "async-css",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(
        /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/g,
        `<link rel="preload" as="style" crossorigin href="$1">
    <link rel="stylesheet" crossorigin href="$1" media="print" onload="this.media='all'">
    <noscript><link rel="stylesheet" crossorigin href="$1"></noscript>`
      );
    },
  };
}

/**
 * Generates public/version.json on each production build with a timestamp.
 * The app polls this file to detect new deployments.
 */
function versionJsonPlugin(): Plugin {
  return {
    name: "version-json",
    apply: "build",
    closeBundle() {
      const version = Date.now().toString(36);
      const outPath = path.resolve(__dirname, "dist/version.json");
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify({ version }));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const backendTarget = process.env.VITE_PIPELINE_API_URL || 'http://localhost:8005';

  return {
    server: {
      host: "::",
      port: 8080,
      proxy: {
        '/shopify': backendTarget,
        '/api': backendTarget,
        '/auth': backendTarget,
        '/billing': backendTarget,
      },
    },
    plugins: [
      react(),
      staticPagesPlugin(),
      mode === "development" && componentTagger(),
      ViteImageOptimizer({
        png: { quality: 70 },
        jpeg: { quality: 70 },
        jpg: { quality: 70 },
        webp: { quality: 65 },
      }),
      mode === "production" && asyncCssPlugin(),
      versionJsonPlugin(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      sourcemap: mode === "development",
      target: "es2022",
      rollupOptions: {
        output: {
          // Emitted .mjs files (the pdf.js worker) get a .js name: the production
          // nginx has no .mjs MIME type, sends them as application/octet-stream,
          // and the browser refuses to start a module worker from that.
          assetFileNames: (asset) =>
            (asset.names?.[0] ?? '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
          manualChunks: {
            "vendor-framer": ["framer-motion"],
            "vendor-posthog": ["posthog-js", "posthog-js/react"],
          },
        },
      },
    },
  };
});
