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

const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false';

const emitErrorsAsWarnings = process.env.ESLINT_NO_DEV_ERRORS === 'true';
const disableESLintPlugin = process.env.DISABLE_ESLINT_PLUGIN === 'true';

const imageInlineSizeLimit = parseInt(
  process.env.IMAGE_INLINE_SIZE_LIMIT || '10000'
);

const useTypeScript = fs.existsSync(paths.appTsConfig);

const useTailwind = fs.existsSync(
  path.join(paths.appPath, 'tailwind.config.js')
);

const swSrc = paths.swSrc;

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
 * Returns style loaders for CSS and pre-processors.
 */
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
                [
                  'postcss-preset-env',
                  {
                    autoprefixer: { flexbox: 'no-2009' },
                    stage: 3,
                  },
                ],
                'postcss-normalize',
              ]
            : [
                'tailwindcss',
                'postcss-flexbugs-fixes',
                [
                  'postcss-preset-env',
                  {
                    autoprefixer: { flexbox: 'no-2009' },
                    stage: 3,
                  },
                ],
              ],
        },
        sourceMap: isEnvProduction
          ? shouldUseSourceMap
          : isEnvDevelopment,
      },
    },
  ].filter(Boolean);
  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: isEnvProduction
            ? shouldUseSourceMap
            : isEnvDevelopment,
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

/**
 * Determines the mode for webpack.
 */
const getMode = (isProd, isDev) => (isProd ? 'production' : isDev && 'development');

/**
 * Determines the devtool configuration.
 */
const getDevtool = (isProd, isDev, useSourceMap) =>
  isProd
    ? useSourceMap
      ? 'source-map'
      : false
    : isDev && 'cheap-module-source-map';

/**
 * Generates the output configuration.
 */
const getOutput = (isProd, isDev, paths) => ({
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
    ? (info) =>
        path
          .relative(paths.appSrc, info.absoluteResourcePath)
          .replace(/\\/g, '/')
    : isDev &&
      (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
});

/**
 * Generates the cache configuration.
 */
const getCache = (isProd, isDev, env, paths) => ({
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
});

/**
 * Generates the resolve configuration.
 */
const getResolve = (
  isProd,
  isDev,
  isProdProfile,
  paths,
  modules,
  useTS,
  useTW
) => ({
  modules: ['node_modules', paths.appNodeModules].concat(
    modules.additionalModulePaths || []
  ),
  extensions: paths.moduleFileExtensions
    .map(ext => `.${ext}`)
    .filter(ext => useTS || !ext.includes('ts')),
  alias: {
    'react-native': 'react-native-web',
    ...(isProdProfile && {
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
});

/**
 * Generates module rules.
 */
const getModuleRules = (
  isProd,
  isDev,
  useSourceMap,
  imageLimit,
  paths,
  useTS,
  useTW,
  getStyleLoaders
) => [
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
        parser: { dataUrlCondition: { maxSize: imageLimit } },
      },
      {
        test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
        type: 'asset',
        parser: { dataUrlCondition: { maxSize: imageLimit } },
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
            isProd ? 'production' : isDev && 'development',
            [
              'babel-plugin-named-asset-import',
              'babel-preset-react-app',
              'react-dev-utils',
              'react-scripts',
            ]
          ),
          plugins: [
            isDev &&
              shouldUseReactRefresh &&
              require.resolve('react-refresh/babel'),
          ].filter(Boolean),
          cacheDirectory: true,
          cacheCompression: false,
          compact: isProd,
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
            isProd ? 'production' : isDev && 'development',
            [
              'babel-plugin-named-asset-import',
              'babel-preset-react-app',
              'react-dev-utils',
              'react-scripts',
            ]
          ),
          sourceMaps: useSourceMap,
          inputSourceMap: useSourceMap,
        },
      },
      {
        test: cssRegex,
        exclude: cssModuleRegex,
        use: getStyleLoaders({
          importLoaders: 1,
          sourceMap: isProd ? useSourceMap : isDev,
          modules: { mode: 'icss' },
        }),
        sideEffects: true,
      },
      {
        test: cssModuleRegex,
        use: getStyleLoaders({
          importLoaders: 1,
          sourceMap: isProd ? useSourceMap : isDev,
          modules: {
            mode: 'local',
            getLocalIdent: getCSSModuleLocalIdent,
          },
        }),
      },
      {
        test: sassRegex,
        exclude: sassModuleRegex,
        use: getStyleLoaders(
          {
            importLoaders: 3,
            sourceMap: isProd ? useSourceMap : isDev,
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
            sourceMap: isProd ? useSourceMap : isDev,
            modules: {
              mode: 'local',
              getLocalIdent: getCSSModuleLocalIdent,
            },
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

/**
 * Generates plugins array.
 */
const getPlugins = (
  isProd,
  isDev,
  inlineRuntime,
  env,
  useReactRefresh,
  isProdProfile,
  paths,
  useTS,
  useTW
) => [
  new HtmlWebpackPlugin(
    Object.assign(
      {},
      {
        inject: true,
        template: paths.appHtml,
      },
      isProd
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
  isProd &&
    inlineRuntime &&
    new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
  new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
  new ModuleNotFoundPlugin(paths.appPath),
  new webpack.DefinePlugin(env.stringified),
  isDev &&
    useReactRefresh &&
    new ReactRefreshWebpackPlugin({ overlay: false }),
  isDev && new CaseSensitivePathsPlugin(),
  isProd &&
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
  isProd &&
    fs.existsSync(swSrc) &&
    new WorkboxWebpackPlugin.InjectManifest({
      swSrc,
      dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    }),
  useTS &&
    new ForkTsCheckerWebpackPlugin({
      async: isDev,
      typescript: {
        typescriptPath: resolve.sync('typescript', {
          basedir: paths.appNodeModules,
        }),
        configOverwrite: {
          compilerOptions: {
            sourceMap: isProd ? useSourceMap : isDev,
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
          ...(!hasJsxRuntime && {
            'react/react-in-jsx-scope': 'error',
          }),
        },
      },
    }),
].filter(Boolean);

/**
 * Generates optimization configuration.
 */
const getOptimization = (isProd, isDev, useSourceMap) => ({
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
        keep_classnames: isProd && process.argv.includes('--profile'),
        keep_fnames: isProd && process.argv.includes('--profile'),
        output: {
          ecma: 5,
          comments: false,
          ascii_only: true,
        },
      },
    }),
    new CssMinimizerPlugin(),
  ],
});

/**
 * Main webpack configuration factory.
 */
module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';
  const isEnvProductionProfile =
    isEnvProduction && process.argv.includes('--profile');
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: getMode(isEnvProduction, isEnvDevelopment),
    bail: isEnvProduction,
    devtool: getDevtool(isEnvProduction, isEnvDevelopment, shouldUseSourceMap),
    entry: paths.appIndexJs,
    output: getOutput(isEnvProduction, isEnvDevelopment, paths),
    cache: getCache(isEnvProduction, isEnvDevelopment, env, paths),
    infrastructureLogging: { level: 'none' },
    optimization: getOptimization(
      isEnvProduction,
      isEnvDevelopment,
      shouldUseSourceMap
    ),
    resolve: getResolve(
      isEnvProduction,
      isEnvDevelopment,
      isEnvProductionProfile,
      paths,
      modules,
      useTypeScript,
      useTailwind
    ),
    module: {
      strictExportPresence: true,
      rules: getModuleRules(
        isEnvProduction,
        isEnvDevelopment,
        shouldUseSourceMap,
        imageInlineSizeLimit,
        paths,
        useTypeScript,
        useTailwind,
        getStyleLoaders
      ),
    },
    plugins: getPlugins(
      isEnvProduction,
      isEnvDevelopment,
      shouldInlineRuntimeChunk,
      env,
      shouldUseReactRefresh,
      isEnvProductionProfile,
      paths,
      useTypeScript,
      useTailwind
    ),
    performance: false,
  };
};