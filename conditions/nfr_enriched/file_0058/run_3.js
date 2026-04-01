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
 * Determines the appropriate output filename based on environment.
 */
function getOutputFilename(isEnvProduction, isEnvDevelopment) {
  if (isEnvProduction) {
    return 'static/js/[name].[contenthash:8].js';
  }
  return isEnvDevelopment ? 'static/js/bundle.js' : '';
}

/**
 * Determines the appropriate chunk filename based on environment.
 */
function getChunkFilename(isEnvProduction, isEnvDevelopment) {
  if (isEnvProduction) {
    return 'static/js/[name].[contenthash:8].chunk.js';
  }
  return isEnvDevelopment ? 'static/js/[name].chunk.js' : '';
}

/**
 * Generates the devtoolModuleFilenameTemplate function based on environment.
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
 * Builds the HTML minification options for production builds.
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
 * Builds the HtmlWebpackPlugin configuration.
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
 * Builds PostCSS plugins configuration based on Tailwind availability.
 */
function getPostCssPlugins() {
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
 * Builds the PostCSS loader configuration.
 */
function getPostCssLoaderConfig(isEnvProduction, isEnvDevelopment) {
  return {
    loader: require.resolve('postcss-loader'),
    options: {
      postcssOptions: {
        ident: 'postcss',
        config: false,
        plugins: getPostCssPlugins(),
      },
      sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
    },
  };
}

/**
 * Builds the base style loaders array (style-loader or MiniCssExtractPlugin).
 */
function getBaseStyleLoaders(isEnvProduction, isEnvDevelopment) {
  const loaders = [];

  if (isEnvDevelopment) {
    loaders.push(require.resolve('style-loader'));
  }

  if (isEnvProduction) {
    loaders.push({
      loader: MiniCssExtractPlugin.loader,
      options: paths.publicUrlOrPath.startsWith('.')
        ? { publicPath: '../../' }
        : {},
    });
  }

  return loaders;
}

/**
 * Builds the CSS loader configuration.
 */
function getCssLoaderConfig(cssOptions) {
  return {
    loader: require.resolve('css-loader'),
    options: cssOptions,
  };
}

/**
 * Builds the resolve-url-loader and preprocessor loaders for style processing.
 */
function getPreprocessorLoaders(preProcessor) {
  const loaders = [
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
    },
  ];
  return loaders;
}

/**
 * Builds complete style loaders chain for CSS/SCSS processing.
 * Combines base loaders, CSS loader, PostCSS loader, and optional preprocessor.
 */
function getStyleLoaders(cssOptions, preProcessor) {
  const loaders = [
    ...getBaseStyleLoaders(isEnvProduction, isEnvDevelopment),
    getCssLoaderConfig(cssOptions),
    getPostCssLoaderConfig(isEnvProduction, isEnvDevelopment),
  ].filter(Boolean);

  if (preProcessor) {
    loaders.push(...getPreprocessorLoaders(preProcessor));
  }

  return loaders;
}

/**
 * Builds Terser plugin configuration for JavaScript minification.
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
 * Builds the optimization configuration for production builds.
 */
function getOptimizationConfig(isEnvProduction, isEnvProductionProfile) {
  return {
    minimize: isEnvProduction,
    minimizer: [
      getTerserPluginConfig(isEnvProductionProfile),
      new CssMinimizerPlugin(),
    ],
  };
}

/**
 * Builds the resolve configuration for module resolution.
 */
function getResolveConfig(isEnvProductionProfile) {
  return {
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
  };
}

/**
 * Builds the source map loader rule for development.
 */
function getSourceMapLoaderRule() {
  if (!shouldUseSourceMap) {
    return null;
  }

  return {
    enforce: 'pre',
    exclude: /@babel(?:\/|\\{1,2})runtime/,
    test: /\.(js|mjs|jsx|ts|tsx|css)$/,
    loader: require.resolve('source-map-loader'),
  };
}

/**
 * Builds Babel loader options for application code.
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
 * Builds Babel loader options for dependency code.
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
 * Builds the module rules for webpack.
 */
function getModuleRules(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh) {
  return [
    getSourceMapLoaderRule(),
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
          use: getStyleLoaders({
            importLoaders: 1,
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
            modules: {
              mode: 'icss',
            },
          }),
          sideEffects: true,
        },
        {
          test: cssModuleRegex,
          use: getStyleLoaders({
            importLoaders: 1,
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
            modules: {
              mode: 'local',
              getLocalIdent: getCSSModuleLocalIdent,
            },
          }),
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
            'sass-loader'
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
            'sass-loader'
          ),
        },
        {
          exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
          type: 'asset/resource',
        },
      ],
    },
  ].filter(Boolean);
}

/**
 * Builds the manifest generation function for WebpackManifestPlugin.
 */
function getManifestGenerator() {
  return (seed, files, entrypoints) => {
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
  };
}

/**
 * Builds the ForkTsCheckerWebpackPlugin configuration.
 */
function getForkTsCheckerConfig(isEnvDevelopment) {
  return new ForkTsCheckerWebpackPlugin({
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
 * Builds the ESLintPlugin configuration.
 */
function getEslintPluginConfig() {
  return new ESLintPlugin({
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
  });
}

/**
 * Builds the plugins array for webpack configuration.
 */
function getPlugins(isEnvProduction, isEnvDevelopment, isEnvProductionProfile, shouldUseReactRefresh) {
  return [
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
      generate: getManifestGenerator(),
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
        exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }),
    useTypeScript && getForkTsCheckerConfig(isEnvDevelopment),
    !disableESLintPlugin && getEslintPluginConfig(),
  ].filter(Boolean);
}

// ============================================================================
// Main Configuration Export
// ============================================================================

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
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    bail: isEnvProduction,
    devtool: getDevtool(isEnvProduction, isEnvDevelopment),
    entry: paths.appIndexJs,
    output: {
      path: paths.appBuild,
      pathinfo: isEnvDevelopment,
      filename: getOutputFilename(isEnvProduction, isEnvDevelopment),
      chunkFilename: getChunkFilename(isEnvProduction, isEnvDevelopment),
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
    optimization: getOptimizationConfig(isEnvProduction, isEnvProductionProfile),
    resolve: getResolveConfig(isEnvProductionProfile),
    module: {
      strictExportPresence: true,
      rules: getModuleRules(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh),
    },
    plugins: getPlugins(isEnvProduction, isEnvDevelopment, isEnvProductionProfile, shouldUseReactRefresh),
    performance: false,
  };
};
```