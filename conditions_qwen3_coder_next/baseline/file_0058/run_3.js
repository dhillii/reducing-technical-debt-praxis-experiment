// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';
  const isEnvProductionProfile = isEnvProduction && process.argv.includes('--profile');
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
  const shouldUseReactRefresh = env.raw.FAST_REFRESH;
  const getStyleLoaders = (cssOptions, preProcessor) => buildStyleLoaders(cssOptions, preProcessor, isEnvProduction, isEnvDevelopment, shouldUseSourceMap, useTailwind, paths);

  return {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    bail: isEnvProduction,
    devtool: getDevtool(isEnvProduction, isEnvDevelopment, shouldUseSourceMap),
    entry: paths.appIndexJs,
    output: getOutputConfig(isEnvProduction, isEnvDevelopment, paths),
    cache: getCacheConfig(env.raw, paths),
    infrastructureLogging: { level: 'none' },
    optimization: getOptimizationConfig(isEnvProduction, isEnvProductionProfile),
    resolve: getResolveConfig(isEnvProductionProfile, modules, paths, useTypeScript),
    module: getModuleConfig(isEnvProduction, isEnvDevelopment, shouldUseSourceMap, useTypeScript, useTailwind, paths, getStyleLoaders, shouldUseReactRefresh),
    plugins: getPluginsConfig(isEnvDevelopment, isEnvProduction, isEnvProductionProfile, shouldUseReactRefresh, env, paths, useTypeScript, disableESLintPlugin, emitErrorsAsWarnings, swSrc, imageInlineSizeLimit, shouldUseSourceMap, modules.webpackAliases, hasJsxRuntime),
    performance: false,
  };
};

function buildStyleLoaders(cssOptions, preProcessor, isEnvProduction, isEnvDevelopment, shouldUseSourceMap, useTailwind, paths) {
  const loaders = [
    isEnvDevelopment && require.resolve('style-loader'),
    isEnvProduction && {
      loader: MiniCssExtractPlugin.loader,
      options: paths.publicUrlOrPath.startsWith('.') ? { publicPath: '../../' } : {},
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
          plugins: getPostcssPlugins(useTailwind),
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

function getPostcssPlugins(useTailwind) {
  if (!useTailwind) {
    return [
      'postcss-flexbugs-fixes',
      ['postcss-preset-env', {
        autoprefixer: { flexbox: 'no-2009' },
        stage: 3,
      }],
      'postcss-normalize',
    ];
  }
  return [
    'tailwindcss',
    'postcss-flexbugs-fixes',
    ['postcss-preset-env', {
      autoprefixer: { flexbox: 'no-2009' },
      stage: 3,
    }],
  ];
}

function getDevtool(isEnvProduction, isEnvDevelopment, shouldUseSourceMap) {
  if (isEnvProduction) {
    return shouldUseSourceMap ? 'source-map' : false;
  }
  return isEnvDevelopment && 'cheap-module-source-map';
}

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
      ? info => path.relative(paths.appSrc, info.absoluteResourcePath).replace(/\\/g, '/')
      : isEnvDevelopment && (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
  };
}

function getCacheConfig(envRaw, paths) {
  return {
    type: 'filesystem',
    version: createEnvironmentHash(envRaw),
    cacheDirectory: paths.appWebpackCache,
    store: 'pack',
    buildDependencies: {
      defaultWebpack: ['webpack/lib/'],
      config: [__filename],
      tsconfig: [paths.appTsConfig, paths.appJsConfig].filter(f => fs.existsSync(f)),
    },
  };
}

function getOptimizationConfig(isEnvProduction, isEnvProductionProfile) {
  return {
    minimize: isEnvProduction,
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
  };
}

function getResolveConfig(isEnvProductionProfile, modules, paths, useTypeScript) {
  return {
    modules: ['node_modules', paths.appNodeModules].concat(modules.additionalModulePaths || []),
    extensions: paths.moduleFileExtensions.map(ext => `.${ext}`).filter(ext => useTypeScript || !ext.includes('ts')),
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

function getModuleConfig(isEnvProduction, isEnvDevelopment, shouldUseSourceMap, useTypeScript, useTailwind, paths, getStyleLoaders, shouldUseReactRefresh) {
  return {
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
          { test: [/\.avif$/], type: 'asset', mimetype: 'image/avif', parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } } },
          { test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/], type: 'asset', parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } } },
          {
            test: /\.svg$/,
            use: [
              {
                loader: require.resolve('@svgr/webpack'),
                options: { prettier: false, svgo: false, svgoConfig: { plugins: [{ removeViewBox: false }] }, titleProp: true, ref: true },
              },
              { loader: require.resolve('file-loader'), options: { name: 'static/media/[name].[hash].[ext]' } },
            ],
            issuer: { and: [/\.(ts|tsx|js|jsx|md|mdx)$/] },
          },
          {
            test: /\.(js|mjs|jsx|ts|tsx)$/,
            include: paths.appSrc,
            loader: require.resolve('babel-loader'),
            options: getBabelOptions(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh, getCacheIdentifier, modules.webpackAliases, hasJsxRuntime),
          },
          {
            test: /\.(js|mjs)$/,
            exclude: /@babel(?:\/|\\{1,2})runtime/,
            loader: require.resolve('babel-loader'),
            options: getBabelOptionsForExternalJS(isEnvProduction, isEnvDevelopment, getCacheIdentifier),
          },
          { test: cssRegex, exclude: cssModuleRegex, use: getStyleLoaders({ importLoaders: 1, sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment, modules: { mode: 'icss' } }), sideEffects: true },
          { test: cssModuleRegex, use: getStyleLoaders({ importLoaders: 1, sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment, modules: { mode: 'local', getLocalIdent: getCSSModuleLocalIdent } }) },
          { test: sassRegex, exclude: sassModuleRegex, use: getStyleLoaders({ importLoaders: 3, sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment, modules: { mode: 'icss' } }, 'sass-loader'), sideEffects: true },
          { test: sassModuleRegex, use: getStyleLoaders({ importLoaders: 3, sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment, modules: { mode: 'local', getLocalIdent: getCSSModuleLocalIdent } }, 'sass-loader') },
          { exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/], type: 'asset/resource' },
        ],
      },
    ].filter(Boolean),
  };
}

function getBabelOptions(isEnvProduction, isEnvDevelopment, shouldUseReactRefresh, getCacheIdentifier, webpackAliases, hasJsxRuntime) {
  return {
    customize: require.resolve('babel-preset-react-app/webpack-overrides'),
    presets: [[require.resolve('babel-preset-react-app'), { runtime: hasJsxRuntime ? 'automatic' : 'classic' }]],
    babelrc: false,
    configFile: false,
    cacheIdentifier: getCacheIdentifier(isEnvProduction ? 'production' : isEnvDevelopment && 'development', ['babel-plugin-named-asset-import', 'babel-preset-react-app', 'react-dev-utils', 'react-scripts']),
    plugins: [isEnvDevelopment && shouldUseReactRefresh && require.resolve('react-refresh/babel')].filter(Boolean),
    cacheDirectory: true,
    cacheCompression: false,
    compact: isEnvProduction,
  };
}

function getBabelOptionsForExternalJS(isEnvProduction, isEnvDevelopment, getCacheIdentifier) {
  return {
    babelrc: false,
    configFile: false,
    compact: false,
    presets: [[require.resolve('babel-preset-react-app/dependencies'), { helpers: true }]],
    cacheDirectory: true,
    cacheCompression: false,
    cacheIdentifier: getCacheIdentifier(isEnvProduction ? 'production' : isEnvDevelopment && 'development', ['babel-plugin-named-asset-import', 'babel-preset-react-app', 'react-dev-utils', 'react-scripts']),
    sourceMaps: shouldUseSourceMap,
    inputSourceMap: shouldUseSourceMap,
  };
}

function getPluginsConfig(isEnvDevelopment, isEnvProduction, isEnvProductionProfile, shouldUseReactRefresh, env, paths, useTypeScript, disableESLintPlugin, emitErrorsAsWarnings, swSrc, imageInlineSizeLimit, shouldUseSourceMap, webpackAliases, hasJsxRuntime) {
  const basePlugins = [
    new HtmlWebpackPlugin(Object.assign({}, {
      inject: true,
      template: paths.appHtml,
    }, isEnvProduction ? {
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
    } : undefined)),

    isEnvProduction && shouldInlineRuntimeChunk && new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
    new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
    new ModuleNotFoundPlugin(paths.appPath),
    new webpack.DefinePlugin(env.stringified),
    isEnvDevelopment && shouldUseReactRefresh && new ReactRefreshWebpackPlugin({ overlay: false }),
    isEnvDevelopment && new CaseSensitivePathsPlugin(),
    isEnvProduction && new MiniCssExtractPlugin({
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
        const entrypointFiles = entrypoints.main.filter(fileName => !fileName.endsWith('.map'));
        return { files: manifestFiles, entrypoints: entrypointFiles };
      },
    }),
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /moment$/ }),
    isEnvProduction && fs.existsSync(swSrc) && new WorkboxWebpackPlugin.InjectManifest({
      swSrc,
      dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    }),
    useTypeScript && new ForkTsCheckerWebpackPlugin({
      async: isEnvDevelopment,
      typescript: {
        typescriptPath: resolve.sync('typescript', { basedir: paths.appNodeModules }),
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
        include: [{ file: '../**/src/**/*.{ts,tsx}' }, { file: '**/src/**/*.{ts,tsx}' }],
        exclude: [{ file: '**/src/**/__tests__/**' }, { file: '**/src/**/?(*.){spec|test}.*' }, { file: '**/src/setupProxy.*' }, { file: '**/src/setupTests.*' }],
      },
      logger: { infrastructure: 'silent' },
    }),
    !disableESLintPlugin && new ESLintPlugin({
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
        rules: { ...(!hasJsxRuntime && { 'react/react-in-jsx-scope': 'error' }) },
      },
    }),
  ].filter(Boolean);

  return basePlugins;
}