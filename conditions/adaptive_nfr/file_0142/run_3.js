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

	/**
	 * Load config files from command line argument
	 */
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

	/**
	 * Load default config files from filesystem
	 */
	function loadDefaultConfigFiles(defaultConfigFiles) {
		const configFiles = [];
		for(let i = 0; i < defaultConfigFiles.length; i++) {
			const webpackConfig = defaultConfigFiles[i].path;
			if(fs.existsSync(webpackConfig)) {
				configFiles.push({
					path: webpackConfig,
					ext: defaultConfigFiles[i].ext
				});
				break;
			}
		}
		return configFiles;
	}

	/**
	 * Load and register config files
	 */
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
			let options = require(configPath);
			const isES6DefaultExportedFunc = isES6DefaultExport(options);
			if(typeof options === "function" || isES6DefaultExportedFunc) {
				options = isES6DefaultExportedFunc ? options.default : options;
				options = options(argv.env, argv);
			}
			return options;
		};

		configFiles.forEach(function(file) {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path));
		});
	}

	/**
	 * Check if object is ES6 default export
	 */
	function isES6DefaultExport(options) {
		return typeof options === "object" && options !== null && typeof options.default === "function";
	}

	function processConfiguredOptions(options) {
		if(!isValidConfigObject(options)) {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1); // eslint-disable-line
		}

		// process Promise
		if(typeof options.then === "function") {
			return options.then(processConfiguredOptions);
		}

		// process ES6 default
		if(isES6DefaultObject(options)) {
			return processConfiguredOptions(options.default);
		}

		if(Array.isArray(options)) {
			options.forEach(processOptions);
		} else {
			processOptions(options);
		}

		applyContextOption(options);
		applyWatchOptions(options);

		return options;
	}

	/**
	 * Check if value is valid config object
	 */
	function isValidConfigObject(options) {
		return options !== null && typeof options === "object";
	}

	/**
	 * Check if object is ES6 default export object
	 */
	function isES6DefaultObject(options) {
		return typeof options === "object" && typeof options.default === "object";
	}

	/**
	 * Apply context option to config
	 */
	function applyContextOption(options) {
		if(argv.context) {
			options.context = path.resolve(argv.context);
		}
		if(!options.context) {
			options.context = process.cwd();
		}
	}

	/**
	 * Apply watch-related options to config
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
				const i = content.indexOf("=");
				if(i < 0) {
					return fn(null, content, idx);
				}
				return fn(content.substr(0, i), content.substr(i + 1), idx);
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
			try {
				const p = name && name.indexOf("?");
				if(p > -1) {
					args = loadUtils.parseQuery(name.substring(p));
					name = name.substring(0, p);
				}
			} catch(e) {
				console.log("Invalid plugin arguments " + name + " (" + e + ").");
				process.exit(-1); // eslint-disable-line
			}

			let pluginPath;
			try {
				const resolve = require("enhanced-resolve");
				pluginPath = resolve.sync(process.cwd(), name);
			} catch(e) {
				console.log("Cannot resolve plugin " + name + ".");
				process.exit(-1); // eslint-disable-line
			}
			let Plugin;
			try {
				Plugin = require(pluginPath);
			} catch(e) {
				console.log("Cannot load plugin " + name + ". (" + pluginPath + ")");
				throw e;
			}
			try {
				return new Plugin(args);
			} catch(e) {
				console.log("Cannot instantiate plugin " + name + ". (" + pluginPath + ")");
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
				if(name === null) {
					name = binding;
					binding += "-loader";
				}
				options.module[collection].push({
					test: new RegExp("\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
					loader: binding
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
			if(name === null) {
				name = value;
				value = true;
			}
			defineObject[name] = value;
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

		ifArg("optimize-