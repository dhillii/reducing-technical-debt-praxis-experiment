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

// Helper: Get environment flags
const getEnvFlags = (env) => ({
  isDevelopment: env === 'development',
  isProduction: env === 'production',
  isProductionProfile: env === 'production' && process.argv.includes('--profile'),
  shouldUseReactRefresh: env.raw.FAST_REFRESH,
  shouldUseSourceMap: env === 'production' ? shouldUseSourceMap : env === 'development',
});

// Helper: Get style loaders
const getStyleLoaders = (cssOptions, preProcessor) => {
  const { isDevelopment, isProduction } = getEnvFlags('development');
  const loaders = [
    isDevelopment && require.resolve('style-loader'),
    isProduction && {
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
                ['postcss-preset-env', { autoprefixer: { flexbox: 'no-2009' }, stage: 3 }],
                'postcss-normalize',
              ]
            : ['tailwindcss', 'postcss-flexbugs-fixes', ['postcss-preset-env', { autoprefixer: { flexbox: 'no-2009' }, stage: 3 }]],
        },
        sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
      },
    },
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
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
};

// Helper: Get babel options
const getBabelOptions = (env) => {
  const { isDevelopment, isProduction } = getEnvFlags(env);
  const cacheIdentifier = getCacheIdentifier(
    isProduction ? 'production' : isDevelopment ? 'development' : null,
    ['babel-plugin-named-asset-import', 'babel-preset-react-app', 'react-dev-utils', 'react-scripts']
  );

  return {
    customize: require.resolve('babel-preset-react-app/webpack-overrides'),
    presets: [[require.resolve('babel-preset-react-app'), { runtime: hasJsxRuntime ? 'automatic' : 'classic' }]],
    babelrc: false,
    configFile: false,
    cacheIdentifier,
    plugins: [isDevelopment && shouldUseReactRefresh && require.resolve('react-refresh/babel')].filter(Boolean),
    cacheDirectory: true,
    cacheCompression: false,
    compact: isProduction,
  };
};

// Helper: Get webpack plugins
const getPlugins = (env) => {
  const { isDevelopment, isProduction, shouldUseReactRefresh } = getEnvFlags(env);
  const plugins = [];

  plugins.push(
    new HtmlWebpackPlugin({
      inject: true,
      template: paths.appHtml,
      ...(isProduction && {
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
      }),
    })
  );

  if (isProduction && shouldInlineRuntimeChunk) {
    plugins.push(new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]));
  }

  plugins.push(new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw));
  plugins.push(new ModuleNotFoundPlugin(paths.appPath));
  plugins.push(new webpack.DefinePlugin(env.stringified));

  if (isDevelopment && shouldUseReactRefresh) {
    plugins.push(new ReactRefreshWebpackPlugin({ overlay: false }));
  }

  if (isDevelopment) {
    plugins.push(new CaseSensitivePathsPlugin());
  }

  if (isProduction) {
    plugins.push(
      new MiniCssExtractPlugin({
        filename: 'static/css/[name].[contenthash:8].css',
        chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
      })
    );
  }

  plugins.push(
    new WebpackManifestPlugin({
      fileName: 'asset-manifest.json',
      publicPath: paths.publicUrlOrPath,
      generate: (seed, files, entrypoints) => {
        const manifestFiles = files.reduce((manifest, file) => {
          manifest[file.name] = file.path;
          return manifest;
        }, seed);
        const entrypointFiles = entrypoints.main.filter(fileName => !fileName.endsWith('.map'));

        return { files: manifestFiles, entrypoints: entrypointFiles };
      },
    })
  );

  plugins.push(
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/,
    })
  );

  if (isProduction && fs.existsSync(swSrc)) {
    plugins.push(
      new WorkboxWebpackPlugin.InjectManifest({
        swSrc,
        dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
        exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      })
    );
  }

  if (useTypeScript) {
    plugins.push(
      new ForkTsCheckerWebpackPlugin({
        async: isDevelopment,
        typescript: {
          typescriptPath: resolve.sync('typescript', { basedir: paths.appNodeModules }),
          configOverwrite: {
            compilerOptions: {
              sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
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
        logger: { infrastructure: 'silent' },
      })
    );
  }

  if (!disableESLintPlugin) {
    plugins.push(
      new ESLintPlugin({
        extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
        formatter: require.resolve('react-dev-utils/eslintFormatter'),
        eslintPath: require.resolve('eslint'),
        failOnError: !(isDevelopment && emitErrorsAsWarnings),
        context: paths.appSrc,
        cache: true,
        cacheLocation: path.resolve(paths.appNodeModules, '.cache/.eslintcache'),
        cwd: paths.appPath,
        resolvePluginsRelativeTo: __dirname,
        baseConfig: {
          extends: [require.resolve('eslint-config-react-app/base')],
          rules: {
            ...(!hasJsxRuntime && { 'react/react-in-jsx-scope': 'error' }),
          },
        },
      })
    );
  }

  return plugins;
};

// Helper: Get optimization config
const getOptimizationConfig = (env) => {
  const { isProduction } = getEnvFlags(env);
  return {
    minimize: isProduction,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          parse: { ecma: 8 },
          compress: {
            ecma: 5,
            warnings: false,
            comparisons: false,
            inline: 2,
          },
          mangle: { safari10: true },
          keep_classnames: isProduction && process.argv.includes('--profile'),
          keep_fnames: isProduction && process.argv.includes('--profile'),
          output: {
            ecma: 5,
            comments: false,
            ascii_only: true,
          },
        },
      }),
      new CssMinimizerPlugin(),
    ],
  };
};

// Helper: Get module rules
const getModuleRules = (env) => {
  const { isDevelopment, isProduction } = getEnvFlags(env);
  const rules = [];

  if (shouldUseSourceMap) {
    rules.push({
      enforce: 'pre',
      exclude: /@babel(?:\/|\\{1,2})runtime/,
      test: /\.(js|mjs|jsx|ts|tsx|css)$/,
      loader: require.resolve('source-map-loader'),
    });
  }

  rules.push({
    oneOf: [
      {
        test: [/\.avif$/],
        type: 'asset',
        mimetype: 'image/avif',
        parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } },
      },
      {
        test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
        type: 'asset',
        parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } },
      },
      {
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
        issuer: { and: [/\.(ts|tsx|js|jsx|md|mdx)$/] },
      },
      {
        test: /\.(js|mjs|jsx|ts|tsx)$/,
        include: paths.appSrc,
        loader: require.resolve('babel-loader'),
        options: getBabelOptions(env),
      },
      {
        test: /\.(js|mjs)$/,
        exclude: /@babel(?:\/|\\{1,2})runtime/,
        loader: require.resolve('babel-loader'),
        options: {
          babelrc: false,
          configFile: false,
          compact: false,
          presets: [[require.resolve('babel-preset-react-app/dependencies'), { helpers: true }]],
          cacheDirectory: true,
          cacheCompression: false,
          sourceMaps: shouldUseSourceMap,
          inputSourceMap: shouldUseSourceMap,
        },
      },
      {
        test: cssRegex,
        exclude: cssModuleRegex,
        use: getStyleLoaders({ importLoaders: 1, sourceMap: isProduction ? shouldUseSourceMap : isDevelopment }, null),
        sideEffects: true,
      },
      {
        test: cssModuleRegex,
        use: getStyleLoaders({ importLoaders: 1, sourceMap: isProduction ? shouldUseSourceMap : isDevelopment }, null, {
          mode: 'local',
          getLocalIdent: getCSSModuleLocalIdent,
        }),
      },
      {
        test: sassRegex,
        exclude: sassModuleRegex,
        use: getStyleLoaders(
          { importLoaders: 3, sourceMap: isProduction ? shouldUseSourceMap : isDevelopment },
          'sass-loader'
        ),
        sideEffects: true,
      },
      {
        test: sassModuleRegex,
        use: getStyleLoaders(
          { importLoaders: 3, sourceMap: isProduction ? shouldUseSourceMap : isDevelopment },
          'sass-loader',
          { mode: 'local', getLocalIdent: getCSSModuleLocalIdent }
        ),
      },
      {
        exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
        type: 'asset/resource',
      },
    ],
  });

  return rules;
};

// Helper: Get resolve config
const getResolveConfig = () => ({
  modules: ['node_modules', paths.appNodeModules].concat(modules.additionalModulePaths || []),
  extensions: paths.moduleFileExtensions
    .map(ext => `.${ext}`)
    .filter(ext => useTypeScript || !ext.includes('ts')),
  alias: {
    'react-native': 'react-native-web',
    ...(process.argv.includes('--profile') && {
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
});

// Main webpack config
module.exports = function (webpackEnv) {
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
  const { isDevelopment, isProduction, isProductionProfile, shouldUseSourceMap } = getEnvFlags(webpackEnv);

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isProduction ? 'production' : isDevelopment && 'development',
    bail: isProduction,
    devtool: isProduction
      ? shouldUseSourceMap ? 'source-map' : false
      : isDevelopment && 'cheap-module-source-map',
    entry: paths.appIndexJs,
    output: {
      path: paths.appBuild,
      pathinfo: isDevelopment,
      filename: isProduction
        ? 'static/js/[name].[contenthash:8].js'
        : isDevelopment && 'static/js/bundle.js',
      chunkFilename: isProduction
        ? 'static/js/[name].[contenthash:8].chunk.js'
        : isDevelopment && 'static/js/[name].chunk.js',
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      publicPath: paths.publicUrlOrPath,
      devtoolModuleFilenameTemplate: isProduction
        ? info => path.relative(paths.appSrc, info.absoluteResourcePath).replace(/\\/g, '/')
        : isDevelopment && (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
    },
    cache: {
      type: 'filesystem',
      version: createEnvironmentHash(env.raw),
      cacheDirectory: paths.appWebpackCache,
      store: 'pack',
      buildDependencies: {
        defaultWebpack: ['webpack/lib/'],
        config: [__filename],
        tsconfig: [paths.appTsConfig, paths.appJsConfig].filter(f => fs.existsSync(f)),
      },
    },
    infrastructureLogging: { level: 'none' },
    optimization: getOptimizationConfig(webpackEnv),
    resolve: getResolveConfig(),
    module: {
      strictExportPresence: true,
      rules: getModuleRules(webpackEnv),
    },
    plugins: getPlugins(webpackEnv),
    performance: false,
  };
};
```