import typescript from '@rollup/plugin-typescript';
import terser from "@rollup/plugin-terser";
import scss from "rollup-plugin-scss";
import livereload from "rollup-plugin-livereload";
// @ts-expect-error Types are not exported correctly for this package.
import serve from "rollup-plugin-serve";

const input = "src/lazyframe.ts";
const distFolder = "dist";

// Detect ("watch" mode) vs ("build" mode)
const isDev = process.env.ROLLUP_WATCH === 'true';

// Define SCSS plugin configuration once to reuse it
const scssPlugin = scss({
  fileName: "lazyframe.css",
  outputStyle: "compressed",
  // Only generate CSS source maps in dev mode
  sourceMap: isDev 
});

export default [
  // UMD Build (Minified, for Browser)
  {
    input,
    output: {
      file: `${distFolder}/lazyframe.min.js`,
      format: "umd",
      exports: "default",
      name: "lazyframe",
      sourcemap: isDev,
    },
    plugins: [
      typescript({ sourceMap: isDev, inlineSources: isDev }),
      terser(),
      scssPlugin,

      // Serve and Livereload ONLY happen in dev mode
      isDev && serve({
        open: true,
        contentBase: ['.'], 
        port: 8080,
      }),
      isDev && livereload({
        watch: ['dist', 'index.html'],
      })
    ],
  },

  // ESM Build (Modern, for Bundlers)
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
          target: "ESNext", // No polyfills
        }
      }),
      scssPlugin,
    ],
  }
];