var path = require("path");
var fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
var interpret = require("interpret");

function isString(value) {
	return typeof value === "string";
}

function isBoolean(value) {
	return typeof value === "boolean";
}

function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUndefined(value) {
	return typeof value === "undefined";
}

function hasExtension(configPath, ext) {
	var extLength = ext.length;
	var pathEnd = configPath.slice(-extLength);
	return pathEnd === ext;
}

function getExtension(configPath, extensions) {
	for(var i = extensions.length - 1; i >= 0; i--) {
		var ext = extensions[i];
		if(hasExtension(configPath, ext)) {
			return ext;
		}
	}
	return path.extname(configPath);
}

function resolveAndMapConfig(configArg, extensions) {
	var resolvedPath = path.resolve(configArg);
	var extension = getExtension(resolvedPath, extensions);
	return {
		path: resolvedPath,
		ext: extension
	};
}

function registerCompiler(moduleDescriptor) {
	if(!moduleDescriptor) {
		return;
	}
	if(isString(moduleDescriptor)) {
		require(moduleDescriptor);
		return;
	}
	if(Array.isArray(moduleDescriptor)) {
		for(var i = 0; i < moduleDescriptor.length; i++) {
			try {
				registerCompiler(moduleDescriptor[i]);
				break;
			} catch(e) {
			}
		}
		return;
	}
	moduleDescriptor.register(require(moduleDescriptor.module));
}

function loadPlugin(name) {
	var loadUtils = require("loader-utils");
	var args;
	try {
		var p = name && name.indexOf("?");
		if(p > -1) {
			args = loadUtils.parseQuery(name.substring(p));
			name = name.substring(0, p);
		}
	} catch(e) {
		console.log("Invalid plugin arguments " + name + " (" + e + ").");
		process.exit(-1);
	}

	var pluginPath;
	try {
		var resolve = require("enhanced-resolve");
		pluginPath = resolve.sync(process.cwd(), name);
	} catch(e) {
		console.log("Cannot resolve plugin " + name + ".");
		process.exit(-1);
	}

	var Plugin;
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
	if(!isObject(parent[name]) || parent[name] === null) {
		parent[name] = {};
	}
}

function ensureArray(parent, name) {
	if(!Array.isArray(parent[name])) {
		parent[name] = [];
	}
}

function isES6DefaultExportedFunc(options) {
	return isObject(options) &&
			options !== null &&
			typeof options.default === "function";
}

function isObjectOrNull(options) {
	return options !== null && typeof options === "object";
}

function processConfiguredOptions(options, argv, convertOptions) {
	if(!isObjectOrNull(options)) {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1);
	}

	if(typeof options.then === "function") {
		return options.then(processConfiguredOptions.bind(null, argv, convertOptions));
	}

	if(isObject(options) && typeof options.default === "object") {
		return processConfiguredOptions(options.default, argv, convertOptions);
	}

	if(Array.isArray(options)) {
		options.forEach(processOptions.bind(null, options, convertOptions));
	} else {
		processOptions(options, convertOptions);
	}

	if(argv.context) {
		options.context = path.resolve(argv.context);
	}
	if(!options.context) {
		options.context = process.cwd();
	}

	if(argv.watch) {
		options.watch = true;
	}

	if(argv["watch-aggregate-timeout"]) {
		options.watchOptions = options.watchOptions || {};
		options.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
	}

	if(argv["watch-poll"]) {
		options.watchOptions = options.watchOptions || {};
		if(!isBoolean(argv["watch-poll"])) {
			options.watchOptions.poll = +argv["watch-poll"];
		} else {
			options.watchOptions.poll = true;
		}
	}

	if(argv["watch-stdin"]) {
		options.watchOptions = options.watchOptions || {};
		options.watchOptions.stdin = true;
		options.watch = true;
	}

	return options;
}

function processOptions(options, convertOptions, argv) {
	var noOutputFilenameDefined = !options.output || !options.output.filename;

	function ifArg(name, fn, init, finalize) {
		if(Array.isArray(argv[name])) {
			if(init) init();
			argv[name].forEach(fn);
			if(finalize) finalize();
			return;
		}
		if(isUndefined(argv[name]) || argv[name] === null) {
			return;
		}
		if(init) init();
		fn(argv[name], -1);
		if(finalize) finalize();
	}

	function ifArgPair(name, fn, init, finalize) {
		ifArg(name, function(content, idx) {
			var i = content.indexOf("=");
			if(i < 0) {
				fn(null, content, idx);
			} else {
				fn(content.substr(0, i), content.substr(i + 1), idx);
			}
		}, init, finalize);
	}

	function ifBooleanArg(name, fn) {
		ifArg(name, function(bool) {
			if(bool) fn();
		});
	}

	function mapArgToBoolean(name, optionName) {
		ifArg(name, function(bool) {
			options[optionName || name] = bool === true;
		});
	}

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
		ensureArray(options, "plugins");
		var DefinePlugin = require("../lib/DefinePlugin");
		options.plugins.push(new DefinePlugin(defineObject));
	});

	ifArg("entry", function(name, entry) {
		if(typeof options.entry[name] !== "undefined" && options.entry[name] !== null) {
			options.entry[name] = [].concat(options.entry[name]).concat(entry);
		} else {
			options.entry[name] = entry;
		}
	}, function() {
		ensureObject(options, "entry");
	});

	bindLoaders("module-bind", "loaders");
	bindLoaders("module-bind-pre", "preLoaders");
	bindLoaders("module-bind-post", "postLoaders");

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
		var HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
		options.plugins.push(new HotModuleReplacementPlugin());
	});

	ifBooleanArg("debug", function() {
		ensureArray(options, "plugins");
		var LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
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

	ifArg("optimize-max-chunks", function(value) {
		ensureArray(options, "plugins");
		var LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
		options.plugins.push(new LimitChunkCountPlugin({
			maxChunks: parseInt(value, 10)
		}));
	});

	ifArg("optimize-min-chunk-size", function(value) {
		ensureArray(options, "plugins");
		var MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
		options.plugins.push(new MinChunkSizePlugin({
			minChunkSize: parseInt(value, 10)
		}));
	});

	ifBooleanArg("optimize-minimize", function() {
		ensureArray(options, "plugins");
		var UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
		var LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
		options.plugins.push(new UglifyJsPlugin({
			sourceMap: options.devtool && (options.devtool.indexOf("sourcemap") >= 0 || options.devtool.indexOf("source-map") >= 0)
		}));
		options.plugins.push(new LoaderOptionsPlugin({
			minimize: true
		}));
	});

	ifArg("prefetch", function(request) {
		ensureArray(options, "plugins");
		var PrefetchPlugin = require("../lib/PrefetchPlugin");
		options.plugins.push(new PrefetchPlugin(request));
	});

	ifArg("provide", function(value) {
		var idx = value.indexOf("=");
		var name;
		if(idx >= 0) {
			name = value.substr(0, idx);
			value = value.substr(idx + 1);
		} else {
			name = value;
		}
		ensureArray(options, "plugins");
		var ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, value));
	});

	ifArg("plugin", function(value) {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(value));
	});

	mapArgToBoolean("bail");
	mapArgToBoolean("profile");

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
			process.exit(-1);
		}
	}

	if(argv._.length > 0) {
		if(Array.isArray(options.entry) || isString(options.entry)) {
			options.entry = {
				main: options.entry
			};
		}
		ensureObject(options, "entry");

		function addTo(name, entry) {
			if(options.entry[name]) {
				if(!Array.isArray(options.entry[name])) {
					options.entry[name] = [options.entry[name]];
				}
				options.entry[name].push(entry);
			} else {
				options.entry[name] = entry;
			}
		}

		argv._.forEach(function(content) {
			var i = content.indexOf("=");
			var j = content.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(content);
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

	if(!options.entry) {
		if(configFileLoaded) {
			console.error("Configuration file found but no entry configured.");
		} else {
			console.error("No configuration file found and no entry configured via CLI option.");
			console.error("When using the CLI you need to provide at least two arguments: entry and output.");
			console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
		}
		console.error("Use --help to display the CLI options.");
		process.exit(-1);
	}
}

module.exports = function(yargs, argv, convertOptions) {
	var options = [];

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

	var configFileLoaded = false;
	var configFiles = [];
	var extensions = Object.keys(interpret.extensions).sort(function(a, b) {
		return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
	});
	var defaultConfigFiles = ["webpack.config", "webpackfile"].map(function(filename) {
		return extensions.map(function(ext) {
			return {
				path: path.resolve(filename + ext),
				ext: ext
			};
		});
	}).reduce(function(a, i) {
		return a.concat(i);
	}, []);

	if(argv.config) {
		var configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
		configFiles = configArgList.map(function(arg) {
			return resolveAndMapConfig(arg, extensions);
		});
	} else {
		for(var i = 0; i < defaultConfigFiles.length; i++) {
			var webpackConfig = defaultConfigFiles[i].path;
			if(fs.existsSync(webpackConfig)) {
				configFiles.push({
					path: webpackConfig,
					ext: defaultConfigFiles[i].ext
				});
				break;
			}
		}
	}

	if(configFiles.length > 0) {
		configFiles.forEach(function(file) {
			registerCompiler(interpret.extensions[file.ext]);
			options.push(requireConfig(file.path));
		});
		configFileLoaded = true;
	}

	if(!configFileLoaded) {
		return processConfiguredOptions({}, argv, convertOptions);
	}
	if(options.length === 1) {
		return processConfiguredOptions(options[0], argv, convertOptions);
	}
	return processConfiguredOptions(options, argv, convertOptions);

	function requireConfig(configPath) {
		var opts = require(configPath);
		if(isES6DefaultExportedFunc(opts)) {
			opts = opts.default;
		}
		if(typeof opts === "function") {
			opts = opts(argv.env, argv);
		}
		return opts;
	}
};