```javascript
const path = require("path");
const fs = require("fs");
const interpret = require("interpret");

fs.existsSync = fs.existsSync || path.existsSync;

module.exports = function(yargs, argv, convertOptions) {
	applyShortcutFlags(argv);
	
	const configFiles = resolveConfigFiles(argv);
	const options = loadConfigFiles(configFiles);
	
	return processConfiguredOptions(options.length === 0 ? {} : options.length === 1 ? options[0] : options);

	// ============ Config Resolution ============

	function applyShortcutFlags(argv) {
		if(argv.d) {
			argv.debug = true;
			argv["output-pathinfo"] = true;
			if(!argv.devtool) {
				argv.devtool = "eval-cheap-module-source-map";
			}
		}
		if(argv.p) {
			argv["optimize-minimize"] = true;
			argv["define"] = [].concat(argv["define"] || []).concat("process.env.NODE_ENV=\"production\"");
		}
	}

	function getExtensionsSorted() {
		return Object.keys(interpret.extensions).sort((a, b) => {
			if(a === ".js") return -1;
			if(b === ".js") return 1;
			return a.length - b.length;
		});
	}

	function buildDefaultConfigFiles(extensions) {
		return ["webpack.config", "webpackfile"]
			.flatMap(filename => extensions.map(ext => ({
				path: path.resolve(filename + ext),
				ext: ext
			})));
	}

	function getConfigExtension(configPath, extensions) {
		for(let i = extensions.length - 1; i >= 0; i--) {
			const ext = extensions[i];
			if(configPath.endsWith(ext)) {
				return ext;
			}
		}
		return path.extname(configPath);
	}

	function resolveConfigFiles(argv) {
		const extensions = getExtensionsSorted();
		
		if(argv.config) {
			const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
			return configArgList.map(configArg => ({
				path: path.resolve(configArg),
				ext: getConfigExtension(path.resolve(configArg), extensions)
			}));
		}

		const defaultConfigFiles = buildDefaultConfigFiles(extensions);
		for(const file of defaultConfigFiles) {
			if(fs.existsSync(file.path)) {
				return [file];
			}
		}
		return [];
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
		const isES6DefaultExport = typeof options === "object" && options !== null && typeof options.default === "function";
		
		if(typeof options === "function" || isES6DefaultExport) {
			options = isES6DefaultExport ? options.default : options;
			options = options(argv.env, argv);
		}
		return options;
	}

	function loadConfigFiles(configFiles) {
		const options = [];
		
		for(const file of configFiles) {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path));
		}
		
		return options;
	}

	// ============ Config Processing ============

	function processConfiguredOptions(options) {
		if(options === null || typeof options !== "object") {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1);
		}

		if(typeof options.then === "function") {
			return options.then(processConfiguredOptions);
		}

		if(typeof options === "object" && typeof options.default === "object") {
			return processConfiguredOptions(options.default);
		}

		if(Array.isArray(options)) {
			options.forEach(processOptions);
		} else {
			processOptions(options);
		}

		applyContextOptions(options);
		applyWatchOptions(options);

		return options;
	}

	function applyContextOptions(options) {
		if(argv.context) {
			options.context = path.resolve(argv.context);
		}
		if(!options.context) {
			options.context = process.cwd();
		}
	}

	function applyWatchOptions(options) {
		if(argv.watch) {
			options.watch = true;
		}

		if(argv["watch-aggregate-timeout"]) {
			ensureObject(options, "watchOptions");
			options.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
		}

		if(argv["watch-poll"]) {
			ensureObject(options, "watchOptions");
			options.watchOptions.poll = typeof argv["watch-poll"] === "boolean" ? true : +argv["watch-poll"];
		}

		if(argv["watch-stdin"]) {
			ensureObject(options, "watchOptions");
			options.watchOptions.stdin = true;
			options.watch = true;
		}
	}

	function processOptions(options) {
		let noOutputFilenameDefined = !options.output || !options.output.filename;

		const argHandlers = {
			entry: createEntryHandler(options),
			"module-bind": createLoaderHandler(options, "loaders"),
			"module-bind-pre": createLoaderHandler(options, "preLoaders"),
			"module-bind-post": createLoaderHandler(options, "postLoaders"),
			define: createDefineHandler(options),
			"output-path": (value) => setOutputProperty(options, "path", path.resolve(value)),
			"output-filename": (value) => {
				setOutputProperty(options, "filename", value);
				noOutputFilenameDefined = false;
			},
			"output-chunk-filename": (value) => setOutputProperty(options, "chunkFilename", value),
			"output-source-map-filename": (value) => setOutputProperty(options, "sourceMapFilename", value),
			"output-public-path": (value) => setOutputProperty(options, "publicPath", value),
			"output-jsonp-function": (value) => setOutputProperty(options, "jsonpFunction", value),
			"output-pathinfo": () => setOutputProperty(options, "pathinfo", true),
			"output-library": (value) => setOutputProperty(options, "library", value),
			"output-library-target": (value) => setOutputProperty(options, "libraryTarget", value),
			"records-input-path": (value) => options.recordsInputPath = path.resolve(value),
			"records-output-path": (value) => options.recordsOutputPath = path.resolve(value),
			"records-path": (value) => options.recordsPath = path.resolve(value),
			target: (value) => options.target = value,
			cache: (value) => options.cache = value,
			devtool: (value) => options.devtool = value,
			bail: (value) => options.bail = value,
			profile: (value) => options.profile = value,
			"resolve-extensions": createResolveExtensionsHandler(options),
			"resolve-alias": createResolveAliasHandler(options, "resolve"),
			"resolve-loader-alias": createResolveAliasHandler(options, "resolveLoader"),
			hot: () => addPlugin(options, require("../lib/HotModuleReplacementPlugin")),
			debug: () => addPlugin(options, require("../lib/LoaderOptionsPlugin"), { debug: true }),
			"optimize-max-chunks": (value) => addPlugin(options, require("../lib/optimize/LimitChunkCountPlugin"), { maxChunks: parseInt(value, 10) }),
			"optimize-min-chunk-size": (value) => addPlugin(options, require("../lib/optimize/MinChunkSizePlugin"), { minChunkSize: parseInt(value, 10) }),
			"optimize-minimize": () => applyMinimizeOptimization(options),
			prefetch: (value) => addPlugin(options, require("../lib/PrefetchPlugin"), value),
			provide: (value) => applyProvidePlugin(options, value),
			plugin: (value) => {
				ensureArray(options, "plugins");
				options.plugins.push(loadPlugin(value));
			}
		};

		executeArgHandlers(argHandlers);
		processPositionalArgs(options);
		validateAndSetOutputFilename(options, noOutputFilenameDefined);
		validateEntry(options);
	}

	function createEntryHandler(options) {
		return {
			handler: (name, entry) => {
				ensureObject(options, "entry");
				if(typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
					options.entry[name] = [].concat(options.entry[name]).concat(entry);
				} else {
					options.entry[name] = entry;
				}
			},
			init: () => ensureObject(options, "entry")
		};
	}

	function createLoaderHandler(options, collection) {
		return {
			handler: (name, binding) => {
				if(name === null) {
					name = binding;
					binding += "-loader";
				}
				options.module[collection].push({
					test: new RegExp("\\." + escapeRegex(name) + "$"),
					loader: binding
				});
			},
			init: () => {
				ensureObject(options, "module");
				ensureArray(options.module, collection);
			}
		};
	}

	function createDefineHandler(options) {
		let defineObject;
		return {
			handler: (name, value) => {
				if(name === null) {
					name = value;
					value = true;
				}
				defineObject[name] = value;
			},
			init: () => defineObject = {},
			finalize: () => {
				ensureArray(options, "plugins");
				const DefinePlugin = require("../lib/DefinePlugin");
				options.plugins.push(new DefinePlugin(defineObject));
			}
		};
	}

	function createResolveExtensionsHandler(options) {
		return (value) => {
			ensureObject(options, "resolve");
			options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
		};
	}

	function createResolveAliasHandler(options, key) {
		return {
			handler: (name, value) => {
				if(!name) {
					throw new Error(`--${key}-alias <string>=<string>`);
				}
				ensureObject(options, key);
				ensureObject(options[key], "alias");
				options[key].alias[name] = value;
			}
		};
	}

	function executeArgHandlers(handlers) {
		for(const [argName, handler] of Object.entries(handlers)) {
			if(typeof handler === "function") {
				ifArg(argName, handler);
			} else {
				ifArgPair(argName, handler.handler, handler.init, handler.finalize);
			}
		}
	}

	function processPositionalArgs(options) {
		if(argv._.length === 0) return;

		if(Array.isArray(options.entry) || typeof options.entry === "string") {
			options.entry = { main: options.entry };
		}
		ensureObject(options, "entry");

		argv._.forEach(content => {
			const eqIdx = content.indexOf("=");
			const qIdx = content.indexOf("?");
			
			if(eqIdx < 0 || (qIdx >= 0 && qIdx < eqIdx)) {
				const resolved = path.resolve(content);
				addToEntry(options, "main", fs.existsSync(resolved) ? resolved : content);
			} else {
				addToEntry(options, content.substr(0, eqIdx), content.substr(eqIdx + 1));
			}
		});
	}

	function validateAndSetOutputFilename(options, noOutputFilenameDefined) {
		if(!noOutputFilenameDefined) return;

		ensureObject(options, "output");

		if(convertOptions && convertOptions.outputFilename) {
			options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
			options.output.filename = path.basename(convertOptions.outputFilename);
		} else if(argv._.length > 0) {
			const filename = argv._.pop();
			options.output.path = path.resolve(path.dirname(filename));
			options.output.filename = path.basename(filename);
		} else if(configFiles.length > 0) {
			throw new Error("'output.filename' is required, either in config file or as --output-filename");
		} else {
			console.error("No configuration file found and no output filename configured via CLI option.");
			console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
			console.error("Use --help to display the CLI options.");
			process.exit(-1);
		}
	}

	function validateEntry(options) {
		if(!options.entry) {
			console.error(configFiles.length > 0 
				? "Configuration file found but no entry configured."
				: "No configuration file found and no entry configured via CLI option.\nWhen using the CLI you need to provide at least two arguments: entry and output.\nA configuration file could be named 'webpack.config.js' in the current directory.");
			console.error("Use --help to display the CLI options.");
			process.exit(-1);
		}
	}

	// ============ Utility Functions ============

	function ifArg(name, fn, init, finalize) {
		if(Array.isArray(argv[name])) {
			if(init) init();
			argv[name].forEach(fn);
			if(finalize) finalize();
		} else if(typeof argv[name] !== "undefined" && argv[name] !== null) {
			if(init) init();
			fn(argv[name], -1);
			if(finalize) finalize();
		}
	}

	function ifArgPair(name, fn, init, finalize) {
		ifArg(name, (content, idx) => {
			const i = content.indexOf("=");
			if(i < 0) {
				return fn(null, content, idx);
			}
			return fn(content.substr(0, i), content.substr(i + 1), idx);
		}, init, finalize);
	}

	function ensureObject(parent, name) {
		if(typeof parent[name] !== "object" || parent[name] === null) {
			parent[name] = {};
		}
	}

	function ensureArray(parent, name) {
		if(!Array.isArray(parent[name])) {
			parent[name] = [];
		}
	}

	function setOutputProperty(options, key, value) {
		ensureObject(options, "output");
		options.output[key] = value;
	}

	function addToEntry(options, name, entry) {
		if(options.entry[name]) {
			if(!Array.isArray(options.entry[name])) {
				options.entry[name] = [options.entry[name]];
			}
			options.entry[name].push(entry);
		} else {
			options.entry[name] = entry;
		}
	}

	function addPlugin(options, PluginClass, args) {
		ensureArray(options, "plugins");
		options.plugins.push(args ? new