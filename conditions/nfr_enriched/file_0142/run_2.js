```javascript
const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

module.exports = function(yargs, argv, convertOptions) {
	const options = [];

	applyShortcutFlags(argv);

	const configFiles = resolveConfigFiles(argv);
	const configFileLoaded = loadConfigFiles(configFiles, options, argv);

	return processConfiguredOptions(
		configFileLoaded ? (options.length === 1 ? options[0] : options) : {},
		argv,
		convertOptions,
		configFileLoaded
	);

	// Applies shortcut flags (-d for debug, -p for production)
	function applyShortcutFlags(argvObj) {
		if(argvObj.d) {
			argvObj.debug = true;
			argvObj["output-pathinfo"] = true;
			if(!argvObj.devtool) {
				argvObj.devtool = "eval-cheap-module-source-map";
			}
		}
		if(argvObj.p) {
			argvObj["optimize-minimize"] = true;
			argvObj["define"] = [].concat(argvObj["define"] || []).concat("process.env.NODE_ENV=\"production\"");
		}
	}

	// Resolves configuration files from argv or defaults
	function resolveConfigFiles(argvObj) {
		const extensions = getExtensionsSorted();
		const defaultConfigFiles = getDefaultConfigFiles(extensions);

		if(argvObj.config) {
			return resolveExplicitConfigFiles(argvObj.config, extensions);
		}
		return findDefaultConfigFile(defaultConfigFiles);
	}

	// Returns sorted list of file extensions
	function getExtensionsSorted() {
		return Object.keys(interpret.extensions).sort(function(a, b) {
			return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
		});
	}

	// Generates default config file candidates
	function getDefaultConfigFiles(extensions) {
		const baseNames = ["webpack.config", "webpackfile"];
		return baseNames.map(function(filename) {
			return extensions.map(function(ext) {
				return {
					path: path.resolve(filename + ext),
					ext: ext
				};
			});
		}).reduce(function(a, i) {
			return a.concat(i);
		}, []);
	}

	// Resolves explicitly provided config files
	function resolveExplicitConfigFiles(configArg, extensions) {
		const configArgList = Array.isArray(configArg) ? configArg : [configArg];
		return configArgList.map(function(arg) {
			const resolvedPath = path.resolve(arg);
			const extension = getConfigExtension(resolvedPath, extensions);
			return {
				path: resolvedPath,
				ext: extension
			};
		});
	}

	// Extracts extension from config path
	function getConfigExtension(configPath, extensions) {
		for(let i = extensions.length - 1; i >= 0; i--) {
			const tmpExt = extensions[i];
			if(configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1) {
				return tmpExt;
			}
		}
		return path.extname(configPath);
	}

	// Finds first existing default config file
	function findDefaultConfigFile(defaultConfigFiles) {
		for(let i = 0; i < defaultConfigFiles.length; i++) {
			const webpackConfig = defaultConfigFiles[i].path;
			if(fs.existsSync(webpackConfig)) {
				return [{
					path: webpackConfig,
					ext: defaultConfigFiles[i].ext
				}];
			}
		}
		return [];
	}

	// Loads config files and registers compilers
	function loadConfigFiles(configFiles, optionsArray, argvObj) {
		if(configFiles.length === 0) {
			return false;
		}

		configFiles.forEach(function(file) {
			registerCompiler(interpret.extensions[file.ext]);
			optionsArray.push(requireConfig(file.path, argvObj));
		});
		return true;
	}

	// Registers compiler for file extension
	function registerCompiler(moduleDescriptor) {
		if(!moduleDescriptor) {
			return;
		}

		if(typeof moduleDescriptor === "string") {
			require(moduleDescriptor);
		} else if(!Array.isArray(moduleDescriptor)) {
			moduleDescriptor.register(require(moduleDescriptor.module));
		} else {
			for(let i = 0; i < moduleDescriptor.length; i++) {
				try {
					registerCompiler(moduleDescriptor[i]);
					break;
				} catch(e) {
					// Continue to next compiler
				}
			}
		}
	}

	// Requires and processes config file
	function requireConfig(configPath, argvObj) {
		let config = require(configPath);
		const isES6DefaultExportedFunc = (
			typeof config === "object" && config !== null && typeof config.default === "function"
		);
		if(typeof config === "function" || isES6DefaultExportedFunc) {
			config = isES6DefaultExportedFunc ? config.default : config;
			config = config(argvObj.env, argvObj);
		}
		return config;
	}

	// Main configuration processor
	function processConfiguredOptions(config, argvObj, convertOpts, configLoaded) {
		if(config === null || typeof config !== "object") {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1); // eslint-disable-line
		}

		// Handle Promise
		if(typeof config.then === "function") {
			return config.then(function(resolved) {
				return processConfiguredOptions(resolved, argvObj, convertOpts, configLoaded);
			});
		}

		// Handle ES6 default export
		if(typeof config === "object" && typeof config.default === "object") {
			return processConfiguredOptions(config.default, argvObj, convertOpts, configLoaded);
		}

		if(Array.isArray(config)) {
			config.forEach(function(cfg) {
				processOptions(cfg, argvObj, convertOpts, configLoaded);
			});
		} else {
			processOptions(config, argvObj, convertOpts, configLoaded);
		}

		applyContextOptions(config, argvObj);
		applyWatchOptions(config, argvObj);

		return config;
	}

	// Applies context configuration
	function applyContextOptions(config, argvObj) {
		if(argvObj.context) {
			config.context = path.resolve(argvObj.context);
		}
		if(!config.context) {
			config.context = process.cwd();
		}
	}

	// Applies watch-related options
	function applyWatchOptions(config, argvObj) {
		if(argvObj.watch) {
			config.watch = true;
		}

		if(argvObj["watch-aggregate-timeout"]) {
			config.watchOptions = config.watchOptions || {};
			config.watchOptions.aggregateTimeout = +argvObj["watch-aggregate-timeout"];
		}

		if(argvObj["watch-poll"]) {
			config.watchOptions = config.watchOptions || {};
			if(typeof argvObj["watch-poll"] !== "boolean")
				config.watchOptions.poll = +argvObj["watch-poll"];
			else
				config.watchOptions.poll = true;
		}

		if(argvObj["watch-stdin"]) {
			config.watchOptions = config.watchOptions || {};
			config.watchOptions.stdin = true;
			config.watch = true;
		}
	}

	// Processes individual configuration object
	function processOptions(config, argvObj, convertOpts, configLoaded) {
		let noOutputFilenameDefined = !config.output || !config.output.filename;

		// Helper to conditionally apply argument
		function ifArg(name, fn, init, finalize) {
			if(Array.isArray(argvObj[name])) {
				if(init) init();
				argvObj[name].forEach(fn);
				if(finalize) finalize();
			} else if(typeof argvObj[name] !== "undefined" && argvObj[name] !== null) {
				if(init) init();
				fn(argvObj[name], -1);
				if(finalize) finalize();
			}
		}

		// Helper to parse key=value pairs
		function ifArgPair(name, fn, init, finalize) {
			ifArg(name, function(content, idx) {
				const eqIdx = content.indexOf("=");
				if(eqIdx < 0) {
					return fn(null, content, idx);
				}
				return fn(content.substr(0, eqIdx), content.substr(eqIdx + 1), idx);
			}, init, finalize);
		}

		// Helper for boolean arguments
		function ifBooleanArg(name, fn) {
			ifArg(name, function(bool) {
				if(bool) fn();
			});
		}

		// Helper to map argument to boolean option
		function mapArgToBoolean(name, optionName) {
			ifArg(name, function(bool) {
				if(bool === true)
					config[optionName || name] = true;
				else if(bool === false)
					config[optionName || name] = false;
			});
		}

		// Loads and instantiates a plugin
		function loadPlugin(name) {
			const loadUtils = require("loader-utils");
			let args;
			let pluginName = name;

			try {
				const queryIdx = name && name.indexOf("?");
				if(queryIdx > -1) {
					args = loadUtils.parseQuery(name.substring(queryIdx));
					pluginName = name.substring(0, queryIdx);
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

		// Ensures object exists at path
		function ensureObject(parent, name) {
			if(typeof parent[name] !== "object" || parent[name] === null) {
				parent[name] = {};
			}
		}

		// Ensures array exists at path
		function ensureArray(parent, name) {
			if(!Array.isArray(parent[name])) {
				parent[name] = [];
			}
		}

		// Process entry points
		ifArgPair("entry", function(name, entry) {
			if(typeof config.entry[name] !== "undefined" && config.entry[name] !== null) {
				config.entry[name] = [].concat(config.entry[name]).concat(entry);
			} else {
				config.entry[name] = entry;
			}
		}, function() {
			ensureObject(config, "entry");
		});

		// Binds loaders to configuration
		function bindLoaders(arg, collection) {
			ifArgPair(arg, function(name, binding) {
				let loaderName = name;
				let loaderBinding = binding;
				if(loaderName === null) {
					loaderName = loaderBinding;
					loaderBinding += "-loader";
				}
				config.module[collection].push({
					test: new RegExp("\\." + loaderName.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
					loader: loaderBinding
				});
			}, function() {
				ensureObject(config, "module");
				ensureArray(config.module, collection);
			});
		}

		bindLoaders("module-bind", "loaders");
		bindLoaders("module-bind-pre", "preLoaders");
		bindLoaders("module-bind-post", "postLoaders");

		// Process define plugin
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
			ensureArray(config, "plugins");
			const DefinePlugin = require("../lib/DefinePlugin");
			config.plugins.push(new DefinePlugin(defineObject));
		});

		// Output options
		ifArg("output-path", function(value) {
			ensureObject(config, "output");
			config.output.path = path.resolve(value);
		});

		ifArg("output-filename", function(value) {
			ensureObject(config, "output");
			config.output.filename = value;
			noOutputFilenameDefined = false;
		});

		ifArg("output-chunk-filename", function(value) {
			ensureObject(config, "output");
			config.output.chunkFilename = value;
		});

		ifArg("output-source-map-filename", function(value) {
			ensureObject(config, "output");
			config.output.sourceMapFilename = value;
		});

		ifArg("output-public-path", function(value) {
			ensureObject(config, "output");
			config.output.publicPath = value;
		});

		ifArg("output-jsonp-function", function(value) {
			ensureObject(config, "output");
			config.output.jsonpFunction = value;
		});

		ifBooleanArg("output-pathinfo", function() {
			ensureObject(config, "output");
			config.output.pathinfo = true;
		});

		ifArg("output-library", function(value) {
			ensureObject(config, "output");
			config.output.library = value;
		});

		ifArg("output-library-target", function(value) {
			ensureObject(config, "output");
			config.output.libraryTarget = value;
		});

		// Records options
		ifArg("records-input-path", function(value) {
			config.recordsInputPath = path.resolve(value);
		});

		ifArg("records-output-path", function(value) {
			config.recordsOutputPath = path.resolve(value);
		});

		ifArg("records-path", function(value) {
			config.recordsPath = path.resolve(value);
		});

		// Target option
		ifArg("target", function(value) {
			config.target = value;
		});

		// Cache option
		mapArgToBoolean("cache");

		// Hot module replacement
		ifBooleanArg("hot", function() {
			ensureArray(config, "plugins");
			const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
			config.plugins.push(new HotModuleReplacementPlugin());
		});

		// Debug option
		ifBooleanArg("debug", function() {
			ensureArray(config, "plugins");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			config.plugins.push(new LoaderOptionsPlugin({
				debug: true
			}));
		});

		// Devtool option
		ifArg("devtool", function(value) {
			config.devtool = value;
		});

		// Resolve alias processor
		function processResolveAlias(arg, key) {
			ifArgPair(arg, function(name, value) {
				if(!name) {
					throw new Error("--" + arg + " <string>=<string>");
				}
				ensureObject(config, key);
				ensureObject(config[key], "alias");
				config[key].alias[name] = value;
			});
		}

		processResolveAlias("resolve-alias", "resolve");
		processResolveAlias("resolve-loader-alias", "resolveLoader");

		// Resolve extensions
		ifArg("resolve-extensions", function(value) {
			ensureObject(config, "resolve");
			if(Array.isArray(value)) {
				config.resolve.extensions = value;
			} else {
				config.resolve.extensions = value.split(/,\s*/);
			}
		});

		// Optimization plugins
		ifArg("optimize-max-chunks", function(value) {
			ensureArray(config, "plugins");
			const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			config.plugins.push(new LimitChunkCountPlugin({
				maxChunks: parseInt(value, 10)
			}));
		});

		ifArg("optimize-min-chunk-size", function(value) {
			ensureArray(config, "plugins");
			const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
			config.plugins.push(new MinChunkSizePlugin({
				minChunkSize: parseInt(value, 10)
			}));
		});

		ifBooleanArg("optimize-minimize", function() {
			ensureArray(config, "plugins");
			const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			config.plugins.push(new UglifyJsPlugin({
				sourceMap: config.devtool && (config.devtool.indexOf("sourcemap") >= 0 || config.devtool.indexOf("source-map") >= 0)
			}));
			config.plugins.push(new LoaderOptionsPlugin({
				minimize: true
			}));
		});

		// Prefetch plugin
		ifArg("prefetch", function(request) {
			ensureArray(config, "plugins");
			const PrefetchPlugin = require("../lib/PrefetchPlugin");
			config.plugins.push(new PrefetchPlugin(request));
		});

		// Provide plugin
		ifArg("provide", function(value) {
			ensureArray(config, "plugins");
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
			config.plugins.push(new ProvidePlugin(provideName, provideValue));
		});

		// Custom plugin
		ifArg("plugin", function(value) {
			ensureArray(config, "plugins");
			config.plugins.push(loadPlugin(value));
		});

		// Bail and profile options
		mapArgToBoolean("bail");
		mapArgToBoolean("profile");

		// Handle output filename
		processOutputFilename(config, argvObj, convertOpts, configLoaded, noOutputFilenameDefined);

		// Handle entry points from CLI
		processCliEntries(config, argvObj);

		// Validate entry exists
		validateEntry(config, configLoaded);
	}

	// Processes output filename configuration
	function processOutputFilename(config, argvObj, convertOpts, configLoaded, noOutputFilenameDefined) {
		if(!noOutputFilenameDefined) {
			return;
		}

		ensureObject(config, "output");

		if(convertOpts && convertOpts.outputFilename) {
			config.output.path = path.resolve(path.dirname(convertOpts.outputFilename));
			config.output.filename = path.basename(convertOpts.outputFilename);
		} else if(argvObj._.length > 0) {
			config.output.filename = argvObj._.pop();
			config.output.path = path.resolve(path.dirname(config.output.filename));
			config.output.filename = path.basename(config.output.filename);
		} else if(configLoaded) {
			throw new Error("'output.filename' is required, either in config file or as --output-filename");
		} else {
			console.error("No configuration file found and no output filename configured via CLI option.");
			console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
			console.error("Use --help to display the CLI options.");
			process.exit(-1); // eslint-disable-line
		}
	}

	// Processes entry points from CLI arguments
	function processCliEntries(config, argvObj) {
		if(argvObj._.length === 0) {
			return;
		}

		if(Array.isArray(config.entry) || typeof config.entry === "string") {
			config.entry = {
				main: config.entry
			};
		}
		ensureObject(config, "entry");

		// Adds entry to configuration
		function addEntry(name, entry) {
			if(config.entry[name]) {
				if(!Array.isArray(config.entry[name])) {
					config.entry[name] = [config.entry[name]];
				}
				config.entry[name].push(entry);
			} else {
				config.entry[name] = entry;
			}
		}

		argvObj._.forEach(function(content) {
			const eqIdx = content.indexOf("=");
			const queryIdx = content.indexOf("?");
			if(eqIdx < 0 || (queryIdx >= 0 && queryIdx < eqIdx)) {
				const resolved = path.resolve(content);
				if(fs.existsSync(resolved)) {
					addEntry("main", resolved);
				} else {
					addEntry("main", content);
				}
			} else {
				addEntry(content.substr(0, eqIdx), content.substr(eqIdx + 1));
			}
		});
	}

	// Validates that entry configuration exists
	function validateEntry(config, configLoaded) {
		if(config.entry) {
			return;
		}

		if(configLoaded) {
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