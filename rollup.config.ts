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

    terser(),

    scss({
      output: "dist/lazyframe.css",
      outputStyle: "compressed",
    }),
  ],
};