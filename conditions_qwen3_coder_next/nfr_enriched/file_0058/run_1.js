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

// Extract common environment setup logic.
function getWebpackPluginBaseConfig(isEnvDevelopment, isEnvProduction, env, paths) {
  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    bail: isEnvProduction,
    devtool: getDevtoolOption(isEnvProduction, isEnvDevelopment),
    entry: paths.appIndexJs,
    output: getOutputConfig(isEnvProduction, isEnvDevelopment, paths),
    cache: getCacheConfig(env, paths),
    infrastructureLogging: { level: 'none' },
    optimization: getOptimizationConfig(isEnvProduction, isEnvProductionProfile(isEnvProduction)),
    resolve: getResolveConfig(isEnvProduction, isEnvProductionProfile(isEnvProduction), paths),
    module: getModuleRulesConfig(isEnvProduction, isEnvDevelopment, paths, useTypeScript, useTailwind, imageInlineSizeLimit),
    plugins: getPluginsConfig(isEnvProduction, isEnvDevelopment, env, paths, useTypeScript, disableESLintPlugin, emitErrorsAsWarnings, shouldUseSourceMap, shouldInlineRuntimeChunk, swSrc),
    performance: false,
  };
}

// Returns devtool option based on environment and configuration.
function getDevtoolOption(isEnvProduction, isEnvDevelopment) {
  if (isEnvProduction) {
    return shouldUseSourceMap ? 'source-map' : false;
  }
  return isEnvDevelopment ? 'cheap-module-source-map' : false;
}

// Returns output configuration object for webpack.
function getOutputConfig(isEnvProduction, isEnvDevelopment, paths) {
  return {
    path: paths.appBuild,
    pathinfo: isEnvDevelopment,
    filename: isEnvProduction
      ? 'static/js/[name].[contenthash:8].js'
      : isEnvDevelopment && 'static/js/bundle.js',
    chunkFilename: isEnvProduction
      ? 'static/js/[name].[contenthash:8].chunk.js'
      : isEnvDevelopment && 'static/js/[name].chunk.js',
    assetModuleFilename: 'static/media/[name].[hash][ext]',
    publicPath: paths.publicUrlOrPath,
    devtoolModuleFilenameTemplate: isEnvProduction
      ? info =>
          path
            .relative(paths.appSrc, info.absoluteResourcePath)
            .replace(/\\/g, '/')
      : isEnvDevelopment &&
        (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
  };
}

// Returns cache configuration object for webpack.
function getCacheConfig(env, paths) {
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

// Returns optimization configuration object for webpack.
function getOptimizationConfig(isEnvProduction, isEnvProductionProfile) {
  return {
    minimize: isEnvProduction,
    minimizer: [
      getTerserPluginConfig(isEnvProductionProfile),
      new CssMinimizerPlugin(),
    ],
  };
}

// Returns TerserPlugin configuration object.
function getTerserPluginConfig(isEnvProductionProfile) {
  return new TerserPlugin({
    terserOptions: {
      parse: { ecma: 8 },
      compress: {
        ecma: 5,
        warnings: false,
        comparisons: false,
        inline: 2,
      },
      mangle: { safari10: true },
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

// Returns resolve configuration object for webpack.
function getResolveConfig(isEnvProduction, isEnvProductionProfile, paths) {
  return {
    modules: getResolveModules(),
    extensions: getResolveExtensions(useTypeScript),
    alias: getResolveAliases(isEnvProduction, isEnvProductionProfile),
    plugins: [
      new ModuleScopePlugin(paths.appSrc, [
        reactRefreshRuntimeEntry,
        reactRefreshWebpackPluginRuntimeEntry,
        babelRuntimeEntry,
        babelRuntimeEntryHelpers,
        babelRuntimeRegenerator,
      ]),
    ],
  };
}

// Returns array of resolve modules.
function getResolveModules() {
  return ['node_modules', paths.appNodeModules].concat(
    modules.additionalModulePaths || []
  );
}

// Returns array of resolved extensions based on TypeScript usage.
function getResolveExtensions(useTypeScript) {
  return paths.moduleFileExtensions
    .map(ext => `.${ext}`)
    .filter(ext => useTypeScript || !ext.includes('ts'));
}

// Returns resolve aliases based on environment and configuration.
function getResolveAliases(isEnvProduction, isEnvProductionProfile) {
  return {
    'react-native': 'react-native-web',
    ...(isEnvProductionProfile && {
      'react-dom$': 'react-dom/profiling',
      'scheduler/tracing': 'scheduler/tracing-profiling',
    }),
    ...(modules.webpackAliases || {}),
  };
}

// Returns module rules configuration object for webpack.
function getModuleRulesConfig(isEnvProduction, isEnvDevelopment, paths, useTypeScript, useTailwind, imageInlineSizeLimit) {
  return {
    strictExportPresence: true,
    rules: [
      ...getPreLoaders(isEnvProduction, isEnvDevelopment),
      getMainLoaderRule(isEnvProduction, isEnvDevelopment, paths, useTypeScript, useTailwind, imageInlineSizeLimit),
    ].filter(Boolean),
  };
}

// Returns pre-loaders array based on environment and source map settings.
function getPreLoaders(isEnvProduction, isEnvDevelopment) {
  return shouldUseSourceMap
    ? [{
        enforce: 'pre',
        exclude: /@babel(?:\/|\\{1,2})runtime/,
        test: /\.(js|mjs|jsx|ts|tsx|css)$/,
        loader: require.resolve('source-map-loader'),
      }]
    : [];
}

// Returns main loader rule with oneOf array.
function getMainLoaderRule(isEnvProduction, isEnvDevelopment, paths, useTypeScript, useTailwind, imageInlineSizeLimit) {
  return {
    oneOf: [
      ...getAssetRules(imageInlineSizeLimit),
      getSvgRule(),
      getBabelLoaderRule(isEnvProduction, isEnvDevelopment, paths, useTypeScript),
      getExternalJsLoaderRule(isEnvProduction, isEnvDevelopment),
      ...getCssRules(isEnvProduction, isEnvDevelopment, useTailwind),
      getFileLoaderRule(),
    ],
  };
}

// Returns array of asset rules based on image inline size limit.
function getAssetRules(imageInlineSizeLimit) {
  return [
    {
      test: [/\.avif$/],
      type: 'asset',
      mimetype: 'image/avif',
      parser: {
        dataUrlCondition: { maxSize: imageInlineSizeLimit },
      },
    },
    {
      test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
      type: 'asset',
      parser: {
        dataUrlCondition: { maxSize: imageInlineSizeLimit },
      },
    },
  ];
}

// Returns SVG loader rule configuration.
function getSvgRule() {
  return {
    test: /\.svg$/,
    use: [
      {
        loader: require.resolve('@svgr/webpack'),
        options: {
          prettier: false,
          svgo: false,
          svgoConfig: { plugins: [{ removeViewBox: false }] },
          titleProp: true,
          ref: true,
        },
      },
      {
        loader: require.resolve('file-loader'),
        options: { name: 'static/media/[name].[hash].[ext]' },
      },
    ],
    issuer: { and: [/\.(ts|tsx|js|jsx|md|mdx)$/], },
  };
}

// Returns Babel loader rule configuration.
function getBabelLoaderRule(isEnvProduction, isEnvDevelopment, paths, useTypeScript) {
  return {
    test: /\.(js|mjs|jsx|ts|tsx)$/,
    include: paths.appSrc,
    loader: require.resolve('babel-loader'),
    options: getBabelLoaderOptions(isEnvProduction, isEnvDevelopment, useTypeScript),
  };
}

// Returns Babel loader options object.
function getBabelLoaderOptions(isEnvProduction, isEnvDevelopment, useTypeScript) {
  const isDev = isEnvDevelopment;
  const isProd = isEnvProduction;
  const env = isProd ? 'production' : isDev && 'development';
  const cacheIdentifier = getCacheIdentifier(env, [
    'babel-plugin-named-asset-import',
    'babel-preset-react-app',
    'react-dev-utils',
    'react-scripts',
  ]);

  return {
    customize: require.resolve('babel-preset-react-app/webpack-overrides'),
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
    cacheIdentifier,
    plugins: [
      isDev &&
        process.env.FAST_REFRESH &&
        require.resolve('react-refresh/babel'),
    ].filter(Boolean),
    cacheDirectory: true,
    cacheCompression: false,
    compact: isProd,
  };
}

// Returns external JS loader rule configuration.
function getExternalJsLoaderRule(isEnvProduction, isEnvDevelopment) {
  return {
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
    },
  };
}

// Returns CSS loader rules array.
function getCssRules(isEnvProduction, isEnvDevelopment, useTailwind) {
  const cssOptions = {
    importLoaders: 1,
    sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
    modules: { mode: 'icss' },
  };

  const cssModuleOptions = {
    importLoaders: 1,
    sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
    modules: {
      mode: 'local',
      getLocalIdent: getCSSModuleLocalIdent,
    },
  };

  const sassOptions = {
    importLoaders: 3,
    sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
    modules: { mode: 'icss' },
  };

  const sassModuleOptions = {
    importLoaders: 3,
    sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
    modules: {
      mode: 'local',
      getLocalIdent: getCSSModuleLocalIdent,
    },
  };

  return [
    {
      test: cssRegex,
      exclude: cssModuleRegex,
      use: getStyleLoaders(cssOptions, useTailwind, isEnvProduction, isEnvDevelopment),
      sideEffects: true,
    },
    {
      test: cssModuleRegex,
      use: getStyleLoaders(cssModuleOptions, useTailwind, isEnvProduction, isEnvDevelopment),
    },
    {
      test: sassRegex,
      exclude: sassModuleRegex,
      use: getStyleLoaders(sassOptions, useTailwind, isEnvProduction, isEnvDevelopment, 'sass-loader'),
      sideEffects: true,
    },
    {
      test: sassModuleRegex,
      use: getStyleLoaders(sassModuleOptions, useTailwind, isEnvProduction, isEnvDevelopment, 'sass-loader'),
    },
  ];
}

// Returns style loaders array based on options and processor.
function getStyleLoaders(cssOptions, useTailwind, isEnvProduction, isEnvDevelopment, preProcessor) {
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
          plugins: !useTailwind
            ? [
                'postcss-flexbugs-fixes',
                [
                  'postcss-preset-env',
                  {
                    autoprefixer: { flexbox: 'no-2009' },
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
                    autoprefixer: { flexbox: 'no-2009' },
                    stage: 3,
                  },
                ],
              ],
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
        options: { sourceMap: true },
      }
    );
  }

  return loaders;
}

// Returns file loader rule configuration.
function getFileLoaderRule() {
  return {
    exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
    type: 'asset/resource',
  };
}

// Returns plugins configuration array.
function getPluginsConfig(isEnvProduction, isEnvDevelopment, env, paths, useTypeScript, disableESLintPlugin, emitErrorsAsWarnings, shouldUseSourceMap, shouldInlineRuntimeChunk, swSrc) {
  return [
    getHtmlWebpackPluginConfig(isEnvProduction),
    ...getHtmlPlugins(isEnvProduction, shouldInlineRuntimeChunk),
    new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
    new ModuleNotFoundPlugin(paths.appPath),
    new webpack.DefinePlugin(env.stringified),
    ...getReactRefreshPlugin(isEnvDevelopment),
    ...getDevelopmentPlugins(isEnvDevelopment),
    ...getProductionPlugins(isEnvProduction, paths),
    ...getIgnorePlugin(),
    ...getWorkboxPlugin(isEnvProduction, swSrc),
    ...getTypeScriptPluginConfig(isEnvProduction, isEnvDevelopment, useTypeScript, paths),
    ...getESLintPluginConfig(isEnvProduction, isEnvDevelopment, disableESLintPlugin, emitErrorsAsWarnings, paths, shouldUseSourceMap),
  ].filter(Boolean);
}

// Returns HtmlWebpackPlugin configuration object.
function getHtmlWebpackPluginConfig(isEnvProduction) {
  return new HtmlWebpackPlugin(
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
  );
}

// Returns HTML-related plugins array.
function getHtmlPlugins(isEnvProduction, shouldInlineRuntimeChunk) {
  return [
    isEnvProduction && shouldInlineRuntimeChunk && new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
  ];
}

// Returns React Refresh plugin configuration array.
function getReactRefreshPlugin(isEnvDevelopment) {
  const shouldUseReactRefresh = process.env.FAST_REFRESH;
  return [
    isEnvDevelopment && shouldUseReactRefresh && new ReactRefreshWebpackPlugin({ overlay: false, }),
  ];
}

// Returns development-specific plugins array.
function getDevelopmentPlugins(isEnvDevelopment) {
  return [isEnvDevelopment && new CaseSensitivePathsPlugin()];
}

// Returns production-specific plugins array.
function getProductionPlugins(isEnvProduction, paths) {
  const plugins = [];

  if (isEnvProduction) {
    plugins.push(
      new MiniCssExtractPlugin({
        filename: 'static/css/[name].[contenthash:8].css',
        chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
      }),
      new WebpackManifestPlugin({
        fileName: 'asset-manifest.json',
        publicPath: paths.publicUrlOrPath,
        generate: createAssetManifest,
      })
    );
  }

  return plugins;
}

// Creates asset manifest from seed, files, and entrypoints.
function createAssetManifest(seed, files, entrypoints) {
  const manifestFiles = files.reduce((manifest, file) => {
    manifest[file.name] = file.path;
    return manifest;
  }, seed);
  const entrypointFiles = entrypoints.main.filter(fileName => !fileName.endsWith('.map'));

  return {
    files: manifestFiles,
    entrypoints: entrypointFiles,
  };
}

// Returns ignore plugin configuration array.
function getIgnorePlugin() {
  return [
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/,
    }),
  ];
}

// Returns Workbox plugin configuration array.
function getWorkboxPlugin(isEnvProduction, swSrc) {
  return [
    isEnvProduction && fs.existsSync(swSrc) && new WorkboxWebpackPlugin.InjectManifest({
      swSrc,
      dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    }),
  ];
}

// Returns TypeScript plugin configuration array.
function getTypeScriptPluginConfig(isEnvProduction, isEnvDevelopment, useTypeScript, paths) {
  if (!useTypeScript) return [];

  return [
    new ForkTsCheckerWebpackPlugin({
      async: isEnvDevelopment,
      typescript: {
        typescriptPath: resolve.sync('typescript', {
          basedir: paths.appNodeModules,
        }),
        configOverwrite: {
          compilerOptions: {
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
            skipLibCheck: true,
            inlineSourceMap: false,
            declarationMap: false,
            noEmit: true,
            incremental: true,
            tsBuildInfoFile: paths.appTsBuildInfoFile,
          },
        },
        context: paths.appPath,
        diagnosticOptions: { syntactic: true },
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
      logger: { infrastructure: 'silent', },
    }),
  ];
}

// Returns ESLint plugin configuration array.
function getESLintPluginConfig(isEnvProduction, isEnvDevelopment, disableESLintPlugin, emitErrorsAsWarnings, paths, shouldUseSourceMap) {
  if (disableESLintPlugin) return [];

  const hasJsxRuntime = (() => {
    if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') return false;
    try {
      require.resolve('react/jsx-runtime');
      return true;
    } catch (e) {
      return false;
    }
  })();

  return [
    new ESLintPlugin({
      extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
      formatter: require.resolve('react-dev-utils/eslintFormatter'),
      eslintPath: require.resolve('eslint'),
      failOnError: !(isEnvDevelopment && emitErrorsAsWarnings),
      context: paths.appSrc,
      cache: true,
      cacheLocation: path.resolve(paths.appNodeModules, '.cache/.eslintcache'),
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
    }),
  ];
}

// Helper function to determine production profile flag.
function isEnvProductionProfile(isEnvProduction) {
  return isEnvProduction && process.argv.includes('--profile');
}

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));

  return getWebpackPluginBaseConfig(isEnvDevelopment, isEnvProduction, env, paths);
};