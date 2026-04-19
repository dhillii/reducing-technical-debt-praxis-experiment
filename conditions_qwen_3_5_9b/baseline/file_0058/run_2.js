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

// Helper: Get environment flags
const getEnvFlags = (webpackEnv) => {
  const isDev = webpackEnv === 'development';
  const isProd = webpackEnv === 'production';
  const isProfile = isProd && process.argv.includes('--profile');
  return { isDev, isProd, isProfile };
};

// Helper: Get style loaders
const getStyleLoaders = (cssOptions, preProcessor) => {
  const { isDev, isProd } = getEnvFlags('development');
  const loaders = [
    isDev && require.resolve('style-loader'),
    isProd && {
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
        sourceMap: isProd ? shouldUseSourceMap : isDev,
      },
    },
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: isProd ? shouldUseSourceMap : isDev,
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

// Helper: Get cache identifier
const getCacheIdentifierForBabel = (envName) => {
  return getCacheIdentifier(
    envName,
    [
      'babel-plugin-named-asset-import',
      'babel-preset-react-app',
      'react-dev-utils',
      'react-scripts',
    ]
  );
};

// Helper: Get babel options
const getBabelOptions = (envName, isProd) => {
  const cacheIdentifier = getCacheIdentifierForBabel(envName);
  const plugins = [
    envName === 'development' &&
      shouldUseReactRefresh &&
      require.resolve('react-refresh/babel'),
  ].filter(Boolean);

  return {
    babelrc: false,
    configFile: false,
    cacheIdentifier,
    plugins,
    cacheDirectory: true,
    cacheCompression: false,
    compact: isProd,
  };
};

// Helper: Get HTML plugin config
const getHtmlPluginConfig = (isProd) => {
  return {
    inject: true,
    template: paths.appHtml,
    ...(isProd && {
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
    }),
  };
};

// Helper: Get webpack manifest config
const getWebpackManifestConfig = () => {
  return {
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
  };
};

// Helper: Get TypeScript checker config
const getTsCheckerConfig = (isDev) => {
  return {
    async: isDev,
    typescript: {
      typescriptPath: resolve.sync('typescript', {
        basedir: paths.appNodeModules,
      }),
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
  };
};

// Helper: Get ESLint plugin config
const getESLintPluginConfig = (isDev) => {
  return {
    extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
    formatter: require.resolve('react-dev-utils/eslintFormatter'),
    eslintPath: require.resolve('eslint'),
    failOnError: !(isDev && emitErrorsAsWarnings),
    context: paths.appSrc,
    cache: true,
    cacheLocation: path.resolve(
      paths.appNodeModules,
      '.cache/.eslintcache'
    ),
    cwd: paths.appPath,
    resolvePluginsRelativeTo: __dirname,
    baseConfig: {
      extends: [require.resolve('eslint-config-react-app/base')],
      rules: {
        ...(hasJsxRuntime && {}),
        ...(!hasJsxRuntime && {
          'react/react-in-jsx-scope': 'error',
        }),
      },
    },
  };
};

// Helper: Get service worker config
const getServiceWorkerConfig = () => {
  if (!fs.existsSync(swSrc)) {
    return null;
  }

  return {
    swSrc,
    dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
    exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  };
};

// Helper: Get optimization config
const getOptimizationConfig = (isProd) => {
  return {
    minimize: isProd,
    minimizer: [
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
          keep_classnames: isProd,
          keep_fnames: isProd,
          output: {
            ecma: 5,
            comments: false,
            ascii_only: true,
          },
        },
      }),
      new CssMinimizerPlugin(),
    ],
  };
};

// Helper: Get resolve config
const getResolveConfig = () => {
  return {
    modules: ['node_modules', paths.appNodeModules].concat(
      modules.additionalModulePaths || []
    ),
    extensions: paths.moduleFileExtensions
      .map(ext => `.${ext}`)
      .filter(ext => useTypeScript || !ext.includes('ts')),
    alias: {
      'react-native': 'react-native-web',
      ...(process.argv.includes('--profile') && {
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
  };
};

// Helper: Get module rules
const getModuleRules = () => {
  const rules = [
    // Source map loader
    shouldUseSourceMap && {
      enforce: 'pre',
      exclude: /@babel(?:\/|\\{1,2})runtime/,
      test: /\.(js|mjs|jsx|ts|tsx|css)$/,
      loader: require.resolve('source-map-loader'),
    },
  ].filter(Boolean);

  const oneOfRules = [
    // AVIF images
    {
      test: [/\.avif$/],
      type: 'asset',
      mimetype: 'image/avif',
      parser: {
        dataUrlCondition: { maxSize: imageInlineSizeLimit },
      },
    },
    // Common images
    {
      test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
      type: 'asset',
      parser: {
        dataUrlCondition: { maxSize: imageInlineSizeLimit },
      },
    },
    // SVGs
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
          options: {
            name: 'static/media/[name].[hash].[ext]',
          },
        },
      ],
      issuer: { and: [/\.(ts|tsx|js|jsx|md|mdx)$/] },
    },
    // Application JS with Babel
    {
      test: /\.(js|mjs|jsx|ts|tsx)$/,
      include: paths.appSrc,
      loader: require.resolve('babel-loader'),
      options: getBabelOptions('development', false),
    },
    // External JS with Babel
    {
      test: /\.(js|mjs)$/,
      exclude: /@babel(?:\/|\\{1,2})runtime/,
      loader: require.resolve('babel-loader'),
      options: getBabelOptions('production', true),
    },
    // CSS files
    {
      test: cssRegex,
      exclude: cssModuleRegex,
      use: getStyleLoaders({
        importLoaders: 1,
        sourceMap: shouldUseSourceMap,
        modules: { mode: 'icss' },
      }),
      sideEffects: true,
    },
    // CSS Modules
    {
      test: cssModuleRegex,
      use: getStyleLoaders({
        importLoaders: 1,
        sourceMap: shouldUseSourceMap,
        modules: {
          mode: 'local',
          getLocalIdent: getCSSModuleLocalIdent,
        },
      }),
    },
    // SASS files
    {
      test: sassRegex,
      exclude: sassModuleRegex,
      use: getStyleLoaders(
        {
          importLoaders: 3,
          sourceMap: shouldUseSourceMap,
          modules: { mode: 'icss' },
        },
        'sass-loader'
      ),
      sideEffects: true,
    },
    // SASS Modules
    {
      test: sassModuleRegex,
      use: getStyleLoaders(
        {
          importLoaders: 3,
          sourceMap: shouldUseSourceMap,
          modules: {
            mode: 'local',
            getLocalIdent: getCSSModuleLocalIdent,
          },
        },
        'sass-loader'
      ),
    },
    // File loader fallback
    {
      exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
      type: 'asset/resource',
    },
  ];

  return [...rules, { oneOf: oneOfRules }];
};

// Helper: Get plugins
const getPlugins = (env, isDev, isProd, isProfile) => {
  const plugins = [
    // HTML generation
    new HtmlWebpackPlugin(getHtmlPluginConfig(isProd)),
    // Inline runtime chunk
    isProd && shouldInlineRuntimeChunk && new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
    // Environment variables
    new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
    // Module not found errors
    new ModuleNotFoundPlugin(paths.appPath),
    // Define environment variables
    new webpack.DefinePlugin(env.stringified),
    // React Refresh
    isDev && shouldUseReactRefresh && new ReactRefreshWebpackPlugin({ overlay: false }),
    // Case sensitive paths
    isDev && new CaseSensitivePathsPlugin(),
    // Mini CSS extract
    isProd && new MiniCssExtractPlugin({
      filename: 'static/css/[name].[contenthash:8].css',
      chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
    }),
    // Asset manifest
    new WebpackManifestPlugin(getWebpackManifestConfig()),
    // Moment.js ignore
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/,
    }),
    // Service worker
    getServiceWorkerConfig() && new WorkboxWebpackPlugin.InjectManifest(getServiceWorkerConfig()),
    // TypeScript checking
    useTypeScript && new ForkTsCheckerWebpackPlugin(getTsCheckerConfig(isDev)),
    // ESLint
    !disableESLintPlugin && new ESLintPlugin(getESLintPluginConfig(isDev)),
  ].filter(Boolean);

  return plugins;
};

// Main webpack config
module.exports = function (webpackEnv) {
  const { isDev, isProd, isProfile } = getEnvFlags(webpackEnv);
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isProd ? 'production' : 'development',
    bail: isProd,
    devtool: isProd
      ? shouldUseSourceMap ? 'source-map' : false
      : isDev && 'cheap-module-source-map',
    entry: paths.appIndexJs,
    output: {
      path: paths.appBuild,
      pathinfo: isDev,
      filename: isProd
        ? 'static/js/[name].[contenthash:8].js'
        : isDev && 'static/js/bundle.js',
      chunkFilename: isProd
        ? 'static/js/[name].[contenthash:8].chunk.js'
        : isDev && 'static/js/[name].chunk.js',
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      publicPath: paths.publicUrlOrPath,
      devtoolModuleFilenameTemplate: isProd
        ? info =>
            path
              .relative(paths.appSrc, info.absoluteResourcePath)
              .replace(/\\/g, '/')
        : isDev &&
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
    optimization: getOptimizationConfig(isProd),
    resolve: getResolveConfig(),
    module: {
      strictExportPresence: true,
      rules: getModuleRules(),
    },
    plugins: getPlugins(env, isDev, isProd, isProfile),
    performance: false,
  };
};
```