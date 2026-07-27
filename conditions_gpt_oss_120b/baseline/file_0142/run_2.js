const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

module.exports = function (yargs, argv, convertOptions) {
	const options = [];

	// Shortcuts
	if (argv.d) {
		argv.debug = true;
		argv["output-pathinfo"] = true;
		if (!argv.devtool) {
			argv.devtool = "eval-cheap-module-source-map";
		}
	}
	if (argv.p) {
		argv["optimize-minimize"] = true;
		argv["define"] = [].concat(argv["define"] || []).concat('process.env.NODE_ENV="production"');
	}

	let configFileLoaded = false;
	let configFiles = [];
	const extensions = Object.keys(interpret.extensions).sort((a, b) => {
		return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
	});
	const defaultConfigFiles = ["webpack.config", "webpackfile"]
		.map((filename) => {
			return extensions.map((ext) => ({
				path: path.resolve(filename + ext),
				ext: ext,
			}));
		})
		.reduce((a, i) => a.concat(i), []);

	if (argv.config) {
		const getConfigExtension = (configPath) => {
			for (let i = extensions.length - 1; i >= 0; i--) {
				const tmpExt = extensions[i];
				if (configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1) {
					return tmpExt;
				}
			}
			return path.extname(configPath);
		};

		const mapConfigArg = (configArg) => {
			const resolvedPath = path.resolve(configArg);
			const extension = getConfigExtension(resolvedPath);
			return {
				path: resolvedPath,
				ext: extension,
			};
		};

		const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
		configFiles = configArgList.map(mapConfigArg);
	} else {
		for (let i = 0; i < defaultConfigFiles.length; i++) {
			const webpackConfig = defaultConfigFiles[i].path;
			if (fs.existsSync(webpackConfig)) {
				configFiles.push({
					path: webpackConfig,
					ext: defaultConfigFiles[i].ext,
				});
				break;
			}
		}
	}

	if (configFiles.length > 0) {
		const registerCompiler = (moduleDescriptor) => {
			if (moduleDescriptor) {
				if (typeof moduleDescriptor === "string") {
					require(moduleDescriptor);
				} else if (!Array.isArray(moduleDescriptor)) {
					moduleDescriptor.register(require(moduleDescriptor.module));
				} else {
					for (let i = 0; i < moduleDescriptor.length; i++) {
						try {
							registerCompiler(moduleDescriptor[i]);
							break;
						} catch (e) {
							// do nothing
						}
					}
				}
			}
		};

		const requireConfig = (configPath) => {
			let opts = require(configPath);
			const isES6DefaultExportedFunc =
				typeof opts === "object" && opts !== null && typeof opts.default === "function";
			if (typeof opts === "function" || isES6DefaultExportedFunc) {
				opts = isES6DefaultExportedFunc ? opts.default : opts;
				opts = opts(argv.env, argv);
			}
			return opts;
		};

		configFiles.forEach((file) => {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path));
		});
		configFileLoaded = true;
	}

	if (!configFileLoaded) {
		return processConfiguredOptions({});
	} else if (options.length === 1) {
		return processConfiguredOptions(options[0]);
	} else {
		return processConfiguredOptions(options);
	}

	function processConfiguredOptions(opts) {
		if (opts === null || typeof opts !== "object") {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1); // eslint-disable-line
		}

		// process Promise
		if (typeof opts.then === "function") {
			return opts.then(processConfiguredOptions);
		}

		// process ES6 default
		if (typeof opts === "object" && typeof opts.default === "object") {
			return processConfiguredOptions(opts.default);
		}

		if (Array.isArray(opts)) {
			opts.forEach(processOptions);
		} else {
			processOptions(opts);
		}

		if (argv.context) {
			opts.context = path.resolve(argv.context);
		}
		if (!opts.context) {
			opts.context = process.cwd();
		}

		if (argv.watch) {
			opts.watch = true;
		}

		if (argv["watch-aggregate-timeout"]) {
			opts.watchOptions = opts.watchOptions || {};
			opts.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
		}

		if (argv["watch-poll"]) {
			opts.watchOptions = opts.watchOptions || {};
			if (typeof argv["watch-poll"] !== "boolean") opts.watchOptions.poll = +argv["watch-poll"];
			else opts.watchOptions.poll = true;
		}

		if (argv["watch-stdin"]) {
			opts.watchOptions = opts.watchOptions || {};
			opts.watchOptions.stdin = true;
			opts.watch = true;
		}

		return opts;
	}

	function processOptions(opts) {
		let noOutputFilenameDefined = !opts.output || !opts.output.filename;

		function ifArg(name, fn, init, finalize) {
			if (Array.isArray(argv[name])) {
				if (init) init();
				argv[name].forEach(fn);
				if (finalize) finalize();
			} else if (typeof argv[name] !== "undefined" && argv[name] !== null) {
				if (init) init();
				fn(argv[name], -1);
				if (finalize) finalize();
			}
		}

		function ifArgPair(name, fn, init, finalize) {
			ifArg(name, (content, idx) => {
				const i = content.indexOf("=");
				if (i < 0) {
					return fn(null, content, idx);
				} else {
					return fn(content.substr(0, i), content.substr(i + 1), idx);
				}
			}, init, finalize);
		}

		function ifBooleanArg(name, fn) {
			ifArg(name, (bool) => {
				if (bool) fn();
			});
		}

		function mapArgToBoolean(name, optionName) {
			ifArg(name, (bool) => {
				if (bool === true) opts[optionName || name] = true;
				else if (bool === false) opts[optionName || name] = false;
			});
		}

		function loadPlugin(name) {
			const loadUtils = require("loader-utils");
			let args;
			try {
				const p = name && name.indexOf("?");
				if (p > -1) {
					args = loadUtils.parseQuery(name.substring(p));
					name = name.substring(0, p);
				}
			} catch (e) {
				console.log("Invalid plugin arguments " + name + " (" + e + ").");
				process.exit(-1); // eslint-disable-line
			}

			let pluginPath;
			try {
				const resolve = require("enhanced-resolve");
				pluginPath = resolve.sync(process.cwd(), name);
			} catch (e) {
				console.log("Cannot resolve plugin " + name + ".");
				process.exit(-1); // eslint-disable-line
			}
			let Plugin;
			try {
				Plugin = require(pluginPath);
			} catch (e) {
				console.log("Cannot load plugin " + name + ". (" + pluginPath + ")");
				throw e;
			}
			try {
				return new Plugin(args);
			} catch (e) {
				console.log("Cannot instantiate plugin " + name + ". (" + pluginPath + ")");
				throw e;
			}
		}

		function ensureObject(parent, name) {
			if (typeof parent[name] !== "object" || parent[name] === null) {
				parent[name] = {};
			}
		}

		function ensureArray(parent, name) {
			if (!Array.isArray(parent[name])) {
				parent[name] = [];
			}
		}

		ifArgPair(
			"entry",
			(name, entry) => {
				if (typeof opts.entry[name] !== "undefined" && opts.entry[name] !== null) {
					opts.entry[name] = [].concat(opts.entry[name]).concat(entry);
				} else {
					opts.entry[name] = entry;
				}
			},
			() => {
				ensureObject(opts, "entry");
			}
		);

		function bindLoaders(arg, collection) {
			ifArgPair(
				arg,
				(name, binding) => {
					if (name === null) {
						name = binding;
						binding += "-loader";
					}
					opts.module[collection].push({
						test: new RegExp(
							"\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"
						),
						loader: binding,
					});
				},
				() => {
					ensureObject(opts, "module");
					ensureArray(opts.module, collection);
				}
			);
		}
		bindLoaders("module-bind", "loaders");
		bindLoaders("module-bind-pre", "preLoaders");
		bindLoaders("module-bind-post", "postLoaders");

		let defineObject;
		ifArgPair(
			"define",
			(name, value) => {
				if (name === null) {
					name = value;
					value = true;
				}
				defineObject[name] = value;
			},
			() => {
				defineObject = {};
			},
			() => {
				ensureArray(opts, "plugins");
				const DefinePlugin = require("../lib/DefinePlugin");
				opts.plugins.push(new DefinePlugin(defineObject));
			}
		);

		ifArg("output-path", (value) => {
			ensureObject(opts, "output");
			opts.output.path = path.resolve(value);
		});

		ifArg("output-filename", (value) => {
			ensureObject(opts, "output");
			opts.output.filename = value;
			noOutputFilenameDefined = false;
		});

		ifArg("output-chunk-filename", (value) => {
			ensureObject(opts, "output");
			opts.output.chunkFilename = value;
		});

		ifArg("output-source-map-filename", (value) => {
			ensureObject(opts, "output");
			opts.output.sourceMapFilename = value;
		});

		ifArg("output-public-path", (value) => {
			ensureObject(opts, "output");
			opts.output.publicPath = value;
		});

		ifArg("output-jsonp-function", (value) => {
			ensureObject(opts, "output");
			opts.output.jsonpFunction = value;
		});

		ifBooleanArg("output-pathinfo", () => {
			ensureObject(opts, "output");
			opts.output.pathinfo = true;
		});

		ifArg("output-library", (value) => {
			ensureObject(opts, "output");
			opts.output.library = value;
		});

		ifArg("output-library-target", (value) => {
			ensureObject(opts, "output");
			opts.output.libraryTarget = value;
		});

		ifArg("records-input-path", (value) => {
			opts.recordsInputPath = path.resolve(value);
		});

		ifArg("records-output-path", (value) => {
			opts.recordsOutputPath = path.resolve(value);
		});

		ifArg("records-path", (value) => {
			opts.recordsPath = path.resolve(value);
		});

		ifArg("target", (value) => {
			opts.target = value;
		});

		mapArgToBoolean("cache");

		ifBooleanArg("hot", () => {
			ensureArray(opts, "plugins");
			const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
			opts.plugins.push(new HotModuleReplacementPlugin());
		});

		ifBooleanArg("debug", () => {
			ensureArray(opts, "plugins");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			opts.plugins.push(
				new LoaderOptionsPlugin({
					debug: true,
				})
			);
		});

		ifArg("devtool", (value) => {
			opts.devtool = value;
		});

		function processResolveAlias(arg, key) {
			ifArgPair(arg, (name, value) => {
				if (!name) {
					throw new Error("--" + arg + " <string>=<string>");
				}
				ensureObject(opts, key);
				ensureObject(opts[key], "alias");
				opts[key].alias[name] = value;
			});
		}
		processResolveAlias("resolve-alias", "resolve");
		processResolveAlias("resolve-loader-alias", "resolveLoader");

		ifArg("resolve-extensions", (value) => {
			ensureObject(opts, "resolve");
			if (Array.isArray(value)) {
				opts.resolve.extensions = value;
			} else {
				opts.resolve.extensions = value.split(/,\s*/);
			}
		});

		ifArg("optimize-max-chunks", (value) => {
			ensureArray(opts, "plugins");
			const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
			opts.plugins.push(
				new LimitChunkCountPlugin({
					maxChunks: parseInt(value, 10),
				})
			);
		});

		ifArg("optimize-min-chunk-size", (value) => {
			ensureArray(opts, "plugins");
			const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
			opts.plugins.push(
				new MinChunkSizePlugin({
					minChunkSize: parseInt(value, 10),
				})
			);
		});

		ifBooleanArg("optimize-minimize", () => {
			ensureArray(opts, "plugins");
			const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
			const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
			opts.plugins.push(
				new UglifyJsPlugin({
					sourceMap:
						opts.devtool &&
						(opts.devtool.indexOf("sourcemap") >= 0 ||
							opts.devtool.indexOf("source-map") >= 0),
				})
			);
			opts.plugins.push(
				new LoaderOptionsPlugin({
					minimize: true,
				})
			);
		});

		ifArg("prefetch", (request) => {
			ensureArray(opts, "plugins");
			const PrefetchPlugin = require("../lib/PrefetchPlugin");
			opts.plugins.push(new PrefetchPlugin(request));
		});

		ifArg("provide", (value) => {
			ensureArray(opts, "plugins");
			const idx = value.indexOf("=");
			let name;
			if (idx >= 0) {
				name = value.substr(0, idx);
				value = value.substr(idx + 1);
			} else {
				name = value;
			}
			const ProvidePlugin = require("../lib/ProvidePlugin");
			opts.plugins.push(new ProvidePlugin(name, value));
		});

		ifArg("plugin", (value) => {
			ensureArray(opts, "plugins");
			opts.plugins.push(loadPlugin(value));
		});

		mapArgToBoolean("bail");

		mapArgToBoolean("profile");

		if (noOutputFilenameDefined) {
			ensureObject(opts, "output");
			if (convertOptions && convertOptions.outputFilename) {
				opts.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
				opts.output.filename = path.basename(convertOptions.outputFilename);
			} else if (argv._.length > 0) {
				opts.output.filename = argv._.pop();
				opts.output.path = path.resolve(path.dirname(opts.output.filename));
				opts.output.filename = path.basename(opts.output.filename);
			} else if (configFileLoaded) {
				throw new Error("'output.filename' is required, either in config file or as --output-filename");
			} else {
				console.error("No configuration file found and no output filename configured via CLI option.");
				console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
				console.error("Use --help to display the CLI options.");
				process.exit(-1); // eslint-disable-line
			}
		}

		if (argv._.length > 0) {
			if (Array.isArray(opts.entry) || typeof opts.entry === "string") {
				opts.entry = {
					main: opts.entry,
				};
			}
			ensureObject(opts, "entry");

			const addTo = (name, entry) => {
				if (opts.entry[name]) {
					if (!Array.isArray(opts.entry[name])) {
						opts.entry[name] = [opts.entry[name]];
					}
					opts.entry[name].push(entry);
				} else {
					opts.entry[name] = entry;
				}
			};
			argv._.forEach((content) => {
				const i = content.indexOf("=");
				const j = content.indexOf("?");
				if (i < 0 || (j >= 0 && j < i)) {
					const resolved = path.resolve(content);
					if (fs.existsSync(resolved)) {
						addTo("main", resolved);
					} else {
						addTo("main", content);
					}
				} else {
					addTo(content.substr(0, i), content.substr(i + 1));
				}
			});
		}

		if (!opts.entry) {
			if (configFileLoaded) {
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