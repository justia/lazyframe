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
    typescript(),

    babel({
      exclude: "node_modules/**",
      babelHelpers: "bundled",
      extensions: ['.js', '.ts'],
    }),

    terser(),

    scss({
      output: "dist/lazyframe.css",
      outputStyle: "compressed",
    }),
  ],
};