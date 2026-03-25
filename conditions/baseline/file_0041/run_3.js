# Refactored Webpack Configuration

The main goals of this refactoring are:
1. Extract complex configurations into dedicated helper functions
2. Reduce nesting and improve readability
3. Group related logic together
4. Eliminate repetition

```javascript
// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @remove-on-eject-end
'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const resolve = require('resolve');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const InlineChunkHtmlPlugin = require('react-dev-utils/InlineChunkHtmlPlugin');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');
const InterpolateHtmlPlugin = require('react-dev-utils/InterpolateHtmlPlugin');
const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');
const getCSSModuleLocalIdent = require('react-dev-utils/getCSSModuleLocalIdent');
const ESLintPlugin = require('eslint-webpack-plugin');
const paths = require('./paths');
const modules = require('./modules');
const getClientEnvironment = require('./env');
const ModuleNotFoundPlugin = require('react-dev-utils/ModuleNotFoundPlugin');
const ForkTsCheckerWebpackPlugin =
  process.env.TSC_COMPILE_ON_ERROR === 'true'
    ? require('react-dev-utils/ForkTsCheckerWarningWebpackPlugin')
    : require('react-dev-utils/ForkTsCheckerWebpackPlugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
// @remove-on-eject-begin
const getCacheIdentifier = require('react-dev-utils/getCacheIdentifier');
// @remove-on-eject-end
const createEnvironmentHash = require('./webpack/persistentCache/createEnvironmentHash');

// ─── Constants ───────────────────────────────────────────────────────────────

const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';
const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false';
const emitErrorsAsWarnings = process.env.ESLINT_NO_DEV_ERRORS === 'true';
const disableESLintPlugin = process.env.DISABLE_ESLINT_PLUGIN === 'true';
const imageInlineSizeLimit = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000');

const useTypeScript = fs.existsSync(paths.appTsConfig);
const useTailwind = fs.existsSync(path.join(paths.appPath, 'tailwind.config.js'));
const swSrc = paths.swSrc;

// ─── Regex Patterns ──────────────────────────────────────────────────────────

const CSS_REGEX = /\.css$/;
const CSS_MODULE_REGEX = /\.module\.css$/;
const SASS_REGEX = /\.(scss|sass)$/;
const SASS_MODULE_REGEX = /\.module\.(scss|sass)$/;

// ─── Runtime Entries ─────────────────────────────────────────────────────────

const reactRefreshRuntimeEntry = require.resolve('react-refresh/runtime');
const reactRefreshWebpackPluginRuntimeEntry = require.resolve(
  '@pmmmwh/react-refresh-webpack-plugin'
);
const babelRuntimeEntry = require.resolve('babel-preset-react-app');
const babelRuntimeEntryHelpers = require.resolve(
  '@babel/runtime/helpers/esm/assertThisInitialized',
  { paths: [babelRuntimeEntry] }
);
const babelRuntimeRegenerator = require.resolve('@babel/runtime/regenerator', {
  paths: [babelRuntimeEntry],
});

// ─── JSX Runtime Detection ───────────────────────────────────────────────────

const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') return false;
  try {
    require.resolve('react/jsx-runtime');
    return true;
  } catch {
    return false;
  }
})();

// ─── PostCSS Plugins ─────────────────────────────────────────────────────────

const postcssPluginsDefault = [
  'postcss-flexbugs-fixes',
  ['postcss-preset-env', { autoprefixer: { flexbox: 'no-2009' }, stage: 3 }],
  'postcss-normalize',
];

const postcssPluginsTailwind = [
  'tailwindcss',
  'postcss-flexbugs-fixes',
  ['postcss-preset-env', { autoprefixer: { flexbox: 'no-2009' }, stage: 3 }],
];

const postcssPlugins = useTailwind ? postcssPluginsTailwind : postcssPluginsDefault;

// ─── HTML Minification Options ───────────────────────────────────────────────

const htmlMinifyOptions = {
  removeComments: true,
  collapseWhitespace: true,
  removeRedundantAttributes: true,
  useShortDoctype: true,
  removeEmptyAttributes: true,
  removeStyleLinkTypeAttributes: true,
  keepClosingSlash: true,
  minifyJS: true,
  minifyCSS: true,
  minifyURLs: true,
};

// ─── Terser Options ──────────────────────────────────────────────────────────

const createTerserOptions = (isEnvProductionProfile) => ({
  terserOptions: {
    parse: { ecma: 8 },
    compress: {
      ecma: 5,
      warnings: false,
      comparisons: false,
      inline: 2,
    },
    mangle: { safari10: true },
    keep_classnames: isEnvProductionProfile,
    keep_fnames: isEnvProductionProfile,
    output: {
      ecma: 5,
      comments: false,
      ascii_only: true,
    },
  },
});

// ─── Babel Cache Identifier ──────────────────────────────────────────────────

// @remove-on-eject-begin
const getBabelCacheIdentifier = (env) =>
  getCacheIdentifier(env, [
    'babel-plugin-named-asset-import',
    'babel-preset-react-app',
    'react-dev-utils',
    'react-scripts',
  ]);
// @remove-on-eject-end

// ─── Main Config Factory ─────────────────────────────────────────────────────

module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';
  const isEnvProductionProfile = isEnvProduction && process.argv.includes('--profile');

  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  // Shared source map option based on environment
  const sourceMap = isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

  // @remove-on-eject-begin
  const babelEnvName = isEnvProduction ? 'production' : isEnvDevelopment && 'development';
  // @remove-on-eject-end

  // ─── Style Loaders ─────────────────────────────────────────────────────────

  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = [
      isEnvDevelopment && require.resolve('style-loader'),
      isEnvProduction && {
        loader: MiniCssExtractPlugin.loader,
        options: paths.publicUrlOrPath.startsWith('.') ? { publicPath: '../../' } : {},
      },
      {
        loader: require.resolve('css-loader'),
        options: cssOptions,
      },
      {
        loader: require.resolve('postcss-loader'),
        options: {
          postcssOptions: {
            ident: 'postcss',
            config: false,
            plugins: postcssPlugins,
          },
          sourceMap,
        },
      },
    ].filter(Boolean);

    if (preProcessor) {
      loaders.push(
        {
          loader: require.resolve('resolve-url-loader'),
          options: { sourceMap, root: paths.appSrc },
        },
        {
          loader: require.resolve(preProcessor),
          options: { sourceMap: true },
        }
      );
    }

    return loaders;
  };

  // ─── Module Rules ──────────────────────────────────────────────────────────

  const moduleRules = [
    shouldUseSourceMap && {
      enforce: 'pre',
      exclude: /@babel(?:\/|\\{1,2})runtime/,
      test: /\.(js|mjs|jsx|ts|tsx|css)$/,
      loader: require.resolve('source-map-loader'),
    },
    {
      oneOf: [
        {
          test: /\.avif$/,
          type: 'asset',
          mimetype: 'image/avif',
          parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } },
        },
        {
          test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
          type: 'asset',
          parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } },
        },
        {
          test: /\.svg$/,
          issuer: { and: [/\.(ts|tsx|js|jsx|md|mdx)$/] },
          use: [
            {
              loader: require.resolve('@svgr/webpack'),
              options: {
                prettier: false,
                svgo: false,
                svgoConfig: { plugins: [{ removeViewBox: false }] },
                titleProp: true,
                ref: true,
              },
            },
            {
              loader: require.resolve('file-loader'),
              options: { name: 'static/media/[name].[hash].[ext]' },
            },
          ],
        },
        // Application JS/TS (processed with full Babel preset)
        {
          test: /\.(js|mjs|jsx|ts|tsx)$/,
          include: paths.appSrc,
          loader: require.resolve('babel-loader'),
          options: {
            customize: require.resolve('babel-preset-react-app/webpack-overrides'),
            presets: [
              [
                require.resolve('babel-preset-react-app'),
                { runtime: hasJsxRuntime ? 'automatic' : 'classic' },
              ],
            ],
            // @remove-on-eject-begin
            babelrc: false,
            configFile: false,
            cacheIdentifier: getBabelCacheIdentifier(babelEnvName),
            // @remove-on-eject-end
            plugins: [
              isEnvDevelopment &&
                shouldUseReactRefresh &&
                require.resolve('react-refresh/babel'),
            ].filter(Boolean),
            cacheDirectory: true,
            cacheCompression: false,
            compact: isEnvProduction,
          },
        },
        // External JS (processed with minimal Babel preset)
        {
          test: /\.(js|mjs)$/,
          exclude: /@babel(?:\/|\\{1,2})runtime/,
          loader: require.resolve('babel-loader'),
          options: {
            babelrc: false,
            configFile: false,
            compact: false,
            presets: [
              [require.resolve('babel-preset-react-app/dependencies'), { helpers: true }],
            ],
            cacheDirectory: true,
            cacheCompression: false,
            // @remove-on-eject-begin
            cacheIdentifier: getBabelCacheIdentifier(babelEnvName),
            // @remove-on-eject-end
            sourceMaps: shouldUseSourceMap,
            inputSourceMap: shouldUseSourceMap,
          },
        },
        // CSS (global)
        {
          test: CSS_REGEX,
          exclude: CSS_MODULE_REGEX,
          use: getStyleLoaders({ importLoaders: 1, sourceMap, modules: { mode: 'icss' } }),
          sideEffects: true,
        },
        // CSS Modules
        {
          test: CSS_MODULE_REGEX,
          use: getStyleLoaders({
            importLoaders: 1,
            sourceMap,
            modules: { mode: 'local', getLocalIdent: getCSSModuleLocalIdent },
          }),
        },
        // SASS (global)
        {
          test: SASS_REGEX,
          exclude: SASS_MODULE_REGEX,
          use: getStyleLoaders(
            { importLoaders: 3, sourceMap, modules: { mode: 'icss' } },
            'sass-loader'
          ),
          sideEffects: true,
        },
        // SASS Modules
        {
          test: SASS_MODULE_REGEX,
          use: getStyleLoaders(
            {
              importLoaders: 3,
              sourceMap,
              modules: { mode: 'local', getLocalIdent: getCSSModuleLocalIdent },
            },
            'sass-loader'
          ),
        },
        // Fallback: all other assets
        {
          exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
          type: 'asset/resource',
        },
      ],
    },
  ].filter(Boolean);

  // ─── Plugins ───────────────────────────────────────────────────────────────

  const plugins = [
    new HtmlWebpackPlugin({
      inject: true,
      template: paths.appHtml,
      ...(isEnvProduction && { minify: htmlMinifyOptions }),
    }),
    isEnvProduction &&
      shouldInlineRuntimeChunk &&
      new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
    new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
    new ModuleNotFoundPlugin(paths.appPath),
    new webpack.DefinePlugin(env.stringified),
    isEnvDevelopment &&
      shouldUseReactRefresh &&
      new ReactRefreshWebpackPlugin({ overlay: false }),
    isEnvDevelopment && new CaseSensitivePathsPlugin(),
    isEnvProduction &&
      new MiniCssExtractPlugin({
        filename: 'static/css/[name].[contenthash:8].css',
        chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
      }),
    new WebpackManifestPlugin({
      fileName: 'asset-manifest.json',
      publicPath: paths.publicUrlOrPath,
      generate: (seed, files, entrypoints) => ({
        files: files.reduce((manifest, file) => {
          manifest[file.name] = file.path;
          return manifest;
        }, seed),
        entrypoints: entrypoints.main.filter((f) => !f.endsWith('.map')),
      }),
    }),
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/,
    }),
    isEnvProduction &&
      fs.existsSync(swSrc) &&
      new WorkboxWebpackPlugin.InjectManifest({
        swSrc,
        dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
        exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }),
    useTypeScript &&
      new ForkTsCheckerWebpackPlugin({
        async: isEnvDevelopment,
        typescript: {
          typescriptPath: resolve.sync('typescript', { basedir: paths.appNodeModules }),
          configOverwrite: {
            compilerOptions: {
              sourceMap,
              skipLibCheck: true,
              inlineSourceMap: false,
              declarationMap: false,
              noEmit: true,
              incremental: true,
              tsBuildInfoFile: paths.appTsBuildInfoFile,
            },
          },
          context: paths.appPath,
          diagnosticOptions: { syntactic: true },
          mode: 'write-references',
        },
        issue: {
          include: [
            { file: '../**/src/**/*.{ts,tsx}' },
            { file: '**/src/**/*.{ts,tsx}' },
          ],
          exclude: [
            { file: '**/src/**/__tests__/**' },
            { file: '**/src/**/?(*.){spec|test}.*' },
            { file: '**/src/setupProxy.*' },
            { file: '**/src/setupTests.*' },
          ],
        },
        logger: { infrastructure: 'silent' },
      }),
    !disableESLintPlugin &&
      new ESLintPlugin({
        extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
        formatter: require.resolve('react-dev-utils/eslintFormatter'),
        eslintPath: require.resolve('eslint'),
        failOnError: !(isEnvDevelopment && emitErrorsAsWarnings),
        context: paths.appSrc,
        cache: true,
        cacheLocation: path.resolve(paths.appNodeModules, '.cache/.eslintcache'),
        cwd: paths.appPath,
        resolvePluginsRelativeTo: __dirname,
        baseConfig: {
          extends: [require.resolve('eslint-config-react-app/base')],
          rules: {
            ...(!hasJsxRuntime && { 'react/react-in-jsx-scope': 'error' }),
          },
        },
      }),
  ].filter(Boolean);

  // ─── Final Config ──────────────────────────────────────────────────────────

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    bail: isEnvProduction,
    devtool: isEnvProduction
      ? shouldUseSourceMap && 'source-map'
      : isEnvDevelopment && 'cheap-module-source-map',
    entry: paths.appIndexJs,
    output: {
      path: paths.appBuild,
      pathinfo: isEnvDevelopment,
      filename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].js'
        : isEnvDevelopment && 'static/js/bundle.js',
      chunkFilename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].chunk.js'
        : isEnvDevelopment && 'static/js/[name].chunk.js',
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      publicPath: paths.publicUrlOrPath,
      devtoolModuleFilenameTemplate: isEnvProduction
        ? (info) => path.relative(paths.appSrc, info.absoluteResourcePath).replace(/\\/g, '/')
        : isEnvDevelopment &&
          ((info) => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
    },
    cache: {
      type: 'filesystem',
      version: createEnvironmentHash(env.raw),
      cacheDirectory: paths.appWebpackCache,
      store: 'pack',
      buildDependencies: {
        defaultWebpack: ['webpack/lib/'],
        config: [__filename],
        tsconfig: [paths.appTsConfig, paths.appJsConfig].filter((f) => fs.existsSync(f)),
      },
    },
    infrastructureLogging: { level: 'none' },
    optimization: {
      minimize: isEnvProduction,
      minimizer: [
        new TerserPlugin(createTerserOptions(isEnvProductionProfile)),
        new CssMinimizerPlugin(),
      ],
    },
    resolve: {
      modules: ['node_modules', paths.appNodeModules].concat(
        modules.additionalModulePaths || []
      ),
      extensions: paths.moduleFileExtensions
        .map((ext) => `.${ext}`)
        .filter((ext) => useTypeScript || !ext.includes('ts')),
      alias: {
        'react-native': 'react-native-web',
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
        ...(modules.webpackAliases || {}),
      },
      plugins: [
        new ModuleScopePlugin(paths.appSrc, [
          paths.appPackageJson,
          reactRefreshRuntimeEntry,
          reactRefreshWebpackPluginRuntimeEntry,
          babelRuntimeEntry,
          babelRuntimeEntryHelpers,
          babelRuntimeRegenerator,
        ]),
      ],
    },
    module: {
      strictExportPresence: true,
      rules: moduleRules,
    },
    plugins,
    performance: false,
  };
};
```

## Key Changes

| Area | Change |
|---|---|
| **Constants** | Moved all top-level constants (`shouldUseSourceMap`, regex patterns, etc.) to a clearly labelled section |
| **`sourceMap`** | Extracted repeated `isEnvProduction ? shouldUseSourceMap : isEnvDevelopment` into a single `sourceMap` variable |
| **PostCSS plugins** | Extracted `postcssPluginsDefault` / `postcssPluginsTailwind` arrays, eliminating the nested ternary inside `getStyleLoaders` |
| **HTML minify options** | Extracted `htmlMinifyOptions` object, removing deep nesting in `HtmlWebpackPlugin` config |
| **Terser options** | Extracted into `createTerserOptions(isEnvProductionProfile)` factory function |
| **Babel cache identifier** | Extracted `getBabelCacheIdentifier` helper to remove duplicated `getCacheIdentifier` calls |
| **Module rules** | Moved into a named `moduleRules` variable for clarity |
| **Plugins** | Moved into a named `plugins` variable for clarity |
| **`HtmlWebpackPlugin`** | Replaced `Object.assign({}, base, conditional)` with a cleaner spread pattern |
| **`WebpackManifestPlugin`** | Simplified `generate` to a single-expression arrow function |