const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

/**
 * Determines if a given path ends with the specified extension.
 * @param {string} filePath
 * @param {string} ext
 * @returns {boolean}
 */
function hasExtension(filePath, ext) {
    return filePath.indexOf(ext, filePath.length - ext.length) > -1;
}

/**
 * Returns the file extension for a config path, preferring known extensions.
 * @param {string} configPath
 * @param {string[]} extensions
 * @returns {string}
 */
function getConfigExtension(configPath, extensions) {
    for (let i = extensions.length - 1; i >= 0; i--) {
        const ext = extensions[i];
        if (hasExtension(configPath, ext)) {
            return ext;
        }
    }
    return path.extname(configPath);
}

/**
 * Checks whether the provided value is a plain object.
 * @param {*} value
 * @returns {boolean}
 */
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks whether the provided value is a promise-like object.
 * @param {*} value
 * @returns {boolean}
 */
function isPromise(value) {
    return typeof value === "object" && value !== null && typeof value.then === "function";
}

/**
 * Checks whether the provided options object contains an ES6 default export that is an object.
 * @param {*} options
 * @returns {boolean}
 */
function isEs6DefaultExportedObject(options) {
    return isPlainObject(options) && isPlainObject(options.default);
}

/**
 * Checks whether the provided options object contains an ES6 default export that is a function.
 * @param {*} options
 * @returns {boolean}
 */
function isEs6DefaultExportedFunction(options) {
    return typeof options === "object" && options !== null && typeof options.default === "function";
}

/**
 * Ensures that the given parent has an object property with the specified name.
 * @param {Object} parent
 * @param {string} name
 */
function ensureObject(parent, name) {
    if (!isPlainObject(parent[name])) {
        parent[name] = {};
    }
}

/**
 * Ensures that the given parent has an array property with the specified name.
 * @param {Object} parent
 * @param {string} name
 */
function ensureArray(parent, name) {
    if (!Array.isArray(parent[name])) {
        parent[name] = [];
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
        const queryIdx = name && name.indexOf("?");
        if (queryIdx > -1) {
            args = loadUtils.parseQuery(name.substring(queryIdx));
            name = name.substring(0, queryIdx);
        }
    } catch (e) {
        console.log(`Invalid plugin arguments ${name} (${e}).`);
        process.exit(-1);
    }

    let resolvedPath;
    try {
        const resolve = require("enhanced-resolve");
        resolvedPath = resolve.sync(process.cwd(), name);
    } catch (e) {
        console.log(`Cannot resolve plugin ${name}.`);
        process.exit(-1);
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
 * Registers a compiler based on the provided module descriptor.
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
 * Requires a configuration file and resolves exported functions.
 * @param {string} configPath
 * @param {Object} argv
 * @returns {Object}
 */
function requireConfig(configPath, argv) {
    let options = require(configPath);
    const isEs6Func = isEs6DefaultExportedFunction(options);
    if (typeof options === "function" || isEs6Func) {
        options = isEs6Func ? options.default : options;
        options = options(argv.env, argv);
    }
    return options;
}

/**
 * Main export function.
 * @param {*} yargs
 * @param {*} argv
 * @param {*} convertOptions
 * @returns {*}
 */
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
    const extensions = Object.keys(interpret.extensions).sort((a, b) => {
        return a === ".js" ? -1 : b === ".js" ? 1 : a.length - b.length;
    });

    const defaultConfigFiles = ["webpack.config", "webpackfile"]
        .map(filename => extensions.map(ext => ({
            path: path.resolve(filename + ext),
            ext
        })))
        .reduce((a, i) => a.concat(i), []);

    let configFiles = [];

    if (argv.config) {
        const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
        configFiles = configArgList.map(arg => {
            const resolvedPath = path.resolve(arg);
            const extension = getConfigExtension(resolvedPath, extensions);
            return { path: resolvedPath, ext: extension };
        });
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
            options.push(requireConfig(file.path, argv));
        });
        configFileLoaded = true;
    }

    if (!configFileLoaded) {
        return processConfiguredOptions({});
    }
    if (options.length === 1) {
        return processConfiguredOptions(options[0]);
    }
    return processConfiguredOptions(options);
};

/**
 * Processes the configuration options returned from a config file.
 * @param {*} rawOptions
 * @returns {*}
 */
function processConfiguredOptions(rawOptions) {
    if (rawOptions === null || typeof rawOptions !== "object") {
        console.error("Config did not export an object or a function returning an object.");
        process.exit(-1);
    }

    if (isPromise(rawOptions)) {
        return rawOptions.then(processConfiguredOptions);
    }

    if (isEs6DefaultExportedObject(rawOptions)) {
        return processConfiguredOptions(rawOptions.default);
    }

    if (Array.isArray(rawOptions)) {
        rawOptions.forEach(processOptions);
    } else {
        processOptions(rawOptions);
    }

    applyContext(rawOptions);
    applyWatchOptions(rawOptions);
    applyWatchStdin(rawOptions);
    return rawOptions;
}

/**
 * Applies context-related options to the configuration.
 * @param {Object} options
 */
function applyContext(options) {
    if (argv.context) {
        options.context = path.resolve(argv.context);
    }
    if (!options.context) {
        options.context = process.cwd();
    }
}

/**
 * Applies watch-related options to the configuration.
 * @param {Object} options
 */
function applyWatchOptions(options) {
    if (argv.watch) {
        options.watch = true;
    }
    if (argv["watch-aggregate-timeout"]) {
        options.watchOptions = options.watchOptions || {};
        options.watchOptions.aggregateTimeout = +argv["watch-aggregate-timeout"];
    }
    if (argv["watch-poll"]) {
        options.watchOptions = options.watchOptions || {};
        if (typeof argv["watch-poll"] !== "boolean") {
            options.watchOptions.poll = +argv["watch-poll"];
        } else {
            options.watchOptions.poll = true;
        }
    }
}

/**
 * Applies stdin watch option.
 * @param {Object} options
 */
function applyWatchStdin(options) {
    if (argv["watch-stdin"]) {
        options.watchOptions = options.watchOptions || {};
        options.watchOptions.stdin = true;
        options.watch = true;
    }
}

/**
 * Processes a single configuration object.
 * @param {Object} options
 */
function processOptions(options) {
    const noOutputFilenameDefined = !(options.output && options.output.filename);
    const defineObject = {};

    // Helper to process argument lists
    function ifArg(name, fn, init, finalize) {
        const value = argv[name];
        if (Array.isArray(value)) {
            if (init) init();
            value.forEach(fn);
            if (finalize) finalize();
        } else if (value !== undefined && value !== null) {
            if (init) init();
            fn(value, -1);
            if (finalize) finalize();
        }
    }

    function ifArgPair(name, fn, init, finalize) {
        ifArg(name, (content, idx) => {
            const eqIdx = content.indexOf("=");
            if (eqIdx < 0) {
                fn(null, content, idx);
            } else {
                fn(content.substring(0, eqIdx), content.substring(eqIdx + 1), idx);
            }
        }, init, finalize);
    }

    function ifBooleanArg(name, fn) {
        ifArg(name, bool => {
            if (bool) fn();
        });
    }

    function mapArgToBoolean(name, optionName) {
        ifArg(name, bool => {
            if (bool === true) options[optionName || name] = true;
            else if (bool === false) options[optionName || name] = false;
        });
    }

    // Entry handling
    ifArgPair("entry", (name, entry) => {
        ensureObject(options, "entry");
        if (options.entry[name] !== undefined && options.entry[name] !== null) {
            options.entry[name] = [].concat(options.entry[name]).concat(entry);
        } else {
            options.entry[name] = entry;
        }
    });

    // Loader bindings
    function bindLoaders(arg, collection) {
        ifArgPair(arg, (name, binding) => {
            ensureObject(options, "module");
            ensureArray(options.module, collection);
            if (name === null) {
                name = binding;
                binding += "-loader";
            }
            options.module[collection].push({
                test: new RegExp(`\\.${name.replace(/[\\-\\[\\]\\/\\{\\}\\(\\)\\*\\+\\?\\.\\\\\\^\\$\\|]/g, "\\$&")}$`),
                loader: binding
            });
        });
    }
    bindLoaders("module-bind", "loaders");
    bindLoaders("module-bind-pre", "preLoaders");
    bindLoaders("module-bind-post", "postLoaders");

    // Define plugin
    ifArgPair("define", (name, value) => {
        if (name === null) {
            name = value;
            value = true;
        }
        defineObject[name] = value;
    }, () => {
        // init
    }, () => {
        ensureArray(options, "plugins");
        const DefinePlugin = require("../lib/DefinePlugin");
        options.plugins.push(new DefinePlugin(defineObject));
    });

    // Output options
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

    // Records
    ifArg("records-input-path", value => {
        options.recordsInputPath = path.resolve(value);
    });
    ifArg("records-output-path", value => {
        options.recordsOutputPath = path.resolve(value);
    });
    ifArg("records-path", value => {
        options.recordsPath = path.resolve(value);
    });

    // General options
    ifArg("target", value => {
        options.target = value;
    });
    mapArgToBoolean("cache");
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
    ifArg("devtool", value => {
        options.devtool = value;
    });

    // Resolve aliases
    function processResolveAlias(arg, key) {
        ifArgPair(arg, (name, value) => {
            if (!name) {
                throw new Error(`--${arg} <string>=<string>`);
            }
            ensureObject(options, key);
            ensureObject(options[key], "alias");
            options[key].alias[name] = value;
        });
    }
    processResolveAlias("resolve-alias", "resolve");
    processResolveAlias("resolve-loader-alias", "resolveLoader");

    // Resolve extensions
    ifArg("resolve-extensions", value => {
        ensureObject(options, "resolve");
        if (Array.isArray(value)) {
            options.resolve.extensions = value;
        } else {
            options.resolve.extensions = value.split(/,\s*/);
        }
    });

    // Optimization plugins
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
            sourceMap: options.devtool && (options.devtool.includes("sourcemap") || options.devtool.includes("source-map"))
        }));
        options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
    });

    // Prefetch plugin
    ifArg("prefetch", request => {
        ensureArray(options, "plugins");
        const PrefetchPlugin = require("../lib/PrefetchPlugin");
        options.plugins.push(new PrefetchPlugin(request));
    });

    // Provide plugin
    ifArg("provide", value => {
        ensureArray(options, "plugins");
        const idx = value.indexOf("=");
        let name, modulePath;
        if (idx >= 0) {
            name = value.substring(0, idx);
            modulePath = value.substring(idx + 1);
        } else {
            name = value;
            modulePath = value;
        }
        const ProvidePlugin = require("../lib/ProvidePlugin");
        options.plugins.push(new ProvidePlugin(name, modulePath));
    });

    // Generic plugin loader
    ifArg("plugin", value => {
        ensureArray(options, "plugins");
        options.plugins.push(loadPlugin(value));
    });

    mapArgToBoolean("bail");
    mapArgToBoolean("profile");

    // Ensure output filename
    if (noOutputFilenameDefined) {
        ensureObject(options, "output");
        if (convertOptions && convertOptions.outputFilename) {
            options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
            options.output.filename = path.basename(convertOptions.outputFilename);
        } else if (argv._.length > 0) {
            options.output.filename = argv._.pop();
            options.output.path = path.resolve(path.dirname(options.output.filename));
            options.output.filename = path.basename(options.output.filename);
        } else if (configFileLoaded) {
            throw new Error("'output.filename' is required, either in config file or as --output-filename");
        } else {
            console.error("No configuration file found and no output filename configured via CLI option.");
            console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
            console.error("Use --help to display the CLI options.");
            process.exit(-1);
        }
    }

    // Process remaining CLI entries
    if (argv._.length > 0) {
        if (Array.isArray(options.entry) || typeof options.entry === "string") {
            options.entry = { main: options.entry };
        }
        ensureObject(options, "entry");

        function addTo(name, entry) {
            if (options.entry[name]) {
                if (!Array.isArray(options.entry[name])) {
                    options.entry[name] = [options.entry[name]];
                }
                options.entry[name].push(entry);
            } else {
                options.entry[name] = entry;
            }
        }

        argv._.forEach(content => {
            const eqIdx = content.indexOf("=");
            const qIdx = content.indexOf("?");
            if (eqIdx < 0 || (qIdx >= 0 && qIdx < eqIdx)) {
                const resolved = path.resolve(content);
                if (fs.existsSync(resolved)) {
                    addTo("main", resolved);
                } else {
                    addTo("main", content);
                }
            } else {
                addTo(content.substring(0, eqIdx), content.substring(eqIdx + 1));
            }
        });
    }

    // Validate entry presence
    if (!options.entry) {
        if (configFileLoaded) {
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