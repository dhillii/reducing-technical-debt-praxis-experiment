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
// Helper Functions
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
 * Generates output filename configuration for the webpack build.
 */
function getOutputFilenames(isEnvProduction, isEnvDevelopment) {
  return {
    filename: isEnvProduction
      ? 'static/js/[name].[contenthash:8].js'
      : isEnvDevelopment && 'static/js/bundle.js',
    chunkFilename: isEnvProduction
      ? 'static/js/[name].[contenthash:8].chunk.js'
      : isEnvDevelopment && 'static/js/[name].chunk.js',
  };
}

/**
 * Generates devtool module filename template based on environment.
 */
function getDevtoolModuleFilenameTemplate(isEnvProduction, isEnvDevelopment) {
  if (isEnvProduction) {
    return info =>
      path
        .relative(paths.appSrc, info.absoluteResourcePath)
        .replace(/\\/g, '/');
  }
  return isEnvDevelopment &&
    (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'));
}

/**
 * Generates PostCSS plugin configuration based on Tailwind availability.
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
 * Generates style loaders configuration for CSS processing.
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
        sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
      },
    },
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
 * Generates Terser plugin configuration for JavaScript minification.
 */
function getTerserPluginConfig(isEnvProductionProfile) {
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
 * Generates HTML minification options for production builds.
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
 * Generates HtmlWebpackPlugin configuration.
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
 * Generates Babel loader options for application source code.
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
 * Generates Babel loader options for node_modules dependencies.
 */
function getDependenciesBabelLoaderOptions(isEnvProduction, isEnvDevelopment) {
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
 * Generates module rules for CSS and SASS processing.
 */
function getStyleRules(isEnvProduction, isEnvDevelopment) {
  return [
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
    },
    {
      test: cssModuleRegex,
      use: getStyleLoaders(
        {
          importLoaders: 1,
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
          modules: {
            mode: 'local',
            getLocalIdent: getCSSModuleLocalIdent,
          },
        },
        null,
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
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
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
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
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
  ];
}

/**
 * Generates module rules for asset handling (images, SVG, etc).
 */
function getAssetRules() {
  return [
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
  ];
}

/**
 * Generates module rules for JavaScript and TypeScript processing.
 */
function getScriptRules(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh) {
  return [
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
      options: getDependenciesBabelLoaderOptions(isEnvProduction, isEnvDevelopment),
    },
  ];
}

/**
 * Generates all module rules for webpack.
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
        ...getAssetRules(),
        ...getScriptRules(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh),
        ...getStyleRules(isEnvProduction, isEnvDevelopment),
        {
          exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
          type: 'asset/resource',
        },
      ],
    },
  ].filter(Boolean);
}

/**
 * Generates ForkTsCheckerWebpackPlugin configuration for TypeScript type checking.
 */
function getForkTsCheckerConfig() {
  return new ForkTsCheckerWebpackPlugin({
    async: true,
    typescript: {
      typescriptPath: resolve.sync('typescript', {
        basedir: paths.appNodeModules,
      }),
      configOverwrite: {
        compilerOptions: {
          sourceMap: shouldUseSourceMap,
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
}

/**
 * Generates ESLintPlugin configuration.
 */
function getESLintPluginConfig() {
  return new ESLintPlugin({
    extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
    formatter: require.resolve('react-dev-utils/eslintFormatter'),
    eslintPath: require.resolve('eslint'),
    failOnError: !emitErrorsAsWarnings,
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
}

/**
 * Generates WebpackManifestPlugin configuration.
 */
function getWebpackManifestPluginConfig() {
  return new WebpackManifestPlugin({
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
  });
}

/**
 * Generates production-specific plugins.
 */
function getProductionPlugins(isEnvProduction) {
  if (!isEnvProduction) {
    return [];
  }

  const plugins = [
    new MiniCssExtractPlugin({
      filename: 'static/css/[name].[contenthash:8].css',
      chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
    }),
  ];

  if (fs.existsSync(swSrc)) {
    plugins.push(
      new WorkboxWebpackPlugin.InjectManifest({
        swSrc,
        dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
        exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      })
    );
  }

  return plugins;
}

/**
 * Generates development-specific plugins.
 */
function getDevelopmentPlugins(isEnvDevelopment, shouldUseReactRefresh) {
  if (!isEnvDevelopment) {
    return [];
  }

  const plugins = [new CaseSensitivePathsPlugin()];

  if (shouldUseReactRefresh) {
    plugins.push(
      new ReactRefreshWebpackPlugin({
        overlay: false,
      })
    );
  }

  return plugins;
}

/**
 * Generates all webpack plugins.
 */
function getPlugins(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh, env) {
  const plugins = [
    new HtmlWebpackPlugin(getHtmlWebpackPluginConfig(isEnvProduction)),
    isEnvProduction &&
      shouldInlineRuntimeChunk &&
      new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
    new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
    new ModuleNotFoundPlugin(paths.appPath),
    new webpack.DefinePlugin(env.stringified),
    ...getDevelopmentPlugins(isEnvDevelopment, shouldUseReactRefresh),
    ...getProductionPlugins(isEnvProduction),
    getWebpackManifestPluginConfig(),
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/,
    }),
    useTypeScript && getForkTsCheckerConfig(),
    !disableESLintPlugin && getESLintPluginConfig(),
  ];

  return plugins.filter(Boolean);
}

// ============================================================================
// Main Configuration Export
// ============================================================================

module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';
  const isEnvProductionProfile =
    isEnvProduction && process.argv.includes('--profile');

  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    bail: isEnvProduction,
    devtool: getDevtool(isEnvProduction, isEnvDevelopment),
    entry: paths.appIndexJs,
    output: {
      path: paths.appBuild,
      pathinfo: isEnvDevelopment,
      ...getOutputFilenames(isEnvProduction, isEnvDevelopment),
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      publicPath: paths.publicUrlOrPath,
      devtoolModuleFilenameTemplate: getDevtoolModuleFilenameTemplate(
        isEnvProduction,
        isEnvDevelopment
      ),
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
        getTerserPluginConfig(isEnvProductionProfile),
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
      alias: {
        'react-native': 'react-native-web',
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
        ...(modules.webpackAliases || {}),
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
    },
    module: {
      strictExportPresence: true,
      rules: getModuleRules(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh),
    },
    plugins: getPlugins(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh, env),
    performance: false,
  };
};
```