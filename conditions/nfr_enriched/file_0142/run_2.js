```javascript
const path = require("path");
const fs = require("fs");
const interpret = require("interpret");

fs.existsSync = fs.existsSync || path.existsSync;

module.exports = function(yargs, argv, convertOptions) {
	applyShortcutFlags(argv);
	
	const configFiles = resolveConfigFiles(argv);
	const options = loadConfigFiles(configFiles);
	
	return processConfiguredOptions(options.length === 0 ? {} : options.length === 1 ? options[0] : options);

	// ============ Config Resolution ============

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
			argv.define = [].concat(argv.define || []).concat("process.env.NODE_ENV=\"production\"");
		}
	}

	function getExtensionsSorted() {
		return Object.keys(interpret.extensions).sort((a, b) => 
			a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length
		);
	}

	function buildDefaultConfigFiles(extensions) {
		return ["webpack.config", "webpackfile"]
			.flatMap(filename => extensions.map(ext => ({
				path: path.resolve(filename + ext),
				ext: ext
			})));
	}

	function getConfigExtension(configPath, extensions) {
		for(let i = extensions.length - 1; i >= 0; i--) {
			const ext = extensions[i];
			if(configPath.endsWith(ext)) {
				return ext;
			}
		}
		return path.extname(configPath);
	}

	function resolveConfigFiles(argv) {
		const extensions = getExtensionsSorted();
		
		if(argv.config) {
			const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
			return configArgList.map(configArg => ({
				path: path.resolve(configArg),
				ext: getConfigExtension(path.resolve(configArg), extensions)
			}));
		}

		const defaultConfigFiles = buildDefaultConfigFiles(extensions);
		for(const file of defaultConfigFiles) {
			if(fs.existsSync(file.path)) {
				return [file];
			}
		}
		return [];
	}

	function registerCompiler(moduleDescriptor) {
		if(!moduleDescriptor) return;

		if(typeof moduleDescriptor === "string") {
			require(moduleDescriptor);
		} else if(Array.isArray(moduleDescriptor)) {
			for(const descriptor of moduleDescriptor) {
				try {
					registerCompiler(descriptor);
					break;
				} catch(e) {
					// Continue to next descriptor
				}
			}
		} else if(typeof moduleDescriptor.register === "function") {
			moduleDescriptor.register(require(moduleDescriptor.module));
		}
	}

	function requireConfig(configPath) {
		let options = require(configPath);
		const isES6DefaultExport = typeof options === "object" && options !== null && typeof options.default === "function";
		
		if(typeof options === "function" || isES6DefaultExport) {
			options = isES6DefaultExport ? options.default : options;
			options = options(argv.env, argv);
		}
		return options;
	}

	function loadConfigFiles(configFiles) {
		const options = [];
		
		for(const file of configFiles) {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path));
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
		let noOutputFilenameDefined = !options.output || !options.output.filename;

		const argHandlers = {
			entry: createEntryHandler(),
			"output-path": createOutputHandler("path", v => path.resolve(v)),
			"output-filename": createOutputHandler("filename", v => { noOutputFilenameDefined = false; return v; }),
			"output-chunk-filename": createOutputHandler("chunkFilename"),
			"output-source-map-filename": createOutputHandler("sourceMapFilename"),
			"output-public-path": createOutputHandler("publicPath"),
			"output-jsonp-function": createOutputHandler("jsonpFunction"),
			"output-library": createOutputHandler("library"),
			"output-library-target": createOutputHandler("libraryTarget"),
			"records-input-path": (v) => { options.recordsInputPath = path.resolve(v); },
			"records-output-path": (v) => { options.recordsOutputPath = path.resolve(v); },
			"records-path": (v) => { options.recordsPath = path.resolve(v); },
			target: (v) => { options.target = v; },
			devtool: (v) => { options.devtool = v; }
		};

		// Process argument handlers
		Object.entries(argHandlers).forEach(([key, handler]) => {
			if(key === "entry") {
				handler();
			} else if(typeof handler === "function") {
				ifArg(key, handler);
			}
		});

		// Boolean flags
		ifBooleanArg("output-pathinfo", () => {
			ensureObject(options, "output");
			options.output.pathinfo = true;
		});

		mapArgToBoolean("cache");
		mapArgToBoolean("bail");
		mapArgToBoolean("profile");

		// Plugin-based options
		ifBooleanArg("hot", () => {
			ensureArray(options, "plugins");
			const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
			options.plugins.push(new HotModuleReplacementPlugin());
		});

		ifBooleanArg("debug", () => {
			ensureArray(options, "plugins");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			options.plugins.push(new LoaderOptionsPlugin({ debug: true }));
		});

		// Module loaders
		bindLoaders("module-bind", "loaders");
		bindLoaders("module-bind-pre", "preLoaders");
		bindLoaders("module-bind-post", "postLoaders");

		// Define plugin
		processDefinePlugin();

		// Resolve options
		processResolveAlias("resolve-alias", "resolve");
		processResolveAlias("resolve-loader-alias", "resolveLoader");

		ifArg("resolve-extensions", (value) => {
			ensureObject(options, "resolve");
			options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
		});

		// Optimization plugins
		ifArg("optimize-max-chunks", (value) => {
			ensureArray(options, "plugins");
			const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
		});

		ifArg("optimize-min-chunk-size", (value) => {
			ensureArray(options, "plugins");
			const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
			options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
		});

		ifBooleanArg("optimize-minimize", () => {
			ensureArray(options, "plugins");
			const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			const hasSourceMap = options.devtool && /sourcemap|source-map/.test(options.devtool);
			options.plugins.push(new UglifyJsPlugin({ sourceMap: hasSourceMap }));
			options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
		});

		// Other plugins
		ifArg("prefetch", (request) => {
			ensureArray(options, "plugins");
			const PrefetchPlugin = require("../lib/PrefetchPlugin");
			options.plugins.push(new PrefetchPlugin(request));
		});

		ifArg("provide", (value) => {
			ensureArray(options, "plugins");
			const idx = value.indexOf("=");
			const name = idx >= 0 ? value.substr(0, idx) : value;
			const val = idx >= 0 ? value.substr(idx + 1) : value;
			const ProvidePlugin = require("../lib/ProvidePlugin");
			options.plugins.push(new ProvidePlugin(name, val));
		});

		ifArg("plugin", (value) => {
			ensureArray(options, "plugins");
			options.plugins.push(loadPlugin(value));
		});

		// Handle output filename
		handleOutputFilename(options, noOutputFilenameDefined);

		// Handle entry points from CLI
		handleCLIEntries(options);

		// Validate entry
		validateEntry(options);
	}

	function createOutputHandler(key, transform = v => v) {
		return (value) => {
			ensureObject(options, "output");
			options.output[key] = transform(value);
		};
	}

	function createEntryHandler() {
		return () => {
			ifArgPair("entry", (name, entry) => {
				if(typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
					options.entry[name] = [].concat(options.entry[name]).concat(entry);
				} else {
					options.entry[name] = entry;
				}
			}, () => {
				ensureObject(options, "entry");
			});
		};
	}

	function processDefinePlugin() {
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
	}

	function bindLoaders(arg, collection) {
		ifArgPair(arg, (name, binding) => {
			if(name === null) {
				name = binding;
				binding += "-loader";
			}
			const escapedName = name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
			options.module[collection].push({
				test: new RegExp("\\." + escapedName + "$"),
				loader: binding
			});
		}, () => {
			ensureObject(options, "module");
			ensureArray(options.module, collection);
		});
	}

	function processResolveAlias(arg, key) {
		ifArgPair(arg, (name, value) => {
			if(!name) {
				throw new Error(`--${arg} <string>=<string>`);
			}
			ensureObject(options, key);
			ensureObject(options[key], "alias");
			options[key].alias[name] = value;
		});
	}

	function handleOutputFilename(options, noOutputFilenameDefined) {
		if(!noOutputFilenameDefined) return;

		ensureObject(options, "output");

		if(convertOptions && convertOptions.outputFilename) {
			options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
			options.output.filename = path.basename(convertOptions.outputFilename);
		} else if(argv._.length > 0) {
			const filename = argv._.pop();
			options.output.path = path.resolve(path.dirname(filename));
			options.output.filename = path.basename(filename);
		} else if(configFiles.length > 0) {
			throw new Error("'output.filename' is required, either in config file or as --output-filename");
		} else {
			console.error("No configuration file found and no output filename configured via CLI option.");
			console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
			console.error("Use --help to display the CLI options.");
			process.exit(-1);
		}
	}

	function handleCLIEntries(options) {
		if(argv._.length === 0) return;

		if(Array.isArray(options.entry) || typeof options.entry === "string") {
			options.entry = { main: options.entry };
		}
		ensureObject(options, "entry");

		argv._.forEach((content) => {
			const eqIdx = content.indexOf("=");
			const qIdx = content.indexOf("?");

			if(eqIdx < 0 || (qIdx >= 0 && qIdx < eqIdx)) {
				const resolved = path.resolve(content);
				const entryPath = fs.existsSync(resolved) ? resolved : content;
				addEntryPoint("main", entryPath, options);
			} else {
				addEntryPoint(content.substr(0, eqIdx), content.substr(eqIdx + 1), options);
			}
		});
	}

	function addEntryPoint(name, entry, options) {
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
			if(configFiles.length > 0) {
				console.error("Configuration file found but no entry configured.");
			} else {
				console.error("No configuration file found and no entry configured via CLI option.");
				console.error("When using the CLI you need to provide at least two arguments: entry and output.");
				console.error("A configuration file could be named 'webpack.config.