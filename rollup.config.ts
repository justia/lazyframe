import typescript from '@rollup/plugin-typescript';
import terser from "@rollup/plugin-terser";
import scss from "rollup-plugin-scss";

const input = "src/lazyframe.ts";
const distFolder = "dist";

// Define SCSS plugin configuration once to reuse it
const scssPlugin = scss({
  fileName: "lazyframe.css",
  outputStyle: "compressed",
});

export default [
  // Configuration 1: UMD Build (Minified, ES2015 / Legacy Support)
  {
    input,
    output: {
      file: `${distFolder}/lazyframe.min.js`,
      format: "umd",
      exports: "default",
      name: "lazyframe",
      sourcemap: false,
    },
    plugins: [
      typescript(), // Uses default tsconfig.json (target: ES2015)
      terser(),
      scssPlugin,
    ],
  },

  // Configuration 2: ESM Build (Clean, Modern, ESNext)
  {
    input,
    output: {
      file: `${distFolder}/lazyframe.esm.js`,
      format: "esm",
      sourcemap: false,
    },
    plugins: [
      typescript({
        compilerOptions: {
          target: "ESNext", // Force modern target to remove polyfills
        }
      }),
      scssPlugin,
    ],
  }
];