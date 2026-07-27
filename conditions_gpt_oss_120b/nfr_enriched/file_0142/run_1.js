const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

module.exports = function (yargs, argv, convertOptions) {
	applyShortcuts(argv);
	const extensions = getSortedExtensions();
	const defaultConfigFiles = getDefaultConfigFiles(extensions);
	const configFiles = resolveConfigFiles(argv, extensions, defaultConfigFiles);
	let options = [];

	if (configFiles.length > 0) {
		options = loadConfigFiles(configFiles, argv);
	}

	const configFileLoaded = configFiles.length > 0;
	return finalizeOptions(options, argv, convertOptions, configFileLoaded);
};

/* Shortcut handling */
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
		argv["define"] = [].concat(argv["define"] || []).concat('process.env.NODE_ENV="production"');
	}
}

/* Extension utilities */
function getSortedExtensions() {
	const extensions = Object.keys(interpret.extensions);
	extensions.sort((a, b) => {
		if (a === ".js") return -1;
		if (b === ".js") return 1;
		return a.length - b.length;
	});
	return extensions;
}

/* Default config file generation */
function getDefaultConfigFiles(extensions) {
	const baseNames = ["webpack.config", "webpackfile"];
	return baseNames
		.map((filename) =>
			extensions.map((ext) => ({
				path: path.resolve(filename + ext),
				ext,
			}))
		)
		.reduce((a, i) => a.concat(i), []);
}

/* Resolve config files from CLI or defaults */
function resolveConfigFiles(argv, extensions, defaultConfigFiles) {
	if (argv.config) {
		return parseConfigArgList(argv.config, extensions);
	}
	return findFirstExistingConfig(defaultConfigFiles);
}

/* Parse --config argument(s) */
function parseConfigArgList(configArg, extensions) {
	const configArgList = Array.isArray(configArg) ? configArg : [configArg];
	return configArgList.map((arg) => ({
		path: path.resolve(arg),
		ext: getConfigExtension(arg, extensions),
	}));
}

/* Determine extension for a given config path */
function getConfigExtension(configPath, extensions) {
	for (let i = extensions.length - 1; i >= 0; i--) {
		const ext = extensions[i];
		if (configPath.endsWith(ext)) {
			return ext;
		}
	}
	return path.extname(configPath);
}

/* Find first existing default config file */
function findFirstExistingConfig(defaultConfigFiles) {
	const found = [];
	for (let i = 0; i < defaultConfigFiles.length; i++) {
		const cfg = defaultConfigFiles[i];
		if (fs.existsSync(cfg.path)) {
			found.push({ path: cfg.path, ext: cfg.ext });
			break;
		}
	}
	return found;
}

/* Load and process config files */
function loadConfigFiles(configFiles, argv) {
	const options = [];
	configFiles.forEach((file) => {
		registerCompiler(interpret.extensions[file.ext]);
		options.push(requireConfig(file.path, argv));
	});
	return options;
}

/* Register compiler based on descriptor */
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

/* Require config, handling functions and ES6 default */
function requireConfig(configPath, argv) {
	let options = require(configPath);
	const isES6DefaultExportedFunc =
		typeof options === "object" && options !== null && typeof options.default === "function";

	if (typeof options === "function" || isES6DefaultExportedFunc) {
		options = isES6DefaultExportedFunc ? options.default : options;
		options = options(argv.env, argv);
	}
	return options;
}

/* Finalize processing of loaded options */
function finalizeOptions(options, argv, convertOptions, configFileLoaded) {
	if (!configFileLoaded) {
		return processConfiguredOptions({}, argv, convertOptions);
	}
	if (options.length === 1) {
		return processConfiguredOptions(options[0], argv, convertOptions);
	}
	return processConfiguredOptions(options, argv, convertOptions);
}

/* Process configured options (single or array) */
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
		opts.forEach((opt) => processOptions(opt, argv, convertOptions));
	} else {
		processOptions(opts, argv, convertOptions);
	}
	applyContextAndWatch(opts, argv);
	return opts;
}

/* Apply context and watch related flags */
function applyContextAndWatch(options, argv) {
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
		options.watchOptions.poll = typeof argv["watch-poll"] !== "boolean" ? +argv["watch-poll"] : true;
	}
	if (argv["watch-stdin"]) {
		options.watchOptions = options.watchOptions || {};
		options.watchOptions.stdin = true;
		options.watch = true;
	}
}

/* Process individual option object */
function processOptions(options, argv, convertOptions) {
	handleEntry(options, argv);
	handleModuleBind(options, argv);
	handleDefine(options, argv);
	handleOutputOptions(options, argv);
	handleWatchOptions(options, argv);
	handlePlugins(options, argv);
	handleResolveAliases(options, argv);
	ensureOutputFilename(options, argv, convertOptions);
	handleAdditionalEntries(options, argv);
	ensureEntryExists(options, argv);
}

/* Entry handling */
function handleEntry(options, argv) {
	ifArgPair(argv, "entry", (name, entry) => {
		if (options.entry && options.entry[name] !== undefined) {
			options.entry[name] = [].concat(options.entry[name]).concat(entry);
		} else {
			ensureObject(options, "entry");
			options.entry[name] = entry;
		}
	});
}

/* Module bind handling */
function handleModuleBind(options, argv) {
	bindLoaders(argv, options, "module-bind", "loaders");
	bindLoaders(argv, options, "module-bind-pre", "preLoaders");
	bindLoaders(argv, options, "module-bind-post", "postLoaders");
}

/* Define plugin handling */
function handleDefine(options, argv) {
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
}

/* Output related options */
function handleOutputOptions(options, argv) {
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
}

/* Watch related flags */
function handleWatchOptions(options, argv) {
	// Already handled in applyContextAndWatch; placeholder for future extensions
}

/* Plugin handling */
function handlePlugins(options, argv) {
	mapArgToBoolean(argv, "cache");
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
	ifArg(argv, "prefetch", (request) => {
		ensureArray(options, "plugins");
		const PrefetchPlugin = require("../lib/PrefetchPlugin");
		options.plugins.push(new PrefetchPlugin(request));
	});
	ifArg(argv, "provide", (value) => {
		ensureArray(options, "plugins");
		const idx = value.indexOf("=");
		const name = idx >= 0 ? value.substring(0, idx) : value;
		const val = idx >= 0 ? value.substring(idx + 1) : value;
		const ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, val));
	});
	ifArg(argv, "plugin", (value) => {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(value));
	});
	mapArgToBoolean(argv, "bail");
	mapArgToBoolean(argv, "profile");
}

/* Resolve alias handling */
function handleResolveAliases(options, argv) {
	processResolveAlias(argv, "resolve-alias", "resolve");
	processResolveAlias(argv, "resolve-loader-alias", "resolveLoader");
	ifArg(argv, "resolve-extensions", (value) => {
		ensureObject(options, "resolve");
		options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
	});
}

/* Ensure output filename exists, applying defaults */
function ensureOutputFilename(options, argv, convertOptions) {
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

/* Additional entry handling from positional arguments */
function handleAdditionalEntries(options, argv) {
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

/* Ensure entry exists, otherwise error */
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

/* Utility: ensure object property exists */
function ensureObject(parent, name) {
	if (typeof parent[name] !== "object" || parent[name] === null) {
		parent[name] = {};
	}
}

/* Utility: ensure array property exists */
function ensureArray(parent, name) {
	if (!Array.isArray(parent[name])) {
		parent[name] = [];
	}
}

/* Generic argument handling */
function ifArg(argv, name, fn, init, finalize) {
	const value = argv[name];
	if (Array.isArray(value)) {
		if (init) init();
		value.forEach((v) => fn(v, -1));
		if (finalize) finalize();
	} else if (value !== undefined && value !== null) {
		if (init) init();
		fn(value, -1);
		if (finalize) finalize();
	}
}

/* Pair argument handling (key=value) */
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

/* Boolean flag handling */
function ifBooleanArg(argv, name, fn) {
	ifArg(argv, name, (bool) => {
		if (bool) fn();
	});
}

/* Map argument to boolean option */
function mapArgToBoolean(argv, name, optionName) {
	ifArg(argv, name, (bool) => {
		if (bool === true) options[optionName || name] = true;
		else if (bool === false) options[optionName || name] = false;
	});
}

/* Load plugin by name */
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

/* Bind loaders to module configuration */
function bindLoaders(argv, options, argName, collection) {
	ifArgPair(argv, argName, (name, binding) => {
		if (name === null) {
			name = binding;
			binding += "-loader";
		}
		ensureObject(options, "module");
		ensureArray(options.module, collection);
		options.module[collection].push({
			test: new RegExp(`\\.${name.replace(/[\\-\\[\\]\\/\\{\\}\\(\\)\\*\\+\\?\\.\\\\\\^\\$\\|]/g, "\\$&")}$`),
			loader: binding,
		});
	});
}

/* Process resolve alias arguments */
function processResolveAlias(argv, arg, key) {
	ifArgPair(argv, arg, (name, value) => {
		if (!name) {
			throw new Error(`--${arg} <string>=<string>`);
		}
		ensureObject(options, key);
		ensureObject(options[key], "alias");
		options[key].alias[name] = value;
	});
}