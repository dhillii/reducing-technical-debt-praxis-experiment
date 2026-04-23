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
  const configFileLoaded = loadConfigFiles(argv, options);

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
 * @param {array} options - The options array.
 * @returns {boolean} Whether a configuration file was loaded.
 */
function loadConfigFiles(argv, options) {
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
 * Gets configuration files from the command line argument.
 * @param {string|array} config - The configuration file(s).
 * @param {array} extensions - The file extensions.
 * @returns {array} The configuration files.
 */
function getConfigFiles(config, extensions) {
  const configFiles = [];
  const configArgList = Array.isArray(config) ? config : [config];
  configArgList.forEach((configArg) => {
    const resolvedPath = path.resolve(configArg);
    const extension = getConfigExtension(resolvedPath, extensions);
    configFiles.push({
      path: resolvedPath,
      ext: extension,
    });
  });
  return configFiles;
}

/**
 * Gets the default configuration files.
 * @param {array} defaultConfigFiles - The default configuration files.
 * @returns {array} The default configuration files.
 */
function getDefaultConfigFiles(defaultConfigFiles) {
  const configFiles = [];
  defaultConfigFiles.some((file) => {
    if (fs.existsSync(file.path)) {
      configFiles.push(file);
      return true;
    }
    return false;
  });
  return configFiles;
}

/**
 * Registers a compiler.
 * @param {string} moduleDescriptor - The module descriptor.
 */
function registerCompiler(moduleDescriptor) {
  if (moduleDescriptor) {
    if (typeof moduleDescriptor === "string") {
      require(moduleDescriptor);
    } else if (!Array.isArray(moduleDescriptor)) {
      moduleDescriptor.register(require(moduleDescriptor.module));
    } else {
      moduleDescriptor.some((module) => {
        try {
          registerCompiler(module);
          return true;
        } catch (e) {
          return false;
        }
      });
    }
  }
}

/**
 * Requires a configuration file.
 * @param {string} configPath - The configuration file path.
 * @returns {object} The configuration options.
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
 * Processes configured options.
 * @param {array} options - The options array.
 * @param {object} argv - The command line arguments.
 * @param {object} convertOptions - The convert options.
 * @returns {object} The processed options.
 */
function processConfiguredOptions(options, argv, convertOptions) {
  if (options.length === 0) {
    return processOptions({});
  } else if (options.length === 1) {
    return processOptions(options[0]);
  } else {
    return processOptions(options);
  }
}

/**
 * Processes options.
 * @param {object|array} options - The options.
 * @returns {object} The processed options.
 */
function processOptions(options) {
  if (options === null || typeof options !== "object") {
    console.error("Config did not export an object or a function returning an object.");
    process.exit(-1); // eslint-disable-line
  }

  // Process Promise
  if (typeof options.then === "function") {
    return options.then(processOptions);
  }

  // Process ES6 default
  if (typeof options === "object" && typeof options.default === "object") {
    return processOptions(options.default);
  }

  if (Array.isArray(options)) {
    options.forEach((option) => {
      processOption(option);
    });
  } else {
    processOption(options);
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
 * Processes an option.
 * @param {object} option - The option.
 */
function processOption(option) {
  const noOutputFilenameDefined = !option.output || !option.output.filename;

  // Process entry
  processEntry(option);

  // Process output
  processOutput(option, noOutputFilenameDefined);

  // Process plugins
  processPlugins(option);

  // Process resolve
  processResolve(option);

  // Process optimize
  processOptimize(option);

  // Process other options
  processOtherOptions(option);
}

/**
 * Processes entry.
 * @param {object} option - The option.
 */
function processEntry(option) {
  if (argv._.length > 0) {
    if (Array.isArray(option.entry) || typeof option.entry === "string") {
      option.entry = {
        main: option.entry,
      };
    }
    ensureObject(option, "entry");

    const addTo = (name, entry) => {
      if (option.entry[name]) {
        if (!Array.isArray(option.entry[name])) {
          option.entry[name] = [option.entry[name]];
        }
        option.entry[name].push(entry);
      } else {
        option.entry[name] = entry;
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

  if (!option.entry) {
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

/**
 * Processes output.
 * @param {object} option - The option.
 * @param {boolean} noOutputFilenameDefined - Whether no output filename is defined.
 */
function processOutput(option, noOutputFilenameDefined) {
  if (argv["output-path"]) {
    ensureObject(option, "output");
    option.output.path = path.resolve(argv["output-path"]);
  }

  if (argv["output-filename"]) {
    ensureObject(option, "output");
    option.output.filename = argv["output-filename"];
    noOutputFilenameDefined = false;
  }

  if (argv["output-chunk-filename"]) {
    ensureObject(option, "output");
    option.output.chunkFilename = argv["output-chunk-filename"];
  }

  if (argv["output-source-map-filename"]) {
    ensureObject(option, "output");
    option.output.sourceMapFilename = argv["output-source-map-filename"];
  }

  if (argv["output-public-path"]) {
    ensureObject(option, "output");
    option.output.publicPath = argv["output-public-path"];
  }

  if (argv["output-jsonp-function"]) {
    ensureObject(option, "output");
    option.output.jsonpFunction = argv["output-jsonp-function"];
  }

  if (argv["output-pathinfo"]) {
    ensureObject(option, "output");
    option.output.pathinfo = true;
  }

  if (argv["output-library"]) {
    ensureObject(option, "output");
    option.output.library = argv["output-library"];
  }

  if (argv["output-library-target"]) {
    ensureObject(option, "output");
    option.output.libraryTarget = argv["output-library-target"];
  }

  if (noOutputFilenameDefined) {
    ensureObject(option, "output");
    if (convertOptions && convertOptions.outputFilename) {
      option.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
      option.output.filename = path.basename(convertOptions.outputFilename);
    } else if (argv._.length > 0) {
      option.output.filename = argv._.pop();
      option.output.path = path.resolve(path.dirname(option.output.filename));
      option.output.filename = path.basename(option.output.filename);
    } else if (configFileLoaded) {
      throw new Error("'output.filename' is required, either in config file or as --output-filename");
    } else {
      console.error("No configuration file found and no output filename configured via CLI option.");
      console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
      console.error("Use --help to display the CLI options.");
      process.exit(-1); // eslint-disable-line
    }
  }
}

/**
 * Processes plugins.
 * @param {object} option - The option.
 */
function processPlugins(option) {
  if (argv.plugin) {
    ensureArray(option, "plugins");
    option.plugins.push(loadPlugin(argv.plugin));
  }

  if (argv.hot) {
    ensureArray(option, "plugins");
    const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
    option.plugins.push(new HotModuleReplacementPlugin());
  }

  if (argv.debug) {
    ensureArray(option, "plugins");
    const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
    option.plugins.push(new LoaderOptionsPlugin({
      debug: true,
    }));
  }

  if (argv["optimize-minimize"]) {
    ensureArray(option, "plugins");
    const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
    const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
    option.plugins.push(new UglifyJsPlugin({
      sourceMap: option.devtool && (option.devtool.indexOf("sourcemap") >= 0 || option.devtool.indexOf("source-map") >= 0),
    }));
    option.plugins.push(new LoaderOptionsPlugin({
      minimize: true,
    }));
  }
}

/**
 * Processes resolve.
 * @param {object} option - The option.
 */
function processResolve(option) {
  if (argv["resolve-alias"]) {
    ensureObject(option, "resolve");
    ensureObject(option.resolve, "alias");
    option.resolve.alias[argv["resolve-alias"]] = argv["resolve-alias-value"];
  }

  if (argv["resolve-extensions"]) {
    ensureObject(option, "resolve");
    if (Array.isArray(argv["resolve-extensions"])) {
      option.resolve.extensions = argv["resolve-extensions"];
    } else {
      option.resolve.extensions = argv["resolve-extensions"].split(/,\s*/);
    }
  }
}

/**
 * Processes optimize.
 * @param {object} option - The option.
 */
function processOptimize(option) {
  if (argv["optimize-max-chunks"]) {
    ensureArray(option, "plugins");
    const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
    option.plugins.push(new LimitChunkCountPlugin({
      maxChunks: parseInt(argv["optimize-max-chunks"], 10),
    }));
  }

  if (argv["optimize-min-chunk-size"]) {
    ensureArray(option, "plugins");
    const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
    option.plugins.push(new MinChunkSizePlugin({
      minChunkSize: parseInt(argv["optimize-min-chunk-size"], 10),
    }));
  }
}

/**
 * Processes other options.
 * @param {object} option - The option.
 */
function processOtherOptions(option) {
  if (argv.cache) {
    option.cache = argv.cache;
  }

  if (argv.bail) {
    option.bail = argv.bail;
  }

  if (argv.profile) {
    option.profile = argv.profile;
  }

  if (argv.devtool) {
    option.devtool = argv.devtool;
  }
}

/**
 * Loads a plugin.
 * @param {string} name - The plugin name.
 * @returns {object} The loaded plugin.
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
 * Ensures an object exists.
 * @param {object} parent - The parent object.
 * @param {string} name - The object name.
 */
function ensureObject(parent, name) {
  if (typeof parent[name] !== "object" || parent[name] === null) {
    parent[name] = {};
  }
}

/**
 * Ensures an array exists.
 * @param {object} parent - The parent object.
 * @param {string} name - The array name.
 */
function ensureArray(parent, name) {
  if (!Array.isArray(parent[name])) {
    parent[name] = [];
  }
}

/**
 * Gets the configuration file extension.
 * @param {string} configPath - The configuration file path.
 * @param {array} extensions - The file extensions.
 * @returns {string} The configuration file extension.
 */
function getConfigExtension(configPath, extensions) {
  for (let i = extensions.length - 1; i >= 0; i--) {
    const tmpExt = extensions[i];
    if (configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1) {
      return tmpExt;
    }
  }
  return path.extname(configPath);
}