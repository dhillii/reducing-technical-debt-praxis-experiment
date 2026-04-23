const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

module.exports = function(yargs, argv, convertOptions) {
	// Shortcut flags
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

	const extensions = getSortedExtensions();
	const defaultConfigFiles = getDefaultConfigFiles(extensions);
	const configFiles = resolveConfigFiles(argv, extensions, defaultConfigFiles);
	let configFileLoaded = false;
	const options = [];

	if (configFiles.length > 0) {
		configFiles.forEach(file => {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path, argv));
		});
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
 * Returns extensions sorted with .js first and then by length.
 */
function getSortedExtensions() {
	const exts = Object.keys(interpret.extensions);
	exts.sort((a, b) => {
		if (a === ".js") return -1;
		if (b === ".js") return 1;
		return a.length - b.length;
	});
	return exts;
}

/**
 * Generates default config file candidates based on known extensions.
 */
function getDefaultConfigFiles(extensions) {
	const baseNames = ["webpack.config", "webpackfile"];
	return baseNames
		.map(name => extensions.map(ext => ({ path: path.resolve(name + ext), ext })))
		.reduce((a, i) => a.concat(i), []);
}

/**
 * Resolves configuration files from CLI args or defaults.
 */
function resolveConfigFiles(argv, extensions, defaultConfigFiles) {
	if (argv.config) {
		const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
		return configArgList.map(arg => mapConfigArg(arg, extensions));
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
 * Determines the file extension for a given config path.
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
 * Maps a config argument to an object containing resolved path and extension.
 */
function mapConfigArg(configArg, extensions) {
	const resolvedPath = path.resolve(configArg);
	const ext = getConfigExtension(resolvedPath, extensions);
	return { path: resolvedPath, ext };
}

/**
 * Registers a compiler based on the module descriptor.
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
			} catch (_) {
				// ignore and try next
			}
		}
	}
}

/**
 * Requires a config file and resolves it if it exports a function.
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
 * Processes the final configuration object(s) applying CLI overrides.
 */
function processConfiguredOptions(config, argv, convertOptions) {
	if (config === null || typeof config !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1);
	}
	if (typeof config.then === "function") {
		return config.then(res => processConfiguredOptions(res, argv, convertOptions));
	}
	if (typeof config === "object" && typeof config.default === "object") {
		return processConfiguredOptions(config.default, argv, convertOptions);
	}
	if (Array.isArray(config)) {
		config.forEach(opt => processOptions(opt, argv));
	} else {
		processOptions(config, argv);
	}
	applyGlobalOverrides(config, argv, convertOptions);
	return config;
}

/**
 * Applies global CLI overrides that are not specific to a single config.
 */
function applyGlobalOverrides(options, argv, convertOptions) {
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

/**
 * Processes a single configuration object, handling CLI arguments.
 */
function processOptions(options, argv) {
	const noOutputFilenameDefined = !(options.output && options.output.filename);

	const ifArg = (name, fn, init, finalize) => {
		if (Array.isArray(argv[name])) {
			if (init) init();
			argv[name].forEach(fn);
			if (finalize) finalize();
		} else if (argv[name] != null) {
			if (init) init();
			fn(argv[name], -1);
			if (finalize) finalize();
		}
	};

	const ifArgPair = (name, fn, init, finalize) => {
		ifArg(name, (content, idx) => {
			const eqIdx = content.indexOf("=");
			if (eqIdx < 0) {
				return fn(null, content, idx);
			}
			return fn(content.substring(0, eqIdx), content.substring(eqIdx + 1), idx);
		}, init, finalize);
	};

	const ifBooleanArg = (name, fn) => {
		ifArg(name, bool => {
			if (bool) fn();
		});
	};

	const mapArgToBoolean = (name, optionName) => {
		ifArg(name, bool => {
			if (bool === true) options[optionName || name] = true;
			else if (bool === false) options[optionName || name] = false;
		});
	};

	const ensureObject = (parent, name) => {
		if (typeof parent[name] !== "object" || parent[name] === null) {
			parent[name] = {};
		}
	};

	const ensureArray = (parent, name) => {
		if (!Array.isArray(parent[name])) {
			parent[name] = [];
		}
	};

	// Entry handling
	ifArgPair("entry", (name, entry) => {
		if (options.entry && options.entry[name] != null) {
			options.entry[name] = [].concat(options.entry[name]).concat(entry);
		} else {
			options.entry[name] = entry;
		}
	}, () => ensureObject(options, "entry"));

	// Loader bindings
	const bindLoaders = (arg, collection) => {
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
	};
	bindLoaders("module-bind", "loaders");
	bindLoaders("module-bind-pre", "preLoaders");
	bindLoaders("module-bind-post", "postLoaders");

	// Define plugin
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

	// Output options
	ifArg("output-path", value => {
		ensureObject(options, "output");
		options.output.path = path.resolve(value);
	});
	ifArg("output-filename", value => {
		ensureObject(options, "output");
		options.output.filename = value;
	});
	ifArg("output-chunk-filename", value => {
		ensureObject(options, "output");
		options.output.chunkFilename = value;
	});
	ifArg("output-source-map-filename", value => {
		ensureObject(options, "output");
		options.output.sourceMapFilename = value;
	});
	ifArg("output-public-path", value => {
		ensureObject(options, "output");
		options.output.publicPath = value;
	});
	ifArg("output-jsonp-function", value => {
		ensureObject(options, "output");
		options.output.jsonpFunction = value;
	});
	ifBooleanArg("output-pathinfo", () => {
		ensureObject(options, "output");
		options.output.pathinfo = true;
	});
	ifArg("output-library", value => {
		ensureObject(options, "output");
		options.output.library = value;
	});
	ifArg("output-library-target", value => {
		ensureObject(options, "output");
		options.output.libraryTarget = value;
	});

	// Records options
	ifArg("records-input-path", value => {
		options.recordsInputPath = path.resolve(value);
	});
	ifArg("records-output-path", value => {
		options.recordsOutputPath = path.resolve(value);
	});
	ifArg("records-path", value => {
		options.recordsPath = path.resolve(value);
	});

	// General options
	ifArg("target", value => {
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

	ifArg("devtool", value => {
		options.devtool = value;
	});

	// Resolve aliases
	const processResolveAlias = (arg, key) => {
		ifArgPair(arg, (name, value) => {
			if (!name) throw new Error(`--${arg} <string>=<string>`);
			ensureObject(options, key);
			ensureObject(options[key], "alias");
			options[key].alias[name] = value;
		});
	};
	processResolveAlias("resolve-alias", "resolve");
	processResolveAlias("resolve-loader-alias", "resolveLoader");

	ifArg("resolve-extensions", value => {
		ensureObject(options, "resolve");
		options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
	});

	// Optimization plugins
	ifArg("optimize-max-chunks", value => {
		ensureArray(options, "plugins");
		const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
		options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
	});
	ifArg("optimize-min-chunk-size", value => {
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
					(options.devtool.includes("sourcemap") || options.devtool.includes("source-map"))
			})
		);
		options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
	});

	// Misc plugins
	ifArg("prefetch", request => {
		ensureArray(options, "plugins");
		const PrefetchPlugin = require("../lib/PrefetchPlugin");
		options.plugins.push(new PrefetchPlugin(request));
	});
	ifArg("provide", value => {
		ensureArray(options, "plugins");
		const idx = value.indexOf("=");
		const name = idx >= 0 ? value.substring(0, idx) : value;
		const module = idx >= 0 ? value.substring(idx + 1) : value;
		const ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, module));
	});
	ifArg("plugin", value => {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(value));
	});

	mapArgToBoolean("bail");
	mapArgToBoolean("profile");

	// Ensure output filename
	if (noOutputFilenameDefined) {
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

	// Process positional entries
	if (argv._.length > 0) {
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

		argv._.forEach(content => {
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

	// Validate entry presence
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

/**
 * Loads a plugin by name, handling query parameters and resolution.
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