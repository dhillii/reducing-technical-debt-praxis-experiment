```javascript
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

// Utility functions
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const iterateBlockVariables = (variables, fn) => {
	variables.forEach(variable => variable.dependencies.forEach(fn));
};

const iterateArray = (arr, fn) => arr.forEach(fn);

const filterDuplicates = (array) => {
	return array.filter((item, i) => i === 0 || array[i - 1] !== item);
};

const getMaxId = (ids) => {
	return ids.reduce((max, id) => typeof id === "number" ? Math.max(max, id) : max, -1);
};

class Compilation extends Tapable {
	constructor(compiler) {
		super();
		this.compiler = compiler;
		this.resolvers = compiler.resolvers;
		this.inputFileSystem = compiler.inputFileSystem;

		const options = this.options = compiler.options;
		this.outputOptions = options?.output;
		this.bail = options?.bail;
		this.profile = options?.profile;
		this.performance = options?.performance;

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

	getStats() {
		return new Stats(this);
	}

	templatesPlugin(name, fn) {
		this.mainTemplate.plugin(name, fn);
		this.chunkTemplate.plugin(name, fn);
	}

	addModule(module, cacheGroup) {
		const identifier = module.identifier();
		if (this._modules[identifier]) {
			return false;
		}

		const cacheName = (cacheGroup || "m") + identifier;
		const cachedModule = this.cache?.[cacheName];

		if (cachedModule) {
			const shouldRebuild = cachedModule.error || !cachedModule.cacheable || 
				!this.fileTimestamps || !this.contextTimestamps ||
				cachedModule.needRebuild(this.fileTimestamps, this.contextTimestamps);

			if (!shouldRebuild) {
				cachedModule.disconnect();
				this._modules[identifier] = cachedModule;
				this.modules.push(cachedModule);
				cachedModule.errors.forEach(err => this.errors.push(err));
				cachedModule.warnings.forEach(err => this.warnings.push(err));
				return cachedModule;
			}
			module.lastId = cachedModule.id;
		}

		module.unbuild();
		this._modules[identifier] = module;
		if (this.cache) {
			this.cache[cacheName] = module;
		}
		this.modules.push(module);
		return true;
	}

	getModule(module) {
		return this._modules[module.identifier()];
	}

	findModule(identifier) {
		return this._modules[identifier];
	}

	buildModule(module, optional, origin, dependencies, thisCallback) {
		this.applyPlugins1("build-module", module);
		if (module.building) {
			return module.building.push(thisCallback);
		}

		const building = module.building = [thisCallback];

		const callback = (err) => {
			module.building = undefined;
			building.forEach(cb => cb(err));
		};

		module.build(this.options, this, this.resolvers.normal, this.inputFileSystem, (error) => {
			this._processBuildErrors(module, origin, dependencies, optional);
			module.dependencies.sort(Dependency.compare);

			if (error) {
				this.applyPlugins2("failed-module", module, error);
				return callback(error);
			}
			this.applyPlugins1("succeed-module", module);
			callback();
		});
	}

	_processBuildErrors(module, origin, dependencies, optional) {
		module.errors.forEach(err => {
			err.origin = origin;
			err.dependencies = dependencies;
			(optional ? this.warnings : this.errors).push(err);
		});

		module.warnings.forEach(war => {
			war.origin = origin;
			war.dependencies = dependencies;
			this.warnings.push(war);
		});
	}

	processModuleDependencies(module, callback) {
		const dependencies = [];

		const addDependency = (dep) => {
			const existing = dependencies.find(d => dep.isEqualResource(d[0]));
			if (existing) {
				existing.push(dep);
			} else {
				dependencies.push([dep]);
			}
		};

		const addDependenciesBlock = (block) => {
			block.dependencies?.forEach(addDependency);
			block.blocks?.forEach(addDependenciesBlock);
			block.variables && iterateBlockVariables(block.variables, addDependency);
		};

		addDependenciesBlock(module);
		this.addModuleDependencies(module, dependencies, this.bail, null, true, callback);
	}

	addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
		const start = this.profile && Date.now();

		const factories = dependencies.map(deps => {
			const factory = this.dependencyFactories.get(deps[0].constructor);
			if (!factory) {
				return callback(new Error(`No module factory available for dependency type: ${deps[0].constructor.name}`));
			}
			return [factory, deps];
		});

		asyncLib.forEach(factories, this._processFactory.bind(this, module, bail, cacheGroup, recursive, start), 
			(err) => {
				if (err) {
					return callback(err);
				}
				process.nextTick(callback);
			});
	}

	_processFactory(module, bail, cacheGroup, recursive, start, item, callback) {
		const [factory, dependencies] = item;

		const errorAndCallback = (err) => {
			err.origin = module;
			this.errors.push(err);
			if (bail) {
				callback(err);
			} else {
				callback();
			}
		};

		const warningAndCallback = (err) => {
			err.origin = module;
			this.warnings.push(err);
			callback();
		};

		const isOptional = () => dependencies.every(d => d.optional);

		const errorOrWarningAndCallback = (err) => {
			return isOptional() ? warningAndCallback(err) : errorAndCallback(err);
		};

		factory.create({
			contextInfo: {
				issuer: module.nameForCondition?.(),
				compiler: this.compiler.name
			},
			context: module.context,
			dependencies: dependencies
		}, (err, dependentModule) => {
			if (err) {
				return errorOrWarningAndCallback(new ModuleNotFoundError(module, err, dependencies));
			}
			if (!dependentModule) {
				return process.nextTick(callback);
			}

			this._handleDependentModule(dependentModule, module, dependencies, cacheGroup, recursive, 
				isOptional, errorOrWarningAndCallback, start, callback);
		});
	}

	_handleDependentModule(dependentModule, module, dependencies, cacheGroup, recursive, 
		isOptional, errorOrWarningAndCallback, start, callback) {
		
		if (this.profile) {
			dependentModule.profile = dependentModule.profile || {};
			dependentModule.profile.factory = Date.now() - start;
		}

		dependentModule.issuer = module;
		const newModule = this.addModule(dependentModule, cacheGroup);

		if (!newModule) {
			return this._handleCachedModule(dependentModule, module, dependencies, start, callback);
		}

		if (newModule instanceof Module) {
			return this._handleNewModule(newModule, dependentModule, module, dependencies, recursive, 
				isOptional, start, callback);
		}

		dependentModule.optional = isOptional();
		this._assignDependenciesToModule(dependentModule, dependencies);

		this.buildModule(dependentModule, isOptional(), module, dependencies, (err) => {
			if (err) {
				return errorOrWarningAndCallback(err);
			}

			if (this.profile) {
				dependentModule.profile.building = Date.now() - (start + dependentModule.profile.factory);
			}

			if (recursive) {
				this.processModuleDependencies(dependentModule, callback);
			} else {
				callback();
			}
		});
	}

	_handleCachedModule(dependentModule, module, dependencies, start, callback) {
		dependentModule = this.getModule(dependentModule);
		dependentModule.optional = dependencies.every(d => d.optional);
		this._assignDependenciesToModule(dependentModule, dependencies);

		if (this.profile) {
			module.profile = module.profile || {};
			module.profile.dependencies = Date.now() - start;
		}

		process.nextTick(callback);
	}

	_handleNewModule(newModule, dependentModule, module, dependencies, recursive, isOptional, start, callback) {
		if (this.profile) {
			newModule.profile = dependentModule.profile;
		}

		newModule.optional = isOptional();
		newModule.issuer = dependentModule.issuer;
		this._assignDependenciesToModule(newModule, dependencies);

		if (this.profile) {
			module.profile = module.profile || {};
			module.profile.building = Date.now() - (start + newModule.profile.factory);
		}

		if (recursive) {
			process.nextTick(this.processModuleDependencies.bind(this, newModule, callback));
		} else {
			process.nextTick(callback);
		}
	}

	_assignDependenciesToModule(module, dependencies) {
		dependencies.forEach(dep => {
			dep.module = module;
			module.addReason(this._currentModule, dep);
		});
	}

	_addModuleChain(context, dependency, onModule, callback) {
		const start = this.profile && Date.now();

		const errorAndCallback = this.bail ? 
			(err) => callback(err) :
			(err) => {
				err.dependencies = [dependency];
				this.errors.push(err);
				callback();
			};

		if (typeof dependency !== "object" || dependency === null || !dependency.constructor) {
			throw new Error("Parameter 'dependency' must be a Dependency");
		}

		const moduleFactory = this.dependencyFactories.get(dependency.constructor);
		if (!moduleFactory) {
			throw new Error(`No dependency factory available for this dependency type: ${dependency.constructor.name}`);
		}

		moduleFactory.create({
			contextInfo: {
				issuer: "",
				compiler: this.compiler.name
			},
			context: context,
			dependencies: [dependency]
		}, (err, module) => {
			if (err) {
				return errorAndCallback(new EntryModuleNotFoundError(err));
			}

			const afterFactory = this._initializeModuleProfile(module, start);
			const result = this.addModule(module);

			if (!result) {
				module = this.getModule(module);
				onModule(module);
				this._updateModuleProfile(module, afterFactory);
				return callback(null, module);
			}

			if (result instanceof Module) {
				if (this.profile) {
					result.profile = module.profile;
				}
				module = result;
				onModule(module);
				this._moduleReady(module, afterFactory, callback);
				return;
			}

			onModule(module);
			this.buildModule(module, false, null, null, (err) => {
				if (err) {
					return errorAndCallback(err);
				}
				this._updateModuleProfile(module, afterFactory);
				this._moduleReady(module, afterFactory, callback);
			});
		});
	}

	_initializeModuleProfile(module, start) {
		if (this.profile) {
			module.profile = module.profile || {};
			const afterFactory = Date.now();
			module.profile.factory = afterFactory - start;
			return afterFactory;
		}
		return start;
	}

	_updateModuleProfile(module, afterFactory) {
		if (this.profile && afterFactory) {
			module.profile.building = Date.now() - afterFactory;
		}
	}

	_moduleReady(module, afterFactory, callback) {
		this.processModuleDependencies(module, (err) => {
			if (err) {
				return callback(err);
			}
			callback(null, module);
		});
	}

	addEntry(context, entry, name, callback) {
		const slot = { name, module: null };
		this.preparedChunks.push(slot);

		this._addModuleChain(context, entry, (module) => {
			entry.module = module;
			this.entries.push(module);
			module.issuer = null;
		}, (err, module) => {
			if (err) {
				return callback(err);
			}

			if (module) {
				slot.module = module;
			} else {
				const idx = this.preparedChunks.indexOf(slot);
				this.preparedChunks.splice(idx, 1);
			}
			callback(null, module);
		});
	}

	prefetch(context, dependency, callback) {
		this._addModuleChain(context, dependency, (module) => {
			module.prefetched = true;
			module.issuer = null;
		}, callback);
	}

	rebuildModule(module, thisCallback) {
		if (module.variables.length || module.blocks.length) {
			throw new Error("Cannot rebuild a complex module with variables or blocks");
		}
		if (module.rebuilding) {
			return module.rebuilding.push(thisCallback);
		}

		const rebuilding = module.rebuilding = [thisCallback];
		const callback = (err) => {
			module.rebuilding = undefined;
			rebuilding.forEach(cb => cb(err));
		};

		const deps = module.dependencies.slice();
		this.buildModule(module, false, module, null, (err) => {
			if (err) return callback(err);