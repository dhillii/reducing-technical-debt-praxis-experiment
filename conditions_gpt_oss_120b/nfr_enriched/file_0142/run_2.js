const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

/**
 * Apply shortcut flags to argv.
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
 * Return sorted list of supported extensions.
 */
function getSortedExtensions() {
	const extensions = Object.keys(interpret.extensions);
	extensions.sort((a, b) => {
		if (a === ".js") return -1;
		if (b === ".js") return 1;
		return a.length - b.length;
	});
	return extensions;
}

/**
 * Build default config file candidates.
 */
function getDefaultConfigFiles(extensions) {
	const baseNames = ["webpack.config", "webpackfile"];
	return baseNames
		.map(filename => extensions.map(ext => ({ path: path.resolve(filename + ext), ext })))
		.reduce((acc, cur) => acc.concat(cur), []);
}

/**
 * Determine the extension of a config path.
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
 * Resolve config arguments to objects containing path and extension.
 */
function resolveConfigArgs(argvConfig, extensions) {
	const configList = Array.isArray(argvConfig) ? argvConfig : [argvConfig];
	return configList.map(arg => {
		const resolved = path.resolve(arg);
		const ext = getConfigExtension(resolved, extensions);
		return { path: resolved, ext };
	});
}

/**
 * Find existing config file when none is explicitly provided.
 */
function findExistingConfigFile(defaultFiles) {
	for (const file of defaultFiles) {
		if (fs.existsSync(file.path)) {
			return [{ path: file.path, ext: file.ext }];
		}
	}
	return [];
}

/**
 * Register a compiler based on interpret descriptor.
 */
function registerCompiler(descriptor) {
	if (!descriptor) return;
	if (typeof descriptor === "string") {
		require(descriptor);
	} else if (!Array.isArray(descriptor)) {
		descriptor.register(require(descriptor.module));
	} else {
		for (let i = 0; i < descriptor.length; i++) {
			try {
				registerCompiler(descriptor[i]);
				break;
			} catch (_) {
				// ignore and try next
			}
		}
	}
}

/**
 * Require a config file, handling functions and ES6 default exports.
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
 * Process the final options object according to CLI arguments.
 */
function processConfiguredOptions(options, argv, convertOptions, configFileLoaded) {
	if (options === null || typeof options !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1);
	}
	if (typeof options.then === "function") {
		return options.then(res => processConfiguredOptions(res, argv, convertOptions, configFileLoaded));
	}
	if (typeof options === "object" && typeof options.default === "object") {
		return processConfiguredOptions(options.default, argv, convertOptions, configFileLoaded);
	}
	if (Array.isArray(options)) {
		options.forEach(opt => processOptions(opt, argv));
	} else {
		processOptions(options, argv);
	}
	if (argv.context) {
		options.context = path.resolve(argv.context);
	}
	if (!options.context) {
		options.context = process.cwd();
	}
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
	return options;
}

/**
 * Process a single options object, applying CLI arguments.
 */
function processOptions(options, argv) {
	const noOutputFilenameDefined = !(options.output && options.output.filename);

	/** Helper to conditionally apply a function based on argv value. */
	function ifArg(name, fn, init, finalize) {
		const value = argv[name];
		if (Array.isArray(value)) {
			if (init) init();
			value.forEach(v => fn(v, -1));
			if (finalize) finalize();
		} else if (value !== undefined && value !== null) {
			if (init) init();
			fn(value, -1);
			if (finalize) finalize();
		}
	}
	function ifArgPair(name, fn, init, finalize) {
		ifArg(name, (content, idx) => {
			const eq = content.indexOf("=");
			if (eq < 0) return fn(null, content, idx);
			return fn(content.substring(0, eq), content.substring(eq + 1), idx);
		}, init, finalize);
	}
	function ifBooleanArg(name, fn) {
		ifArg(name, bool => {
			if (bool) fn();
		});
	}
	function mapArgToBoolean(name, optionName) {
		ifArg(name, bool => {
			if (bool === true) options[optionName || name] = true;
			else if (bool === false) options[optionName || name] = false;
		});
	}
	function ensureObject(parent, key) {
		if (typeof parent[key] !== "object" || parent[key] === null) parent[key] = {};
	}
	function ensureArray(parent, key) {
		if (!Array.isArray(parent[key])) parent[key] = [];
	}
	// entry handling
	ifArgPair("entry", (name, entry) => {
		if (options.entry && options.entry[name] !== undefined) {
			options.entry[name] = [].concat(options.entry[name]).concat(entry);
		} else {
			options.entry[name] = entry;
		}
	}, () => ensureObject(options, "entry"));
	// module bindings
	function bindLoaders(arg, collection) {
		ifArgPair(arg, (name, binding) => {
			if (name === null) {
				name = binding;
				binding += "-loader";
			}
			options.module[collection].push({
				test: new RegExp("\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
				loader: binding
			});
		}, () => {
			ensureObject(options, "module");
			ensureArray(options.module, collection);
		});
	}
	bindLoaders("module-bind", "loaders");
	bindLoaders("module-bind-pre", "preLoaders");
	bindLoaders("module-bind-post", "postLoaders");
	// define plugin
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
		() => (defineObject = {}),
		() => {
			ensureArray(options, "plugins");
			const DefinePlugin = require("../lib/DefinePlugin");
			options.plugins.push(new DefinePlugin(defineObject));
		}
	);
	// output options
	ifArg("output-path", v => {
		ensureObject(options, "output");
		options.output.path = path.resolve(v);
	});
	ifArg("output-filename", v => {
		ensureObject(options, "output");
		options.output.filename = v;
	});
	ifArg("output-chunk-filename", v => {
		ensureObject(options, "output");
		options.output.chunkFilename = v;
	});
	ifArg("output-source-map-filename", v => {
		ensureObject(options, "output");
		options.output.sourceMapFilename = v;
	});
	ifArg("output-public-path", v => {
		ensureObject(options, "output");
		options.output.publicPath = v;
	});
	ifArg("output-jsonp-function", v => {
		ensureObject(options, "output");
		options.output.jsonpFunction = v;
	});
	ifBooleanArg("output-pathinfo", () => {
		ensureObject(options, "output");
		options.output.pathinfo = true;
	});
	ifArg("output-library", v => {
		ensureObject(options, "output");
		options.output.library = v;
	});
	ifArg("output-library-target", v => {
		ensureObject(options, "output");
		options.output.libraryTarget = v;
	});
	ifArg("records-input-path", v => (options.recordsInputPath = path.resolve(v)));
	ifArg("records-output-path", v => (options.recordsOutputPath = path.resolve(v)));
	ifArg("records-path", v => (options.recordsPath = path.resolve(v)));
	ifArg("target", v => (options.target = v));
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
	ifArg("devtool", v => (options.devtool = v));
	// resolve aliases
	function processResolveAlias(arg, key) {
		ifArgPair(arg, (name, value) => {
			if (!name) throw new Error(`--${arg} <string>=<string>`);
			ensureObject(options, key);
			ensureObject(options[key], "alias");
			options[key].alias[name] = value;
		});
	}
	processResolveAlias("resolve-alias", "resolve");
	processResolveAlias("resolve-loader-alias", "resolveLoader");
	ifArg("resolve-extensions", v => {
		ensureObject(options, "resolve");
		options.resolve.extensions = Array.isArray(v) ? v : v.split(/,\s*/);
	});
	ifArg("optimize-max-chunks", v => {
		ensureArray(options, "plugins");
		const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
		options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(v, 10) }));
	});
	ifArg("optimize-min-chunk-size", v => {
		ensureArray(options, "plugins");
		const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
		options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(v, 10) }));
	});
	ifBooleanArg("optimize-minimize", () => {
		ensureArray(options, "plugins");
		const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
		const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
		options.plugins.push(
			new UglifyJsPlugin({
				sourceMap:
					options.devtool &&
					(options.devtool.includes("sourcemap") || options.devtool.includes("source-map"))
			})
		);
		options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
	});
	ifArg("prefetch", req => {
		ensureArray(options, "plugins");
		const PrefetchPlugin = require("../lib/PrefetchPlugin");
		options.plugins.push(new PrefetchPlugin(req));
	});
	ifArg("provide", val => {
		ensureArray(options, "plugins");
		const idx = val.indexOf("=");
		const name = idx >= 0 ? val.substring(0, idx) : val;
		const value = idx >= 0 ? val.substring(idx + 1) : undefined;
		const ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, value));
	});
	ifArg("plugin", v => {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(v));
	});
	mapArgToBoolean("bail");
	mapArgToBoolean("profile");
	// output filename defaults
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
			process.exit(-1);
		}
	}
	// entry from remaining CLI args
	if (argv._.length > 0) {
		if (Array.isArray(options.entry) || typeof options.entry === "string") {
			options.entry = { main: options.entry };
		}
		ensureObject(options, "entry");
		const addTo = (name, entry) => {
			if (options.entry[name]) {
				if (!Array.isArray(options.entry[name])) options.entry[name] = [options.entry[name]];
				options.entry[name].push(entry);
			} else {
				options.entry[name] = entry;
			}
		};
		argv._.forEach(content => {
			const eq = content.indexOf("=");
			const q = content.indexOf("?");
			if (eq < 0 || (q >= 0 && q < eq)) {
				const resolved = path.resolve(content);
				addTo("main", fs.existsSync(resolved) ? resolved : content);
			} else {
				addTo(content.substring(0, eq), content.substring(eq + 1));
			}
		});
	}
	// final entry validation
	if (!options.entry) {
		if (configFileLoaded) console.error("Configuration file found but no entry configured.");
		else {
			console.error("No configuration file found and no entry configured via CLI option.");
			console.error("When using the CLI you need to provide at least two arguments: entry and output.");
			console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
		}
		console.error("Use --help to display the CLI options.");
		process.exit(-1);
	}
}

/**
 * Load a plugin by name, handling query strings and resolution.
 */
function loadPlugin(name) {
	const loadUtils = require("loader-utils");
	let args;
	try {
		const q = name && name.indexOf("?");
		if (q > -1) {
			args = loadUtils.parseQuery(name.substring(q));
			name = name.substring(0, q);
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
 * Main exported function.
 */
module.exports = function (yargs, argv, convertOptions) {
	applyShortcuts(argv);
	const extensions = getSortedExtensions();
	const defaultConfigFiles = getDefaultConfigFiles(extensions);
	let configFiles = [];
	if (argv.config) {
		configFiles = resolveConfigArgs(argv.config, extensions);
	} else {
		configFiles = findExistingConfigFile(defaultConfigFiles);
	}
	const options = [];
	if (configFiles.length > 0) {
		for (const file of configFiles) {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path, argv));
		}
	}
	const configFileLoaded = configFiles.length > 0;
	if (!configFileLoaded) {
		return processConfiguredOptions({}, argv, convertOptions, false);
	}
	if (options.length === 1) {
		return processConfiguredOptions(options[0], argv, convertOptions, true);
	}
	return processConfiguredOptions(options, argv, convertOptions, true);
};