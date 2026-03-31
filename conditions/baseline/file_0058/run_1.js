```javascript
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
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const getCacheIdentifier = require('react-dev-utils/getCacheIdentifier');

const paths = require('./paths');
const modules = require('./modules');
const getClientEnvironment = require('./env');
const ModuleNotFoundPlugin = require('react-dev-utils/ModuleNotFoundPlugin');
const ForkTsCheckerWebpackPlugin = require(
  process.env.TSC_COMPILE_ON_ERROR === 'true'
    ? 'react-dev-utils/ForkTsCheckerWarningWebpackPlugin'
    : 'react-dev-utils/ForkTsCheckerWebpackPlugin'
);
const createEnvironmentHash = require('./webpack/persistentCache/createEnvironmentHash');

// ============================================================================
// ENVIRONMENT CONFIGURATION
// ============================================================================

const ENV_CONFIG = {
  shouldUseSourceMap: process.env.GENERATE_SOURCEMAP !== 'false',
  shouldInlineRuntimeChunk: process.env.INLINE_RUNTIME_CHUNK !== 'false',
  emitErrorsAsWarnings: process.env.ESLINT_NO_DEV_ERRORS === 'true',
  disableESLintPlugin: process.env.DISABLE_ESLINT_PLUGIN === 'true',
  imageInlineSizeLimit: parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000'),
  useTypeScript: fs.existsSync(paths.appTsConfig),
  useTailwind: fs.existsSync(path.join(paths.appPath, 'tailwind.config.js')),
  swSrc: paths.swSrc,
};

// ============================================================================
// REGEX PATTERNS
// ============================================================================

const STYLE_PATTERNS = {
  css: /\.css$/,
  cssModule: /\.module\.css$/,
  sass: /\.(scss|sass)$/,
  sassModule: /\.module\.(scss|sass)$/,
};

// ============================================================================
// RUNTIME ENTRIES
// ============================================================================

const RUNTIME_ENTRIES = {
  reactRefresh: require.resolve('react-refresh/runtime'),
  reactRefreshPlugin: require.resolve('@pmmmwh/react-refresh-webpack-plugin'),
  babelRuntime: require.resolve('babel-preset-react-app'),
  babelRuntimeHelpers: require.resolve(
    '@babel/runtime/helpers/esm/assertThisInitialized',
    { paths: [require.resolve('babel-preset-react-app')] }
  ),
  babelRuntimeRegenerator: require.resolve('@babel/runtime/regenerator', {
    paths: [require.resolve('babel-preset-react-app')],
  }),
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

const getSourceMapConfig = (isProduction, isDevelopment) => {
  if (isProduction) {
    return ENV_CONFIG.shouldUseSourceMap ? 'source-map' : false;
  }
  return isDevelopment ? 'cheap-module-source-map' : false;
};

const getPostCSSPlugins = () => {
  const basePlugins = [
    'postcss-flexbugs-fixes',
    [
      'postcss-preset-env',
      {
        autoprefixer: { flexbox: 'no-2009' },
        stage: 3,
      },
    ],
  ];

  if (ENV_CONFIG.useTailwind) {
    return ['tailwindcss', ...basePlugins];
  }

  return [...basePlugins, 'postcss-normalize'];
};

const getSourceMapOption = (isProduction) => {
  return isProduction ? ENV_CONFIG.shouldUseSourceMap : true;
};

// ============================================================================
// STYLE LOADERS FACTORY
// ============================================================================

const createStyleLoaders = (cssOptions, preProcessor) => {
  const loaders = [
    process.env.NODE_ENV === 'development' && require.resolve('style-loader'),
    process.env.NODE_ENV === 'production' && {
      loader: MiniCssExtractPlugin.loader,
      options: ENV_CONFIG.useTailwind
        ? {}
        : paths.publicUrlOrPath.startsWith('.')
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
          plugins: getPostCSSPlugins(),
        },
        sourceMap: getSourceMapOption(process.env.NODE_ENV === 'production'),
      },
    },
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: getSourceMapOption(process.env.NODE_ENV === 'production'),
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

// ============================================================================
// WEBPACK CONFIGURATION
// ============================================================================

module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';
  const isEnvProductionProfile = isEnvProduction && process.argv.includes('--profile');

  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : 'development',
    bail: isEnvProduction,
    devtool: getSourceMapConfig(isEnvProduction, isEnvDevelopment),
    entry: paths.appIndexJs,

    output: {
      path: paths.appBuild,
      pathinfo: isEnvDevelopment,
      filename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].js'
        : 'static/js/bundle.js',
      chunkFilename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].chunk.js'
        : 'static/js/[name].chunk.js',
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      publicPath: paths.publicUrlOrPath,
      devtoolModuleFilenameTemplate: isEnvProduction
        ? info =>
            path
              .relative(paths.appSrc, info.absoluteResourcePath)
              .replace(/\\/g, '/')
        : info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'),
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
      ],
    },

    resolve: {
      modules: ['node_modules', paths.appNodeModules].concat(
        modules.additionalModulePaths || []
      ),
      extensions: paths.moduleFileExtensions
        .map(ext => `.${ext}`)
        .filter(ext => ENV_CONFIG.useTypeScript || !ext.includes('ts')),
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
          RUNTIME_ENTRIES.reactRefresh,
          RUNTIME_ENTRIES.reactRefreshPlugin,
          RUNTIME_ENTRIES.babelRuntime,
          RUNTIME_ENTRIES.babelRuntimeHelpers,
          RUNTIME_ENTRIES.babelRuntimeRegenerator,
        ]),
      ],
    },

    module: {
      strictExportPresence: true,
      rules: [
        ENV_CONFIG.shouldUseSourceMap && {
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
              parser: {
                dataUrlCondition: { maxSize: ENV_CONFIG.imageInlineSizeLimit },
              },
            },
            {
              test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
              type: 'asset',
              parser: {
                dataUrlCondition: { maxSize: ENV_CONFIG.imageInlineSizeLimit },
              },
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
                customize: require.resolve(
                  'babel-preset-react-app/webpack-overrides'
                ),
                presets: [
                  [
                    require.resolve('babel-preset-react-app'),
                    { runtime: hasJsxRuntime ? 'automatic' : 'classic' },
                  ],
                ],
                babelrc: false,
                configFile: false,
                cacheIdentifier: getCacheIdentifier(
                  isEnvProduction ? 'production' : 'development',
                  [
                    'babel-plugin-named-asset-import',
                    'babel-preset-react-app',
                    'react-dev-utils',
                    'react-scripts',
                  ]
                ),
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
            {
              test: /\.(js|mjs)$/,
              exclude: /@babel(?:\/|\\{1,2})runtime/,
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                compact: false,
                presets: [
                  [
                    require.resolve('babel-preset-react-app/dependencies'),
                    { helpers: true },
                  ],
                ],
                cacheDirectory: true,
                cacheCompression: false,
                cacheIdentifier: getCacheIdentifier(
                  isEnvProduction ? 'production' : 'development',
                  [
                    'babel-plugin-named-asset-import',
                    'babel-preset-react-app',
                    'react-dev-utils',
                    'react-scripts',
                  ]
                ),
                sourceMaps: ENV_CONFIG.shouldUseSourceMap,
                inputSourceMap: ENV_CONFIG.shouldUseSourceMap,
              },
            },
            {
              test: STYLE_PATTERNS.css,
              exclude: STYLE_PATTERNS.cssModule,
              use: createStyleLoaders({
                importLoaders: 1,
                sourceMap: getSourceMapOption(isEnvProduction),
                modules: { mode: 'icss' },
              }),
              sideEffects: true,
            },
            {
              test: STYLE_PATTERNS.cssModule,
              use: createStyleLoaders({
                importLoaders: 1,
                sourceMap: getSourceMapOption(isEnvProduction),
                modules: {
                  mode: 'local',
                  getLocalIdent: getCSSModuleLocalIdent,
                },
              }),
            },
            {
              test: STYLE_PATTERNS.sass,
              exclude: STYLE_PATTERNS.sassModule,
              use: createStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: getSourceMapOption(isEnvProduction),
                  modules: { mode: 'icss' },
                },
                'sass-loader'
              ),
              sideEffects: true,
            },
            {
              test: STYLE_PATTERNS.sassModule,
              use: createStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: getSourceMapOption(isEnvProduction),
                  modules: {
                    mode: 'local',
                    getLocalIdent: getCSSModule