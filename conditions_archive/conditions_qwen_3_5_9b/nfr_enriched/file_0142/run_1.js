```javascript
var path = require("path");
var fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
var interpret = require("interpret");

/**
 * @typedef {Object} WebpackOptions
 * @property {string} [context]
 * @property {boolean} [watch]
 * @property {Object} [watchOptions]
 * @property {string} [devtool]
 * @property {Object} [output]
 * @property {string} [output.path]
 * @property {string} [output.filename]
 * @property {string} [output.chunkFilename]
 * @property {string} [output.sourceMapFilename]
 * @property {string} [output.publicPath]
 * @property {string} [output.jsonpFunction]
 * @property {boolean} [output.pathinfo]
 * @property {string} [output.library]
 * @property {string} [output.libraryTarget]
 * @property {string} [target]
 * @property {Object} [resolve]
 * @property {string[]} [resolve.extensions]
 * @property {Object} [resolve.alias]
 * @property {Object} [resolveLoader.alias]
 * @property {Object} [module]
 * @property {Object[]} [module.loaders]
 * @property {Object[]} [module.preLoaders]
 * @property {Object[]} [module.postLoaders]
 * @property {Object[]} [plugins]
 * @property {boolean} [cache]
 * @property {boolean} [bail]
 * @property {boolean} [profile]
 * @property {boolean} [hot]
 * @property {boolean} [debug]
 * @property {string} [recordsInputPath]
 * @property {string} [recordsOutputPath]
 * @property {string} [recordsPath]
 * @property {boolean} [optimizeMaxChunks]
 * @property {number} [optimizeMaxChunks.maxChunks]
 * @property {boolean} [optimizeMinChunkSize]
 * @property {number} [optimizeMinChunkSize.minChunkSize]
 * @property {boolean} [optimizeMinimize]
 * @property {string[]} [entry]
 */

/**
 * @typedef {Object} ConfigFile
 * @property {string} path
 * @property {string} ext
 */

/**
 * @typedef {Object} ConvertOptions
 * @property {string} [outputFilename]
 */

/**
 * @typedef {Object} Yargs
 * @property {string[]} [config]
 * @property {string} [context]
 * @property {boolean} [watch]
 * @property {string} [watchAggregateTimeout]
 * @property {string} [watchPoll]
 * @property {boolean} [watchStdin]
 * @property {string} [devtool]
 * @property {string} [outputPath]
 * @property {string} [outputFilename]
 * @property {string} [outputChunkFilename]
 * @property {string} [outputSourceMapFilename]
 * @property {string} [outputPublicPath]
 * @property {string} [outputJsonpFunction]
 * @property {boolean} [outputPathinfo]
 * @property {string} [outputLibrary]
 * @property {string} [outputLibraryTarget]
 * @property {string} [recordsInputPath]
 * @property {string} [recordsOutputPath]
 * @property {string} [recordsPath]
 * @property {string} [target]
 * @property {string} [cache]
 * @property {boolean} [hot]
 * @property {boolean} [debug]
 * @property {string} [resolveAlias]
 * @property {string} [resolveLoaderAlias]
 * @property {string} [resolveExtensions]
 * @property {string} [optimizeMaxChunks]
 * @property {string} [optimizeMinChunkSize]
 * @property {boolean} [optimizeMinimize]
 * @property {string} [prefetch]
 * @property {string} [provide]
 * @property {string} [plugin]
 * @property {boolean} [bail]
 * @property {boolean} [profile]
 * @property {string[]} _
 * @property {Object} env
 */

/**
 * @typedef {Object} ProcessedOptions
 * @property {string} [context]
 * @property {boolean} [watch]
 * @property {Object} [watchOptions]
 * @property {string} [devtool]
 * @property {Object} [output]
 * @property {string} [output.path]
 * @property {string} [output.filename]
 * @property {string} [output.chunkFilename]
 * @property {string} [output.sourceMapFilename]
 * @property {string} [output.publicPath]
 * @property {string} [output.jsonpFunction]
 * @property {boolean} [output.pathinfo]
 * @property {string} [output.library]
 * @property {string} [output.libraryTarget]
 * @property {string} [target]
 * @property {Object} [resolve]
 * @property {string[]} [resolve.extensions]
 * @property {Object} [resolve.alias]
 * @property {Object} [resolveLoader.alias]
 * @property {Object} [module]
 * @property {Object[]} [module.loaders]
 * @property {Object[]} [module.preLoaders]
 * @property {Object[]} [module.postLoaders]
 * @property {Object[]} [plugins]
 * @property {boolean} [cache]
 * @property {boolean} [bail]
 * @property {boolean} [profile]
 * @property {boolean} [hot]
 * @property {boolean} [debug]
 * @property {string} [recordsInputPath]
 * @property {string} [recordsOutputPath]
 * @property {string} [recordsPath]
 * @property {boolean} [optimizeMaxChunks]
 * @property {number} [optimizeMaxChunks.maxChunks]
 * @property {boolean} [optimizeMinChunkSize]
 * @property {number} [optimizeMinChunkSize.minChunkSize]
 * @property {boolean} [optimizeMinimize]
 * @property {string[]} [prefetch]
 * @property {string[]} [provide]
 * @property {string[]} [plugin]
 * @property {boolean} [bail]
 * @property {boolean} [profile]
 * @property {Object} [entry]
 */

/**
 * Main entry point for webpack CLI argument processing.
 * @param {Yargs} yargs - Yargs instance
 * @param {Yargs} argv - Command line arguments
 * @param {ConvertOptions} convertOptions - Conversion options
 * @returns {ProcessedOptions} Processed webpack configuration
 */
module.exports = function(yargs, argv, convertOptions) {
	var options = {};
	var configFileLoaded = false;
	var configFiles = [];
	var extensions = getSupportedExtensions();
	var defaultConfigFiles = getDefaultConfigFiles(extensions);

	if (argv.config) {
		configFiles = loadConfigFilesFromArg(argv.config, extensions);
	} else {
		configFiles = findDefaultConfigFiles(defaultConfigFiles);
	}

	if (configFiles.length > 0) {
		options = loadAndProcessConfigFiles(configFiles, extensions);
		configFileLoaded = true;
	}

	if (!configFileLoaded) {
		return processConfiguredOptions({});
	}

	if (options.length === 1) {
		return processConfiguredOptions(options[0]);
	}

	return processConfiguredOptions(options);
};

/**
 * Get supported file extensions for configuration files.
 * @returns {string[]} Sorted array of extensions
 */
function getSupportedExtensions() {
	return Object.keys(interpret.extensions).sort(function(a, b) {
		return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
	});
}

/**
 * Get default configuration file names.
 * @param {string[]} extensions - Supported file extensions
 * @returns {ConfigFile[]} Array of default config file objects
 */
function getDefaultConfigFiles(extensions) {
	return ["webpack.config", "webpackfile"].map(function(filename) {
		return extensions.map(function(ext) {
			return {
				path: path.resolve(filename + ext),
				ext: ext
			};
		});
	}).reduce(function(a, i) {
		return a.concat(i);
	}, []);
}

/**
 * Load configuration files from command line argument.
 * @param {string[]} configArgList - List of config file paths from argv
 * @param {string[]} extensions - Supported file extensions
 * @returns {ConfigFile[]} Array of resolved config file objects
 */
function loadConfigFilesFromArg(configArgList, extensions) {
	var getConfigExtension = function getConfigExtension(configPath) {
		for (var i = extensions.length - 1; i >= 0; i--) {
			var tmpExt = extensions[i];
			if (configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1) {
				return tmpExt;
			}
		}
		return path.extname(configPath);
	};

	var mapConfigArg = function mapConfigArg(configArg) {
		var resolvedPath = path.resolve(configArg);
		var extension = getConfigExtension(resolvedPath);
		return {
			path: resolvedPath,
			ext: extension
		};
	};

	return configArgList.map(mapConfigArg);
}

/**
 * Find default configuration files that exist on disk.
 * @param {ConfigFile[]} defaultConfigFiles - List of default config file objects
 * @returns {ConfigFile[]} Array of existing config file objects
 */
function findDefaultConfigFiles(defaultConfigFiles) {
	var configFiles = [];
	for (var i = 0; i < defaultConfigFiles.length; i++) {
		var webpackConfig = defaultConfigFiles[i].path;
		if (fs.existsSync(webpackConfig)) {
			configFiles.push({
				path: webpackConfig,
				ext: defaultConfigFiles[i].ext
			});
			break;
		}
	}
	return configFiles;
}

/**
 * Load and process configuration files.
 * @param {ConfigFile[]} configFiles - Array of config file objects
 * @param {string[]} extensions - Supported file extensions
 * @returns {ProcessedOptions[]} Array of processed options from config files
 */
function loadAndProcessConfigFiles(configFiles, extensions) {
	var options = [];

	var registerCompiler = function registerCompiler(moduleDescriptor) {
		if (!moduleDescriptor) {
			return;
		}

		if (typeof moduleDescriptor === "string") {
			require(moduleDescriptor);
		} else if (!Array.isArray(moduleDescriptor)) {
			moduleDescriptor.register(require(moduleDescriptor.module));
		} else {
			for (var i = 0; i < moduleDescriptor.length; i++) {
				try {
					registerCompiler(moduleDescriptor[i]);
					break;
				} catch (e) {
					// do nothing
				}
			}
		}
	};

	var requireConfig = function requireConfig(configPath) {
		var options = require(configPath);
		var isES6DefaultExportedFunc = (
			typeof options === "object" &&
			options !== null &&
			typeof options.default === "function"
		);

		if (typeof options === "function" || isES6DefaultExportedFunc) {
			options = isES6DefaultExportedFunc ? options.default : options;
			options = options(argv.env, argv);
		}
		return options;
	};

	configFiles.forEach(function(file) {
		registerCompiler(interpret.extensions[file.ext]);
		options.push(requireConfig(file.path));
	});

	return options;
}

/**
 * Process configured options and apply CLI overrides.
 * @param {ProcessedOptions} options - Options from config file
 * @returns {ProcessedOptions} Processed options with CLI overrides
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

	applyContextOverride(options);
	applyWatchOverrides(options);
	applyOutputOverrides(options);
	applyResolveOverrides(options);
	applyOptimizeOverrides(options);
	applyPluginOverrides(options);
	applyEntryOverrides(options);

	return options;
}

/**
 * Apply context override from CLI arguments.
 * @param {ProcessedOptions} options - Options object
 */
function applyContextOverride(options) {
	if (argv.context) {
		options.context = path.resolve(argv.context);
	}
	if (!options.context) {
		options.context = process.cwd();
	}
}

/**
 * Apply watch-related overrides from CLI arguments.
 * @param {ProcessedOptions} options - Options object
 */
function applyWatchOverrides(options) {
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
}

/**
 * Apply output-related overrides from CLI arguments.
 * @param {ProcessedOptions} options - Options object
 */
function applyOutputOverrides(options) {
	var noOutputFilenameDefined = !options.output || !options.output.filename;

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
}

/**
 * Apply resolve-related overrides from CLI arguments.
 * @param {ProcessedOptions} options - Options object
 */
function applyResolveOverrides(options) {
	ifArg("resolve-alias", function(name, value) {
		if (!name) {
			throw new Error("--resolve-alias <string>=<string>");
		}
		ensureObject(options, "resolve");
		ensureObject(options.resolve, "alias");
		options.resolve.alias[name] = value;
	});

	ifArg("resolve-loader-alias", function(name, value) {
		if (!name) {
			throw new Error("--resolve-loader-alias <string>=<string>");
		}
		ensureObject(options, "resolveLoader");
		ensureObject(options.resolveLoader, "alias");
		options.resolveLoader.alias[name] = value;
	});

	ifArg("resolve-extensions", function(value) {
		ensureObject(options, "resolve");
		if (Array.isArray(value)) {
			options.resolve.extensions = value;
		} else {
			options.resolve.extensions = value.split(/,\s*/);
		}
	});
}

/**
 * Apply optimize-related overrides from CLI arguments.
 * @param {ProcessedOptions} options - Options object
 */
function applyOptimizeOverrides(options) {
	ifArg("optimize-max-chunks", function(value) {
		ensureArray(options, "plugins");
		var LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
		options.plugins.push(new LimitChunkCountPlugin({
			maxChunks: parseInt(value, 10)
		}));
	});

	ifArg("optimize-min-chunk-size", function(value) {
		ensureArray(options, "plugins");
		var MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
		options.plugins.push(new MinChunkSizePlugin({
			minChunkSize: parseInt(value, 10)
		}));
	});

	ifBooleanArg("optimize-minimize", function() {
		ensureArray(options, "plugins");
		var UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
		var LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
		options.plugins.push(new UglifyJsPlugin({
			sourceMap: options.devtool && (options.devtool.indexOf("sourcemap") >= 0 || options.devtool.indexOf("source-map") >= 0)
		}));
		options.plugins.push(new LoaderOptionsPlugin({
			minimize: true
		}));
	});
}

/**
 * Apply plugin-related overrides from CLI arguments.
 * @param {ProcessedOptions} options - Options object
 */
function applyPluginOverrides(options) {
	ifArg("prefetch", function(request) {
		ensureArray(options, "plugins");
		var PrefetchPlugin = require("../lib/PrefetchPlugin");
		options.plugins.push(new PrefetchPlugin(request));
	});

	ifArg("provide", function(value) {
		ensureArray(options, "plugins");
		var idx = value.indexOf("=");
		var name;
		if (idx >= 0) {
			name = value.substr(0, idx);
			value = value.substr(idx + 1);
		} else {
			name = value;
		}
		var ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, value));
	});

	ifArg("plugin", function(value) {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(value));
	});

	ifBooleanArg("hot", function() {
		ensureArray(options, "plugins");
		var HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
		options.plugins.push(new HotModuleReplacementPlugin());
	});

	ifBooleanArg("debug", function() {
		ensureArray(options, "plugins");
		var LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
		options.plugins.push(new LoaderOptionsPlugin({
			debug: true
		}));
	});

	ifBooleanArg("cache");
	ifBooleanArg("bail");
	ifBooleanArg("profile");
}

/**
 * Apply entry-related overrides from CLI arguments.
 * @param {ProcessedOptions} options - Options object
 */
function applyEntryOverrides(options) {
	ifArgPair("entry", function(name, entry) {
		if (typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
			options.entry[name] = [].concat(options.entry[name]).concat(entry);
		} else {
			options.entry[name] = entry;
		}
	}, function() {
		ensureObject(options, "entry");
	});

	if (argv._.length > 0) {
		if (Array.isArray(options.entry) || typeof options.entry === "string") {
			options.entry = {
				main: options.entry
			};
		}
		ensureObject(options, "entry");

		var addTo = function addTo(name, entry) {
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
			var i = content.indexOf("=");
			var j = content.indexOf("?");
			if (i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(content);
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

/**
 * Load a plugin from the given name.
 * @param {string} name - Plugin name
 * @returns {Object} Plugin instance
 */
function loadPlugin(name) {
	var loadUtils = require("loader-utils");
	var args;
	try {
		var p = name && name.indexOf("?");
		if (p > -1) {
			args = loadUtils.parseQuery(name.substring(p));
			name = name.substring(0, p);
		}
	} catch (e) {
		console.log("Invalid plugin arguments " + name + " (" + e + ").");
		process.exit(-1); // eslint-disable-line
	}

	var path;
	try {
		var resolve = require("enhanced-resolve");
		path = resolve.sync(process.cwd(), name);
	} catch (e) {
		console.log("Cannot resolve plugin " + name + ".");
		process.exit(-1); // eslint-disable-line
	}
	var Plugin;
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
 * Ensure an object exists on the parent object.
 * @param {Object} parent - Parent object
 * @param {string} name - Property name
 */
function ensureObject(parent, name) {
	if (typeof parent[name] !== "object" || parent[name] === null) {
		parent[name] = {};
	}
}

/**
 * Ensure an array exists on the parent object.
 * @param {Object} parent - Parent object
 * @param {string} name - Property name
 */
function ensureArray(parent, name) {
	if (!Array.isArray(parent[name])) {
		parent[name] = [];
	}
}

/**
 * Process a single option object.
 * @param {ProcessedOptions} options - Options object to process
 */
function processOptions(options) {
	var noOutputFilenameDefined = !options.output || !options.output.filename;

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
		var DefinePlugin = require("../lib/DefinePlugin");
		options.plugins.push(new DefinePlugin(defineObject));
	});

	ifArg("target", function(value) {
		options.target = value;
	});

	mapArgToBoolean("cache");

	ifArg("devtool", function(value) {
		options.devtool = value;
	});

	bindLoaders("module-bind", "loaders");
	bindLoaders("module-bind-pre", "preLoaders");
	bindLoaders("module-bind-post", "postLoaders");

	ifArg("records-input-path", function(value) {
		options.recordsInputPath = path.resolve(value);
	});

	ifArg("records-output-path", function(value) {
		options.recordsOutputPath = path.resolve(value);
	});

	ifArg("records-path", function(value) {
		options.recordsPath = path.resolve(value);
	});
}

/**
 * Bind loaders from CLI arguments.
 * @param {string} arg - Argument name
 * @param {string} collection - Collection name (loaders, preLoaders, postLoaders)
 */
function bindLoaders(arg, collection) {
	ifArgPair(arg, function(name, binding) {
		if (name === null) {
			name = binding;
			binding += "-loader";
		}
		options.module[collection].push({
			test: new RegExp("\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
			loader: binding
		});
	}, function() {
		ensureObject(options, "module");
		ensureArray(options.module, collection);
	});
}

/**
 * Process a single argument from argv.
 * @param {string} name - Argument name
 * @param {Function} fn - Function to call with the argument value
 * @param {Function} [init] - Function to call before processing
 * @param {Function} [finalize] - Function to call after processing
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
 * Process a pair argument (name=value format).
 * @param {string} name - Argument name
 * @param {Function} fn - Function to call with the argument value
 * @param {Function} [init] - Function to call before processing
 * @param {Function} [finalize] - Function to call after processing
 */
function ifArgPair(name, fn, init, finalize) {
	ifArg(name, function(content, idx) {
		var i = content.indexOf("=");
		if (i < 0) {
			return fn(null, content, idx);
		} else {
			return fn(content.substr(0, i), content.substr(i + 1), idx);
		}
	}, init, finalize);
}

/**
 * Process a boolean argument from argv.
 * @param {string} name - Argument name
 * @param {Function} fn - Function to call if the argument is true
 */
function ifBooleanArg(name, fn) {
	ifArg(name, function(bool) {
		if (bool) {
			fn();
		}
	});
}

/**
 * Map an argument to a boolean option.
 * @param {string} name - Argument name
 * @param {string} optionName - Option name (defaults to argument name)
 */
function mapArgToBoolean(name, optionName) {
	ifArg(name, function(bool) {
		if (bool === true) {
			options[optionName || name] = true;
		} else if (bool === false) {
			options[optionName || name] = false;
		}
	});
}
```