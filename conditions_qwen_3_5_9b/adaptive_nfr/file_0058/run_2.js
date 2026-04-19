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
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isEnvDevelopment = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isEnvProduction = webpackEnv => webpackEnv === 'production';

/**
 * Determines if profiling is enabled in production.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if profiling enabled.
 */
const isEnvProductionProfile = (webpackEnv, argv) =>
  isEnvProduction(webpackEnv) && argv.includes('--profile');

/**
 * Determines if React Refresh should be used.
 * @param {Object} env - The client environment.
 * @returns {boolean} True if React Refresh should be used.
 */
const shouldUseReactRefresh = env => env.raw.FAST_REFRESH;

/**
 * Determines if source maps should be used.
 * @param {boolean} isEnvProduction - True if production mode.
 * @param {boolean} shouldUseSourceMap - True if source maps enabled.
 * @param {boolean} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if source maps should be used.
 */
const getDevtool = (isEnvProduction, shouldUseSourceMap, isEnvDevelopment) =>
  isEnvProduction
    ? shouldUseSourceMap
      ? 'source-map'
      : false
    : isEnvDevelopment && 'cheap-module-source-map';

/**
 * Determines the output filename for JS bundles.
 * @param {boolean} isEnvProduction - True if production mode.
 * @param {boolean} isEnvDevelopment - True if development mode.
 * @returns {string} The output filename pattern.
 */
const getJsFilename = (isEnvProduction, isEnvDevelopment) =>
  isEnvProduction
    ? 'static/js/[name].[contenthash:8].js'
    : isEnvDevelopment && 'static/js/bundle.js';

/**
 * Determines the output chunk filename.
 * @param {boolean} isEnvProduction - True if production mode.
 * @param {boolean} isEnvDevelopment - True if development mode.
 * @returns {string} The chunk filename pattern.
 */
const getChunkFilename = (isEnvProduction, isEnvDevelopment) =>
  isEnvProduction
    ? 'static/js/[name].[contenthash:8].chunk.js'
    : isEnvDevelopment && 'static/js/[name].chunk.js';

/**
 * Determines the devtoolModuleFilenameTemplate.
 * @param {boolean} isEnvProduction - True if production mode.
 * @param {boolean} shouldUseSourceMap - True if source maps enabled.
 * @param {boolean} isEnvDevelopment - True if development mode.
 * @returns {Function} The filename template function.
 */
const getDevtoolModuleFilenameTemplate = (
  isEnvProduction,
  shouldUseSourceMap,
  isEnvDevelopment
) =>
  isEnvProduction
    ? info =>
        path
          .relative(paths.appSrc, info.absoluteResourcePath)
          .replace(/\\/g, '/')
    : isEnvDevelopment &&
      (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'));

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionMode = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentMode = webpackEnv => webpackEnv === 'development';

/**
 * Determines if source maps should be used.
 * @param {boolean} shouldUseSourceMap - True if source maps enabled.
 * @param {boolean} isEnvProduction - True if production mode.
 * @param {boolean} isEnvDevelopment - True if development mode.
 * @returns {boolean} True if source maps should be used.
 */
const shouldUseSourceMapInConfig = (
  shouldUseSourceMap,
  isEnvProduction,
  isEnvDevelopment
) =>
  isEnvProduction ? shouldUseSourceMap : isEnvDevelopment;

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProduction = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopment = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProd = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDev = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProductionModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.
 */
const isDevelopmentModeEnv = webpackEnv => webpackEnv === 'development';

/**
 * Determines if the environment is production mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if production mode.
 */
const isProdModeEnv = webpackEnv => webpackEnv === 'production';

/**
 * Determines if the environment is development mode.
 * @param {string} webpackEnv - The webpack environment.
 * @returns {boolean} True if development mode.