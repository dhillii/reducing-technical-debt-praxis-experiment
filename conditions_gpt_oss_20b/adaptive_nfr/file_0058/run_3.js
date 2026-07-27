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
 * Returns style loaders based on environment and options.
 * @param {Object} cssOptions
 * @param {string|null} preProcessor
 * @param {boolean} isEnvDevelopment
 * @param {boolean} isEnvProduction
 * @param {boolean} useTailwind
 * @param {boolean} shouldUseSourceMap
 * @param {Object} paths
 * @returns {Array}
 */
function getStyleLoaders(
  cssOptions,
  preProcessor,
  isEnvDevelopment,
  isEnvProduction,
  useTailwind,
  shouldUseSourceMap,
  paths
) {
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
                    autoprefixer: {
                      flexbox: 'no-2009',
                    },
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
                    autoprefixer: {
                      flexbox: 'no-2009',
                    },
                    stage: 3,
                  },
                ],
              ],
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
        options: {
          sourceMap: true,
        },
      }
    );
  }
  return loaders;
}

/**
 * Creates the output configuration.
 * @param {boolean} isEnvDevelopment
 * @param {boolean} isEnvProduction
 * @param {Object} paths
 * @param {boolean} shouldUseSourceMap
 * @returns {Object}
 */
function createOutput(isEnvDevelopment, isEnvProduction, paths, shouldUseSourceMap) {
  return {
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
  };
}

/**
 * Creates the cache configuration.
 * @param {boolean} isEnvProduction
 * @param {Object} env
 * @param {Object} paths
 * @returns {Object}
 */
function createCache(isEnvProduction, env, paths) {
  return {
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
  };
}

/**
 * Creates the optimization configuration.
 * @param {boolean} isEnvProduction
 * @param {boolean} shouldUseSourceMap
 * @param {boolean} isEnvProductionProfile
 * @returns {Object}
 */
function createOptimization(isEnvProduction, shouldUseSourceMap, isEnvProductionProfile) {
  const minimizers = [
    new TerserPlugin({
      terserOptions: {
        parse: {
          ecma: 8,
        },
        compress: {
          ecma: 5,
          warnings: false,
          comparisons: false,
          inline: 2,
        },
        mangle: {
          safari10: true,
        },
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

  return {
    minimize: isEnvProduction,
    minimizer: minimizers,
  };
}

/**
 * Creates the resolve configuration.
 * @param {boolean} isEnvProductionProfile
 * @param {Object} modules
 * @param {Object} paths
 * @param {boolean} useTypeScript
 * @param {boolean} useTailwind
 * @param {boolean} useJsxRuntime
 * @returns {Object}
 */
function createResolve(isEnvProductionProfile, modules, paths, useTypeScript, useTailwind, useJsxRuntime) {
  return {
    modules: ['node_modules', paths.appNodeModules].concat(
      modules.additionalModulePaths || []
    ),
    extensions: paths.moduleFileExtensions
      .map(ext => `.${ext}`)
      .filter(ext => useTypeScript || !ext.includes('ts')),
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
  };
}

/**
 * Creates the module configuration.
 * @param {boolean} isEnvDevelopment
 * @param {boolean} isEnvProduction
 * @param {boolean} shouldUseSourceMap
 * @param {number} imageInlineSizeLimit
 * @param {Object} paths
 * @param {boolean} useTypeScript
 * @param {boolean} useTailwind
 * @param {Function} getStyleLoaders
 * @param {Function} getCacheIdentifier
 * @returns {Object}
 */
function createModule(
  isEnvDevelopment,
  isEnvProduction,
  shouldUseSourceMap,
  imageInlineSizeLimit,
  paths,
  useTypeScript,
  useTailwind,
  getStyleLoaders,
  getCacheIdentifier
) {
  const rules = [
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
          parser: {
            dataUrlCondition: {
              maxSize: imageInlineSizeLimit,
            },
          },
        },
        {
          test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: imageInlineSizeLimit,
            },
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
                svgoConfig: {
                  plugins: [{ removeViewBox: false }],
                },
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
          issuer: {
            and: [/\.(ts|tsx|js|jsx|md|mdx)$/],
          },
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
                {
                  runtime: hasJsxRuntime ? 'automatic' : 'classic',
                },
              ],
            ],
            babelrc: false,
            configFile: false,
            cacheIdentifier: getCacheIdentifier(
              isEnvProduction
                ? 'production'
                : isEnvDevelopment && 'development',
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
            cacheIdentifier: getCacheIdentifier(
              isEnvProduction
                ? 'production'
                : isEnvDevelopment && 'development',
              [
                'babel-plugin-named-asset-import',
                'babel-preset-react-app',
                'react-dev-utils',
                'react-scripts',
              ]
            ),
            sourceMaps: shouldUseSourceMap,
            inputSourceMap: shouldUseSourceMap,
          },
        },
        {
          test: cssRegex,
          exclude: cssModuleRegex,
          use: getStyleLoaders(
            {
              importLoaders: 1,
              sourceMap: isEnvProduction
                ? shouldUseSourceMap
                : isEnvDevelopment,
              modules: {
                mode: 'icss',
              },
            },
            null,
            isEnvDevelopment,
            isEnvProduction,
            useTailwind,
            shouldUseSourceMap,
            paths
          ),
          sideEffects: true,
        },
        {
          test: cssModuleRegex,
          use: getStyleLoaders(
            {
              importLoaders: 1,
              sourceMap: isEnvProduction
                ? shouldUseSourceMap
                : isEnvDevelopment,
              modules: {
                mode: 'local',
                getLocalIdent: getCSSModuleLocalIdent,
              },
            },
            null,
            isEnvDevelopment,
            isEnvProduction,
            useTailwind,
            shouldUseSourceMap,
            paths
          ),
        },
        {
          test: sassRegex,
          exclude: sassModuleRegex,
          use: getStyleLoaders(
            {
              importLoaders: 3,
              sourceMap: isEnvProduction
                ? shouldUseSourceMap
                : isEnvDevelopment,
              modules: {
                mode: 'icss',
              },
            },
            'sass-loader',
            isEnvDevelopment,
            isEnvProduction,
            useTailwind,
            shouldUseSourceMap,
            paths
          ),
          sideEffects: true,
        },
        {
          test: sassModuleRegex,
          use: getStyleLoaders(
            {
              importLoaders: 3,
              sourceMap: isEnvProduction
                ? shouldUseSourceMap
                : isEnvDevelopment,
              modules: {
                mode: 'local',
                getLocalIdent: getCSSModuleLocalIdent,
              },
            },
            'sass-loader',
            isEnvDevelopment,
            isEnvProduction,
            useTailwind,
            shouldUseSourceMap,
            paths
          ),
        },
        {
          exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
          type: 'asset/resource',
        },
      ],
    },
  ].filter(Boolean);
  return {
    strictExportPresence: true,
    rules,
  };
}

/**
 * Creates the plugins array.
 * @param {boolean} isEnvDevelopment
 * @param {boolean} isEnvProduction
 * @param {boolean} isEnvProductionProfile
 * @param {Object} env
 * @param {boolean} shouldUseReactRefresh
 * @param {boolean} shouldInlineRuntimeChunk
 * @param {boolean} shouldUseSourceMap
 * @param {boolean} useTypeScript
 * @param {boolean} useTailwind
 * @param {Object} paths
 * @param {string} swSrc
 * @param {boolean} disableESLintPlugin
 * @param {boolean} emitErrorsAsWarnings
 * @param {boolean} hasJsxRuntime
 * @returns {Array}
 */
function createPlugins(
  isEnvDevelopment,
  isEnvProduction,
  isEnvProductionProfile,
  env,
  shouldUseReactRefresh,
  shouldInlineRuntimeChunk,
  shouldUseSourceMap,
  useTypeScript,
  useTailwind,
  paths,
  swSrc,
  disableESLintPlugin,
  emitErrorsAsWarnings,
  hasJsxRuntime
) {
  const pluginDefs = [
    {
      condition: true,
      plugin: () =>
        new HtmlWebpackPlugin(
          Object.assign(
            {},
            {
              inject: true,
              template: paths.appHtml,
            },
            isEnvProduction
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
    },
    {
      condition: isEnvProduction && shouldInlineRuntimeChunk,
      plugin: () =>
        new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
    },
    {
      condition: true,
      plugin: () => new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
    },
    {
      condition: true,
      plugin: () => new ModuleNotFoundPlugin(paths.appPath),
    },
    {
      condition: true,
      plugin: () => new webpack.DefinePlugin(env.stringified),
    },
    {
      condition: isEnvDevelopment && shouldUseReactRefresh,
      plugin: () =>
        new ReactRefreshWebpackPlugin({
          overlay: false,
        }),
    },
    {
      condition: isEnvDevelopment,
      plugin: () => new CaseSensitivePathsPlugin(),
    },
    {
      condition: isEnvProduction,
      plugin: () =>
        new MiniCssExtractPlugin({
          filename: 'static/css/[name].[contenthash:8].css',
          chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
        }),
    },
    {
      condition: true,
      plugin: () =>
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
    },
    {
      condition: true,
      plugin: () =>
        new webpack.IgnorePlugin({
          resourceRegExp: /^\.\/locale$/,
          contextRegExp: /moment$/,
        }),
    },
    {
      condition: isEnvProduction && fs.existsSync(swSrc),
      plugin: () =>
        new WorkboxWebpackPlugin.InjectManifest({
          swSrc,
          dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
          exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        }),
    },
    {
      condition: useTypeScript,
      plugin: () =>
        new ForkTsCheckerWebpackPlugin({
          async: isEnvDevelopment,
          typescript: {
            typescriptPath: resolve.sync('typescript', {
              basedir: paths.appNodeModules,
            }),
            configOverwrite: {
              compilerOptions: {
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                skipLibCheck: true,
                inlineSourceMap: false,
                declarationMap: false,
                noEmit: true,
                incremental: true,
                tsBuildInfoFile: paths.appTsBuildInfoFile,
              },
            },
            context: paths.appPath,
            diagnosticOptions: {
              syntactic: true,
            },
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
          logger: {
            infrastructure: 'silent',
          },
        }),
    },
    {
      condition: !disableESLintPlugin,
      plugin: () =>
        new ESLintPlugin({
          extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
          formatter: require.resolve('react-dev-utils/eslintFormatter'),
          eslintPath: require.resolve('eslint'),
          failOnError: !(isEnvDevelopment && emitErrorsAsWarnings),
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
    },
  ];

  return pluginDefs.filter(d => d.condition).map(d => d.plugin());
}

/**
 * Creates the performance configuration.
 * @returns {boolean}
 */
function createPerformance() {
  return false;
}

/**
 * Builds the webpack configuration.
 * @param {Object} params
 * @returns {Object}
 */
function createConfig(params) {
  const {
    isEnvDevelopment,
    isEnvProduction,
    isEnvProductionProfile,
    env,
    shouldUseReactRefresh,
    shouldUseSourceMap,
    shouldInlineRuntimeChunk,
    useTypeScript,
    useTailwind,
    useJsxRuntime,
    imageInlineSizeLimit,
    paths,
    modules,
    cssRegex,
    cssModuleRegex,
    sassRegex,
    sassModuleRegex,
    hasJsxRuntime,
    swSrc,
    disableESLintPlugin,
    emitErrorsAsWarnings,
    getCacheIdentifier,
    MiniCssExtractPlugin,
    HtmlWebpackPlugin,
    InlineChunkHtmlPlugin,
    InterpolateHtmlPlugin,
    ModuleNotFoundPlugin,
    webpack,
    ReactRefreshWebpackPlugin,
    CaseSensitivePathsPlugin,
    WebpackManifestPlugin,
    webpackIgnorePlugin: webpackIgnorePlugin,
    WorkboxWebpackPlugin,
    ForkTsCheckerWebpackPlugin,
    ESLintPlugin,
    resolve,
    path,
    fs,
    getClientEnvironment,
    createEnvironmentHash,
    getStyleLoaders,
  } = params;

  const output = createOutput(
    isEnvDevelopment,
    isEnvProduction,
    paths,
    shouldUseSourceMap
  );
  const cache = createCache(isEnvProduction, env, paths);
  const optimization = createOptimization(
    isEnvProduction,
    shouldUseSourceMap,
    isEnvProductionProfile
  );
  const resolveConfig = createResolve(
    isEnvProductionProfile,
    modules,
    paths,
    useTypeScript,
    useTailwind,
    useJsxRuntime
  );
  const moduleConfig = createModule(
    isEnvDevelopment,
    isEnvProduction,
    shouldUseSourceMap,
    imageInlineSizeLimit,
    paths,
    useTypeScript,
    useTailwind,
    getStyleLoaders,
    getCacheIdentifier
  );
  const plugins = createPlugins(
    isEnvDevelopment,
    isEnvProduction,
    isEnvProductionProfile,
    env,
    shouldUseReactRefresh,
    shouldInlineRuntimeChunk,
    shouldUseSourceMap,
    useTypeScript,
    useTailwind,
    paths,
    swSrc,
    disableESLintPlugin,
    emitErrorsAsWarnings,
    hasJsxRuntime
  );
  const performance = createPerformance();

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    bail: isEnvProduction,
    devtool: isEnvProduction
      ? shouldUseSourceMap
        ? 'source-map'
        : false
      : isEnvDevelopment && 'cheap-module-source-map',
    entry: paths.appIndexJs,
    output,
    cache,
    infrastructureLogging: {
      level: 'none',
    },
    optimization,
    resolve: resolveConfig,
    module: moduleConfig,
    plugins,
    performance,
  };
}

/**
 * Exported webpack configuration function.
 * @param {string} webpackEnv
 * @returns {Object}
 */
module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';
  const isEnvProductionProfile =
    isEnvProduction && process.argv.includes('--profile');
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  const config = createConfig({
    isEnvDevelopment,
    isEnvProduction,
    isEnvProductionProfile,
    env,
    shouldUseReactRefresh,
    shouldUseSourceMap,
    shouldInlineRuntimeChunk,
    useTypeScript,
    useTailwind,
    useJsxRuntime,
    imageInlineSizeLimit,
    paths,
    modules,
    cssRegex,
    cssModuleRegex,
    sassRegex,
    sassModuleRegex,
    hasJsxRuntime,
    swSrc,
    disableESLintPlugin,
    emitErrorsAsWarnings,
    getCacheIdentifier,
    MiniCssExtractPlugin,
    HtmlWebpackPlugin,
    InlineChunkHtmlPlugin,
    InterpolateHtmlPlugin,
    ModuleNotFoundPlugin,
    webpack,
    ReactRefreshWebpackPlugin,
    CaseSensitivePathsPlugin,
    WebpackManifestPlugin,
    webpackIgnorePlugin: webpack.IgnorePlugin,
    WorkboxWebpackPlugin,
    ForkTsCheckerWebpackPlugin,
    ESLintPlugin,
    resolve,
    path,
    fs,
    getClientEnvironment,
    createEnvironmentHash,
    getStyleLoaders,
  });

  return config;
};