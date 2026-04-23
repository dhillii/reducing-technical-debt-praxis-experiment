const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

module.exports = function(yargs, argv, convertOptions) {
	const options = [];

	applyShortcuts(argv);

	const configFiles = resolveConfigFiles(argv);
	const configFileLoaded = loadConfigFiles(configFiles, options, argv);

	if(!configFileLoaded) {
		return processConfiguredOptions({});
	} else if(options.length === 1) {
		return processConfiguredOptions(options[0]);
	} else {
		return processConfiguredOptions(options);
	}

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
		} else {
			return resolveDefaultConfigFiles();
		}
	}

	function resolveExplicitConfigFiles(configArg) {
		const configArgList = Array.isArray(configArg) ? configArg : [configArg];
		return configArgList.map(mapConfigArg);
	}

	function mapConfigArg(configArg) {
		const resolvedPath = path.resolve(configArg);
		const extension = getConfigExtension(resolvedPath);
		return {
			path: resolvedPath,
			ext: extension
		};
	}

	function getConfigExtension(configPath) {
		const extensions = getExtensionsSorted();
		for(let i = extensions.length - 1; i >= 0; i--) {
			const tmpExt = extensions[i];
			if(configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1) {
				return tmpExt;
			}
		}
		return path.extname(configPath);
	}

	function resolveDefaultConfigFiles() {
		const extensions = getExtensionsSorted();
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

	function getExtensionsSorted() {
		return Object.keys(interpret.extensions).sort((a, b) => {
			return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
		});
	}

	function loadConfigFiles(configFiles, options, argv) {
		if(configFiles.length === 0) {
			return false;
		}

		configFiles.forEach(file => {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path));
		});
		return true;
	}

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
					// do nothing
				}
			}
		}
	}

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

	function processConfiguredOptions(options) {
		if(options === null || typeof options !== "object") {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1); // eslint-disable-line
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
			if(typeof argv["watch-poll"] !== "boolean")
				options.watchOptions.poll = +argv["watch-poll"];
			else
				options.watchOptions.poll = true;
		}

		if(argv["watch-stdin"]) {
			ensureObject(options, "watchOptions");
			options.watchOptions.stdin = true;
			options.watch = true;
		}
	}

	function processOptions(options) {
		let noOutputFilenameDefined = !options.output || !options.output.filename;

		processEntryOptions(options);
		processModuleOptions(options);
		processDefineOptions(options);
		processOutputOptions(options, noOutputFilenameDefined);
		processRecordsOptions(options);
		processTargetOptions(options);
		processCacheOptions(options);
		processPluginOptions(options);
		processResolveOptions(options);
		processOptimizeOptions(options);
		processAdditionalEntries(options);
		validateEntry(options);
	}

	function processEntryOptions(options) {
		ifArgPair("entry", (name, entry) => {
			if(typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
				options.entry[name] = [].concat(options.entry[name]).concat(entry);
			} else {
				options.entry[name] = entry;
			}
		}, () => {
			ensureObject(options, "entry");
		});
	}

	function processModuleOptions(options) {
		bindLoaders("module-bind", "loaders", options);
		bindLoaders("module-bind-pre", "preLoaders", options);
		bindLoaders("module-bind-post", "postLoaders", options);
	}

	function bindLoaders(arg, collection, options) {
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

	function processDefineOptions(options) {
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

	function processOutputOptions(options, noOutputFilenameDefined) {
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

		if(noOutputFilenameDefined) {
			handleMissingOutputFilename(options);
		}
	}

	function handleMissingOutputFilename(options) {
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

	function processRecordsOptions(options) {
		ifArg("records-input-path", value => {
			options.recordsInputPath = path.resolve(value);
		});

		ifArg("records-output-path", value => {
			options.recordsOutputPath = path.resolve(value);
		});

		ifArg("records-path", value => {
			options.recordsPath = path.resolve(value);
		});
	}

	function processTargetOptions(options) {
		ifArg("target", value => {
			options.target = value;
		});
	}

	function processCacheOptions(options) {
		mapArgToBoolean("cache", options);
	}

	function processPluginOptions(options) {
		ifBooleanArg("hot", () => {
			ensureArray(options, "plugins");
			const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
			options.plugins.push(new HotModuleReplacementPlugin());
		});

		ifBooleanArg("debug", () => {
			ensureArray(options, "plugins");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			options.plugins.push(new LoaderOptionsPlugin({
				debug: true
			}));
		});

		ifArg("devtool", value => {
			options.devtool = value;
		});

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

		ifArg("prefetch", request => {
			ensureArray(options, "plugins");
			const PrefetchPlugin = require("../lib/PrefetchPlugin");
			options.plugins.push(new PrefetchPlugin(request));
		});

		ifArg("provide", value => {
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

		ifArg("plugin", value => {
			ensureArray(options, "plugins");
			options.plugins.push(loadPlugin(value));
		});

		mapArgToBoolean("bail", options);
		mapArgToBoolean("profile", options);
	}

	function processResolveOptions(options) {
		processResolveAlias("resolve-alias", "resolve", options);
		processResolveAlias("resolve-loader-alias", "resolveLoader", options);

		ifArg("resolve-extensions", value => {
			ensureObject(options, "resolve");
			if(Array.isArray(value)) {
				options.resolve.extensions = value;
			} else {
				options.resolve.extensions = value.split(/,\s*/);
			}
		});
	}

	function processResolveAlias(arg, key, options) {
		ifArgPair(arg, (name, value) => {
			if(!name) {
				throw new Error("--" + arg + " <string>=<string>");
			}
			ensureObject(options, key);
			ensureObject(options[key], "alias");
			options[key].alias[name] = value;
		});
	}

	function processOptimizeOptions(options) {
		ifArg("optimize-max-chunks", value => {
			ensureArray(options, "plugins");
			const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			options.plugins.push(new LimitChunkCountPlugin({
				maxChunks: parseInt(value, 10)
			}));
		});

		ifArg("optimize-min-chunk-size", value => {
			ensureArray(options, "plugins");
			const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
			options.plugins.push(new MinChunkSizePlugin({
				minChunkSize: parseInt(value, 10)
			}));
		});
	}

	function processAdditionalEntries(options) {
		if(argv._.length > 0) {
			if(Array.isArray(options.entry) || typeof options.entry === "string") {
				options.entry = {
					main: options.entry
				};
			}
			ensureObject(options, "entry");

			argv._.forEach(content => {
				const eqIdx = content.indexOf("=");
				const qIdx = content.indexOf("?");
				if(eqIdx < 0 || (qIdx >= 0 && qIdx < eqIdx)) {
					const resolved = path.resolve(content);
					if(fs.existsSync(resolved)) {
						addEntryPoint("main", resolved, options);
					} else {
						addEntryPoint("main", content, options);
					}
				} else {
					addEntryPoint(content.substr(0, eqIdx), content.substr(eqIdx + 1), options);
				}
			});
		}
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
		ifArg(name, (content, idx) => {
			const eqIdx = content.indexOf("=");
			if(eqIdx < 0) {
				return fn(null, content, idx);
			} else {
				return fn(content.substr(0, eqIdx), content.substr(eqIdx + 1), idx);
			}
		}, init, finalize);
	}

	function ifBooleanArg(name, fn) {
		ifArg(name, bool => {
			if(bool) {
				fn();
			}
		});
	}

	function mapArgToBoolean(name, options) {
		ifArg(name, bool => {
			if(bool === true)
				options[name] = true;
			else if(bool === false)
				options[name] = false;
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
};