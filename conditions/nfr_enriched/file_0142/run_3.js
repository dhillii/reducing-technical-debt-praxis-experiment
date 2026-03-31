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
			argv.define = [].concat(argv.define || []).concat("process.env.NODE_ENV=\"production\"");
		}
	}

	function getExtensionsSorted() {
		return Object.keys(interpret.extensions).sort((a, b) => 
			a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length
		);
	}

	function getDefaultConfigFiles() {
		const extensions = getExtensionsSorted();
		return ["webpack.config", "webpackfile"]
			.flatMap(filename => extensions.map(ext => ({
				path: path.resolve(filename + ext),
				ext: ext
			})));
	}

	function getConfigExtension(configPath) {
		const extensions = getExtensionsSorted();
		for(let i = extensions.length - 1; i >= 0; i--) {
			const ext = extensions[i];
			if(configPath.endsWith(ext)) {
				return ext;
			}
		}
		return path.extname(configPath);
	}

	function resolveConfigFiles(argv) {
		if(argv.config) {
			const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
			return configArgList.map(configArg => ({
				path: path.resolve(configArg),
				ext: getConfigExtension(path.resolve(configArg))
			}));
		}

		const defaultFiles = getDefaultConfigFiles();
		for(const file of defaultFiles) {
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
		const isES6DefaultExport = typeof options?.default === "function";
		
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

		if(typeof options?.default === "object") {
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
		let noOutputFilenameDefined = !options.output?.filename;

		const argHandlers = {
			entry: createEntryHandler(options),
			"module-bind": () => bindLoaders("module-bind", "loaders", options),
			"module-bind-pre": () => bindLoaders("module-bind-pre", "preLoaders", options),
			"module-bind-post": () => bindLoaders("module-bind-post", "postLoaders", options),
			define: createDefineHandler(options),
			"output-path": (value) => setOutputOption(options, "path", path.resolve(value)),
			"output-filename": (value) => {
				setOutputOption(options, "filename", value);
				noOutputFilenameDefined = false;
			},
			"output-chunk-filename": (value) => setOutputOption(options, "chunkFilename", value),
			"output-source-map-filename": (value) => setOutputOption(options, "sourceMapFilename", value),
			"output-public-path": (value) => setOutputOption(options, "publicPath", value),
			"output-jsonp-function": (value) => setOutputOption(options, "jsonpFunction", value),
			"output-pathinfo": () => setOutputOption(options, "pathinfo", true),
			"output-library": (value) => setOutputOption(options, "library", value),
			"output-library-target": (value) => setOutputOption(options, "libraryTarget", value),
			"records-input-path": (value) => options.recordsInputPath = path.resolve(value),
			"records-output-path": (value) => options.recordsOutputPath = path.resolve(value),
			"records-path": (value) => options.recordsPath = path.resolve(value),
			target: (value) => options.target = value,
			cache: () => mapArgToBoolean("cache", options),
			hot: () => addPlugin(options, "HotModuleReplacementPlugin", "../lib/HotModuleReplacementPlugin"),
			debug: () => addPlugin(options, "LoaderOptionsPlugin", "../lib/LoaderOptionsPlugin", { debug: true }),
			devtool: (value) => options.devtool = value,
			"resolve-alias": () => processResolveAlias("resolve-alias", "resolve", options),
			"resolve-loader-alias": () => processResolveAlias("resolve-loader-alias", "resolveLoader", options),
			"resolve-extensions": (value) => setResolveExtensions(options, value),
			"optimize-max-chunks": (value) => addOptimizePlugin(options, "LimitChunkCountPlugin", "../lib/optimize/LimitChunkCountPlugin", { maxChunks: parseInt(value, 10) }),
			"optimize-min-chunk-size": (value) => addOptimizePlugin(options, "MinChunkSizePlugin", "../lib/optimize/MinChunkSizePlugin", { minChunkSize: parseInt(value, 10) }),
			"optimize-minimize": () => applyMinimizeOptimization(options),
			prefetch: (value) => addPlugin(options, "PrefetchPlugin", "../lib/PrefetchPlugin", value),
			provide: (value) => addProvidePlugin(options, value),
			plugin: (value) => {
				ensureArray(options, "plugins");
				options.plugins.push(loadPlugin(value));
			},
			bail: () => mapArgToBoolean("bail", options),
			profile: () => mapArgToBoolean("profile", options)
		};

		Object.entries(argHandlers).forEach(([key, handler]) => {
			if(typeof handler === "function") {
				if(argv[key] !== undefined && argv[key] !== null) {
					handler(argv[key]);
				}
			}
		});

		handleOutputFilename(options, noOutputFilenameDefined);
		handleEntryArguments(options);
		validateEntry(options);
	}

	function createEntryHandler(options) {
		return () => {
			ifArgPair("entry", (name, entry) => {
				ensureObject(options, "entry");
				if(options.entry[name]) {
					options.entry[name] = [].concat(options.entry[name]).concat(entry);
				} else {
					options.entry[name] = entry;
				}
			});
		};
	}

	function createDefineHandler(options) {
		return () => {
			const defineObject = {};
			ifArgPair("define", (name, value) => {
				defineObject[name || value] = name ? value : true;
			});
			if(Object.keys(defineObject).length > 0) {
				ensureArray(options, "plugins");
				const DefinePlugin = require("../lib/DefinePlugin");
				options.plugins.push(new DefinePlugin(defineObject));
			}
		};
	}

	function bindLoaders(arg, collection, options) {
		ifArgPair(arg, (name, binding) => {
			if(!name) {
				name = binding;
				binding += "-loader";
			}
			ensureObject(options, "module");
			ensureArray(options.module, collection);
			options.module[collection].push({
				test: new RegExp("\\." + escapeRegex(name) + "$"),
				loader: binding
			});
		});
	}

	function escapeRegex(str) {
		return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
	}

	function setOutputOption(options, key, value) {
		ensureObject(options, "output");
		options.output[key] = value;
	}

	function setResolveExtensions(options, value) {
		ensureObject(options, "resolve");
		options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
	}

	function processResolveAlias(arg, key, options) {
		ifArgPair(arg, (name, value) => {
			if(!name) {
				throw new Error(`--${arg} <string>=<string>`);
			}
			ensureObject(options, key);
			ensureObject(options[key], "alias");
			options[key].alias[name] = value;
		});
	}

	function addPlugin(options, pluginName, pluginPath, config) {
		ensureArray(options, "plugins");
		const Plugin = require(pluginPath);
		options.plugins.push(config ? new Plugin(config) : new Plugin());
	}

	function addOptimizePlugin(options, pluginName, pluginPath, config) {
		ensureArray(options, "plugins");
		const Plugin = require(pluginPath);
		options.plugins.push(new Plugin(config));
	}

	function applyMinimizeOptimization(options) {
		ensureArray(options, "plugins");
		const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
		const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
		const hasSourceMap = options.devtool && /sourcemap|source-map/.test(options.devtool);
		options.plugins.push(new UglifyJsPlugin({ sourceMap: hasSourceMap }));
		options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
	}

	function addProvidePlugin(options, value) {
		ensureArray(options, "plugins");
		const idx = value.indexOf("=");
		const name = idx >= 0 ? value.substr(0, idx) : value;
		const moduleName = idx >= 0 ? value.substr(idx + 1) : value;
		const ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, moduleName));
	}

	function handleOutputFilename(options, noOutputFilenameDefined) {
		if(!noOutputFilenameDefined) return;

		ensureObject(options, "output");

		if(convertOptions?.outputFilename) {
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

	function handleEntryArguments(options) {
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

	function validateEntry(options) {
		if(options.entry) return;

		if(configFiles.length > 0) {
			console.error("Configuration file found but no entry configured.");
		} else {
			console.error("No configuration file found and no entry configured via CLI option.");
			console.error("When using the CLI you need to provide at least two arguments: entry and output.");
			console.error("A configuration file could be named 'webpack.config.js'