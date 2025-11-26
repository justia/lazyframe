import { babel } from "@rollup/plugin-babel";
import typescript from '@rollup/plugin-typescript';
import { terser } from "rollup-plugin-terser";
import scss from "rollup-plugin-scss";

export default {
  input: "src/lazyframe.ts",
  output: {
    file: "dist/lazyframe.min.js",
    format: "umd",
    exports: "default",
    name: "lazyframe",
    sourcemap: false,
  },
  plugins: [
    typescript(), // Re-added typescript plugin
    babel({
      babelrc: true, // Use babel.config.json
      exclude: "node_modules/**",
      babelHelpers: "runtime", // Use runtime helpers
    }),

    terser(),

    scss({
      output: "dist/lazyframe.css",
      outputStyle: "compressed",
    }),
  ],
};