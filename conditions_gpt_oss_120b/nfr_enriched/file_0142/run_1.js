const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

/**
 * Main entry point for converting CLI arguments to webpack configuration.
 */
module.exports = function (yargs, argv, convertOptions) {
	const options = [];

	handleShortcuts(argv);
	const extensions = getSortedExtensions(interpret.extensions);
	const configFiles = resolveConfigFiles(argv, extensions);
	const configFileLoaded = loadConfigFiles(configFiles, options, argv, extensions);

	if (!configFileLoaded) {
		return processConfiguredOptions({}, argv, convertOptions);
	}
	if (options.length === 1) {
		return processConfiguredOptions(options[0], argv, convertOptions);
	}
	return processConfiguredOptions(options, argv, convertOptions);
};

/**
 * Apply shortcut flags (e.g., -d, -p) to argv.
 */
function handleShortcuts(argv) {
	if (argv.d) {
		argv.debug = true;
		argv["output-pathinfo"] = true;
		if (!argv.devtool) {
			argv.devtool = "eval-cheap-module-source-map";
		}
	}
	if (argv.p) {
		argv["optimize-minimize"] = true;
		argv.define = [].concat(argv.define || []).concat('process.env.NODE_ENV="production"');
	}
}

/**
 * Return sorted list of file extensions, preferring .js.
 */
function getSortedExtensions(extMap) {
	return Object.keys(extMap).sort((a, b) => {
		if (a === ".js") return -1;
		if (b === ".js") return 1;
		return a.length - b.length;
	});
}

/**
 * Resolve configuration files based on argv or defaults.
 */
function resolveConfigFiles(argv, extensions) {
	const defaultConfigFiles = ["webpack.config", "webpackfile"]
		.map((filename) =>
			extensions.map((ext) => ({
				path: path.resolve(filename + ext),
				ext,
			}))
		)
		.reduce((a, i) => a.concat(i), []);

	if (argv.config) {
		const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
		return configArgList.map((configArg) => mapConfigArg(configArg, extensions));
	}

	for (let i = 0; i < defaultConfigFiles.length; i++) {
		const cfg = defaultConfigFiles[i];
		if (fs.existsSync(cfg.path)) {
			return [{ path: cfg.path, ext: cfg.ext }];
		}
	}
	return [];
}

/**
 * Map a config argument to its resolved path and extension.
 */
function mapConfigArg(configArg, extensions) {
	const resolvedPath = path.resolve(configArg);
	const extension = getConfigExtension(resolvedPath, extensions);
	return { path: resolvedPath, ext: extension };
}

/**
 * Determine the file extension for a given config path.
 */
function getConfigExtension(configPath, extensions) {
	for (let i = extensions.length - 1; i >= 0; i--) {
		const ext = extensions[i];
		if (configPath.endsWith(ext)) {
			return ext;
		}
	}
	return path.extname(configPath);
}

/**
 * Load configuration files, register compilers, and push options.
 */
function loadConfigFiles(configFiles, options, argv, extensions) {
	if (configFiles.length === 0) return false;

	for (const file of configFiles) {
		registerCompiler(interpret.extensions[file.ext]);
		options.push(requireConfig(file.path, argv));
	}
	return true;
}

/**
 * Register a compiler based on the module descriptor.
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
				// ignore and try next
			}
		}
	}
}

/**
 * Require a configuration file and evaluate if it exports a function.
 */
function requireConfig(configPath, argv) {
	let exported = require(configPath);
	const isES6DefaultFunc =
		typeof exported === "object" && exported !== null && typeof exported.default === "function";

	if (typeof exported === "function" || isES6DefaultFunc) {
		exported = isES6DefaultFunc ? exported.default : exported;
		exported = exported(argv.env, argv);
	}
	return exported;
}

/**
 * Process the final configuration options (may be object, array, or promise).
 */
function processConfiguredOptions(opts, argv, convertOptions) {
	if (opts === null || typeof opts !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1);
	}

	if (typeof opts.then === "function") {
		return opts.then((resolved) => processConfiguredOptions(resolved, argv, convertOptions));
	}
	if (typeof opts === "object" && typeof opts.default === "object") {
		return processConfiguredOptions(opts.default, argv, convertOptions);
	}
	if (Array.isArray(opts)) {
		opts.forEach((opt) => processOptions(opt, argv));
	} else {
		processOptions(opts, argv);
	}

	applyContext(opts, argv);
	applyWatchOptions(opts, argv);
	applyOutputDefaults(opts, argv, convertOptions);
	return opts;
}

/**
 * Apply context-related settings.
 */
function applyContext(options, argv) {
	if (argv.context) {
		options.context = path.resolve(argv.context);
	}
	if (!options.context) {
		options.context = process.cwd();
	}
}

/**
 * Apply watch-related flags.
 */
function applyWatchOptions(options, argv) {
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
 * Ensure output filename is defined, using CLI or convertOptions as fallback.
 */
function applyOutputDefaults(options, argv, convertOptions) {
	const noOutputFilenameDefined = !options.output || !options.output.filename;
	if (!noOutputFilenameDefined) return;

	ensureObject(options, "output");
	if (convertOptions && convertOptions.outputFilename) {
		options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
		options.output.filename = path.basename(convertOptions.outputFilename);
	} else if (argv._.length > 0) {
		options.output.filename = argv._.pop();
		options.output.path = path.resolve(path.dirname(options.output.filename));
		options.output.filename = path.basename(options.output.filename);
	} else if (argv.config) {
		throw new Error("'output.filename' is required, either in config file or as --output-filename");
	} else {
		console.error("No configuration file found and no output filename configured via CLI option.");
		console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
		console.error("Use --help to display the CLI options.");
		process.exit(-1);
	}
}

/**
 * Process a single configuration object based on CLI arguments.
 */
function processOptions(options, argv) {
	const noOutputFilenameDefined = !options.output || !options.output.filename;

	ifArgPair(argv, "entry", (name, entry) => {
		if (options.entry && options.entry[name] !== undefined) {
			options.entry[name] = [].concat(options.entry[name]).concat(entry);
		} else {
			ensureObject(options, "entry");
			options.entry[name] = entry;
		}
	});

	bindLoaders(argv, options, "module-bind", "loaders");
	bindLoaders(argv, options, "module-bind-pre", "preLoaders");
	bindLoaders(argv, options, "module-bind-post", "postLoaders");

	handleDefine(argv, options);
	handleOutputOptions(argv, options);
	handleBooleanFlags(argv, options);
	handlePluginFlags(argv, options);
	handleResolveAliases(argv, options);
	handleOptimizationFlags(argv, options);
	handlePrefetchAndProvide(argv, options);
	handleEntryFromArgs(argv, options);
	ensureEntryExists(options, argv);
}

/**
 * Helper to iterate over an argument that may be an array or single value.
 */
function ifArg(argv, name, fn, init, finalize) {
	const value = argv[name];
	if (Array.isArray(value)) {
		if (init) init();
		value.forEach((v, idx) => fn(v, idx));
		if (finalize) finalize();
	} else if (value !== undefined && value !== null) {
		if (init) init();
		fn(value, -1);
		if (finalize) finalize();
	}
}

/**
 * Helper for arguments that are key=value pairs.
 */
function ifArgPair(argv, name, fn, init, finalize) {
	ifArg(argv, name, (content, idx) => {
		const eqIdx = content.indexOf("=");
		if (eqIdx < 0) {
			fn(null, content, idx);
		} else {
			fn(content.substring(0, eqIdx), content.substring(eqIdx + 1), idx);
		}
	}, init, finalize);
}

/**
 * Helper for boolean flags.
 */
function ifBooleanArg(argv, name, fn) {
	ifArg(argv, name, (bool) => {
		if (bool) fn();
	});
}

/**
 * Map an argument directly to a boolean option on the config.
 */
function mapArgToBoolean(argv, name, options, optionName) {
	ifArg(argv, name, (bool) => {
		if (bool === true) options[optionName || name] = true;
		else if (bool === false) options[optionName || name] = false;
	});
}

/**
 * Ensure a property exists as an object.
 */
function ensureObject(parent, name) {
	if (typeof parent[name] !== "object" || parent[name] === null) {
		parent[name] = {};
	}
}

/**
 * Ensure a property exists as an array.
 */
function ensureArray(parent, name) {
	if (!Array.isArray(parent[name])) {
		parent[name] = [];
	}
}

/**
 * Bind loaders based on CLI arguments.
 */
function bindLoaders(argv, options, argName, collection) {
	ifArgPair(argv, argName, (name, binding) => {
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
	});
}

/**
 * Process --define arguments and add DefinePlugin.
 */
function handleDefine(argv, options) {
	let defineObject = null;
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
}

/**
 * Process various output related arguments.
 */
function handleOutputOptions(argv, options) {
	ifArg(argv, "output-path", (value) => {
		ensureObject(options, "output");
		options.output.path = path.resolve(value);
	});
	ifArg(argv, "output-filename", (value) => {
		ensureObject(options, "output");
		options.output.filename = value;
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
}

/**
 * Process boolean flags that map directly to config options.
 */
function handleBooleanFlags(argv, options) {
	mapArgToBoolean(argv, "cache", options);
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
	ifArg(argv, "devtool", (value) => {
		options.devtool = value;
	});
}

/**
 * Load plugins specified via --plugin.
 */
function loadPlugin(name) {
	const loadUtils = require("loader-utils");
	let args;
	try {
		const queryIdx = name && name.indexOf("?");
		if (queryIdx > -1) {
			args = loadUtils.parseQuery(name.substring(queryIdx));
			name = name.substring(0, queryIdx);
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
 * Process plugin related arguments.
 */
function handlePluginFlags(argv, options) {
	ifArg(argv, "plugin", (value) => {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(value));
	});
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
}

/**
 * Process resolve alias arguments.
 */
function handleResolveAliases(argv, options) {
	const processAlias = (arg, key) => {
		ifArgPair(argv, arg, (name, value) => {
			if (!name) throw new Error(`--${arg} <string>=<string>`);
			ensureObject(options, key);
			ensureObject(options[key], "alias");
			options[key].alias[name] = value;
		});
	};
	processAlias("resolve-alias", "resolve");
	processAlias("resolve-loader-alias", "resolveLoader");
	ifArg(argv, "resolve-extensions", (value) => {
		ensureObject(options, "resolve");
		if (Array.isArray(value)) {
			options.resolve.extensions = value;
		} else {
			options.resolve.extensions = value.split(/,\s*/);
		}
	});
}

/**
 * Process optimization related flags.
 */
function handleOptimizationFlags(argv, options) {
	ifArg(argv, "optimize-max-chunks", (value) => {
		ensureArray(options, "plugins");
		const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
		options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
	});
	ifArg(argv, "optimize-min-chunk-size", (value) => {
		ensureArray(options, "plugins");
		const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
		options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
	});
}

/**
 * Process prefetch and provide plugin arguments.
 */
function handlePrefetchAndProvide(argv, options) {
	ifArg(argv, "prefetch", (request) => {
		ensureArray(options, "plugins");
		const PrefetchPlugin = require("../lib/PrefetchPlugin");
		options.plugins.push(new PrefetchPlugin(request));
	});
	ifArg(argv, "provide", (value) => {
		ensureArray(options, "plugins");
		const idx = value.indexOf("=");
		let name, module;
		if (idx >= 0) {
			name = value.substr(0, idx);
			module = value.substr(idx + 1);
		} else {
			name = value;
			module = value;
		}
		const ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, module));
	});
}

/**
 * Handle entry arguments from CLI positional parameters.
 */
function handleEntryFromArgs(argv, options) {
	if (argv._.length === 0) return;
	if (Array.isArray(options.entry) || typeof options.entry === "string") {
		options.entry = { main: options.entry };
	}
	ensureObject(options, "entry");

	const addToEntry = (name, entry) => {
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
		const eqIdx = content.indexOf("=");
		const qIdx = content.indexOf("?");
		if (eqIdx < 0 || (qIdx >= 0 && qIdx < eqIdx)) {
			const resolved = path.resolve(content);
			if (fs.existsSync(resolved)) {
				addToEntry("main", resolved);
			} else {
				addToEntry("main", content);
			}
		} else {
			addToEntry(content.substring(0, eqIdx), content.substring(eqIdx + 1));
		}
	});
}

/**
 * Ensure that an entry point is defined; otherwise exit with an error.
 */
function ensureEntryExists(options, argv) {
	if (!options.entry) {
		if (argv.config) {
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