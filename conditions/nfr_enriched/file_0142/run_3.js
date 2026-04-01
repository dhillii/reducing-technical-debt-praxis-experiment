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

	// Resolves configuration files from argv or defaults
	function resolveConfigFiles(argv) {
		const extensions = Object.keys(interpret.extensions).sort((a, b) => {
			return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
		});

		if(argv.config) {
			return resolveExplicitConfigFiles(argv.config, extensions);
		} else {
			return resolveDefaultConfigFiles(extensions);
		}
	}

	// Resolves explicitly provided config files
	function resolveExplicitConfigFiles(configArg, extensions) {
		const getConfigExtension = (configPath) => {
			for(let i = extensions.length - 1; i >= 0; i--) {
				const tmpExt = extensions[i];
				if(configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1) {
					return tmpExt;
				}
			}
			return path.extname(configPath);
		};

		const mapConfigArg = (arg) => {
			const resolvedPath = path.resolve(arg);
			const extension = getConfigExtension(resolvedPath);
			return { path: resolvedPath, ext: extension };
		};

		const configArgList = Array.isArray(configArg) ? configArg : [configArg];
		return configArgList.map(mapConfigArg);
	}

	// Resolves default config files
	function resolveDefaultConfigFiles(extensions) {
		const defaultConfigFiles = ["webpack.config", "webpackfile"]
			.map((filename) => extensions.map((ext) => ({
				path: path.resolve(filename + ext),
				ext: ext
			})))
			.reduce((a, i) => a.concat(i), []);

		for(let i = 0; i < defaultConfigFiles.length; i++) {
			const webpackConfig = defaultConfigFiles[i].path;
			if(fs.existsSync(webpackConfig)) {
				return [{ path: webpackConfig, ext: defaultConfigFiles[i].ext }];
			}
		}
		return [];
	}

	// Loads configuration files and populates options array
	function loadConfigFiles(configFiles, options, argv) {
		if(configFiles.length === 0) {
			return false;
		}

		configFiles.forEach((file) => {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path));
		});
		return true;
	}

	// Registers compiler for a given module descriptor
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

	// Requires and processes a config file
	function requireConfig(configPath) {
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

	// Processes configured options and applies CLI arguments
	function processConfiguredOptions(options, argv, convertOptions, configFileLoaded) {
		if(options === null || typeof options !== "object") {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1); // eslint-disable-line
		}

		// Handle Promise
		if(typeof options.then === "function") {
			return options.then((opts) => processConfiguredOptions(opts, argv, convertOptions, configFileLoaded));
		}

		// Handle ES6 default export
		if(typeof options === "object" && typeof options.default === "object") {
			return processConfiguredOptions(options.default, argv, convertOptions, configFileLoaded);
		}

		if(Array.isArray(options)) {
			options.forEach((opts) => processOptions(opts, argv, convertOptions, configFileLoaded));
		} else {
			processOptions(options, argv, convertOptions, configFileLoaded);
		}

		applyContextOptions(options, argv);
		applyWatchOptions(options, argv);

		return options;
	}

	// Applies context-related options
	function applyContextOptions(options, argv) {
		if(argv.context) {
			options.context = path.resolve(argv.context);
		}
		if(!options.context) {
			options.context = process.cwd();
		}
	}

	// Applies watch-related options
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

	// Processes individual option configuration
	function processOptions(options, argv, convertOptions, configFileLoaded) {
		let noOutputFilenameDefined = !options.output || !options.output.filename;

		// Helper to conditionally apply argument
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

		// Helper to parse key=value pairs
		function ifArgPair(name, fn, init, finalize) {
			ifArg(name, (content, idx) => {
				const i = content.indexOf("=");
				if(i < 0) {
					return fn(null, content, idx);
				} else {
					return fn(content.substr(0, i), content.substr(i + 1), idx);
				}
			}, init, finalize);
		}

		// Helper for boolean arguments
		function ifBooleanArg(name, fn) {
			ifArg(name, (bool) => {
				if(bool) fn();
			});
		}

		// Helper to map argument to boolean option
		function mapArgToBoolean(name, optionName) {
			ifArg(name, (bool) => {
				if(bool === true)
					options[optionName || name] = true;
				else if(bool === false)
					options[optionName || name] = false;
			});
		}

		// Loads and instantiates a plugin
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
		ifArgPair("entry", (name, entry) => {
			if(typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
				options.entry[name] = [].concat(options.entry[name]).concat(entry);
			} else {
				options.entry[name] = entry;
			}
		}, () => {
			ensureObject(options, "entry");
		});

		// Binds loaders to configuration
		function bindLoaders(arg, collection) {
			ifArgPair(arg, (name, binding) => {
				if(name === null) {
					name = binding;
					binding += "-loader";
				}
				options.module[collection].push({
					test: new RegExp("\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
					loader: binding
				});
			}, () => {
				ensureObject(options, "module");
				ensureArray(options.module, collection);
			});
		}

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
			ensureArray(options, "plugins");
			const DefinePlugin = require("../lib/DefinePlugin");
			options.plugins.push(new DefinePlugin(defineObject));
		});

		// Process output options
		ifArg("output-path", (value) => {
			ensureObject(options, "output");
			options.output.path = path.resolve(value);
		});

		ifArg("output-filename", (value) => {
			ensureObject(options, "output");
			options.output.filename = value;
			noOutputFilenameDefined = false;
		});

		ifArg("output-chunk-filename", (value) => {
			ensureObject(options, "output");
			options.output.chunkFilename = value;
		});

		ifArg("output-source-map-filename", (value) => {
			ensureObject(options, "output");
			options.output.sourceMapFilename = value;
		});

		ifArg("output-public-path", (value) => {
			ensureObject(options, "output");
			options.output.publicPath = value;
		});

		ifArg("output-jsonp-function", (value) => {
			ensureObject(options, "output");
			options.output.jsonpFunction = value;
		});

		ifBooleanArg("output-pathinfo", () => {
			ensureObject(options, "output");
			options.output.pathinfo = true;
		});

		ifArg("output-library", (value) => {
			ensureObject(options, "output");
			options.output.library = value;
		});

		ifArg("output-library-target", (value) => {
			ensureObject(options, "output");
			options.output.libraryTarget = value;
		});

		// Process records options
		ifArg("records-input-path", (value) => {
			options.recordsInputPath = path.resolve(value);
		});

		ifArg("records-output-path", (value) => {
			options.recordsOutputPath = path.resolve(value);
		});

		ifArg("records-path", (value) => {
			options.recordsPath = path.resolve(value);
		});

		// Process target option
		ifArg("target", (value) => {
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
		ifArg("devtool", (value) => {
			options.devtool = value;
		});

		// Processes resolve alias options
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
		ifArg("resolve-extensions", (value) => {
			ensureObject(options, "resolve");
			if(Array.isArray(value)) {
				options.resolve.extensions = value;
			} else {
				options.resolve.extensions = value.split(/,\s*/);
			}
		});

		// Process optimize max chunks
		ifArg("optimize-max-chunks", (value) => {
			ensureArray(options, "plugins");
			const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			options.plugins.push(new LimitChunkCountPlugin({
				maxChunks: parseInt(value, 10)
			}));
		});

		// Process optimize min chunk size
		ifArg("optimize-min-chunk-size", (value) => {
			ensureArray(options, "plugins");
			const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
			options.plugins.push(new MinChunkSizePlugin({
				minChunkSize: parseInt(value, 10)
			}));
		});

		// Process minimize option
		ifBooleanArg("optimize-minimize", () => {
			ensureArray(options, "plugins");
			const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			options.plugins.push(new UglifyJsPlugin({
				sourceMap: options.devtool && (options.devtool.indexOf("sourcemap") >= 0 || options.devtool.indexOf("source-map") >= 0)
			}));
			options.plugins.push(new LoaderOptionsPlugin({
				minimize: true
			}));
		});

		// Process prefetch option
		ifArg("prefetch", (request) => {
			ensureArray(options, "plugins");
			const PrefetchPlugin = require("../lib/PrefetchPlugin");
			options.plugins.push(new PrefetchPlugin(request));
		});

		// Process provide option
		ifArg("provide", (value) => {
			ensureArray(options, "plugins");
			const idx = value.indexOf("=");
			let name;
			if(idx >= 0) {
				name = value.substr(0, idx);
				value = value.substr(idx + 1);
			} else {
				name = value;
			}
			const ProvidePlugin = require("../lib/ProvidePlugin");
			options.plugins.push(new ProvidePlugin(name, value));
		});

		// Process plugin option
		ifArg("plugin", (value) => {
			ensureArray(options, "plugins");
			options.plugins.push(loadPlugin(value));
		});

		// Process bail and profile options
		mapArgToBoolean("bail");
		mapArgToBoolean("profile");

		// Handle output filename configuration
		if(noOutputFilenameDefined) {
			ensureObject(options, "output");
			if(convertOptions && convertOptions.outputFilename) {
				options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
				options.output.filename = path.basename(convertOptions.outputFilename);
			} else if(argv._.length > 0) {
				options.output.filename = argv._.pop();
				options.output.path = path.resolve(path.dirname(options.output.filename));
				options.output.filename = path.basename(options.output.filename);
			} else if(configFileLoaded) {
				throw new Error("'output.filename' is required, either in config file or as --output-filename");
			} else {
				console.error("No configuration file found and no output filename configured via CLI option.");
				console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
				console.error("Use --help to display the CLI options.");
				process.exit(-1); // eslint-disable-line
			}
		}

		// Process remaining positional arguments as entry points
		if(argv._.length > 0) {
			if(Array.isArray(options.entry) || typeof options.entry === "string") {
				options.entry = {
					main: options.entry
				};
			}
			ensureObject(options, "entry");

			const addTo = (name, entry) => {
				if(options.entry[name]) {
					if(!Array.isArray(options.entry[name])) {
						options.entry[name] = [options.entry[name]];
					}
					options.entry[name].push(entry);
				} else {
					options.entry[name] = entry;
				}
			};

			argv._.forEach((content) => {
				const i = content.indexOf("=");
				const j = content.indexOf("?");
				if(i < 0 || (j >= 0 && j < i)) {
					const resolved = path.resolve(content);
					if(fs.existsSync(resolved)) {
						addTo("main", resolved);
					} else {
						addTo("main", content);
					}
				} else {
					addTo(content.substr(0, i), content.substr(i + 1));
				}
			});
		}

		// Validate entry configuration
		if(!options.entry) {
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
	}
};
```