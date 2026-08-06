import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Worktrees under .claude/worktrees/* hold divergent copies of the
    // repo for parallel agent runs — their tests would report against
    // stale code if picked up here, and Vitest's default globs sweep
    // everything under cwd. Exclude them explicitly.
    exclude: ["node_modules", "dist", ".next", ".claude/worktrees/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
