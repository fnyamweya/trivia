import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // Use tsc for declarations
  splitting: false,
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
});
