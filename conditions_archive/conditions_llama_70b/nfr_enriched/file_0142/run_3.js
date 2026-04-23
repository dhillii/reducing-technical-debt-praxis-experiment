```javascript
const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

/**
 * Converts command line arguments to webpack options.
 * @param {object} yargs - The yargs instance.
 * @param {object} argv - The command line arguments.
 * @param {object} convertOptions - The convert options.
 * @returns {object} The converted webpack options.
 */
module.exports = function(yargs, argv, convertOptions) {
  const options = [];

  // Process shortcuts
  processShortcuts(argv);

  // Load configuration files
  const configFiles = loadConfigFiles(argv);

  // Process configuration files
  processConfigFiles(configFiles, options);

  // Process configured options
  return processConfiguredOptions(options, argv, convertOptions);
};

/**
 * Processes shortcuts.
 * @param {object} argv - The command line arguments.
 */
function processShortcuts(argv) {
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
}

/**
 * Loads configuration files.
 * @param {object} argv - The command line arguments.
 * @returns {array} The loaded configuration files.
 */
function loadConfigFiles(argv) {
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
    const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
    configFiles.push(...configArgList.map((configArg) => {
      return {
        path: path.resolve(configArg),
        ext: getConfigExtension(configArg),
      };
    }));
  } else {
    for (const defaultConfigFile of defaultConfigFiles) {
      if (fs.existsSync(defaultConfigFile.path)) {
        configFiles.push({
          path: defaultConfigFile.path,
          ext: defaultConfigFile.ext,
        });
        break;
      }
    }
  }

  return configFiles;
}

/**
 * Gets the configuration file extension.
 * @param {string} configPath - The configuration file path.
 * @returns {string} The configuration file extension.
 */
function getConfigExtension(configPath) {
  for (const ext of Object.keys(interpret.extensions)) {
    if (configPath.endsWith(ext)) {
      return ext;
    }
  }
  return path.extname(configPath);
}

/**
 * Processes configuration files.
 * @param {array} configFiles - The configuration files.
 * @param {array} options - The options.
 */
function processConfigFiles(configFiles, options) {
  if (configFiles.length > 0) {
    configFiles.forEach((file) => {
      registerCompiler(interpret.extensions[file.ext]);
      options.push(requireConfig(file.path));
    });
  }
}

/**
 * Registers a compiler.
 * @param {object} moduleDescriptor - The module descriptor.
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
 * Requires a configuration file.
 * @param {string} configPath - The configuration file path.
 * @returns {object} The configuration file options.
 */
function requireConfig(configPath) {
  const options = require(configPath);
  if (typeof options === "function" || (typeof options === "object" && options !== null && typeof options.default === "function")) {
    options = typeof options === "function" ? options : options.default;
    options = options(argv.env, argv);
  }
  return options;
}

/**
 * Processes configured options.
 * @param {array} options - The options.
 * @param {object} argv - The command line arguments.
 * @param {object} convertOptions - The convert options.
 * @returns {object} The processed options.
 */
function processConfiguredOptions(options, argv, convertOptions) {
  if (options === null || typeof options !== "object") {
    console.error("Config did not export an object or a function returning an object.");
    process.exit(-1); // eslint-disable-line
  }

  // Process Promise
  if (typeof options.then === "function") {
    return options.then((options) => {
      return processConfiguredOptions(options, argv, convertOptions);
    });
  }

  // Process ES6 default
  if (typeof options === "object" && typeof options.default === "object") {
    return processConfiguredOptions(options.default, argv, convertOptions);
  }

  if (Array.isArray(options)) {
    options.forEach((option) => {
      processOptions(option, argv, convertOptions);
    });
  } else {
    processOptions(options, argv, convertOptions);
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
    if (typeof argv["watch-poll"] !== "boolean") {
      options.watchOptions.poll = +argv["watch-poll"];
    } else {
      options.watchOptions.poll = true;
    }
  }

  if (argv["watch-stdin"]) {
    options.watchOptions = options.watchOptions || {};
    options.watchOptions.stdin = true;
    options.watch = true;
  }

  return options;
}

/**
 * Processes options.
 * @param {object} options - The options.
 * @param {object} argv - The command line arguments.
 * @param {object} convertOptions - The convert options.
 */
function processOptions(options, argv, convertOptions) {
  const noOutputFilenameDefined = !options.output || !options.output.filename;

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

  function ifArgPair(name, fn, init, finalize) {
    ifArg(name, (content, idx) => {
      const i = content.indexOf("=");
      if (i < 0) {
        return fn(null, content, idx);
      } else {
        return fn(content.substr(0, i), content.substr(i + 1), idx);
      }
    }, init, finalize);
  }

  function ifBooleanArg(name, fn) {
    ifArg(name, (bool) => {
      if (bool) {
        fn();
      }
    });
  }

  function mapArgToBoolean(name, optionName) {
    ifArg(name, (bool) => {
      if (bool === true) {
        options[optionName || name] = true;
      } else if (bool === false) {
        options[optionName || name] = false;
      }
    });
  }

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

  function ensureObject(parent, name) {
    if (typeof parent[name] !== "object" || parent[name] === null) {
      parent[name] = {};
    }
  }

  function ensureArray(parent, name) {
    if (!Array.isArray(parent[name])) {
      parent[name] = [];
    }
  }

  ifArgPair("entry", (name, entry) => {
    if (typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
      options.entry[name] = [].concat(options.entry[name]).concat(entry);
    } else {
      options.entry[name] = entry;
    }
  }, () => {
    ensureObject(options, "entry");
  });

  function bindLoaders(arg, collection) {
    ifArgPair(arg, (name, binding) => {
      if (name === null) {
        name = binding;
        binding += "-loader";
      }
      options.module[collection].push({
        test: new RegExp("\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
        loader: binding,
      });
    }, () => {
      ensureObject(options, "module");
      ensureArray(options.module, collection);
    });
  }
  bindLoaders("module-bind", "loaders");
  bindLoaders("module-bind-pre", "preLoaders");
  bindLoaders("module-bind-post", "postLoaders");

  let defineObject;
  ifArgPair("define", (name, value) => {
    if (name === null) {
      name = value;
      value = true;
    }
    defineObject[name] = value;
  }, () => {
    defineObject = {};
  }, () => {
    ensureArray(options, "plugins");
    const DefinePlugin = require("../lib/DefinePlugin");
    options.plugins.push(new DefinePlugin(defineObject));
  });

  ifArg("output-path", (value) => {
    ensureObject(options, "output");
    options.output.path = path.resolve(value);
  });

  ifArg("output-filename", (value) => {
    ensureObject(options, "output");
    options.output.filename = value;
    noOutputFilenameDefined = false;
  });

  ifArg("output-chunk-filename", (value) => {
    ensureObject(options, "output");
    options.output.chunkFilename = value;
  });

  ifArg("output-source-map-filename", (value) => {
    ensureObject(options, "output");
    options.output.sourceMapFilename = value;
  });

  ifArg("output-public-path", (value) => {
    ensureObject(options, "output");
    options.output.publicPath = value;
  });

  ifArg("output-jsonp-function", (value) => {
    ensureObject(options, "output");
    options.output.jsonpFunction = value;
  });

  ifBooleanArg("output-pathinfo", () => {
    ensureObject(options, "output");
    options.output.pathinfo = true;
  });

  ifArg("output-library", (value) => {
    ensureObject(options, "output");
    options.output.library = value;
  });

  ifArg("output-library-target", (value) => {
    ensureObject(options, "output");
    options.output.libraryTarget = value;
  });

  ifArg("records-input-path", (value) => {
    options.recordsInputPath = path.resolve(value);
  });

  ifArg("records-output-path", (value) => {
    options.recordsOutputPath = path.resolve(value);
  });

  ifArg("records-path", (value) => {
    options.recordsPath = path.resolve(value);
  });

  ifArg("target", (value) => {
    options.target = value;
  });

  mapArgToBoolean("cache");

  ifBooleanArg("hot", () => {
    ensureArray(options, "plugins");
    const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
    options.plugins.push(new HotModuleReplacementPlugin());
  });

  ifBooleanArg("debug", () => {
    ensureArray(options, "plugins");
    const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
    options.plugins.push(new LoaderOptionsPlugin({
      debug: true,
    }));
  });

  ifArg("devtool", (value) => {
    options.devtool = value;
  });

  function processResolveAlias(arg, key) {
    ifArgPair(arg, (name, value) => {
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

  ifArg("resolve-extensions", (value) => {
    ensureObject(options, "resolve");
    if (Array.isArray(value)) {
      options.resolve.extensions = value;
    } else {
      options.resolve.extensions = value.split(/,\s*/);
    }
  });

  ifArg("optimize-max-chunks", (value) => {
    ensureArray(options, "plugins");
    const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
    options.plugins.push(new LimitChunkCountPlugin({
      maxChunks: parseInt(value, 10),
    }));
  });

  ifArg("optimize-min-chunk-size", (value) => {
    ensureArray(options, "plugins");
    const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
    options.plugins.push(new MinChunkSizePlugin({
      minChunkSize: parseInt(value, 10),
    }));
  });

  ifBooleanArg("optimize-minimize", () => {
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

  ifArg("prefetch", (request) => {
    ensureArray(options, "plugins");
    const PrefetchPlugin = require("../lib/PrefetchPlugin");
    options.plugins.push(new PrefetchPlugin(request));
  });

  ifArg("provide", (value) => {
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

  ifArg("plugin", (value) => {
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
    } else if (configFiles.length > 0) {
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
    if (configFiles.length > 0) {
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
```