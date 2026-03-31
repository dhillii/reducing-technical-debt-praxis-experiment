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
			var resolvedPath = path.resolve(configPath);
			return {
				path: resolvedPath,
				ext: extractExtension(resolvedPath)
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

	function extractExtension(filePath) {
		var extensions = getSortedExtensions();
		for(var i = extensions.length - 1; i >= 0; i--) {
			var ext = extensions[i];
			if(filePath.endsWith(ext)) {
				return ext;
			}
		}
		return path.extname(filePath);
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
					// continue
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
		var noOutputFilenameDefined = !options.output || !options.output.filename;
		var argHandlers = createArgHandlers(options);

		argHandlers.entry();
		argHandlers.loaders();
		argHandlers.define();
		argHandlers.output();
		argHandlers.records();
		argHandlers.target();
		argHandlers.cache();
		argHandlers.plugins();
		argHandlers.devtool();
		argHandlers.resolve();
		argHandlers.optimize();
		argHandlers.bail();
		argHandlers.profile();

		handleOutputFilename(options, noOutputFilenameDefined);
		handleEntryPoints(options);
		validateEntry(options);
	}

	function createArgHandlers(options) {
		return {
			entry: function() {
				ifArgPair("entry", function(name, entry) {
					ensureObject(options, "entry");
					if(typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
						options.entry[name] = [].concat(options.entry[name]).concat(entry);
					} else {
						options.entry[name] = entry;
					}
				});
			},
			loaders: function() {
				bindLoaders("module-bind", "loaders");
				bindLoaders("module-bind-pre", "preLoaders");
				bindLoaders("module-bind-post", "postLoaders");
			},
			define: function() {
				var defineObject;
				ifArgPair("define", function(name, value) {
					if(name === null) {
						name = value;
						value = true;
					}
					defineObject[name] = value;
				}, function() {
					defineObject = {};
				}, function() {
					if(Object.keys(defineObject).length > 0) {
						ensureArray(options, "plugins");
						var DefinePlugin = require("../lib/DefinePlugin");
						options.plugins.push(new DefinePlugin(defineObject));
					}
				});
			},
			output: function() {
				ifArg("output-path", function(value) {
					ensureObject(options, "output");
					options.output.path = path.resolve(value);
				});
				ifArg("output-filename", function(value) {
					ensureObject(options, "output");
					options.output.filename = value;
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
			},
			records: function() {
				ifArg("records-input-path", function(value) {
					options.recordsInputPath = path.resolve(value);
				});
				ifArg("records-output-path", function(value) {
					options.recordsOutputPath = path.resolve(value);
				});
				ifArg("records-path", function(value) {
					options.recordsPath = path.resolve(value);
				});
			},
			target: function() {
				ifArg("target", function(value) {
					options.target = value;
				});
			},
			cache: function() {
				mapArgToBoolean("cache");
			},
			plugins: function() {
				ifBooleanArg("hot", function() {
					ensureArray(options, "plugins");
					var HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
					options.plugins.push(new HotModuleReplacementPlugin());
				});
				ifBooleanArg("debug", function() {
					ensureArray(options, "plugins");
					var LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
					options.plugins.push(new LoaderOptionsPlugin({ debug: true }));
				});
				ifArg("prefetch", function(request) {
					ensureArray(options, "plugins");
					var PrefetchPlugin = require("../lib/PrefetchPlugin");
					options.plugins.push(new PrefetchPlugin(request));
				});
				ifArg("provide", function(value) {
					ensureArray(options, "plugins");
					var parts = parseKeyValue(value);
					var ProvidePlugin = require("../lib/ProvidePlugin");
					options.plugins.push(new ProvidePlugin(parts.key, parts.value));
				});
				ifArg("plugin", function(value) {
					ensureArray(options, "plugins");
					options.plugins.push(loadPlugin(value));
				});
			},
			devtool: function() {
				ifArg("devtool", function(value) {
					options.devtool = value;
				});
			},
			resolve: function() {
				processResolveAlias("resolve-alias", "resolve");
				processResolveAlias("resolve-loader-alias", "resolveLoader");
				ifArg("resolve-extensions", function(value) {
					ensureObject(options, "resolve");
					options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
				});
			},
			optimize: function() {
				ifArg("optimize-max-chunks", function(value) {
					ensureArray(options, "plugins");
					var LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
					options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
				});
				ifArg("optimize-min-chunk-size", function(value) {
					ensureArray(options, "plugins");
					var MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
					options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
				});
				ifBooleanArg("optimize-minimize", function() {
					ensureArray(options, "plugins");
					var UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
					var LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
					var hasSourceMap = options.devtool && /sourcemap|source-map/.test(options.devtool);
					options.plugins.push(new UglifyJsPlugin({ sourceMap: hasSourceMap }));
					options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
				});
			},
			bail: function() {
				mapArgToBoolean("bail");
			},
			profile: function() {
				mapArgToBoolean("profile");
			}
		};
	}

	function handleOutputFilename(options, noOutputFilenameDefined) {
		if(!noOutputFilenameDefined) return;

		ensureObject(options, "output");

		if(convertOptions && convertOptions.outputFilename) {
			options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
			options.output.filename = path.basename(convertOptions.outputFilename);
		} else if(argv._.length > 0) {
			var filename = argv._.pop();
			options.output.path = path.resolve(path.dirname(filename));
			options.output.filename = path.basename(filename);
		} else if(configFileLoaded) {
			throw new Error("'output.filename' is required, either in config file or as --output-filename");
		} else {
			console.error("No configuration file found and no output filename configured via CLI option.");
			console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
			console.error("Use --help to display the CLI options.");
			process.exit(-1);
		}
	}

	function handleEntryPoints(options) {
		if(argv._.length === 0) return;

		if(Array.isArray(options.entry) || typeof options.entry === "string") {
			options.entry = { main: options.entry };
		}
		ensureObject(options, "entry");

		argv._.forEach(function(content) {
			var eqIdx = content.indexOf("=");
			var qIdx = content.indexOf("?");

			if(eqIdx < 0 || (qIdx >= 0 && qIdx < eqIdx)) {
				var resolved = path.resolve(content);
				addEntry("main", fs.existsSync(resolved) ? resolved : content, options);
			} else {
				addEntry(content.substr(0, eqIdx), content.substr(eqIdx + 1), options);
			}
		});
	}

	function addEntry(name, entry, options) {
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
		if(!options.entry) {
			if(configFileLoaded) {
				console.error("Configuration file found but no entry configured.");
			} else {
				console.error("No configuration file found and no entry configured via CLI option.");
				console.error("When