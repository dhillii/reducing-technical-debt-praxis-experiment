```javascript
var path = require("path");
var fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
var interpret = require("interpret");

module.exports = function(yargs, argv, convertOptions) {
	var options = [];

	// Handle debug shortcut
	if(argv.d) {
		argv.debug = true;
		argv["output-pathinfo"] = true;
		if(!argv.devtool) {
			argv.devtool = "eval-cheap-module-source-map";
		}
	}

	// Handle production shortcut
	if(argv.p) {
		argv["optimize-minimize"] = true;
		argv["define"] = [].concat(argv["define"] || []).concat("process.env.NODE_ENV=\"production\"");
	}

	// Load configuration files
	var configFiles = loadConfigFiles(argv, extensions);

	// Process loaded configurations
	var finalOptions = processConfigFiles(configFiles, argv, convertOptions);

	// Process CLI options
	processOptions(finalOptions, argv, convertOptions);

	return finalOptions;
};

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

function loadConfigFiles(argv) {
	var configFiles = [];

	if(argv.config) {
		configFiles = mapConfigArgs(argv.config);
	} else {
		findDefaultConfigFiles(configFiles);
	}

	return configFiles;
}

function mapConfigArgs(configArgList) {
	var configFiles = [];

	configArgList.forEach(function(configArg) {
		var resolvedPath = path.resolve(configArg);
		var extension = getConfigExtension(resolvedPath);
		configFiles.push({
			path: resolvedPath,
			ext: extension
		});
	});

	return configFiles;
}

function getConfigExtension(configPath) {
	for(var i = extensions.length - 1; i >= 0; i--) {
		var tmpExt = extensions[i];
		if(configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1) {
			return tmpExt;
		}
	}
	return path.extname(configPath);
}

function findDefaultConfigFiles(configFiles) {
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

function processConfigFiles(configFiles, argv, convertOptions) {
	var options = [];
	var configFileLoaded = false;

	if(configFiles.length > 0) {
		registerCompiler(interpret.extensions);
		options = loadAndProcessConfigs(configFiles);
		configFileLoaded = true;
	}

	if(!configFileLoaded) {
		return {};
	} else if(options.length === 1) {
		return options[0];
	} else {
		return options;
	}
}

function registerCompiler(moduleDescriptor) {
	if(moduleDescriptor) {
		if(typeof moduleDescriptor === "string") {
			require(moduleDescriptor);
		} else if(!Array.isArray(moduleDescriptor)) {
			moduleDescriptor.register(require(moduleDescriptor.module));
		} else {
			for(var i = 0; i < moduleDescriptor.length; i++) {
				try {
					registerCompiler(moduleDescriptor[i]);
					break;
				} catch(e) {
					// do nothing
				}
			}
		}
	}
}

function loadAndProcessConfigs(configFiles) {
	var options = [];

	configFiles.forEach(function(file) {
		registerCompiler(interpret.extensions[file.ext]);
		options.push(requireConfig(file.path));
	});

	return options;
}

function requireConfig(configPath) {
	var options = require(configPath);
	var isES6DefaultExportedFunc = (
		typeof options === "object" && options !== null && typeof options.default === "function"
	);
	if(typeof options === "function" || isES6DefaultExportedFunc) {
		options = isES6DefaultExportedFunc ? options.default : options;
		options = options(argv.env, argv);
	}
	return options;
}

function processOptions(options, argv, convertOptions) {
	if(options === null || typeof options !== "object") {
		console.error("Config did not export an object or a function returning an object.");
		process.exit(-1);
	}

	// Process Promise
	if(typeof options.then === "function") {
		return options.then(processOptions);
	}

	// Process ES6 default
	if(typeof options === "object" && typeof options.default === "object") {
		return processOptions(options.default, argv, convertOptions);
	}

	// Process array of options
	if(Array.isArray(options)) {
		options.forEach(processOptions);
	} else {
		processOptions(options, argv, convertOptions);
	}

	// Set context
	if(argv.context) {
		options.context = path.resolve(argv.context);
	}
	if(!options.context) {
		options.context = process.cwd();
	}

	// Set watch mode
	if(argv.watch) {
		options.watch = true;
	}

	// Set watch options
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

	// Process output filename
	var noOutputFilenameDefined = !options.output || !options.output.filename;

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

	// Process entry point
	if(argv._.length > 0) {
		if(Array.isArray(options.entry) || typeof options.entry === "string") {
			options.entry = {
				main: options.entry
			};
		}
		ensureObject(options, "entry");

		argv._.forEach(function(content) {
			var i = content.indexOf("=");
			var j = content.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(content);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", content);
				}
			} else {
				addToEntry(content.substr(0, i), content.substr(i + 1));
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

function addToEntry(name, entry) {
	if(options.entry[name]) {
		if(!Array.isArray(options.entry[name])) {
			options.entry[name] = [options.entry[name]];
		}
		options.entry[name].push(entry);
	} else {
		options.entry[name] = entry;
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
		var i = content.indexOf("=");
		if(i < 0) {
			return fn(null, content, idx);
		} else {
			return fn(content.substr(0, i), content.substr(i + 1), idx);
		}
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
			options[optionName || name] = true;
		else if(bool === false)
			options[optionName || name] = false;
	});
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

	var path;
	try {
		var resolve = require("enhanced-resolve");
		path = resolve.sync(process.cwd(), name);
	} catch(e) {
		console.log("Cannot resolve plugin " + name + ".");
		process.exit(-1);
	}
	var Plugin;
	try {
		Plugin = require(path);
	} catch(e) {
		console.log("Cannot load plugin " + name + ". (" + path + ")");
		throw e;
	}
	try {
		return new Plugin(args);
	} catch(e) {
		console.log("Cannot instantiate plugin " + name + ". (" + path + ")");
		throw e;
	}
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

function processOptions(options) {
	var noOutputFilenameDefined = !options.output || !options.output.filename;

	ifArgPair("entry", function(name, entry) {
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
		ensureArray(options, "plugins");
		var idx = value.indexOf("=");
		var name;
		if(idx >= 0) {
			name = value.substr(0, idx);
			value = value.substr(idx + 1);
		} else {
			name = value;
		}
		var ProvidePlugin = require("../lib/ProvidePlugin");
		options.plugins.push(new ProvidePlugin(name, value));
	});

	ifArg("plugin", function(value) {
		ensureArray(options, "plugins");
		options.plugins.push(loadPlugin(value));
	});

	mapArgToBoolean("bail");

	mapArgToBoolean("profile");
}
```