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
				// continue
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

	return handleOptions(optionsList, argv, convertOptions);
}

function handleOptions(optionsList, argv, convertOptions) {
	const options = Array.isArray(optionsList) ? optionsList : [optionsList];

	for (const opts of options) {
		validateOptions(opts);
		if (typeof opts.then === "function") {
			return opts.then(opt => handleOptions(opt, argv, convertOptions));
		}
		if (opts.default && typeof opts.default === "object") {
			return handleOptions(opts.default, argv, convertOptions);
		}
	}

	options.forEach(opts => processOptions(opts, argv, convertOptions));
	applyContextAndWatchOptions(options, argv);

	return options.length === 1 ? options[0] : options;
}

function validateOptions(options) {
	if (options === null || typeof options !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1);
	}
}

function applyContextAndWatchOptions(options, argv) {
	const opts = Array.isArray(options) ? options[0] : options;

	if (argv.context) {
		opts.context = path.resolve(argv.context);
	}
	if (!opts.context) {
		opts.context = process.cwd();
	}

	if (argv.watch) {
		opts.watch = true;
	}

	opts.watchOptions = opts.watchOptions || {};

	if (argv["watch-aggregate-timeout"]) {
		opts.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
	}

	if (argv["watch-poll"]) {
		opts.watchOptions.poll = argv["watch-poll"] === true ? true : +argv["watch-poll"];
	}

	if (argv["watch-stdin"]) {
		opts.watchOptions.stdin = true;
		opts.watch = true;
	}
}

function processOptions(options, argv, convertOptions) {
	const argHandlers = createArgHandlers(argv, options);
	
	argHandlers.processEntry();
	argHandlers.processLoaders();
	argHandlers.processDefine();
	argHandlers.processOutput();
	argHandlers.processRecords();
	argHandlers.processTarget();
	argHandlers.processCache();
	argHandlers.processPlugins();
	argHandlers.processResolve();
	argHandlers.processOptimization();
	argHandlers.processDevtool();
	argHandlers.processBail();
	argHandlers.processProfile();
	argHandlers.ensureOutputFilename(convertOptions);
	argHandlers.processPositionalArgs();
	argHandlers.validateEntry();
}

function createArgHandlers(argv, options) {
	const handlers = {
		ifArg: createIfArg(argv),
		ifArgPair: createIfArgPair(argv),
		ifBooleanArg: createIfBooleanArg(argv),
		mapArgToBoolean: createMapArgToBoolean(argv, options),
		ensureObject: (parent, name) => {
			if (typeof parent[name] !== "object" || parent[name] === null) {
				parent[name] = {};
			}
		},
		ensureArray: (parent, name) => {
			if (!Array.isArray(parent[name])) {
				parent[name] = [];
			}
		}
	};

	return {
		processEntry() {
			handlers.ifArgPair("entry", (name, entry) => {
				if (typeof options.entry?.[name] !== "undefined") {
					options.entry[name] = [].concat(options.entry[name]).concat(entry);
				} else {
					options.entry[name] = entry;
				}
			}, () => handlers.ensureObject(options, "entry"));
		},

		processLoaders() {
			const bindLoaders = (arg, collection) => {
				handlers.ifArgPair(arg, (name, binding) => {
					if (name === null) {
						name = binding;
						binding += "-loader";
					}
					options.module[collection].push({
						test: new RegExp("\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
						loader: binding
					});
				}, () => {
					handlers.ensureObject(options, "module");
					handlers.ensureArray(options.module, collection);
				});
			};

			bindLoaders("module-bind", "loaders");
			bindLoaders("module-bind-pre", "preLoaders");
			bindLoaders("module-bind-post", "postLoaders");
		},

		processDefine() {
			let defineObject;
			handlers.ifArgPair("define", (name, value) => {
				if (name === null) {
					name = value;
					value = true;
				}
				defineObject[name] = value;
			}, () => {
				defineObject = {};
			}, () => {
				handlers.ensureArray(options, "plugins");
				const DefinePlugin = require("../lib/DefinePlugin");
				options.plugins.push(new DefinePlugin(defineObject));
			});
		},

		processOutput() {
			const outputHandlers = {
				"output-path": (value) => {
					handlers.ensureObject(options, "output");
					options.output.path = path.resolve(value);
				},
				"output-filename": (value) => {
					handlers.ensureObject(options, "output");
					options.output.filename = value;
				},
				"output-chunk-filename": (value) => {
					handlers.ensureObject(options, "output");
					options.output.chunkFilename = value;
				},
				"output-source-map-filename": (value) => {
					handlers.ensureObject(options, "output");
					options.output.sourceMapFilename = value;
				},
				"output-public-path": (value) => {
					handlers.ensureObject(options, "output");
					options.output.publicPath = value;
				},
				"output-jsonp-function": (value) => {
					handlers.ensureObject(options, "output");
					options.output.jsonpFunction = value;
				},
				"output-library": (value) => {
					handlers.ensureObject(options, "output");
					options.output.library = value;
				},
				"output-library-target": (value) => {
					handlers.ensureObject(options, "output");
					options.output.libraryTarget = value;
				}
			};

			Object.entries(outputHandlers).forEach(([key, handler]) => {
				handlers.ifArg(key, handler);
			});

			handlers.ifBooleanArg("output-pathinfo", () => {
				handlers.ensureObject(options, "output");
				options.output.pathinfo = true;
			});
		},

		processRecords() {
			handlers.ifArg("records-input-path", (value) => {
				options.recordsInputPath = path.resolve(value);
			});
			handlers.ifArg("records-output-path", (value) => {
				options.recordsOutputPath = path.resolve(value);
			});
			handlers.ifArg("records-path", (value) => {
				options.recordsPath = path.resolve(value);
			});
		},

		processTarget() {
			handlers.ifArg("target", (value) => {
				options.target = value;
			});
		},

		processCache() {
			handlers.mapArgToBoolean("cache");
		},

		processPlugins() {
			handlers.ifBooleanArg("hot", () => {
				handlers.ensureArray(options, "plugins");
				const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
				options.plugins.push(new HotModuleReplacementPlugin());
			});

			handlers.ifBooleanArg("debug", () => {
				handlers.ensureArray(options, "plugins");
				const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
				options.plugins.push(new LoaderOptionsPlugin({ debug: true }));
			});

			handlers.ifArg("prefetch", (request) => {
				handlers.ensureArray(options, "plugins");
				const PrefetchPlugin = require("../lib/PrefetchPlugin");
				options.plugins.push(new PrefetchPlugin(request));
			});

			handlers.ifArg("provide", (value) => {
				handlers.ensureArray(options, "plugins");
				const idx = value.indexOf("=");
				const name = idx >= 0 ? value.substr(0, idx) : value;
				const val = idx >= 0 ? value.substr(idx + 1) : value;
				const ProvidePlugin = require("../lib/ProvidePlugin");
				options.plugins.push(new ProvidePlugin(name, val));
			});

			handlers.ifArg("plugin", (value) => {
				handlers.ensureArray(options, "plugins");
				options.plugins.push(loadPlugin(value));
			});
		},

		processResolve() {
			const processResolveAlias = (arg, key) => {
				handlers.ifArgPair(arg, (name, value) => {
					if (!name) throw new Error(`--${arg} <string>=<string>`);
					handlers.ensureObject(options, key);
					handlers.ensureObject(options[key], "alias");
					options[key].alias[name] = value;
				});
			};

			processResolveAlias("resolve-alias", "resolve");
			processResolveAlias("resolve-loader-alias", "resolveLoader");

			handlers.ifArg("resolve-extensions", (value) => {
				handlers.ensureObject(options, "resolve");
				options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
			});
		},

		processOptimization() {
			handlers.ifArg("optimize-max-chunks", (value) => {
				handlers.ensureArray(options, "plugins");
				const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
				options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
			});

			handlers.ifArg("optimize-min-chunk-size", (value) => {
				handlers.ensureArray(options, "plugins");
				const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
				options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
			});

			handlers.ifBooleanArg("optimize-minimize", () => {
				handlers.ensureArray(options, "plugins");
				const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
				const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
				const hasSourceMap = options.devtool && 
					(options.devtool.includes("sourcemap") || options.devtool.includes("source-map"));
				options.plugins.push(new UglifyJsPlugin({ sourceMap: hasSourceMap }));
				options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
			});
		},

		processDevtool() {
			handlers.ifArg("devtool", (value) => {
				options.devtool = value;
			});
		},

		processBail() {
			handlers.mapArgToBoolean("bail");
		},

		processProfile() {
			handlers.mapArgToBoolean("profile");
		},

		ensureOutputFilename(convertOptions) {
			const hasOutputFilename = options.output?.filename;
			if (hasOutputFilename) return;

			handlers.ensureObject(options, "output");

			if (convertOptions?.outputFilename) {
				options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
				options.output.filename = path.basename(convertOptions.outputFilename);
			} else if (argv._.length > 0) {
				const filename =