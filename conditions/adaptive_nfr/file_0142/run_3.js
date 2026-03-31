```javascript
var path = require("path");
var fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
var interpret = require("interpret");

module.exports = function(yargs, argv, convertOptions) {
	var options = [];

	applyShortcuts(argv);

	var configFiles = resolveConfigFiles(argv);
	var configFileLoaded = configFiles.length > 0;

	if(configFileLoaded) {
		loadConfigFiles(configFiles, argv, options);
	}

	return processConfiguredOptions(configFileLoaded ? (options.length === 1 ? options[0] : options) : {});

	// ============ Config Resolution ============

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
			argv["define"] = [].concat(argv["define"] || []).concat("process.env.NODE_ENV=\"production\"");
		}
	}

	function resolveConfigFiles(argv) {
		if(argv.config) {
			return resolveExplicitConfigFiles(argv.config);
		}
		return resolveDefaultConfigFiles();
	}

	function resolveExplicitConfigFiles(configArg) {
		var configArgList = Array.isArray(configArg) ? configArg : [configArg];
		return configArgList.map(function(configPath) {
			return {
				path: path.resolve(configPath),
				ext: getConfigExtension(configPath)
			};
		});
	}

	function resolveDefaultConfigFiles() {
		var extensions = getSortedExtensions();
		var defaultNames = ["webpack.config", "webpackfile"];
		var candidates = defaultNames.flatMap(function(name) {
			return extensions.map(function(ext) {
				return { path: path.resolve(name + ext), ext: ext };
			});
		});

		for(var i = 0; i < candidates.length; i++) {
			if(fs.existsSync(candidates[i].path)) {
				return [candidates[i]];
			}
		}
		return [];
	}

	function getSortedExtensions() {
		return Object.keys(interpret.extensions).sort(function(a, b) {
			if(a === ".js") return -1;
			if(b === ".js") return 1;
			return a.length - b.length;
		});
	}

	function getConfigExtension(configPath) {
		var extensions = getSortedExtensions();
		for(var i = extensions.length - 1; i >= 0; i--) {
			var ext = extensions[i];
			if(configPath.endsWith(ext)) {
				return ext;
			}
		}
		return path.extname(configPath);
	}

	function loadConfigFiles(configFiles, argv, options) {
		configFiles.forEach(function(file) {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path, argv));
		});
	}

	function registerCompiler(moduleDescriptor) {
		if(!moduleDescriptor) return;

		if(typeof moduleDescriptor === "string") {
			require(moduleDescriptor);
		} else if(Array.isArray(moduleDescriptor)) {
			for(var i = 0; i < moduleDescriptor.length; i++) {
				try {
					registerCompiler(moduleDescriptor[i]);
					break;
				} catch(e) {
					// continue to next
				}
			}
		} else if(typeof moduleDescriptor.register === "function") {
			moduleDescriptor.register(require(moduleDescriptor.module));
		}
	}

	function requireConfig(configPath, argv) {
		var options = require(configPath);
		var isES6DefaultExport = typeof options === "object" && options !== null && typeof options.default === "function";

		if(typeof options === "function" || isES6DefaultExport) {
			options = isES6DefaultExport ? options.default : options;
			options = options(argv.env, argv);
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

		applyGlobalOptions(options);
		return options;
	}

	function applyGlobalOptions(options) {
		if(argv.context) {
			options.context = path.resolve(argv.context);
		}
		if(!options.context) {
			options.context = process.cwd();
		}

		if(argv.watch) {
			options.watch = true;
		}

		var watchOptions = {
			"watch-aggregate-timeout": "aggregateTimeout",
			"watch-poll": "poll",
			"watch-stdin": "stdin"
		};

		Object.keys(watchOptions).forEach(function(argName) {
			if(argv[argName]) {
				options.watchOptions = options.watchOptions || {};
				var optionName = watchOptions[argName];

				if(argName === "watch-poll") {
					options.watchOptions[optionName] = typeof argv[argName] === "boolean" ? true : +argv[argName];
				} else if(argName === "watch-stdin") {
					options.watchOptions[optionName] = true;
					options.watch = true;
				} else {
					options.watchOptions[optionName] = +argv[argName];
				}
			}
		});
	}

	function processOptions(options) {
		var noOutputFilenameDefined = !options.output || !options.output.filename;
		var argHandlers = createArgHandlers(options);

		// Entry points
		argHandlers.ifArgPair("entry", function(name, entry) {
			ensureObject(options, "entry");
			if(typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
				options.entry[name] = [].concat(options.entry[name]).concat(entry);
			} else {
				options.entry[name] = entry;
			}
		});

		// Module loaders
		bindLoaders(argHandlers, "module-bind", "loaders");
		bindLoaders(argHandlers, "module-bind-pre", "preLoaders");
		bindLoaders(argHandlers, "module-bind-post", "postLoaders");

		// Define plugin
		var defineObject;
		argHandlers.ifArgPair("define", function(name, value) {
			if(name === null) {
				name = value;
				value = true;
			}
			defineObject[name] = value;
		}, function() {
			defineObject = {};
		}, function() {
			ensureArray(options, "plugins");
			var DefinePlugin = require("../lib/DefinePlugin");
			options.plugins.push(new DefinePlugin(defineObject));
		});

		// Output options
		var outputHandlers = {
			"output-path": function(value) { options.output.path = path.resolve(value); },
			"output-filename": function(value) { options.output.filename = value; noOutputFilenameDefined = false; },
			"output-chunk-filename": function(value) { options.output.chunkFilename = value; },
			"output-source-map-filename": function(value) { options.output.sourceMapFilename = value; },
			"output-public-path": function(value) { options.output.publicPath = value; },
			"output-jsonp-function": function(value) { options.output.jsonpFunction = value; },
			"output-library": function(value) { options.output.library = value; },
			"output-library-target": function(value) { options.output.libraryTarget = value; }
		};

		Object.keys(outputHandlers).forEach(function(key) {
			argHandlers.ifArg(key, function(value) {
				ensureObject(options, "output");
				outputHandlers[key](value);
			});
		});

		argHandlers.ifBooleanArg("output-pathinfo", function() {
			ensureObject(options, "output");
			options.output.pathinfo = true;
		});

		// Records
		argHandlers.ifArg("records-input-path", function(value) {
			options.recordsInputPath = path.resolve(value);
		});
		argHandlers.ifArg("records-output-path", function(value) {
			options.recordsOutputPath = path.resolve(value);
		});
		argHandlers.ifArg("records-path", function(value) {
			options.recordsPath = path.resolve(value);
		});

		// Target and cache
		argHandlers.ifArg("target", function(value) {
			options.target = value;
		});
		argHandlers.mapArgToBoolean("cache");

		// Plugins
		argHandlers.ifBooleanArg("hot", function() {
			ensureArray(options, "plugins");
			var HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
			options.plugins.push(new HotModuleReplacementPlugin());
		});

		argHandlers.ifBooleanArg("debug", function() {
			ensureArray(options, "plugins");
			var LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			options.plugins.push(new LoaderOptionsPlugin({ debug: true }));
		});

		argHandlers.ifArg("devtool", function(value) {
			options.devtool = value;
		});

		// Resolve
		processResolveAlias(argHandlers, "resolve-alias", "resolve");
		processResolveAlias(argHandlers, "resolve-loader-alias", "resolveLoader");

		argHandlers.ifArg("resolve-extensions", function(value) {
			ensureObject(options, "resolve");
			options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
		});

		// Optimization
		argHandlers.ifArg("optimize-max-chunks", function(value) {
			ensureArray(options, "plugins");
			var LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
		});

		argHandlers.ifArg("optimize-min-chunk-size", function(value) {
			ensureArray(options, "plugins");
			var MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
			options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
		});

		argHandlers.ifBooleanArg("optimize-minimize", function() {
			ensureArray(options, "plugins");
			var UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
			var LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			var hasSourceMap = options.devtool && /sourcemap|source-map/.test(options.devtool);
			options.plugins.push(new UglifyJsPlugin({ sourceMap: hasSourceMap }));
			options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
		});

		// Additional plugins
		argHandlers.ifArg("prefetch", function(request) {
			ensureArray(options, "plugins");
			var PrefetchPlugin = require("../lib/PrefetchPlugin");
			options.plugins.push(new PrefetchPlugin(request));
		});

		argHandlers.ifArg("provide", function(value) {
			ensureArray(options, "plugins");
			var idx = value.indexOf("=");
			var name = idx >= 0 ? value.substr(0, idx) : value;
			var moduleName = idx >= 0 ? value.substr(idx + 1) : value;
			var ProvidePlugin = require("../lib/ProvidePlugin");
			options.plugins.push(new ProvidePlugin(name, moduleName));
		});

		argHandlers.ifArg("plugin", function(value) {
			ensureArray(options, "plugins");
			options.plugins.push(loadPlugin(value));
		});

		argHandlers.mapArgToBoolean("bail");
		argHandlers.mapArgToBoolean("profile");

		// Output filename handling
		handleOutputFilename(options, noOutputFilenameDefined);

		// Entry from CLI arguments
		handleCliEntries(options);

		// Validate entry
		validateEntry(options);
	}

	function createArgHandlers(options) {
		return {
			ifArg: function(name, fn, init, finalize) {
				if(Array.isArray(argv[name])) {
					if(init) init();
					argv[name].forEach(fn);
					if(finalize) finalize();
				} else if(typeof argv[name] !== "undefined" && argv[name] !== null) {
					if(init) init();
					fn(argv[name], -1);
					if(finalize) finalize();
				}
			},
			ifArgPair: function(name, fn, init, finalize) {
				this.ifArg(name, function(content, idx) {
					var i = content.indexOf("=");
					return fn(i < 0 ? null : content.substr(0, i), i < 0 ? content : content.substr(i + 1), idx);
				}, init, finalize);
			},
			ifBooleanArg: function(name, fn) {
				this.ifArg(name, function(bool) {
					if(bool) fn();
				});
			},
			mapArgToBoolean: function(name, optionName) {
				this.ifArg(name, function(bool) {
					if(bool === true) options[optionName || name] = true;
					else if(bool === false) options[optionName || name] = false;
				});
			}
		};
	}

	function bindLoaders(argHandlers, argName, collectionName) {
		argHandlers.ifArgPair(argName, function(name, binding) {
			if(name === null) {
				name = binding;
				binding += "-loader";
			}
			options.module[collectionName].push({
				test: new RegExp("\\." + escapeRegex(name) + "$"),
				loader: binding
			});
		}, function() {
			ensureObject(options, "module");
			ensureArray(options.module, collectionName);
		});
	}

	function escapeRegex(str) {
		return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
	}

	function processResolveAlias(argHandlers, argName, optionKey) {
		argHandlers.ifArgPair(argName, function(name, value) {
			if(!name) {
				throw new Error("--" + argName + " <string>=<string>");
			}
			ensureObject(options, optionKey);
			ensureObject(options[optionKey], "alias");
			options[optionKey].alias[name] = value;
		});
	}

	function loadPlugin(name) {
		var loadUtils = require("loader-utils");
		var args;
		try {
			var p = name && name.indexOf("?");
			if(p > -1) {
				args =