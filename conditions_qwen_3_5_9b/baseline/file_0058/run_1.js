```javascript
// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
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

// Source maps are resource heavy and can cause out of memory issue for large source files.
const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';

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

// Some apps do not need the benefits of saving a web request, so not inlining the chunk
// makes for a smoother build process.
const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false';

const emitErrorsAsWarnings = process.env.ESLINT_NO_DEV_ERRORS === 'true';
const disableESLintPlugin = process.env.DISABLE_ESLINT_PLUGIN === 'true';

const imageInlineSizeLimit = parseInt(
  process.env.IMAGE_INLINE_SIZE_LIMIT || '10000'
);

// Check if TypeScript is setup
const useTypeScript = fs.existsSync(paths.appTsConfig);

// Check if Tailwind config exists
const useTailwind = fs.existsSync(
  path.join(paths.appPath, 'tailwind.config.js')
);

// Get the path to the uncompiled service worker (if it exists).
const swSrc = paths.swSrc;

// style files regexes
const cssRegex = /\.css$/;
const cssModuleRegex = /\.module\.css$/;
const sassRegex = /\.(scss|sass)$/;
const sassModuleRegex = /\.module\.(scss|sass)$/;

const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') {
    return false;
  }

  try {
    require.resolve('react/jsx-runtime');
    return true;
  } catch (e) {
    return false;
  }
})();

// Environment helpers
const isEnvDevelopment = (env) => env === 'development';
const isEnvProduction = (env) => env === 'production';
const isEnvProductionProfile = (env) => env === 'production' && process.argv.includes('--profile');

// Get environment variables to inject into our app.
const getEnv = (publicUrlOrPath) => getClientEnvironment(publicUrlOrPath.slice(0, -1));

// Common function to get style loaders
const getStyleLoaders = (cssOptions, preProcessor) => {
  const loaders = [
    isEnvDevelopment && require.resolve('style-loader'),
    isEnvProduction && {
      loader: MiniCssExtractPlugin.loader,
      options: paths.publicUrlOrPath.startsWith('.')
        ? { publicPath: '../../' }
        : {},
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
          plugins: !useTailwind
            ? [
                'postcss-flexbugs-fixes',
                ['postcss-preset-env', { autoprefixer: { flexbox: 'no-2009' }, stage: 3 }],
                'postcss-normalize',
              ]
            : ['tailwindcss', 'postcss-flexbugs-fixes', ['postcss-preset-env', { autoprefixer: { flexbox: 'no-2009' }, stage: 3 }]],
        },
        sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
      },
    },
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
          root: paths.appSrc,
        },
      },
      {
        loader: require.resolve(preProcessor),
        options: { sourceMap: true },
      }
    );
  }

  return loaders;
};

// Get babel cache identifier
const getBabelCacheIdentifier = (envName, dependencies) =>
  getCacheIdentifier(envName, dependencies);

// Get babel plugins
const getBabelPlugins = (shouldUseReactRefresh) => [
  isEnvDevelopment && shouldUseReactRefresh && require.resolve('react-refresh/babel'),
].filter(Boolean);

// Get webpack optimization minimizer
const getOptimizationMinimizer = () => [
  new TerserPlugin({
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
  }),
  new CssMinimizerPlugin(),
];

// Get webpack resolve plugins
const getResolvePlugins = () => [
  new ModuleScopePlugin(paths.appSrc, [
    paths.appPackageJson,
    reactRefreshRuntimeEntry,
    reactRefreshWebpackPluginRuntimeEntry,
    babelRuntimeEntry,
    babelRuntimeEntryHelpers,
    babelRuntimeRegenerator,
  ]),
];

// Get webpack module rules
const getModuleRules = () => [
  // Handle node_modules packages that contain sourcemaps
  shouldUseSourceMap && {
    enforce: 'pre',
    exclude: /@babel(?:\/|\\{1,2})runtime/,
    test: /\.(js|mjs|jsx|ts|tsx|css)$/,
    loader: require.resolve('source-map-loader'),
  },
  {
    oneOf: [
      {
        test: [/\.avif$/],
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
        issuer: { and: [/\.(ts|tsx|js|jsx|md|mdx)$/] },
      },
      {
        test: /\.(js|mjs|jsx|ts|tsx)$/,
        include: paths.appSrc,
        loader: require.resolve('babel-loader'),
        options: {
          customize: require.resolve('babel-preset-react-app/webpack-overrides'),
          presets: [[require.resolve('babel-preset-react-app'), { runtime: hasJsxRuntime ? 'automatic' : 'classic' }]],
          babelrc: false,
          configFile: false,
          cacheIdentifier: getBabelCacheIdentifier(
            isEnvProduction ? 'production' : 'development',
            ['babel-plugin-named-asset-import', 'babel-preset-react-app', 'react-dev-utils', 'react-scripts']
          ),
          plugins: getBabelPlugins(shouldUseReactRefresh),
          cacheDirectory: true,
          cacheCompression: false,
          compact: isEnvProduction,
        },
      },
      {
        test: /\.(js|mjs)$/,
        exclude: /@babel(?:\/|\\{1,2})runtime/,
        loader: require.resolve('babel-loader'),
        options: {
          babelrc: false,
          configFile: false,
          compact: false,
          presets: [[require.resolve('babel-preset-react-app/dependencies'), { helpers: true }]],
          cacheDirectory: true,
          cacheCompression: false,
          cacheIdentifier: getBabelCacheIdentifier(
            isEnvProduction ? 'production' : 'development',
            ['babel-plugin-named-asset-import', 'babel-preset-react-app', 'react-dev-utils', 'react-scripts']
          ),
          sourceMaps: shouldUseSourceMap,
          inputSourceMap: shouldUseSourceMap,
        },
      },
      {
        test: cssRegex,
        exclude: cssModuleRegex,
        use: getStyleLoaders({
          importLoaders: 1,
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
          modules: { mode: 'icss' },
        }),
        sideEffects: true,
      },
      {
        test: cssModuleRegex,
        use: getStyleLoaders({
          importLoaders: 1,
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
          modules: { mode: 'local', getLocalIdent: getCSSModuleLocalIdent },
        }),
      },
      {
        test: sassRegex,
        exclude: sassModuleRegex,
        use: getStyleLoaders(
          {
            importLoaders: 3,
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
            modules: { mode: 'icss' },
          },
          'sass-loader'
        ),
        sideEffects: true,
      },
      {
        test: sassModuleRegex,
        use: getStyleLoaders(
          {
            importLoaders: 3,
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
            modules: { mode: 'local', getLocalIdent: getCSSModuleLocalIdent },
          },
          'sass-loader'
        ),
      },
      {
        exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
        type: 'asset/resource',
      },
    ],
  },
].filter(Boolean);

// Get webpack plugins
const getPlugins = (env) => [
  // Generates an `index.html` file with the <script> injected.
  new HtmlWebpackPlugin(
    Object.assign(
      {},
      {
        inject: true,
        template: paths.appHtml,
      },
      isEnvProduction(env)
        ? {
            minify: {
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
            },
          }
        : undefined
    )
  ),
  // Inlines the webpack runtime script.
  isEnvProduction(env) &&
    shouldInlineRuntimeChunk &&
    new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
  // Makes some environment variables available in index.html.
  new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
  // This gives some necessary context to module not found errors.
  new ModuleNotFoundPlugin(paths.appPath),
  // Makes some environment variables available to the JS code.
  new webpack.DefinePlugin(env.stringified),
  // Experimental hot reloading for React.
  isEnvDevelopment(env) &&
    shouldUseReactRefresh &&
    new ReactRefreshWebpackPlugin({ overlay: false }),
  // Watcher doesn't work well if you mistype casing in a path.
  isEnvDevelopment(env) && new CaseSensitivePathsPlugin(),
  // Extract CSS to file in production.
  isEnvProduction(env) &&
    new MiniCssExtractPlugin({
      filename: 'static/css/[name].[contenthash:8].css',
      chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
    }),
  // Generate an asset manifest file.
  new WebpackManifestPlugin({
    fileName: 'asset-manifest.json',
    publicPath: paths.publicUrlOrPath,
    generate: (seed, files, entrypoints) => {
      const manifestFiles = files.reduce((manifest, file) => {
        manifest[file.name] = file.path;
        return manifest;
      }, seed);
      const entrypointFiles = entrypoints.main.filter(fileName => !fileName.endsWith('.map'));

      return {
        files: manifestFiles,
        entrypoints: entrypointFiles,
      };
    },
  }),
  // Moment.js optimization.
  new webpack.IgnorePlugin({
    resourceRegExp: /^\.\/locale$/,
    contextRegExp: /moment$/,
  }),
  // Generate a service worker script.
  isEnvProduction(env) &&
    fs.existsSync(swSrc) &&
    new WorkboxWebpackPlugin.InjectManifest({
      swSrc,
      dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    }),
  // TypeScript type checking.
  useTypeScript &&
    new ForkTsCheckerWebpackPlugin({
      async: isEnvDevelopment(env),
      typescript: {
        typescriptPath: resolve.sync('typescript', { basedir: paths.appNodeModules }),
        configOverwrite: {
          compilerOptions: {
            sourceMap: isEnvProduction(env) ? shouldUseSourceMap : isEnvDevelopment(env),
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
  // ESLint plugin.
  !disableESLintPlugin &&
    new ESLintPlugin({
      extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
      formatter: require.resolve('react-dev-utils/eslintFormatter'),
      eslintPath: require.resolve('eslint'),
      failOnError: !(isEnvDevelopment(env) && emitErrorsAsWarnings),
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

// Main webpack configuration
module.exports = function (webpackEnv) {
  const env = getEnv(paths.publicUrlOrPath);
  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction(webpackEnv) ? 'production' : isEnvDevelopment(webpackEnv) && 'development',
    bail: isEnvProduction(webpackEnv),
    devtool: isEnvProduction(webpackEnv)
      ? shouldUseSourceMap
        ? 'source-map'
        : false
      : isEnvDevelopment(webpackEnv) && 'cheap-module-source-map',
    entry: paths.appIndexJs,
    output: {
      path: paths.appBuild,
      pathinfo: isEnvDevelopment(webpackEnv),
      filename: isEnvProduction(webpackEnv)
        ? 'static/js/[name].[contenthash:8].js'
        : isEnvDevelopment(webpackEnv) && 'static/js/bundle.js',
      chunkFilename: isEnvProduction(webpackEnv)
        ? 'static/js/[name].[contenthash:8].chunk.js'
        : isEnvDevelopment(webpackEnv) && 'static/js/[name].chunk.js',
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      publicPath: paths.publicUrlOrPath,
      devtoolModuleFilenameTemplate: isEnvProduction(webpackEnv)
        ? info =>
            path
              .relative(paths.appSrc, info.absoluteResourcePath)
              .replace(/\\/g, '/')
        : isEnvDevelopment(webpackEnv) &&
          (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
    },
    cache: {
      type: 'filesystem',
      version: createEnvironmentHash(env.raw),
      cacheDirectory: paths.appWebpackCache,
      store: 'pack',
      buildDependencies: {
        defaultWebpack: ['webpack/lib/'],
        config: [__filename],
        tsconfig: [paths.appTsConfig, paths.appJsConfig].filter(f => fs.existsSync(f)),
      },
    },
    infrastructureLogging: { level: 'none' },
    optimization: {
      minimize: isEnvProduction(webpackEnv),
      minimizer: getOptimizationMinimizer(),
    },
    resolve: {
      modules: ['node_modules', paths.appNodeModules].concat(modules.additionalModulePaths || []),
      extensions: paths.moduleFileExtensions
        .map(ext => `.${ext}`)
        .filter(ext => useTypeScript || !ext.includes('ts')),
      alias: {
        'react-native': 'react-native-web',
        ...(isEnvProductionProfile(webpackEnv) && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
        ...(modules.webpackAliases || {}),
      },
      plugins: getResolvePlugins(),
    },
    module: {
      strictExportPresence: true,
      rules: getModuleRules(),
    },
    plugins: getPlugins(webpackEnv),
    performance: false,
  };
};
```