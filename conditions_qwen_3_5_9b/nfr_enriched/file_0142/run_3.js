```javascript
var path = require("path");
var fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
var interpret = require("interpret");

/**
 * Main entry point for converting command line arguments to webpack configuration.
 * @param {Object} yargs - Yargs instance
 * @param {Object} argv - Command line arguments
 * @param {Object} convertOptions - Conversion options
 * @returns {Object} Webpack configuration object
 */
module.exports = function(yargs, argv, convertOptions) {
	var options = {};
	var configFiles = [];
	var configFileLoaded = false;

	// Apply shortcuts for common flags
	applyShortcuts(argv);

	// Load configuration files
	configFiles = loadConfigFiles(argv, extensions);

	// Process loaded configurations
	if (configFiles.length > 0) {
		configFileLoaded = true;
		options = mergeConfigurations(configFiles);
	}

	// Return processed options
	return processConfiguredOptions(options);
};

/**
 * Apply shortcut flags for common command line options.
 * @param {Object} argv - Command line arguments
 */
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
		argv["define"] = [].concat(argv["define"] || []).concat("process.env.NODE_ENV=\"production\"");
	}
}

/**
 * Get file extensions for supported interpreters, sorted by priority.
 * @returns {Array} Sorted array of file extensions
 */
function getExtensions() {
	return Object.keys(interpret.extensions).sort(function(a, b) {
		return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
	});
}

/**
 * Load configuration files from command line or default locations.
 * @param {Object} argv - Command line arguments
 * @param {Array} extensions - File extensions to search
 * @returns {Array} Array of configuration file objects
 */
function loadConfigFiles(argv, extensions) {
	var configFiles = [];
	var defaultConfigFiles = getDefaultConfigFiles(extensions);

	if (argv.config) {
		configFiles = mapConfigArgs(argv.config, extensions);
	} else {
		configFiles = findDefaultConfigFiles(defaultConfigFiles, extensions);
	}

	return configFiles;
}

/**
 * Get default configuration file names with extensions.
 * @param {Array} extensions - File extensions
 * @returns {Array} Array of default config file objects
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
 * Get file extension from a config path.
 * @param {string} configPath - Path to configuration file
 * @param {Array} extensions - Available extensions
 * @returns {string} File extension
 */
function getConfigExtension(configPath, extensions) {
	for (var i = extensions.length - 1; i >= 0; i--) {
		var tmpExt = extensions[i];
		if (configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1) {
			return tmpExt;
		}
	}
	return path.extname(configPath);
}

/**
 * Map config arguments to file objects with paths and extensions.
 * @param {Array} configArgList - List of config arguments
 * @param {Array} extensions - Available extensions
 * @returns {Array} Array of config file objects
 */
function mapConfigArgs(configArgList, extensions) {
	var mapConfigArg = function mapConfigArg(configArg) {
		var resolvedPath = path.resolve(configArg);
		var extension = getConfigExtension(resolvedPath, extensions);
		return {
			path: resolvedPath,
			ext: extension
		};
	};

	return configArgList.map(mapConfigArg);
}

/**
 * Find default configuration files that exist on the filesystem.
 * @param {Array} defaultConfigFiles - List of default config file objects
 * @param {Array} extensions - Available extensions
 * @returns {Array} Array of existing config file objects
 */
function findDefaultConfigFiles(defaultConfigFiles, extensions) {
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
 * Register compiler for a given module descriptor.
 * @param {Object|string} moduleDescriptor - Module descriptor or string
 */
function registerCompiler(moduleDescriptor) {
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
}

/**
 * Require and process a configuration file.
 * @param {string} configPath - Path to configuration file
 * @returns {Object} Processed configuration object
 */
function requireConfig(configPath) {
	var options = require(configPath);
	var isES6DefaultExportedFunc = (
		typeof options === "object" && options !== null && typeof options.default === "function"
	);

	if (typeof options === "function" || isES6DefaultExportedFunc) {
		options = isES6DefaultExportedFunc ? options.default : options;
		options = options(argv.env, argv);
	}

	return options;
}

/**
 * Merge multiple configuration files into a single options object.
 * @param {Array} configFiles - Array of config file objects
 * @returns {Object} Merged configuration object
 */
function mergeConfigurations(configFiles) {
	var options = [];

	configFiles.forEach(function(file) {
		registerCompiler(interpret.extensions[file.ext]);
		options.push(requireConfig(file.path));
	});

	return options;
}

/**
 * Process configured options and apply CLI overrides.
 * @param {Object} options - Configuration options object
 * @returns {Object} Processed configuration object
 */
function processConfiguredOptions(options) {
	if (options === null || typeof options !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1); // eslint-disable-line
	}

	// Process Promise
	if (typeof options.then === "function") {
		return options.then(processConfiguredOptions);
	}

	// Process ES6 default
	if (typeof options === "object" && typeof options.default === "object") {
		return processConfiguredOptions(options.default);
	}

	// Process array of options
	if (Array.isArray(options)) {
		options.forEach(processOptions);
	} else {
		processOptions(options);
	}

	// Apply CLI context override
	if (argv.context) {
		options.context = path.resolve(argv.context);
	}

	// Set default context
	if (!options.context) {
		options.context = process.cwd();
	}

	// Apply watch mode
	if (argv.watch) {
		options.watch = true;
	}

	// Apply watch aggregate timeout
	if (argv["watch-aggregate-timeout"]) {
		options.watchOptions = options.watchOptions || {};
		options.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
	}

	// Apply watch poll
	if (argv["watch-poll"]) {
		options.watchOptions = options.watchOptions || {};
		if (typeof argv["watch-poll"] !== "boolean") {
			options.watchOptions.poll = +argv["watch-poll"];
		} else {
			options.watchOptions.poll = true;
		}
	}

	// Apply watch stdin
	if (argv["watch-stdin"]) {
		options.watchOptions = options.watchOptions || {};
		options.watchOptions.stdin = true;
		options.watch = true;
	}

	return options;
}

/**
 * Process individual configuration options from CLI arguments.
 * @param {Object} options - Configuration options object
 */
function processOptions(options) {
	var noOutputFilenameDefined = !options.output || !options.output.filename;
	var defineObject = {};

	// Process entry points
	processEntry(options);

	// Process loaders
	processLoaders(options);

	// Process define
	processDefine(options);

	// Process output options
	processOutput(options);

	// Process records
	processRecords(options);

	// Process target
	processTarget(options);

	// Process cache
	processCache(options);

	// Process hot module replacement
	processHot(options);

	// Process debug
	processDebug(options);

	// Process devtool
	processDevtool(options);

	// Process resolve alias
	processResolveAlias(options);

	// Process resolve extensions
	processResolveExtensions(options);

	// Process optimize options
	processOptimize(options);

	// Process prefetch
	processPrefetch(options);

	// Process provide
	processProvide(options);

	// Process plugin
	processPlugin(options);

	// Process bail
	processBail(options);

	// Process profile
	processProfile(options);

	// Handle output filename
	handleOutputFilename(options, noOutputFilenameDefined);

	// Process entry from CLI
	processEntryFromCLI(options);

	// Validate entry
	validateEntry(options);
}

/**
 * Process entry point configuration.
 * @param {Object} options - Configuration options object
 */
function processEntry(options) {
	ifArgPair("entry", function(name, entry) {
		if (typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
			options.entry[name] = [].concat(options.entry[name]).concat(entry);
		} else {
			options.entry[name] = entry;
		}
	}, function() {
		ensureObject(options, "entry");
	});
}

/**
 * Process loader configuration.
 * @param {Object} options - Configuration options object
 */
function processLoaders(options) {
	bindLoaders("module-bind", "loaders");
	bindLoaders("module-bind-pre", "preLoaders");
	bindLoaders("module-bind-post", "postLoaders");
}

/**
 * Process define configuration.
 * @param {Object} options - Configuration options object
 */
function processDefine(options) {
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
}

/**
 * Process output configuration.
 * @param {Object} options - Configuration options object
 */
function processOutput(options) {
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
}

/**
 * Process records configuration.
 * @param {Object} options - Configuration options object
 */
function processRecords(options) {
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
 * Process target configuration.
 * @param {Object} options - Configuration options object
 */
function processTarget(options) {
	ifArg("target", function(value) {
		options.target = value;
	});
}

/**
 * Process cache configuration.
 * @param {Object} options - Configuration options object
 */
function processCache(options) {
	mapArgToBoolean("cache");
}

/**
 * Process hot module replacement.
 * @param {Object} options - Configuration options object
 */
function processHot(options) {
	ifBooleanArg("hot", function() {
		ensureArray(options, "plugins");
		var HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
		options.plugins.push(new HotModuleReplacementPlugin());
	});
}

/**
 * Process debug configuration.
 * @param {Object} options - Configuration options object
 */
function processDebug(options) {
	ifBooleanArg("debug", function() {
		ensureArray(options, "plugins");
		var LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
		options.plugins.push(new LoaderOptionsPlugin({
			debug: true
		}));
	});
}

/**
 * Process devtool configuration.
 * @param {Object} options - Configuration options object
 */
function processDevtool(options) {
	ifArg("devtool", function(value) {
		options.devtool = value;
	});
}

/**
 * Process resolve alias configuration.
 * @param {Object} options - Configuration options object
 */
function processResolveAlias(options) {
	processResolveAliasArg("resolve-alias", "resolve", options);
	processResolveAliasArg("resolve-loader-alias", "resolveLoader", options);
}

/**
 * Process resolve extensions configuration.
 * @param {Object} options - Configuration options object
 */
function processResolveExtensions(options) {
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
 * Process optimize configuration.
 * @param {Object} options - Configuration options object
 */
function processOptimize(options) {
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
 * Process prefetch configuration.
 * @param {Object} options - Configuration options object
 */
function processPrefetch(options) {
	ifArg("prefetch", function(request) {
		ensureArray(options, "plugins");
		var PrefetchPlugin = require("../lib/PrefetchPlugin");
		options.plugins.push(new PrefetchPlugin(request));
	});
}

/**
 * Process provide configuration.
 * @param {Object} options - Configuration options object
 */
function processProvide(options) {
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
}

/**
 * Process plugin configuration.
 * @param {Object} options - Configuration options object
 */
function processPlugin(options) {
	ifArg("plugin", function(value) {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(value));
	});
}

/**
 * Process bail configuration.
 * @param {Object} options - Configuration options object
 */
function processBail(options) {
	mapArgToBoolean("bail");
}

/**
 * Process profile configuration.
 * @param {Object} options - Configuration options object
 */
function processProfile(options) {
	mapArgToBoolean("profile");
}

/**
 * Handle output filename configuration.
 * @param {Object} options - Configuration options object
 * @param {boolean} noOutputFilenameDefined - Whether output filename is defined
 */
function handleOutputFilename(options, noOutputFilenameDefined) {
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
 * Process entry from CLI arguments.
 * @param {Object} options - Configuration options object
 */
function processEntryFromCLI(options) {
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
}

/**
 * Validate entry configuration.
 * @param {Object} options - Configuration options object
 */
function validateEntry(options) {
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
 * Process resolve alias argument.
 * @param {string} arg - Argument name
 * @param {string} key - Key in options object
 * @param {Object} options - Configuration options object
 */
function processResolveAliasArg(arg, key, options) {
	ifArgPair(arg, function(name, value) {
		if (!name) {
			throw new Error("--" + arg + " <string>=<string>");
		}
		ensureObject(options, key);
		ensureObject(options[key], "alias");
		options[key].alias[name] = value;
	});
}

/**
 * Check if argument exists and apply callback.
 * @param {string} name - Argument name
 * @param {Function} fn - Callback function
 * @param {Function} init - Initialization function
 * @param {Function} finalize - Finalization function
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
 * Check if argument exists and apply callback with pair parsing.
 * @param {string} name - Argument name
 * @param {Function} fn - Callback function
 * @param {Function} init - Initialization function
 * @param {Function} finalize - Finalization function
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
 * Check if argument is boolean and apply callback.
 * @param {string} name - Argument name
 * @param {Function} fn - Callback function
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
 * @param {string} name - Argument name
 * @param {string} optionName - Option name in options object
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

/**
 * Load and instantiate a plugin.
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
 * Ensure object exists in parent object.
 * @param {Object} parent - Parent object
 * @param {string} name - Property name
 */
function ensureObject(parent, name) {
	if (typeof parent[name] !== "object" || parent[name] === null) {
		parent[name] = {};
	}
}

/**
 * Ensure array exists in parent object.
 * @param {Object} parent - Parent object
 * @param {string} name - Property name
 */
function ensureArray(parent, name) {
	if (!Array.isArray(parent[name])) {
		parent[name] = [];
	}
}

/**
 * Bind loaders to configuration.
 * @param {string} arg - Argument name
 * @param {string} collection - Collection name
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
```