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
// ENVIRONMENT CONFIGURATION
// ============================================================================

const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';
const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false';
const emitErrorsAsWarnings = process.env.ESLINT_NO_DEV_ERRORS === 'true';
const disableESLintPlugin = process.env.DISABLE_ESLINT_PLUGIN === 'true';
const imageInlineSizeLimit = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000');

const useTypeScript = fs.existsSync(paths.appTsConfig);
const useTailwind = fs.existsSync(path.join(paths.appPath, 'tailwind.config.js'));
const swSrc = paths.swSrc;

// ============================================================================
// REGEX PATTERNS
// ============================================================================

const CSS_PATTERNS = {
  css: /\.css$/,
  cssModule: /\.module\.css$/,
  sass: /\.(scss|sass)$/,
  sassModule: /\.module\.(scss|sass)$/,
};

// ============================================================================
// BABEL RUNTIME ENTRIES
// ============================================================================

const BABEL_RUNTIME_ENTRIES = {
  reactRefresh: require.resolve('react-refresh/runtime'),
  reactRefreshPlugin: require.resolve('@pmmmwh/react-refresh-webpack-plugin'),
  babelPreset: require.resolve('babel-preset-react-app'),
  babelHelpers: require.resolve('@babel/runtime/helpers/esm/assertThisInitialized', {
    paths: [require.resolve('babel-preset-react-app')],
  }),
  babelRegenerator: require.resolve('@babel/runtime/regenerator', {
    paths: [require.resolve('babel-preset-react-app')],
  }),
};

// ============================================================================
// JSX RUNTIME DETECTION
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

const getSourceMapConfig = (isProduction, isDevelopment) => {
  return isProduction ? shouldUseSourceMap : isDevelopment;
};

const getStyleLoaders = (cssOptions, preProcessor) => {
  const loaders = [
    false && require.resolve('style-loader'),
    {
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
          plugins: getPostCSSPlugins(),
        },
        sourceMap: getSourceMapConfig(false, true),
      },
    },
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: getSourceMapConfig(false, true),
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

  return useTailwind
    ? ['tailwindcss', ...basePlugins]
    : [...basePlugins, 'postcss-normalize'];
};

const getBabelCacheIdentifier = (isProduction, isDevelopment) => {
  return getCacheIdentifier(
    isProduction ? 'production' : isDevelopment ? 'development' : 'unknown',
    [
      'babel-plugin-named-asset-import',
      'babel-preset-react-app',
      'react-dev-utils',
      'react-scripts',
    ]
  );
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

const getHtmlWebpackPluginConfig = (isProduction) => {
  const baseConfig = {
    inject: true,
    template: paths.appHtml,
  };

  if (isProduction) {
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

const getModuleRules = (isProduction, isDevelopment, shouldUseReactRefresh) => [
  shouldUseSourceMap && {
    enforce: 'pre',
    exclude: /@babel(?:\/|\\{1,2})runtime/,
    test: /\.(js|mjs|jsx|ts|tsx|css)$/,
    loader: require.resolve('source-map-loader'),
  },
  {
    oneOf: [
      getAssetRule('avif', 'image/avif'),
      getAssetRule(['bmp', 'gif', 'jpe?g', 'png']),
      getSvgRule(),
      getJsRule(isProduction, isDevelopment, shouldUseReactRefresh),
      getNodeModulesJsRule(isProduction, isDevelopment),
      getCssRule(isProduction, isDevelopment),
      getCssModuleRule(isProduction, isDevelopment),
      getSassRule(isProduction, isDevelopment),
      getSassModuleRule(isProduction, isDevelopment),
      getFileRule(),
    ],
  },
].filter(Boolean);

const getAssetRule = (extensions, mimetype = null) => {
  const exts = Array.isArray(extensions) ? extensions : [extensions];
  return {
    test: exts.map(ext => new RegExp(`\\.${ext}$`)),
    type: 'asset',
    ...(mimetype && { mimetype }),
    parser: {
      dataUrlCondition: { maxSize: imageInlineSizeLimit },
    },
  };
};

const getSvgRule = () => ({
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
});

const getJsRule = (isProduction, isDevelopment, shouldUseReactRefresh) => ({
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
    babelrc: false,
    configFile: false,
    cacheIdentifier: getBabelCacheIdentifier(isProduction, isDevelopment),
    plugins: [
      isDevelopment && shouldUseReactRefresh && require.resolve('react-refresh/babel'),
    ].filter(Boolean),
    cacheDirectory: true,
    cacheCompression: false,
    compact: isProduction,
  },
});

const getNodeModulesJsRule = (isProduction, isDevelopment) => ({
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
    cacheIdentifier: getBabelCacheIdentifier(isProduction, isDevelopment),
    sourceMaps: shouldUseSourceMap,
    inputSourceMap: shouldUseSourceMap,
  },
});

const getCssRule = (isProduction, isDevelopment) => ({
  test: CSS_PATTERNS.css,
  exclude: CSS_PATTERNS.cssModule,
  use: getStyleLoaders({
    importLoaders: 1,
    sourceMap: getSourceMapConfig(isProduction, isDevelopment),
    modules: { mode: 'icss' },
  }),
  sideEffects: true,
});

const getCssModuleRule = (isProduction, isDevelopment) => ({
  test: CSS_PATTERNS.cssModule,
  use: getStyleLoaders({
    importLoaders: 1,
    sourceMap: getSourceMapConfig(isProduction, isDevelopment),
    modules: {
      mode: 'local',
      getLocalIdent: getCSSModuleLocalIdent,
    },
  }),
});

const getSassRule = (isProduction, isDevelopment) => ({
  test: CSS_PATTERNS.sass,
  exclude: CSS_PATTERNS.sassModule,
  use: getStyleLoaders(
    {
      importLoaders: 3,
      sourceMap: getSourceMapConfig(isProduction, isDevelopment),
      modules: { mode: 'icss' },
    },
    'sass-loader'
  ),
  sideEffects: true,
});

const getSassModuleRule = (isProduction, isDevelopment) => ({
  test: CSS_PATTERNS.sassModule,
  use: getStyleLoaders(
    {
      importLoaders: 3,
      sourceMap: getSourceMapConfig(isProduction, isDevelopment),
      modules: {
        mode: 'local',
        getLocalIdent: getCSSModuleLocalIdent,
      },
    },
    'sass-loader'
  ),
});

const getFileRule = () => ({
  exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
  type: 'asset/resource',
});

const getPlugins = (isProduction, isDevelopment, shouldUseReactRefresh, env) => [
  new HtmlWebpackPlugin(getHtmlWebpackPluginConfig(isProduction)),
  isProduction &&
    shouldInlineRuntimeChunk &&
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
  isProduction &&
    fs.existsSync(swSrc) &&
    new WorkboxWebpackPlugin.InjectManifest({
      swSrc,
      dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    }),
  useTypeScript && getForkTsCheckerPlugin(isProduction, isDevelopment),
  !disableESLintPlugin && getESLintPlugin(),
].filter(Boolean);

const getForkTsCheckerPlugin = (isProduction, isDevelopment) =>
  new ForkTsCheckerWebpackPlugin({
    async: isDevelopment,
    typescript: {
      typescriptPath: resolve.sync('typescript',