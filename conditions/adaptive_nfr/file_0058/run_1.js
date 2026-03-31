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
// ENVIRONMENT & FEATURE FLAGS
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
// RUNTIME ENTRIES
// ============================================================================

const RUNTIME_ENTRIES = {
  reactRefresh: require.resolve('react-refresh/runtime'),
  reactRefreshPlugin: require.resolve('@pmmmwh/react-refresh-webpack-plugin'),
  babelRuntime: require.resolve('babel-preset-react-app'),
  babelRuntimeHelpers: require.resolve('@babel/runtime/helpers/esm/assertThisInitialized', {
    paths: [require.resolve('babel-preset-react-app')],
  }),
  babelRuntimeRegenerator: require.resolve('@babel/runtime/regenerator', {
    paths: [require.resolve('babel-preset-react-app')],
  }),
};

const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') return false;
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

const getStyleLoaders = (cssOptions, preProcessor) => {
  const loaders = [
    process.env.NODE_ENV === 'development' && require.resolve('style-loader'),
    process.env.NODE_ENV === 'production' && {
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
        sourceMap: process.env.NODE_ENV === 'production' ? shouldUseSourceMap : true,
      },
    },
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: process.env.NODE_ENV === 'production' ? shouldUseSourceMap : true,
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

const getBabelOptions = (isProduction, isForDependencies = false) => {
  const baseOptions = {
    babelrc: false,
    configFile: false,
    cacheDirectory: true,
    cacheCompression: false,
  };

  if (isForDependencies) {
    return {
      ...baseOptions,
      compact: false,
      presets: [
        [
          require.resolve('babel-preset-react-app/dependencies'),
          { helpers: true },
        ],
      ],
      cacheIdentifier: getCacheIdentifier(
        isProduction ? 'production' : 'development',
        [
          'babel-plugin-named-asset-import',
          'babel-preset-react-app',
          'react-dev-utils',
          'react-scripts',
        ]
      ),
      sourceMaps: shouldUseSourceMap,
      inputSourceMap: shouldUseSourceMap,
    };
  }

  return {
    ...baseOptions,
    customize: require.resolve('babel-preset-react-app/webpack-overrides'),
    presets: [
      [
        require.resolve('babel-preset-react-app'),
        { runtime: hasJsxRuntime ? 'automatic' : 'classic' },
      ],
    ],
    cacheIdentifier: getCacheIdentifier(
      isProduction ? 'production' : 'development',
      [
        'babel-plugin-named-asset-import',
        'babel-preset-react-app',
        'react-dev-utils',
        'react-scripts',
      ]
    ),
    plugins: [
      process.env.NODE_ENV === 'development' &&
        require.resolve('react-refresh/babel'),
    ].filter(Boolean),
    compact: isProduction,
  };
};

const getTerserOptions = (isProfileMode) => ({
  parse: { ecma: 8 },
  compress: {
    ecma: 5,
    warnings: false,
    comparisons: false,
    inline: 2,
  },
  mangle: { safari10: true },
  keep_classnames: isProfileMode,
  keep_fnames: isProfileMode,
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

const getModuleRules = (isProduction, isDevelopment, shouldUseReactRefresh) => [
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
        options: getBabelOptions(isProduction),
      },
      {
        test: /\.(js|mjs)$/,
        exclude: /@babel(?:\/|\\{1,2})runtime/,
        loader: require.resolve('babel-loader'),
        options: getBabelOptions(isProduction, true),
      },
      {
        test: CSS_PATTERNS.css,
        exclude: CSS_PATTERNS.cssModule,
        use: getStyleLoaders({
          importLoaders: 1,
          sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
          modules: { mode: 'icss' },
        }),
        sideEffects: true,
      },
      {
        test: CSS_PATTERNS.cssModule,
        use: getStyleLoaders({
          importLoaders: 1,
          sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
          modules: { mode: 'local', getLocalIdent: getCSSModuleLocalIdent },
        }),
      },
      {
        test: CSS_PATTERNS.sass,
        exclude: CSS_PATTERNS.sassModule,
        use: getStyleLoaders(
          {
            importLoaders: 3,
            sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
            modules: { mode: 'icss' },
          },
          'sass-loader'
        ),
        sideEffects: true,
      },
      {
        test: CSS_PATTERNS.sassModule,
        use: getStyleLoaders(
          {
            importLoaders: 3,
            sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
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

const getPlugins = (isProduction, isDevelopment, env, shouldUseReactRefresh) => [
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
      return { files: manifestFiles, entrypoints: entrypointFiles };
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
  useTypeScript &&
    new ForkTsCheckerWebpackPlugin({
      async: isDevelopment,
      typescript: {
        typescriptPath: resolve.sync('typescript', {
          basedir: paths.appNodeModules,
        }),
        configOverwrite: {
          compilerOptions: {
            sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
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
      logger: { infrastructure: