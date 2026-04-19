```javascript
var path = require("path");
var fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
var interpret = require("interpret");

/**
 * @typedef {Object} ConfigFile
 * @property {string} path
 * @property {string} ext
 */

/**
 * @typedef {Object} WebpackOptions
 * @property {string} [context]
 * @property {boolean} [watch]
 * @property {Object} [watchOptions]
 * @property {string} [devtool]
 * @property {Object} [output]
 * @property {string} [output.path]
 * @property {string} [output.filename]
 * @property {string} [output.chunkFilename]
 * @property {string} [output.sourceMapFilename]
 * @property {string} [output.publicPath]
 * @property {string} [output.jsonpFunction]
 * @property {boolean} [output.pathinfo]
 * @property {string} [output.library]
 * @property {string} [output.libraryTarget]
 * @property {string} [target]
 * @property {boolean} [cache]
 * @property {boolean} [hot]
 * @property {boolean} [debug]
 * @property {string} [recordsInputPath]
 * @property {string} [recordsOutputPath]
 * @property {string} [recordsPath]
 * @property {Object} [resolve]
 * @property {string[]} [resolve.extensions]
 * @property {Object} [resolve.alias]
 * @property {Object} [resolveLoader]
 * @property {Object} [module]
 * @property {Object[]} [module.loaders]
 * @property {Object[]} [module.preLoaders]
 * @property {Object[]} [module.postLoaders]
 * @property {Object[]} [plugins]
 * @property {boolean} [bail]
 * @property {boolean} [profile]
 * @property {Object} [entry]
 */

module.exports = function(yargs, argv, convertOptions) {
	var options = {};
	var configFiles = [];
	var configFileLoaded = false;
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

	/**
	 * @param {string} configPath
	 * @returns {string}
	 */
	function getConfigExtension(configPath) {
		for(var i = extensions.length - 1; i >= 0; i--) {
			var tmpExt = extensions[i];
			if(configPath.indexOf(tmpExt, configPath.length - tmpExt.length) > -1) {
				return tmpExt;
			}
		}
		return path.extname(configPath);
	}

	/**
	 * @param {string} configArg
	 * @returns {ConfigFile}
	 */
	function mapConfigArg(configArg) {
		var resolvedPath = path.resolve(configArg);
		var extension = getConfigExtension(resolvedPath);
		return {
			path: resolvedPath,
			ext: extension
		};
	}

	/**
	 * @param {string|ConfigFile[]} configArgList
	 * @returns {ConfigFile[]}
	 */
	function resolveConfigFiles(configArgList) {
		return Array.isArray(configArgList) ? configArgList : [configArgList].map(mapConfigArg);
	}

	/**
	 * @param {string} configPath
	 * @returns {WebpackOptions}
	 */
	function requireConfig(configPath) {
		var options = require(configPath);
		var isES6DefaultExportedFunc = (
			typeof options === "object" &&
			options !== null &&
			typeof options.default === "function"
		);
		if(typeof options === "function" || isES6DefaultExportedFunc) {
			options = isES6DefaultExportedFunc ? options.default : options;
			options = options(argv.env, argv);
		}
		return options;
	}

	/**
	 * @param {string} moduleDescriptor
	 */
	function registerCompiler(moduleDescriptor) {
		if(!moduleDescriptor) {
			return;
		}
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

	/**
	 * @param {ConfigFile[]} configFiles
	 */
	function loadConfigFiles(configFiles) {
		configFiles.forEach(function(file) {
			registerCompiler(interpret.extensions[file.ext]);
			options = Object.assign({}, options, requireConfig(file.path));
		});
		configFileLoaded = true;
	}

	/**
	 * @param {WebpackOptions} options
	 * @returns {WebpackOptions}
	 */
	function processConfiguredOptions(options) {
		if(options === null || typeof options !== "object") {
			console.error("Config did not export an object or a function returning an object.");
			process.exit(-1); // eslint-disable-line
		}

		/**
		 * @param {WebpackOptions} options
		 */
		function processPromise(options) {
			if(typeof options.then === "function") {
				return options.then(processConfiguredOptions);
			}
			return options;
		}

		/**
		 * @param {WebpackOptions} options
		 */
		function processES6Default(options) {
			if(typeof options === "object" && typeof options.default === "object") {
				return processConfiguredOptions(options.default);
			}
			return options;
		}

		options = processPromise(options);
		options = processES6Default(options);

		if(Array.isArray(options)) {
			options.forEach(processOptions);
		} else {
			processOptions(options);
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
			if(typeof argv["watch-poll"] !== "boolean") {
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

	/**
	 * @param {WebpackOptions} options
	 */
	function processOptions(options) {
		var noOutputFilenameDefined = !options.output || !options.output.filename;

		/**
		 * @param {string} name
		 * @param {Function} fn
		 * @param {Function} [init]
		 * @param {Function} [finalize]
		 */
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

		/**
		 * @param {string} name
		 * @param {Function} fn
		 * @param {Function} [init]
		 * @param {Function} [finalize]
		 */
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

		/**
		 * @param {string} name
		 * @param {Function} fn
		 */
		function ifBooleanArg(name, fn) {
			ifArg(name, function(bool) {
				if(bool) {
					fn();
				}
			});
		}

		/**
		 * @param {string} name
		 * @param {string} optionName
		 */
		function mapArgToBoolean(name, optionName) {
			ifArg(name, function(bool) {
				if(bool === true) {
					options[optionName || name] = true;
				} else if(bool === false) {
					options[optionName || name] = false;
				}
			});
		}

		/**
		 * @param {string} name
		 * @param {string} collection
		 */
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

		/**
		 * @param {string} parent
		 * @param {string} name
		 */
		function ensureObject(parent, name) {
			if(typeof parent[name] !== "object" || parent[name] === null) {
				parent[name] = {};
			}
		}

		/**
		 * @param {WebpackOptions} parent
		 * @param {string} name
		 */
		function ensureArray(parent, name) {
			if(!Array.isArray(parent[name])) {
				parent[name] = [];
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
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

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryPair(name, value) {
			var i = name.indexOf("=");
			if(i < 0) {
				addToEntry("main", value);
			} else {
				addToEntry(name.substr(0, i), name.substr(i + 1));
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFilePair(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else {
					addToEntry("main", name);
				}
			} else {
				addToEntryPair(name, value);
			}
		}

		/**
		 * @param {string} name
		 * @param {string} value
		 */
		function addToEntryFile(name, value) {
			var i = name.indexOf("=");
			var j = name.indexOf("?");
			if(i < 0 || (j >= 0 && j < i)) {
				var resolved = path.resolve(name);
				if(fs.existsSync(resolved)) {
					addToEntry("main", resolved);
				} else