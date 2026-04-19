```javascript
var path = require("path");
var fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
var interpret = require("interpret");

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
 * Converts command line arguments into webpack configuration options.
 * @param {Object} yargs - Yargs instance
 * @param {Object} argv - Command line arguments
 * @param {ConvertOptions} [convertOptions] - Additional conversion options
 * @returns {Object} Processed webpack configuration options
 */
module.exports = function(yargs, argv, convertOptions) {
	var options = [];

	// Handle debug flag
	if (argv.d) {
		argv.debug = true;
		argv["output-pathinfo"] = true;
		if (!argv.devtool) {
			argv.devtool = "eval-cheap-module-source-map";
		}
	}

	// Handle production flag
	if (argv.p) {
		argv["optimize-minimize"] = true;
		argv["define"] = [].concat(argv["define"] || []).concat("process.env.NODE_ENV=\"production\"");
	}

	// Load configuration files
	var configFiles = loadConfigFiles(argv, extensions);
	var configFileLoaded = configFiles.length > 0;

	if (configFileLoaded) {
		options = loadConfigOptions(configFiles);
	}

	// Process configuration
	if (!configFileLoaded) {
		return processConfiguredOptions({});
	} else if (options.length === 1) {
		return processConfiguredOptions(options[0]);
	} else {
		return processConfiguredOptions(options);
	}
};

/**
 * @typedef {Object} ExtensionInfo
 * @property {string} path
 * @property {string} ext
 */

/**
 * @typedef {Array<ExtensionInfo>} DefaultConfigFiles
 */

/**
 * @typedef {Array<ExtensionInfo>} ConfigFiles
 */

/**
 * @typedef {Array<string>} Extensions
 */

/**
 * @param {Object} argv - Command line arguments
 * @param {Extensions} extensions - File extensions to check
 * @returns {ConfigFiles} Array of configuration file paths
 */
function loadConfigFiles(argv, extensions) {
	var configFiles = [];
	var defaultConfigFiles = getDefaultConfigFiles(extensions);

	if (argv.config) {
		configFiles = mapConfigArgs(argv.config, extensions);
	} else {
		configFiles = findDefaultConfigFiles(defaultConfigFiles);
	}

	return configFiles;
}

/**
 * @param {Extensions} extensions - File extensions to check
 * @returns {DefaultConfigFiles} Array of default configuration file paths
 */
function getDefaultConfigFiles(extensions) {
	var defaultConfigFiles = ["webpack.config", "webpackfile"].map(function(filename) {
		return extensions.map(function(ext) {
			return {
				path: path.resolve(filename + ext),
				ext: ext
			};
		});
	}).reduce(function(a, i) {
		return a.concat(i);
	}, []);

	return defaultConfigFiles;
}

/**
 * @param {Array<string>|string} configArgList - Configuration argument list
 * @param {Extensions} extensions - File extensions to check
 * @returns {ConfigFiles} Array of configuration file paths
 */
function mapConfigArgs(configArgList, extensions) {
	var configArgList = Array.isArray(configArgList) ? configArgList : [configArgList];
	var configFiles = configArgList.map(mapConfigArg);
	return configFiles;
}

/**
 * @param {string} configArg - Configuration argument
 * @param {Extensions} extensions - File extensions to check
 * @returns {ExtensionInfo} Configuration file information
 */
function mapConfigArg(configArg, extensions) {
	var resolvedPath = path.resolve(configArg);
	var extension = getConfigExtension(resolvedPath, extensions);
	return {
		path: resolvedPath,
		ext: extension
	};
}

/**
 * @param {string} configPath - Configuration file path
 * @param {Extensions} extensions - File extensions to check
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
 * @param {DefaultConfigFiles} defaultConfigFiles - Default configuration files
 * @returns {ConfigFiles} Array of found configuration files
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
 * @param {ConfigFiles} configFiles - Configuration files
 * @returns {Array<Object>} Array of configuration options
 */
function loadConfigOptions(configFiles) {
	var options = [];

	configFiles.forEach(function(file) {
		registerCompiler(interpret.extensions[file.ext]);
		options.push(requireConfig(file.path));
	});

	return options;
}

/**
 * @param {string} moduleDescriptor - Module descriptor
 */
function registerCompiler(moduleDescriptor) {
	if (moduleDescriptor) {
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
}

/**
 * @param {string} configPath - Configuration file path
 * @returns {Object} Configuration options
 */
function requireConfig(configPath) {
	var options = require(configPath);
	var isES6DefaultExportedFunc = isES6DefaultExportedFunc(options);

	if (typeof options === "function" || isES6DefaultExportedFunc) {
		options = isES6DefaultExportedFunc ? options.default : options;
		options = options(argv.env, argv);
	}

	return options;
}

/**
 * @param {Object} options - Configuration options
 * @returns {boolean} True if options is an ES6 default exported function
 */
function isES6DefaultExportedFunc(options) {
	return (
		typeof options === "object" &&
		options !== null &&
		typeof options.default === "function"
	);
}

/**
 * @param {Object} options - Configuration options
 * @returns {Object} Processed configuration options
 */
function processConfiguredOptions(options) {
	if (!isValidConfig(options)) {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1); // eslint-disable-line
	}

	// Process Promise
	if (isPromise(options)) {
		return options.then(processConfiguredOptions);
	}

	// Process ES6 default
	if (isES6DefaultExported(options)) {
		return processConfiguredOptions(options.default);
	}

	if (isArray(options)) {
		options.forEach(processOptions);
	} else {
		processOptions(options);
	}

	applyContext(options);
	applyWatchOptions(options);

	return options;
}

/**
 * @param {Object} options - Configuration options
 * @returns {boolean} True if options is valid
 */
function isValidConfig(options) {
	return options !== null && typeof options === "object";
}

/**
 * @param {Object} options - Configuration options
 * @returns {boolean} True if options is a Promise
 */
function isPromise(options) {
	return typeof options.then === "function";
}

/**
 * @param {Object} options - Configuration options
 * @returns {boolean} True if options has ES6 default export
 */
function isES6DefaultExported(options) {
	return typeof options === "object" && typeof options.default === "object";
}

/**
 * @param {Object} options - Configuration options
 */
function applyContext(options) {
	if (argv.context) {
		options.context = path.resolve(argv.context);
	}

	if (!options.context) {
		options.context = process.cwd();
	}
}

/**
 * @param {Object} options - Configuration options
 */
function applyWatchOptions(options) {
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
 * @param {Object} options - Configuration options
 */
function processOptions(options) {
	var noOutputFilenameDefined = !options.output || !options.output.filename;

	ifArgPair("entry", function(name, entry) {
		if (hasEntry(name, options)) {
			options.entry[name] = [].concat(options.entry[name]).concat(entry);
		} else {
			options.entry[name] = entry;
		}
	}, function() {
		ensureObject(options, "entry");
	});

	bindLoaders("module-bind", "loaders");
	bindLoaders("module-bind-pre", "preLoaders");
	bindLoaders("module-bind-post", "postLoaders");

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

	ifArg("devtool", function(value) {
		options.devtool = value;
	});

	processResolveAlias("resolve-alias", "resolve");
	processResolveAlias("resolve-loader-alias", "resolveLoader");

	ifArg("resolve-extensions", function(value) {
		ensureObject(options, "resolve");
		if (isArray(value)) {
			options.resolve.extensions = value;
		} else {
			options.resolve.extensions = value.split(/,\s*/);
		}
	});

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
			sourceMap: isDevtoolWithSourceMap(options.devtool)
		}));
		options.plugins.push(new LoaderOptionsPlugin({
			minimize: true
		}));
	});

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

	mapArgToBoolean("bail");
	mapArgToBoolean("profile");

	applyOutputFilename(options, noOutputFilenameDefined);

	if (argv._.length > 0) {
		applyEntryFromArgs(options);
	}

	if (!hasEntry(options)) {
		applyEntryError(options, configFileLoaded);
	}
}

/**
 * @param {string} name - Entry name
 * @param {Object} options - Configuration options
 * @returns {boolean} True if entry is already defined
 */
function hasEntry(name, options) {
	return typeof options.entry[name] !== "undefined" && options.entry[name] !== null;
}

/**
 * @param {Object} options - Configuration options
 * @returns {boolean} True if entry is defined
 */
function hasEntry(options) {
	return options.entry !== undefined && options.entry !== null;
}

/**
 * @param {string} arg - Argument name
 * @param {Function} fn - Function to call
 * @param {Function} [init] - Initialization function
 * @param {Function} [finalize] - Finalization function
 */
function ifArg(arg, fn, init, finalize) {
	if (isArrayArg(arg)) {
		if (init) {
			init();
		}
		argv[arg].forEach(fn);
		if (finalize) {
			finalize();
		}
	} else if (hasArgValue(arg)) {
		if (init) {
			init();
		}
		fn(argv[arg], -1);
		if (finalize) {
			finalize();
		}
	}
}

/**
 * @param {string} arg - Argument name
 * @param {Function} fn - Function to call
 * @param {Function} [init] - Initialization function
 * @param {Function} [finalize] - Finalization function
 */
function ifArgPair(arg, fn, init, finalize) {
	ifArg(arg, function(content, idx) {
		var i = content.indexOf("=");
		if (i < 0) {
			return fn(null, content, idx);
		} else {
			return fn(content.substr(0, i), content.substr(i + 1), idx);
		}
	}, init, finalize);
}

/**
 * @param {string} name - Argument name
 * @param {Function} fn - Function to call
 */
function ifBooleanArg(name, fn) {
	ifArg(name, function(bool) {
		if (bool) {
			fn();
		}
	});
}

/**
 * @param {string} name - Argument name
 * @param {string} optionName - Option name
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
 * @param {string} arg - Argument name
 * @param {string} key - Key name
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

/**
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

/**
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
 * @param {Object} parent - Parent object
 * @param {string} name - Property name
 */
function ensureObject(parent, name) {
	if (typeof parent[name] !== "object" || parent[name] === null) {
		parent[name] = {};
	}
}

/**
 * @param {Object} parent - Parent object
 * @param {string} name - Property name
 */
function ensureArray(parent, name) {
	if (!Array.isArray(parent[name])) {
		parent[name] = [];
	}
}

/**
 * @param {Object} options - Configuration options
 * @param {boolean} noOutputFilenameDefined - Whether output filename is defined
 */
function applyOutputFilename(options, noOutputFilenameDefined) {
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
 * @param {Object} options - Configuration options
 */
function applyEntryFromArgs(options) {
	if (isArrayEntry(options) || isStringEntry(options)) {
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

/**
 * @param {Object} options - Configuration options
 * @param {boolean} configFileLoaded - Whether config file was loaded
 */
function applyEntryError(options, configFileLoaded) {
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

/**
 * @param {string} content - Content string
 * @returns {boolean} True if content is an array argument
 */
function isArrayArg(content) {
	return Array.isArray(argv[content]);
}

/**
 * @param {string} name - Argument name
 * @returns {boolean} True if argument has a value
 */
function hasArgValue(name) {
	return typeof argv[name] !== "undefined" && argv[name] !== null;
}

/**
 * @param {Object} options - Configuration options
 * @returns {boolean} True if entry is an array
 */
function isArrayEntry(options) {
	return Array.isArray(options.entry);
}

/**
 * @param {Object} options - Configuration options
 * @returns {boolean} True if entry is a string
 */
function isStringEntry(options) {
	return typeof options.entry === "string";
}

/**
 * @param {string} devtool - Devtool value
 * @returns {boolean} True if devtool includes sourcemap
 */
function isDevtoolWithSourceMap(devtool) {
	return devtool && (devtool.indexOf("sourcemap") >= 0 || devtool.indexOf("source-map") >= 0);
}
```