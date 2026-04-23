const path = require("path");
const fs = require("fs");
fs.existsSync = fs.existsSync || path.existsSync;
const interpret = require("interpret");

/**
 * Determines if a value is a non-null object.
 * @param {*} value
 * @returns {boolean}
 */
function isObject(value) {
    return typeof value === "object" && value !== null;
}

/**
 * Determines if a value is a function.
 * @param {*} value
 * @returns {boolean}
 */
function isFunction(value) {
    return typeof value === "function";
}

/**
 * Checks whether the given options object has an ES6 default export that is a function.
 * @param {*} options
 * @returns {boolean}
 */
function hasES6DefaultExportedFunction(options) {
    return isObject(options) && typeof options.default === "function";
}

/**
 * Returns true if the given argument represents a boolean true.
 * @param {*} value
 * @returns {boolean}
 */
function isTrue(value) {
    return value === true;
}

/**
 * Returns true if the given argument represents a boolean false.
 * @param {*} value
 * @returns {boolean}
 */
function isFalse(value) {
    return value === false;
}

/**
 * Retrieves the file extension for a config path based on supported extensions.
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
 * Maps a raw config argument to an object containing resolved path and extension.
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
 * Finds the first existing default config file.
 * @param {{path:string,ext:string}[]} defaultConfigFiles
 * @returns {{path:string,ext:string}|null}
 */
function findExistingDefaultConfig(defaultConfigFiles) {
    for (let i = 0; i < defaultConfigFiles.length; i++) {
        const cfg = defaultConfigFiles[i];
        if (fs.existsSync(cfg.path)) {
            return cfg;
        }
    }
    return null;
}

/**
 * Registers a compiler based on the module descriptor.
 * @param {*} moduleDescriptor
 */
function registerCompiler(moduleDescriptor) {
    if (!moduleDescriptor) return;
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
                // ignore and try next
            }
        }
    }
}

/**
 * Requires a config file and resolves it if it exports a function.
 * @param {string} configPath
 * @param {*} argvEnv
 * @param {*} argv
 * @returns {*}
 */
function requireConfig(configPath, argvEnv, argv) {
    let options = require(configPath);
    if (isFunction(options) || hasES6DefaultExportedFunction(options)) {
        options = hasES6DefaultExportedFunction(options) ? options.default : options;
        options = options(argvEnv, argv);
    }
    return options;
}

/**
 * Processes configured options, handling promises, defaults, and CLI overrides.
 * @param {*} rawOptions
 * @param {*} argv
 * @param {*} convertOptions
 * @returns {*}
 */
function processConfiguredOptions(rawOptions, argv, convertOptions) {
    if (rawOptions === null || typeof rawOptions !== "object") {
        console.error("Config did not export an object or a function returning an object.");
        process.exit(-1);
    }

    if (isFunction(rawOptions.then)) {
        return rawOptions.then(resolved => processConfiguredOptions(resolved, argv, convertOptions));
    }

    if (isObject(rawOptions) && isObject(rawOptions.default)) {
        return processConfiguredOptions(rawOptions.default, argv, convertOptions);
    }

    const options = Array.isArray(rawOptions) ? rawOptions.slice() : [rawOptions];
    options.forEach(opt => processOptions(opt, argv, convertOptions));
    return rawOptions;
}

/**
 * Ensures the given property on parent is an object.
 * @param {*} parent
 * @param {string} name
 */
function ensureObject(parent, name) {
    if (typeof parent[name] !== "object" || parent[name] === null) {
        parent[name] = {};
    }
}

/**
 * Ensures the given property on parent is an array.
 * @param {*} parent
 * @param {string} name
 */
function ensureArray(parent, name) {
    if (!Array.isArray(parent[name])) {
        parent[name] = [];
    }
}

/**
 * Executes a callback for each argument value if present.
 * @param {*} argv
 * @param {string} name
 * @param {function} fn
 * @param {function} [init]
 * @param {function} [finalize]
 */
function ifArg(argv, name, fn, init, finalize) {
    const value = argv[name];
    if (Array.isArray(value)) {
        if (init) init();
        value.forEach(v => fn(v, -1));
        if (finalize) finalize();
    } else if (value !== undefined && value !== null) {
        if (init) init();
        fn(value, -1);
        if (finalize) finalize();
    }
}

/**
 * Executes a callback for each argument pair (key=value) if present.
 * @param {*} argv
 * @param {string} name
 * @param {function} fn
 * @param {function} [init]
 * @param {function} [finalize]
 */
function ifArgPair(argv, name, fn, init, finalize) {
    ifArg(argv, name, (content, idx) => {
        const eqIdx = content.indexOf("=");
        if (eqIdx < 0) {
            fn(null, content, idx);
        } else {
            fn(content.substring(0, eqIdx), content.substring(eqIdx + 1), idx);
        }
    }, init, finalize);
}

/**
 * Executes a callback if the argument is truthy.
 * @param {*} argv
 * @param {string} name
 * @param {function} fn
 */
function ifBooleanArg(argv, name, fn) {
    ifArg(argv, name, bool => {
        if (bool) fn();
    });
}

/**
 * Maps a CLI boolean argument to an option property.
 * @param {*} argv
 * @param {string} name
 * @param {*} options
 * @param {string} [optionName]
 */
function mapArgToBoolean(argv, name, options, optionName) {
    ifArg(argv, name, bool => {
        if (isTrue(bool)) {
            options[optionName || name] = true;
        } else if (isFalse(bool)) {
            options[optionName || name] = false;
        }
    });
}

/**
 * Loads a plugin by name, handling query parameters.
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
 * Binds loaders based on CLI arguments.
 * @param {*} argv
 * @param {*} options
 * @param {string} arg
 * @param {string} collection
 */
function bindLoaders(argv, options, arg, collection) {
    ifArgPair(argv, arg, (name, binding) => {
        if (name === null) {
            name = binding;
            binding += "-loader";
        }
        options.module[collection].push({
            test: new RegExp(`\\.${name.replace(/[\\-\\[\\]\\/\\{\\}\\(\\)\\*\\+\\?\\.\\\\\\^\\$\\|]/g, "\\$&")}$`),
            loader: binding
        });
    }, () => {
        ensureObject(options, "module");
        ensureArray(options.module, collection);
    });
}

/**
 * Processes a single configuration object.
 * @param {*} options
 * @param {*} argv
 * @param {*} convertOptions
 */
function processOptions(options, argv, convertOptions) {
    let noOutputFilenameDefined = !options.output || !options.output.filename;

    ifArgPair(argv, "entry", (name, entry) => {
        ensureObject(options, "entry");
        if (options.entry[name] !== undefined && options.entry[name] !== null) {
            options.entry[name] = [].concat(options.entry[name]).concat(entry);
        } else {
            options.entry[name] = entry;
        }
    });

    bindLoaders(argv, options, "module-bind", "loaders");
    bindLoaders(argv, options, "module-bind-pre", "preLoaders");
    bindLoaders(argv, options, "module-bind-post", "postLoaders");

    let defineObject;
    ifArgPair(argv, "define", (name, value) => {
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

    ifArg(argv, "output-path", value => {
        ensureObject(options, "output");
        options.output.path = path.resolve(value);
    });

    ifArg(argv, "output-filename", value => {
        ensureObject(options, "output");
        options.output.filename = value;
        noOutputFilenameDefined = false;
    });

    ifArg(argv, "output-chunk-filename", value => {
        ensureObject(options, "output");
        options.output.chunkFilename = value;
    });

    ifArg(argv, "output-source-map-filename", value => {
        ensureObject(options, "output");
        options.output.sourceMapFilename = value;
    });

    ifArg(argv, "output-public-path", value => {
        ensureObject(options, "output");
        options.output.publicPath = value;
    });

    ifArg(argv, "output-jsonp-function", value => {
        ensureObject(options, "output");
        options.output.jsonpFunction = value;
    });

    ifBooleanArg(argv, "output-pathinfo", () => {
        ensureObject(options, "output");
        options.output.pathinfo = true;
    });

    ifArg(argv, "output-library", value => {
        ensureObject(options, "output");
        options.output.library = value;
    });

    ifArg(argv, "output-library-target", value => {
        ensureObject(options, "output");
        options.output.libraryTarget = value;
    });

    ifArg(argv, "records-input-path", value => {
        options.recordsInputPath = path.resolve(value);
    });

    ifArg(argv, "records-output-path", value => {
        options.recordsOutputPath = path.resolve(value);
    });

    ifArg(argv, "records-path", value => {
        options.recordsPath = path.resolve(value);
    });

    ifArg(argv, "target", value => {
        options.target = value;
    });

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

    ifArg(argv, "devtool", value => {
        options.devtool = value;
    });

    function processResolveAlias(arg, key) {
        ifArgPair(argv, arg, (name, value) => {
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

    ifArg(argv, "resolve-extensions", value => {
        ensureObject(options, "resolve");
        if (Array.isArray(value)) {
            options.resolve.extensions = value;
        } else {
            options.resolve.extensions = value.split(/,\s*/);
        }
    });

    ifArg(argv, "optimize-max-chunks", value => {
        ensureArray(options, "plugins");
        const LimitChunkCountPlugin = require("../lib/optimize/LimitChunkCountPlugin");
        options.plugins.push(new LimitChunkCountPlugin({ maxChunks: parseInt(value, 10) }));
    });

    ifArg(argv, "optimize-min-chunk-size", value => {
        ensureArray(options, "plugins");
        const MinChunkSizePlugin = require("../lib/optimize/MinChunkSizePlugin");
        options.plugins.push(new MinChunkSizePlugin({ minChunkSize: parseInt(value, 10) }));
    });

    ifBooleanArg(argv, "optimize-minimize", () => {
        ensureArray(options, "plugins");
        const UglifyJsPlugin = require("../lib/optimize/UglifyJsPlugin");
        const LoaderOptionsPlugin = require("../lib/LoaderOptionsPlugin");
        const sourceMapNeeded = options.devtool && (options.devtool.includes("sourcemap") || options.devtool.includes("source-map"));
        options.plugins.push(new UglifyJsPlugin({ sourceMap: sourceMapNeeded }));
        options.plugins.push(new LoaderOptionsPlugin({ minimize: true }));
    });

    ifArg(argv, "prefetch", request => {
        ensureArray(options, "plugins");
        const PrefetchPlugin = require("../lib/PrefetchPlugin");
        options.plugins.push(new PrefetchPlugin(request));
    });

    ifArg(argv, "provide", value => {
        ensureArray(options, "plugins");
        const idx = value.indexOf("=");
        let name, modulePath;
        if (idx >= 0) {
            name = value.substr(0, idx);
            modulePath = value.substr(idx + 1);
        } else {
            name = value;
            modulePath = value;
        }
        const ProvidePlugin = require("../lib/ProvidePlugin");
        options.plugins.push(new ProvidePlugin(name, modulePath));
    });

    ifArg(argv, "plugin", value => {
        ensureArray(options, "plugins");
        options.plugins.push(loadPlugin(value));
    });

    mapArgToBoolean(argv, "bail", options);
    mapArgToBoolean(argv, "profile", options);

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
            process.exit(-1);
        }
    }

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

    if (!options.entry) {
        if (argv.config) {
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

/**
 * Main exported function.
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

    const extensions = Object.keys(interpret.extensions).sort((a, b) => {
        if (a === ".js") return -1;
        if (b === ".js") return 1;
        return a.length - b.length;
    });

    const defaultConfigFiles = ["webpack.config", "webpackfile"]
        .map(filename => extensions.map(ext => ({ path: path.resolve(filename + ext), ext })))
        .reduce((a, i) => a.concat(i), []);

    let configFiles = [];
    let configFileLoaded = false;

    if (argv.config) {
        const configArgList = Array.isArray(argv.config) ? argv.config : [argv.config];
        configFiles = configArgList.map(arg => mapConfigArg(arg, extensions));
    } else {
        const existing = findExistingDefaultConfig(defaultConfigFiles);
        if (existing) {
            configFiles.push(existing);
        }
    }

    if (configFiles.length > 0) {
        configFiles.forEach(file => {
            registerCompiler(interpret.extensions[file.ext]);
            options.push(requireConfig(file.path, argv.env, argv));
        });
        configFileLoaded = true;
    }

    if (!configFileLoaded) {
        return processConfiguredOptions({}, argv, convertOptions);
    }
    if (options.length === 1) {
        return processConfiguredOptions(options[0], argv, convertOptions);
    }
    return processConfiguredOptions(options, argv, convertOptions);
};