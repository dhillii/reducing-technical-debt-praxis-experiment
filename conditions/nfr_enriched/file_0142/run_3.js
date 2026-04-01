```javascript
const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

module.exports = function(yargs, argv, convertOptions) {
	const options = [];

	applyShortcuts(argv);

	const configFiles = resolveConfigFiles(argv);
	const configFileLoaded = loadConfigFiles(configFiles, options, argv);

	return processConfiguredOptions(
		configFileLoaded ? (options.length === 1 ? options[0] : options) : {},
		argv,
		convertOptions,
		configFileLoaded
	);

	// Applies shortcut flags to argv
	function applyShortcuts(argvObj) {
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

	// Resolves config file paths from argv or defaults
	function resolveConfigFiles(argvObj) {
		const extensions = getExtensionsSorted();
		const defaultConfigFiles = getDefaultConfigFiles(extensions);

		if(argvObj.config) {
			const configArgList = Array.isArray(argvObj.config) ? argvObj.config : [argvObj.config];
			return configArgList.map(configArg => mapConfigArg(configArg, extensions));
		}

		return findDefaultConfigFile(defaultConfigFiles);
	}

	// Returns sorted list of file extensions
	function getExtensionsSorted() {
		return Object.keys(interpret.extensions).sort((a, b) => {
			return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
		});
	}

	// Generates default config file candidates
	function getDefaultConfigFiles(extensions) {
		const baseNames = ["webpack.config", "webpackfile"];
		return baseNames.map(filename => 
			extensions.map(ext => ({
				path: path.resolve(filename + ext),
				ext: ext
			}))
		).reduce((acc, items) => acc.concat(items), []);
	}

	// Finds first existing default config file
	function findDefaultConfigFile(defaultConfigFiles) {
		for(const configFile of defaultConfigFiles) {
			if(fs.existsSync(configFile.path)) {
				return [configFile];
			}
		}
		return [];
	}

	// Maps config argument to config file object
	function mapConfigArg(configArg, extensions) {
		const resolvedPath = path.resolve(configArg);
		const extension = getConfigExtension(resolvedPath, extensions);
		return {
			path: resolvedPath,
			ext: extension
		};
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

	// Loads config files and populates options array
	function loadConfigFiles(configFiles, optionsArray, argvObj) {
		if(configFiles.length === 0) {
			return false;
		}

		configFiles.forEach(file => {
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
			for(const descriptor of moduleDescriptor) {
				try {
					registerCompiler(descriptor);
					break;
				} catch(e) {
					// Continue to next descriptor
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
			const configFn = isES6DefaultExportedFunc ? config.default : config;
			config = configFn(argvObj.env, argvObj);
		}

		return config;
	}

	// Processes configured options and applies CLI arguments
	function processConfiguredOptions(optionsObj, argvObj, convertOpts, configLoaded) {
		if(optionsObj === null || typeof optionsObj !== "object") {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1); // eslint-disable-line
		}

		// Handle Promise
		if(typeof optionsObj.then === "function") {
			return optionsObj.then(resolved => processConfiguredOptions(resolved, argvObj, convertOpts, configLoaded));
		}

		// Handle ES6 default export
		if(typeof optionsObj === "object" && typeof optionsObj.default === "object") {
			return processConfiguredOptions(optionsObj.default, argvObj, convertOpts, configLoaded);
		}

		if(Array.isArray(optionsObj)) {
			optionsObj.forEach(opts => processOptions(opts, argvObj, convertOpts, configLoaded));
		} else {
			processOptions(optionsObj, argvObj, convertOpts, configLoaded);
		}

		applyContextOptions(optionsObj, argvObj);
		applyWatchOptions(optionsObj, argvObj);

		return optionsObj;
	}

	// Applies context-related options
	function applyContextOptions(optionsObj, argvObj) {
		if(argvObj.context) {
			optionsObj.context = path.resolve(argvObj.context);
		}
		if(!optionsObj.context) {
			optionsObj.context = process.cwd();
		}
	}

	// Applies watch-related options
	function applyWatchOptions(optionsObj, argvObj) {
		if(argvObj.watch) {
			optionsObj.watch = true;
		}

		if(argvObj["watch-aggregate-timeout"]) {
			ensureObject(optionsObj, "watchOptions");
			optionsObj.watchOptions.aggregateTimeout = +argvObj["watch-aggregate-timeout"];
		}

		if(argvObj["watch-poll"]) {
			ensureObject(optionsObj, "watchOptions");
			if(typeof argvObj["watch-poll"] !== "boolean") {
				optionsObj.watchOptions.poll = +argvObj["watch-poll"];
			} else {
				optionsObj.watchOptions.poll = true;
			}
		}

		if(argvObj["watch-stdin"]) {
			ensureObject(optionsObj, "watchOptions");
			optionsObj.watchOptions.stdin = true;
			optionsObj.watch = true;
		}
	}

	// Processes individual option object
	function processOptions(optionsObj, argvObj, convertOpts, configLoaded) {
		let noOutputFilenameDefined = !optionsObj.output || !optionsObj.output.filename;

		// Helper: Execute function if argument exists
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

		// Helper: Parse key=value pairs
		function ifArgPair(name, fn, init, finalize) {
			ifArg(name, (content, idx) => {
				const eqIdx = content.indexOf("=");
				if(eqIdx < 0) {
					return fn(null, content, idx);
				}
				return fn(content.substr(0, eqIdx), content.substr(eqIdx + 1), idx);
			}, init, finalize);
		}

		// Helper: Execute if boolean argument is true
		function ifBooleanArg(name, fn) {
			ifArg(name, (bool) => {
				if(bool) fn();
			});
		}

		// Helper: Map argument to boolean option
		function mapArgToBoolean(name, optionName) {
			ifArg(name, (bool) => {
				if(bool === true) {
					optionsObj[optionName || name] = true;
				} else if(bool === false) {
					optionsObj[optionName || name] = false;
				}
			});
		}

		// Ensures object property exists
		function ensureObject(parent, name) {
			if(typeof parent[name] !== "object" || parent[name] === null) {
				parent[name] = {};
			}
		}

		// Ensures array property exists
		function ensureArray(parent, name) {
			if(!Array.isArray(parent[name])) {
				parent[name] = [];
			}
		}

		// Process entry points
		ifArgPair("entry", (name, entry) => {
			if(typeof optionsObj.entry[name] !== "undefined" && optionsObj.entry[name] !== null) {
				optionsObj.entry[name] = [].concat(optionsObj.entry[name]).concat(entry);
			} else {
				optionsObj.entry[name] = entry;
			}
		}, () => {
			ensureObject(optionsObj, "entry");
		});

		// Process module loaders
		const bindLoaders = (arg, collection) => {
			ifArgPair(arg, (name, binding) => {
				if(name === null) {
					name = binding;
					binding += "-loader";
				}
				optionsObj.module[collection].push({
					test: new RegExp("\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
					loader: binding
				});
			}, () => {
				ensureObject(optionsObj, "module");
				ensureArray(optionsObj.module, collection);
			});
		};

		bindLoaders("module-bind", "loaders");
		bindLoaders("module-bind-pre", "preLoaders");
		bindLoaders("module-bind-post", "postLoaders");

		// Process define plugin
		let defineObject;
		ifArgPair("define", (name, value) => {
			if(name === null) {
				name = value;
				value = true;
			}
			defineObject[name] = value;
		}, () => {
			defineObject = {};
		}, () => {
			ensureArray(optionsObj, "plugins");
			const DefinePlugin = require("../lib/DefinePlugin");
			optionsObj.plugins.push(new DefinePlugin(defineObject));
		});

		// Process output options
		ifArg("output-path", (value) => {
			ensureObject(optionsObj, "output");
			optionsObj.output.path = path.resolve(value);
		});

		ifArg("output-filename", (value) => {
			ensureObject(optionsObj, "output");
			optionsObj.output.filename = value;
			noOutputFilenameDefined = false;
		});

		ifArg("output-chunk-filename", (value) => {
			ensureObject(optionsObj, "output");
			optionsObj.output.chunkFilename = value;
		});

		ifArg("output-source-map-filename", (value) => {
			ensureObject(optionsObj, "output");
			optionsObj.output.sourceMapFilename = value;
		});

		ifArg("output-public-path", (value) => {
			ensureObject(optionsObj, "output");
			optionsObj.output.publicPath = value;
		});

		ifArg("output-jsonp-function", (value) => {
			ensureObject(optionsObj, "output");
			optionsObj.output.jsonpFunction = value;
		});

		ifBooleanArg("output-pathinfo", () => {
			ensureObject(optionsObj, "output");
			optionsObj.output.pathinfo = true;
		});

		ifArg("output-library", (value) => {
			ensureObject(optionsObj, "output");
			optionsObj.output.library = value;
		});

		ifArg("output-library-target", (value) => {
			ensureObject(optionsObj, "output");
			optionsObj.output.libraryTarget = value;
		});

		// Process records options
		ifArg("records-input-path", (value) => {
			optionsObj.recordsInputPath = path.resolve(value);
		});

		ifArg("records-output-path", (value) => {
			optionsObj.recordsOutputPath = path.resolve(value);
		});

		ifArg("records-path", (value) => {
			optionsObj.recordsPath = path.resolve(value);
		});

		// Process target
		ifArg("target", (value) => {
			optionsObj.target = value;
		});

		// Process cache
		mapArgToBoolean("cache");

		// Process plugins
		ifBooleanArg("hot", () => {
			ensureArray(optionsObj, "plugins");
			const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
			optionsObj.plugins.push(new HotModuleReplacementPlugin());
		});

		ifBooleanArg("debug", () => {
			ensureArray(optionsObj, "plugins");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			optionsObj.plugins.push(new LoaderOptionsPlugin({
				debug: true
			}));
		});

		ifArg("devtool", (value) => {
			optionsObj.devtool = value;
		});

		// Process resolve aliases
		const processResolveAlias = (arg, key) => {
			ifArgPair(arg, (name, value) => {
				if(!name) {
					throw new Error("--" + arg + " <string>=<string>");
				}
				ensureObject(optionsObj, key);
				ensureObject(optionsObj[key], "alias");
				optionsObj[key].alias[name] = value;
			});
		};

		processResolveAlias("resolve-alias", "resolve");
		processResolveAlias("resolve-loader-alias", "resolveLoader");

		// Process resolve extensions
		ifArg("resolve-extensions", (value) => {
			ensureObject(optionsObj, "resolve");
			if(Array.isArray(value)) {
				optionsObj.resolve.extensions = value;
			} else {
				optionsObj.resolve.extensions = value.split(/,\s*/);
			}
		});

		// Process optimization plugins
		ifArg("optimize-max-chunks", (value) => {
			ensureArray(optionsObj, "plugins");
			const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			optionsObj.plugins.push(new LimitChunkCountPlugin