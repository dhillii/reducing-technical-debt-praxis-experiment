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
 * Gets PostCSS plugins configuration based on Tailwind availability.
 * @returns {Array} Array of PostCSS plugins
 */
function getPostCSSPlugins() {
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
}

/**
 * Creates style loaders configuration for CSS processing.
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
 * Gets the cache identifier for Babel based on environment.
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvDevelopment - Whether the build is for development
 * @returns {string} The cache identifier
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
 * Creates HTML minification options for production builds.
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @returns {Object|undefined} Minification options or undefined
 */
function getHtmlMinifyOptions(isEnvProduction) {
  if (!isEnvProduction) {
    return undefined;
  }

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
 * Creates Terser plugin configuration for production builds.
 * @param {boolean} isEnvProductionProfile - Whether profiling is enabled
 * @returns {Object} Terser plugin configuration
 */
function createTerserPlugin(isEnvProductionProfile) {
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
      keep_classnames: isEnvProductionProfile,
      keep_fnames: isEnvProductionProfile,
      output: {
        ecma: 5,
        comments: false,
        ascii_only: true,
      },
    },
  });
}

/**
 * Creates the optimization configuration.
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvProductionProfile - Whether profiling is enabled
 * @returns {Object} Optimization configuration
 */
function getOptimization(isEnvProduction, isEnvProductionProfile) {
  return {
    minimize: isEnvProduction,
    minimizer: [
      createTerserPlugin(isEnvProductionProfile),
      new CssMinimizerPlugin(),
    ],
  };
}

/**
 * Creates resolve alias configuration based on environment.
 * @param {boolean} isEnvProductionProfile - Whether profiling is enabled
 * @returns {Object} Alias configuration
 */
function getResolveAlias(isEnvProductionProfile) {
  const alias = {
    'react-native': 'react-native-web',
    ...(modules.webpackAliases || {}),
  };

  if (isEnvProductionProfile) {
    alias['react-dom$'] = 'react-dom/profiling';
    alias['scheduler/tracing'] = 'scheduler/tracing-profiling';
  }

  return alias;
}

/**
 * Creates module rules for style processing.
 * @param {Function} styleLoaderFactory - Function to create style loaders
 * @returns {Array} Array of module rules
 */
function getStyleRules(styleLoaderFactory) {
  return [
    {
      test: cssRegex,
      exclude: cssModuleRegex,
      use: styleLoaderFactory({
        importLoaders: 1,
        sourceMap: getCSSSourceMap(true, true),
        modules: {
          mode: 'icss',
        },
      }, null),
      sideEffects: true,
    },
    {
      test: cssModuleRegex,
      use: styleLoaderFactory({
        importLoaders: 1,
        sourceMap: getCSSSourceMap(true, true),
        modules: {
          mode: 'local',
          getLocalIdent: getCSSModuleLocalIdent,
        },
      }, null),
    },
    {
      test: sassRegex,
      exclude: sassModuleRegex,
      use: styleLoaderFactory(
        {
          importLoaders: 3,
          sourceMap: getCSSSourceMap(true, true),
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
      use: styleLoaderFactory(
        {
          importLoaders: 3,
          sourceMap: getCSSSourceMap(true, true),
          modules: {
            mode: 'local',
            getLocalIdent: getCSSModuleLocalIdent,
          },
        },
        'sass-loader'
      ),
    },
  ];
}

/**
 * Creates Babel loader configuration for application code.
 * @param {boolean} isEnvProduction - Whether the build is for production
 * @param {boolean} isEnvDevelopment - Whether the build is for development
 * @param {boolean} shouldUseReactRefresh - Whether React Refresh is enabled
 * @returns {Object} Babel loader configuration
 */
function getAppBabelLoader(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh) {
  return {
    test: /\.(js|mjs|jsx|ts|tsx)$/,
    include: paths.appSrc,
    loader: require.resolve('babel-loader'),
    options: {
      customize: require.resolve(
        'babel-preset