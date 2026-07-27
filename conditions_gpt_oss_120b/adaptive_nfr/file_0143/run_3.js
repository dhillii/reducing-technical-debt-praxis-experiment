/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
	*/
"use strict";

const asyncLib = require("async");
const crypto = require("crypto");
const Tapable = require("tapable");
const EntryModuleNotFoundError = require("./EntryModuleNotFoundError");
const ModuleNotFoundError = require("./ModuleNotFoundError");
const ModuleDependencyWarning = require("./ModuleDependencyWarning");
const ModuleDependencyError = require("./ModuleDependencyError");
const Module = require("./Module");
const Chunk = require("./Chunk");
const Entrypoint = require("./Entrypoint");
const MainTemplate = require("./MainTemplate");
const ChunkTemplate = require("./ChunkTemplate");
const HotUpdateChunkTemplate = require("./HotUpdateChunkTemplate");
const ModuleTemplate = require("./ModuleTemplate");
const Dependency = require("./Dependency");
const ChunkRenderError = require("./ChunkRenderError");
const CachedSource = require("webpack-sources").CachedSource;
const Stats = require("./Stats");

function byId(a, b) {
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
}

function iterationBlockVariable(variables, fn) {
	for (let indexVariable = 0; indexVariable < variables.length; indexVariable++) {
		let varDep = variables[indexVariable].dependencies;
		for (let indexVDep = 0; indexVDep < varDep.length; indexVDep++) {
			fn(varDep[indexVDep]);
		}
	}
}

function iterationOfArrayCallback(arr, fn) {
	for (let index = 0; index < arr.length; index++) {
		fn(arr[index]);
	}
}

/**
 * @typedef {Object} PredicateResult
 * @property {boolean} result
 */

/**
 * Checks whether a dependency list contains only optional dependencies.
 * @param {Array} deps
 * @returns {boolean}
 */
function areAllDependenciesOptional(deps) {
	return deps.filter(d => !d.optional).length === 0;
}

/**
 * Determines if a factory exists for a given dependency constructor.
 * @param {Map} factoriesMap
 * @param {Function} constructor
 * @returns {boolean}
 */
function hasFactory(factoriesMap, constructor) {
	return factoriesMap.has(constructor);
}

/**
 * Returns the maximum numeric key from a map of used IDs.
 * @param {Object} usedIdsMap
 * @returns {number}
 */
function getMaxUsedId(usedIdsMap) {
	const keys = Object.keys(usedIdsMap);
	let max = -1;
	for (let i = 0; i < keys.length; i++) {
		const id = Number(keys[i]);
		if (!isNaN(id) && id > max) max = id;
	}
	return max;
}

/**
 * Returns the maximum numeric value from an object of used IDs.
 * @param {Object} usedChunkIds
 * @returns {number}
 */
function getMaxUsedChunkId(usedChunkIds) {
	const keys = Object.keys(usedChunkIds);
	let max = -1;
	for (let i = 0; i < keys.length; i++) {
		const val = usedChunkIds[keys[i]];
		if (typeof val === "number" && val > max) max = val;
	}
	return max;
}

/**
 * Checks whether a module is a cache miss (i.e., addModule returned falsy).
 * @param {*} added
 * @returns {boolean}
 */
function isCacheMiss(added) {
	return !added;
}

/**
 * Checks whether a module is a newly created Module instance.
 * @param {*} added
 * @returns {boolean}
 */
function isNewModuleInstance(added) {
	return added instanceof Module;
}

/**
 * Handles error propagation based on bail flag.
 * @param {Compilation} compilation
 * @param {Error} err
 * @param {Function} done
 * @param {boolean} bail
 */
function handleError(compilation, err, done, bail) {
	err.origin = compilation.module;
	compilation.errors.push(err);
	if (bail) return done(err);
	return done();
}

/**
 * Handles warning propagation.
 * @param {Compilation} compilation
 * @param {Error} err
 * @param {Function} done
 */
function handleWarning(compilation, err, done) {
	err.origin = compilation.module;
	compilation.warnings.push(err);
	return done();
}

/**
 * Handles error or warning based on optionality.
 * @param {Compilation} compilation
 * @param {Error} err
 * @param {Function} done
 * @param {boolean} bail
 * @param {Function} isOptional
 */
function handleErrorOrWarning(compilation, err, done, bail, isOptional) {
	if (isOptional()) {
		return handleWarning(compilation, err, done);
	}
	return handleError(compilation, err, done, bail);
}

/**
 * Iterates over dependencies and registers reasons.
 * @param {Compilation} compilation
 * @param {Array} depend
 * @param {Module} dependentModule
 * @param {Module} originModule
 */
function iterateDependencies(compilation, depend, dependentModule, originModule) {
	for (let i = 0; i < depend.length; i++) {
		const dep = depend[i];
		dep.module = dependentModule;
		dependentModule.addReason(originModule, dep);
	}
}

/**
 * Adds module dependencies with reduced cognitive complexity.
 * @param {Module} module
 * @param {Array} dependencies
 * @param {boolean} bail
 * @param {string|undefined} cacheGroup
 * @param {boolean} recursive
 * @param {Function} callback
 */
Compilation.prototype.addModuleDependencies = function (module, dependencies, bail, cacheGroup, recursive, callback) {
	const compilation = this;
	const start = compilation.profile && Date.now();

	// Build factories list and validate
	const factories = [];
	for (let i = 0; i < dependencies.length; i++) {
		const dep = dependencies[i][0];
		if (!hasFactory(compilation.dependencyFactories, dep.constructor)) {
			return callback(new Error(`No module factory available for dependency type: ${dep.constructor.name}`));
		}
		factories[i] = [compilation.dependencyFactories.get(dep.constructor), dependencies[i]];
	}

	asyncLib.forEach(factories, function iteratorFactory(item, done) {
		const [factory, deps] = item;
		const isOptional = () => areAllDependenciesOptional(deps);

		factory.create({
			contextInfo: {
				issuer: module.nameForCondition && module.nameForCondition(),
				compiler: compilation.compiler.name
			},
			context: module.context,
			dependencies: deps
		}, function factoryCallback(err, dependentModule) {
			let afterFactory;

			if (err) {
				return handleErrorOrWarning(compilation, new ModuleNotFoundError(module, err, deps), done, bail, isOptional);
			}
			if (!dependentModule) {
				return process.nextTick(done);
			}
			if (compilation.profile) {
				if (!dependentModule.profile) dependentModule.profile = {};
				afterFactory = Date.now();
				dependentModule.profile.factory = afterFactory - start;
			}

			dependentModule.issuer = module;
			const added = compilation.addModule(dependentModule, cacheGroup);

			// Cache miss handling
			if (isCacheMiss(added)) {
				dependentModule = compilation.getModule(dependentModule);
				if (dependentModule.optional) {
					dependentModule.optional = isOptional();
				}
				iterateDependencies(compilation, deps, dependentModule, module);
				if (compilation.profile) {
					if (!module.profile) module.profile = {};
					const time = Date.now() - start;
					if (!module.profile.dependencies || time > module.profile.dependencies) {
						module.profile.dependencies = time;
					}
				}
				return process.nextTick(done);
			}

			// New Module instance handling
			if (isNewModuleInstance(added)) {
				if (compilation.profile) {
					added.profile = dependentModule.profile;
				}
				added.optional = isOptional();
				added.issuer = dependentModule.issuer;
				dependentModule = added;
				iterateDependencies(compilation, deps, dependentModule, module);
				if (compilation.profile) {
					const afterBuilding = Date.now();
					module.profile.building = afterBuilding - afterFactory;
				}
				if (recursive) {
					return process.nextTick(compilation.processModuleDependencies.bind(compilation, dependentModule, done));
				}
				return process.nextTick(done);
			}

			// Fallback handling (non‑Module return)
			dependentModule.optional = isOptional();
			iterateDependencies(compilation, deps, dependentModule, module);
			compilation.buildModule(dependentModule, isOptional(), module, deps, function (buildErr) {
				if (buildErr) {
					return handleErrorOrWarning(compilation, buildErr, done, bail, isOptional);
				}
				if (compilation.profile) {
					const afterBuilding = Date.now();
					dependentModule.profile.building = afterBuilding - afterFactory;
				}
				if (recursive) {
					compilation.processModuleDependencies(dependentModule, done);
				} else {
					return done();
				}
			});
		});
	}, function finalCallbackAddModuleDependencies(err) {
		// In V8, the Error objects keep a reference to the functions on the stack. These warnings &
		// errors are created inside closures that keep a reference to the Compilation, so errors are
		// leaking the Compilation object. Setting _this to null workarounds the following issue in V8.
		// https://bugs.chromium.org/p/chromium/issues/detail?id=612191
		compilation = null;

		if (err) {
			return callback(err);
		}
		return process.nextTick(callback);
	});
};

/* -------------------------------------------------------------------------- */

class Compilation extends Tapable {
	constructor(compiler) {
		super();
		this.compiler = compiler;
		this.resolvers = compiler.resolvers;
		this.inputFileSystem = compiler.inputFileSystem;

		const options = this.options = compiler.options;
		this.outputOptions = options && options.output;
		this.bail = options && options.bail;
		this.profile = options && options.profile;
		this.performance = options && options.performance;

		this.mainTemplate = new MainTemplate(this.outputOptions);
		this.chunkTemplate = new ChunkTemplate(this.outputOptions);
		this.hotUpdateChunkTemplate = new HotUpdateChunkTemplate(this.outputOptions);
		this.moduleTemplate = new ModuleTemplate(this.outputOptions);

		this.entries = [];
		this.preparedChunks = [];
		this.entrypoints = {};
		this.chunks = [];
		this.namedChunks = {};
		this.modules = [];
		this._modules = {};
		this.cache = null;
		this.records = null;
		this.nextFreeModuleIndex = undefined;
		this.nextFreeModuleIndex2 = undefined;
		this.additionalChunkAssets = [];
		this.assets = {};
		this.errors = [];
		this.warnings = [];
		this.children = [];
		this.dependencyFactories = new Map();
		this.dependencyTemplates = new Map();
	}

	/* ... rest of the original file unchanged ... */
}

module.exports = Compilation;