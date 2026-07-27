const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

function applyShortcuts(argv) {
  if (argv.d) {
    argv.debug = true;
    argv["output-pathinfo"] = true;
    if (!argv.devtool) {
      argv.devtool = "eval-cheap-module-source-map";
    }
  }
  if (argv.p) {
    argv["optimize-minimize"] = true;
    argv["define"] = [].concat(argv["define"] || []).concat(
      "process.env.NODE_ENV=\"production\""
    );
  }
}

function getExtensions() {
  return Object.keys(interpret.extensions).sort((a, b) => {
    if (a === ".js") return -1;
    if (b === ".js") return 1;
    return a.length - b.length;
  });
}

function defaultConfigFiles(extensions) {
  return ["webpack.config", "webpackfile"]
    .map((filename) =>
      extensions.map((ext) => ({
        path: path.resolve(filename + ext),
        ext,
      }))
    )
    .reduce((a, i) => a.concat(i), []);
}

function getConfigExtension(configPath, extensions) {
  for (let i = extensions.length - 1; i >= 0; i--) {
    const tmpExt = extensions[i];
    if (
      configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1
    ) {
      return tmpExt;
    }
  }
  return path.extname(configPath);
}

function mapConfigArg(configArg, extensions) {
  const resolvedPath = path.resolve(configArg);
  const extension = getConfigExtension(resolvedPath, extensions);
  return { path: resolvedPath, ext: extension };
}

function loadConfigFiles(argv, extensions, defaultFiles) {
  if (argv.config) {
    const configArgList = Array.isArray(argv.config)
      ? argv.config
      : [argv.config];
    return configArgList.map((arg) => mapConfigArg(arg, extensions));
  }
  for (let i = 0; i < defaultFiles.length; i++) {
    const webpackConfig = defaultFiles[i].path;
    if (fs.existsSync(webpackConfig)) {
      return [
        {
          path: webpackConfig,
          ext: defaultFiles[i].ext,
        },
      ];
    }
  }
  return [];
}

function registerCompiler(moduleDescriptor) {
  if (!moduleDescriptor) return;
  if (typeof moduleDescriptor === "string") {
    require(moduleDescriptor);
  } else if (!Array.isArray(moduleDescriptor)) {
    moduleDescriptor.register(require(moduleDescriptor.module));
  } else {
    for (let i = 0; i < moduleDescriptor.length; i++) {
      try {
        registerCompiler(moduleDescriptor[i]);
        break;
      } catch (_) {
        // ignore
      }
    }
  }
}

function requireConfig(configPath, argv) {
  let options = require(configPath);
  const isES6DefaultExportedFunc =
    typeof options === "object" &&
    options !== null &&
    typeof options.default === "function";
  if (typeof options === "function" || isES6DefaultExportedFunc) {
    options = isES6DefaultExportedFunc ? options.default : options;
    options = options(argv.env, argv);
  }
  return options;
}

function processConfiguredOptions(options, argv, convertOptions) {
  if (options === null || typeof options !== "object") {
    console.error(
      "Config did not export an object or a function returning an object."
    );
    process.exit(-1);
  }

  if (typeof options.then === "function") {
    return options.then((o) => processConfiguredOptions(o, argv, convertOptions));
  }

  if (typeof options === "object" && typeof options.default === "object") {
    return processConfiguredOptions(options.default, argv, convertOptions);
  }

  if (Array.isArray(options)) {
    options.forEach((opt) => processOptions(opt, argv));
  } else {
    processOptions(options, argv);
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

function ifArg(argv, name, fn, init, finalize) {
  if (Array.isArray(argv[name])) {
    if (init) init();
    argv[name].forEach(fn);
    if (finalize) finalize();
  } else if (typeof argv[name] !== "undefined" && argv[name] !== null) {
    if (init) init();
    fn(argv[name], -1);
    if (finalize) finalize();
  }
}

function ifArgPair(argv, name, fn, init, finalize) {
  ifArg(argv, name, (content, idx) => {
    const i = content.indexOf("=");
    if (i < 0) {
      fn(null, content, idx);
    } else {
      fn(content.substr(0, i), content.substr(i + 1), idx);
    }
  }, init, finalize);
}

function ifBooleanArg(argv, name, fn) {
  ifArg(argv, name, (bool) => {
    if (bool) fn();
  });
}

function mapArgToBoolean(argv, name, fn) {
  ifArg(argv, name, (bool) => {
    if (bool === true) fn(true);
    else if (bool === false) fn(false);
  });
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

function bindLoaders(argv, options, arg, collection) {
  ifArgPair(argv, arg, (name, binding) => {
    if (name === null) {
      name = binding;
      binding += "-loader";
    }
    options.module[collection].push({
      test: new RegExp(
        "\\." +
          name.replace(
            /[\\-\\[\\]\\/\\{\\}\\(\\)\\*\\+\\?\\.\\\\\\^\\$\\|]/g,
            "\\$&"
          ) +
          "$"
      ),
      loader: binding,
    });
  }, () => {
    ensureObject(options, "module");
    ensureArray(options.module, collection);
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
    process.exit(-1);
  }

  let pluginPath;
  try {
    const resolve = require("enhanced-resolve");
    pluginPath = resolve.sync(process.cwd(), name);
  } catch (e) {
    console.log("Cannot resolve plugin " + name + ".");
    process.exit(-1);
  }

  let Plugin;
  try {
    Plugin = require(pluginPath);
  } catch (e) {
    console.log("Cannot load plugin " + name + ". (" + pluginPath + ")");
    throw e;
  }

  try {
    return new Plugin(args);
  } catch (e) {
    console.log("Cannot instantiate plugin " + name + ". (" + pluginPath + ")");
    throw e;
  }
}

function addEntryFromArgs(argv, options) {
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
}

function processOptions(options, argv, convertOptions) {
  let noOutputFilenameDefined = !options.output || !options.output.filename;

  ifArgPair(argv, "entry", (name, entry) => {
    if (typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
      options.entry[name] = [].concat(options.entry[name]).concat(entry);
    } else {
      options.entry[name] = entry;
    }
  }, () => {
    ensureObject(options, "entry");
  });

  bindLoaders(argv, options, "module-bind", "loaders");
  bindLoaders(argv, options, "module-bind-pre", "preLoaders");
  bindLoaders(argv, options, "module-bind-post", "postLoaders");

  let defineObject;
  ifArgPair(argv, "define", (name, value) => {
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

  ifArg(argv, "output-path", (value) => {
    ensureObject(options, "output");
    options.output.path = path.resolve(value);
  });

  ifArg(argv, "output-filename", (value) => {
    ensureObject(options, "output");
    options.output.filename = value;
    noOutputFilenameDefined = false;
  });

  ifArg(argv, "output-chunk-filename", (value) => {
    ensureObject(options, "output");
    options.output.chunkFilename = value;
  });

  ifArg(argv, "output-source-map-filename", (value) => {
    ensureObject(options, "output");
    options.output.sourceMapFilename = value;
  });

  ifArg(argv, "output-public-path", (value) => {
    ensureObject(options, "output");
    options.output.publicPath = value;
  });

  ifArg(argv, "output-jsonp-function", (value) => {
    ensureObject(options, "output");
    options.output.jsonpFunction = value;
  });

  ifBooleanArg(argv, "output-pathinfo", () => {
    ensureObject(options, "output");
    options.output.pathinfo = true;
  });

  ifArg(argv, "output-library", (value) => {
    ensureObject(options, "output");
    options.output.library = value;
  });

  ifArg(argv, "output-library-target", (value) => {
    ensureObject(options, "output");
    options.output.libraryTarget = value;
  });

  ifArg(argv, "records-input-path", (value) => {
    options.recordsInputPath = path.resolve(value);
  });

  ifArg(argv, "records-output-path", (value) => {
    options.recordsOutputPath = path.resolve(value);
  });

  ifArg(argv, "records-path", (value) => {
    options.recordsPath = path.resolve(value);
  });

  ifArg(argv, "target", (value) => {
    options.target = value;
  });

  mapArgToBoolean(argv, "cache", (bool) => {
    if (bool === true) options.cache = true;
    else if (bool === false) options.cache = false;
  });

  ifBooleanArg(argv, "hot", () => {
    ensureArray(options, "plugins");
    const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
    options.plugins.push(new HotModuleReplacementPlugin());
  });

  ifBooleanArg(argv, "debug", () => {
    ensureArray(options, "plugins");
    const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
    options.plugins.push(
      new LoaderOptionsPlugin({
        debug: true,
      })
    );
  });

  ifArg(argv, "devtool", (value) => {
    options.devtool = value;
  });

  const processResolveAlias = (arg, key) => {
    ifArgPair(argv, arg, (name, value) => {
      if (!name) {
        throw new Error("--" + arg + " <string>=<string>");
      }
      ensureObject(options, key);
      ensureObject(options[key], "alias");
      options[key].alias[name] = value;
    });
  };

  processResolveAlias("resolve-alias", "resolve");
  processResolveAlias("resolve-loader-alias", "resolveLoader");

  ifArg(argv, "resolve-extensions", (value) => {
    ensureObject(options, "resolve");
    if (Array.isArray(value)) {
      options.resolve.extensions = value;
    } else {
      options.resolve.extensions = value.split(/,\s*/);
    }
  });

  ifArg(argv, "optimize-max-chunks", (value) => {
    ensureArray(options, "plugins");
    const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
    options.plugins.push(
      new LimitChunkCountPlugin({
        maxChunks: parseInt(value, 10),
      })
    );
  });

  ifArg(argv, "optimize-min-chunk-size", (value) => {
    ensureArray(options, "plugins");
    const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
    options.plugins.push(
      new MinChunkSizePlugin({
        minChunkSize: parseInt(value, 10),
      })
    );
  });

  ifBooleanArg(argv, "optimize-minimize", () => {
    ensureArray(options, "plugins");
    const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
    const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
    options.plugins.push(
      new UglifyJsPlugin({
        sourceMap:
          options.devtool &&
          (options.devtool.indexOf("sourcemap") >= 0 ||
            options.devtool.indexOf("source-map") >= 0),
      })
    );
    options.plugins.push(
      new LoaderOptionsPlugin({
        minimize: true,
      })
    );
  });

  ifArg(argv, "prefetch", (request) => {
    ensureArray(options, "plugins");
    const PrefetchPlugin = require("../lib/PrefetchPlugin");
    options.plugins.push(new PrefetchPlugin(request));
  });

  ifArg(argv, "provide", (value) => {
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

  ifArg(argv, "plugin", (value) => {
    ensureArray(options, "plugins");
    options.plugins.push(loadPlugin(value));
  });

  mapArgToBoolean(argv, "bail", (bool) => {
    if (bool === true) options.bail = true;
    else if (bool === false) options.bail = false;
  });

  mapArgToBoolean(argv, "profile", (bool) => {
    if (bool === true) options.profile = true;
    else if (bool === false) options.profile = false;
  });

  if (noOutputFilenameDefined) {
    ensureObject(options, "output");
    if (convertOptions && convertOptions.outputFilename) {
      options.output.path = path.resolve(
        path.dirname(convertOptions.outputFilename)
      );
      options.output.filename = path.basename(convertOptions.outputFilename);
    } else if (argv._.length > 0) {
      options.output.filename = argv._.pop();
      options.output.path = path.resolve(
        path.dirname(options.output.filename)
      );
      options.output.filename = path.basename(options.output.filename);
    } else if (argv.config) {
      throw new Error(
        "'output.filename' is required, either in config file or as --output-filename"
      );
    } else {
      console.error(
        "No configuration file found and no output filename configured via CLI option."
      );
      console.error(
        "A configuration file could be named 'webpack.config.js' in the current directory."
      );
      console.error("Use --help to display the CLI options.");
      process.exit(-1);
    }
  }

  addEntryFromArgs(argv, options);

  if (!options.entry) {
    if (argv.config) {
      console.error("Configuration file found but no entry configured.");
    } else {
      console.error(
        "No configuration file found and no entry configured via CLI option."
      );
      console.error(
        "When using the CLI you need to provide at least two arguments: entry and output."
      );
      console.error(
        "A configuration file could be named 'webpack.config.js' in the current directory."
      );
    }
    console.error("Use --help to display the CLI options.");
    process.exit(-1);
  }
}

module.exports = function (yargs, argv, convertOptions) {
  applyShortcuts(argv);

  const extensions = getExtensions();
  const defaultFiles = defaultConfigFiles(extensions);
  const configFiles = loadConfigFiles(argv, extensions, defaultFiles);

  let configFileLoaded = false;
  const options = [];

  if (configFiles.length > 0) {
    configFiles.forEach((file) => {
      registerCompiler(interpret.extensions[file.ext]);
      options.push(requireConfig(file.path, argv));
    });
    configFileLoaded = true;
  }

  if (!configFileLoaded) {
    return processConfiguredOptions({}, argv, convertOptions);
  } else if (options.length === 1) {
    return processConfiguredOptions(options[0], argv, convertOptions);
  } else {
    return processConfiguredOptions(options, argv, convertOptions);
  }
};