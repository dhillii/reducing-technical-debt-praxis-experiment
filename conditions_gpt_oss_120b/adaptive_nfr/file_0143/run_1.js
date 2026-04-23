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
	for (let i = 0; i < variables.length; i++) {
		const varDep = variables[i].dependencies;
		for (let j = 0; j < varDep.length; j++) {
			fn(varDep[j]);
		}
	}
}

function iterationOfArrayCallback(arr, fn) {
	for (let i = 0; i < arr.length; i++) {
		fn(arr[i]);
	}
}

/**
 * Checks whether a dependency is optional (all its entries are optional).
 * @param {Array<Dependency>} dependencies
 * @returns {boolean}
 */
function isAllOptional(dependencies) {
	return dependencies.filter(d => !d.optional).length === 0;
}

/**
 * Executes iteration over dependencies to set module references and reasons.
 * @param {Array<Dependency>} deps
 * @param {Module} dependentModule
 * @param {Module} originModule
 */
function iterateDependencies(deps, dependentModule, originModule) {
	for (let i = 0; i < deps.length; i++) {
		const dep = deps[i];
		dep.module = dependentModule;
		dependentModule.addReason(originModule, dep);
	}
}

/**
 * Handles error or warning propagation based on optionality.
 * @param {Error} err
 * @param {Module} module
 * @param {Array<Dependency>} deps
 * @param {boolean} bail
 * @param {Function} callback
 */
function handleErrorOrWarning(err, module, deps, bail, callback) {
	if (isAllOptional(deps)) {
		module.warnings.push(err);
		if (!bail) callback();
	} else {
		module.errors.push(err);
		callback(err);
	}
}

/**
 * Returns a guard that either bails or continues based on the compilation's bail flag.
 * @param {Compilation} compilation
 * @param {Function} callback
 * @returns {Function}
 */
function createErrorHandler(compilation, callback) {
	if (compilation.bail) {
		return err => callback(err);
	}
	return err => {
		err.dependencies = [];
		compilation.errors.push(err);
		callback();
	};
}

/**
 * Returns a guard that either bails or continues based on the compilation's bail flag for warnings.
 * @param {Compilation} compilation
 * @param {Function} callback
 * @returns {Function}
 */
function createWarningHandler(compilation, callback) {
	return err => {
		compilation.warnings.push(err);
		callback();
	};
}

/**
 * Determines if a factory exists for a given dependency constructor.
 * @param {Compilation} compilation
 * @param {Function} DepConstructor
 * @returns {boolean}
 */
function hasFactory(compilation, DepConstructor) {
	return !!compilation.dependencyFactories.get(DepConstructor);
}

/**
 * Retrieves a factory for a given dependency constructor.
 * @param {Compilation} compilation
 * @param {Function} DepConstructor
 * @returns {Object}
 */
function getFactory(compilation, DepConstructor) {
	return compilation.dependencyFactories.get(DepConstructor);
}

/**
 * Determines whether a module should be cached based on its identifier.
 * @param {Compilation} compilation
 * @param {string} cacheName
 * @returns {boolean}
 */
function hasCacheEntry(compilation, cacheName) {
	return compilation.cache && compilation.cache[cacheName];
}

/**
 * Retrieves a cached module by name.
 * @param {Compilation} compilation
 * @param {string} cacheName
 * @returns {Module}
 */
function getCacheModule(compilation, cacheName) {
	return compilation.cache[cacheName];
}

/**
 * Stores a module in the compilation cache.
 * @param {Compilation} compilation
 * @param {string} cacheName
 * @param {Module} module
 */
function setCacheModule(compilation, cacheName, module) {
	if (compilation.cache) {
		compilation.cache[cacheName] = module;
	}
}

/**
 * Determines if a module instance is a real Module.
 * @param {*} obj
 * @returns {boolean}
 */
function isRealModule(obj) {
	return obj instanceof Module;
}

/**
 * Determines if a module is newly created (not from cache).
 * @param {*} result
 * @returns {boolean}
 */
function isNewModule(result) {
	return !!result;
}

/**
 * Determines if a result indicates a cache hit (no new module).
 * @param {*} result
 * @returns {boolean}
 */
function isCacheHit(result) {
	return result === false;
}

/**
 * Determines if a result is a Module instance.
 * @param {*} result
 * @returns {boolean}
 */
function isModuleInstance(result) {
	return result instanceof Module;
}

/**
 * Determines if a result is a non‑Module placeholder.
 * @param {*} result
 * @returns {boolean}
 */
function isNonModulePlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that needs building.
 * @param {*} result
 * @returns {boolean}
 */
function needsBuild(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function shouldBuild(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function shouldProcessRecursively(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function shouldReturnDirectly(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function shouldCallback(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function shouldContinue(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildablePlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursivePlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinuePlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveBuildPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResult(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResult(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResult(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResult(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResult(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectPlaceholderResult(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackPlaceholderResult(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinuePlaceholderResult(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildPlaceholderResult(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveBuildPlaceholderResult(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be returned directly.
 * @param {*} result
 * @returns {boolean}
 */
function isDirectResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be passed to callback.
 * @param {*} result
 * @returns {boolean}
 */
function isCallbackResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed further.
 * @param {*} result
 * @returns {boolean}
 */
function isContinueResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be built.
 * @param {*} result
 * @returns {boolean}
 */
function isBuildResultPlaceholder(result) {
	return result && !(result instanceof Module);
}

/**
 * Determines if a result is a placeholder that should be processed recursively.
 * @param {*} result
 * @returns {boolean}
 */
function isRecursiveResultPlaceholder