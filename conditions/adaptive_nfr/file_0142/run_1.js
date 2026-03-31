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
		var configFiles = [];

		for(var i = 0; i < defaultNames.length; i++) {
			for(var j = 0; j < extensions.length; j++) {
				var configPath = path.resolve(defaultNames[i] + extensions[j]);
				if(fs.existsSync(configPath)) {
					configFiles.push({
						path: configPath,
						ext: extensions[j]
					});
					return configFiles;
				}
			}
		}
		return configFiles;
	}

	function getSortedExtensions() {
		return Object.keys(interpret.extensions).sort(function(a, b) {
			return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
		});
	}

	function extractExtension(configPath) {
		var extensions = getSortedExtensions();
		for(var i = extensions.length - 1; i >= 0; i--) {
			var ext = extensions[i];
			if(configPath.indexOf(ext, configPath.length - ext.length) > -1) {
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
					// continue
				}
			}
		} else if(typeof moduleDescriptor === "object") {
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

	function processConfiguredOptions(opts) {
		if(opts === null || typeof opts !== "object") {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1);
		}

		if(typeof opts.then === "function") {
			return opts.then(processConfiguredOptions);
		}

		if(typeof opts === "object" && typeof opts.default === "object") {
			return processConfiguredOptions(opts.default);
		}

		if(Array.isArray(opts)) {
			opts.forEach(processOptions);
		} else {
			processOptions(opts);
		}

		applyGlobalOptions(opts);
		return opts;
	}

	function applyGlobalOptions(opts) {
		if(argv.context) {
			opts.context = path.resolve(argv.context);
		}
		if(!opts.context) {
			opts.context = process.cwd();
		}

		if(argv.watch) {
			opts.watch = true;
		}

		var watchOptions = {};
		var hasWatchOptions = false;

		if(argv["watch-aggregate-timeout"]) {
			watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
			hasWatchOptions = true;
		}

		if(argv["watch-poll"]) {
			watchOptions.poll = typeof argv["watch-poll"] === "boolean" ? true : +argv["watch-poll"];
			hasWatchOptions = true;
		}

		if(argv["watch-stdin"]) {
			watchOptions.stdin = true;
			opts.watch = true;
			hasWatchOptions = true;
		}

		if(hasWatchOptions) {
			opts.watchOptions = opts.watchOptions || {};
			Object.assign(opts.watchOptions, watchOptions);
		}
	}

	function processOptions(opts) {
		var noOutputFilenameDefined = !opts.output || !opts.output.filename;
		var argProcessor = createArgProcessor(opts);

		argProcessor.ifArgPair("entry", function(name, entry) {
			if(typeof opts.entry[name] !== "undefined" && opts.entry[name] !== null) {
				opts.entry[name] = [].concat(opts.entry[name]).concat(entry);
			} else {
				opts.entry[name] = entry;
			}
		}, function() {
			ensureObject(opts, "entry");
		});

		argProcessor.bindLoaders("module-bind", "loaders");
		argProcessor.bindLoaders("module-bind-pre", "preLoaders");
		argProcessor.bindLoaders("module-bind-post", "postLoaders");

		var defineObject;
		argProcessor.ifArgPair("define", function(name, value) {
			if(name === null) {
				name = value;
				value = true;
			}
			defineObject[name] = value;
		}, function() {
			defineObject = {};
		}, function() {
			ensureArray(opts, "plugins");
			var DefinePlugin = require("../lib/DefinePlugin");
			opts.plugins.push(new DefinePlugin(defineObject));
		});

		argProcessor.processOutputOptions(opts);
		argProcessor.processRecordsOptions(opts);
		argProcessor.processResolveOptions(opts);
		argProcessor.processOptimizeOptions(opts);
		argProcessor.processPluginOptions(opts);

		argProcessor.mapArgToBoolean("cache");
		argProcessor.mapArgToBoolean("bail");
		argProcessor.mapArgToBoolean("profile");

		argProcessor.ifArg("target", function(value) {
			opts.target = value;
		});

		argProcessor.ifArg("devtool", function(value) {
			opts.devtool = value;
		});

		processOutputFilename(opts, noOutputFilenameDefined);
		processEntryPoints(opts);

		if(!opts.entry) {
			logMissingEntryError();
			process.exit(-1);
		}
	}

	function createArgProcessor(opts) {
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
					if(i < 0) {
						return fn(null, content, idx);
					}
					return fn(content.substr(0, i), content.substr(i + 1), idx);
				}, init, finalize);
			},

			ifBooleanArg: function(name, fn) {
				this.ifArg(name, function(bool) {
					if(bool) fn();
				});
			},

			mapArgToBoolean: function(name, optionName) {
				this.ifArg(name, function(bool) {
					if(bool === true) opts[optionName || name] = true;
					else if(bool === false) opts[optionName || name] = false;
				});
			},

			bindLoaders: function(arg, collection) {
				this.ifArgPair(arg, function(name, binding) {
					if(name === null) {
						name = binding;
						binding += "-loader";
					}
					opts.module[collection].push({
						test: new RegExp("\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
						loader: binding
					});
				}, function() {
					ensureObject(opts, "module");
					ensureArray(opts.module, collection);
				});
			},

			processOutputOptions: function(opts) {
				this.ifArg("output-path", function(value) {
					ensureObject(opts, "output");
					opts.output.path = path.resolve(value);
				});

				this.ifArg("output-filename", function(value) {
					ensureObject(opts, "output");
					opts.output.filename = value;
					noOutputFilenameDefined = false;
				});

				this.ifArg("output-chunk-filename", function(value) {
					ensureObject(opts, "output");
					opts.output.chunkFilename = value;
				});

				this.ifArg("output-source-map-filename", function(value) {
					ensureObject(opts, "output");
					opts.output.sourceMapFilename = value;
				});

				this.ifArg("output-public-path", function(value) {
					ensureObject(opts, "output");
					opts.output.publicPath = value;
				});

				this.ifArg("output-jsonp-function", function(value) {
					ensureObject(opts, "output");
					opts.output.jsonpFunction = value;
				});

				this.ifBooleanArg("output-pathinfo", function() {
					ensureObject(opts, "output");
					opts.output.pathinfo = true;
				});

				this.ifArg("output-library", function(value) {
					ensureObject(opts, "output");
					opts.output.library = value;
				});

				this.ifArg("output-library-target", function(value) {
					ensureObject(opts, "output");
					opts.output.libraryTarget = value;
				});
			},

			processRecordsOptions: function(opts) {
				this.ifArg("records-input-path", function(value) {
					opts.recordsInputPath = path.resolve(value);
				});

				this.ifArg("records-output-path", function(value) {
					opts.recordsOutputPath = path.resolve(value);
				});

				this.ifArg("records-path", function(value) {
					opts.recordsPath = path.resolve(value);
				});
			},

			processResolveOptions: function(opts) {
				var self = this;
				this.ifArgPair("resolve-alias", function(name, value) {
					if(!name) throw new Error("--resolve-alias <string>=<string>");
					ensureObject(opts, "resolve");
					ensureObject(opts.resolve, "alias");
					opts.resolve.alias[name] = value;
				});

				this.ifArgPair("resolve-loader-alias", function(name, value) {
					if(!name) throw new Error("--resolve-loader-alias <string>=<string>");
					ensureObject(opts, "resolveLoader");
					ensureObject(opts.resolveLoader, "alias");
					opts.resolveLoader.alias[name] = value;
				});

				this.ifArg("resolve-extensions", function(value) {
					ensureObject(opts, "resolve");
					opts.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
				});
			},

			processOptimizeOptions: function(opts) {
				this.ifArg("optimize-max-chunks", function(value) {
					ensureArray(opts, "plugins");
					var LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
					opts.plugins.push(new LimitChunkCountPlugin({
						maxChunks: parseInt(value, 10)
					}));
				});

				this.ifArg("optimize-min-chunk-size", function(value) {
					ensureArray(opts, "plugins");
					var MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
					opts.plugins.push(new MinChunkSizePlugin({
						minChunkSize: parseInt(value, 10)
					}));
				});

				this.ifBooleanArg("optimize-minimize", function() {
					ensureArray(opts, "plugins");
					var UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
					var LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
					var hasSourceMap = opts.devtool && (opts.devtool.indexOf("sourcemap") >= 0 || opts.devtool.indexOf("source-map") >= 0);
					opts.plugins.push(new UglifyJsPlugin({
						sourceMap: hasSourceMap
					}));
					opts.plugins.push(new LoaderOptionsPlugin({
						minimize: true
					}));
				});
			},

			processPluginOptions: function(opts) {
				this.ifBooleanArg("hot", function() {
					ensureArray(opts, "plugins");
					var HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
					opts.plugins.push(new HotModuleReplacementPlugin());
				});

				this.ifBooleanArg("debug", function() {
					ensureArray(opts, "plugins");
					var LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
					opts.plugins.push(new LoaderOptionsPlugin({
						debug: true
					}));
				});

				this.ifArg("prefetch", function(request) {
					ensureArray(opts, "plugins");
					var PrefetchPlugin = require("../lib/PrefetchPlugin");
					opts.plugins.push(new PrefetchPlugin(request));
				});

				this.ifArg("provide", function(value) {
					ensureArray(opts, "plugins");
					var idx = value.indexOf("=");
					var name = idx >= 0 ? value.substr(0, idx) : value;
					var val = idx >= 0 ? value