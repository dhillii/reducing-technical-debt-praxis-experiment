```javascript
const path = require("path");
const fs = require("fs");
const interpret = require("interpret");

fs.existsSync = fs.existsSync || path.existsSync;

module.exports = function(yargs, argv, convertOptions) {
	applyShortcuts(argv);
	const configFiles = resolveConfigFiles(argv);
	const options = loadConfigFiles(configFiles);
	return processConfiguredOptions(options, argv, convertOptions);
};

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
		argv.define = [].concat(argv.define || []).concat("process.env.NODE_ENV=\"production\"");
	}
}

function getExtensionsSorted() {
	return Object.keys(interpret.extensions).sort((a, b) => {
		if (a === ".js") return -1;
		if (b === ".js") return 1;
		return a.length - b.length;
	});
}

function getDefaultConfigFiles(extensions) {
	return ["webpack.config", "webpackfile"]
		.flatMap(filename => extensions.map(ext => ({
			path: path.resolve(filename + ext),
			ext: ext
		})));
}

function resolveConfigFiles(argv) {
	const extensions = getExtensionsSorted();

	if (argv.config) {
		const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
		return configArgList.map(configArg => ({
			path: path.resolve(configArg),
			ext: getConfigExtension(configArg, extensions)
		}));
	}

	const defaultConfigFiles = getDefaultConfigFiles(extensions);
	for (const file of defaultConfigFiles) {
		if (fs.existsSync(file.path)) {
			return [file];
		}
	}
	return [];
}

function getConfigExtension(configPath, extensions) {
	for (let i = extensions.length - 1; i >= 0; i--) {
		const ext = extensions[i];
		if (configPath.endsWith(ext)) {
			return ext;
		}
	}
	return path.extname(configPath);
}

function registerCompiler(moduleDescriptor) {
	if (!moduleDescriptor) return;

	if (typeof moduleDescriptor === "string") {
		require(moduleDescriptor);
	} else if (Array.isArray(moduleDescriptor)) {
		for (const descriptor of moduleDescriptor) {
			try {
				registerCompiler(descriptor);
				break;
			} catch (e) {
				// continue to next
			}
		}
	} else if (typeof moduleDescriptor.register === "function") {
		moduleDescriptor.register(require(moduleDescriptor.module));
	}
}

function requireConfig(configPath) {
	let options = require(configPath);
	const isES6DefaultExport = typeof options?.default === "function";

	if (typeof options === "function" || isES6DefaultExport) {
		options = isES6DefaultExport ? options.default : options;
		options = options(argv.env, argv);
	}
	return options;
}

function loadConfigFiles(configFiles) {
	if (configFiles.length === 0) {
		return [];
	}

	const extensions = getExtensionsSorted();
	return configFiles.map(file => {
		registerCompiler(interpret.extensions[file.ext]);
		return requireConfig(file.path);
	});
}

function processConfiguredOptions(optionsList, argv, convertOptions) {
	if (optionsList.length === 0) {
		optionsList = [{}];
	} else if (optionsList.length === 1) {
		optionsList = [optionsList[0]];
	}

	const options = Array.isArray(optionsList) ? optionsList : [optionsList];

	for (const opts of options) {
		validateOptions(opts);
		if (typeof opts.then === "function") {
			return opts.then(o => processConfiguredOptions(o, argv, convertOptions));
		}
		if (typeof opts?.default === "object") {
			return processConfiguredOptions(opts.default, argv, convertOptions);
		}
		processOptions(opts, argv, convertOptions);
	}

	applyContextAndWatchOptions(options[0], argv);
	return options.length === 1 ? options[0] : options;
}

function validateOptions(options) {
	if (options === null || typeof options !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1);
	}
}

function applyContextAndWatchOptions(options, argv) {
	if (argv.context) {
		options.context = path.resolve(argv.context);
	}
	if (!options.context) {
		options.context = process.cwd();
	}

	if (argv.watch) {
		options.watch = true;
	}

	const watchOptions = {};
	if (argv["watch-aggregate-timeout"]) {
		watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
	}
	if (argv["watch-poll"]) {
		watchOptions.poll = typeof argv["watch-poll"] === "boolean" ? true : +argv["watch-poll"];
	}
	if (argv["watch-stdin"]) {
		watchOptions.stdin = true;
		options.watch = true;
	}

	if (Object.keys(watchOptions).length > 0) {
		options.watchOptions = { ...options.watchOptions, ...watchOptions };
	}
}

function processOptions(options, argv, convertOptions) {
	const argHandlers = new ArgHandlers(argv, options);

	argHandlers.entry();
	argHandlers.moduleBindings();
	argHandlers.define();
	argHandlers.output(convertOptions);
	argHandlers.records();
	argHandlers.target();
	argHandlers.cache();
	argHandlers.plugins();
	argHandlers.devtool();
	argHandlers.resolve();
	argHandlers.optimize();
	argHandlers.bail();
	argHandlers.profile();
	argHandlers.entries();
	argHandlers.validateEntry();
}

class ArgHandlers {
	constructor(argv, options) {
		this.argv = argv;
		this.options = options;
	}

	entry() {
		this.ifArgPair("entry", (name, entry) => {
			ensureObject(this.options, "entry");
			if (this.options.entry[name]) {
				this.options.entry[name] = [].concat(this.options.entry[name]).concat(entry);
			} else {
				this.options.entry[name] = entry;
			}
		});
	}

	moduleBindings() {
		const bindLoaders = (arg, collection) => {
			this.ifArgPair(arg, (name, binding) => {
				if (name === null) {
					name = binding;
					binding += "-loader";
				}
				ensureObject(this.options, "module");
				ensureArray(this.options.module, collection);
				this.options.module[collection].push({
					test: new RegExp("\\." + escapeRegex(name) + "$"),
					loader: binding
				});
			});
		};
		bindLoaders("module-bind", "loaders");
		bindLoaders("module-bind-pre", "preLoaders");
		bindLoaders("module-bind-post", "postLoaders");
	}

	define() {
		const defineObject = {};
		this.ifArgPair("define", (name, value) => {
			if (name === null) {
				name = value;
				value = true;
			}
			defineObject[name] = value;
		}, () => {
			ensureArray(this.options, "plugins");
			const DefinePlugin = require("../lib/DefinePlugin");
			this.options.plugins.push(new DefinePlugin(defineObject));
		});
	}

	output(convertOptions) {
		let noOutputFilenameDefined = !this.options.output?.filename;

		this.ifArg("output-path", value => {
			ensureObject(this.options, "output");
			this.options.output.path = path.resolve(value);
		});

		this.ifArg("output-filename", value => {
			ensureObject(this.options, "output");
			this.options.output.filename = value;
			noOutputFilenameDefined = false;
		});

		this.ifArg("output-chunk-filename", value => {
			ensureObject(this.options, "output");
			this.options.output.chunkFilename = value;
		});

		this.ifArg("output-source-map-filename", value => {
			ensureObject(this.options, "output");
			this.options.output.sourceMapFilename = value;
		});

		this.ifArg("output-public-path", value => {
			ensureObject(this.options, "output");
			this.options.output.publicPath = value;
		});

		this.ifArg("output-jsonp-function", value => {
			ensureObject(this.options, "output");
			this.options.output.jsonpFunction = value;
		});

		this.ifBooleanArg("output-pathinfo", () => {
			ensureObject(this.options, "output");
			this.options.output.pathinfo = true;
		});

		this.ifArg("output-library", value => {
			ensureObject(this.options, "output");
			this.options.output.library = value;
		});

		this.ifArg("output-library-target", value => {
			ensureObject(this.options, "output");
			this.options.output.libraryTarget = value;
		});

		if (noOutputFilenameDefined) {
			this.resolveOutputFilename(convertOptions);
		}
	}

	resolveOutputFilename(convertOptions) {
		ensureObject(this.options, "output");

		if (convertOptions?.outputFilename) {
			this.options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
			this.options.output.filename = path.basename(convertOptions.outputFilename);
		} else if (this.argv._.length > 0) {
			const filename = this.argv._.pop();
			this.options.output.path = path.resolve(path.dirname(filename));
			this.options.output.filename = path.basename(filename);
		} else {
			console.error("No configuration file found and no output filename configured via CLI option.");
			console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
			console.error("Use --help to display the CLI options.");
			process.exit(-1);
		}
	}

	records() {
		this.ifArg("records-input-path", value => {
			this.options.recordsInputPath = path.resolve(value);
		});

		this.ifArg("records-output-path", value => {
			this.options.recordsOutputPath = path.resolve(value);
		});

		this.ifArg("records-path", value => {
			this.options.recordsPath = path.resolve(value);
		});
	}

	target() {
		this.ifArg("target", value => {
			this.options.target = value;
		});
	}

	cache() {
		this.mapArgToBoolean("cache");
	}

	plugins() {
		this.ifBooleanArg("hot", () => {
			ensureArray(this.options, "plugins");
			const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
			this.options.plugins.push(new HotModuleReplacementPlugin());
		});

		this.ifBooleanArg("debug", () => {
			ensureArray(this.options, "plugins");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			this.options.plugins.push(new LoaderOptionsPlugin({ debug: true }));
		});

		this.ifArg("prefetch", request => {
			ensureArray(this.options, "plugins");
			const PrefetchPlugin = require("../lib/PrefetchPlugin");
			this.options.plugins.push(new PrefetchPlugin(request));
		});

		this.ifArg("provide", value => {
			ensureArray(this.options, "plugins");
			const idx = value.indexOf("=");
			const name = idx >= 0 ? value.substr(0, idx) : value;
			const val = idx >= 0 ? value.substr(idx + 1) : value;
			const ProvidePlugin = require("../lib/ProvidePlugin");
			this.options.plugins.push(new ProvidePlugin(name, val));
		});

		this.ifArg("plugin", value => {
			ensureArray(this.options, "plugins");
			this.options.plugins.push(loadPlugin(value));
		});
	}

	devtool() {
		this.ifArg("devtool", value => {
			this.options.devtool = value;
		});
	}

	resolve() {
		const processResolveAlias = (arg, key) => {
			this.ifArgPair(arg, (name, value) => {
				if (!name) {
					throw new Error(`--${arg} <string>=<string>`);
				}
				ensureObject(this.options, key);
				ensureObject(this.options[key], "alias");
				this.options[key].alias[name] = value;
			});
		};

		processResolveAlias("resolve-alias", "resolve");
		processResolveAlias("resolve-loader-alias", "resolveLoader");

		this.ifArg("resolve-extensions", value => {
			ensureObject(this.options, "resolve");
			this.options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
		});
	}

	optimize() {
		this.ifArg("optimize-max-chunks", value => {
			ensureArray(this.options, "plugins");
			const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			this.options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
		});

		this.ifArg("optimize-min-chunk-size", value => {
			ensureArray(this.options, "plugins");
			const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
			this.options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
		});

		this.ifBooleanArg("optimize-minimize", () => {
			ensureArray(this.options, "plugins");
			const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			const hasSourceMap = this.options.devtool && 
				(this.options.devtool.includes("sourcemap") || this.options.devtool.includes("source-map"));
			this.options.plugins.push(new UglifyJsPlugin({ sourceMap: hasSourceMap }));
			this.options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
		});
	}

	bail() {
		this.mapArgToBoolean("bail");
	}

	profile() {
		this.mapArgToBoolean("profile");
	}

	entries() {
		if (this.argv._.length === 0) return;

		if (Array.isArray(this.options.entry) || typeof this.options.entry === "string") {
			this.options.entry = { main: this.options.entry };
		}
		ensureObject(this.options, "entry");

		this.argv._.