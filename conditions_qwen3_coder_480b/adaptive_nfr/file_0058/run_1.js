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
 * Determines if the current environment is development
 * @param {string} webpackEnv - The webpack environment
 * @returns {boolean}
 */
const isDevelopmentEnvironment = (webpackEnv) => webpackEnv === 'development';

/**
 * Determines if the current environment is production
 * @param {string} webpackEnv - The webpack environment
 * @returns {boolean}
 */
const isProductionEnvironment = (webpackEnv) => webpackEnv === 'production';

/**
 * Determines if production profiling is enabled
 * @param {boolean} isEnvProduction - Whether the environment is production
 * @returns {boolean}
 */
const isProductionProfileEnabled = (isEnvProduction) => 
  isEnvProduction && process.argv.includes('--profile');

/**
 * Gets the appropriate devtool setting based on environment
 * @param {boolean} isEnvProduction - Whether the environment is production
 * @param {boolean} isEnvDevelopment - Whether the environment is development
 * @param {boolean} shouldUseSourceMap - Whether source maps should be used
 * @returns {string|boolean}
 */
const getDevtoolSetting = (isEnvProduction, isEnvDevelopment, shouldUseSourceMap) => {
  if (isEnvProduction) {
    return shouldUseSourceMap ? 'source-map' : false;
  }
  return isEnvDevelopment ? 'cheap-module-source-map' : false;
};

/**
 * Gets the output filename based on environment
 * @param {boolean} isEnvProduction - Whether the environment is production
 * @param {boolean} isEnvDevelopment - Whether the environment is development
 * @returns {string}
 */
const getOutputFilename = (isEnvProduction, isEnvDevelopment) => {
  if (isEnvProduction) {
    return 'static/js/[name].[contenthash:8].js';
  }
  if (isEnvDevelopment) {
    return 'static/js/bundle.js';
  }
  return 'static/js/bundle.js';
};

/**
 * Gets the chunk filename based on environment
 * @param {boolean} isEnvProduction - Whether the environment is production
 * @param {boolean} isEnvDevelopment - Whether the environment is development
 * @returns {string}
 */
const getChunkFilename = (isEnvProduction, isEnvDevelopment) => {
  if (isEnvProduction) {
    return 'static/js/[name].[contenthash:8].chunk.js';
  }
  if (isEnvDevelopment) {
    return 'static/js/[name].chunk.js';
  }
  return 'static/js/[name].chunk.js';
};

/**
 * Gets the devtool module filename template based on environment
 * @param {boolean} isEnvProduction - Whether the environment is production
 * @param {boolean} isEnvDevelopment - Whether the environment is development
 * @returns {Function|string}
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
  return undefined;
};

/**
 * Gets the HtmlWebpackPlugin configuration
 * @param {boolean} isEnvProduction - Whether the environment is production
 * @returns {Object}
 */
const getHtmlWebpackPluginConfig = (isEnvProduction) => {
  const baseConfig = {
    inject: true,
    template: paths.appHtml,
  };

  if (isEnvProduction) {
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
      }
    };
  }

  return baseConfig;
};

/**
 * Gets the postcss plugins based on whether Tailwind is used
 * @param {boolean} useTailwind - Whether Tailwind is being used
 * @returns {Array}
 */
const getPostcssPlugins = (useTailwind) => {
  if (!useTailwind) {
    return [
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
    ];
  }

  return [
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
  ];
};

/**
 * Gets the CSS loader options
 * @param {boolean} isEnvProduction - Whether the environment is production
 * @param {boolean} isEnvDevelopment - Whether the environment is development
 * @param {boolean} shouldUseSourceMap - Whether source maps should be used
 * @returns {Object}
 */
const getCssLoaderOptions = (isEnvProduction, isEnvDevelopment, shouldUseSourceMap) => ({
  sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
});

/**
 * Gets the MiniCssExtractPlugin loader options
 * @param {string} publicUrlOrPath - The public URL or path
 * @returns {Object}
 */
const getMiniCssExtractPluginOptions = (publicUrlOrPath) => {
  if (publicUrlOrPath.startsWith('.')) {
    return { publicPath: '../../' };
  }
  return {};
};

/**
 * Gets the resolve-url-loader options
 * @param {boolean} isEnvProduction - Whether the environment is production
 * @param {boolean} isEnvDevelopment - Whether the environment is development
 * @param {string} appSrc - The application source path
 * @returns {Object}
 */
const getResolveUrlLoaderOptions = (isEnvProduction, isEnvDevelopment, appSrc) => ({
  sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
  root: appSrc,
});

/**
 * Gets the babel-loader cache identifier
 * @param {boolean} isEnvProduction - Whether the environment is production
 * @param {boolean} isEnvDevelopment - Whether the environment is development
 * @returns {string}
 */
const getBabelLoaderCacheIdentifier = (isEnvProduction, isEnvDevelopment) => {
  if (isEnvProduction) {
    return 'production';
  }
  if (isEnvDevelopment) {
    return 'development';
  }
  return 'development';
};

/**
 * Gets the babel-loader presets
 * @param {boolean} hasJsxRuntime - Whether JSX runtime is available
 * @returns {Array}
 */
const getBabelLoaderPresets = (hasJsxRuntime) => [
  [
    require.resolve('babel-preset-react-app'),
    {
      runtime: hasJsxRuntime ? 'automatic' : 'classic',
    },
  ],
];

/**
 * Gets the babel-loader plugins
 * @param {boolean} isEnvDevelopment - Whether the environment is development
 * @param {boolean} shouldUseReactRefresh - Whether React Refresh should be used
 * @returns {Array}
 */
const getBabelLoaderPlugins = (isEnvDevelopment, shouldUseReactRefresh) => {
  const plugins = [];
  if (isEnvDevelopment && shouldUseReactRefresh) {
    plugins.push(require.resolve('react-refresh/babel'));
  }
  return plugins;
};

/**
 * Gets the TerserPlugin configuration
 * @param {boolean} isEnvProductionProfile - Whether production profiling is enabled
 * @returns {Object}
 */
const getTerserPluginConfig = (isEnvProductionProfile) => ({
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
});

/**
 * Gets the alias configuration
 * @param {boolean} isEnvProductionProfile - Whether production profiling is enabled
 * @param {Object} webpackAliases - Webpack aliases from modules
 * @returns {Object}
 */
const getAliasConfig = (isEnvProductionProfile, webpackAliases) => {
  const alias = {
    'react-native': 'react-native-web',
  };

  if (isEnvProductionProfile) {
    alias['react-dom$'] = 'react-dom/profiling';
    alias['scheduler/tracing'] = 'scheduler/tracing-profiling';
  }

  return { ...alias, ...(webpackAliases || {}) };
};

/**
 * Gets the ModuleScopePlugin paths
 * @returns {Array}
 */
const getModuleScopePluginPaths = () => [
  paths.appPackageJson,
  reactRefreshRuntimeEntry,
  reactRefreshWebpackPluginRuntimeEntry,
  babelRuntimeEntry,
  babelRuntimeEntryHelpers,
  babelRuntimeRegenerator,
];

/**
 * Gets the style loaders
 * @param {Function} getStyleLoadersFn - Function to get style loaders
 * @param {RegExp} testRegex - Test regex for the loader
 * @param {RegExp} excludeRegex - Exclude regex for the loader
 * @param {Object} cssOptions - CSS options
 * @param {string} preProcessor - Preprocessor to use
 * @returns {Object}
 */
const createStyleLoaderConfig = (getStyleLoadersFn, testRegex, excludeRegex, cssOptions, preProcessor) => ({
  test: testRegex,
  exclude: excludeRegex,
  use: getStyleLoadersFn(cssOptions, preProcessor),
  sideEffects: true,
});

/**
 * Gets the CSS module loader config
 * @param {Function} getStyleLoadersFn - Function to get style loaders
 * @param {RegExp} testRegex - Test regex for the loader
 * @param {Object} cssOptions - CSS options
 * @returns {Object}
 */
const createCssModuleLoaderConfig = (getStyleLoadersFn, testRegex, cssOptions) => ({
  test: testRegex,
  use: getStyleLoadersFn(cssOptions),
});

/**
 * Gets the file loader config
 * @returns {Object}
 */
const getFileLoaderConfig = () => ({
  exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
  type: 'asset/resource',
});

/**
 * Gets the ForkTsCheckerWebpackPlugin config
 * @param {boolean} isEnvDevelopment - Whether the environment is development
 * @param {boolean} isEnvProduction - Whether the environment is production
 * @param {boolean} shouldUseSourceMap - Whether source maps should be used
 * @returns {Object}
 */
const getForkTsCheckerWebpackPluginConfig = (isEnvDevelopment, isEnvProduction, shouldUseSourceMap) => ({
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
});

/**
 * Gets the ESLintPlugin config
 * @param {boolean} isEnvDevelopment - Whether the environment is development
 * @param {boolean} emitErrorsAsWarnings - Whether to emit errors as warnings
 * @param {boolean} hasJsxRuntime - Whether JSX runtime is available
 * @returns {Object}
 */
const getESLintPluginConfig = (isEnvDevelopment, emitErrorsAsWarnings, hasJsxRuntime) => ({
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
 * Gets the WorkboxWebpackPlugin config
 * @returns {Object}
 */
const getWorkboxWebpackPluginConfig = () => ({
  swSrc,
  dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
  exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
});

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function (webpackEnv) {
  const isEnvDevelopment = isDevelopmentEnvironment(webpackEnv);
  const isEnvProduction = isProductionEnvironment(webpackEnv);

  // Variable used for enabling profiling in Production
  // passed into alias object. Uses a flag if passed into the build command
  const isEnvProductionProfile = isProductionProfileEnabled(isEnvProduction);

  // We will provide `paths.publicUrlOrPath` to our app
  // as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
  // Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
  // Get environment variables to inject into our app.
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));

  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  // common function to get style loaders
  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = [
      isEnvDevelopment && require.resolve('style-loader'),
      isEnvProduction && {
        loader: MiniCssExtractPlugin.loader,
        options: getMiniCssExtractPluginOptions(paths.publicUrlOrPath),
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
            plugins: getPostcssPlugins(useTailwind),
          },
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
        },
      },
    ].filter(Boolean);
    if (preProcessor) {
      loaders.push(
        {
          loader: require.resolve('resolve-url-loader'),
          options: getResolveUrlLoaderOptions(isEnvProduction, isEnvDevelopment, paths.appSrc),
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

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    bail: isEnvProduction,
    devtool: getDevtoolSetting(isEnvProduction, isEnvDevelopment, shouldUseSourceMap),
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
        new TerserPlugin(getTerserPluginConfig(isEnvProductionProfile)),
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
      alias: getAliasConfig(isEnvProductionProfile, modules.webpackAliases),
      plugins: [
        new ModuleScopePlugin(paths.appSrc, getModuleScopePluginPaths()),
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
                presets: getBabelLoaderPresets(hasJsxRuntime),
                babelrc: false,
                configFile: false,
                cacheIdentifier: getCacheIdentifier(
                  getBabelLoaderCacheIdentifier(isEnvProduction, isEnvDevelopment),
                  [
                    'babel-plugin-named-asset-import',
                    'babel-preset-react-app',
                    'react-dev-utils',
                    'react-scripts',
                  ]
                ),
                plugins: getBabelLoaderPlugins(isEnvDevelopment, shouldUseReactRefresh),
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
                  getBabelLoaderCacheIdentifier(isEnvProduction, isEnvDevelopment),
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
            createStyleLoaderConfig(
              getStyleLoaders,
              cssRegex,
              cssModuleRegex,
              {
                importLoaders: 1,
                ...getCssLoaderOptions(isEnvProduction, isEnvDevelopment, shouldUseSourceMap),
                modules: {
                  mode: 'icss',
                },
              }
            ),
            createCssModuleLoaderConfig(
              getStyleLoaders,
              cssModuleRegex,
              {
                importLoaders: 1,
                ...getCssLoaderOptions(isEnvProduction, isEnvDevelopment, shouldUseSourceMap),
                modules: {
                  mode: 'local',
                  getLocalIdent: getCSSModuleLocalIdent,
                },
              }
            ),
            createStyleLoaderConfig(
              getStyleLoaders,
              sassRegex,
              sassModuleRegex,
              {
                importLoaders: 3,
                ...getCssLoaderOptions(isEnvProduction, isEnvDevelopment, shouldUseSourceMap),
                modules: {
                  mode: 'icss',
                },
              },
              'sass-loader'
            ),
            createCssModuleLoaderConfig(
              getStyleLoaders,
              sassModuleRegex,
              {
                importLoaders: 3,
                ...getCssLoaderOptions(isEnvProduction, isEnvDevelopment, shouldUseSourceMap),
                modules: {
                  mode: 'local',
                  getLocalIdent: getCSSModuleLocalIdent,
                },
              },
              'sass-loader'
            ),
            getFileLoaderConfig(),
          ],
        },
      ].filter(Boolean),
    },
    plugins: [
      new HtmlWebpackPlugin(getHtmlWebpackPluginConfig(isEnvProduction)),
      isEnvProduction &&
        shouldInlineRuntimeChunk &&
        new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
      new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
      new ModuleNotFoundPlugin(paths.appPath),
      new webpack.DefinePlugin(env.stringified),
      isEnvDevelopment &&
        shouldUseReactRefresh &&
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
        new WorkboxWebpackPlugin.InjectManifest(getWorkboxWebpackPluginConfig()),
      useTypeScript &&
        new ForkTsCheckerWebpackPlugin(getForkTsCheckerWebpackPluginConfig(isEnvDevelopment, isEnvProduction, shouldUseSourceMap)),
      !disableESLintPlugin &&
        new ESLintPlugin(getESLintPluginConfig(isEnvDevelopment, emitErrorsAsWarnings, hasJsxRuntime)),
    ].filter(Boolean),
    performance: false,
  };
};