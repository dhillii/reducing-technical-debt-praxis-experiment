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
const createEnvironmentHash = require('./webpack/persistentCache/createEnvironmentHash');

const ForkTsCheckerWebpackPlugin =
  process.env.TSC_COMPILE_ON_ERROR === 'true'
    ? require('react-dev-utils/ForkTsCheckerWarningWebpackPlugin')
    : require('react-dev-utils/ForkTsCheckerWebpackPlugin');

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
// FEATURE DETECTION
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getPostCssPlugins = (useTailwind) => {
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

  return useTailwind
    ? ['tailwindcss', ...basePlugins]
    : [...basePlugins, 'postcss-normalize'];
};

const getStyleLoaders = (cssOptions, preProcessor, isEnvProduction, isEnvDevelopment, useTailwind) => {
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
          plugins: getPostCssPlugins(useTailwind),
        },
        sourceMap: isEnvProduction ? ENV_CONFIG.shouldUseSourceMap : isEnvDevelopment,
      },
    },
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: isEnvProduction ? ENV_CONFIG.shouldUseSourceMap : isEnvDevelopment,
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

const getTerserOptions = (isEnvProductionProfile) => ({
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
});

const getHtmlWebpackPluginConfig = (isEnvProduction) => {
  const baseConfig = {
    inject: true,
    template: paths.appHtml,
  };

  if (isEnvProduction) {
    baseConfig.minify = {
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
  }

  return baseConfig;
};

const getBabelLoaderOptions = (isEnvProduction, isEnvDevelopment, shouldUseReactRefresh) => ({
  customize: require.resolve('babel-preset-react-app/webpack-overrides'),
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
});

const getModuleRules = (isEnvProduction, isEnvDevelopment, shouldUseReactRefresh) => [
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
        parser: { dataUrlCondition: { maxSize: ENV_CONFIG.imageInlineSizeLimit } },
      },
      {
        test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
        type: 'asset',
        parser: { dataUrlCondition: { maxSize: ENV_CONFIG.imageInlineSizeLimit } },
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
        options: getBabelLoaderOptions(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh),
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
        use: getStyleLoaders(
          {
            importLoaders: 1,
            sourceMap: isEnvProduction ? ENV_CONFIG.shouldUseSourceMap : isEnvDevelopment,
            modules: { mode: 'icss' },
          },
          null,
          isEnvProduction,
          isEnvDevelopment,
          ENV_CONFIG.useTailwind
        ),
        sideEffects: true,
      },
      {
        test: STYLE_PATTERNS.cssModule,
        use: getStyleLoaders(
          {
            importLoaders: 1,
            sourceMap: isEnvProduction ? ENV_CONFIG.shouldUseSourceMap : isEnvDevelopment,
            modules: { mode: 'local', getLocalIdent: getCSSModuleLocalIdent },
          },
          null,
          isEnvProduction,
          isEnvDevelopment,
          ENV_CONFIG.useTailwind
        ),
      },
      {
        test: STYLE_PATTERNS.sass,
        exclude: STYLE_PATTERNS.sassModule,
        use: getStyleLoaders(
          {
            importLoaders: 3,
            sourceMap: isEnvProduction ? ENV_CONFIG.shouldUseSourceMap : isEnvDevelopment,
            modules: { mode: 'icss' },
          },
          'sass-loader',
          isEnvProduction,
          isEnvDevelopment,
          ENV_CONFIG.useTailwind
        ),
        sideEffects: true,
      },
      {
        test: STYLE_PATTERNS.sassModule,
        use: getStyleLoaders(
          {
            importLoaders: 3,
            sourceMap: isEnvProduction ? ENV_CONFIG.shouldUseSourceMap : isEnvDevelopment,
            modules: { mode: 'local', getLocalIdent: getCSSModuleLocalIdent },
          },
          'sass-loader',
          isEnvProduction,
          isEnvDevelopment,
          ENV_CONFIG.useTailwind
        ),
      },
      {
        exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
        type: 'asset/resource',
      },
    ],
  },
].filter(Boolean);

const getPlugins = (isEnvProduction, isEnvDevelopment, isEnvProductionProfile, shouldUseReactRefresh, env) => [
  new HtmlWebpackPlugin(getHtmlWebpackPluginConfig(isEnvProduction)),
  isEnvProduction &&
    ENV_CONFIG.shouldInlineRuntimeChunk &&
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
    generate: (seed, files, entrypoints) => {
      const manifestFiles = files.reduce((manifest, file) => {
        manifest[file.name] = file.path;
        return manifest;
      }, seed);
      const entrypointFiles = entrypoints.main.filter(
        fileName => !fileName.endsWith('.map')
      );
      return { files: manifestFiles, entrypoints: entrypointFiles };
    },
  }),
  new webpack.IgnorePlugin({
    resourceRegExp: /^\.\/locale$/,
    contextRegExp: /moment$/,
  }),
  isEnvProduction &&
    fs.existsSync(ENV_CONFIG.swSrc) &&
    new WorkboxWebpackPlugin.InjectManifest({
      swSrc: ENV_CONFIG.swSrc,
      dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    }),