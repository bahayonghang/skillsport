import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const packageJson = JSON.parse(
  fs.readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version: string };

const SHELL_PACKAGES = [
  "@base-ui/react",
  "@floating-ui/react",
  "@floating-ui/dom",
  "@floating-ui/core",
  "@floating-ui/utils",
  "tailwind-merge",
  "sonner",
  "cmdk",
  "zustand",
  "clsx",
  "class-variance-authority",
];

function matchesPackage(normalizedId: string, packageName: string): boolean {
  return (
    normalizedId.includes(`/node_modules/${packageName}/`)
    || normalizedId.includes(`/node_modules/.pnpm/${packageName.replaceAll("/", "+")}@`)
  );
}

// 返回 null 的依赖跟着自己的 import 走。markdown 不能进 shell-vendor，
// 否则会和壳层一起在启动时解析。
function vendorChunkName(id: string): string | null {
  if (!id.includes("node_modules")) {
    return null;
  }

  const normalizedId = id.replaceAll("\\", "/");

  if (
    matchesPackage(normalizedId, "react")
    || matchesPackage(normalizedId, "react-dom")
    || matchesPackage(normalizedId, "scheduler")
    || matchesPackage(normalizedId, "react-router")
    || matchesPackage(normalizedId, "react-router-dom")
    || matchesPackage(normalizedId, "@remix-run/router")
  ) {
    return "react-vendor";
  }

  if (
    matchesPackage(normalizedId, "i18next")
    || matchesPackage(normalizedId, "react-i18next")
    || matchesPackage(normalizedId, "i18next-browser-languagedetector")
  ) {
    return "i18n-vendor";
  }

  if (matchesPackage(normalizedId, "lucide-react") || normalizedId.includes("/node_modules/@lobehub/")) {
    return "icon-vendor";
  }

  if (normalizedId.includes("/node_modules/@tauri-apps/")) {
    return "tauri-vendor";
  }

  if (
    SHELL_PACKAGES.some((packageName) => matchesPackage(normalizedId, packageName))
    || normalizedId.includes("/node_modules/@radix-ui/")
  ) {
    return "shell-vendor";
  }

  return null;
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },

  // 限定依赖预扫描入口，避免 Vite 扫到 tmp/ 下的 Chrome 扩展产物
  // （那些 polyfills.js 会 import 'chrome'，导致解析失败警告）
  optimizeDeps: {
    entries: ["index.html", "src/**/*.{ts,tsx,js,jsx}"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 24200,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 24201,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // Windows 模块 id 使用反斜杠，test 用函数而不是只认 `/` 的正则。
              test(id: string) {
                return id.includes("node_modules");
              },
              name(moduleId: string) {
                return vendorChunkName(moduleId);
              },
            },
          ],
        },
      },
    },
  },

  // Vitest configuration
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/support/setup.ts"],
    include: [
      "src/test/**/*.test.{js,jsx,ts,tsx}",
      "src/test/**/*.spec.{js,jsx,ts,tsx}",
    ],
    exclude: ["tmp/**", "dist/**"],
  },
}));
