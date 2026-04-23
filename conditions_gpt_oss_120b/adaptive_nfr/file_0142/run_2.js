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
	const configFiles = resolveConfigFiles(argv);
	let configFileLoaded = false;

	if (configFiles.length > 0) {
		loadCompilersAndConfigs(configFiles, options);
		configFileLoaded = true;
	}

	if (!configFileLoaded) {
		return processConfiguredOptions({}, argv, convertOptions);
	}
	if (options.length === 1) {
		return processConfiguredOptions(options[0], argv, convertOptions);
	}
	return processConfiguredOptions(options, argv, convertOptions);
};

/**
 * Apply shortcut flags to argv.
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
 * Resolve configuration files based on argv or defaults.
 */
function resolveConfigFiles(argv) {
	const extensions = Object.keys(interpret.extensions).sort((a, b) => {
		if (a === ".js") return -1;
		if (b === ".js") return 1;
		return a.length - b.length;
	});

	const defaultConfigFiles = ["webpack.config", "webpackfile"]
		.map((filename) => extensions.map((ext) => ({ path: path.resolve(filename + ext), ext })))
		.reduce((a, i) => a.concat(i), []);

	if (argv.config) {
		return mapConfigArgs(argv.config, extensions);
	}
	return findFirstExistingDefault(defaultConfigFiles);
}

/**
 * Map provided config arguments to absolute paths and extensions.
 */
function mapConfigArgs(configArg, extensions) {
	const configList = Array.isArray(configArg) ? configArg : [configArg];
	return configList.map((arg) => {
		const resolvedPath = path.resolve(arg);
		const ext = getConfigExtension(resolvedPath, extensions);
		return { path: resolvedPath, ext };
	});
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
 * Find the first existing default config file.
 */
function findFirstExistingDefault(defaultFiles) {
	for (let i = 0; i < defaultFiles.length; i++) {
		const cfg = defaultFiles[i];
		if (fs.existsSync(cfg.path)) {
			return [cfg];
		}
	}
	return [];
}

/**
 * Load required compilers and require each config file.
 */
function loadCompilersAndConfigs(configFiles, options) {
	configFiles.forEach((file) => {
		registerCompiler(interpret.extensions[file.ext]);
		options.push(requireConfig(file.path));
	});
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
 * Require a configuration file, handling functions and ES6 default exports.
 */
function requireConfig(configPath) {
	const raw = require(configPath);
	const isES6DefaultFunc =
		typeof raw === "object" && raw !== null && typeof raw.default === "function";

	if (typeof raw === "function" || isES6DefaultFunc) {
		const fn = isES6DefaultFunc ? raw.default : raw;
		return fn(argv.env, argv);
	}
	return raw;
}

/**
 * Process the loaded configuration(s) and merge CLI options.
 */
function processConfiguredOptions(config, argv, convertOptions) {
	if (config === null || typeof config !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1); // eslint-disable-line
	}

	if (typeof config.then === "function") {
		return config.then((resolved) => processConfiguredOptions(resolved, argv, convertOptions));
	}
	if (typeof config === "object" && typeof config.default === "object") {
		return processConfiguredOptions(config.default, argv, convertOptions);
	}

	if (Array.isArray(config)) {
		config.forEach((cfg) => processOptions(cfg, argv));
	} else {
		processOptions(config, argv);
	}

	applyContext(config, argv);
	applyWatchOptions(config, argv);
	return config;
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
 * Apply watch-related settings.
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
 * Process a single configuration object with CLI arguments.
 */
function processOptions(options, argv) {
	const noOutputFilenameDefined = !options.output || !options.output.filename;

	ifArgPair("entry", (name, entry) => {
		if (options.entry && options.entry[name] !== undefined && options.entry[name] !== null) {
			options.entry[name] = [].concat(options.entry[name]).concat(entry);
		} else {
			ensureObject(options, "entry");
			options.entry[name] = entry;
		}
	}, () => ensureObject(options, "entry"));

	bindLoaders("module-bind", "loaders", options);
	bindLoaders("module-bind-pre", "preLoaders", options);
	bindLoaders("module-bind-post", "postLoaders", options);

	handleDefine(options, argv);
	handleOutputOptions(options, argv);
	handleBooleanFlags(options, argv);
	handleDevtool(options, argv);
	handleResolveAliases(options, argv);
	handleResolveExtensions(options, argv);
	handleOptimization(options, argv);
	handlePrefetch(options, argv);
	handleProvide(options, argv);
	handlePlugin(options, argv);
	ensureOutputFilename(options, argv, noOutputFilenameDefined);
	handleEntryFromArgs(options, argv);
	ensureEntryExists(options, argv);
}

/**
 * Helper to iterate over an argument that may be an array or single value.
 */
function ifArg(name, fn, init, finalize, argv) {
	if (Array.isArray(argv[name])) {
		if (init) init();
		argv[name].forEach(fn);
		if (finalize) finalize();
	} else if (argv[name] !== undefined && argv[name] !== null) {
		if (init) init();
		fn(argv[name], -1);
		if (finalize) finalize();
	}
}

/**
 * Helper to split "key=value" arguments.
 */
function ifArgPair(name, fn, init, finalize, argv) {
	ifArg(
		name,
		(content, idx) => {
			const eqIdx = content.indexOf("=");
			if (eqIdx < 0) {
				return fn(null, content, idx);
			}
			return fn(content.substring(0, eqIdx), content.substring(eqIdx + 1), idx);
		},
		init,
		finalize,
		argv
	);
}

/**
 * Helper for boolean flags.
 */
function ifBooleanArg(name, fn, argv) {
	ifArg(name, (bool) => {
		if (bool) fn();
	}, null, null, argv);
}

/**
 * Map an argument directly to a boolean option on the config.
 */
function mapArgToBoolean(name, optionName, options, argv) {
	ifArg(name, (bool) => {
		if (bool === true) options[optionName || name] = true;
		else if (bool === false) options[optionName || name] = false;
	}, null, null, argv);
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
function bindLoaders(arg, collection, options) {
	ifArgPair(
		arg,
		(name, binding) => {
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
		},
		() => {
			ensureObject(options, "module");
			ensureArray(options.module, collection);
		},
		null,
		argv
	);
}

/**
 * Handle --define arguments.
 */
function handleDefine(options, argv) {
	let defineObject = null;
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
		},
		argv
	);
}

/**
 * Handle various output related arguments.
 */
function handleOutputOptions(options, argv) {
	ifArg("output-path", (value) => {
		ensureObject(options, "output");
		options.output.path = path.resolve(value);
	}, null, null, argv);

	ifArg("output-filename", (value) => {
		ensureObject(options, "output");
		options.output.filename = value;
	}, null, null, argv);

	ifArg("output-chunk-filename", (value) => {
		ensureObject(options, "output");
		options.output.chunkFilename = value;
	}, null, null, argv);

	ifArg("output-source-map-filename", (value) => {
		ensureObject(options, "output");
		options.output.sourceMapFilename = value;
	}, null, null, argv);

	ifArg("output-public-path", (value) => {
		ensureObject(options, "output");
		options.output.publicPath = value;
	}, null, null, argv);

	ifArg("output-jsonp-function", (value) => {
		ensureObject(options, "output");
		options.output.jsonpFunction = value;
	}, null, null, argv);

	ifBooleanArg("output-pathinfo", () => {
		ensureObject(options, "output");
		options.output.pathinfo = true;
	}, argv);

	ifArg("output-library", (value) => {
		ensureObject(options, "output");
		options.output.library = value;
	}, null, null, argv);

	ifArg("output-library-target", (value) => {
		ensureObject(options, "output");
		options.output.libraryTarget = value;
	}, null, null, argv);
}

/**
 * Handle boolean flags that map to plugins.
 */
function handleBooleanFlags(options, argv) {
	ifBooleanArg("hot", () => {
		ensureArray(options, "plugins");
		const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
		options.plugins.push(new HotModuleReplacementPlugin());
	}, argv);

	ifBooleanArg("debug", () => {
		ensureArray(options, "plugins");
		const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
		options.plugins.push(new LoaderOptionsPlugin({ debug: true }));
	}, argv);

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
	}, argv);
}

/**
 * Handle --devtool argument.
 */
function handleDevtool(options, argv) {
	ifArg("devtool", (value) => {
		options.devtool = value;
	}, null, null, argv);
}

/**
 * Process resolve alias arguments.
 */
function processResolveAlias(options, argv, argName, key) {
	ifArgPair(
		argName,
		(name, value) => {
			if (!name) {
				throw new Error(`--${argName} <string>=<string>`);
			}
			ensureObject(options, key);
			ensureObject(options[key], "alias");
			options[key].alias[name] = value;
		},
		null,
		null,
		argv
	);
}

/**
 * Handle resolve alias arguments.
 */
function handleResolveAliases(options, argv) {
	processResolveAlias(options, argv, "resolve-alias", "resolve");
	processResolveAlias(options, argv, "resolve-loader-alias", "resolveLoader");
}

/**
 * Handle resolve extensions argument.
 */
function handleResolveExtensions(options, argv) {
	ifArg("resolve-extensions", (value) => {
		ensureObject(options, "resolve");
		if (Array.isArray(value)) {
			options.resolve.extensions = value;
		} else {
			options.resolve.extensions = value.split(/,\s*/);
		}
	}, null, null, argv);
}

/**
 * Handle optimization related arguments.
 */
function handleOptimization(options, argv) {
	ifArg("optimize-max-chunks", (value) => {
		ensureArray(options, "plugins");
		const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
		options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
	}, null, null, argv);

	ifArg("optimize-min-chunk-size", (value) => {
		ensureArray(options, "plugins");
		const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
		options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
	}, null, null, argv);
}

/**
 * Handle prefetch argument.
 */
function handlePrefetch(options, argv) {
	ifArg("prefetch", (request) => {
		ensureArray(options, "plugins");
		const PrefetchPlugin = require("../lib/PrefetchPlugin");
		options.plugins.push(new PrefetchPlugin(request));
	}, null, null, argv);
}

/**
 * Handle provide argument.
 */
function handleProvide(options, argv) {
	ifArg("provide", (value) => {
		ensureArray(options, "plugins");
		const idx = value.indexOf("=");
		let name, module;
		if (idx >= 0) {
			name = value.substring(0, idx);
			module = value.substring(idx + 1);
		} else {
			name = value;
			module = value;
		}
		const ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, module));
	}, null, null, argv);
}

/**
 * Handle generic plugin loading.
 */
function handlePlugin(options, argv) {
	ifArg("plugin", (value) => {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(value));
	}, null, null, argv);
}

/**
 * Load a plugin by name, handling query parameters.
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
		process.exit(-1); // eslint-disable-line
	}

	let resolvedPath;
	try {
		const resolve = require("enhanced-resolve");
		resolvedPath = resolve.sync(process.cwd(), name);
	} catch (e) {
		console.log(`Cannot resolve plugin ${name}.`);
		process.exit(-1); // eslint-disable-line
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
 * Ensure an output filename is defined, applying defaults or exiting on error.
 */
function ensureOutputFilename(options, argv, noOutputFilenameDefined) {
	if (!noOutputFilenameDefined) return;

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

/**
 * Process entry arguments from the command line.
 */
function handleEntryFromArgs(options, argv) {
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
		const eqIdx = content.indexOf("=");
		const qIdx = content.indexOf("?");
		if (eqIdx < 0 || (qIdx >= 0 && qIdx < eqIdx)) {
			const resolved = path.resolve(content);
			if (fs.existsSync(resolved)) {
				addTo("main", resolved);
			} else {
				addTo("main", content);
			}
		} else {
			addTo(content.substring(0, eqIdx), content.substring(eqIdx + 1));
		}
	});
}

/**
 * Ensure that an entry point exists, otherwise exit with an error.
 */
function ensureEntryExists(options, argv) {
	if (options.entry) return;

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