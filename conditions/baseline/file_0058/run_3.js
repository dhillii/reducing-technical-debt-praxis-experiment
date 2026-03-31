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
const paths = require('./paths');
const modules = require('./modules');
const getClientEnvironment = require('./env');
const ModuleNotFoundPlugin = require('react-dev-utils/ModuleNotFoundPlugin');
const ForkTsCheckerWebpackPlugin =
  process.env.TSC_COMPILE_ON_ERROR === 'true'
    ? require('react-dev-utils/ForkTsCheckerWarningWebpackPlugin')
    : require('react-dev-utils/ForkTsCheckerWebpackPlugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const getCacheIdentifier = require('react-dev-utils/getCacheIdentifier');
const createEnvironmentHash = require('./webpack/persistentCache/createEnvironmentHash');

// ============================================================================
// CONSTANTS
// ============================================================================

const SHOULD_USE_SOURCE_MAP = process.env.GENERATE_SOURCEMAP !== 'false';
const SHOULD_INLINE_RUNTIME_CHUNK = process.env.INLINE_RUNTIME_CHUNK !== 'false';
const EMIT_ERRORS_AS_WARNINGS = process.env.ESLINT_NO_DEV_ERRORS === 'true';
const DISABLE_ESLINT_PLUGIN = process.env.DISABLE_ESLINT_PLUGIN === 'true';
const IMAGE_INLINE_SIZE_LIMIT = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000');

const USE_TYPE_SCRIPT = fs.existsSync(paths.appTsConfig);
const USE_TAILWIND = fs.existsSync(path.join(paths.appPath, 'tailwind.config.js'));
const SW_SRC = paths.swSrc;

const CSS_REGEX = /\.css$/;
const CSS_MODULE_REGEX = /\.module\.css$/;
const SASS_REGEX = /\.(scss|sass)$/;
const SASS_MODULE_REGEX = /\.module\.(scss|sass)$/;

const HAS_JSX_RUNTIME = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') return false;
  try {
    require.resolve('react/jsx-runtime');
    return true;
  } catch (e) {
    return false;
  }
})();

const REACT_REFRESH_RUNTIME_ENTRY = require.resolve('react-refresh/runtime');
const REACT_REFRESH_WEBPACK_PLUGIN_RUNTIME_ENTRY = require.resolve('@pmmmwh/react-refresh-webpack-plugin');
const BABEL_RUNTIME_ENTRY = require.resolve('babel-preset-react-app');
const BABEL_RUNTIME_ENTRY_HELPERS = require.resolve('@babel/runtime/helpers/esm/assertThisInitialized', {
  paths: [BABEL_RUNTIME_ENTRY],
});
const BABEL_RUNTIME_REGENERATOR = require.resolve('@babel/runtime/regenerator', {
  paths: [BABEL_RUNTIME_ENTRY],
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getSourceMapConfig = (isProduction, isDevelopment) => {
  if (isProduction) return SHOULD_USE_SOURCE_MAP ? 'source-map' : false;
  return isDevelopment ? 'cheap-module-source-map' : false;
};

const getOutputFilename = (isProduction, isDevelopment) => {
  if (isProduction) return 'static/js/[name].[contenthash:8].js';
  return isDevelopment ? 'static/js/bundle.js' : undefined;
};

const getOutputChunkFilename = (isProduction, isDevelopment) => {
  if (isProduction) return 'static/js/[name].[contenthash:8].chunk.js';
  return isDevelopment ? 'static/js/[name].chunk.js' : undefined;
};

const getDevtoolModuleFilenameTemplate = (isProduction, isDevelopment) => {
  if (isProduction) {
    return info =>
      path.relative(paths.appSrc, info.absoluteResourcePath).replace(/\\/g, '/');
  }
  return isDevelopment
    ? info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')
    : undefined;
};

const getTerserOptions = (isProductionProfile) => ({
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
});

const getPostCSSPlugins = (useTailwind) => {
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

  if (useTailwind) {
    return ['tailwindcss', ...basePlugins];
  }

  return [...basePlugins, 'postcss-normalize'];
};

const getStyleLoaders = (cssOptions, preProcessor, isProduction, isDevelopment) => {
  const loaders = [
    isDevelopment && require.resolve('style-loader'),
    isProduction && {
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
          plugins: getPostCSSPlugins(USE_TAILWIND),
        },
        sourceMap: isProduction ? SHOULD_USE_SOURCE_MAP : isDevelopment,
      },
    },
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: isProduction ? SHOULD_USE_SOURCE_MAP : isDevelopment,
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

const getHtmlWebpackPluginConfig = (isProduction) => {
  const baseConfig = {
    inject: true,
    template: paths.appHtml,
  };

  if (!isProduction) return baseConfig;

  return {
    ...baseConfig,
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
  };
};

const getModuleRules = (isProduction, isDevelopment, shouldUseSourceMap, shouldUseReactRefresh) => [
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
        parser: { dataUrlCondition: { maxSize: IMAGE_INLINE_SIZE_LIMIT } },
      },
      {
        test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
        type: 'asset',
        parser: { dataUrlCondition: { maxSize: IMAGE_INLINE_SIZE_LIMIT } },
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
          presets: [
            [
              require.resolve('babel-preset-react-app'),
              { runtime: HAS_JSX_RUNTIME ? 'automatic' : 'classic' },
            ],
          ],
          babelrc: false,
          configFile: false,
          cacheIdentifier: getCacheIdentifier(
            isProduction ? 'production' : isDevelopment ? 'development' : '',
            [
              'babel-plugin-named-asset-import',
              'babel-preset-react-app',
              'react-dev-utils',
              'react-scripts',
            ]
          ),
          plugins: [
            isDevelopment && shouldUseReactRefresh && require.resolve('react-refresh/babel'),
          ].filter(Boolean),
          cacheDirectory: true,
          cacheCompression: false,
          compact: isProduction,
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
            isProduction ? 'production' : isDevelopment ? 'development' : '',
            [
              'babel-plugin-named-asset-import',
              'babel-preset-react-app',
              'react-dev-utils',
              'react-scripts',
            ]
          ),
          sourceMaps: SHOULD_USE_SOURCE_MAP,
          inputSourceMap: SHOULD_USE_SOURCE_MAP,
        },
      },
      {
        test: CSS_REGEX,
        exclude: CSS_MODULE_REGEX,
        use: getStyleLoaders(
          {
            importLoaders: 1,
            sourceMap: isProduction ? SHOULD_USE_SOURCE_MAP : isDevelopment,
            modules: { mode: 'icss' },
          },
          null,
          isProduction,
          isDevelopment
        ),
        sideEffects: true,
      },
      {
        test: CSS_MODULE_REGEX,
        use: getStyleLoaders(
          {
            importLoaders: 1,
            sourceMap: isProduction ? SHOULD_USE_SOURCE_MAP : isDevelopment,
            modules: { mode: 'local', getLocalIdent: getCSSModuleLocalIdent },
          },
          null,
          isProduction,
          isDevelopment
        ),
      },
      {
        test: SASS_REGEX,
        exclude: SASS_MODULE_REGEX,
        use: getStyleLoaders(
          {
            importLoaders: 3,
            sourceMap: isProduction ? SHOULD_USE_SOURCE_MAP : isDevelopment,
            modules: { mode: 'icss' },
          },
          'sass-loader',
          isProduction,
          isDevelopment
        ),
        sideEffects: true,
      },
      {
        test: SASS_MODULE_REGEX,
        use: getStyleLoaders(
          {
            importLoaders: 3,
            sourceMap: isProduction ? SHOULD_USE_SOURCE_MAP : isDevelopment,
            modules: { mode: 'local', getLocalIdent: getCSSModuleLocalIdent },
          },
          'sass-loader',
          isProduction,
          isDevelopment
        ),
      },
      {
        exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
        type: 'asset/resource',
      },
    ],
  },
].filter(Boolean);

const getPlugins = (isProduction, isDevelopment, isProductionProfile, shouldUseReactRefresh, env) => [
  new HtmlWebpackPlugin(getHtmlWebpackPluginConfig(isProduction)),
  isProduction &&
    SHOULD_INLINE_RUNTIME_CHUNK &&
    new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
  new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
  new ModuleNotFoundPlugin(paths.appPath),
  new webpack.DefinePlugin(env.stringified),
  isDevelopment &&
    shouldUseReactRefresh &&
    new ReactRefreshWebpackPlugin({ overlay: false }),
  isDevelopment && new CaseSensitivePathsPlugin(),
  isProduction &&
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
      const entrypointFiles = entrypoints.main.filter(fileName => !fileName.endsWith('.map'));
      return { files: manifestFiles, entrypoints: entrypointFiles };
    },
  }),
  new webpack.IgnorePlugin({
    resourceRegExp: /^\.\/locale$/,
    contextRegExp: /moment$/,
  }),
  isProduction &&
    fs.existsSync(SW_SRC) &&
    new WorkboxWebpackPlugin.InjectManifest({
      swSrc: SW_SRC,
      dontCacheBustURLsMatching: /\.[0-9a