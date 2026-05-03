/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// https://vite.dev/config/
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const dockerCompose = process.env.DOCKER_COMPOSE === "1";

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [
    // Makes each production build’s index.html unique (view-source → <!-- dnboxes-build:... -->).
    // Useful after `npm run build` when checking a static deploy (Compose uses Vite from ./web instead).
    {
      name: "dnboxes-html-build-stamp",
      transformIndexHtml(html: string) {
        const stamp = new Date().toISOString();
        // Meta tag: CSP allows this; inline <script> is blocked by script-src 'self' only.
        return html.replace(
          "</head>",
          `<meta name="dnboxes-build" content="${stamp}" />\n<!-- dnboxes-build:${stamp} -->\n</head>`,
        );
      },
    },
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // Bind-mount + Docker Desktop: reliable file events for hot reload
    ...(dockerCompose && {
      watch: { usePolling: true, interval: 1000 },
    }),
    // Same-origin /api in dev so session cookies work (avoids empty lobby list when the
    // browser blocks cross-port cookies or Brave treats API calls differently).
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_URL ?? "http://127.0.0.1:8484",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: "hidden",
  },
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            provider: playwright({}),
            headless: true,

            instances: [
              {
                browser: "chromium",
              },
            ],
          },
          setupFiles: [".storybook/vitest.setup.ts"],
        },
      },
    ],
    include: ["packages/**/src/**.{js,jsx,ts,tsx}"],
    // Exclusion is applied for the files that match include pattern above
    // No need to define root level *.config.ts files or node_modules, as we didn't add those in include
    exclude: ["**/some-pattern/**"],
  },
});
