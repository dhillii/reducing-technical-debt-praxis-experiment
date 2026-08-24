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

/**
 * Determines whether to use React Refresh based on environment configuration.
 * @param {object} env - Client environment configuration.
 * @returns {boolean} Whether Fast Refresh is enabled.
 */
function shouldUseReactRefresh(env) {
  return env.raw.FAST_REFRESH;
}

/**
 * Builds a list of style loaders based on environment and preprocessor.
 * @param {object} cssOptions - CSS loader options.
 * @param {string|null} preProcessor - Optional preprocessor (e.g., 'sass-loader').
 * @returns {Array} Array of loader configurations.
 */
function buildStyleLoaders(cssOptions, preProcessor) {
  const loaders = [
    buildDevelopmentStyleLoader(),
    buildProductionStyleLoader(),
    buildCssLoader(cssOptions),
    buildPostCssLoader(),
  ].filter(Boolean);
  if (preProcessor) {
    loaders.push(
      buildResolveUrlLoader(),
      buildPreProcessorLoader(preProcessor)
    );
  }
  return loaders;
}

/**
 * Returns style-loader for development mode.
 * @returns {string|undefined} Style loader config or undefined.
 */
function buildDevelopmentStyleLoader() {
  return process.env === 'development' && require.resolve('style-loader');
}

/**
 * Returns MiniCssExtractPlugin loader for production mode.
 * @returns {object|undefined} MiniCssExtractPlugin loader config or undefined.
 */
function buildProductionStyleLoader() {
  if (process.env !== 'production') return;
  return {
    loader: MiniCssExtractPlugin.loader,
    options: paths.publicUrlOrPath.startsWith('.')
      ? { publicPath: '../../' }
      : {},
  };
}

/**
 * Returns css-loader configuration.
 * @param {object} cssOptions - CSS loader options.
 * @returns {object} css-loader config.
 */
function buildCssLoader(cssOptions) {
  return {
    loader: require.resolve('css-loader'),
    options: cssOptions,
  };
}

/**
 * Returns postcss-loader configuration.
 * @returns {object} postcss-loader config.
 */
function buildPostCssLoader() {
  const plugins = useTailwind
    ? buildTailwindPostCssPlugins()
    : buildStandardPostCssPlugins();
  return {
    loader: require.resolve('postcss-loader'),
    options: {
      postcssOptions: {
        ident: 'postcss',
        config: false,
        plugins,
      },
      sourceMap:shouldUseSourceMap && process.env === 'production' || process.env === 'development',
    },
  };
}

/**
 * Returns standard (non-Tailwind) PostCSS plugins.
 * @returns {Array} PostCSS plugins array.
 */
function buildStandardPostCssPlugins() {
  return [
    'postcss-flexbugs-fixes',
    [
      'postcss-preset-env',
      {
        autoprefixer: { flexbox: 'no-2009' },
        stage: 3,
      },
    ],
    'postcss-normalize',
  ];
}

/**
 * Returns Tailwind PostCSS plugins.
 * @returns {Array} PostCSS plugins array.
 */
function buildTailwindPostCssPlugins() {
  return [
    'tailwindcss',
    'postcss-flexbugs-fixes',
    [
      'postcss-preset-env',
      {
        autoprefixer: { flexbox: 'no-2009' },
        stage: 3,
      },
    ],
  ];
}

/**
 * Returns resolve-url-loader configuration.
 * @returns {object} resolve-url-loader config.
 */
function buildResolveUrlLoader() {
  return {
    loader: require.resolve('resolve-url-loader'),
    options: {
      sourceMap: shouldUseSourceMap && process.env === 'production' || process.env === 'development',
      root: paths.appSrc,
    },
  };
}

/**
 * Returns preprocessor loader configuration.
 * @param {string} preProcessor - Loader name (e.g., 'sass-loader').
 * @returns {object} preprocessor loader config.
 */
function buildPreProcessorLoader(preProcessor) {
  return {
    loader: require.resolve(preProcessor),
    options: {
      sourceMap: true,
    },
  };
}

/**
 * Builds optimization minimizer array for production builds.
 * @returns {Array} Array of minimizer plugins.
 */
function buildOptimizers() {
  const minimizer = [new TerserPlugin(buildTerserOptions()), new CssMinimizerPlugin()];
  return minimizer;
}

/**
 * Builds TerserPlugin options based on production profiling.
 * @returns {object} Terser configuration options.
 */
function buildTerserOptions() {
  const isProductionProfile =
    process.env === 'production' && process.argv.includes('--profile');
  return {
    terserOptions: {
      parse: { ecma: 8 },
      compress: {
        ecma: 5,
        warnings: false,
        comparisons: false,
        inline: 2,
      },
      mangle: { safari10: true },
      keep_classnames: isProductionProfile,
      keep_fnames: isProductionProfile,
      output: {
        ecma: 5,
        comments: false,
        ascii_only: true,
      },
    },
  };
}

/**
 * Generates HTML plugin configuration.
 * @param {object} env - Client environment.
 * @returns {object} HtmlWebpackPlugin config.
 */
function buildHtmlWebpackPluginConfig(env) {
  const baseConfig = {
    inject: true,
    template: paths.appHtml,
  };
  if (process.env === 'production') {
    return Object.assign(baseConfig, {
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
    });
  }
  return baseConfig;
}

/**
 * Builds babel-loader options for application code.
 * @param {boolean} hasJsxRuntime - Whether JSX runtime is available.
 * @returns {object} Babel options.
 */
function buildAppBabelOptions(hasJsxRuntime) {
  const customizer = require.resolve('babel-preset-react-app/webpack-overrides');
  const presetOptions = {
    runtime: hasJsxRuntime ? 'automatic' : 'classic',
  };
  return {
    customize: customizer,
    presets: [[require.resolve('babel-preset-react-app'), presetOptions]],
    babelrc: false,
    configFile: false,
    cacheIdentifier: buildCacheIdentifier(),
    plugins: buildReactRefreshPlugins(),
    cacheDirectory: true,
    cacheCompression: false,
    compact: process.env === 'production',
  };
}

/**
 * Builds babel-loader options for external JS (outside src).
 * @returns {object} Babel options.
 */
function buildExternalBabelOptions() {
  return {
    babelrc: false,
    configFile: false,
    compact: false,
    presets: [[require.resolve('babel-preset-react-app/dependencies'), { helpers: true }]],
    cacheDirectory: true,
    cacheCompression: false,
    cacheIdentifier: buildCacheIdentifier(),
    sourceMaps: shouldUseSourceMap,
    inputSourceMap: shouldUseSourceMap,
  };
}

/**
 * Builds cache identifier using react-dev-utils helper.
 * @returns {string} Cache identifier string.
 */
function buildCacheIdentifier() {
  return getCacheIdentifier(
    process.env === 'production' ? 'production' : process.env === 'development' ? 'development' : '',
    [
      'babel-plugin-named-asset-import',
      'babel-preset-react-app',
      'react-dev-utils',
      'react-scripts',
    ]
  );
}

/**
 * Builds React Refresh plugin imports for dev.
 * @returns {Array} Array of plugin entries.
 */
function buildReactRefreshPlugins() {
  return [
    process.env === 'development' && shouldUseReactRefresh({ raw: { FAST_REFRESH: true } }) && require.resolve('react-refresh/babel'),
  ].filter(Boolean);
}

/**
 * Builds web module aliases based on environment.
 * @returns {object} Webpack aliases.
 */
function buildWebpackAliases() {
  const aliases = {
    'react-native': 'react-native-web',
  };
  if (process.env === 'production') {
    const profilers = {
      'react-dom$': 'react-dom/profiling',
      'scheduler/tracing': 'scheduler/tracing-profiling',
    };
    return { ...aliases, ...profilers, ...(modules.webpackAliases || {}) };
  }
  return { ...aliases, ...modules.webpackAliases };
}

/**
 * Builds CSS-related rules including CSS modules and preprocessors.
 * @param {boolean} hasJsxRuntime - Whether JSX runtime is available.
 * @returns {Array} Array of module rules.
 */
function buildCssRules(hasJsxRuntime) {
  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = buildStyleLoaders(cssOptions, preProcessor);
    return loaders;
  };

  return [
    { test: cssRegex, exclude: cssModuleRegex, use: getStyleLoaders({ importLoaders: 1 }), sideEffects: true },
    { test: cssModuleRegex, use: getStyleLoaders({ importLoaders: 1, modules: { mode: 'local', getLocalIdent } }) },
    { test: sassRegex, exclude: sassModuleRegex, use: getStyleLoaders({ importLoaders: 3 }, 'sass-loader'), sideEffects: true },
    { test: sassModuleRegex, use: getStyleLoaders({ importLoaders: 3, modules: { mode: 'local', getLocalIdent } }, 'sass-loader') },
  ];
}

/**
 * Builds file asset loader rule.
 * @returns {object} Asset/resource rule.
 */
function buildFileAssetRule() {
  return {
    exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
    type: 'asset/resource',
  };
}

/**
 * Returns array of loader rules for JS/Babel processing.
 * @param {boolean} hasJsxRuntime - Whether JSX runtime is available.
 * @returns {Array} Array of JS-related rules.
 */
function buildJsRules(hasJsxRuntime) {
  return [
    {
      test: /\.(js|mjs|jsx|ts|tsx)$/,
      include: paths.appSrc,
      loader: require.resolve('babel-loader'),
      options: buildAppBabelOptions(hasJsxRuntime),
    },
    {
      test: /\.(js|mjs)$/,
      exclude: /@babel(?:\/|\\{1,2})runtime/,
      loader: require.resolve('babel-loader'),
      options: buildExternalBabelOptions(),
    },
  ];
}

/**
 * Builds HtmlWebpackPlugin config for development or production.
 * @param {boolean} isEnvProduction - Whether in production.
 * @param {object} env - Client environment.
 * @returns {object} HtmlWebpackPlugin config.
 */
function buildHtmlWebpackPluginConfig(isEnvProduction, env) {
  const baseConfig = {
    inject: true,
    template: paths.appHtml,
  };
  if (isEnvProduction) {
    return Object.assign(baseConfig, {
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
    });
  }
  return baseConfig;
}

/**
 * Returns development-specific plugins array.
 * @param {object} env - Client environment.
 * @returns {Array} Array of development plugins.
 */
function buildDevelopmentPlugins(env) {
  const plugins = [];
  if (shouldUseReactRefresh(env)) {
    plugins.push(new ReactRefreshWebpackPlugin({ overlay: false }));
  }
  plugins.push(new CaseSensitivePathsPlugin());
  return plugins;
}

/**
 * Returns production-specific plugins array.
 * @param {string} swSrc - Service worker source path.
 * @returns {Array} Array of production plugins.
 */
function buildProductionPlugins(swSrc) {
  const plugins = [new MiniCssExtractPlugin({
    filename: 'static/css/[name].[contenthash:8].css',
    chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
  })];
  
  if (fs.existsSync(swSrc)) {
    plugins.push(new WorkboxWebpackPlugin.InjectManifest({
      swSrc,
      dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    }));
  }
  return plugins;
}

/**
 * Returns TypeScript type-checking plugin configuration.
 * @returns {object|undefined} ForkTsCheckerWebpackPlugin instance or undefined.
 */
function buildForkTsCheckerPlugin() {
  if (!process.env.useTypeScript) return;
  return new ForkTsCheckerWebpackPlugin({
    async: process.env === 'development',
    typescript: {
      typescriptPath: resolve.sync('typescript', { basedir: paths.appNodeModules }),
      configOverwrite: {
        compilerOptions: {
          sourceMap: shouldUseSourceMap,
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
      include: [{ file: '../**/src/**/*.{ts,tsx}' }, { file: '**/src/**/*.{ts,tsx}' }],
      exclude: [
        { file: '**/src/**/__tests__/**' },
        { file: '**/src/**/?(*.){spec|test}.*' },
        { file: '**/src/setupProxy.*' },
        { file: '**/src/setupTests.*' },
      ],
    },
    logger: { infrastructure: 'silent' },
  });
}

/**
 * Returns ESLint plugin configuration.
 * @param {boolean} hasJsxRuntime - Whether JSX runtime is available.
 * @returns {object|undefined} ESLintPlugin instance or undefined.
 */
function buildEslintPlugin(hasJsxRuntime) {
  const disableESLintPlugin = process.env.DISABLE_ESLINT_PLUGIN === 'true';
  if (disableESLintPlugin) return;
  return new ESLintPlugin({
    extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
    formatter: require.resolve('react-dev-utils/eslintFormatter'),
    eslintPath: require.resolve('eslint'),
    failOnError: false,
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
  });
}

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
  const shouldUseReactRefresh = shouldUseReactRefresh(env);
  const hasJsxRuntime = hasJsxRuntime;
  const emitErrorsAsWarnings = process.env.ESLINT_NO_DEV_ERRORS === 'true';

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment ? 'development' : 'none',
    bail: isEnvProduction,
    devtool: isEnvProduction
      ? shouldUseSourceMap ? 'source-map' : false
      : isEnvDevelopment ? 'cheap-module-source-map' : false,
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
        ? info =>
            path
              .relative(paths.appSrc, info.absoluteResourcePath)
              .replace(/\\/g, '/')
        : isEnvDevelopment &&
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
        tsconfig: [paths.appTsConfig, paths.appJsConfig].filter(f =>
          fs.existsSync(f)
        ),
      },
    },
    infrastructureLogging: { level: 'none' },
    optimization: {
      minimize: isEnvProduction,
      minimizer: buildOptimizers(),
    },
    resolve: {
      modules: ['node_modules', paths.appNodeModules].concat(
        modules.additionalModulePaths || []
      ),
      extensions: paths.moduleFileExtensions
        .map(ext => `.${ext}`)
        .filter(ext => !useTypeScript || !ext.includes('ts')),
      alias: buildWebpackAliases(),
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
      rules: [
        ...buildCssRules(hasJsxRuntime),
        ...buildJsRules(hasJsxRuntime),
        buildFileAssetRule(),
      ].filter(Boolean),
    },
    plugins: [
      new HtmlWebpackPlugin(buildHtmlWebpackPluginConfig(isEnvProduction, env)),
      isEnvProduction && shouldInlineRuntimeChunk && new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
      new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
      new ModuleNotFoundPlugin(paths.appPath),
      new webpack.DefinePlugin(env.stringified),
      ...buildDevelopmentPlugins(env),
      ...buildProductionPlugins(swSrc),
      new WebpackManifestPlugin({
        fileName: 'asset-manifest.json',
        publicPath: paths.publicUrlOrPath,
        generate: (seed, files, entrypoints) => {
          const manifestFiles = files.reduce((manifest, file) => {
            manifest[file.name] = file.path;
            return manifest;
          }, seed);
          const entrypointFiles = entrypoints.main.filter(
            fileName => !fileName.endsWith('.map')
          );
          return {
            files: manifestFiles,
            entrypoints: entrypointFiles,
          };
        },
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),
      useTypeScript && buildForkTsCheckerPlugin(),
      buildEslintPlugin(hasJsxRuntime),
    ].filter(Boolean),
    performance: false,
  };
};