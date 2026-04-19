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
 * Determines if the current environment is development mode.
 * @param {string} webpackEnv - The webpack environment string.
 * @returns {boolean} True if development mode.
 */
const isEnvDevelopment = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the current environment is production mode.
 * @param {string} webpackEnv - The webpack environment string.
 * @returns {boolean} True if production mode.
 */
const isEnvProduction = webpackEnv => webpackEnv === 'production';

/**
 * Determines if profiling is enabled in production.
 * @param {string} webpackEnv - The webpack environment string.
 * @returns {boolean} True if profiling enabled.
 */
const isEnvProductionProfile = (webpackEnv, argv) =>
  isEnvProduction(webpackEnv) && argv.includes('--profile');

/**
 * Determines if React Refresh should be used.
 * @param {Object} env - The client environment object.
 * @returns {boolean} True if React Refresh should be used.
 */
const shouldUseReactRefresh = env => env.raw.FAST_REFRESH;

/**
 * Determines if source maps should be used.
 * @param {boolean} isEnvProduction - True if production mode.
 * @param {boolean} shouldUseSourceMap - True if source maps enabled.
 * @returns {boolean} True if source maps should be used.
 */
const getDevtool = (isEnvProduction, shouldUseSourceMap) =>
  isEnvProduction
    ? shouldUseSourceMap
      ? 'source-map'
      : false
    : isEnvDevelopment && 'cheap-module-source-map';

/**
 * Determines the output filename for JS chunks based on environment.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {string} The chunk filename pattern.
 */
const getChunkFilename = (isEnvProduction, isEnvDevelopment) =>
  isEnvProduction
    ? 'static/js/[name].[contenthash:8].chunk.js'
    : isEnvDevelopment && 'static/js/[name].chunk.js';

/**
 * Determines the output filename for the main JS bundle based on environment.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {string} The main bundle filename pattern.
 */
const getMainFilename = (isEnvProduction, isEnvDevelopment) =>
  isEnvProduction
    ? 'static/js/[name].[contenthash:8].js'
    : isEnvDevelopment && 'static/js/bundle.js';

/**
 * Determines the devtoolModuleFilenameTemplate based on environment.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {Function} The filename template function.
 */
const getDevtoolModuleFilenameTemplate = (isEnvProduction, isEnvDevelopment) =>
  isEnvProduction
    ? info =>
        path
          .relative(paths.appSrc, info.absoluteResourcePath)
          .replace(/\\/g, '/')
    : isEnvDevelopment &&
      (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'));

/**
 * Determines if the cache should be used based on environment.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const shouldUseCache = (isEnvProduction, isEnvDevelopment) =>
  isEnvProduction || isEnvDevelopment;

/**
 * Determines if source maps should be used for cache.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if source maps should be used.
 */
const getCacheSourceMap = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCacheCompression = () => true;

/**
 * Determines if the cache should be compacted based on environment.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCacheDirectory = () => true;

/**
 * Determines if the cache identifier should be used.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {string} The cache identifier.
 */
const getCacheIdentifierValue = (isEnvProduction, isEnvDevelopment) =>
  isEnvProduction
    ? 'production'
    : isEnvDevelopment && 'development';

/**
 * Determines if the cache identifier should be used for babel.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {string} The cache identifier.
 */
const getBabelCacheIdentifier = (isEnvProduction, isEnvDevelopment) =>
  getCacheIdentifier(
    getCacheIdentifierValue(isEnvProduction, isEnvDevelopment),
    [
      'babel-plugin-named-asset-import',
      'babel-preset-react-app',
      'react-dev-utils',
      'react-scripts',
    ]
  );

/**
 * Determines if the cache directory should be used for babel.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelCacheDirectory = () => true;

/**
 * Determines if the cache compression should be disabled for babel.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for babel.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache source maps should be used for babel.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @returns {boolean} True if source maps should be used.
 */
const shouldUseBabelSourceMaps = shouldUseSourceMap => shouldUseSourceMap;

/**
 * Determines if the cache input source maps should be used for babel.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @returns {boolean} True if source maps should be used.
 */
const shouldUseBabelInputSourceMaps = shouldUseSourceMap => shouldUseSourceMap;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getCssLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the css loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableCssLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the css loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactCssLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the css loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseCssLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getSassLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the sass loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableSassLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the sass loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactSassLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the sass loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseSassLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getFileLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the file loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableFileLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the file loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactFileLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the file loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseFileLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @param {string} shouldUseSourceMap - True if source maps enabled.
 * @param {string} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if cache should be used.
 */
const getBabelLoaderCache = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the cache compression should be disabled for the babel loader.
 * @returns {boolean} True if cache compression should be disabled.
 */
const shouldDisableBabelLoaderCacheCompression = () => true;

/**
 * Determines if the cache should be compacted for the babel loader.
 * @param {string} isEnvProduction - True if production mode.
 * @returns {boolean} True if cache should be compacted.
 */
const shouldCompactBabelLoaderCache = isEnvProduction => isEnvProduction;

/**
 * Determines if the cache directory should be used for the babel loader.
 * @returns {boolean} True if cache directory should be used.
 */
const shouldUseBabelLoaderCacheDirectory = () => true;

/**
 * Determines if the cache should be used for the css