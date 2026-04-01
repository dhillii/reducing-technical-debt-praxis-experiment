```javascript
const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

module.exports = function(yargs, argv, convertOptions) {

	const options = [];

	// Shortcuts
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

	let configFileLoaded = false;
	let configFiles = [];
	const extensions = Object.keys(interpret.extensions).sort(function(a, b) {
		return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
	});
	const defaultConfigFiles = ["webpack.config", "webpackfile"].map(function(filename) {
		return extensions.map(function(ext) {
			return {
				path: path.resolve(filename + ext),
				ext: ext
			};
		});
	}).reduce(function(a, i) {
		return a.concat(i);
	}, []);

	let i;
	if(argv.config) {
		configFiles = loadConfigFilesFromArgv(argv.config, extensions);
	} else {
		configFiles = loadDefaultConfigFiles(defaultConfigFiles);
	}

	if(configFiles.length > 0) {
		configFiles.forEach(function(file) {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path, argv));
		});
		configFileLoaded = true;
	}

	return processConfiguredOptions(getOptionsToProcess(configFileLoaded, options));

	/**
	 * Load config files from argv.config argument
	 */
	function loadConfigFilesFromArgv(configArg, exts) {
		const getConfigExtension = function(configPath) {
			for(let j = exts.length - 1; j >= 0; j--) {
				const tmpExt = exts[j];
				if(configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1) {
					return tmpExt;
				}
			}
			return path.extname(configPath);
		};

		const mapConfigArg = function(arg) {
			const resolvedPath = path.resolve(arg);
			const extension = getConfigExtension(resolvedPath);
			return {
				path: resolvedPath,
				ext: extension
			};
		};

		const configArgList = Array.isArray(configArg) ? configArg : [configArg];
		return configArgList.map(mapConfigArg);
	}

	/**
	 * Load default config files from filesystem
	 */
	function loadDefaultConfigFiles(defaultFiles) {
		const loaded = [];
		for(let j = 0; j < defaultFiles.length; j++) {
			const webpackConfig = defaultFiles[j].path;
			if(fs.existsSync(webpackConfig)) {
				loaded.push({
					path: webpackConfig,
					ext: defaultFiles[j].ext
				});
				break;
			}
		}
		return loaded;
	}

	/**
	 * Register compiler for module descriptor
	 */
	function registerCompiler(moduleDescriptor) {
		if(!moduleDescriptor) {
			return;
		}

		if(typeof moduleDescriptor === "string") {
			require(moduleDescriptor);
			return;
		}

		if(Array.isArray(moduleDescriptor)) {
			registerCompilerArray(moduleDescriptor);
			return;
		}

		if(typeof moduleDescriptor === "object") {
			moduleDescriptor.register(require(moduleDescriptor.module));
		}
	}

	/**
	 * Register compiler for array of module descriptors
	 */
	function registerCompilerArray(descriptors) {
		for(let j = 0; j < descriptors.length; j++) {
			try {
				registerCompiler(descriptors[j]);
				break;
			} catch(e) {
				// do nothing
			}
		}
	}

	/**
	 * Require and process config file
	 */
	function requireConfig(configPath, args) {
		let options = require(configPath);
		const isES6DefaultExportedFunc = isES6DefaultExport(options);
		
		if(typeof options === "function" || isES6DefaultExportedFunc) {
			options = isES6DefaultExportedFunc ? options.default : options;
			options = options(args.env, args);
		}
		return options;
	}

	/**
	 * Check if object is ES6 default export
	 */
	function isES6DefaultExport(obj) {
		return typeof obj === "object" && obj !== null && typeof obj.default === "function";
	}

	/**
	 * Get options to process based on config load status
	 */
	function getOptionsToProcess(loaded, opts) {
		if(!loaded) {
			return {};
		}
		if(opts.length === 1) {
			return opts[0];
		}
		return opts;
	}

	function processConfiguredOptions(options) {
		if(!isValidConfigOptions(options)) {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1); // eslint-disable-line
		}

		// process Promise
		if(typeof options.then === "function") {
			return options.then(processConfiguredOptions);
		}

		// process ES6 default
		if(isES6DefaultExportObject(options)) {
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

	/**
	 * Check if config options are valid
	 */
	function isValidConfigOptions(opts) {
		return opts !== null && typeof opts === "object";
	}

	/**
	 * Check if object is ES6 default export object
	 */
	function isES6DefaultExportObject(obj) {
		return typeof obj === "object" && typeof obj.default === "object";
	}

	/**
	 * Apply context configuration
	 */
	function applyContextOptions(options) {
		if(argv.context) {
			options.context = path.resolve(argv.context);
		}
		if(!options.context) {
			options.context = process.cwd();
		}
	}

	/**
	 * Apply watch configuration
	 */
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
			if(typeof argv["watch-poll"] !== "boolean") {
				options.watchOptions.poll = +argv["watch-poll"];
			} else {
				options.watchOptions.poll = true;
			}
		}

		if(argv["watch-stdin"]) {
			ensureObject(options, "watchOptions");
			options.watchOptions.stdin = true;
			options.watch = true;
		}
	}

	function processOptions(options) {
		let noOutputFilenameDefined = !options.output || !options.output.filename;

		function ifArg(name, fn, init, finalize) {
			if(Array.isArray(argv[name])) {
				if(init) {
					init();
				}
				argv[name].forEach(fn);
				if(finalize) {
					finalize();
				}
			} else if(typeof argv[name] !== "undefined" && argv[name] !== null) {
				if(init) {
					init();
				}
				fn(argv[name], -1);
				if(finalize) {
					finalize();
				}
			}
		}

		function ifArgPair(name, fn, init, finalize) {
			ifArg(name, function(content, idx) {
				const eqIndex = content.indexOf("=");
				if(eqIndex < 0) {
					return fn(null, content, idx);
				}
				return fn(content.substr(0, eqIndex), content.substr(eqIndex + 1), idx);
			}, init, finalize);
		}

		function ifBooleanArg(name, fn) {
			ifArg(name, function(bool) {
				if(bool) {
					fn();
				}
			});
		}

		function mapArgToBoolean(name, optionName) {
			ifArg(name, function(bool) {
				if(bool === true) {
					options[optionName || name] = true;
				} else if(bool === false) {
					options[optionName || name] = false;
				}
			});
		}

		function loadPlugin(name) {
			const loadUtils = require("loader-utils");
			let args;
			let pluginName = name;
			
			try {
				const queryIndex = name && name.indexOf("?");
				if(queryIndex > -1) {
					args = loadUtils.parseQuery(name.substring(queryIndex));
					pluginName = name.substring(0, queryIndex);
				}
			} catch(e) {
				console.log("Invalid plugin arguments " + name + " (" + e + ").");
				process.exit(-1); // eslint-disable-line
			}

			let pluginPath;
			try {
				const resolve = require("enhanced-resolve");
				pluginPath = resolve.sync(process.cwd(), pluginName);
			} catch(e) {
				console.log("Cannot resolve plugin " + pluginName + ".");
				process.exit(-1); // eslint-disable-line
			}

			let Plugin;
			try {
				Plugin = require(pluginPath);
			} catch(e) {
				console.log("Cannot load plugin " + pluginName + ". (" + pluginPath + ")");
				throw e;
			}

			try {
				return new Plugin(args);
			} catch(e) {
				console.log("Cannot instantiate plugin " + pluginName + ". (" + pluginPath + ")");
				throw e;
			}
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

		ifArgPair("entry", function(name, entry) {
			if(typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
				options.entry[name] = [].concat(options.entry[name]).concat(entry);
			} else {
				options.entry[name] = entry;
			}
		}, function() {
			ensureObject(options, "entry");
		});

		function bindLoaders(arg, collection) {
			ifArgPair(arg, function(name, binding) {
				let loaderName = name;
				let loaderBinding = binding;
				
				if(loaderName === null) {
					loaderName = loaderBinding;
					loaderBinding += "-loader";
				}
				
				options.module[collection].push({
					test: new RegExp("\\." + loaderName.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
					loader: loaderBinding
				});
			}, function() {
				ensureObject(options, "module");
				ensureArray(options.module, collection);
			});
		}
		
		bindLoaders("module-bind", "loaders");
		bindLoaders("module-bind-pre", "preLoaders");
		bindLoaders("module-bind-post", "postLoaders");

		let defineObject;
		ifArgPair("define", function(name, value) {
			let defineName = name;
			let defineValue = value;
			
			if(defineName === null) {
				defineName = defineValue;
				defineValue = true;
			}
			defineObject[defineName] = defineValue;
		}, function() {
			defineObject = {};
		}, function() {
			ensureArray(options, "plugins");
			const DefinePlugin = require("../lib/DefinePlugin");
			options.plugins.push(new DefinePlugin(defineObject));
		});

		ifArg("output-path", function(value) {
			ensureObject(options, "output");
			options.output.path = path.resolve(value);
		});

		ifArg("output-filename", function(value) {
			ensureObject(options, "output");
			options.output.filename = value;
			noOutputFilenameDefined = false;
		});

		ifArg("output-chunk-filename", function(value) {
			ensureObject(options, "output");
			options.output.chunkFilename = value;
		});

		ifArg("output-source-map-filename", function(value) {
			ensureObject(options, "output");
			options.output.sourceMapFilename = value;
		});

		ifArg("output-public-path", function(value) {
			ensureObject(options, "output");
			options.output.publicPath = value;
		});

		ifArg("output-jsonp-function", function(value) {
			ensureObject(options, "output");
			options.output.jsonpFunction = value;
		});

		ifBooleanArg("output-pathinfo", function() {
			ensureObject(options, "output");
			options.output.pathinfo = true;
		});

		ifArg("output-library", function(value) {
			ensureObject(options, "output");
			options.output.library = value;
		});

		ifArg("output-library-target", function(value) {
			ensureObject(options, "output");
			options.output.libraryTarget = value;
		});

		ifArg("records-input-path", function(value) {
			options.recordsInputPath = path.resolve(value);
		});

		ifArg("records-output-path", function(value) {
			options.recordsOutputPath = path.resolve(value);
		});

		ifArg("records-path", function(value) {
			options.recordsPath = path.resolve(value);
		});

		ifArg("target", function(value) {
			options.target = value;
		});

		mapArgToBoolean("cache");

		ifBooleanArg("hot", function() {
			ensureArray(options, "plugins");
			const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
			options.plugins.push(new HotModuleReplacementPlugin());
		});

		ifBooleanArg("debug", function() {
			ensureArray(options, "plugins");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			options.plugins.push(new LoaderOptionsPlugin({
				debug: true
			}));
		});

		ifArg("devtool", function(value) {
			options.devtool = value;
		});

		function processResolveAlias(arg, key) {
			ifArgPair(arg, function(name, value) {
				if(!name) {
					throw new Error("--" + arg + " <string>=<string>");
				}
				ensureObject(options, key);
				ensureObject(options[key], "alias");
				options[key].alias[name] = value;
			});
		}
		
		processResolveAlias("resolve-alias", "resolve");
		processResolveAlias("resolve-loader-alias", "resolveLoader");

		ifArg("resolve-extensions", function(value) {
			ensureObject(options, "resolve");
			if(Array.isArray(value)) {
				options.resolve.extensions = value;
			} else {
				options.resolve.extensions = value.split(/,\s*/);
			}
		});

		ifArg("optimize-max-chunks", function(value) {
			ensureArray(options, "plugins");
			const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			options.plugins.push(new LimitChunkCountPlugin({
				maxChunks: parseInt(value, 10)
			}));
		});

		ifArg("optimize-min-chunk-size", function(value) {
			ensureArray(options, "plugins");
			const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
			options.plugins.push(new MinChunkSizePlugin({
				minChunkSize: parseInt(value, 10)
			}));
		});

		ifBooleanArg("optimize-minimize", function() {
			ensureArray(options, "plugins");
			const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			const hasSourceMap = options.devtool && (options.devtool.indexOf("sourcemap") >= 0 || options.devtool.indexOf("source-map") >= 0);
			options.plugins.push(new UglifyJsPlugin({
				sourceMap: hasSourceMap
			}));
			options.plugins.push(new LoaderOptionsPlugin({
				minimize: true
			}));
		});

		ifArg("prefetch", function(request) {
			ensureArray(options, "plugins");
			const PrefetchPlugin = require("../lib/PrefetchPlugin");
			options.plugins.push(new PrefetchPlugin(request));
		});

		ifArg("provide", function(value) {
			ensureArray(options, "plugins");
			const eqIdx = value.indexOf("=");
			let provideName;
			let provideValue = value;
			
			if(eqIdx >= 0) {
				provideName = value.substr(0, eqIdx);
				provideValue = value.substr(eqIdx + 1);
			} else {
				provideName = value;
			}
			
			const ProvidePlugin = require("../lib/ProvidePlugin");
			options.plugins.push(new ProvidePlugin(provideName, provideValue));
		});

		ifArg("plugin", function(value) {
			ensureArray(options, "plugins");
			options.plugins.push(loadPlugin(value));
		});

		mapArgToBoolean("bail");
		mapArgToBoolean("profile");

		processOutputFilename(options, noOutputFilenameDefined);
		processEntryPoints(options);
		validateEntry(options);
	}

	/**
	 * Process output filename configuration
	 */
	function processOutputFilename(options, noOutputFilenameDefined) {
		if(!noOutputFilenameDefined) {
			return;
		}

		ensureObject(options, "output");

		if(convertOptions && convertOptions.outputFilename) {
			options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
			options.output.filename = path.basename(convertOptions.outputFilename);
			return;
		}

		if(argv._.length > 0) {
			options.output.filename = argv._.pop();
			options.output.path = path.resolve(path.dirname(options.output.filename));
			options.output.filename = path.basename(options.output.filename);
			return;
		}

		if(configFileLoaded) {
			throw new Error("'output.filename' is required, either in config file or as --output-filename");
		}

		console.error("No configuration file found and no output filename configured via CLI option.");
		console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
		console.error("Use --help to display the CLI options.");
		process.exit(-1); // eslint-disable-line
	}

	/**
	 * Process entry points from CLI arguments
	 */
	function processEntryPoints(options) {
		if(argv._.length === 0) {
			return;
		}

		if(Array.isArray(options.entry) || typeof options.entry === "string") {
			options.entry = {
				main: options.entry
			};
		}
		ensureObject(options, "entry");

		const addTo = function(name, entry) {
			if(options.entry[name]) {
				if(!Array.isArray(options.entry[name])) {
					options.entry[name] = [options.entry[name]];
				}
				options.entry[name].push(entry);
			} else {
				options.entry[name] = entry;
			}
		};

		argv._.forEach(function(content) {
			const eqIndex = content.indexOf("=");
			const qIndex = content.indexOf("?");
			
			if(eqIndex < 0 || (qIndex >= 0 && qIndex < eqIndex)) {
				processEntryAsFile(content, addTo);
			} else {
				addTo(content.substr(0, eqIndex), content.substr(eqIndex + 1));
			}
		});
	}

	/**
	 * Process entry point as file path
	 */
	function processEntryAsFile(content, addTo) {
		const resolved = path.resolve(content);
		if(fs.existsSync(resolved)) {
			addTo("main", resolved);
		} else {
			addTo("main", content);
		}
	}

	/**
	 * Validate that entry configuration exists
	 */
	function validateEntry(options) {
		if(options.entry) {
			return;
		}

		if(configFileLoaded) {
			console.error("Configuration file found but no entry configured.");
		} else {
			console.error("No configuration file found and no entry configured via CLI option.");
			console.error("When using the CLI you need to provide at least two arguments: entry and output.");
			console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
		}
		console.error("Use --help to display the CLI options.");
		process.exit(-1); // eslint-disable-line
	}
};
```