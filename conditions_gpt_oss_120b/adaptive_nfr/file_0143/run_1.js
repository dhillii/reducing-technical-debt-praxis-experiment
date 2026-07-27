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
		const varDep = variables[indexVariable].dependencies;
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
 * Returns true when all dependencies are optional.
 * @param {Array} dependencies
 * @returns {boolean}
 */
function areAllDependenciesOptional(dependencies) {
	return dependencies.filter(d => !d.optional).length === 0;
}

/**
 * Handles error or warning based on optional flag.
 * @param {Error} err
 * @param {boolean} isOptional
 * @param {Function} warningCallback
 * @param {Function} errorCallback
 */
function handleErrorOrWarning(err, isOptional, warningCallback, errorCallback) {
	if (isOptional) {
		return warningCallback(err);
	}
	return errorCallback(err);
}

/**
 * Executes iteration over dependencies to set module and reason.
 * @param {Array} depend
 * @param {Module} dependentModule
 * @param {Module} originModule
 */
function iterateDependencies(depend, dependentModule, originModule) {
	for (let i = 0; i < depend.length; i++) {
		const dep = depend[i];
		dep.module = dependentModule;
		dependentModule.addReason(originModule, dep);
	}
}

/**
 * Adds profile timing for factory step.
 * @param {Object} target
 * @param {number} start
 * @param {number} factoryStart
 */
function addFactoryProfile(target, start, factoryStart) {
	if (!target.profile) target.profile = {};
	target.profile.factory = factoryStart - start;
}

/**
 * Adds profile timing for building step.
 * @param {Object} target
 * @param {number} afterFactory
 * @param {number} start
 */
function addBuildingProfile(target, afterFactory, start) {
	if (!target.profile) target.profile = {};
	target.profile.building = afterFactory - start;
}

/**
 * Adds profile timing for dependencies step.
 * @param {Object} target
 * @param {number} start
 */
function addDependenciesProfile(target, start) {
	if (!target.profile) target.profile = {};
	const time = Date.now() - start;
	if (!target.profile.dependencies || time > target.profile.dependencies) {
		target.profile.dependencies = time;
	}
}

/**
 * Handles the cache‑hit scenario.
 * @param {Compilation} compilation
 * @param {Module} dependentModule
 * @param {Array} dependencies
 * @param {Module} originModule
 * @param {boolean} isOptionalFlag
 */
function handleCacheHit(compilation, dependentModule, dependencies, originModule, isOptionalFlag) {
	dependentModule = compilation.getModule(dependentModule);
	if (dependentModule.optional) {
		dependentModule.optional = isOptionalFlag;
	}
	iterateDependencies(dependencies, dependentModule, originModule);
	if (compilation.profile) {
		addDependenciesProfile(compilation, compilation.profile.start);
	}
}

/**
 * Handles the case where a new module instance is created.
 * @param {Compilation} compilation
 * @param {Module} newModule
 * @param {Module} dependentModule
 * @param {Array} dependencies
 * @param {Module} originModule
 * @param {boolean} isOptionalFlag
 * @param {number} afterFactory
 * @param {boolean} recursive
 * @param {Function} callback
 */
function handleNewModuleInstance(compilation, newModule, dependentModule, dependencies, originModule, isOptionalFlag, afterFactory, recursive, callback) {
	if (compilation.profile) {
		newModule.profile = dependentModule.profile;
	}
	newModule.optional = isOptionalFlag;
	newModule.issuer = dependentModule.issuer;
	dependentModule = newModule;
	iterateDependencies(dependencies, dependentModule, originModule);
	if (compilation.profile) {
		addBuildingProfile(compilation, afterFactory, compilation.profile.start);
	}
	if (recursive) {
		process.nextTick(compilation.processModuleDependencies.bind(compilation, dependentModule, callback));
	} else {
		process.nextTick(callback);
	}
}

/**
 * Handles the default module building path.
 * @param {Compilation} compilation
 * @param {Module} dependentModule
 * @param {Array} dependencies
 * @param {Module} originModule
 * @param {boolean} isOptionalFlag
 * @param {number} afterFactory
 * @param {boolean} recursive
 * @param {Function} callback
 */
function handleDefaultModule(compilation, dependentModule, dependencies, originModule, isOptionalFlag, afterFactory, recursive, callback) {
	dependentModule.optional = isOptionalFlag;
	iterateDependencies(dependencies, dependentModule, originModule);
	compilation.buildModule(dependentModule, isOptionalFlag, originModule, dependencies, err => {
		if (err) {
			return handleErrorOrWarning(err, isOptionalFlag, compilation.warningsCallback, compilation.errorsCallback);
		}
		if (compilation.profile) {
			addBuildingProfile(compilation, afterFactory, compilation.profile.start);
		}
		if (recursive) {
			compilation.processModuleDependencies(dependentModule, callback);
		} else {
			callback();
		}
	});
}

/**
 * Adds a module dependency with reduced cognitive complexity.
 */
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

	/* ... other methods unchanged ... */

	addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
		const compilation = this;
		const start = compilation.profile && Date.now();

		const factories = [];
		for (let i = 0; i < dependencies.length; i++) {
			const factory = compilation.dependencyFactories.get(dependencies[i][0].constructor);
			if (!factory) {
				return callback(new Error(`No module factory available for dependency type: ${dependencies[i][0].constructor.name}`));
			}
			factories[i] = [factory, dependencies[i]];
		}

		// Helper callbacks for error/warning handling
		compilation.errorsCallback = err => {
			err.origin = module;
			compilation.errors.push(err);
			if (bail) {
				return callback(err);
			}
			callback();
		};
		compilation.warningsCallback = err => {
			err.origin = module;
			compilation.warnings.push(err);
			callback();
		};

		asyncLib.forEach(factories, function iteratorFactory(item, cb) {
			const deps = item[1];
			const factory = item[0];

			factory.create({
				contextInfo: {
					issuer: module.nameForCondition && module.nameForCondition(),
					compiler: compilation.compiler.name
				},
				context: module.context,
				dependencies: deps
			}, function factoryCallback(err, dependentModule) {
				if (err) {
					return handleErrorOrWarning(err, areAllDependenciesOptional(deps), compilation.warningsCallback, compilation.errorsCallback);
				}
				if (!dependentModule) {
					return process.nextTick(cb);
				}
				if (compilation.profile) {
					addFactoryProfile(dependentModule, start, Date.now());
				}
				dependentModule.issuer = module;
				const newModule = compilation.addModule(dependentModule, cacheGroup);
				const optionalFlag = areAllDependenciesOptional(deps);
				const afterFactory = Date.now();

				if (!newModule) {
					handleCacheHit(compilation, dependentModule, deps, module, optionalFlag);
					return process.nextTick(cb);
				}
				if (newModule instanceof Module) {
					handleNewModuleInstance(compilation, newModule, dependentModule, deps, module, optionalFlag, afterFactory, recursive, cb);
					return;
				}
				handleDefaultModule(compilation, dependentModule, deps, module, optionalFlag, afterFactory, recursive, cb);
			});
		}, function finalCallbackAddModuleDependencies(err) {
			compilation.errorsCallback = null;
			compilation.warningsCallback = null;
			if (err) {
				return callback(err);
			}
			return process.nextTick(callback);
		});
	}

	/* ... remaining methods unchanged ... */
}

module.exports = Compilation;