```javascript
const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

module.exports = function(yargs, argv, convertOptions) {

	let options = [];

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
		configFiles = loadConfigFilesFromArgument(argv.config);
	} else {
		configFiles = loadDefaultConfigFiles();
	}

	if(configFiles.length > 0) {
		loadConfigFiles(configFiles);
		configFileLoaded = true;
	}

	if(!configFileLoaded) {
		return processConfiguredOptions({});
	} else if(options.length === 1) {
		return processConfiguredOptions(options[0]);
	} else {
		return processConfiguredOptions(options);
	}

	/** @returns {Array} Configuration files loaded from argument */
	function loadConfigFilesFromArgument(configArg) {
		const getConfigExtension = function(configPath) {
			for(i = extensions.length - 1; i >= 0; i--) {
				const tmpExt = extensions[i];
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

	/** @returns {Array} Default configuration files that exist */
	function loadDefaultConfigFiles() {
		const result = [];
		for(i = 0; i < defaultConfigFiles.length; i++) {
			const webpackConfig = defaultConfigFiles[i].path;
			if(fs.existsSync(webpackConfig)) {
				result.push({
					path: webpackConfig,
					ext: defaultConfigFiles[i].ext
				});
				break;
			}
		}
		return result;
	}

	/** Loads and registers all config files */
	function loadConfigFiles(files) {
		files.forEach(function(file) {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path));
		});
	}

	/** @param {*} moduleDescriptor - Module descriptor to register */
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

	/** @param {Array} descriptors - Array of module descriptors */
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

	/** @param {string} configPath - Path to config file */
	function requireConfig(configPath) {
		let config = require(configPath);
		const isES6DefaultExportedFunc = isES6DefaultExport(config);
		
		if(!isCallable(config, isES6DefaultExportedFunc)) {
			return config;
		}

		const configFn = isES6DefaultExportedFunc ? config.default : config;
		return configFn(argv.env, argv);
	}

	/** @param {*} config - Config object to check */
	function isES6DefaultExport(config) {
		return typeof config === "object" && config !== null && typeof config.default === "function";
	}

	/** @param {*} config - Config to check if callable */
	function isCallable(config, isES6DefaultExportedFunc) {
		return typeof config === "function" || isES6DefaultExportedFunc;
	}

	function processConfiguredOptions(opts) {
		if(!isValidConfigObject(opts)) {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1); // eslint-disable-line
		}

		if(isPromise(opts)) {
			return opts.then(processConfiguredOptions);
		}

		if(isES6DefaultObject(opts)) {
			return processConfiguredOptions(opts.default);
		}

		if(Array.isArray(opts)) {
			opts.forEach(processOptions);
		} else {
			processOptions(opts);
		}

		applyContextOption(opts);
		applyWatchOptions(opts);

		return opts;
	}

	/** @param {*} opts - Options to validate */
	function isValidConfigObject(opts) {
		return opts !== null && typeof opts === "object";
	}

	/** @param {*} opts - Options to check */
	function isPromise(opts) {
		return typeof opts.then === "function";
	}

	/** @param {*} opts - Options to check */
	function isES6DefaultObject(opts) {
		return typeof opts === "object" && typeof opts.default === "object";
	}

	/** @param {*} opts - Options object */
	function applyContextOption(opts) {
		if(argv.context) {
			opts.context = path.resolve(argv.context);
		}
		if(!opts.context) {
			opts.context = process.cwd();
		}
	}

	/** @param {*} opts - Options object */
	function applyWatchOptions(opts) {
		if(argv.watch) {
			opts.watch = true;
		}

		if(argv["watch-aggregate-timeout"]) {
			ensureObject(opts, "watchOptions");
			opts.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
		}

		if(argv["watch-poll"]) {
			ensureObject(opts, "watchOptions");
			opts.watchOptions.poll = typeof argv["watch-poll"] !== "boolean" ? +argv["watch-poll"] : true;
		}

		if(argv["watch-stdin"]) {
			ensureObject(opts, "watchOptions");
			opts.watchOptions.stdin = true;
			opts.watch = true;
		}
	}

	function processOptions(opts) {
		let noOutputFilenameDefined = !opts.output || !opts.output.filename;

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
				if(bool === true)
					opts[optionName || name] = true;
				else if(bool === false)
					opts[optionName || name] = false;
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
			if(typeof opts.entry[name] !== "undefined" && opts.entry[name] !== null) {
				opts.entry[name] = [].concat(opts.entry[name]).concat(entry);
			} else {
				opts.entry[name] = entry;
			}
		}, function() {
			ensureObject(opts, "entry");
		});

		function bindLoaders(arg, collection) {
			ifArgPair(arg, function(name, binding) {
				let loaderName = name;
				let loaderBinding = binding;
				
				if(loaderName === null) {
					loaderName = loaderBinding;
					loaderBinding += "-loader";
				}
				opts.module[collection].push({
					test: new RegExp("\\." + loaderName.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
					loader: loaderBinding
				});
			}, function() {
				ensureObject(opts, "module");
				ensureArray(opts.module, collection);
			});
		}
		bindLoaders("module-bind", "loaders");
		bindLoaders("module-bind-pre", "preLoaders");
		bindLoaders("module-bind-post", "postLoaders");

		let defineObject;
		ifArgPair("define", function(name, value) {
			let defName = name;
			let defValue = value;
			
			if(defName === null) {
				defName = defValue;
				defValue = true;
			}
			defineObject[defName] = defValue;
		}, function() {
			defineObject = {};
		}, function() {
			ensureArray(opts, "plugins");
			const DefinePlugin = require("../lib/DefinePlugin");
			opts.plugins.push(new DefinePlugin(defineObject));
		});

		ifArg("output-path", function(value) {
			ensureObject(opts, "output");
			opts.output.path = path.resolve(value);
		});

		ifArg("output-filename", function(value) {
			ensureObject(opts, "output");
			opts.output.filename = value;
			noOutputFilenameDefined = false;
		});

		ifArg("output-chunk-filename", function(value) {
			ensureObject(opts, "output");
			opts.output.chunkFilename = value;
		});

		ifArg("output-source-map-filename", function(value) {
			ensureObject(opts, "output");
			opts.output.sourceMapFilename = value;
		});

		ifArg("output-public-path", function(value) {
			ensureObject(opts, "output");
			opts.output.publicPath = value;
		});

		ifArg("output-jsonp-function", function(value) {
			ensureObject(opts, "output");
			opts.output.jsonpFunction = value;
		});

		ifBooleanArg("output-pathinfo", function() {
			ensureObject(opts, "output");
			opts.output.pathinfo = true;
		});

		ifArg("output-library", function(value) {
			ensureObject(opts, "output");
			opts.output.library = value;
		});

		ifArg("output-library-target", function(value) {
			ensureObject(opts, "output");
			opts.output.libraryTarget = value;
		});

		ifArg("records-input-path", function(value) {
			opts.recordsInputPath = path.resolve(value);
		});

		ifArg("records-output-path", function(value) {
			opts.recordsOutputPath = path.resolve(value);
		});

		ifArg("records-path", function(value) {
			opts.recordsPath = path.resolve(value);
		});

		ifArg("target", function(value) {
			opts.target = value;
		});

		mapArgToBoolean("cache");

		ifBooleanArg("hot", function() {
			ensureArray(opts, "plugins");
			const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
			opts.plugins.push(new HotModuleReplacementPlugin());
		});

		ifBooleanArg("debug", function() {
			ensureArray(opts, "plugins");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			opts.plugins.push(new LoaderOptionsPlugin({
				debug: true
			}));
		});

		ifArg("devtool", function(value) {
			opts.devtool = value;
		});

		function processResolveAlias(arg, key) {
			ifArgPair(arg, function(name, value) {
				if(!name) {
					throw new Error("--" + arg + " <string>=<string>");
				}
				ensureObject(opts, key);
				ensureObject(opts[key], "alias");
				opts[key].alias[name] = value;
			});
		}
		processResolveAlias("resolve-alias", "resolve");
		processResolveAlias("resolve-loader-alias", "resolveLoader");

		ifArg("resolve-extensions", function(value) {
			ensureObject(opts, "resolve");
			opts.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
		});

		ifArg("optimize-max-chunks", function(value) {
			ensureArray(opts, "plugins");
			const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			opts.plugins.push(new LimitChunkCountPlugin({
				maxChunks: parseInt(value, 10)
			}));
		});

		ifArg("optimize-min-chunk-size", function(value) {
			ensureArray(opts, "plugins");
			const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
			opts.plugins.push(new MinChunkSizePlugin({
				minChunkSize: parseInt(value, 10)
			}));
		});

		ifBooleanArg("optimize-minimize", function() {
			ensureArray(opts, "plugins");
			const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			const hasSourceMap = opts.devtool && (opts.devtool.indexOf("sourcemap") >= 0 || opts.devtool.indexOf("source-map") >= 0);
			opts.plugins.push(new UglifyJsPlugin({
				sourceMap: hasSourceMap
			}));
			opts.plugins.push(new LoaderOptionsPlugin({
				minimize: true
			}));
		});

		ifArg("prefetch", function(request) {
			ensureArray(opts, "plugins");
			const PrefetchPlugin = require("../lib/PrefetchPlugin");
			opts.plugins.push(new PrefetchPlugin(request));
		});

		ifArg("provide", function(value) {
			ensureArray(opts, "plugins");
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
			opts.plugins.push(new ProvidePlugin(provideName, provideValue));
		});

		ifArg("plugin", function(value) {
			ensureArray(opts, "plugins");
			opts.plugins.push(loadPlugin(value));
		});

		mapArgToBoolean("bail");

		mapArgToBoolean("profile");

		if(noOutputFilenameDefined) {
			handleMissingOutputFilename(opts);
		}

		if(argv._.length > 0) {
			processPositionalArguments(opts);
		}

		if(!opts.entry) {
			handleMissingEntry();
		}
	}

	/** @param {*} opts - Options object */
	function handleMissingOutputFilename(opts) {
		ensureObject(opts, "output");
		
		if(convertOptions && convertOptions.outputFilename) {
			opts.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
			opts.output.filename = path.basename(convertOptions.outputFilename);
			return;
		}

		if(argv._.length > 0) {
			opts.output.filename = argv._.pop();
			opts.output.path = path.resolve(path.dirname(opts.output.filename));
			opts.output.filename = path.basename(opts.output.filename);
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

	/** @param {*} opts - Options object */
	function processPositionalArguments(opts) {
		if(Array.isArray(opts.entry) || typeof opts.entry === "string") {
			opts.entry = {
				main: opts.entry
			};
		}
		ensureObject(opts, "entry");

		const addTo = function(name, entry) {
			if(opts.entry[name]) {
				if(!Array.isArray(opts.entry[name])) {
					opts.entry[name] = [opts.entry[name]];
				}
				opts.entry[name].push(entry);
			} else {
				opts.entry[name] = entry;
			}
		};

		argv._.forEach(function(content) {
			const eqIndex = content.indexOf("=");
			const queryIndex = content.indexOf("?");
			
			if(eqIndex < 0 || (queryIndex >= 0 && queryIndex < eqIndex)) {
				const resolved = path.resolve(content);
				const entryPath = fs.existsSync(resolved) ? resolved : content;
				addTo("main", entryPath);
			} else {
				addTo(content.substr(0, eqIndex), content.substr(eqIndex + 1));
			}
		});
	}

	/** Handles missing entry configuration */
	function handleMissingEntry() {
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