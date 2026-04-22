```javascript
const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

/**
 * Main conversion entry.
 */
module.exports = function (yargs, argv, convertOptions) {
  const options = [];

  // shortcuts
  if (argv.d) {
    argv.debug = true;
    argv["output-pathinfo"] = true;
    if (!argv.devtool) {
      argv.devtool = "eval-cheap-module-source-map";
    }
  }
  if (argv.p) {
    argv["optimize-minimize"] = true;
    argv["define"] = [].concat(argv["define"] || []).concat('process.env.NODE_ENV="production"');
  }

  const extensions = getSortedExtensions();
  const defaultConfigFiles = getDefaultConfigFiles(extensions);
  const configFiles = argv.config
    ? getConfigFilesFromArg(argv.config, extensions)
    : getFirstExistingConfig(defaultConfigFiles);

  if (configFiles.length > 0) {
    loadConfigFiles(configFiles, options, argv);
  }

  const configFileLoaded = configFiles.length > 0;
  if (!configFileLoaded) return processConfiguredOptions({}, argv);
  if (options.length === 1) return processConfiguredOptions(options[0], argv);
  return processConfiguredOptions(options, argv);
};

/* ---------- Helper Functions ---------- */

/**
 * Sort extensions, preferring .js.
 */
function getSortedExtensions() {
  return Object.keys(interpret.extensions).sort((a, b) => {
    if (a === ".js") return -1;
    if (b === ".js") return 1;
    return a.length - b.length;
  });
}

/**
 * Build default config file list.
 */
function getDefaultConfigFiles(extensions) {
  const filenames = ["webpack.config", "webpackfile"];
  return filenames
    .map((filename) =>
      extensions.map((ext) => ({
        path: path.resolve(filename + ext),
        ext,
      }))
    )
    .reduce((a, i) => a.concat(i), []);
}

/**
 * Resolve config files from CLI argument.
 */
function getConfigFilesFromArg(configArg, extensions) {
  const list = Array.isArray(configArg) ? configArg : [configArg];
  return list.map((arg) => {
    const resolvedPath = path.resolve(arg);
    const ext = getConfigExtension(resolvedPath, extensions);
    return { path: resolvedPath, ext };
  });
}

/**
 * Determine extension for a config path.
 */
function getConfigExtension(configPath, extensions) {
  for (let i = extensions.length - 1; i >= 0; i--) {
    const ext = extensions[i];
    if (configPath.endsWith(ext)) return ext;
  }
  return path.extname(configPath);
}

/**
 * Find first existing default config file.
 */
function getFirstExistingConfig(defaultConfigFiles) {
  for (const file of defaultConfigFiles) {
    if (fs.existsSync(file.path)) return [{ path: file.path, ext: file.ext }];
  }
  return [];
}

/**
 * Load and register config files.
 */
function loadConfigFiles(configFiles, options, argv) {
  configFiles.forEach((file) => {
    registerCompiler(interpret.extensions[file.ext]);
    options.push(requireConfig(file.path, argv));
  });
}

/**
 * Register a compiler based on descriptor.
 */
function registerCompiler(moduleDescriptor) {
  if (!moduleDescriptor) return;
  if (typeof moduleDescriptor === "string") {
    require(moduleDescriptor);
  } else if (!Array.isArray(moduleDescriptor)) {
    moduleDescriptor.register(require(moduleDescriptor.module));
  } else {
    for (const descriptor of moduleDescriptor) {
      try {
        registerCompiler(descriptor);
        break;
      } catch (_) {
        // ignore
      }
    }
  }
}

/**
 * Require a config file, handling functions and ES6 default exports.
 */
function requireConfig(configPath, argv) {
  let config = require(configPath);
  const isES6DefaultExportedFunc =
    typeof config === "object" && config !== null && typeof config.default === "function";

  if (typeof config === "function" || isES6DefaultExportedFunc) {
    config = isES6DefaultExportedFunc ? config.default : config;
    config = config(argv.env, argv);
  }
  return config;
}

/**
 * Process configured options (may be object, array, promise, etc.).
 */
function processConfiguredOptions(options, argv) {
  if (options === null || typeof options !== "object") {
    console.error("Config did not export an object or a function returning an object.");
    process.exit(-1);
  }

  if (isPromise(options)) {
    return options.then((resolved) => processConfiguredOptions(resolved, argv));
  }

  if (isES6DefaultObject(options)) {
    return processConfiguredOptions(options.default, argv);
  }

  if (Array.isArray(options)) {
    options.forEach((opt) => processOptions(opt, argv));
  } else {
    processOptions(options, argv);
  }

  applyCliOptions(options, argv);
  return options;
}

/**
 * Detect a Promise-like object.
 */
function isPromise(obj) {
  return typeof obj === "object" && obj !== null && typeof obj.then === "function";
}

/**
 * Detect an ES6 default export object.
 */
function isES6DefaultObject(obj) {
  return typeof obj === "object" && obj !== null && typeof obj.default === "object";
}

/**
 * Apply CLI‑derived modifications to the final options object.
 */
function applyCliOptions(options, argv) {
  if (argv.context) options.context = path.resolve(argv.context);
  if (!options.context) options.context = process.cwd();

  if (argv.watch) options.watch = true;

  if (argv["watch-aggregate-timeout"]) {
    options.watchOptions = options.watchOptions || {};
    options.watchOptions.aggregateTimeout = Number(argv["watch-aggregate-timeout"]);
  }

  if (argv["watch-poll"]) {
    options.watchOptions = options.watchOptions || {};
    options.watchOptions.poll =
      typeof argv["watch-poll"] !== "boolean"
        ? Number(argv["watch-poll"])
        : true;
  }

  if (argv["watch-stdin"]) {
    options.watchOptions = options.watchOptions || {};
    options.watchOptions.stdin = true;
    options.watch = true;
  }
}

/**
 * Process a single configuration object.
 */
function processOptions(options, argv) {
  let noOutputFilenameDefined = !(options.output && options.output.filename);

  // entry handling
  ifArgPair(
    argv,
    "entry",
    (name, entry) => {
      if (options.entry && options.entry[name] !== undefined) {
        options.entry[name] = [].concat(options.entry[name]).concat(entry);
      } else {
        options.entry[name] = entry;
      }
    },
    () => ensureObject(options, "entry")
  );

  // loader bindings
  bindLoaders(argv, options, "module-bind", "loaders");
  bindLoaders(argv, options, "module-bind-pre", "preLoaders");
  bindLoaders(argv, options, "module-bind-post", "postLoaders");

  // define handling
  handleDefine(argv, options, () => {
    noOutputFilenameDefined = false;
  });

  // output options
  handleOutputOption(argv, options, "output-path", (value) => {
    ensureObject(options, "output");
    options.output.path = path.resolve(value);
  });
  handleOutputOption(argv, options, "output-filename", (value) => {
    ensureObject(options, "output");
    options.output.filename = value;
    noOutputFilenameDefined = false;
  });
  handleOutputOption(argv, options, "output-chunk-filename", (value) => {
    ensureObject(options, "output");
    options.output.chunkFilename = value;
  });
  handleOutputOption(argv, options, "output-source-map-filename", (value) => {
    ensureObject(options, "output");
    options.output.sourceMapFilename = value;
  });
  handleOutputOption(argv, options, "output-public-path", (value) => {
    ensureObject(options, "output");
    options.output.publicPath = value;
  });
  handleOutputOption(argv, options, "output-jsonp-function", (value) => {
    ensureObject(options, "output");
    options.output.jsonpFunction = value;
  });
  ifBooleanArg(argv, "output-pathinfo", () => {
    ensureObject(options, "output");
    options.output.pathinfo = true;
  });
  handleOutputOption(argv, options, "output-library", (value) => {
    ensureObject(options, "output");
    options.output.library = value;
  });
  handleOutputOption(argv, options, "output-library-target", (value) => {
    ensureObject(options, "output");
    options.output.libraryTarget = value;
  });

  // records
  handleSimpleOption(argv, "records-input-path", (value) => {
    options.recordsInputPath = path.resolve(value);
  });
  handleSimpleOption(argv, "records-output-path", (value) => {
    options.recordsOutputPath = path.resolve(value);
  });
  handleSimpleOption(argv, "records-path", (value) => {
    options.recordsPath = path.resolve(value);
  });

  // target
  handleSimpleOption(argv, "target", (value) => {
    options.target = value;
  });

  // boolean flags
  mapArgToBoolean(argv, "cache");
  ifBooleanArg(argv, "hot", () => {
    ensureArray(options, "plugins");
    const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
    options.plugins.push(new HotModuleReplacementPlugin());
  });
  ifBooleanArg(argv, "debug", () => {
    ensureArray(options, "plugins");
    const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
    options.plugins.push(new LoaderOptionsPlugin({ debug: true }));
  });
  handleSimpleOption(argv, "devtool", (value) => {
    options.devtool = value;
  });

  // resolve aliases
  processResolveAlias(argv, options, "resolve-alias", "resolve");
  processResolveAlias(argv, options, "resolve-loader-alias", "resolveLoader");

  // resolve extensions
  ifArg(argv, "resolve-extensions", (value) => {
    ensureObject(options, "resolve");
    options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
  });

  // optimization plugins
  handleOptimizationPlugin(argv, options, "optimize-max-chunks", "LimitChunkCountPlugin", (value) => ({
    maxChunks: parseInt(value, 10),
  }));
  handleOptimizationPlugin(argv, options, "optimize-min-chunk-size", "MinChunkSizePlugin", (value) => ({
    minChunkSize: parseInt(value, 10),
  }));
  ifBooleanArg(argv, "optimize-minimize", () => {
    ensureArray(options, "plugins");
    const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
    const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
    options.plugins.push(
      new UglifyJsPlugin({
        sourceMap:
          options.devtool &&
          (options.devtool.includes("sourcemap") || options.devtool.includes("source-map")),
      })
    );
    options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
  });

  // prefetch
  handleSimpleOption(argv, "prefetch", (request) => {
    ensureArray(options, "plugins");
    const PrefetchPlugin = require("../lib/PrefetchPlugin");
    options.plugins.push(new PrefetchPlugin(request));
  });

  // provide
  ifArg(argv, "provide", (value) => {
    ensureArray(options, "plugins");
    const idx = value.indexOf("=");
    const name = idx >= 0 ? value.substring(0, idx) : value;
    const val = idx >= 0 ? value.substring(idx + 1) : value;
    const ProvidePlugin = require("../lib/ProvidePlugin");
    options.plugins.push(new ProvidePlugin(name, val));
  });

  // generic plugin
  ifArg(argv, "plugin", (value) => {
    ensureArray(options, "plugins");
    options.plugins.push(loadPlugin(value));
  });

  // other booleans
  mapArgToBoolean(argv, "bail");
  mapArgToBoolean(argv, "profile");

  // output filename fallback
  if (noOutputFilenameDefined) {
    ensureObject(options, "output");
    if (convertOptions && convertOptions.outputFilename) {
      options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
      options.output.filename = path.basename(convertOptions.outputFilename);
    } else if (argv._.length > 0) {
      options.output.filename = argv._.pop();
      options.output.path = path.resolve(path.dirname(options.output.filename));
      options.output.filename = path.basename(options.output.filename);
    } else if (configFileLoaded) {
      throw new Error("'output.filename' is required, either in config file or as --output-filename");
    } else {
      console.error("No configuration file found and no output filename configured via CLI option.");
      console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
      console.error("Use --help to display the CLI options.");
      process.exit(-1);
    }
  }

  // positional entry arguments
  if (argv._.length > 0) {
    if (Array.isArray(options.entry) || typeof options.entry === "string") {
      options.entry = { main: options.entry };
    }
    ensureObject(options, "entry");

    const addTo = (name, entry) => {
      if (options.entry[name]) {
        if (!Array.isArray(options.entry[name])) {
          options.entry[name] = [options.entry[name]];
        }
        options.entry[name].push(entry);
      } else {
        options.entry[name] = entry;
      }
    };

    argv._.forEach((content) => {
      const i = content.indexOf("=");
      const j = content.indexOf("?");
      if (i < 0 || (j >= 0 && j < i)) {
        const resolved = path.resolve(content);
        if (fs.existsSync(resolved)) addTo("main", resolved);
        else addTo("main", content);
      } else {
        addTo(content.substring(0, i), content.substring(i + 1));
      }
    });
  }

  // final entry validation
  if (!options.entry) {
    if (configFileLoaded) console.error("Configuration file found but no entry configured.");
    else {
      console.error("No configuration file found and no entry configured via CLI option.");
      console.error("When using the CLI you need to provide at least two arguments: entry and output.");
      console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
    }
    console.error("Use --help to display the CLI options.");
    process.exit(-1);
  }
}

/**
 * Generic argument handler.
 */
function ifArg(argv, name, fn) {
  if (Array.isArray(argv[name])) {
    argv[name].forEach((v) => fn(v));
  } else if (argv[name] !== undefined && argv[name] !== null) {
    fn(argv[name]);
  }
}

/**
 * Argument pair handler (key=value).
 */
function ifArgPair(argv, name, fn, init) {
  ifArg(argv, name, (content) => {
    if (init) init();
    const idx = content.indexOf("=");
    if (idx < 0) fn(null, content);
    else fn(content.substring(0, idx), content.substring(idx + 1));
  });
}

/**
 * Boolean argument handler.
 */
function ifBooleanArg(argv, name, fn) {
  ifArg(argv, name, (value) => {
    if (value) fn();
  });
}

/**
 * Map argument to boolean option on the config.
 */
function mapArgToBoolean(argv, name, optionName) {
  ifArg(argv, name, (bool) => {
    if (bool === true) options[optionName || name] = true;
    else if (bool === false) options[optionName || name] = false;
  });
}

/**
 * Ensure a property is an object.
 */
function ensureObject(parent, name) {
  if (typeof parent[name] !== "object" || parent[name] === null) {
    parent[name] = {};
  }
}

/**
 * Ensure a property is an array.
 */
function ensureArray(parent, name) {
  if (!Array.isArray(parent[name])) {
    parent[name] = [];
  }
}

/**
 * Bind loaders based on CLI arguments.
 */
function bindLoaders(argv, options, arg, collection) {
  ifArgPair(argv, arg, (name, binding) => {
    if (name === null) {
      name = binding;
      binding += "-loader";
    }
    options.module[collection].push({
      test: new RegExp(
        "\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"
      ),
      loader: binding,
    });
  }, () => {
    ensureObject(options, "module");
    ensureArray(options.module, collection);
  });
}

/**
 * Handle --define arguments.
 */
function handleDefine(argv, options, onFinalize) {
  let defineObject = {};
  ifArgPair(argv, "define", (name, value) => {
    if (name === null) {
      name = value;
      value = true;
    }
    defineObject[name] = value;
  }, null, () => {
    ensureArray(options, "plugins");
    const DefinePlugin = require("../lib/DefinePlugin");
    options.plugins.push(new DefinePlugin(defineObject));
    if (onFinalize) onFinalize();
  });
}

/**
 * Generic simple option handler.
 */
function handleSimpleOption(argv, name, fn) {
  ifArg(argv, name, fn);
}

/**
 * Output option handler.
 */
function handleOutputOption(argv, options, name, fn) {
  ifArg(argv, name, fn);
}

/**
 * Process resolve alias arguments.
 */
function processResolveAlias(argv, options, arg, key) {
  ifArgPair(argv, arg, (name, value) => {
    if (!name) throw new Error(`--${arg} <string>=<string>`);
    ensureObject(options, key);
    ensureObject(options[key], "alias");
    options[key].alias[name] = value;
  });
}

/**
 * Load a plugin by name (supports query args).
 */
function loadPlugin(name) {
  const loadUtils = require("loader-utils");
  let args;
  try {
    const qIdx = name && name.indexOf("?");
    if (qIdx > -1) {
      args = loadUtils.parseQuery(name.substring(qIdx));
      name = name.substring(0, qIdx);
    }
  } catch (e) {
    console.log(`Invalid plugin arguments ${name} (${e}).`);
    process.exit(-1);
  }

  let resolvedPath;
  try {
    const resolve = require("enhanced-resolve");
    resolvedPath = resolve.sync(process.cwd(), name);
  } catch (e) {
    console.log(`Cannot resolve plugin ${name}.`);
    process.exit(-1);
  }

  let Plugin;
  try {
    Plugin = require(resolvedPath);
  } catch (e) {
    console.log(`Cannot load plugin ${name}. (${resolvedPath})`);
    throw e;
  }

  try {
    return new Plugin(args);
  } catch (e) {
    console.log(`Cannot instantiate plugin ${name}. (${resolvedPath})`);
    throw e;
  }
}

/**
 * Handle optimization related plugins.
 */
function handleOptimizationPlugin(argv, options, argName, pluginClassName, configFactory) {
  ifArg(argv, argName, (value) => {
    ensureArray(options, "plugins");
    const PluginClass = require(`../lib/optimize/${pluginClassName}`);
    options.plugins.push(new PluginClass(configFactory(value)));
  });
}
```