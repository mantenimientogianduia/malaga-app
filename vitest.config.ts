import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // Los tests de integración pegan contra la misma base compartida real
    // (esquema malaga) y usan TRUNCATE — correr archivos en paralelo produce
    // deadlocks y datos pisados entre tests. Se corren en serie a propósito.
    fileParallelism: false,
  },
});
