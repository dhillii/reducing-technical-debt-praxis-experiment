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

	function applyShortcuts(argv) {
		if(argv.d) {
			argv.debug = true;
			argv["output-pathinfo"] = true;
			if(!argv.devtool) {
				argv.devtool = "eval-cheap-module-source-map";
			}
		}
		if(argv.p) {
			argv["optimize-minimize"] = true;
			argv.define = [].concat(argv.define || []).concat("process.env.NODE_ENV=\"production\"");
		}
	}

	function resolveConfigFiles(argv) {
		if(argv.config) {
			return resolveExplicitConfigFiles(argv.config);
		}
		return resolveDefaultConfigFiles();
	}

	function resolveExplicitConfigFiles(configArg) {
		const configArgList = Array.isArray(configArg) ? configArg : [configArg];
		return configArgList.map(arg => ({
			path: path.resolve(arg),
			ext: getConfigExtension(path.resolve(arg))
		}));
	}

	function resolveDefaultConfigFiles() {
		const extensions = getSortedExtensions();
		const defaultNames = ["webpack.config", "webpackfile"];
		
		for(const name of defaultNames) {
			for(const ext of extensions) {
				const configPath = path.resolve(name + ext);
				if(fs.existsSync(configPath)) {
					return [{ path: configPath, ext }];
				}
			}
		}
		return [];
	}

	function getSortedExtensions() {
		return Object.keys(interpret.extensions).sort((a, b) => {
			if(a === ".js") return -1;
			if(b === ".js") return 1;
			return a.length - b.length;
		});
	}

	function getConfigExtension(configPath) {
		const extensions = getSortedExtensions();
		for(let i = extensions.length - 1; i >= 0; i--) {
			const ext = extensions[i];
			if(configPath.endsWith(ext)) {
				return ext;
			}
		}
		return path.extname(configPath);
	}

	function loadConfigFiles(configFiles) {
		if(configFiles.length === 0) {
			return [];
		}

		return configFiles.map(file => {
			registerCompiler(interpret.extensions[file.ext]);
			return requireConfig(file.path);
		});
	}

	function registerCompiler(moduleDescriptor) {
		if(!moduleDescriptor) return;

		if(typeof moduleDescriptor === "string") {
			require(moduleDescriptor);
		} else if(Array.isArray(moduleDescriptor)) {
			for(const descriptor of moduleDescriptor) {
				try {
					registerCompiler(descriptor);
					break;
				} catch(e) {
					// Continue to next descriptor
				}
			}
		} else if(typeof moduleDescriptor.register === "function") {
			moduleDescriptor.register(require(moduleDescriptor.module));
		}
	}

	function requireConfig(configPath) {
		let options = require(configPath);
		const isES6DefaultExport = typeof options?.default === "function";
		
		if(typeof options === "function" || isES6DefaultExport) {
			options = isES6DefaultExport ? options.default : options;
			options = options(argv.env, argv);
		}
		return options;
	}

	function processConfiguredOptions(configOptions, argv, convertOptions) {
		const options = Array.isArray(configOptions) ? configOptions : 
		                configOptions.length === 0 ? [{}] : [configOptions];

		return handleAsyncOptions(options[0], argv, convertOptions);
	}

	function handleAsyncOptions(options, argv, convertOptions) {
		if(options === null || typeof options !== "object") {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1);
		}

		if(typeof options.then === "function") {
			return options.then(opts => handleAsyncOptions(opts, argv, convertOptions));
		}

		if(typeof options.default === "object") {
			return handleAsyncOptions(options.default, argv, convertOptions);
		}

		const optionsArray = Array.isArray(options) ? options : [options];
		optionsArray.forEach(opts => processOptions(opts, argv, convertOptions));

		return Array.isArray(options) ? options : options;
	}

	function processOptions(options, argv, convertOptions) {
		const argHandlers = new ArgHandlers(argv, options);
		
		applyContextOptions(options, argv);
		applyWatchOptions(options, argv);
		applyOutputOptions(options, argv, argHandlers);
		applyRecordsOptions(options, argv, argHandlers);
		applyTargetAndCache(options, argv, argHandlers);
		applyPlugins(options, argv, argHandlers);
		applyResolveOptions(options, argv, argHandlers);
		applyOptimizationOptions(options, argv, argHandlers);
		applyEntryAndOutput(options, argv, convertOptions, argHandlers);
		validateEntry(options, argv);
	}

	function applyContextOptions(options, argv) {
		if(argv.context) {
			options.context = path.resolve(argv.context);
		}
		if(!options.context) {
			options.context = process.cwd();
		}
	}

	function applyWatchOptions(options, argv) {
		if(argv.watch) {
			options.watch = true;
		}
		if(argv["watch-aggregate-timeout"]) {
			options.watchOptions = options.watchOptions || {};
			options.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
		}
		if(argv["watch-poll"]) {
			options.watchOptions = options.watchOptions || {};
			options.watchOptions.poll = typeof argv["watch-poll"] === "boolean" ? true : +argv["watch-poll"];
		}
		if(argv["watch-stdin"]) {
			options.watchOptions = options.watchOptions || {};
			options.watchOptions.stdin = true;
			options.watch = true;
		}
	}

	function applyOutputOptions(options, argv, argHandlers) {
		const outputMappings = {
			"output-path": (value) => ({ path: path.resolve(value) }),
			"output-filename": (value) => ({ filename: value }),
			"output-chunk-filename": (value) => ({ chunkFilename: value }),
			"output-source-map-filename": (value) => ({ sourceMapFilename: value }),
			"output-public-path": (value) => ({ publicPath: value }),
			"output-jsonp-function": (value) => ({ jsonpFunction: value }),
			"output-library": (value) => ({ library: value }),
			"output-library-target": (value) => ({ libraryTarget: value })
		};

		Object.entries(outputMappings).forEach(([arg, mapper]) => {
			argHandlers.ifArg(arg, (value) => {
				ensureObject(options, "output");
				Object.assign(options.output, mapper(value));
			});
		});

		argHandlers.ifBooleanArg("output-pathinfo", () => {
			ensureObject(options, "output");
			options.output.pathinfo = true;
		});
	}

	function applyRecordsOptions(options, argv, argHandlers) {
		const recordsMappings = {
			"records-input-path": "recordsInputPath",
			"records-output-path": "recordsOutputPath",
			"records-path": "recordsPath"
		};

		Object.entries(recordsMappings).forEach(([arg, optionName]) => {
			argHandlers.ifArg(arg, (value) => {
				options[optionName] = path.resolve(value);
			});
		});
	}

	function applyTargetAndCache(options, argv, argHandlers) {
		argHandlers.ifArg("target", (value) => {
			options.target = value;
		});
		argHandlers.mapArgToBoolean("cache");
		argHandlers.ifArg("devtool", (value) => {
			options.devtool = value;
		});
	}

	function applyPlugins(options, argv, argHandlers) {
		argHandlers.ifBooleanArg("hot", () => {
			ensureArray(options, "plugins");
			const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
			options.plugins.push(new HotModuleReplacementPlugin());
		});

		argHandlers.ifBooleanArg("debug", () => {
			ensureArray(options, "plugins");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			options.plugins.push(new LoaderOptionsPlugin({ debug: true }));
		});

		argHandlers.ifBooleanArg("optimize-minimize", () => {
			ensureArray(options, "plugins");
			const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			const hasSourceMap = options.devtool && 
				(options.devtool.includes("sourcemap") || options.devtool.includes("source-map"));
			options.plugins.push(new UglifyJsPlugin({ sourceMap: hasSourceMap }));
			options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
		});

		argHandlers.ifArg("prefetch", (request) => {
			ensureArray(options, "plugins");
			const PrefetchPlugin = require("../lib/PrefetchPlugin");
			options.plugins.push(new PrefetchPlugin(request));
		});

		argHandlers.ifArg("provide", (value) => {
			ensureArray(options, "plugins");
			const [name, moduleName] = parseProvideArg(value);
			const ProvidePlugin = require("../lib/ProvidePlugin");
			options.plugins.push(new ProvidePlugin(name, moduleName));
		});

		argHandlers.ifArg("plugin", (value) => {
			ensureArray(options, "plugins");
			options.plugins.push(loadPlugin(value));
		});

		argHandlers.mapArgToBoolean("bail");
		argHandlers.mapArgToBoolean("profile");

		applyDefinePlugin(options, argv, argHandlers);
		applyLoaderBindings(options, argv, argHandlers);
		applyEntryFromArgs(options, argv, argHandlers);
	}

	function parseProvideArg(value) {
		const idx = value.indexOf("=");
		if(idx >= 0) {
			return [value.substr(0, idx), value.substr(idx + 1)];
		}
		return [value, value];
	}

	function applyDefinePlugin(options, argv, argHandlers) {
		let defineObject;
		argHandlers.ifArgPair("define", (name, value) => {
			if(name === null) {
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

	function applyLoaderBindings(options, argv, argHandlers) {
		const bindLoaders = (arg, collection) => {
			argHandlers.ifArgPair(arg, (name, binding) => {
				if(name === null) {
					name = binding;
					binding += "-loader";
				}
				options.module[collection].push({
					test: new RegExp("\\." + escapeRegex(name) + "$"),
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
	}

	function escapeRegex(str) {
		return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
	}

	function applyEntryFromArgs(options, argv, argHandlers) {
		argHandlers.ifArgPair("entry", (name, entry) => {
			if(typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
				options.entry[name] = [].concat(options.entry[name]).concat(entry);
			} else {
				options.entry[name] = entry;
			}
		}, () => {
			ensureObject(options, "entry");
		});
	}

	function applyResolveOptions(options, argv, argHandlers) {
		const processResolveAlias = (arg, key) => {
			argHandlers.ifArgPair(arg, (name, value) => {
				if(!name) {
					throw new Error(`--${arg} <string>=<string>`);
				}
				ensureObject(options, key);
				ensureObject(options[key], "alias");
				options[key].alias[name] = value;
			});
		};

		processResolveAlias("resolve-alias", "resolve");
		processResolveAlias("resolve-loader-alias", "resolveLoader");

		argHandlers.ifArg("resolve-extensions", (value) => {
			ensureObject(options, "resolve");
			options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
		});
	}

	function applyOptimizationOptions(options, argv, argHandlers) {
		argHandlers.ifArg("optimize-max-chunks", (value) => {
			ensureArray(options, "plugins");
			const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
		});

		argHandlers.ifArg("optimize-min-chunk-size", (value) => {
			ensureArray(options, "plugins");
			const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
			options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
		});
	}

	function applyEntryAndOutput(options, argv, convertOptions, argHandlers) {
		let noOutputFilenameDefined = !options.output || !options.output.filename;

		if(noOutputFilenameDefined) {
			setDefaultOutput(options, argv, convertOptions);
		}

		if(argv._.length > 0) {
			addCliEntries(options, argv);
		}
	}

	function setDefaultOutput(options, argv, convertOptions) {
		ensureObject(options, "output");

		if(convertOptions?.outputFilename) {
			options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
			options.output.filename = path.basename(convertOptions.outputFilename);
		} else if(argv._.length > 0) {
			const filename = argv._.pop();
			options.output.path = path.resolve(path.dirname(filename));
			options.output.filename = path.basename(filename);
		} else {
			throw new Error("'