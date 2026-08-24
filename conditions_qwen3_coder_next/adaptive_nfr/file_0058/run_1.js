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

  /**
   * @param {boolean} condition
   * @returns {string|undefined}
   */
  const getLoader = (condition) => condition && require.resolve('style-loader');
  
  /**
   * @param {boolean} condition
   * @returns {any|undefined}
   */
  const getMiniCssLoader = (condition) => condition && {
    loader: MiniCssExtractPlugin.loader,
    options: paths.publicUrlOrPath.startsWith('.')
      ? { publicPath: '../../' }
      : {},
  };

  /**
   * @param {any} cssOptions
   * @param {string|undefined} preProcessor
   * @returns {any[]}
   */
  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = [
      getLoader(isEnvDevelopment),
      getMiniCssLoader(isEnvProduction),
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
            plugins: getPostcssPlugins(),
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
  };

  /**
   * @returns {any[]}
   */
  const getPostcssPlugins = () => {
    const commonPlugins = [
      'postcss-flexbugs-fixes',
      [
        'postcss-preset-env',
        {
          autoprefixer: { flexbox: 'no-2009' },
          stage: 3,
        },
      ],
      'postcss-normalize',
    ];
    return useTailwind ? ['tailwindcss', ...commonPlugins] : commonPlugins;
  };

  /**
   * @param {boolean} condition
   * @param {string} kind
   * @returns {string}
   */
  const getFilename = (condition, kind) => {
    switch (kind) {
      case 'js':
        return condition
          ? 'static/js/[name].[contenthash:8].js'
          : isEnvDevelopment && 'static/js/bundle.js';
      case 'chunk':
        return condition
          ? 'static/js/[name].[contenthash:8].chunk.js'
          : isEnvDevelopment && 'static/js/[name].chunk.js';
      case 'css':
        return condition
          ? 'static/css/[name].[contenthash:8].css'
          : isEnvDevelopment && 'static/css/[name].css';
      case 'chunkCss':
        return condition
          ? 'static/css/[name].[contenthash:8].chunk.css'
          : isEnvDevelopment && 'static/css/[name].chunk.css';
      default:
        return '';
    }
  };

  /**
   * @param {boolean} condition
   * @returns {string|undefined}
   */
  const getDevtool = (condition) => {
    if (!condition) return false;
    return shouldUseSourceMap ? 'source-map' : undefined;
  };

  const devtoolProduction = getDevtool(isEnvProduction);
  const devtoolDevelopment = isEnvDevelopment && 'cheap-module-source-map';

  const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false';

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    bail: isEnvProduction,
    devtool: devtoolProduction || devtoolDevelopment,
    entry: paths.appIndexJs,
    output: {
      path: paths.appBuild,
      pathinfo: isEnvDevelopment,
      filename: getFilename(isEnvProduction, 'js'),
      chunkFilename: getFilename(isEnvProduction, 'chunk'),
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      publicPath: paths.publicUrlOrPath,
      devtoolModuleFilenameTemplate: isEnvProduction
        ? info =>
            path
              .relative(paths.appSrc, info.absoluteResourcePath)
              .replace(/\\/g, '/')
        : isEnvDevelopment &&
          (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
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
        new TerserPlugin(getTerserOptions()),
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
      alias: getResolveAliases(),
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
      rules: getWebpackRules(),
    },
    plugins: getWebpackPlugins(),
    performance: false,
  };
};

/**
 * @returns {any}
 */
function getTerserOptions() {
  return {
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
  };
}

/**
 * @returns {Record<string,string|Record<string,string>>}
 */
function getResolveAliases() {
  const aliases = {
    'react-native': 'react-native-web',
    ...modules.webpackAliases,
  };

  if (isEnvProductionProfile) {
    Object.assign(aliases, {
      'react-dom$': 'react-dom/profiling',
      'scheduler/tracing': 'scheduler/tracing-profiling',
    });
  }

  return aliases;
}

/**
 * @returns {any[]}
 */
function getWebpackRules() {
  const baseJSRule = {
    include: paths.appSrc,
    loader: require.resolve('babel-loader'),
    options: getBabelLoaderOptions(),
  };

  const externalJSRule = {
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
            getSVGRLoader(),
            getFileLoader({
              name: 'static/media/[name].[hash].[ext]',
            }),
          ],
          issuer: {
            and: [/\.(ts|tsx|js|jsx|md|mdx)$/],
          },
        },
        {
          test: /\.(js|mjs|jsx|ts|tsx)$/,
          ...baseJSRule,
        },
        externalJSRule,
        {
          test: cssRegex,
          exclude: cssModuleRegex,
          use: getStyleLoaders({
            importLoaders: 1,
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
            modules: { mode: 'icss' },
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
              modules: { mode: 'icss' },
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
 * @returns {any}
 */
function getSVGRLoader() {
  return {
    loader: require.resolve('@svgr/webpack'),
    options: {
      prettier: false,
      svgo: false,
      svgoConfig: { plugins: [{ removeViewBox: false }] },
      titleProp: true,
      ref: true,
    },
  };
}

/**
 * @param {Record<string,any>} options
 * @returns {any}
 */
function getFileLoader(options) {
  return {
    loader: require.resolve('file-loader'),
    options,
  };
}

/**
 * @returns {Record<string,any>}
 */
function getBabelLoaderOptions() {
  const options = {
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

  return options;
}

/**
 * @returns {any[]}
 */
function getWebpackPlugins() {
  const plugins = [
    new HtmlWebpackPlugin(
      Object.assign(
        {},
        {
          inject: true,
          template: paths.appHtml,
        },
        getHtmlMinifyOptions()
      )
    ),
    isEnvProduction && shouldInlineRuntimeChunk &&
      new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
    new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
    new ModuleNotFoundPlugin(paths.appPath),
    new webpack.DefinePlugin(env.stringified),
    isEnvDevelopment && shouldUseReactRefresh &&
      new ReactRefreshWebpackPlugin({
        overlay: false,
      }),
    isEnvDevelopment && new CaseSensitivePathsPlugin(),
    isEnvProduction &&
      new MiniCssExtractPlugin({
        filename: getFilename(isEnvProduction, 'css'),
        chunkFilename: getFilename(isEnvProduction, 'chunkCss'),
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
    isEnvProduction && fs.existsSync(swSrc) &&
      new WorkboxWebpackPlugin.InjectManifest({
        swSrc,
        dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
        exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }),
    useTypeScript &&
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
      }),
    !disableESLintPlugin &&
      new ESLintPlugin({
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
      }),
  ];

  return plugins.filter(Boolean);
}

/**
 * @returns {Record<string,any}|undefined}
 */
function getHtmlMinifyOptions() {
  if (!isEnvProduction) return undefined;

  return {
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
  };
}