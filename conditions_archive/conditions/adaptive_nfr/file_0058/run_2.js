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

// ============================================================================
// Helper Functions - Environment Detection
// ============================================================================

/**
 * Determines the devtool setting based on environment and source map configuration.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {string|boolean} The devtool configuration value
 */
function getDevtool(isEnvProduction, isEnvDevelopment) {
  if (isEnvProduction) {
    return shouldUseSourceMap ? 'source-map' : false;
  }
  return isEnvDevelopment ? 'cheap-module-source-map' : false;
}

/**
 * Determines the output filename based on environment.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {string} The filename pattern
 */
function getOutputFilename(isEnvProduction, isEnvDevelopment) {
  if (isEnvProduction) {
    return 'static/js/[name].[contenthash:8].js';
  }
  return isEnvDevelopment ? 'static/js/bundle.js' : '';
}

/**
 * Determines the chunk filename based on environment.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {string} The chunk filename pattern
 */
function getChunkFilename(isEnvProduction, isEnvDevelopment) {
  if (isEnvProduction) {
    return 'static/js/[name].[contenthash:8].chunk.js';
  }
  return isEnvDevelopment ? 'static/js/[name].chunk.js' : '';
}

/**
 * Determines the devtool module filename template based on environment.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {Function|boolean} The template function or false
 */
function getDevtoolModuleFilenameTemplate(isEnvProduction, isEnvDevelopment) {
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
}

/**
 * Determines the source map setting for CSS loaders.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {boolean} Whether to use source maps
 */
function getCSSSourceMap(isEnvProduction, isEnvDevelopment) {
  return isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;
}

// ============================================================================
// Helper Functions - PostCSS Configuration
// ============================================================================

/**
 * Builds the PostCSS plugins array based on Tailwind configuration.
 * @returns {Array} Array of PostCSS plugins
 */
function getPostCSSPlugins() {
  if (useTailwind) {
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
  }
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

// ============================================================================
// Helper Functions - Style Loaders
// ============================================================================

/**
 * Generates style loaders configuration for CSS processing.
 * @param {Object} cssOptions - CSS loader options
 * @param {string} preProcessor - Optional preprocessor (e.g., 'sass-loader')
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {Array} Array of loader configurations
 */
function getStyleLoaders(cssOptions, preProcessor, isEnvProduction, isEnvDevelopment) {
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
          plugins: getPostCSSPlugins(),
        },
        sourceMap: getCSSSourceMap(isEnvProduction, isEnvDevelopment),
      },
    },
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: getCSSSourceMap(isEnvProduction, isEnvDevelopment),
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

// ============================================================================
// Helper Functions - Babel Configuration
// ============================================================================

/**
 * Builds Babel cache identifier based on environment.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {string} Cache identifier
 */
function getBabelCacheIdentifier(isEnvProduction, isEnvDevelopment) {
  const env = isEnvProduction ? 'production' : isEnvDevelopment ? 'development' : 'unknown';
  return getCacheIdentifier(env, [
    'babel-plugin-named-asset-import',
    'babel-preset-react-app',
    'react-dev-utils',
    'react-scripts',
  ]);
}

/**
 * Builds Babel plugins array based on environment.
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @param {boolean} shouldUseReactRefresh - Whether to use React Refresh
 * @returns {Array} Array of Babel plugins
 */
function getBabelPlugins(isEnvDevelopment, shouldUseReactRefresh) {
  return [
    isEnvDevelopment &&
      shouldUseReactRefresh &&
      require.resolve('react-refresh/babel'),
  ].filter(Boolean);
}

// ============================================================================
// Helper Functions - Plugin Configuration
// ============================================================================

/**
 * Creates HTML minification options for production builds.
 * @returns {Object} Minification configuration
 */
function getHtmlMinifyOptions() {
  return {
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

/**
 * Creates HtmlWebpackPlugin configuration.
 * @param {boolean} isEnvProduction - Whether building for production
 * @returns {Object} Plugin configuration
 */
function getHtmlWebpackPluginConfig(isEnvProduction) {
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
}

/**
 * Builds the list of plugins to include based on environment.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @param {boolean} shouldUseReactRefresh - Whether to use React Refresh
 * @param {Object} env - Environment variables
 * @returns {Array} Array of webpack plugins
 */
function buildPlugins(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh, env) {
  const plugins = [
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
      new WorkboxWebpackPlugin.InjectManifest({
        swSrc,
        dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
        exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }),
    useTypeScript &&
      new ForkTsCheckerWebpackPlugin(getForkTsCheckerConfig(isEnvProduction, isEnvDevelopment)),
    !disableESLintPlugin &&
      new ESLintPlugin(getESLintPluginConfig()),
  ];

  return plugins.filter(Boolean);
}

/**
 * Creates ForkTsCheckerWebpackPlugin configuration.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {Object} Plugin configuration
 */
function getForkTsCheckerConfig(isEnvProduction, isEnvDevelopment) {
  return {
    async: isEnvDevelopment,
    typescript: {
      typescriptPath: resolve.sync('typescript', {
        basedir: paths.appNodeModules,
      }),
      configOverwrite: {
        compilerOptions: {
          sourceMap: getCSSSourceMap(isEnvProduction, isEnvDevelopment),
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
 * Creates ESLintPlugin configuration.
 * @returns {Object} Plugin configuration
 */
function getESLintPluginConfig() {
  return {
    extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
    formatter: require.resolve('react-dev-utils/eslintFormatter'),
    eslintPath: require.resolve('eslint'),
    failOnError: !(emitErrorsAsWarnings),
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

// ============================================================================
// Helper Functions - Module Rules
// ============================================================================

/**
 * Creates module rules for webpack configuration.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {Array} Array of module rules
 */
function buildModuleRules(isEnvProduction, isEnvDevelopment) {
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
            cacheIdentifier: getBabelCacheIdentifier(isEnvProduction, isEnvDevelopment),
            plugins: getBabelPlugins(isEnvDevelopment, env.raw.FAST_REFRESH),
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
          use: getStyleLoaders(
            {
              importLoaders: 1,
              sourceMap: getCSSSourceMap(isEnvProduction, isEnvDevelopment),
              modules: {
                mode: 'icss',
              },
            },
            undefined,
            isEnvProduction,
            isEnvDevelopment
          ),
          sideEffects: true,
        },
        {
          test: cssModuleRegex,
          use: getStyleLoaders(
            {
              importLoaders: 1,
              sourceMap: getCSSSourceMap(isEnvProduction, isEnvDevelopment),
              modules: {
                mode: 'local',
                getLocalIdent: getCSSModuleLocalIdent,
              },
            },
            undefined,
            isEnvProduction,
            isEnvDevelopment
          ),
        },
        {
          test: sassRegex,
          exclude: sassModuleRegex,
          use: getStyleLoaders(
            {
              importLoaders: 3,
              sourceMap: getCSSSourceMap(isEnvProduction, isEnvDevelopment),
              modules: {
                mode: 'icss',
              },
            },
            'sass-loader',
            isEnvProduction,
            isEnvDevelopment
          ),
          sideEffects: true,
        },
        {
          test: sassModuleRegex,
          use: getStyleLoaders(
            {
              importLoaders: 3,
              sourceMap: getCSSSourceMap(isEnvProduction, isEnvDevelopment),
              modules: {
                mode: 'local',
                getLocalIdent: getCSSModuleLocalIdent,
              },
            },
            'sass-loader',
            isEnvProduction,
            isEnvDevelopment
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

// ============================================================================
// Main Configuration Factory
// ============================================================================

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';

  // Variable used for enabling profiling in Production
  // passed into alias object. Uses a flag if passed into the build command
  const isEnvProductionProfile =
    isEnvProduction && process.argv.includes('--profile');

  // We will provide `paths.publicUrlOrPath` to our app
  // as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
  // Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
  // Get environment variables to inject into our app.
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));

  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  return {
    target: ['browserslist'],
    // Webpack noise constrained to errors and warnings
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    // Stop compilation early in production
    bail: isEnvProduction,
    devtool: getDevtool(isEnvProduction, isEnvDevelopment),
    // These are the "entry points" to our application.
    // This means they will be the "root" imports that are included in JS bundle.
    entry: paths.appIndexJs,
    output: {
      // The build folder.
      path: paths.appBuild,
      // Add /* filename */ comments to generated require()s in the output.
      pathinfo: isEnvDevelopment,
      // There will be one main bundle, and one file per asynchronous chunk.
      // In development, it does not produce real files.
      filename: getOutputFilename(isEnvProduction, isEnvDevelopment),
      // There are also additional JS chunk files if you use code splitting.
      chunkFilename: getChunkFilename(isEnvProduction, isEnvDevelopment),
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      // webpack uses `publicPath` to determine where the app is being served from.
      // It requires a trailing slash, or the file assets will get an incorrect path.
      // We inferred the "public path" (such as / or /my-project) from homepage.
      publicPath: paths.publicUrlOrPath,
      // Point sourcemap entries to original disk location (format as URL on Windows)
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
        // This is only used in production mode
        new TerserPlugin({
          terserOptions: {
            parse: {
              // We want terser to parse ecma 8 code. However, we don't want it
              // to apply any minification steps that turns valid ecma 5 code
              // into invalid ecma 5 code. This is why the 'compress' and 'output'
              // sections only apply transformations that are ecma 5 safe
              // https://github.com/facebook/create-react-app/pull/4234
              ecma: 8,
            },
            compress: {
              ecma: 5,
              warnings: false,
              // Disabled because of an issue with Uglify breaking seemingly valid code:
              // https://github.com/facebook/create-react-app/issues/2376
              // Pending further investigation:
              // https://github.com/mishoo/UglifyJS2/issues/2011
              comparisons: false,
              // Disabled because of an issue with Terser breaking valid code:
              // https://github.com/facebook/create-react-app/issues/5250
              // Pending further investigation:
              // https://github.com/terser-js/terser/issues/120
              inline: 2,
            },
            mangle: {
              safari10: true,
            },
            // Added for profiling in devtools
            keep_classnames: isEnvProductionProfile,
            keep_fnames: isEnvProductionProfile,
            output: {
              ecma: 5,
              comments: false,
              // Turned on because emoji and regex is not minified properly using default
              // https://github.com/facebook/create-react-app/issues/2488
              ascii_only: true,
            },
          },
        }),
        // This is only used in production mode
        new CssMinimizerPlugin(),
      ],
    },
    resolve: {
      // This allows you to set a fallback for where webpack should look for modules.
      // We placed these paths second because we want `node_modules` to "win"
      // if there are any conflicts. This matches Node resolution mechanism.
      // https://github.com/facebook/create-react-app/issues/253
      modules: ['node_modules', paths.appNodeModules].concat(
        modules.additionalModulePaths || []
      ),
      // These are the reasonable defaults supported by the Node ecosystem.
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see:
      // https://github.com/facebook/create-react-app/issues/290
      // `web` extension prefixes have been added for better support
      // for React Native Web.
      extensions: paths.moduleFileExtensions
        .map(ext => `.${ext}`)
        .filter(ext => useTypeScript || !ext.includes('ts')),
      alias: {
        // Support React Native Web
        // https://www.smashingmagazine.com/2016/08/a-glimpse-into-the-future-with-react-native-for-web/
        'react-native': 'react-native-web',
        // Allows for better profiling with ReactDevTools
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
        ...(modules.webpackAliases || {}),
      },
      plugins: [
        // Prevents users from importing files from outside of src/ (or node_modules/).
        // This often causes confusion because we only process files within src/ with babel.
        // To fix this, we prevent you from importing files out of src/ -- if you'd like to,
        // please link the files into your node_modules/ and let module-resolution kick in.
        // Make sure your source files are compiled, as they will not be processed in any way.
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
      rules: buildModuleRules(isEnvProduction, isEnvDevelopment),
    },
    plugins: buildPlugins(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh, env),
    // Turn off performance processing because we utilize
    // our own hints via the FileSizeReporter
    performance: false,
  };
};
```