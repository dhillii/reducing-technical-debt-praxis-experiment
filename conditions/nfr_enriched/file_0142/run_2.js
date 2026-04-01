```javascript
const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

module.exports = function(yargs, argv, convertOptions) {
	const options = [];

	applyShortcutFlags(argv);

	const configFiles = resolveConfigFiles(argv);
	const configFileLoaded = configFiles.length > 0;

	if(configFileLoaded) {
		loadConfigFiles(configFiles, options, argv);
	}

	return processConfiguredOptions(
		configFileLoaded ? (options.length === 1 ? options[0] : options) : {},
		argv,
		convertOptions,
		configFileLoaded
	);

	// Apply shortcut flags (-d for debug, -p for production)
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
			argv["define"] = [].concat(argv["define"] || []).concat("process.env.NODE_ENV=\"production\"");
		}
	}

	// Resolve configuration files from argv or defaults
	function resolveConfigFiles(argv) {
		const extensions = Object.keys(interpret.extensions).sort((a, b) => {
			return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
		});

		if(argv.config) {
			return resolveExplicitConfigFiles(argv.config, extensions);
		}
		return resolveDefaultConfigFiles(extensions);
	}

	// Resolve explicitly provided config files
	function resolveExplicitConfigFiles(configArg, extensions) {
		const configArgList = Array.isArray(configArg) ? configArg : [configArg];
		return configArgList.map(arg => {
			const resolvedPath = path.resolve(arg);
			const extension = findConfigExtension(resolvedPath, extensions);
			return { path: resolvedPath, ext: extension };
		});
	}

	// Find extension for a config file path
	function findConfigExtension(configPath, extensions) {
		for(let i = extensions.length - 1; i >= 0; i--) {
			const tmpExt = extensions[i];
			if(configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1) {
				return tmpExt;
			}
		}
		return path.extname(configPath);
	}

	// Resolve default config files
	function resolveDefaultConfigFiles(extensions) {
		const defaultConfigFiles = ["webpack.config", "webpackfile"].map(filename => {
			return extensions.map(ext => ({
				path: path.resolve(filename + ext),
				ext: ext
			}));
		}).reduce((a, i) => a.concat(i), []);

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

	// Load configuration files
	function loadConfigFiles(configFiles, options, argv) {
		configFiles.forEach(file => {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path, argv));
		});
	}

	// Register compiler for file extension
	function registerCompiler(moduleDescriptor) {
		if(!moduleDescriptor) return;

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

	// Require and process config file
	function requireConfig(configPath, argv) {
		let options = require(configPath);
		const isES6DefaultExportedFunc = (
			typeof options === "object" && options !== null && typeof options.default === "function"
		);
		if(typeof options === "function" || isES6DefaultExportedFunc) {
			options = isES6DefaultExportedFunc ? options.default : options;
			options = options(argv.env, argv);
		}
		return options;
	}

	// Process configured options
	function processConfiguredOptions(options, argv, convertOptions, configFileLoaded) {
		if(options === null || typeof options !== "object") {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1); // eslint-disable-line
		}

		// Handle Promise
		if(typeof options.then === "function") {
			return options.then(opts => processConfiguredOptions(opts, argv, convertOptions, configFileLoaded));
		}

		// Handle ES6 default export
		if(typeof options === "object" && typeof options.default === "object") {
			return processConfiguredOptions(options.default, argv, convertOptions, configFileLoaded);
		}

		if(Array.isArray(options)) {
			options.forEach(opts => processOptions(opts, argv, convertOptions, configFileLoaded));
		} else {
			processOptions(options, argv, convertOptions, configFileLoaded);
		}

		applyContextOptions(options, argv);
		applyWatchOptions(options, argv);

		return options;
	}

	// Apply context-related options
	function applyContextOptions(options, argv) {
		if(argv.context) {
			options.context = path.resolve(argv.context);
		}
		if(!options.context) {
			options.context = process.cwd();
		}
	}

	// Apply watch-related options
	function applyWatchOptions(options, argv) {
		if(argv.watch) {
			options.watch = true;
		}

		if(argv["watch-aggregate-timeout"]) {
			options.watchOptions = options.watchOptions || {};
			options.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
		}

		if(argv["watch-poll"]) {
			options.watchOptions = options.watchOptions || {};
			if(typeof argv["watch-poll"] !== "boolean")
				options.watchOptions.poll = +argv["watch-poll"];
			else
				options.watchOptions.poll = true;
		}

		if(argv["watch-stdin"]) {
			options.watchOptions = options.watchOptions || {};
			options.watchOptions.stdin = true;
			options.watch = true;
		}
	}

	// Process individual options
	function processOptions(options, argv, convertOptions, configFileLoaded) {
		let noOutputFilenameDefined = !options.output || !options.output.filename;

		// Helper to process argument if present
		function ifArg(name, fn, init, finalize) {
			if(Array.isArray(argv[name])) {
				if(init) init();
				argv[name].forEach(fn);
				if(finalize) finalize();
			} else if(typeof argv[name] !== "undefined" && argv[name] !== null) {
				if(init) init();
				fn(argv[name], -1);
				if(finalize) finalize();
			}
		}

		// Helper to process key=value arguments
		function ifArgPair(name, fn, init, finalize) {
			ifArg(name, (content, idx) => {
				const i = content.indexOf("=");
				if(i < 0) {
					return fn(null, content, idx);
				}
				return fn(content.substr(0, i), content.substr(i + 1), idx);
			}, init, finalize);
		}

		// Helper to process boolean arguments
		function ifBooleanArg(name, fn) {
			ifArg(name, bool => {
				if(bool) fn();
			});
		}

		// Helper to map argument to boolean option
		function mapArgToBoolean(name, optionName) {
			ifArg(name, bool => {
				if(bool === true)
					options[optionName || name] = true;
				else if(bool === false)
					options[optionName || name] = false;
			});
		}

		// Load and instantiate a plugin
		function loadPlugin(name) {
			const loadUtils = require("loader-utils");
			let args;
			let pluginName = name;

			try {
				const p = name && name.indexOf("?");
				if(p > -1) {
					args = loadUtils.parseQuery(name.substring(p));
					pluginName = name.substring(0, p);
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

		// Ensure object exists at path
		function ensureObject(parent, name) {
			if(typeof parent[name] !== "object" || parent[name] === null) {
				parent[name] = {};
			}
		}

		// Ensure array exists at path
		function ensureArray(parent, name) {
			if(!Array.isArray(parent[name])) {
				parent[name] = [];
			}
		}

		// Process entry points
		ifArgPair("entry", (name, entry) => {
			if(typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
				options.entry[name] = [].concat(options.entry[name]).concat(entry);
			} else {
				options.entry[name] = entry;
			}
		}, () => {
			ensureObject(options, "entry");
		});

		// Bind loaders to file extensions
		function bindLoaders(arg, collection) {
			ifArgPair(arg, (name, binding) => {
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
			}, () => {
				ensureObject(options, "module");
				ensureArray(options.module, collection);
			});
		}

		bindLoaders("module-bind", "loaders");
		bindLoaders("module-bind-pre", "preLoaders");
		bindLoaders("module-bind-post", "postLoaders");

		// Process define plugin arguments
		let defineObject;
		ifArgPair("define", (name, value) => {
			let defineName = name;
			let defineValue = value;
			if(defineName === null) {
				defineName = defineValue;
				defineValue = true;
			}
			defineObject[defineName] = defineValue;
		}, () => {
			defineObject = {};
		}, () => {
			ensureArray(options, "plugins");
			const DefinePlugin = require("../lib/DefinePlugin");
			options.plugins.push(new DefinePlugin(defineObject));
		});

		// Process output options
		ifArg("output-path", value => {
			ensureObject(options, "output");
			options.output.path = path.resolve(value);
		});

		ifArg("output-filename", value => {
			ensureObject(options, "output");
			options.output.filename = value;
			noOutputFilenameDefined = false;
		});

		ifArg("output-chunk-filename", value => {
			ensureObject(options, "output");
			options.output.chunkFilename = value;
		});

		ifArg("output-source-map-filename", value => {
			ensureObject(options, "output");
			options.output.sourceMapFilename = value;
		});

		ifArg("output-public-path", value => {
			ensureObject(options, "output");
			options.output.publicPath = value;
		});

		ifArg("output-jsonp-function", value => {
			ensureObject(options, "output");
			options.output.jsonpFunction = value;
		});

		ifBooleanArg("output-pathinfo", () => {
			ensureObject(options, "output");
			options.output.pathinfo = true;
		});

		ifArg("output-library", value => {
			ensureObject(options, "output");
			options.output.library = value;
		});

		ifArg("output-library-target", value => {
			ensureObject(options, "output");
			options.output.libraryTarget = value;
		});

		// Process records options
		ifArg("records-input-path", value => {
			options.recordsInputPath = path.resolve(value);
		});

		ifArg("records-output-path", value => {
			options.recordsOutputPath = path.resolve(value);
		});

		ifArg("records-path", value => {
			options.recordsPath = path.resolve(value);
		});

		// Process target option
		ifArg("target", value => {
			options.target = value;
		});

		// Process cache option
		mapArgToBoolean("cache");

		// Process hot module replacement
		ifBooleanArg("hot", () => {
			ensureArray(options, "plugins");
			const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
			options.plugins.push(new HotModuleReplacementPlugin());
		});

		// Process debug option
		ifBooleanArg("debug", () => {
			ensureArray(options, "plugins");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			options.plugins.push(new LoaderOptionsPlugin({
				debug: true
			}));
		});

		// Process devtool option
		ifArg("devtool", value => {
			options.devtool = value;
		});

		// Process resolve alias options
		function processResolveAlias(arg, key) {
			ifArgPair(arg, (name, value) => {
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

		// Process resolve extensions
		ifArg("resolve-extensions", value => {
			ensureObject(options, "resolve");
			if(Array.isArray(value)) {
				options.resolve.extensions = value;
			} else