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
const getCacheIdentifier = require('react-dev-utils/getCacheIdentifier');
const createEnvironmentHash = require('./webpack/persistentCache/createEnvironmentHash');

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

const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false';
const emitErrorsAsWarnings = process.env.ESLINT_NO_DEV_ERRORS === 'true';
const disableESLintPlugin = process.env.DISABLE_ESLINT_PLUGIN === 'true';
const imageInlineSizeLimit = parseInt(
  process.env.IMAGE_INLINE_SIZE_LIMIT || '10000'
);

const useTypeScript = fs.existsSync(paths.appTsConfig);
const useTailwind = fs.existsSync(
  path.join(paths.appPath, 'tailwind.config.js')
);
const swSrc = paths.swSrc;

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

// Helper: Create style loaders configuration
const getStyleLoaders = (cssOptions, preProcessor) => {
  const loaders = [
    false,
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
                    autoprefixer: {
                      flexbox: 'no-2009',
                    },
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
                    autoprefixer: {
                      flexbox: 'no-2009',
                    },
                    stage: 3,
                  },
                ],
              ],
        },
        sourceMap: false,
      },
    },
  ];
  return loaders;
};

// Helper: Create development style loaders
const getDevStyleLoaders = (cssOptions, preProcessor) => {
  const loaders = [
    require.resolve('style-loader'),
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
                    autoprefixer: {
                      flexbox: 'no-2009',
                    },
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
                    autoprefixer: {
                      flexbox: 'no-2009',
                    },
                    stage: 3,
                  },
                ],
              ],
        },
        sourceMap: true,
      },
    },
  ];

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: true,
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
};

// Helper: Create production style loaders
const getProdStyleLoaders = (cssOptions, preProcessor) => {
  const loaders = [
    {
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
                    autoprefixer: {
                      flexbox: 'no-2009',
                    },
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
                    autoprefixer: {
                      flexbox: 'no-2009',
                    },
                    stage: 3,
                  },
                ],
              ],
        },
        sourceMap: shouldUseSourceMap,
      },
    },
  ];

  if (preProcessor) {
    loaders.push(
      {
        loader: require.resolve('resolve-url-loader'),
        options: {
          sourceMap: shouldUseSourceMap,
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
};

// Helper: Get appropriate style loaders based on environment
const getEnvironmentStyleLoaders = (isEnvDevelopment, isEnvProduction, cssOptions, preProcessor) => {
  if (isEnvDevelopment) {
    return getDevStyleLoaders(cssOptions, preProcessor);
  }
  if (isEnvProduction) {
    return getProdStyleLoaders(cssOptions, preProcessor);
  }
  return getStyleLoaders(cssOptions, preProcessor);
};

// Helper: Create output configuration
const createOutputConfig = (isEnvDevelopment, isEnvProduction) => ({
  path: paths.appBuild,
  pathinfo: isEnvDevelopment,
  filename: isEnvProduction
    ? 'static/js/[name].[contenthash:8].js'
    : 'static/js/bundle.js',
  chunkFilename: isEnvProduction
    ? 'static/js/[name].[contenthash:8].chunk.js'
    : 'static/js/[name].chunk.js',
  assetModuleFilename: 'static/media/[name].[hash][ext]',
  publicPath: paths.publicUrlOrPath,
  devtoolModuleFilenameTemplate: isEnvProduction
    ? info =>
        path
          .relative(paths.appSrc, info.absoluteResourcePath)
          .replace(/\\/g, '/')
    : info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'),
});

// Helper: Create devtool configuration
const createDevtoolConfig = (isEnvDevelopment, isEnvProduction) => {
  if (isEnvProduction) {
    return shouldUseSourceMap ? 'source-map' : false;
  }
  return isEnvDevelopment ? 'cheap-module-source-map' : false;
};

// Helper: Create optimization configuration
const createOptimizationConfig = (isEnvProduction, isEnvProductionProfile) => ({
  minimize: isEnvProduction,
  minimizer: [
    new TerserPlugin({
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
    }),
    new CssMinimizerPlugin(),
  ],
});

// Helper: Create resolve configuration
const createResolveConfig = (isEnvProductionProfile) => ({
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
});

// Helper: Create module rules for styles
const createStyleRules = (isEnvDevelopment, isEnvProduction) => [
  {
    test: cssRegex,
    exclude: cssModuleRegex,
    use: getEnvironmentStyleLoaders(isEnvDevelopment, isEnvProduction, {
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
    use: getEnvironmentStyleLoaders(isEnvDevelopment, isEnvProduction, {
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
    use: getEnvironmentStyleLoaders(
      isEnvDevelopment,
      isEnvProduction,
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
    use: getEnvironmentStyleLoaders(
      isEnvDevelopment,
      isEnvProduction,
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
];

// Helper: Create HTML webpack plugin configuration
const createHtmlPluginConfig = (isEnvProduction) => {
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
};

// Helper: Create TypeScript checker plugin configuration
const createTypeScriptCheckerConfig = (isEnvDevelopment) => ({
  async: isEnvDevelopment,
  typescript: {
    typescriptPath: resolve.sync('typescript', {
      basedir: paths.appNodeModules,
    }),
    configOverwrite: {
      compilerOptions: {
        sourceMap: isEnvDevelopment ? true : shouldUseSourceMap,
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

// Helper: Create ESLint plugin configuration
const createESLintPluginConfig = (isEnvDevelopment) => ({
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

// Helper: Create plugins array
const createPlugins = (isEnvDevelopment, isEnvProduction, env, shouldUseReactRefresh) => {
  const plugins = [
    new HtmlWebpackPlugin(createHtmlPluginConfig(isEnvProduction)),
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
        exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }),
    useTypeScript &&
      new ForkTsCheckerWebpackPlugin(createTypeScriptCheckerConfig(isEnvDevelopment)),
    !disableESLintPlugin &&
      new ESLintPlugin(createESLintPluginConfig(isEnvDevelopment)),
  ];

  return plugins.filter(Boolean);
};

// Helper: Create babel loader options for app code
const createAppBabelLoaderOptions = (isEnvDevelopment, isEnvProduction, shouldUseReactRefresh) => ({
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
    isEnvProduction ? 'production' : 'development',
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
});

// Helper: Create babel loader options for dependencies
const createDependenciesBabelLoaderOptions = (isEnvProduction) => ({
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
    isEnvProduction ? 'production' : 'development',
    [
      'babel-plugin-named-asset-import',
      'babel-preset-react-app',
      'react-dev-utils',
      'react-scripts',
    ]
  ),
  sourceMaps: shouldUseSourceMap,
  inputSourceMap: shouldUseSourceMap,
});

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
    mode: isEnvProduction ? 'production' : 'development',
    bail: isEnvProduction,
    devtool: createDevtoolConfig(isEnvDevelopment, isEnvProduction),
    entry: paths.appIndexJs,
    output: createOutputConfig(isEnvDevelopment, isEnvProduction),
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
    optimization: createOptimizationConfig(isEnvProduction, isEnvProductionProfile),
    resolve: createResolveConfig(isEnvProductionProfile),
    module: {
      strictExportPresence: true,
      rules: [
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
              options: createAppBabelLoaderOptions(isEnvDevelopment, isEnvProduction, shouldUseReactRefresh),
            },
            {
              test: /\.(js|mjs)$/,
              exclude: /@babel(?:\/|\\{1,2})runtime/,
              loader: require.resolve('babel-loader'),
              options: createDependenciesBabelLoaderOptions(isEnvProduction),
            },
            ...createStyleRules(isEnvDevelopment, isEnvProduction),
            {
              exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
              type: 'asset/resource',
            },
          ],
        },
      ].filter(Boolean),
    },
    plugins: createPlugins(isEnvDevelopment, isEnvProduction, env, shouldUseReactRefresh),
    performance: false,
  };
};