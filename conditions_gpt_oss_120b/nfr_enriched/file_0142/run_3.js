```javascript
const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

/**
 * Main entry point for CLI argument conversion.
 */
module.exports = function (yargs, argv, convertOptions) {
	applyShortcuts(argv);
	const configFiles = resolveConfigFiles(argv);
	const options = loadConfigFiles(configFiles, argv);
	const configLoaded = options.length > 0;

	if (!configLoaded) {
		return processConfiguredOptions({}, argv, convertOptions, false);
	}
	if (options.length === 1) {
		return processConfiguredOptions(options[0], argv, convertOptions, true);
	}
	return processConfiguredOptions(options, argv, convertOptions, true);
};

/**
 * Apply shortcut flags (e.g., -d, -p) to argv.
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
		argv.define = [].concat(argv.define || []).concat('process.env.NODE_ENV="production"');
	}
}

/**
 * Resolve configuration files based on argv or defaults.
 */
function resolveConfigFiles(argv) {
	const extensions = Object.keys(interpret.extensions).sort((a, b) => {
		return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
	});
	const defaultConfigFiles = ["webpack.config", "webpackfile"]
		.map((filename) => extensions.map((ext) => ({ path: path.resolve(filename + ext), ext })))
		.reduce((a, i) => a.concat(i), []);

	if (argv.config) {
		const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
		return configArgList.map((configArg) => mapConfigArg(configArg, extensions));
	}
	return findFirstExisting(defaultConfigFiles);
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
 * Find the first existing config file from a list.
 */
function findFirstExisting(candidates) {
	const found = [];
	for (let i = 0; i < candidates.length; i++) {
		if (fs.existsSync(candidates[i].path)) {
			found.push(candidates[i]);
			break;
		}
	}
	return found;
}

/**
 * Load configuration files and return an array of option objects.
 */
function loadConfigFiles(configFiles, argv) {
	const options = [];
	if (configFiles.length === 0) return options;

	const registerCompiler = (moduleDescriptor) => {
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
					/* ignore */
				}
			}
		}
	};

	const requireConfig = (configPath) => {
		let cfg = require(configPath);
		const isES6Default = typeof cfg === "object" && cfg !== null && typeof cfg.default === "function";
		if (typeof cfg === "function" || isES6Default) {
			cfg = isES6Default ? cfg.default : cfg;
			cfg = cfg(argv.env, argv);
		}
		return cfg;
	};

	configFiles.forEach((file) => {
		registerCompiler(interpret.extensions[file.ext]);
		options.push(requireConfig(file.path));
	});
	return options;
}

/**
 * Process the final configuration object(s) and apply CLI overrides.
 */
function processConfiguredOptions(rawOptions, argv, convertOptions, configLoaded) {
	if (rawOptions === null || typeof rawOptions !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1);
	}
	if (typeof rawOptions.then === "function") {
		return rawOptions.then((resolved) => processConfiguredOptions(resolved, argv, convertOptions, configLoaded));
	}
	if (typeof rawOptions === "object" && typeof rawOptions.default === "object") {
		return processConfiguredOptions(rawOptions.default, argv, convertOptions, configLoaded);
	}
	if (Array.isArray(rawOptions)) {
		rawOptions.forEach((opt) => processOptions(opt, argv, convertOptions, configLoaded));
	} else {
		processOptions(rawOptions, argv, convertOptions, configLoaded);
	}
	return rawOptions;
}

/**
 * Apply CLI arguments to a single webpack configuration object.
 */
function processOptions(options, argv, convertOptions, configLoaded) {
	const noOutputFilenameDefined = !options.output || !options.output.filename;

	applyEntryArgs(options, argv);
	applyModuleBindArgs(options, argv);
	applyDefineArgs(options, argv);
	applyOutputArgs(options, argv);
	applyBooleanArgs(options, argv);
	applyResolveAliasArgs(options, argv);
	applyOptimizationArgs(options, argv);
	applyPluginArgs(options, argv);
	applyWatchArgs(options, argv);
	applyEntryFromPositionalArgs(options, argv, configLoaded);
	ensureOutputFilename(options, argv, convertOptions, configLoaded, noOutputFilenameDefined);
	validateEntryPresence(options, configLoaded);
}

/* ---------- Helper groups for processOptions ---------- */

/**
 * Handle entry related arguments.
 */
function applyEntryArgs(options, argv) {
	ifArgPair(argv, "entry", (name, entry) => {
		if (options.entry && options.entry[name] !== undefined) {
			options.entry[name] = [].concat(options.entry[name], entry);
		} else {
			ensureObject(options, "entry");
			options.entry[name] = entry;
		}
	});
}

/**
 * Bind loaders based on CLI arguments.
 */
function applyModuleBindArgs(options, argv) {
	const bindLoaders = (arg, collection) => {
		ifArgPair(argv, arg, (name, binding) => {
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
	};
	bindLoaders("module-bind", "loaders");
	bindLoaders("module-bind-pre", "preLoaders");
	bindLoaders("module-bind-post", "postLoaders");
}

/**
 * Process --define arguments.
 */
function applyDefineArgs(options, argv) {
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
 * Apply output related arguments.
 */
function applyOutputArgs(options, argv) {
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
 * Apply boolean flags that map directly to options.
 */
function applyBooleanArgs(options, argv) {
	mapArgToBoolean(argv, "cache", options);
	mapArgToBoolean(argv, "bail", options);
	mapArgToBoolean(argv, "profile", options);
}

/**
 * Resolve alias arguments.
 */
function applyResolveAliasArgs(options, argv) {
	processResolveAlias(argv, "resolve-alias", "resolve");
	processResolveAlias(argv, "resolve-loader-alias", "resolveLoader");
}

/**
 * Apply optimization related arguments.
 */
function applyOptimizationArgs(options, argv) {
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
 * Load and apply plugins based on CLI arguments.
 */
function applyPluginArgs(options, argv) {
	ifArg(argv, "prefetch", (request) => {
		ensureArray(options, "plugins");
		const PrefetchPlugin = require("../lib/PrefetchPlugin");
		options.plugins.push(new PrefetchPlugin(request));
	});
	ifArg(argv, "provide", (value) => {
		ensureArray(options, "plugins");
		const idx = value.indexOf("=");
		const name = idx >= 0 ? value.substring(0, idx) : value;
		const val = idx >= 0 ? value.substring(idx + 1) : undefined;
		const ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, val));
	});
	ifArg(argv, "plugin", (value) => {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(value));
	});
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
 * Apply watch related arguments.
 */
function applyWatchArgs(options, argv) {
	if (argv.watch) options.watch = true;
	if (argv["watch-aggregate-timeout"]) {
		ensureObject(options, "watchOptions");
		options.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
	}
	if (argv["watch-poll"]) {
		ensureObject(options, "watchOptions");
		options.watchOptions.poll =
			typeof argv["watch-poll"] !== "boolean" ? +argv["watch-poll"] : true;
	}
	if (argv["watch-stdin"]) {
		ensureObject(options, "watchOptions");
		options.watchOptions.stdin = true;
		options.watch = true;
	}
}

/**
 * Process positional arguments as entry points.
 */
function applyEntryFromPositionalArgs(options, argv, configLoaded) {
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
			addTo("main", fs.existsSync(resolved) ? resolved : content);
		} else {
			addTo(content.substring(0, eqIdx), content.substring(eqIdx + 1));
		}
	});
}

/**
 * Ensure an output filename is defined, applying defaults if necessary.
 */
function ensureOutputFilename(options, argv, convertOptions, configLoaded, noOutputFilenameDefined) {
	if (!noOutputFilenameDefined) return;
	ensureObject(options, "output");
	if (convertOptions && convertOptions.outputFilename) {
		options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
		options.output.filename = path.basename(convertOptions.outputFilename);
	} else if (argv._.length > 0) {
		options.output.filename = argv._.pop();
		options.output.path = path.resolve(path.dirname(options.output.filename));
		options.output.filename = path.basename(options.output.filename);
	} else if (configLoaded) {
		throw new Error("'output.filename' is required, either in config file or as --output-filename");
	} else {
		console.error("No configuration file found and no output filename configured via CLI option.");
		console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
		console.error("Use --help to display the CLI options.");
		process.exit(-1);
	}
}

/**
 * Validate that an entry point exists; otherwise exit with an error.
 */
function validateEntryPresence(options, configLoaded) {
	if (options.entry) return;
	if (configLoaded) {
		console.error("Configuration file found but no entry configured.");
	} else {
		console.error("No configuration file found and no entry configured via CLI option.");
		console.error("When using the CLI you need to provide at least two arguments: entry and output.");
		console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
	}
	console.error("Use --help to display the CLI options.");
	process.exit(-1);
}

/* ---------- Generic argument helpers ---------- */

function ifArg(argv, name, fn, init, finalize) {
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

function ifBooleanArg(argv, name, fn) {
	ifArg(argv, name, (bool) => {
		if (bool) fn();
	});
}

function mapArgToBoolean(argv, name, options) {
	ifArg(argv, name, (bool) => {
		if (bool === true) options[name] = true;
		else if (bool === false) options[name] = false;
	});
}

function processResolveAlias(argv, arg, key) {
	ifArgPair(argv, arg, (name, value) => {
		if (!name) throw new Error(`--${arg} <string>=<string>`);
		ensureObject(options, key);
		ensureObject(options[key], "alias");
		options[key].alias[name] = value;
	});
}

/**
 * Ensure a property on an object is an object.
 */
function ensureObject(parent, name) {
	if (typeof parent[name] !== "object" || parent[name] === null) {
		parent[name] = {};
	}
}

/**
 * Ensure a property on an object is an array.
 */
function ensureArray(parent, name) {
	if (!Array.isArray(parent[name])) {
		parent[name] = [];
	}
}

/**
 * Load a plugin by name, handling query parameters and resolution.
 */
function loadPlugin(name) {
	const loadUtils = require("loader-utils");
	let args;
	try {
		const qIdx = name && name.indexOf("?");
		if (qIdx > -1) {
			args = loadUtils.parseQuery(name.substring(qIdx));
			name = name.substring(0, qIdx);
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
```