import { babel } from "@rollup/plugin-babel";
import { terser } from "rollup-plugin-terser";
import scss from "rollup-plugin-scss";
import modify from 'rollup-plugin-modify'

export default {
  input: "src/lazyframe.js",
  output: {
    file: "dist/lazyframe.min.js",
    format: "umd",
    exports: "default",
    name: "lazyframe",
    sourcemap: false,
  },
  plugins: [
    modify({
      find: "import './scss/lazyframe.scss?raw';",
      replace: "import './scss/lazyframe.scss';",
    }),
    babel({
      exclude: "node_modules/**",
      babelHelpers: "bundled",
    }),
    terser(),
    scss({
      output: "dist/lazyframe.css",
      outputStyle: "compressed",
    }),
  ],
};
