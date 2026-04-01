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
 * Determines the devtool setting based on environment and source map configuration.
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvDevelopment - Whether the build is for development
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
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvDevelopment - Whether the build is for development
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
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvDevelopment - Whether the build is for development
 * @returns {string} The chunk filename pattern
 */
function getChunkFilename(isEnvProduction, isEnvDevelopment) {
  if (isEnvProduction) {
    return 'static/js/[name].[contenthash:8].chunk.js';
  }
  return isEnvDevelopment ? 'static/js/[name].chunk.js' : '';
}

/**
 * Creates the devtoolModuleFilenameTemplate function based on environment.
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvDevelopment - Whether the build is for development
 * @returns {Function|undefined} The template function or undefined
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
  return undefined;
}

/**
 * Determines the source map setting for CSS loaders.
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvDevelopment - Whether the build is for development
 * @returns {boolean} Whether source maps should be enabled
 */
function getCSSSourceMap(isEnvProduction, isEnvDevelopment) {
  return isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;
}

/**
 * Gets the PostCSS plugins configuration based on Tailwind availability.
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

/**
 * Creates style loaders configuration.
 * @param {Object} cssOptions - CSS loader options
 * @param {string} preProcessor - Optional preprocessor (e.g., 'sass-loader')
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvDevelopment - Whether the build is for development
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
 * @param {boolean} isEnvProduction - Whether the build is for production
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
 * Creates TypeScript compiler options based on environment.
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvDevelopment - Whether the build is for development
 * @returns {Object} TypeScript compiler options
 */
function getTSCompilerOptions(isEnvProduction, isEnvDevelopment) {
  return {
    sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
    skipLibCheck: true,
    inlineSourceMap: false,
    declarationMap: false,
    noEmit: true,
    incremental: true,
    tsBuildInfoFile: paths.appTsBuildInfoFile,
  };
}

/**
 * Creates Babel cache identifier based on environment.
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvDevelopment - Whether the build is for development
 * @returns {string} Cache identifier
 */
function getBabelCacheIdentifier(isEnvProduction, isEnvDevelopment) {
  return getCacheIdentifier(
    isEnvProduction ? 'production' : isEnvDevelopment ? 'development' : '',
    [
      'babel-plugin-named-asset-import',
      'babel-preset-react-app',
      'react-dev-utils',
      'react-scripts',
    ]
  );
}

/**
 * Creates resolve alias configuration based on environment.
 * @param {boolean} isEnvProductionProfile - Whether profiling is enabled
 * @returns {Object} Alias configuration
 */
function getResolveAlias(isEnvProductionProfile) {
  const baseAlias = {
    'react-native': 'react-native-web',
  };

  if (isEnvProductionProfile) {
    baseAlias['react-dom$'] = 'react-dom/profiling';
    baseAlias['scheduler/tracing'] = 'scheduler/tracing-profiling';
  }

  return Object.assign({}, baseAlias, modules.webpackAliases || {});
}

/**
 * Creates plugins array based on environment and configuration.
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvDevelopment - Whether the build is for development
 * @param {Object} env - Environment variables
 * @returns {Array} Array of webpack plugins
 */
function getPlugins(isEnvProduction, isEnvDevelopment, env) {
  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

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
        exclude: [/\.map$/, /asset-manifest\.json$/,