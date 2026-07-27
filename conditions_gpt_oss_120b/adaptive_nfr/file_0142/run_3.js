const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

/**
 * Main entry point for converting CLI arguments to webpack configuration.
 * @param {Object} yargs
 * @param {Object} argv
 * @param {Object} convertOptions
 * @returns {Object|Array}
 */
module.exports = function (yargs, argv, convertOptions) {
    const options = [];

    applyShortcuts(argv);

    const extensions = getSortedExtensions();
    const defaultConfigFiles = getDefaultConfigFiles(extensions);
    const { configFiles, configFileLoaded } = resolveConfigFiles(argv, extensions, defaultConfigFiles);

    if (configFiles.length > 0) {
        loadConfigFiles(configFiles, options);
    }

    if (!configFileLoaded) {
        return processConfiguredOptions({}, argv, convertOptions);
    }
    if (options.length === 1) {
        return processConfiguredOptions(options[0], argv, convertOptions);
    }
    return processConfiguredOptions(options, argv, convertOptions);
};

/* -------------------------------------------------------------------------- */
/* Helper: shortcuts handling                                                 */
/* -------------------------------------------------------------------------- */

function applyShortcuts(argv) {
    if (argv.d) {
        argv.debug = true;
        argv["output-pathinfo"] = true;
        if (!argv.devtool) {
            argv.devtool = "eval-cheap-module-source-map";
        }
    }
    if (argv.p) {
        argv["optimize-minimize"] = true;
        argv.define = [].concat(argv.define || []).concat('process.env.NODE_ENV="production"');
    }
}

/* -------------------------------------------------------------------------- */
/* Helper: extensions handling                                                */
/* -------------------------------------------------------------------------- */

function getSortedExtensions() {
    return Object.keys(interpret.extensions).sort((a, b) => {
        if (a === ".js") return -1;
        if (b === ".js") return 1;
        return a.length - b.length;
    });
}

function getDefaultConfigFiles(extensions) {
    return ["webpack.config", "webpackfile"]
        .map((filename) => extensions.map((ext) => ({
            path: path.resolve(filename + ext),
            ext
        })))
        .reduce((a, i) => a.concat(i), []);
}

/* -------------------------------------------------------------------------- */
/* Helper: config file resolution                                            */
/* -------------------------------------------------------------------------- */

function resolveConfigFiles(argv, extensions, defaultConfigFiles) {
    if (argv.config) {
        const configFiles = Array.isArray(argv.config) ? argv.config : [argv.config];
        return {
            configFiles: configFiles.map((c) => mapConfigArg(c, extensions)),
            configFileLoaded: true
        };
    }

    for (let i = 0; i < defaultConfigFiles.length; i++) {
        const cfg = defaultConfigFiles[i];
        if (fs.existsSync(cfg.path)) {
            return {
                configFiles: [{ path: cfg.path, ext: cfg.ext }],
                configFileLoaded: true
            };
        }
    }
    return { configFiles: [], configFileLoaded: false };
}

function getConfigExtension(configPath, extensions) {
    for (let i = extensions.length - 1; i >= 0; i--) {
        const ext = extensions[i];
        if (configPath.endsWith(ext)) {
            return ext;
        }
    }
    return path.extname(configPath);
}

function mapConfigArg(configArg, extensions) {
    const resolvedPath = path.resolve(configArg);
    const extension = getConfigExtension(resolvedPath, extensions);
    return { path: resolvedPath, ext: extension };
}

/* -------------------------------------------------------------------------- */
/* Helper: loading config files                                               */
/* -------------------------------------------------------------------------- */

function loadConfigFiles(configFiles, options) {
    configFiles.forEach((file) => {
        registerCompiler(interpret.extensions[file.ext]);
        options.push(requireConfig(file.path));
    });
}

/**
 * Registers a compiler based on the descriptor from interpret.
 * @param {any} moduleDescriptor
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
        } catch (_) {
            // ignore and try next
        }
    }
}

/**
 * Requires a config file and resolves it if it exports a function or ES6 default.
 * @param {string} configPath
 * @returns {Object}
 */
function requireConfig(configPath) {
    let exported = require(configPath);
    const isES6DefaultFunc = typeof exported === "object" && exported !== null && typeof exported.default === "function";

    if (typeof exported === "function" || isES6DefaultFunc) {
        exported = isES6DefaultFunc ? exported.default : exported;
        exported = exported(argv.env, argv);
    }
    return exported;
}

/* -------------------------------------------------------------------------- */
/* Helper: processing configured options                                      */
/* -------------------------------------------------------------------------- */

function processConfiguredOptions(options, argv, convertOptions) {
    if (options === null || typeof options !== "object") {
        console.error("Config did not export an object or a function returning an object.");
        process.exit(-1);
    }

    if (typeof options.then === "function") {
        return options.then((resolved) => processConfiguredOptions(resolved, argv, convertOptions));
    }

    if (typeof options === "object" && typeof options.default === "object") {
        return processConfiguredOptions(options.default, argv, convertOptions);
    }

    if (Array.isArray(options)) {
        options.forEach((opt) => processOptions(opt, argv, convertOptions));
    } else {
        processOptions(options, argv, convertOptions);
    }

    applyContextAndWatch(options, argv);
    return options;
}

/* -------------------------------------------------------------------------- */
/* Helper: apply context and watch flags                                      */
/* -------------------------------------------------------------------------- */

function applyContextAndWatch(options, argv) {
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

/* -------------------------------------------------------------------------- */
/* Helper: processing a single options object                                 */
/* -------------------------------------------------------------------------- */

function processOptions(options, argv, convertOptions) {
    const noOutputFilenameDefined = !options.output || !options.output.filename;

    handleEntryOption(options, argv);
    handleModuleBind(options, argv);
    handleDefineOption(options, argv);
    handleOutputOptions(options, argv);
    handleBooleanFlags(options, argv);
    handleDevtoolOption(options, argv);
    handleResolveAliases(options, argv);
    handleOptimizationOptions(options, argv);
    handlePluginOptions(options, argv);
    ensureOutputFilename(options, argv, convertOptions, noOutputFilenameDefined);
    handlePositionalEntries(options, argv);
    validateEntryPresence(options, argv);
}

/* -------------------------------------------------------------------------- */
/* Sub‑helpers for processOptions                                            */
/* -------------------------------------------------------------------------- */

function handleEntryOption(options, argv) {
    ifArgPair(argv, "entry", (name, entry) => {
        if (options.entry && options.entry[name] != null) {
            options.entry[name] = [].concat(options.entry[name]).concat(entry);
        } else {
            options.entry[name] = entry;
        }
    }, () => ensureObject(options, "entry"));
}

/**
 * Binds loaders based on CLI arguments.
 */
function handleModuleBind(options, argv) {
    bindLoaders(options, argv, "module-bind", "loaders");
    bindLoaders(options, argv, "module-bind-pre", "preLoaders");
    bindLoaders(options, argv, "module-bind-post", "postLoaders");
}

/**
 * Handles the --define flag.
 */
function handleDefineOption(options, argv) {
    let defineObject = {};
    ifArgPair(argv, "define", (name, value) => {
        if (name === null) {
            name = value;
            value = true;
        }
        defineObject[name] = value;
    }, () => { defineObject = {}; }, () => {
        ensureArray(options, "plugins");
        const DefinePlugin = require("../lib/DefinePlugin");
        options.plugins.push(new DefinePlugin(defineObject));
    });
}

/**
 * Handles all output‑related CLI arguments.
 */
function handleOutputOptions(options, argv) {
    ifArg(argv, "output-path", (value) => {
        ensureObject(options, "output");
        options.output.path = path.resolve(value);
    });
    ifArg(argv, "output-filename", (value) => {
        ensureObject(options, "output");
        options.output.filename = value;
    });
    ifArg(argv, "output-chunk-filename", (value) => {
        ensureObject(options, "output");
        options.output.chunkFilename = value;
    });
    ifArg(argv, "output-source-map-filename", (value) => {
        ensureObject(options, "output");
        options.output.sourceMapFilename = value;
    });
    ifArg(argv, "output-public-path", (value) => {
        ensureObject(options, "output");
        options.output.publicPath = value;
    });
    ifArg(argv, "output-jsonp-function", (value) => {
        ensureObject(options, "output");
        options.output.jsonpFunction = value;
    });
    ifBooleanArg(argv, "output-pathinfo", () => {
        ensureObject(options, "output");
        options.output.pathinfo = true;
    });
    ifArg(argv, "output-library", (value) => {
        ensureObject(options, "output");
        options.output.library = value;
    });
    ifArg(argv, "output-library-target", (value) => {
        ensureObject(options, "output");
        options.output.libraryTarget = value;
    });
}

/**
 * Handles boolean flags that map directly to webpack options.
 */
function handleBooleanFlags(options, argv) {
    mapArgToBoolean(argv, "cache", options);
    ifBooleanArg(argv, "hot", () => {
        ensureArray(options, "plugins");
        const HotModuleReplacementPlugin = require("../lib/HotModuleReplacementPlugin");
        options.plugins.push(new HotModuleReplacementPlugin());
    });
    ifBooleanArg(argv, "debug", () => {
        ensureArray(options, "plugins");
        const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
        options.plugins.push(new LoaderOptionsPlugin({ debug: true }));
    });
    ifBooleanArg(argv, "optimize-minimize", () => {
        ensureArray(options, "plugins");
        const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
        const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
        options.plugins.push(new UglifyJsPlugin({
            sourceMap: !!options.devtool && /sourcemap|source-map/.test(options.devtool)
        }));
        options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
    });
}

/**
 * Handles the --devtool flag.
 */
function handleDevtoolOption(options, argv) {
    ifArg(argv, "devtool", (value) => {
        options.devtool = value;
    });
}

/**
 * Handles resolve‑alias and resolve‑loader‑alias flags.
 */
function handleResolveAliases(options, argv) {
    processResolveAlias(argv, "resolve-alias", "resolve");
    processResolveAlias(argv, "resolve-loader-alias", "resolveLoader");
}

/**
 * Handles optimization‑related flags.
 */
function handleOptimizationOptions(options, argv) {
    ifArg(argv, "optimize-max-chunks", (value) => {
        ensureArray(options, "plugins");
        const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
        options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
    });
    ifArg(argv, "optimize-min-chunk-size", (value) => {
        ensureArray(options, "plugins");
        const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
        options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
    });
}

/**
 * Handles generic plugin loading flags.
 */
function handlePluginOptions(options, argv) {
    ifArg(argv, "prefetch", (request) => {
        ensureArray(options, "plugins");
        const PrefetchPlugin = require("../lib/PrefetchPlugin");
        options.plugins.push(new PrefetchPlugin(request));
    });
    ifArg(argv, "provide", (value) => {
        ensureArray(options, "plugins");
        const idx = value.indexOf("=");
        const name = idx >= 0 ? value.substring(0, idx) : value;
        const val = idx >= 0 ? value.substring(idx + 1) : value;
        const ProvidePlugin = require("../lib/ProvidePlugin");
        options.plugins.push(new ProvidePlugin(name, val));
    });
    ifArg(argv, "plugin", (value) => {
        ensureArray(options, "plugins");
        options.plugins.push(loadPlugin(value));
    });
    mapArgToBoolean(argv, "bail", options);
    mapArgToBoolean(argv, "profile", options);
}

/**
 * Ensures an output filename is defined, applying defaults or exiting on error.
 */
function ensureOutputFilename(options, argv, convertOptions, noOutputFilenameDefined) {
    if (!noOutputFilenameDefined) return;

    ensureObject(options, "output");
    if (convertOptions && convertOptions.outputFilename) {
        options.output.path = path.resolve(path.dirname(convertOptions.outputFilename));
        options.output.filename = path.basename(convertOptions.outputFilename);
        return;
    }
    if (argv._.length > 0) {
        options.output.filename = argv._.pop();
        options.output.path = path.resolve(path.dirname(options.output.filename));
        options.output.filename = path.basename(options.output.filename);
        return;
    }
    if (configFileLoaded) {
        throw new Error("'output.filename' is required, either in config file or as --output-filename");
    }
    console.error("No configuration file found and no output filename configured via CLI option.");
    console.error("A configuration file could be named 'webpack.config.js' in the current directory.");
    console.error("Use --help to display the CLI options.");
    process.exit(-1);
}

/**
 * Handles positional entry arguments (argv._).
 */
function handlePositionalEntries(options, argv) {
    if (argv._.length === 0) return;

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

    argv._.forEach((content) => {
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

/**
 * Validates that an entry point exists after processing.
 */
function validateEntryPresence(options, argv) {
    if (options.entry) return;

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

/* -------------------------------------------------------------------------- */
/* Generic argument helpers                                                  */
/* -------------------------------------------------------------------------- */

function ifArg(argv, name, fn) {
    const value = argv[name];
    if (Array.isArray(value)) {
        value.forEach((v) => fn(v));
    } else if (value !== undefined && value !== null) {
        fn(value);
    }
}

function ifArgPair(argv, name, fn, init, finalize) {
    const value = argv[name];
    if (Array.isArray(value)) {
        if (init) init();
        value.forEach((content, idx) => {
            const eqIdx = content.indexOf("=");
            if (eqIdx < 0) {
                fn(null, content, idx);
            } else {
                fn(content.substring(0, eqIdx), content.substring(eqIdx + 1), idx);
            }
        });
        if (finalize) finalize();
    } else if (value !== undefined && value !== null) {
        if (init) init();
        const eqIdx = value.indexOf("=");
        if (eqIdx < 0) {
            fn(null, value, -1);
        } else {
            fn(value.substring(0, eqIdx), value.substring(eqIdx + 1), -1);
        }
        if (finalize) finalize();
    }
}

function ifBooleanArg(argv, name, fn) {
    const value = argv[name];
    if (Array.isArray(value)) {
        value.forEach((v) => v && fn());
    } else if (value) {
        fn();
    }
}

function mapArgToBoolean(argv, name, options) {
    const value = argv[name];
    if (Array.isArray(value)) {
        value.forEach((v) => assignBooleanOption(v, name, options));
    } else if (value !== undefined && value !== null) {
        assignBooleanOption(value, name, options);
    }
}

function assignBooleanOption(bool, name, options) {
    if (bool === true) options[name] = true;
    else if (bool === false) options[name] = false;
}

/* -------------------------------------------------------------------------- */
/* Loader / plugin utilities                                                  */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Object/array helpers                                                      */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Loader binding helper                                                     */
/* -------------------------------------------------------------------------- */

function bindLoaders(options, argv, argName, collection) {
    ifArgPair(argv, argName, (name, binding) => {
        if (name === null) {
            name = binding;
            binding += "-loader";
        }
        ensureObject(options, "module");
        ensureArray(options.module, collection);
        options.module[collection].push({
            test: new RegExp(`\\.${name.replace(/[\\-\\[\\]\\/\\{\\}\\(\\)\\*\\+\\?\\.\\\\\\^\\$\\|]/g, "\\$&")}$`),
            loader: binding
        });
    });
}

/* -------------------------------------------------------------------------- */
/* Resolve alias helper                                                       */
/* -------------------------------------------------------------------------- */

function processResolveAlias(argv, arg, key) {
    ifArgPair(argv, arg, (name, value) => {
        if (!name) {
            throw new Error(`--${arg} <string>=<string>`);
        }
        ensureObject(options, key);
        ensureObject(options[key], "alias");
        options[key].alias[name] = value;
    });
}