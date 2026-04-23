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

/**
 * Determines if the environment is development or production.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development, false otherwise.
 */
function isDevelopment(webpackEnv) {
  return webpackEnv === 'development';
}

/**
 * Determines if the environment is production.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production, false otherwise.
 */
function isProduction(webpackEnv) {
  return webpackEnv === 'production';
}

/**
 * Determines if production profiling is enabled.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production profiling, false otherwise.
 */
function isProductionProfile(webpackEnv) {
  return isProduction(webpackEnv) && process.argv.includes('--profile');
}

/**
 * Gets the environment configuration.
 * @param {string} publicUrlOrPath - The public URL or path.
 * @returns {Object} The environment configuration.
 */
function getEnvironment(publicUrlOrPath) {
  return getClientEnvironment(publicUrlOrPath.slice(0, -1));
}

/**
 * Determines if React Refresh should be used.
 * @param {Object} env - The environment configuration.
 * @returns {boolean} True if React Refresh should be used.
 */
function shouldUseReactRefresh(env) {
  return env.raw.FAST_REFRESH;
}

/**
 * Gets the source map configuration.
 * @param {boolean} isProduction - Whether the environment is production.
 * @param {boolean} isDevelopment - Whether the environment is development.
 * @returns {boolean} True if source maps should be used.
 */
function getSourceMap(isProduction, isDevelopment) {
  return isProduction ? shouldUseSourceMap : isDevelopment;
}

/**
 * Gets the style loaders configuration.
 * @param {Object} cssOptions - The CSS options.
 * @param {string} preProcessor - The pre-processor (sass, less, etc.).
 * @param {boolean} isProduction - Whether the environment is production.
 * @param {boolean} isDevelopment - Whether the environment is development.
 * @param {boolean} useTailwind - Whether Tailwind is configured.
 * @returns {Array} The style loaders array.
 */
function getStyleLoaders(cssOptions, preProcessor) {
  const loaders = [
    isDevelopment && require.resolve('style-loader'),
    isProduction && {
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
        sourceMap: getSourceMap(isProduction, isDevelopment),
      },
    },
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: getSourceMap(isProduction, isDevelopment),
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
 * Gets the postcss plugins configuration.
 * @param {boolean} useTailwind - Whether Tailwind is configured.
 * @returns {Array} The postcss plugins array.
 */
function getPostcssPlugins() {
  return !useTailwind
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
      ];
}

/**
 * Gets the Terser plugin configuration.
 * @param {boolean} isProduction - Whether the environment is production.
 * @param {boolean} isProductionProfile - Whether production profiling is enabled.
 * @returns {Object} The Terser plugin configuration.
 */
function getTerserPlugin(isProduction, isProductionProfile) {
  return new TerserPlugin({
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
      keep_classnames: isProductionProfile,
      keep_fnames: isProductionProfile,
      output: {
        ecma: 5,
        comments: false,
        ascii_only: true,
      },
    },
  });
}

/**
 * Gets the minimizer configuration.
 * @param {boolean} isProduction - Whether the environment is production.
 * @returns {Array} The minimizer array.
 */
function getMinimizers(isProduction) {
  return [
    getTerserPlugin(isProduction, isProductionProfile),
    new CssMinimizerPlugin(),
  ];
}

/**
 * Gets the babel cache identifier.
 * @param {string} envName - The environment name.
 * @param {Array} dependencies - The cache dependencies.
 * @returns {string} The cache identifier.
 */
function getBabelCacheIdentifier(envName, dependencies) {
  return getCacheIdentifier(envName, dependencies);
}

/**
 * Gets the babel plugin configuration.
 * @param {boolean} isDevelopment - Whether the environment is development.
 * @param {boolean} shouldUseReactRefresh - Whether React Refresh should be used.
 * @returns {Array} The babel plugins array.
 */
function getBabelPlugins(isDevelopment, shouldUseReactRefresh) {
  return [
    isDevelopment &&
      shouldUseReactRefresh &&
      require.resolve('react-refresh/babel'),
  ].filter(Boolean);
}

/**
 * Gets the module file extensions.
 * @param {Array} moduleFileExtensions - The module file extensions.
 * @param {boolean} useTypeScript - Whether TypeScript is configured.
 * @returns {Array} The resolved extensions array.
 */
function getModuleExtensions(moduleFileExtensions, useTypeScript) {
  return moduleFileExtensions
    .map(ext => `.${ext}`)
    .filter(ext => useTypeScript || !ext.includes('ts'));
}

/**
 * Gets the webpack resolve configuration.
 * @param {boolean} isProductionProfile - Whether production profiling is enabled.
 * @param {Object} webpackAliases - The webpack aliases.
 * @returns {Object} The resolve configuration.
 */
function getResolveConfig(isProductionProfile, webpackAliases) {
  return {
    modules: ['node_modules', paths.appNodeModules].concat(
      modules.additionalModulePaths || []
    ),
    extensions: getModuleExtensions(paths.moduleFileExtensions, useTypeScript),
    alias: {
      'react-native': 'react-native-web',
      ...(isProductionProfile && {
        'react-dom$': 'react-dom/profiling',
        'scheduler/tracing': 'scheduler/tracing-profiling',
      }),
      ...(webpackAliases || {}),
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
 * Gets the cache configuration.
 * @param {Object} env - The environment configuration.
 * @returns {Object} The cache configuration.
 */
function getCacheConfig(env) {
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
 * Gets the output configuration.
 * @param {boolean} isProduction - Whether the environment is production.
 * @param {boolean} isDevelopment - Whether the environment is development.
 * @param {boolean} shouldUseSourceMap - Whether source maps should be used.
 * @returns {Object} The output configuration.
 */
function getOutputConfig(isProduction, isDevelopment, shouldUseSourceMap) {
  return {
    path: paths.appBuild,
    pathinfo: isDevelopment,
    filename: isProduction
      ? 'static/js/[name].[contenthash:8].js'
      : isDevelopment && 'static/js/bundle.js',
    chunkFilename: isProduction
      ? 'static/js/[name].[contenthash:8].chunk.js'
      : isDevelopment && 'static/js/[name].chunk.js',
    assetModuleFilename: 'static/media/[name].[hash][ext]',
    publicPath: paths.publicUrlOrPath,
    devtoolModuleFilenameTemplate: isProduction
      ? info =>
          path
            .relative(paths.appSrc, info.absoluteResourcePath)
            .replace(/\\/g, '/')
      : isDevelopment &&
        (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
  };
}

/**
 * Gets the HTML plugin configuration.
 * @param {boolean} isProduction - Whether the environment is production.
 * @returns {Object} The HTML plugin configuration.
 */
function getHtmlPluginConfig(isProduction) {
  return {
    inject: true,
    template: paths.appHtml,
    ...(isProduction && {
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
}

/**
 * Gets the WebpackManifestPlugin configuration.
 * @param {string} publicUrlOrPath - The public URL or path.
 * @returns {Object} The WebpackManifestPlugin configuration.
 */
function getWebpackManifestPluginConfig(publicUrlOrPath) {
  return {
    fileName: 'asset-manifest.json',
    publicPath: publicUrlOrPath,
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
}

/**
 * Gets the ESLint plugin configuration.
 * @param {boolean} isDevelopment - Whether the environment is development.
 * @param {boolean} emitErrorsAsWarnings - Whether errors should be emitted as warnings.
 * @param {boolean} hasJsxRuntime - Whether JSX runtime is available.
 * @returns {Object} The ESLint plugin configuration.
 */
function getESLintPluginConfig(isDevelopment, emitErrorsAsWarnings, hasJsxRuntime) {
  return {
    extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
    formatter: require.resolve('react-dev-utils/eslintFormatter'),
    eslintPath: require.resolve('eslint'),
    failOnError: !(isDevelopment && emitErrorsAsWarnings),
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
  };
}

/**
 * Gets the TypeScript checker plugin configuration.
 * @param {boolean} isDevelopment - Whether the environment is development.
 * @param {boolean} shouldUseSourceMap - Whether source maps should be used.
 * @returns {Object} The TypeScript checker plugin configuration.
 */
function getTsCheckerPluginConfig(isDevelopment, shouldUseSourceMap) {
  return {
    async: isDevelopment,
    typescript: {
      typescriptPath: resolve.sync('typescript', {
        basedir: paths.appNodeModules,
      }),
      configOverwrite: {
        compilerOptions: {
          sourceMap: isProduction
            ? shouldUseSourceMap
            : isDevelopment,
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
  };
}

/**
 * Gets the service worker plugin configuration.
 * @param {boolean} isProduction - Whether the environment is production.
 * @returns {Object} The service worker plugin configuration.
 */
function getServiceWorkerPluginConfig(isProduction) {
  return {
    swSrc,
    dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
    exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  };
}

/**
 * Gets the module rules configuration.
 * @param {boolean} shouldUseSourceMap - Whether source maps should be used.
 * @param {boolean} isProduction - Whether the environment is production.
 * @param {boolean} isDevelopment - Whether the environment is development.
 * @param {boolean} useTypeScript - Whether TypeScript is configured.
 * @returns {Array} The module rules array.
 */
function getModuleRules(
  shouldUseSourceMap,
  isProduction,
  isDevelopment,
  useTypeScript
) {
  return [
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
            cacheIdentifier: getBabelCacheIdentifier(
              isProduction ? 'production' : 'development',
              [
                'babel-plugin-named-asset-import',
                'babel-preset-react-app',
                'react-dev-utils',
                'react-scripts',
              ]
            ),
            plugins: getBabelPlugins(isDevelopment, shouldUseReactRefresh),
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
            cacheIdentifier: getBabelCacheIdentifier(
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
          },
        },
        {
          test: cssRegex,
          exclude: cssModuleRegex,
          use: getStyleLoaders({
            importLoaders: 1,
            sourceMap: isProduction
              ? shouldUseSourceMap
              : isDevelopment,
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
            sourceMap: isProduction
              ? shouldUseSourceMap
              : isDevelopment,
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
              sourceMap: isProduction
                ? shouldUseSourceMap
                : isDevelopment,
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
              sourceMap: isProduction
                ? shouldUseSourceMap
                : isDevelopment,
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
}

/**
 * Gets the plugins configuration.
 * @param {boolean} isDevelopment - Whether the environment is development.
 * @param {boolean} isProduction - Whether the environment is production.
 * @param {boolean} shouldUseReactRefresh - Whether React Refresh should be used.
 * @param {boolean} useTypeScript - Whether TypeScript is configured.
 * @param {boolean} disableESLintPlugin - Whether ESLint plugin should be disabled.
 * @param {boolean} emitErrorsAsWarnings - Whether errors should be emitted as warnings.
 * @param {boolean} hasJsxRuntime - Whether JSX runtime is available.
 * @returns {Array} The plugins array.
 */
function getPlugins(
  isDevelopment,
  isProduction,
  shouldUseReactRefresh,
  useTypeScript,
  disableESLintPlugin,
  emitErrorsAsWarnings,
  hasJsxRuntime
) {
  return [
    new HtmlWebpackPlugin(getHtmlPluginConfig(isProduction)),
    isProduction &&
      shouldInlineRuntimeChunk &&
      new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
    new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
    new ModuleNotFoundPlugin(paths.appPath),
    new webpack.DefinePlugin(env.stringified),
    isDevelopment &&
      shouldUseReactRefresh &&
      new ReactRefreshWebpackPlugin({
        overlay: false,
      }),
    isDevelopment && new CaseSensitivePathsPlugin(),
    isProduction &&
      new MiniCssExtractPlugin({
        filename: 'static/css/[name].[contenthash:8].css',
        chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
      }),
    new WebpackManifestPlugin(getWebpackManifestPluginConfig(paths.publicUrlOrPath)),
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/,
    }),
    isProduction &&
      fs.existsSync(swSrc) &&
      new WorkboxWebpackPlugin.InjectManifest(getServiceWorkerPluginConfig(isProduction)),
    useTypeScript &&
      new ForkTsCheckerWebpackPlugin(getTsCheckerPluginConfig(isDevelopment, shouldUseSourceMap)),
    !disableESLintPlugin &&
      new ESLintPlugin(getESLintPluginConfig(isDevelopment, emitErrorsAsWarnings, hasJsxRuntime)),
  ].filter(Boolean);
}

/**
 * Creates the webpack configuration.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {Object} The webpack configuration.
 */
module.exports = function (webpackEnv) {
  const isEnvDevelopment = isDevelopment(webpackEnv);
  const isEnvProduction = isProduction(webpackEnv);
  const isEnvProductionProfile = isProductionProfile(webpackEnv);

  const env = getEnvironment(paths.publicUrlOrPath);
  const shouldUseReactRefresh = shouldUseReactRefresh(env);

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
    output: getOutputConfig(isEnvProduction, isEnvDevelopment, shouldUseSourceMap),
    cache: getCacheConfig(env),
    infrastructureLogging: {
      level: 'none',
    },
    optimization: {
      minimize: isEnvProduction,
      minimizer: getMinimizers(isEnvProduction),
    },
    resolve: getResolveConfig(isEnvProductionProfile, modules.webpackAliases),
    module: {
      strictExportPresence: true,
      rules: getModuleRules(
        shouldUseSourceMap,
        isEnvProduction,
        isEnvDevelopment,
        useTypeScript
      ),
    },
    plugins: getPlugins(
      isEnvDevelopment,
      isEnvProduction,
      shouldUseReactRefresh,
      useTypeScript,
      disableESLintPlugin,
      emitErrorsAsWarnings,
      hasJsxRuntime
    ),
    performance: false,
  };
};
```