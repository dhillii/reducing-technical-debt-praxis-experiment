const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

/**
 * Main entry point for converting CLI arguments to webpack configuration.
 * @param {object} yargs
 * @param {object} argv
 * @param {object} convertOptions
 * @returns {object|Promise}
 */
module.exports = function (yargs, argv, convertOptions) {
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
		argv.define = ([]).concat(argv.define || []).concat('process.env.NODE_ENV="production"');
	}

	const extensions = Object.keys(interpret.extensions).sort((a, b) => {
		return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
	});

	const defaultConfigFiles = ["webpack.config", "webpackfile"]
		.map((filename) => extensions.map((ext) => ({ path: path.resolve(filename + ext), ext })))
		.reduce((a, i) => a.concat(i), []);

	let configFiles = [];

	if (argv.config) {
		configFiles = getConfigFilesFromArg(argv.config, extensions);
	} else {
		configFiles = getFirstExistingConfig(defaultConfigFiles);
	}

	if (configFiles.length > 0) {
		loadAndRegisterCompilers(configFiles);
	}

	const configFileLoaded = configFiles.length > 0;

	if (!configFileLoaded) return processConfiguredOptions({});
	if (options.length === 1) return processConfiguredOptions(options[0]);
	return processConfiguredOptions(options);
};

/**
 * Resolve configuration files from CLI argument.
 * @param {string|string[]} configArg
 * @param {string[]} extensions
 * @returns {{path:string,ext:string}[]}
 */
function getConfigFilesFromArg(configArg, extensions) {
	const configArgList = Array.isArray(configArg) ? configArg : [configArg];
	return configArgList.map((arg) => mapConfigArg(arg, extensions));
}

/**
 * Map a single config argument to its resolved path and extension.
 * @param {string} configArg
 * @param {string[]} extensions
 * @returns {{path:string,ext:string}}
 */
function mapConfigArg(configArg, extensions) {
	const resolvedPath = path.resolve(configArg);
	const extension = getConfigExtension(resolvedPath, extensions);
	return { path: resolvedPath, ext: extension };
}

/**
 * Determine the file extension for a config path.
 * @param {string} configPath
 * @param {string[]} extensions
 * @returns {string}
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

/**
 * Find the first existing default config file.
 * @param {{path:string,ext:string}[]} defaultFiles
 * @returns {{path:string,ext:string}[]}
 */
function getFirstExistingConfig(defaultFiles) {
	for (let i = 0; i < defaultFiles.length; i++) {
		const cfg = defaultFiles[i];
		if (fs.existsSync(cfg.path)) {
			return [{ path: cfg.path, ext: cfg.ext }];
		}
	}
	return [];
}

/**
 * Load configuration files and register required compilers.
 * @param {{path:string,ext:string}[]} configFiles
 */
function loadAndRegisterCompilers(configFiles) {
	configFiles.forEach((file) => {
		registerCompiler(interpret.extensions[file.ext]);
		options.push(requireConfig(file.path));
	});
}

/**
 * Register a compiler based on the module descriptor.
 * @param {any} moduleDescriptor
 */
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
			} catch (e) {
				// ignore and try next
			}
		}
	}
}

/**
 * Require a configuration file, handling ES6 default exports and functions.
 * @param {string} configPath
 * @returns {object}
 */
function requireConfig(configPath) {
	const raw = require(configPath);
	const isES6DefaultExportedFunc = typeof raw === "object" && raw !== null && typeof raw.default === "function";
	if (typeof raw === "function" || isES6DefaultExportedFunc) {
		const fn = isES6DefaultExportedFunc ? raw.default : raw;
		return fn(argv.env, argv);
	}
	return raw;
}

/**
 * Process the loaded configuration options.
 * @param {object|object[]} options
 * @returns {object}
 */
function processConfiguredOptions(options) {
	if (options === null || typeof options !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1);
	}
	if (typeof options.then === "function") {
		return options.then(processConfiguredOptions);
	}
	if (typeof options === "object" && typeof options.default === "object") {
		return processConfiguredOptions(options.default);
	}
	if (Array.isArray(options)) {
		options.forEach(processOptions);
	} else {
		processOptions(options);
	}
	applyContextOption(options);
	applyWatchOptions(options);
	return options;
}

/**
 * Apply context related options.
 * @param {object} options
 */
function applyContextOption(options) {
	if (argv.context) {
		options.context = path.resolve(argv.context);
	}
	if (!options.context) {
		options.context = process.cwd();
	}
}

/**
 * Apply watch related options.
 * @param {object} options
 */
function applyWatchOptions(options) {
	if (argv.watch) options.watch = true;
	if (argv["watch-aggregate-timeout"]) {
		options.watchOptions = options.watchOptions || {};
		options.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
	}
	if (argv["watch-poll"]) {
		options.watchOptions = options.watchOptions || {};
		options.watchOptions.poll = typeof argv["watch-poll"] !== "boolean" ? +argv["watch-poll"] : true;
	}
	if (argv["watch-stdin"]) {
		options.watchOptions = options.watchOptions || {};
		options.watchOptions.stdin = true;
		options.watch = true;
	}
}

/**
 * Process a single configuration object.
 * @param {object} options
 */
function processOptions(options) {
	const noOutputFilenameDefined = !options.output || !options.output.filename;

	ifArgPair("entry", (name, entry) => {
		if (options.entry && options.entry[name] != null) {
			options.entry[name] = ([]).concat(options.entry[name]).concat(entry);
		} else {
			options.entry[name] = entry;
		}
	}, () => ensureObject(options, "entry"));

	bindLoaders("module-bind", "loaders");
	bindLoaders("module-bind-pre", "preLoaders");
	bindLoaders("module-bind-post", "postLoaders");

	handleDefineOption();

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
		options.plugins.push(new LoaderOptionsPlugin({ debug: true }));
	});

	ifArg("devtool", (value) => {
		options.devtool = value;
	});

	processResolveAlias("resolve-alias", "resolve");
	processResolveAlias("resolve-loader-alias", "resolveLoader");

	ifArg("resolve-extensions", (value) => {
		ensureObject(options, "resolve");
		options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
	});

	ifArg("optimize-max-chunks", (value) => {
		ensureArray(options, "plugins");
		const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
		options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
	});

	ifArg("optimize-min-chunk-size", (value) => {
		ensureArray(options, "plugins");
		const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
		options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
	});

	ifBooleanArg("optimize-minimize", () => {
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

	ifArg("prefetch", (request) => {
		ensureArray(options, "plugins");
		const PrefetchPlugin = require("../lib/PrefetchPlugin");
		options.plugins.push(new PrefetchPlugin(request));
	});

	ifArg("provide", (value) => {
		ensureArray(options, "plugins");
		const idx = value.indexOf("=");
		const name = idx >= 0 ? value.substring(0, idx) : value;
		const val = idx >= 0 ? value.substring(idx + 1) : value;
		const ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, val));
	});

	ifArg("plugin", (value) => {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(value));
	});

	mapArgToBoolean("bail");
	mapArgToBoolean("profile");

	handleMissingOutputFilename(noOutputFilenameDefined, options, convertOptions, configFileLoaded);

	handleRemainingEntries(options);
}

/**
 * Bind loaders based on CLI arguments.
 * @param {string} arg
 * @param {string} collection
 */
function bindLoaders(arg, collection) {
	ifArgPair(arg, (name, binding) => {
		if (name === null) {
			name = binding;
			binding += "-loader";
		}
		ensureObject(options, "module");
		ensureArray(options.module, collection);
		options.module[collection].push({
			test: new RegExp("\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
			loader: binding,
		});
	}, () => {
		ensureObject(options, "module");
		ensureArray(options.module, collection);
	});
}

/**
 * Process --define argument.
 */
function handleDefineOption() {
	let defineObject;
	ifArgPair(
		"define",
		(name, value) => {
			if (name === null) {
				name = value;
				value = true;
			}
			defineObject[name] = value;
		},
		() => {
			defineObject = {};
		},
		() => {
			ensureArray(options, "plugins");
			const DefinePlugin = require("../lib/DefinePlugin");
			options.plugins.push(new DefinePlugin(defineObject));
		}
	);
}

/**
 * Process resolve alias arguments.
 * @param {string} arg
 * @param {string} key
 */
function processResolveAlias(arg, key) {
	ifArgPair(arg, (name, value) => {
		if (!name) throw new Error(`--${arg} <string>=<string>`);
		ensureObject(options, key);
		ensureObject(options[key], "alias");
		options[key].alias[name] = value;
	});
}

/**
 * Handle missing output filename scenario.
 * @param {boolean} missing
 * @param {object} options
 * @param {object} convertOptions
 * @param {boolean} configFileLoaded
 */
function handleMissingOutputFilename(missing, options, convertOptions, configFileLoaded) {
	if (!missing) return;
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

/**
 * Handle remaining CLI entry arguments.
 * @param {object} options
 */
function handleRemainingEntries(options) {
	if (argv._.length === 0) return;
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
			addTo(content.substring(0, i), content.substring(i + 1));
		}
	});

	if (!options.entry) {
		if (configFileLoaded) {
			console.error("Configuration file found but no entry configured.");
		} else {
			console.error("No configuration file found and no entry configured via CLI option.");
			console.error("When using the CLI you need to provide at least two arguments: entry and output.");
			console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
		}
		console.error("Use --help to display the CLI options.");
		process.exit(-1);
	}
}

/**
 * Generic helper to process an argument that may be an array or single value.
 * @param {string} name
 * @param {function} fn
 * @param {function} [init]
 * @param {function} [finalize]
 */
function ifArg(name, fn, init, finalize) {
	if (Array.isArray(argv[name])) {
		if (init) init();
		argv[name].forEach(fn);
		if (finalize) finalize();
	} else if (argv[name] != null) {
		if (init) init();
		fn(argv[name], -1);
		if (finalize) finalize();
	}
}

/**
 * Helper for processing name=value pairs.
 * @param {string} name
 * @param {function} fn
 * @param {function} [init]
 * @param {function} [finalize]
 */
function ifArgPair(name, fn, init, finalize) {
	ifArg(name, (content, idx) => {
		const i = content.indexOf("=");
		if (i < 0) {
			return fn(null, content, idx);
		}
		return fn(content.substring(0, i), content.substring(i + 1), idx);
	}, init, finalize);
}

/**
 * Helper for boolean arguments.
 * @param {string} name
 * @param {function} fn
 */
function ifBooleanArg(name, fn) {
	ifArg(name, (bool) => {
		if (bool) fn();
	});
}

/**
 * Map an argument to a boolean option on the configuration.
 * @param {string} name
 * @param {string} [optionName]
 */
function mapArgToBoolean(name, optionName) {
	ifArg(name, (bool) => {
		if (bool === true) options[optionName || name] = true;
		else if (bool === false) options[optionName || name] = false;
	});
}

/**
 * Load a plugin by name, handling query parameters.
 * @param {string} name
 * @returns {object}
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
 * Ensure a property on an object is an object.
 * @param {object} parent
 * @param {string} name
 */
function ensureObject(parent, name) {
	if (typeof parent[name] !== "object" || parent[name] === null) {
		parent[name] = {};
	}
}

/**
 * Ensure a property on an object is an array.
 * @param {object} parent
 * @param {string} name
 */
function ensureArray(parent, name) {
	if (!Array.isArray(parent[name])) {
		parent[name] = [];
	}
}