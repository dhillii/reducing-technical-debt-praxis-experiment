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

	const extensions = getSortedExtensions();
	const configFiles = resolveConfigFiles(argv, extensions);
	let configFileLoaded = false;

	if (configFiles.length > 0) {
		loadCompilersAndConfigs(configFiles, options, argv);
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
 * Apply shortcut flags (-d, -p) to argv.
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
 * Return sorted list of file extensions supported by interpret.
 */
function getSortedExtensions() {
	return Object.keys(interpret.extensions).sort((a, b) => {
		if (a === ".js") return -1;
		if (b === ".js") return 1;
		return a.length - b.length;
	});
}

/**
 * Resolve configuration files based on argv or default filenames.
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
 * Determine file extension for a given config path.
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
 * Map a config argument to an object containing resolved path and extension.
 */
function mapConfigArg(configArg, extensions) {
	const resolvedPath = path.resolve(configArg);
	const extension = getConfigExtension(resolvedPath, extensions);
	return { path: resolvedPath, ext: extension };
}

/**
 * Load required compilers and configuration files.
 */
function loadCompilersAndConfigs(configFiles, options, argv) {
	configFiles.forEach((file) => {
		registerCompiler(interpret.extensions[file.ext]);
		options.push(requireConfig(file.path, argv));
	});
}

/**
 * Register a compiler based on interpret's module descriptor.
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
 */
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

/**
 * Process the final configuration object(s) after loading.
 */
function processConfiguredOptions(options, argv, convertOptions) {
	if (options === null || typeof options !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1); // eslint-disable-line
	}

	// Handle Promise export
	if (typeof options.then === "function") {
		return options.then((resolved) => processConfiguredOptions(resolved, argv, convertOptions));
	}

	// Handle ES6 default export
	if (typeof options === "object" && typeof options.default === "object") {
		return processConfiguredOptions(options.default, argv, convertOptions);
	}

	if (Array.isArray(options)) {
		options.forEach((opt) => processOptions(opt, argv, convertOptions));
	} else {
		processOptions(options, argv, convertOptions);
	}
	return options;
}

/**
 * Apply CLI arguments to a single webpack configuration object.
 */
function processOptions(options, argv, convertOptions) {
	const noOutputFilenameDefined = !options.output || !options.output.filename;

	handleEntry(options, argv);
	handleModuleBind(options, argv);
	handleDefine(options, argv);
	handleOutput(options, argv);
	handleWatchOptions(options, argv);
	handlePlugins(options, argv);
	handleResolveAliases(options, argv);
	handleOutputFilenameFallback(options, argv, convertOptions, noOutputFilenameDefined);
	handleCliEntries(options, argv);
	validateEntry(options, argv, convertOptions);
}

/**
 * Process entry related arguments.
 */
function handleEntry(options, argv) {
	ifArgPair(
		argv,
		"entry",
		(name, entry) => {
			if (options.entry && options.entry[name] !== undefined) {
				options.entry[name] = [].concat(options.entry[name]).concat(entry);
			} else {
				if (!options.entry) options.entry = {};
				options.entry[name] = entry;
			}
		},
		() => ensureObject(options, "entry")
	);
}

/**
 * Process module-bind arguments.
 */
function handleModuleBind(options, argv) {
	const bindLoaders = (arg, collection) => {
		ifArgPair(
			argv,
			arg,
			(name, binding) => {
				if (name === null) {
					name = binding;
					binding += "-loader";
				}
				ensureObject(options, "module");
				ensureArray(options.module, collection);
				options.module[collection].push({
					test: new RegExp(
						"\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"
					),
					loader: binding,
				});
			},
			() => {}
		);
	};
	bindLoaders("module-bind", "loaders");
	bindLoaders("module-bind-pre", "preLoaders");
	bindLoaders("module-bind-post", "postLoaders");
}

/**
 * Process define arguments.
 */
function handleDefine(options, argv) {
	let defineObject = null;
	ifArgPair(
		argv,
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
 * Process output related arguments.
 */
function handleOutput(options, argv) {
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

/**
 * Process watch related arguments.
 */
function handleWatchOptions(options, argv) {
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
 * Process plugin related arguments.
 */
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
					(options.devtool.indexOf("sourcemap") >= 0 ||
						options.devtool.indexOf("source-map") >= 0),
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
		let name, modulePath;
		if (idx >= 0) {
			name = value.substr(0, idx);
			modulePath = value.substr(idx + 1);
		} else {
			name = value;
			modulePath = value;
		}
		const ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, modulePath));
	});
	ifArg(argv, "plugin", (value) => {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(value));
	});
	mapArgToBoolean(argv, "bail");
	mapArgToBoolean(argv, "profile");
}

/**
 * Process resolve alias arguments.
 */
function handleResolveAliases(options, argv) {
	const processResolveAlias = (arg, key) => {
		ifArgPair(argv, arg, (name, value) => {
			if (!name) {
				throw new Error(`--${arg} <string>=<string>`);
			}
			ensureObject(options, key);
			ensureObject(options[key], "alias");
			options[key].alias[name] = value;
		});
	};
	processResolveAlias("resolve-alias", "resolve");
	processResolveAlias("resolve-loader-alias", "resolveLoader");
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
 * Ensure output filename is defined, applying defaults if necessary.
 */
function handleOutputFilenameFallback(
	options,
	argv,
	convertOptions,
	noOutputFilenameDefined
) {
	if (!noOutputFilenameDefined) return;
	ensureObject(options, "output");
	if (convertOptions && convertOptions.outputFilename) {
		options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
		options.output.filename = path.basename(convertOptions.outputFilename);
	} else if (argv._.length > 0) {
		options.output.filename = argv._.pop();
		options.output.path = path.resolve(path.dirname(options.output.filename));
		options.output.filename = path.basename(options.output.filename);
	} else {
		console.error("No configuration file found and no output filename configured via CLI option.");
		console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
		console.error("Use --help to display the CLI options.");
		process.exit(-1); // eslint-disable-line
	}
}

/**
 * Process remaining CLI positional arguments as entries.
 */
function handleCliEntries(options, argv) {
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
			addTo(content.substr(0, i), content.substr(i + 1));
		}
	});
}

/**
 * Validate that an entry point exists after processing.
 */
function validateEntry(options, argv) {
	if (!options.entry) {
		if (argv.config) {
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
 * Helper to process an argument that may be an array or single value.
 */
function ifArg(argv, name, fn) {
	if (Array.isArray(argv[name])) {
		argv[name].forEach(fn);
	} else if (argv[name] !== undefined && argv[name] !== null) {
		fn(argv[name]);
	}
}

/**
 * Helper to process an argument that may be a key=value pair.
 */
function ifArgPair(argv, name, fn, init, finalize) {
	if (Array.isArray(argv[name])) {
		if (init) init();
		argv[name].forEach((content, idx) => {
			const i = content.indexOf("=");
			if (i < 0) {
				fn(null, content, idx);
			} else {
				fn(content.substr(0, i), content.substr(i + 1), idx);
			}
		});
		if (finalize) finalize();
	} else if (argv[name] !== undefined && argv[name] !== null) {
		if (init) init();
		const content = argv[name];
		const i = content.indexOf("=");
		if (i < 0) {
			fn(null, content, -1);
		} else {
			fn(content.substr(0, i), content.substr(i + 1), -1);
		}
		if (finalize) finalize();
	}
}

/**
 * Helper to process a boolean flag.
 */
function ifBooleanArg(argv, name, fn) {
	if (Array.isArray(argv[name])) {
		argv[name].forEach((bool) => {
			if (bool) fn();
		});
	} else if (argv[name]) {
		fn();
	}
}

/**
 * Map a CLI argument to a boolean option on the configuration.
 */
function mapArgToBoolean(argv, name, optionName) {
	if (Array.isArray(argv[name])) {
		argv[name].forEach((bool) => {
			if (bool === true) options[optionName || name] = true;
			else if (bool === false) options[optionName || name] = false;
		});
	} else if (argv[name] !== undefined && argv[name] !== null) {
		if (argv[name] === true) options[optionName || name] = true;
		else if (argv[name] === false) options[optionName || name] = false;
	}
}

/**
 * Load a plugin by name, handling query parameters.
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