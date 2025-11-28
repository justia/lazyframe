import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import scss from 'rollup-plugin-scss';
import livereload from 'rollup-plugin-livereload';
// @ts-expect-error Types are not exported correctly for this package.
import serve from 'rollup-plugin-serve';

const input = 'src/lazyframe.ts';
const distFolder = 'dist';

// Detect ("watch" mode) vs ("build" mode)
const isDev = process.env.ROLLUP_WATCH === 'true';

// Define SCSS plugin configuration once to reuse it
const libScss = scss({
    fileName: 'lazyframe.css',
    outputStyle: 'compressed',
    // Only generate CSS source maps in dev mode
    sourceMap: isDev,
});

const demoFolder = 'demo';
const demoAssetsFolder = `${demoFolder}/assets`;

export default [
    // UMD Build (Minified, for Browser)
    {
        input,
        output: {
            file: `${distFolder}/lazyframe.min.js`,
            format: 'umd',
            exports: 'default',
            name: 'lazyframe',
            sourcemap: isDev,
        },
        plugins: [
            typescript({ sourceMap: isDev, inlineSources: isDev }),
            terser(),
            libScss,

            // Serve and Livereload ONLY happen in dev mode
            isDev &&
                serve({
                    open: true,
                    verbose: true,
                    // SERVE STRATEGY:
                    // 1. Check 'demo' folder (so http://localhost/index.html works)
                    // 2. Check '.' root folder (so http://localhost/dist/lazyframe.js works)
                    contentBase: [demoFolder, '.'],
                    openPage: `/${demoFolder}/index.html`,
                    port: 8080,
                }),
            isDev &&
                livereload({
                    watch: [distFolder, demoFolder],
                }),
        ],
    },

    // ESM Build (Modern, for Bundlers)
    {
        input,
        output: {
            file: `${distFolder}/lazyframe.esm.js`,
            format: 'esm',
            sourcemap: false,
        },
        plugins: [
            typescript({
                compilerOptions: {
                    target: 'ESNext', // No polyfills
                },
            }),
            libScss,
        ],
    },

    // Demo Assets Build
    {
        input: `${demoAssetsFolder}/demo.ts`,
        output: {
            file: `${demoAssetsFolder}/demo.js`, // Helper JS, we ignore this
            format: 'esm',
        },
        plugins: [
            typescript({
                compilerOptions: {
                    outDir: demoAssetsFolder,
                    target: 'ESNext',
                    declaration: false,
                },
            }),
            scss({
                fileName: 'demo.css',
                // outputStyle: 'compressed',
                sourceMap: isDev,
            }),
        ],
    },
];
