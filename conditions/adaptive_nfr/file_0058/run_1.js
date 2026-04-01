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
// Helper Functions for Configuration
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
 * Creates the devtoolModuleFilenameTemplate function based on environment.
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

/**
 * Gets the PostCSS plugins configuration based on Tailwind availability.
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

/**
 * Gets the cache identifier for Babel based on environment.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
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
    return {
      ...baseConfig,
      minify: getHtmlMinifyOptions(),
    };
  }

  return baseConfig;
}

/**
 * Creates TypeScript checker configuration.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {Object} ForkTsCheckerWebpackPlugin configuration
 */
function getTsCheckerConfig(isEnvProduction, isEnvDevelopment) {
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
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @returns {Object} ESLintPlugin configuration
 */
function getESLintPluginConfig(isEnvDevelopment) {
  return {
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
  };
}

// ============================================================================
// Plugin Factory Functions
// ============================================================================

/**
 * Creates conditional plugins based on environment and configuration.
 * @param {boolean} isEnvProduction - Whether building for production
 * @param {boolean} isEnvDevelopment - Whether building for development
 * @param {string} env - Environment variables object
 * @param {boolean} shouldUseReactRefresh - Whether to use React Refresh
 * @returns {Array} Array of webpack plugins
 */
function createConditionalPlugins(isEnvProduction, isEnvDevelopment, env, shouldUseReactRefresh) {
  const plugins = [];

  // Inline runtime chunk in production
  if (isEnvProduction && shouldInlineRuntimeChunk) {
    plugins.push(new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]));
  }

  // React Refresh in development
  if (isEnvDevelopment && shouldUseReactRefresh) {
    plugins.push(new ReactRefreshWebpackPlugin({ overlay: false }));
  }

  // Case-sensitive paths in development
  if (isEnvDevelopment) {
    plugins.push(new CaseSensitivePathsPlugin());
  }

  // CSS extraction in production
  if (isEnvProduction) {
    plugins.push(
      new MiniCssExtractPlugin({
        filename: