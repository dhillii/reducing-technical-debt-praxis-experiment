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
    devtool: getDevtool(isEnvProduction, shouldUseSourceMap, isEnvDevelopment),
    // These are the "entry points" to our application.
    // This means they will be the "root" imports that are included in JS bundle.
    entry: paths.appIndexJs,
    output: getOutputConfig(isEnvProduction, isEnvDevelopment, paths, shouldUseSourceMap),
    cache: getCacheConfig(paths, fs),
    infrastructureLogging: {
      level: 'none',
    },
    optimization: getOptimizationConfig(isEnvProduction),
    resolve: getResolveConfig(paths, modules, useTypeScript, isEnvProductionProfile),
    module: getModuleConfig(paths, cssRegex, cssModuleRegex, sassRegex, sassModuleRegex, getStyleLoaders, useTailwind, useTypeScript, shouldUseSourceMap, isEnvProduction, isEnvDevelopment, imageInlineSizeLimit, hasJsxRuntime, reactRefreshRuntimeEntry, reactRefreshWebpackPluginRuntimeEntry, babelRuntimeEntry, babelRuntimeEntryHelpers, babelRuntimeRegenerator, getCacheIdentifier),
    plugins: getPlugins(
      paths,
      env,
      isEnvDevelopment,
      isEnvProduction,
      shouldInlineRuntimeChunk,
      shouldUseReactRefresh,
      HtmlWebpackPlugin,
      InlineChunkHtmlPlugin,
      InterpolateHtmlPlugin,
      ModuleNotFoundPlugin,
      webpack,
      CaseSensitivePathsPlugin,
      MiniCssExtractPlugin,
      WebpackManifestPlugin,
      WorkboxWebpackPlugin,
      ForkTsCheckerWebpackPlugin,
      ESLintPlugin,
      resolve,
      __dirname,
      emitErrorsAsWarnings,
      disableESLintPlugin,
      hasJsxRuntime
    ),
    // Turn off performance processing because we utilize
    // our own hints via the FileSizeReporter
    performance: false,
  };
};

/**
 * Determines the devtool configuration based on environment and source map settings.
 * @param {boolean} isEnvProduction - Whether the environment is production.
 * @param {boolean} shouldUseSourceMap - Whether source maps should be used.
 * @param {boolean} isEnvDevelopment - Whether the environment is development.
 * @returns {string|boolean} The devtool configuration string or false.
 */
function getDevtool(isEnvProduction, shouldUseSourceMap, isEnvDevelopment) {
  if (isEnvProduction) {
    return shouldUseSourceMap ? 'source-map' : false;
  }
  return isEnvDevelopment && 'cheap-module-source-map';
}

/**
 * Generates the output configuration for the webpack build.
 * @param {boolean} isEnvProduction - Whether the environment is production.
 * @param {boolean} isEnvDevelopment - Whether the environment is development.
 * @param {Object} paths - The paths configuration object.
 * @param {boolean} shouldUseSourceMap - Whether source maps should be used.
 * @returns {Object} The output configuration object.
 */
function getOutputConfig(isEnvProduction, isEnvDevelopment, paths, shouldUseSourceMap) {
  return {
    // The build folder.
    path: paths.appBuild,
    // Add /* filename */ comments to generated require()s in the output.
    pathinfo: isEnvDevelopment,
    // There will be one main bundle, and one file per asynchronous chunk.
    // In development, it does not produce real files.
    filename: isEnvProduction
      ? 'static/js/[name].[contenthash:8].js'
      : isEnvDevelopment && 'static/js/bundle.js',
    // There are also additional JS chunk files if you use code splitting.
    chunkFilename: isEnvProduction
      ? 'static/js/[name].[contenthash:8].chunk.js'
      : isEnvDevelopment && 'static/js/[name].chunk.js',
    assetModuleFilename: 'static/media/[name].[hash][ext]',
    // webpack uses `publicPath` to determine where the app is being served from.
    // It requires a trailing slash, or the file assets will get an incorrect path.
    // We inferred the "public path" (such as / or /my-project) from homepage.
    publicPath: paths.publicUrlOrPath,
    // Point sourcemap entries to original disk location (format as URL on Windows)
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
 * Generates the cache configuration for webpack.
 * @param {Object} paths - The paths configuration object.
 * @param {Object} fs - The file system module.
 * @returns {Object} The cache configuration object.
 */
function getCacheConfig(paths, fs) {
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
 * Generates the optimization configuration for webpack.
 * @param {boolean} isEnvProduction - Whether the environment is production.
 * @returns {Object} The optimization configuration object.
 */
function getOptimizationConfig(isEnvProduction) {
  return {
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
  };
}

/**
 * Generates the resolve configuration for webpack.
 * @param {Object} paths - The paths configuration object.
 * @param {Object} modules - The modules configuration object.
 * @param {boolean} useTypeScript - Whether TypeScript is being used.
 * @param {boolean} isEnvProductionProfile - Whether the environment is production profile.
 * @returns {Object} The resolve configuration object.
 */
function getResolveConfig(paths, modules, useTypeScript, isEnvProductionProfile) {
  return {
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
  };
}

/**
 * Generates the module rules configuration for webpack.
 * @param {Object} paths - The paths configuration object.
 * @param {RegExp} cssRegex - Regex for CSS files.
 * @param {RegExp} cssModuleRegex - Regex for CSS module files.
 * @param {RegExp} sassRegex - Regex for SASS files.
 * @param {RegExp} sassModuleRegex - Regex for SASS module files.
 * @param {Function} getStyleLoaders - Function to get style loaders.
 * @param {boolean} useTailwind - Whether Tailwind is being used.
 * @param {boolean} useTypeScript - Whether TypeScript is being used.
 * @param {boolean} shouldUseSourceMap - Whether source maps should be used.
 * @param {boolean} isEnvProduction - Whether the environment is production.
 * @param {boolean} isEnvDevelopment - Whether the environment is development.
 * @param {number} imageInlineSizeLimit - The size limit for inlining images.
 * @param {boolean} hasJsxRuntime - Whether the new JSX transform is available.
 * @param {string} reactRefreshRuntimeEntry - The path to the React refresh runtime.
 * @param {string} reactRefreshWebpackPluginRuntimeEntry - The path to the React refresh plugin runtime.
 * @param {string} babelRuntimeEntry - The path to the Babel runtime entry.
 * @param {string} babelRuntimeEntryHelpers - The path to the Babel runtime helpers.
 * @param {string} babelRuntimeRegenerator - The path to the Babel runtime regenerator.
 * @param {Function} getCacheIdentifier - Function to get the cache identifier.
 * @returns {Object} The module configuration object.
 */
function getModuleConfig(
  paths,
  cssRegex,
  cssModuleRegex,
  sassRegex,
  sassModuleRegex,
  getStyleLoaders,
  useTailwind,
  useTypeScript,
  shouldUseSourceMap,
  isEnvProduction,
  isEnvDevelopment,
  imageInlineSizeLimit,
  hasJsxRuntime,
  reactRefreshRuntimeEntry,
  reactRefreshWebpackPluginRuntimeEntry,
  babelRuntimeEntry,
  babelRuntimeEntryHelpers,
  babelRuntimeRegenerator,
  getCacheIdentifier
) {
  return {
    strictExportPresence: true,
    rules: [
      // Handle node_modules packages that contain sourcemaps
      shouldUseSourceMap && {
        enforce: 'pre',
        exclude: /@babel(?:\/|\\{1,2})runtime/,
        test: /\.(js|mjs|jsx|ts|tsx|css)$/,
        loader: require.resolve('source-map-loader'),
      },
      {
        // "oneOf" will traverse all following loaders until one will
        // match the requirements. When no loader matches it will fall
        // back to the "file" loader at the end of the loader list.
        oneOf: [
          // TODO: Merge this config once `image/avif` is in the mime-db
          // https://github.com/jshttp/mime-db
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
          // "url" loader works like "file" loader except that it embeds assets
          // smaller than specified limit in bytes as data URLs to avoid requests.
          // A missing `test` is equivalent to a match.
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
          // Process application JS with Babel.
          // The preset includes JSX, Flow, TypeScript, and some ESnext features.
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
              // @remove-on-eject-begin
              babelrc: false,
              configFile: false,
              // Make sure we have a unique cache identifier, erring on the
              // side of caution.
              // We remove this when the user ejects because the default
              // is sane and uses Babel options. Instead of options, we use
              // the react-scripts and babel-preset-react-app versions.
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
              // @remove-on-eject-end
              plugins: [
                isEnvDevelopment &&
                  shouldUseReactRefresh &&
                  require.resolve('react-refresh/babel'),
              ].filter(Boolean),
              // This is a feature of `babel-loader` for webpack (not Babel itself).
              // It enables caching results in ./node_modules/.cache/babel-loader/
              // directory for faster rebuilds.
              cacheDirectory: true,
              // See #6846 for context on why cacheCompression is disabled
              cacheCompression: false,
              compact: isEnvProduction,
            },
          },
          // Process any JS outside of the app with Babel.
          // Unlike the application JS, we only compile the standard ES features.
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
              // See #6846 for context on why cacheCompression is disabled
              cacheCompression: false,
              // @remove-on-eject-begin
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
              // @remove-on-eject-end
              // Babel sourcemaps are needed for debugging into node_modules
              // code.  Without the options below, debuggers like VSCode
              // show incorrect code and set breakpoints on the wrong lines.
              sourceMaps: shouldUseSourceMap,
              inputSourceMap: shouldUseSourceMap,
            },
          },
          // "postcss" loader applies autoprefixer to our CSS.
          // "css" loader resolves paths in CSS and adds assets as dependencies.
          // "style" loader turns CSS into JS modules that inject <style> tags.
          // In production, we use MiniCSSExtractPlugin to extract that CSS
          // to a file, but in development "style" loader enables hot editing
          // of CSS.
          // By default we support CSS Modules with the extension .module.css
          {
            test: cssRegex,
            exclude: cssModuleRegex,
            use: getStyleLoaders({
              importLoaders: 1,
              sourceMap: isEnvProduction
                ? shouldUseSourceMap
                : isEnvDevelopment,
              modules: {
                mode: 'icss',
              },
            }),
            // Don't consider CSS imports dead code even if the
            // containing package claims to have no side effects.
            // Remove this when webpack adds a warning or an error for this.
            // See https://github.com/webpack/webpack/issues/6571
            sideEffects: true,
          },
          // Adds support for CSS Modules (https://github.com/css-modules/css-modules)
          // using the extension .module.css
          {
            test: cssModuleRegex,
            use: getStyleLoaders({
              importLoaders: 1,
              sourceMap: isEnvProduction
                ? shouldUseSourceMap
                : isEnvDevelopment,
              modules: {
                mode: 'local',
                getLocalIdent: getCSSModuleLocalIdent,
              },
            }),
          },
          // Opt-in support for SASS (using .scss or .sass extensions).
          // By default we support SASS Modules with the
          // extensions .module.scss or .module.sass
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
              'sass-loader'
            ),
            // Don't consider CSS imports dead code even if the
            // containing package claims to have no side effects.
            // Remove this when webpack adds a warning or an error for this.
            // See https://github.com/webpack/webpack/issues/6571
            sideEffects: true,
          },
          // Adds support for CSS Modules, but using SASS
          // using the extension .module.scss or .module.sass
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
              'sass-loader'
            ),
          },
          // "file" loader makes sure those assets get served by WebpackDevServer.
          // When you `import` an asset, you get its (virtual) filename.
          // In production, they would get copied to the `build` folder.
          // This loader doesn't use a "test" so it will catch all modules
          // that fall through the other loaders.
          {
            // Exclude `js` files to keep "css" loader working as it injects
            // its runtime that would otherwise be processed through "file" loader.
            // Also exclude `html` and `json` extensions so they get processed
            // by webpacks internal loaders.
            exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
            type: 'asset/resource',
          },
          // ** STOP ** Are you adding a new loader?
          // Make sure to add the new loader(s) before the "file" loader.
        ],
      },
    ].filter(Boolean),
  };
}

/**
 * Generates the plugins configuration for webpack.
 * @param {Object} paths - The paths configuration object.
 * @param {Object} env - The environment configuration object.
 * @param {boolean} isEnvDevelopment - Whether the environment is development.
 * @param {boolean} isEnvProduction - Whether the environment is production.
 * @param {boolean} shouldInlineRuntimeChunk - Whether the runtime chunk should be inlined.
 * @param {boolean} shouldUseReactRefresh - Whether React Refresh should be used.
 * @param {Function} HtmlWebpackPlugin - The HtmlWebpackPlugin constructor.
 * @param {Function} InlineChunkHtmlPlugin - The InlineChunkHtmlPlugin constructor.
 * @param {Function} InterpolateHtmlPlugin - The InterpolateHtmlPlugin constructor.
 * @param {Function} ModuleNotFoundPlugin - The ModuleNotFoundPlugin constructor.
 * @param {Function} webpack - The webpack constructor.
 * @param {Function} CaseSensitivePathsPlugin - The CaseSensitivePathsPlugin constructor.
 * @param {Function} MiniCssExtractPlugin - The MiniCssExtractPlugin constructor.
 * @param {Function} WebpackManifestPlugin - The WebpackManifestPlugin constructor.
 * @param {Function} WorkboxWebpackPlugin - The WorkboxWebpackPlugin constructor.
 * @param {Function} ForkTsCheckerWebpackPlugin - The ForkTsCheckerWebpackPlugin constructor.
 * @param {Function} ESLintPlugin - The ESLintPlugin constructor.
 * @param {Function} resolve - The resolve function.
 * @param {string} __dirname - The current directory name.
 * @param {boolean} emitErrorsAsWarnings - Whether to emit errors as warnings.
 * @param {boolean} disableESLintPlugin - Whether to disable the ESLint plugin.
 * @param {boolean} hasJsxRuntime - Whether the new JSX transform is available.
 * @returns {Array} The plugins array.
 */
function getPlugins(
  paths,
  env,
  isEnvDevelopment,
  isEnvProduction,
  shouldInlineRuntimeChunk,
  shouldUseReactRefresh,
  HtmlWebpackPlugin,
  InlineChunkHtmlPlugin,
  InterpolateHtmlPlugin,
  ModuleNotFoundPlugin,
  webpack,
  CaseSensitivePathsPlugin,
  MiniCssExtractPlugin,
  WebpackManifestPlugin,
  WorkboxWebpackPlugin,
  ForkTsCheckerWebpackPlugin,
  ESLintPlugin,
  resolve,
  __dirname,
  emitErrorsAsWarnings,
  disableESLintPlugin,
  hasJsxRuntime
) {
  const plugins = [];

  // Generates an `index.html` file with the <script> injected.
  plugins.push(
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
    )
  );

  // Inlines the webpack runtime script. This script is too small to warrant
  // a network request.
  // https://github.com/facebook/create-react-app/issues/5358
  if (isEnvProduction && shouldInlineRuntimeChunk) {
    plugins.push(
      new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/])
    );
  }

  // Makes some environment variables available in index.html.
  // The public URL is available as %PUBLIC_URL% in index.html, e.g.:
  // <link rel="icon" href="%PUBLIC_URL%/favicon.ico">
  // It will be an empty string unless you specify "homepage"
  // in `package.json`, in which case it will be the pathname of that URL.
  plugins.push(new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw));

  // This gives some necessary context to module not found errors, such as
  // the requesting resource.
  plugins.push(new ModuleNotFoundPlugin(paths.appPath));

  // Makes some environment variables available to the JS code, for example:
  // if (process.env.NODE_ENV === 'production') { ... }. See `./env.js`.
  // It is absolutely essential that NODE_ENV is set to production
  // during a production build.
  // Otherwise React will be compiled in the very slow development mode.
  plugins.push(new webpack.DefinePlugin(env.stringified));

  // Experimental hot reloading for React .
  // https://github.com/facebook/react/tree/main/packages/react-refresh
  if (isEnvDevelopment && shouldUseReactRefresh) {
    plugins.push(
      new ReactRefreshWebpackPlugin({
        overlay: false,
      })
    );
  }

  // Watcher doesn't work well if you mistype casing in a path so we use
  // a plugin that prints an error when you attempt to do this.
  // See https://github.com/facebook/create-react-app/issues/240
  if (isEnvDevelopment) {
    plugins.push(new CaseSensitivePathsPlugin());
  }

  if (isEnvProduction) {
    plugins.push(
      new MiniCssExtractPlugin({
        // Options similar to the same options in webpackOptions.output
        // both options are optional
        filename: 'static/css/[name].[contenthash:8].css',
        chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
      })
    );
  }

  // Generate an asset manifest file with the following content:
  // - "files" key: Mapping of all asset filenames to their corresponding
  //   output file so that tools can pick it up without having to parse
  //   `index.html`
  // - "entrypoints" key: Array of files which are included in `index.html`,
  //   can be used to reconstruct the HTML if necessary
  plugins.push(
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
    })
  );

  // Moment.js is an extremely popular library that bundles large locale files
  // by default due to how webpack interprets its code. This is a practical
  // solution that requires the user to opt into importing specific locales.
  // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
  // You can remove this if you don't use Moment.js:
  plugins.push(
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/,
    })
  );

  // Generate a service worker script that will precache, and keep up to date,
  // the HTML & assets that are part of the webpack build.
  if (isEnvProduction && fs.existsSync(swSrc)) {
    plugins.push(
      new WorkboxWebpackPlugin.InjectManifest({
        swSrc,
        dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
        exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
        // Bump up the default maximum size (2mb) that's precached,
        // to make lazy-loading failure scenarios less likely.
        // See https://github.com/cra-template/pwa/issues/13#issuecomment-722667270
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      })
    );
  }

  // TypeScript type checking
  if (useTypeScript) {
    plugins.push(
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
          // profile: true,
        },
        issue: {
          // This one is specifically to match during CI tests,
          // as micromatch doesn't match
          // '../cra-template-typescript/template/src/App.tsx'
          // otherwise.
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
      })
    );
  }

  // ESLint plugin
  if (!disableESLintPlugin) {
    plugins.push(
      new ESLintPlugin({
        // Plugin options
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
        // ESLint class options
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
      })
    );
  }

  return plugins;
}