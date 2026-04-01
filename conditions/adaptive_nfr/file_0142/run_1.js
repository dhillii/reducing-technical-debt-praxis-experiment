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
		loadConfigFiles(configFiles, options, argv);
		configFileLoaded = true;
	}

	if(!configFileLoaded) {
		return processConfiguredOptions({});
	} else if(options.length === 1) {
		return processConfiguredOptions(options[0]);
	} else {
		return processConfiguredOptions(options);
	}

	function loadConfigFilesFromArgv(configArg, extensions) {
		const getConfigExtension = function(configPath) {
			for(let i = extensions.length - 1; i >= 0; i--) {
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

	function loadDefaultConfigFiles(defaultConfigFiles) {
		const result = [];
		for(let i = 0; i < defaultConfigFiles.length; i++) {
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

	function loadConfigFiles(configFiles, options, argv) {
		const registerCompiler = function(moduleDescriptor) {
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
		};

		const registerCompilerArray = function(descriptors) {
			for(let i = 0; i < descriptors.length; i++) {
				try {
					registerCompiler(descriptors[i]);
					break;
				} catch(e) {
					// do nothing
				}
			}
		};

		const requireConfig = function(configPath) {
			let opts = require(configPath);
			const isES6DefaultExportedFunc = isES6DefaultExport(opts);
			if(typeof opts === "function" || isES6DefaultExportedFunc) {
				opts = isES6DefaultExportedFunc ? opts.default : opts;
				opts = opts(argv.env, argv);
			}
			return opts;
		};

		configFiles.forEach(function(file) {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path));
		});
	}

	function isES6DefaultExport(opts) {
		return typeof opts === "object" && opts !== null && typeof opts.default === "function";
	}

	function processConfiguredOptions(opts) {
		if(!isValidConfigObject(opts)) {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1); // eslint-disable-line
		}

		if(isPromise(opts)) {
			return opts.then(processConfiguredOptions);
		}

		if(isES6DefaultExportObject(opts)) {
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

	function isValidConfigObject(opts) {
		return opts !== null && typeof opts === "object";
	}

	function isPromise(opts) {
		return typeof opts.then === "function";
	}

	function isES6DefaultExportObject(opts) {
		return typeof opts === "object" && typeof opts.default === "object";
	}

	function applyContextOption(opts) {
		if(argv.context) {
			opts.context = path.resolve(argv.context);
		}
		if(!opts.context) {
			opts.context = process.cwd();
		}
	}

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
				const eqIdx = content.indexOf("=");
				if(eqIdx < 0) {
					return fn(null, content, idx);
				}
				return fn(content.substr(0, eqIdx), content.substr(eqIdx + 1), idx);
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
			if(Array.isArray(value)) {
				opts.resolve.extensions = value;
			} else {
				opts.resolve.extensions = value.split(/,\s*/);
			}
		});

		ifArg("optimize-max-chunks", function(value) {
			ensureArray(opts, "plugins");
			const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			opts.plugins.push(new LimitChunkCountPlugin({
				maxChunks: parseInt(value, 10)