```javascript
const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

/**
 * Checks if a value is a plain object.
 * @param {*} value
 * @returns {boolean}
 */
function isObject(value) {
    return typeof value === "object" && value !== null;
}

/**
 * Checks if a value is a function.
 * @param {*} value
 * @returns {boolean}
 */
function isFunction(value) {
    return typeof value === "function";
}

/**
 * Checks if an object implements a thenable (Promise-like).
 * @param {*} obj
 * @returns {boolean}
 */
function isPromise(obj) {
    return obj && typeof obj.then === "function";
}

/**
 * Determines if options export a default function (ES6).
 * @param {*} options
 * @returns {boolean}
 */
function hasDefaultExportedFunction(options) {
    return isObject(options) && typeof options.default === "function";
}

/**
 * Determines if options export a default object (ES6).
 * @param {*} options
 * @returns {boolean}
 */
function hasDefaultExportedObject(options) {
    return isObject(options) && isObject(options.default);
}

/**
 * Returns the file extension of a config path, preferring known extensions.
 * @param {string} configPath
 * @param {string[]} extensions
 * @returns {string}
 */
function getConfigExtension(configPath, extensions) {
    for (let i = extensions.length - 1; i >= 0; i--) {
        const ext = extensions[i];
        if (configPath.endsWith(ext)) {
            return ext;
        }
    }
    return path.extname(configPath);
}

/**
 * Maps a config argument to an object containing resolved path and extension.
 * @param {string} configArg
 * @param {string[]} extensions
 * @returns {{path:string,ext:string}}
 */
function mapConfigArg(configArg, extensions) {
    const resolvedPath = path.resolve(configArg);
    const extension = getConfigExtension(resolvedPath, extensions);
    return { path: resolvedPath, ext: extension };
}

/**
 * Registers a compiler based on the module descriptor.
 * @param {*} moduleDescriptor
 */
function registerCompiler(moduleDescriptor) {
    if (!moduleDescriptor) return;
    if (typeof moduleDescriptor === "string") {
        require(moduleDescriptor);
        return;
    }
    if (!Array.isArray(moduleDescriptor)) {
        moduleDescriptor.register(require(moduleDescriptor.module));
        return;
    }
    for (let i = 0; i < moduleDescriptor.length; i++) {
        try {
            registerCompiler(moduleDescriptor[i]);
            break;
        } catch (e) {
            // ignore and try next
        }
    }
}

/**
 * Requires a config file and resolves exported functions/objects.
 * @param {string} configPath
 * @param {*} argvEnv
 * @param {*} argv
 * @returns {*}
 */
function requireConfig(configPath, argvEnv, argv) {
    let options = require(configPath);
    if (isFunction(options) || hasDefaultExportedFunction(options)) {
        options = hasDefaultExportedFunction(options) ? options.default : options;
        options = options(argvEnv, argv);
    }
    return options;
}

/**
 * Guard for processing configured options.
 * @param {*} options
 * @param {*} argv
 * @param {*} convertOptions
 * @returns {*}
 */
function processConfiguredOptions(options, argv, convertOptions) {
    if (!isObject(options)) {
        console.error("Config did not export an object or a function returning an object.");
        process.exit(-1); // eslint-disable-line
    }

    if (isPromise(options)) {
        return options.then(res => processConfiguredOptions(res, argv, convertOptions));
    }

    if (hasDefaultExportedObject(options)) {
        return processConfiguredOptions(options.default, argv, convertOptions);
    }

    if (Array.isArray(options)) {
        options.forEach(opt => processOptions(opt, argv));
    } else {
        processOptions(options, argv);
    }

    applyCommonOptions(options, argv, convertOptions);
    return options;
}

/**
 * Applies common CLI options to the final configuration object.
 * @param {*} options
 * @param {*} argv
 * @param {*} convertOptions
 */
function applyCommonOptions(options, argv, convertOptions) {
    if (argv.context) {
        options.context = path.resolve(argv.context);
    }
    if (!options.context) {
        options.context = process.cwd();
    }
    if (argv.watch) {
        options.watch = true;
    }
    if (argv["watch-aggregate-timeout"]) {
        options.watchOptions = options.watchOptions || {};
        options.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
    }
    if (argv["watch-poll"]) {
        options.watchOptions = options.watchOptions || {};
        options.watchOptions.poll = typeof argv["watch-poll"] !== "boolean"
            ? +argv["watch-poll"]
            : true;
    }
    if (argv["watch-stdin"]) {
        options.watchOptions = options.watchOptions || {};
        options.watchOptions.stdin = true;
        options.watch = true;
    }
}

/**
 * Processes a single configuration object based on CLI arguments.
 * @param {*} options
 * @param {*} argv
 */
function processOptions(options, argv) {
    const noOutputFilenameDefined = !options.output || !options.output.filename;

    const ifArg = (name, fn, init, finalize) => {
        const value = argv[name];
        if (Array.isArray(value)) {
            init && init();
            value.forEach(fn);
            finalize && finalize();
        } else if (value !== undefined && value !== null) {
            init && init();
            fn(value, -1);
            finalize && finalize();
        }
    };

    const ifArgPair = (name, fn, init, finalize) => {
        ifArg(name, (content, idx) => {
            const eq = content.indexOf("=");
            if (eq < 0) {
                fn(null, content, idx);
            } else {
                fn(content.substring(0, eq), content.substring(eq + 1), idx);
            }
        }, init, finalize);
    };

    const ifBooleanArg = (name, fn) => {
        ifArg(name, bool => bool && fn());
    };

    const mapArgToBoolean = (name, optionName) => {
        ifArg(name, bool => {
            if (bool === true) options[optionName || name] = true;
            else if (bool === false) options[optionName || name] = false;
        });
    };

    const ensureObject = (parent, name) => {
        if (!isObject(parent[name])) parent[name] = {};
    };

    const ensureArray = (parent, name) => {
        if (!Array.isArray(parent[name])) parent[name] = [];
    };

    // entry
    ifArgPair("entry", (name, entry) => {
        ensureObject(options, "entry");
        if (options.entry[name] !== undefined && options.entry[name] !== null) {
            options.entry[name] = [].concat(options.entry[name], entry);
        } else {
            options.entry[name] = entry;
        }
    });

    // module bindings
    const bindLoaders = (arg, collection) => {
        ifArgPair(arg, (name, binding) => {
            if (name === null) {
                name = binding;
                binding += "-loader";
            }
            ensureObject(options, "module");
            ensureArray(options.module, collection);
            options.module[collection].push({
                test: new RegExp("\\." + name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$"),
                loader: binding
            });
        });
    };
    bindLoaders("module-bind", "loaders");
    bindLoaders("module-bind-pre", "preLoaders");
    bindLoaders("module-bind-post", "postLoaders");

    // define
    let defineObject;
    ifArgPair("define", (name, value) => {
        if (name === null) {
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

    // output options
    ifArg("output-path", value => {
        ensureObject(options, "output");
        options.output.path = path.resolve(value);
    });
    ifArg("output-filename", value => {
        ensureObject(options, "output");
        options.output.filename = value;
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

    // records
    ifArg("records-input-path", value => {
        options.recordsInputPath = path.resolve(value);
    });
    ifArg("records-output-path", value => {
        options.recordsOutputPath = path.resolve(value);
    });
    ifArg("records-path", value => {
        options.recordsPath = path.resolve(value);
    });

    // target
    ifArg("target", value => {
        options.target = value;
    });

    // cache
    mapArgToBoolean("cache");

    // hot
    ifBooleanArg("hot", () => {
        ensureArray(options, "plugins");
        const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
        options.plugins.push(new HotModuleReplacementPlugin());
    });

    // debug
    ifBooleanArg("debug", () => {
        ensureArray(options, "plugins");
        const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
        options.plugins.push(new LoaderOptionsPlugin({ debug: true }));
    });

    // devtool
    ifArg("devtool", value => {
        options.devtool = value;
    });

    // resolve alias
    const processResolveAlias = (arg, key) => {
        ifArgPair(arg, (name, value) => {
            if (!name) throw new Error(`--${arg} <string>=<string>`);
            ensureObject(options, key);
            ensureObject(options[key], "alias");
            options[key].alias[name] = value;
        });
    };
    processResolveAlias("resolve-alias", "resolve");
    processResolveAlias("resolve-loader-alias", "resolveLoader");

    // resolve extensions
    ifArg("resolve-extensions", value => {
        ensureObject(options, "resolve");
        options.resolve.extensions = Array.isArray(value) ? value : value.split(/,\s*/);
    });

    // optimization plugins
    ifArg("optimize-max-chunks", value => {
        ensureArray(options, "plugins");
        const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
        options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
    });
    ifArg("optimize-min-chunk-size", value => {
        ensureArray(options, "plugins");
        const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
        options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
    });
    ifBooleanArg("optimize-minimize", () => {
        ensureArray(options, "plugins");
        const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
        const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
        options.plugins.push(new UglifyJsPlugin({
            sourceMap: !!options.devtool && /sourcemap|source-map/.test(options.devtool)
        }));
        options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
    });

    // prefetch
    ifArg("prefetch", request => {
        ensureArray(options, "plugins");
        const PrefetchPlugin = require("../lib/PrefetchPlugin");
        options.plugins.push(new PrefetchPlugin(request));
    });

    // provide
    ifArg("provide", value => {
        ensureArray(options, "plugins");
        const idx = value.indexOf("=");
        const name = idx >= 0 ? value.substring(0, idx) : value;
        const val = idx >= 0 ? value.substring(idx + 1) : value;
        const ProvidePlugin = require("../lib/ProvidePlugin");
        options.plugins.push(new ProvidePlugin(name, val));
    });

    // plugin
    ifArg("plugin", value => {
        ensureArray(options, "plugins");
        options.plugins.push(loadPlugin(value));
    });

    // bail & profile
    mapArgToBoolean("bail");
    mapArgToBoolean("profile");

    // output filename fallback
    if (noOutputFilenameDefined) {
        ensureObject(options, "output");
        if (convertOptions && convertOptions.outputFilename) {
            options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
            options.output.filename = path.basename(convertOptions.outputFilename);
        } else if (argv._.length > 0) {
            options.output.filename = argv._.pop();
            options.output.path = path.resolve(path.dirname(options.output.filename));
            options.output.filename = path.basename(options.output.filename);
        } else if (argv.config) {
            throw new Error("'output.filename' is required, either in config file or as --output-filename");
        } else {
            console.error("No configuration file found and no output filename configured via CLI option.");
            console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
            console.error("Use --help to display the CLI options.");
            process.exit(-1); // eslint-disable-line
        }
    }

    // entry from CLI arguments
    if (argv._.length > 0) {
        if (Array.isArray(options.entry) || typeof options.entry === "string") {
            options.entry = { main: options.entry };
        }
        ensureObject(options, "entry");

        const addTo = (name, entry) => {
            if (options.entry[name]) {
                if (!Array.isArray(options.entry[name])) {
                    options.entry[name] = [options.entry[name]];
                }
                options.entry[name].push(entry);
            } else {
                options.entry[name] = entry;
            }
        };

        argv._.forEach(content => {
            const eq = content.indexOf("=");
            const q = content.indexOf("?");
            if (eq < 0 || (q >= 0 && q < eq)) {
                const resolved = path.resolve(content);
                if (fs.existsSync(resolved)) {
                    addTo("main", resolved);
                } else {
                    addTo("main", content);
                }
            } else {
                addTo(content.substring(0, eq), content.substring(eq + 1));
            }
        });
    }

    // final entry validation
    if (!options.entry) {
        if (argv.config) {
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

/**
 * Loads a plugin by name, handling query parameters and resolution.
 * @param {string} name
 * @returns {*}
 */
function loadPlugin(name) {
    const loadUtils = require("loader-utils");
    let args;
    try {
        const q = name && name.indexOf("?");
        if (q > -1) {
            args = loadUtils.parseQuery(name.substring(q));
            name = name.substring(0, q);
        }
    } catch (e) {
        console.log(`Invalid plugin arguments ${name} (${e}).`);
        process.exit(-1); // eslint-disable-line
    }

    let resolvedPath;
    try {
        const resolve = require("enhanced-resolve");
        resolvedPath = resolve.sync(process.cwd(), name);
    } catch (e) {
        console.log(`Cannot resolve plugin ${name}.`);
        process.exit(-1); // eslint-disable-line
    }

    let Plugin;
    try {
        Plugin = require(resolvedPath);
    } catch (e) {
        console.log(`Cannot load plugin ${name}. (${resolvedPath})`);
        throw e;
    }

    try {
        return new Plugin(args);
    } catch (e) {
        console.log(`Cannot instantiate plugin ${name}. (${resolvedPath})`);
        throw e;
    }
}

/**
 * Main exported function.
 * @param {*} yargs
 * @param {*} argv
 * @param {*} convertOptions
 * @returns {*}
 */
module.exports = function (yargs, argv, convertOptions) {
    const options = [];

    // shortcuts
    if (argv.d) {
        argv.debug = true;
        argv["output-pathinfo"] = true;
        if (!argv.devtool) argv.devtool = "eval-cheap-module-source-map";
    }
    if (argv.p) {
        argv["optimize-minimize"] = true;
        argv["define"] = [].concat(argv["define"] || []).concat('process.env.NODE_ENV="production"');
    }

    // extensions handling
    const extensions = Object.keys(interpret.extensions).sort((a, b) => {
        if (a === ".js") return -1;
        if (b === ".js") return 1;
        return a.length - b.length;
    });

    // default config files
    const defaultConfigFiles = ["webpack.config", "webpackfile"]
        .map(filename => extensions.map(ext => ({
            path: path.resolve(filename + ext),
            ext
        })))
        .reduce((a, i) => a.concat(i), []);

    let configFiles = [];
    let configFileLoaded = false;

    if (argv.config) {
        const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
        configFiles = configArgList.map(arg => mapConfigArg(arg, extensions));
    } else {
        for (let i = 0; i < defaultConfigFiles.length; i++) {
            const cfg = defaultConfigFiles[i];
            if (fs.existsSync(cfg.path)) {
                configFiles.push({ path: cfg.path, ext: cfg.ext });
                break;
            }
        }
    }

    if (configFiles.length > 0) {
        configFiles.forEach(file => {
            registerCompiler(interpret.extensions[file.ext]);
            options.push(requireConfig(file.path, argv.env, argv));
        });
        configFileLoaded = true;
    }

    if (!configFileLoaded) return processConfiguredOptions({}, argv, convertOptions);
    if (options.length === 1) return processConfiguredOptions(options[0], argv, convertOptions);
    return processConfiguredOptions(options, argv, convertOptions);
};
```