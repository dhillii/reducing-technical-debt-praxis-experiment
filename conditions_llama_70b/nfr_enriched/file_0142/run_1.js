const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

module.exports = function(yargs, argv, convertOptions) {
  const options = [];

  // Shortcuts
  if (argv.d) {
    argv.debug = true;
    argv["output-pathinfo"] = true;
    if (!argv.devtool) {
      argv.devtool = "eval-cheap-module-source-map";
    }
  }
  if (argv.p) {
    argv["optimize-minimize"] = true;
    argv["define"] = [].concat(argv["define"] || []).concat("process.env.NODE_ENV=\"production\"");
  }

  const configFileLoaded = loadConfigFile(argv, options);
  if (!configFileLoaded) {
    return processConfiguredOptions({});
  } else if (options.length === 1) {
    return processConfiguredOptions(options[0]);
  } else {
    return processConfiguredOptions(options);
  }
};

/**
 * Load configuration file based on provided arguments.
 * @param {object} argv - Command line arguments.
 * @param {array} options - Options array to be populated.
 * @returns {boolean} Whether a configuration file was loaded.
 */
function loadConfigFile(argv, options) {
  const configFileLoaded = false;
  const configFiles = [];
  const extensions = Object.keys(interpret.extensions).sort((a, b) => {
    return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
  });
  const defaultConfigFiles = ["webpack.config", "webpackfile"].map((filename) => {
    return extensions.map((ext) => {
      return {
        path: path.resolve(filename + ext),
        ext: ext,
      };
    });
  }).reduce((a, i) => {
    return a.concat(i);
  }, []);

  if (argv.config) {
    configFiles.push(...getConfigFiles(argv.config, extensions));
  } else {
    configFiles.push(...getDefaultConfigFiles(defaultConfigFiles));
  }

  if (configFiles.length > 0) {
    configFiles.forEach((file) => {
      registerCompiler(interpret.extensions[file.ext]);
      options.push(requireConfig(file.path));
    });
    return true;
  }
  return false;
}

/**
 * Get configuration files based on provided config argument.
 * @param {string|array} config - Config argument.
 * @param {array} extensions - Supported file extensions.
 * @returns {array} Configuration files.
 */
function getConfigFiles(config, extensions) {
  const configArgList = Array.isArray(config) ? config : [config];
  return configArgList.map((configArg) => {
    const resolvedPath = path.resolve(configArg);
    const extension = getConfigExtension(resolvedPath, extensions);
    return {
      path: resolvedPath,
      ext: extension,
    };
  });
}

/**
 * Get default configuration files.
 * @param {array} defaultConfigFiles - Default configuration files.
 * @returns {array} Default configuration files that exist.
 */
function getDefaultConfigFiles(defaultConfigFiles) {
  for (const file of defaultConfigFiles) {
    if (fs.existsSync(file.path)) {
      return [file];
    }
  }
  return [];
}

/**
 * Get configuration file extension.
 * @param {string} configPath - Configuration file path.
 * @param {array} extensions - Supported file extensions.
 * @returns {string} Configuration file extension.
 */
function getConfigExtension(configPath, extensions) {
  for (const ext of extensions) {
    if (configPath.endsWith(ext)) {
      return ext;
    }
  }
  return path.extname(configPath);
}

/**
 * Register compiler for given module descriptor.
 * @param {object} moduleDescriptor - Module descriptor.
 */
function registerCompiler(moduleDescriptor) {
  if (moduleDescriptor) {
    if (typeof moduleDescriptor === "string") {
      require(moduleDescriptor);
    } else if (!Array.isArray(moduleDescriptor)) {
      moduleDescriptor.register(require(moduleDescriptor.module));
    } else {
      for (const descriptor of moduleDescriptor) {
        try {
          registerCompiler(descriptor);
          break;
        } catch (e) {
          // do nothing
        }
      }
    }
  }
}

/**
 * Require configuration file.
 * @param {string} configPath - Configuration file path.
 * @returns {object} Configuration options.
 */
function requireConfig(configPath) {
  const options = require(configPath);
  const isES6DefaultExportedFunc = (
    typeof options === "object" && options !== null && typeof options.default === "function"
  );
  if (typeof options === "function" || isES6DefaultExportedFunc) {
    options = isES6DefaultExportedFunc ? options.default : options;
    options = options(argv.env, argv);
  }
  return options;
}

/**
 * Process configured options.
 * @param {object|array} options - Options to process.
 * @returns {object} Processed options.
 */
function processConfiguredOptions(options) {
  if (options === null || typeof options !== "object") {
    console.error("Config did not export an object or a function returning an object.");
    process.exit(-1); // eslint-disable-line
  }

  // process Promise
  if (typeof options.then === "function") {
    return options.then(processConfiguredOptions);
  }

  // process ES6 default
  if (typeof options === "object" && typeof options.default === "object") {
    return processConfiguredOptions(options.default);
  }

  if (Array.isArray(options)) {
    options.forEach(processOptions);
  } else {
    processOptions(options);
  }

  if (argv.context) {
    options.context = path.resolve(argv.context);
  }
  if (!options.context) {
    options.context = process.cwd();
  }

  if (argv.watch) {
    options.watch = true;
  }

  if (argv["watch-aggregate-timeout"]) {
    options.watchOptions = options.watchOptions || {};
    options.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
  }

  if (argv["watch-poll"]) {
    options.watchOptions = options.watchOptions || {};
    if (typeof argv["watch-poll"] !== "boolean")
      options.watchOptions.poll = +argv["watch-poll"];
    else
      options.watchOptions.poll = true;
  }

  if (argv["watch-stdin"]) {
    options.watchOptions = options.watchOptions || {};
    options.watchOptions.stdin = true;
    options.watch = true;
  }

  return options;
}

/**
 * Process options.
 * @param {object} options - Options to process.
 */
function processOptions(options) {
  const noOutputFilenameDefined = !options.output || !options.output.filename;

  /**
   * If argument is provided, execute callback function.
   * @param {string} name - Argument name.
   * @param {function} fn - Callback function.
   * @param {function} init - Initialization function.
   * @param {function} finalize - Finalization function.
   */
  function ifArg(name, fn, init, finalize) {
    if (Array.isArray(argv[name])) {
      if (init) {
        init();
      }
      argv[name].forEach(fn);
      if (finalize) {
        finalize();
      }
    } else if (typeof argv[name] !== "undefined" && argv[name] !== null) {
      if (init) {
        init();
      }
      fn(argv[name], -1);
      if (finalize) {
        finalize();
      }
    }
  }

  /**
   * If argument pair is provided, execute callback function.
   * @param {string} name - Argument name.
   * @param {function} fn - Callback function.
   * @param {function} init - Initialization function.
   * @param {function} finalize - Finalization function.
   */
  function ifArgPair(name, fn, init, finalize) {
    ifArg(name, function(content, idx) {
      const i = content.indexOf("=");
      if (i < 0) {
        return fn(null, content, idx);
      } else {
        return fn(content.substr(0, i), content.substr(i + 1), idx);
      }
    }, init, finalize);
  }

  /**
   * If boolean argument is provided, execute callback function.
   * @param {string} name - Argument name.
   * @param {function} fn - Callback function.
   */
  function ifBooleanArg(name, fn) {
    ifArg(name, function(bool) {
      if (bool) {
        fn();
      }
    });
  }

  /**
   * Map argument to boolean option.
   * @param {string} name - Argument name.
   * @param {string} optionName - Option name.
   */
  function mapArgToBoolean(name, optionName) {
    ifArg(name, function(bool) {
      if (bool === true)
        options[optionName || name] = true;
      else if (bool === false)
        options[optionName || name] = false;
    });
  }

  /**
   * Load plugin.
   * @param {string} name - Plugin name.
   * @returns {object} Loaded plugin.
   */
  function loadPlugin(name) {
    const loadUtils = require("loader-utils");
    let args;
    try {
      const p = name && name.indexOf("?");
      if (p > -1) {
        args = loadUtils.parseQuery(name.substring(p));
        name = name.substring(0, p);
      }
    } catch (e) {
      console.log("Invalid plugin arguments " + name + " (" + e + ").");
      process.exit(-1); // eslint-disable-line
    }

    let path;
    try {
      const resolve = require("enhanced-resolve");
      path = resolve.sync(process.cwd(), name);
    } catch (e) {
      console.log("Cannot resolve plugin " + name + ".");
      process.exit(-1); // eslint-disable-line
    }
    let Plugin;
    try {
      Plugin = require(path);
    } catch (e) {
      console.log("Cannot load plugin " + name + ". (" + path + ")");
      throw e;
    }
    try {
      return new Plugin(args);
    } catch (e) {
      console.log("Cannot instantiate plugin " + name + ". (" + path + ")");
      throw e;
    }
  }

  /**
   * Ensure object property exists.
   * @param {object} parent - Parent object.
   * @param {string} name - Property name.
   */
  function ensureObject(parent, name) {
    if (typeof parent[name] !== "object" || parent[name] === null) {
      parent[name] = {};
    }
  }

  /**
   * Ensure array property exists.
   * @param {object} parent - Parent object.
   * @param {string} name - Property name.
   */
  function ensureArray(parent, name) {
    if (!Array.isArray(parent[name])) {
      parent[name] = [];
    }
  }

  ifArgPair("entry", function(name, entry) {
    if (typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
      options.entry[name] = [].concat(options.entry[name]).concat(entry);
    } else {
      options.entry[name] = entry;
    }
  }, function() {
    ensureObject(options, "entry");
  });

  /**
   * Bind loaders.
   * @param {string} arg - Argument name.
   * @param {string} collection - Collection name.
   */
  function bindLoaders(arg, collection) {
    ifArgPair(arg, function(name, binding) {
      if (name === null) {
        name = binding;
        binding += "-loader";
      }
      options.module[collection].push({
        test: new RegExp("\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
        loader: binding,
      });
    }, function() {
      ensureObject(options, "module");
      ensureArray(options.module, collection);
    });
  }
  bindLoaders("module-bind", "loaders");
  bindLoaders("module-bind-pre", "preLoaders");
  bindLoaders("module-bind-post", "postLoaders");

  let defineObject;
  ifArgPair("define", function(name, value) {
    if (name === null) {
      name = value;
      value = true;
    }
    defineObject[name] = value;
  }, function() {
    defineObject = {};
  }, function() {
    ensureArray(options, "plugins");
    const DefinePlugin = require("../lib/DefinePlugin");
    options.plugins.push(new DefinePlugin(defineObject));
  });

  ifArg("output-path", function(value) {
    ensureObject(options, "output");
    options.output.path = path.resolve(value);
  });

  ifArg("output-filename", function(value) {
    ensureObject(options, "output");
    options.output.filename = value;
    noOutputFilenameDefined = false;
  });

  ifArg("output-chunk-filename", function(value) {
    ensureObject(options, "output");
    options.output.chunkFilename = value;
  });

  ifArg("output-source-map-filename", function(value) {
    ensureObject(options, "output");
    options.output.sourceMapFilename = value;
  });

  ifArg("output-public-path", function(value) {
    ensureObject(options, "output");
    options.output.publicPath = value;
  });

  ifArg("output-jsonp-function", function(value) {
    ensureObject(options, "output");
    options.output.jsonpFunction = value;
  });

  ifBooleanArg("output-pathinfo", function() {
    ensureObject(options, "output");
    options.output.pathinfo = true;
  });

  ifArg("output-library", function(value) {
    ensureObject(options, "output");
    options.output.library = value;
  });

  ifArg("output-library-target", function(value) {
    ensureObject(options, "output");
    options.output.libraryTarget = value;
  });

  ifArg("records-input-path", function(value) {
    options.recordsInputPath = path.resolve(value);
  });

  ifArg("records-output-path", function(value) {
    options.recordsOutputPath = path.resolve(value);
  });

  ifArg("records-path", function(value) {
    options.recordsPath = path.resolve(value);
  });

  ifArg("target", function(value) {
    options.target = value;
  });

  mapArgToBoolean("cache");

  ifBooleanArg("hot", function() {
    ensureArray(options, "plugins");
    const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
    options.plugins.push(new HotModuleReplacementPlugin());
  });

  ifBooleanArg("debug", function() {
    ensureArray(options, "plugins");
    const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
    options.plugins.push(new LoaderOptionsPlugin({
      debug: true,
    }));
  });

  ifArg("devtool", function(value) {
    options.devtool = value;
  });

  /**
   * Process resolve alias.
   * @param {string} arg - Argument name.
   * @param {string} key - Key name.
   */
  function processResolveAlias(arg, key) {
    ifArgPair(arg, function(name, value) {
      if (!name) {
        throw new Error("--" + arg + " <string>=<string>");
      }
      ensureObject(options, key);
      ensureObject(options[key], "alias");
      options[key].alias[name] = value;
    });
  }
  processResolveAlias("resolve-alias", "resolve");
  processResolveAlias("resolve-loader-alias", "resolveLoader");

  ifArg("resolve-extensions", function(value) {
    ensureObject(options, "resolve");
    if (Array.isArray(value)) {
      options.resolve.extensions = value;
    } else {
      options.resolve.extensions = value.split(/,\s*/);
    }
  });

  ifArg("optimize-max-chunks", function(value) {
    ensureArray(options, "plugins");
    const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
    options.plugins.push(new LimitChunkCountPlugin({
      maxChunks: parseInt(value, 10),
    }));
  });

  ifArg("optimize-min-chunk-size", function(value) {
    ensureArray(options, "plugins");
    const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
    options.plugins.push(new MinChunkSizePlugin({
      minChunkSize: parseInt(value, 10),
    }));
  });

  ifBooleanArg("optimize-minimize", function() {
    ensureArray(options, "plugins");
    const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
    const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
    options.plugins.push(new UglifyJsPlugin({
      sourceMap: options.devtool && (options.devtool.indexOf("sourcemap") >= 0 || options.devtool.indexOf("source-map") >= 0),
    }));
    options.plugins.push(new LoaderOptionsPlugin({
      minimize: true,
    }));
  });

  ifArg("prefetch", function(request) {
    ensureArray(options, "plugins");
    const PrefetchPlugin = require("../lib/PrefetchPlugin");
    options.plugins.push(new PrefetchPlugin(request));
  });

  ifArg("provide", function(value) {
    ensureArray(options, "plugins");
    const idx = value.indexOf("=");
    let name;
    if (idx >= 0) {
      name = value.substr(0, idx);
      value = value.substr(idx + 1);
    } else {
      name = value;
    }
    const ProvidePlugin = require("../lib/ProvidePlugin");
    options.plugins.push(new ProvidePlugin(name, value));
  });

  ifArg("plugin", function(value) {
    ensureArray(options, "plugins");
    options.plugins.push(loadPlugin(value));
  });

  mapArgToBoolean("bail");

  mapArgToBoolean("profile");

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
      process.exit(-1); // eslint-disable-line
    }
  }

  if (argv._.length > 0) {
    if (Array.isArray(options.entry) || typeof options.entry === "string") {
      options.entry = {
        main: options.entry,
      };
    }
    ensureObject(options, "entry");

    const addTo = function addTo(name, entry) {
      if (options.entry[name]) {
        if (!Array.isArray(options.entry[name])) {
          options.entry[name] = [options.entry[name]];
        }
        options.entry[name].push(entry);
      } else {
        options.entry[name] = entry;
      }
    };
    argv._.forEach(function(content) {
      const i = content.indexOf("=");
      const j = content.indexOf("?");
      if (i < 0 || (j >= 0 && j < i)) {
        const resolved = path.resolve(content);
        if (fs.existsSync(resolved)) {
          addTo("main", resolved);
        } else {
          addTo("main", content);
        }
      } else {
        addTo(content.substr(0, i), content.substr(i + 1));
      }
    });
  }

  if (!options.entry) {
    if (configFileLoaded) {
      console.error("Configuration file found but no entry configured.");
    } else {
      console.error("No configuration file found and no entry configured via CLI option.");
      console.error("When using the CLI you need to provide at least two arguments: entry and output.");
      console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
    }
    console.error("Use --help to display the CLI options.");
    process.exit(-1); // eslint-disable-line
  }
}