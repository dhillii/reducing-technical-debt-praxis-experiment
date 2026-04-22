```javascript
const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

/**
 * Resolve the extension of a config file path.
 */
function getConfigExtension(configPath, extensions) {
	for (let i = extensions.length - 1; i >= 0; i--) {
		const ext = extensions[i];
		if (configPath.endsWith(ext)) return ext;
	}
	return path.extname(configPath);
}

/**
 * Map a config argument to an object containing its resolved path and extension.
 */
function mapConfigArg(configArg, extensions) {
	const resolved = path.resolve(configArg);
	const ext = getConfigExtension(resolved, extensions);
	return { path: resolved, ext };
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
				/* ignore */
			}
		}
	}
}

/**
 * Require a config file and evaluate it if it exports a function.
 */
function requireConfig(configPath, argv) {
	let options = require(configPath);
	const isES6DefaultFunc =
		typeof options === "object" && options !== null && typeof options.default === "function";

	if (typeof options === "function" || isES6DefaultFunc) {
		options = isES6DefaultFunc ? options.default : options;
		options = options(argv.env, argv);
	}
	return options;
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
 * Load a plugin by name, handling query arguments.
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
	const Plugin = require(resolvedPath);
	try {
		return new Plugin(args);
	} catch (e) {
		console.log(`Cannot instantiate plugin ${name}. (${resolvedPath})`);
		throw e;
	}
}

/**
 * Process configured options (single or multiple) and apply CLI overrides.
 */
function processConfiguredOptions(options, argv, convertOptions) {
	if (options === null || typeof options !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1);
	}
	if (typeof options.then === "function") return options.then((opt) => processConfiguredOptions(opt, argv, convertOptions));
	if (typeof options === "object" && typeof options.default === "object") return processConfiguredOptions(options.default, argv, convertOptions);
	if (Array.isArray(options)) options.forEach((opt) => processOptions(opt, argv, convertOptions));
	else processOptions(options, argv, convertOptions);
	if (argv.context) options.context = path.resolve(argv.context);
	if (!options.context) options.context = process.cwd();
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
 * Core option processing for a single configuration object.
 */
function processOptions(options, argv, convertOptions) {
	const noOutputFilenameDefined = !options.output || !options.output.filename;

	/* Helper to handle generic argument processing */
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
	function ifArgPair(name, fn, init, finalize) {
		ifArg(name, (content, idx) => {
			const eq = content.indexOf("=");
			if (eq < 0) fn(null, content, idx);
			else fn(content.substring(0, eq), content.substring(eq + 1), idx);
		}, init, finalize);
	}
	function ifBooleanArg(name, fn) {
		ifArg(name, (bool) => bool && fn());
	}
	function mapArgToBoolean(name, optionName) {
		ifArg(name, (bool) => {
			if (bool === true) options[optionName || name] = true;
			else if (bool === false) options[optionName || name] = false;
		});
	}
	/* Entry handling */
	ifArgPair("entry", (name, entry) => {
		if (options.entry && options.entry[name] != null) {
			options.entry[name] = [].concat(options.entry[name]).concat(entry);
		} else {
			options.entry[name] = entry;
		}
	}, () => ensureObject(options, "entry"));
	/* Loader bindings */
	function bindLoaders(arg, collection) {
		ifArgPair(arg, (name, binding) => {
			if (name === null) {
				name = binding;
				binding += "-loader";
			}
			options.module[collection].push({
				test: new RegExp(`\\.${name.replace(/[\\-\\[\\]\\/\\{\\}\\(\\)\\*\\+\\?\\.\\\\\\^\\$\\|]/g, "\\$&")}$`),
				loader: binding,
			});
		}, () => {
			ensureObject(options, "module");
			ensureArray(options.module, collection);
		});
	}
	bindLoaders("module-bind", "loaders");
	bindLoaders("module-bind-pre", "preLoaders");
	bindLoaders("module-bind-post", "postLoaders");
	/* Define plugin */
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
	/* Output options */
	ifArg("output-path", (v) => {
		ensureObject(options, "output");
		options.output.path = path.resolve(v);
	});
	ifArg("output-filename", (v) => {
		ensureObject(options, "output");
		options.output.filename = v;
	});
	ifArg("output-chunk-filename", (v) => {
		ensureObject(options, "output");
		options.output.chunkFilename = v;
	});
	ifArg("output-source-map-filename", (v) => {
		ensureObject(options, "output");
		options.output.sourceMapFilename = v;
	});
	ifArg("output-public-path", (v) => {
		ensureObject(options, "output");
		options.output.publicPath = v;
	});
	ifArg("output-jsonp-function", (v) => {
		ensureObject(options, "output");
		options.output.jsonpFunction = v;
	});
	ifBooleanArg("output-pathinfo", () => {
		ensureObject(options, "output");
		options.output.pathinfo = true;
	});
	ifArg("output-library", (v) => {
		ensureObject(options, "output");
		options.output.library = v;
	});
	ifArg("output-library-target", (v) => {
		ensureObject(options, "output");
		options.output.libraryTarget = v;
	});
	/* Records */
	ifArg("records-input-path", (v) => (options.recordsInputPath = path.resolve(v)));
	ifArg("records-output-path", (v) => (options.recordsOutputPath = path.resolve(v)));
	ifArg("records-path", (v) => (options.recordsPath = path.resolve(v)));
	/* General */
	ifArg("target", (v) => (options.target = v));
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
	ifArg("devtool", (v) => (options.devtool = v));
	/* Resolve aliases */
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
	ifArg("resolve-extensions", (v) => {
		ensureObject(options, "resolve");
		options.resolve.extensions = Array.isArray(v) ? v : v.split(/,\s*/);
	});
	/* Optimization plugins */
	ifArg("optimize-max-chunks", (v) => {
		ensureArray(options, "plugins");
		const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
		options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(v, 10) }));
	});
	ifArg("optimize-min-chunk-size", (v) => {
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
					(options.devtool.includes("sourcemap") || options.devtool.includes("source-map")),
			})
		);
		options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
	});
	ifArg("prefetch", (req) => {
		ensureArray(options, "plugins");
		const PrefetchPlugin = require("../lib/PrefetchPlugin");
		options.plugins.push(new PrefetchPlugin(req));
	});
	ifArg("provide", (val) => {
		ensureArray(options, "plugins");
		const idx = val.indexOf("=");
		const name = idx >= 0 ? val.substring(0, idx) : val;
		const value = idx >= 0 ? val.substring(idx + 1) : undefined;
		const ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, value));
	});
	ifArg("plugin", (val) => {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(val));
	});
	mapArgToBoolean("bail");
	mapArgToBoolean("profile");
	/* Output filename fallback */
	if (noOutputFilenameDefined) {
		ensureObject(options, "output");
		if (convertOptions && convertOptions.outputFilename) {
			options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
			options.output.filename = path.basename(convertOptions.outputFilename);
		} else if (argv._.length > 0) {
			options.output.filename = argv._.pop();
			options.output.path = path.resolve(path.dirname(options.output.filename));
			options.output.filename = path.basename(options.output.filename);
		} else if (convertOptions && convertOptions.configFileLoaded) {
			throw new Error("'output.filename' is required, either in config file or as --output-filename");
		} else {
			console.error("No configuration file found and no output filename configured via CLI option.");
			console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
			console.error("Use --help to display the CLI options.");
			process.exit(-1);
		}
	}
	/* Positional entry arguments */
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
		argv._.forEach((content) => {
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
	/* Validate entry */
	if (!options.entry) {
		if (convertOptions && convertOptions.configFileLoaded) {
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
 * Main exported function.
 */
module.exports = function (yargs, argv, convertOptions) {
	/* Shortcut flags */
	if (argv.d) {
		argv.debug = true;
		argv["output-pathinfo"] = true;
		if (!argv.devtool) argv.devtool = "eval-cheap-module-source-map";
	}
	if (argv.p) {
		argv["optimize-minimize"] = true;
		argv.define = [].concat(argv.define || []).concat('process.env.NODE_ENV="production"');
	}
	/* Resolve extensions and default config files */
	const extensions = Object.keys(interpret.extensions).sort((a, b) => {
		if (a === ".js") return -1;
		if (b === ".js") return 1;
		return a.length - b.length;
	});
	const defaultConfigFiles = ["webpack.config", "webpackfile"]
		.map((filename) => extensions.map((ext) => ({ path: path.resolve(filename + ext), ext })))
		.reduce((a, i) => a.concat(i), []);
	/* Determine config files to load */
	let configFiles = [];
	if (argv.config) {
		const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
		configFiles = configArgList.map((c) => mapConfigArg(c, extensions));
	} else {
		for (const cfg of defaultConfigFiles) {
			if (fs.existsSync(cfg.path)) {
				configFiles.push({ path: cfg.path, ext: cfg.ext });
				break;
			}
		}
	}
	/* Load and process config files */
	const options = [];
	let configFileLoaded = false;
	if (configFiles.length > 0) {
		for (const file of configFiles) {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path, argv));
		}
		configFileLoaded = true;
	}
	/* Apply CLI overrides */
	if (!configFileLoaded) return processConfiguredOptions({}, argv, convertOptions);
	if (options.length === 1) return processConfiguredOptions(options[0], argv, { ...convertOptions, configFileLoaded });
	return processConfiguredOptions(options, argv, { ...convertOptions, configFileLoaded });
};
```