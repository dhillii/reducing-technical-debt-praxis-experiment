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
 * Determines the devtool setting based on environment and source map configuration
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {string|boolean} The devtool configuration value
 */
const getDevtool = (isEnvProduction, isEnvDevelopment) => {
  if (isEnvProduction) {
    return shouldUseSourceMap ? 'source-map' : false;
  }
  return isEnvDevelopment ? 'cheap-module-source-map' : false;
};

/**
 * Determines the output filename based on environment
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {string} The filename pattern
 */
const getOutputFilename = (isEnvProduction, isEnvDevelopment) => {
  if (isEnvProduction) {
    return 'static/js/[name].[contenthash:8].js';
  }
  return isEnvDevelopment ? 'static/js/bundle.js' : '';
};

/**
 * Determines the chunk filename based on environment
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {string} The chunk filename pattern
 */
const getChunkFilename = (isEnvProduction, isEnvDevelopment) => {
  if (isEnvProduction) {
    return 'static/js/[name].[contenthash:8].chunk.js';
  }
  return isEnvDevelopment ? 'static/js/[name].chunk.js' : '';
};

/**
 * Determines the devtool module filename template based on environment
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {Function|boolean} The template function or false
 */
const getDevtoolModuleFilenameTemplate = (isEnvProduction, isEnvDevelopment) => {
  if (isEnvProduction) {
    return info =>
      path
        .relative(paths.appSrc, info.absoluteResourcePath)
        .replace(/\\/g, '/');
  }
  if (isEnvDevelopment) {
    return info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/');
  }
  return false;
};

/**
 * Gets the source map setting for CSS loaders
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {boolean} Whether to use source maps
 */
const getCssSourceMap = (isEnvProduction, isEnvDevelopment) => {
  return isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;
};

/**
 * Gets PostCSS plugins configuration based on Tailwind availability
 * @returns {Array} Array of PostCSS plugins
 */
const getPostCssPlugins = () => {
  const basePlugins = [
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
  ];

  if (useTailwind) {
    return ['tailwindcss', ...basePlugins];
  }

  return [...basePlugins, 'postcss-normalize'];
};

/**
 * Creates style loaders configuration for CSS processing
 * @param {Object} cssOptions - CSS loader options
 * @param {string} preProcessor - Optional preprocessor (e.g., 'sass-loader')
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {Array} Array of loader configurations
 */
const createStyleLoaders = (cssOptions, preProcessor, isEnvProduction, isEnvDevelopment) => {
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
          plugins: getPostCssPlugins(),
        },
        sourceMap: getCssSourceMap(isEnvProduction, isEnvDevelopment),
      },
    },
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: getCssSourceMap(isEnvProduction, isEnvDevelopment),
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
};

/**
 * Gets Babel cache identifier based on environment
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {string} Cache identifier
 */
const getBabelCacheIdentifier = (isEnvProduction, isEnvDevelopment) => {
  const env = isEnvProduction ? 'production' : isEnvDevelopment ? 'development' : 'unknown';
  return getCacheIdentifier(env, [
    'babel-plugin-named-asset-import',
    'babel-preset-react-app',
    'react-dev-utils',
    'react-scripts',
  ]);
};

/**
 * Creates HTML minification options for production
 * @returns {Object} Minification configuration
 */
const getHtmlMinifyOptions = () => ({
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
});

/**
 * Creates HtmlWebpackPlugin configuration
 * @param {boolean} isEnvProduction - Whether building for production
 * @returns {Object} Plugin configuration
 */
const createHtmlWebpackPluginConfig = (isEnvProduction) => {
  const baseConfig = {
    inject: true,
    template: paths.appHtml,
  };

  if (isEnvProduction) {
    return Object.assign({}, baseConfig, {
      minify: getHtmlMinifyOptions(),
    });
  }

  return baseConfig;
};

/**
 * Creates TypeScript checker configuration
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {Object} ForkTsCheckerWebpackPlugin configuration
 */
const createTypeScriptCheckerConfig = (isEnvProduction, isEnvDevelopment) => ({
  async: isEnvDevelopment,
  typescript: {
    typescriptPath: resolve.sync('typescript', {
      basedir: paths.appNodeModules,
    }),
    configOverwrite: {
      compilerOptions: {
        sourceMap: getCssSourceMap(isEnvProduction, isEnvDevelopment),
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
});

/**
 * Creates ESLint plugin configuration
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {Object} ESLintPlugin configuration
 */
const createESLintPluginConfig = (isEnvDevelopment) => ({
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
});

/**
 * Creates resolve alias configuration
 * @param {boolean} isEnvProductionProfile - Whether profiling in production
 * @returns {Object} Alias configuration
 */
const createResolveAlias = (isEnvProductionProfile) => {
  const alias = {
    'react-native': 'react-native-web',
  };

  if (isEnvProductionProfile) {
    alias['react-dom$'] = 'react-dom/profiling';
    alias['scheduler/tracing'] = 'scheduler/tracing-profiling';
  }

  if (modules.webpackAliases) {
    Object.assign(alias, modules.webpackAliases);
  }

  return alias;
};

/**
 * Creates plugins array for webpack configuration
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @param {Object} env - Environment variables
 * @returns {Array} Array of webpack plugins
 */
const createPlugins = (isEnvProduction, isEnvDevelopment, env) => {
  const plugins = [
    new HtmlWebpackPlugin(createHtmlWebpackPluginConfig(isEnvProduction)),
    isEnvProduction &&
      shouldInlineRuntimeChunk &&
      new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
    new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
    new ModuleNotFoundPlugin(paths.appPath),
    new webpack.DefinePlugin(env.stringified),
    isEnvDevelopment &&
      new ReactRefreshWebpackPlugin({
        overlay: false,
      }),
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
    isEnvProduction &&
      fs.existsSync(swSrc) &&
      new WorkboxWebpackPlugin.InjectManifest({
        swSrc,
        dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
        exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }),
    useTypeScript &&
      new ForkTsCheckerWebpackPlugin(createTypeScriptCheckerConfig(isEnvProduction, isEnvDevelopment)),
    !disableESLintPlugin &&
      new ESLintPlugin(createESLintPluginConfig(isEnvDevelopment)),
  ];

  return plugins.filter(Boolean);
};

module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';
  const isEnvProductionProfile =
    isEnvProduction && process.argv.includes('--profile');

  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  const getStyleLoaders = (cssOptions, preProcessor) => {
    return createStyleLoaders(cssOptions, preProcessor, isEnvProduction, isEnvDevelopment);
  };

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    bail: isEnvProduction,
    devtool: getDevtool(isEnvProduction, isEnvDevelopment),
    entry: paths.appIndexJs,
    output: {
      path: paths.appBuild,
      pathinfo: isEnvDevelopment,
      filename: getOutputFilename(isEnvProduction, isEnvDevelopment),
      chunkFilename: getChunkFilename(isEnvProduction, isEnvDevelopment),
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      publicPath: paths.publicUrlOrPath,
      devtoolModuleFilenameTemplate: getDevtoolModuleFilenameTemplate(isEnvProduction, isEnvDevelopment),
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
    infrastructureLogging: {
      level: 'none',
    },
    optimization: {
      minimize: isEnvProduction,
      minimizer: [
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
      ],
    },
    resolve: {
      modules: ['node_modules', paths.appNodeModules].concat(
        modules.additionalModulePaths || []
      ),
      extensions: paths.moduleFileExtensions
        .map(ext => `.${ext}`)
        .filter(ext => useTypeScript || !ext.includes('ts')),
      alias: createResolveAlias(isEnvProductionProfile),
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
                cacheIdentifier: getBabelCacheIdentifier(isEnvProduction, isEnvDevelopment),
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
                cacheIdentifier: getBabelCacheIdentifier(isEnvProduction, isEnvDevelopment),
                sourceMaps: shouldUseSourceMap,
                inputSourceMap: shouldUseSourceMap,
              },
            },
            {
              test: cssRegex,
              exclude: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: getCssSourceMap(isEnvProduction, isEnvDevelopment),
                modules: {
                  mode: 'icss',
                },
              }),
              sideEffects: true,
            },
            {
              test: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: getCssSourceMap(isEnvProduction, isEnvDevelopment),
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
                  sourceMap: getCssSourceMap(isEnvProduction, isEnvDevelopment),
                  modules: {
                    mode: 'icss',
                  },
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
                  sourceMap: getCssSourceMap(isEnvProduction, isEnvDevelopment),
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
      ].filter(Boolean),
    },
    plugins: createPlugins(isEnvProduction, isEnvDevelopment, env),
    performance: false,
  };
};