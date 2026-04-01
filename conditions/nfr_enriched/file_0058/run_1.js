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
// Helper Functions - Extracted for reduced complexity
// ============================================================================

/**
 * Determines the appropriate devtool setting based on environment and source map configuration.
 */
function getDevtool(isEnvProduction, isEnvDevelopment) {
  if (isEnvProduction) {
    return shouldUseSourceMap ? 'source-map' : false;
  }
  return isEnvDevelopment ? 'cheap-module-source-map' : false;
}

/**
 * Generates the output filename based on environment.
 */
function getOutputFilename(isEnvProduction, isEnvDevelopment) {
  if (isEnvProduction) {
    return 'static/js/[name].[contenthash:8].js';
  }
  return isEnvDevelopment ? 'static/js/bundle.js' : '';
}

/**
 * Generates the chunk filename based on environment.
 */
function getChunkFilename(isEnvProduction, isEnvDevelopment) {
  if (isEnvProduction) {
    return 'static/js/[name].[contenthash:8].chunk.js';
  }
  return isEnvDevelopment ? 'static/js/[name].chunk.js' : '';
}

/**
 * Generates the devtool module filename template based on environment.
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
 * Builds the PostCSS plugins configuration based on Tailwind availability.
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
 * Creates the PostCSS loader configuration.
 */
function getPostCSSLoader(isEnvProduction, isEnvDevelopment) {
  return {
    loader: require.resolve('postcss-loader'),
    options: {
      postcssOptions: {
        ident: 'postcss',
        config: false,
        plugins: getPostCSSPlugins(),
      },
      sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
    },
  };
}

/**
 * Creates the style loaders array for CSS processing.
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
    getPostCSSLoader(isEnvProduction, isEnvDevelopment),
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
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
 * Creates Babel loader options for application code.
 */
function getAppBabelLoaderOptions(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh) {
  return {
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
    cacheIdentifier: getCacheIdentifier(
      isEnvProduction ? 'production' : isEnvDevelopment && 'development',
      [
        'babel-plugin-named-asset-import',
        'babel-preset-react-app',
        'react-dev-utils',
        'react-scripts',
      ]
    ),
    plugins: [
      isEnvDevelopment &&
        shouldUseReactRefresh &&
        require.resolve('react-refresh/babel'),
    ].filter(Boolean),
    cacheDirectory: true,
    cacheCompression: false,
    compact: isEnvProduction,
  };
}

/**
 * Creates Babel loader options for dependency code.
 */
function getDependencyBabelLoaderOptions(isEnvProduction, isEnvDevelopment) {
  return {
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
      isEnvProduction ? 'production' : isEnvDevelopment && 'development',
      [
        'babel-plugin-named-asset-import',
        'babel-preset-react-app',
        'react-dev-utils',
        'react-scripts',
      ]
    ),
    sourceMaps: shouldUseSourceMap,
    inputSourceMap: shouldUseSourceMap,
  };
}

/**
 * Creates the Terser plugin configuration for minification.
 */
function getTerserPlugin(isEnvProductionProfile) {
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
 * Creates the HTML Webpack Plugin configuration.
 */
function getHtmlWebpackPluginConfig(isEnvProduction) {
  const baseConfig = {
    inject: true,
    template: paths.appHtml,
  };

  if (isEnvProduction) {
    return Object.assign({}, baseConfig, {
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
    });
  }

  return baseConfig;
}

/**
 * Creates the resolve alias configuration.
 */
function getResolveAlias(isEnvProductionProfile) {
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
}

/**
 * Creates the module rules for handling different file types.
 */
function getModuleRules(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh) {
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
          options: getAppBabelLoaderOptions(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh),
        },
        {
          test: /\.(js|mjs)$/,
          exclude: /@babel(?:\/|\\{1,2})runtime/,
          loader: require.resolve('babel-loader'),
          options: getDependencyBabelLoaderOptions(isEnvProduction, isEnvDevelopment),
        },
        {
          test: cssRegex,
          exclude: cssModuleRegex,
          use: getStyleLoaders(
            {
              importLoaders: 1,
              sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
              modules: {
                mode: 'icss',
              },
            },
            null,
            isEnvProduction,
            isEnvDevelopment
          ),
          sideEffects: true,