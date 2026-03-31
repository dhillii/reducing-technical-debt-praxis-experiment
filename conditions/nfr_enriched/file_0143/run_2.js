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

const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const iterateBlockVariables = (variables, fn) => {
	variables.forEach(variable => variable.dependencies.forEach(fn));
};

const iterateArray = (arr, fn) => arr.forEach(fn);

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
			return callback();
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

		const factories = dependencies.map((deps, i) => {
			const factory = this.dependencyFactories.get(deps[0].constructor);
			if (!factory) {
				return callback(new Error(
					`No module factory available for dependency type: ${deps[0].constructor.name}`
				));
			}
			return [factory, deps];
		});

		asyncLib.forEach(factories, (item, cb) => this._processFactory(item, module, bail, cacheGroup, recursive, start, cb),
			(err) => {
				if (err) {
					return callback(err);
				}
				return process.nextTick(callback);
			}
		);
	}

	_processFactory(item, module, bail, cacheGroup, recursive, start, callback) {
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

			this._handleDependentModule(
				dependentModule, module, dependencies, cacheGroup, recursive, start, isOptional, callback
			);
		});
	}

	_handleDependentModule(dependentModule, module, dependencies, cacheGroup, recursive, start, isOptional, callback) {
		if (this.profile) {
			dependentModule.profile = dependentModule.profile || {};
			dependentModule.profile.factory = Date.now() - start;
		}

		dependentModule.issuer = module;
		const newModule = this.addModule(dependentModule, cacheGroup);

		if (!newModule) {
			return this._handleCachedModule(dependentModule, module, dependencies, start, isOptional, callback);
		}

		if (newModule instanceof Module) {
			return this._handleNewModule(newModule, dependentModule, module, dependencies, start, recursive, isOptional, callback);
		}

		return this._handleBuildModule(newModule, module, dependencies, start, recursive, isOptional, callback);
	}

	_handleCachedModule(dependentModule, module, dependencies, start, isOptional, callback) {
		const cachedModule = this.getModule(dependentModule);
		if (cachedModule.optional) {
			cachedModule.optional = isOptional();
		}

		dependencies.forEach(dep => {
			dep.module = cachedModule;
			cachedModule.addReason(module, dep);
		});

		if (this.profile) {
			module.profile = module.profile || {};
			const time = Date.now() - start;
			if (!module.profile.dependencies || time > module.profile.dependencies) {
				module.profile.dependencies = time;
			}
		}

		return process.nextTick(callback);
	}

	_handleNewModule(newModule, dependentModule, module, dependencies, start, recursive, isOptional, callback) {
		if (this.profile) {
			newModule.profile = dependentModule.profile;
		}

		newModule.optional = isOptional();
		newModule.issuer = dependentModule.issuer;

		dependencies.forEach(dep => {
			dep.module = newModule;
			newModule.addReason(module, dep);
		});

		if (this.profile) {
			module.profile = module.profile || {};
			module.profile.building = Date.now() - start;
		}

		if (recursive) {
			return process.nextTick(() => this.processModuleDependencies(newModule, callback));
		}
		return process.nextTick(callback);
	}

	_handleBuildModule(dependentModule, module, dependencies, start, recursive, isOptional, callback) {
		dependentModule.optional = isOptional();

		dependencies.forEach(dep => {
			dep.module = dependentModule;
			dependentModule.addReason(module, dep);
		});

		this.buildModule(dependentModule, isOptional(), module, dependencies, (err) => {
			if (err) {
				return isOptional() ? 
					this._addWarning(err, module) : 
					this._addError(err, module);
			}

			if (this.profile) {
				dependentModule.profile = dependentModule.profile || {};
				dependentModule.profile.building = Date.now() - start;
			}

			if (recursive) {
				this.processModuleDependencies(dependentModule, callback);
			} else {
				return callback();
			}
		});
	}

	_addError(err, module) {
		err.origin = module;
		this.errors.push(err);
	}

	_addWarning(err, module) {
		err.origin = module;
		this.warnings.push(err);
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
			throw new Error(
				`No dependency factory available for this dependency type: ${dependency.constructor.name}`
			);
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

			if (this.profile) {
				module.profile = module.profile || {};
				module.profile.factory = Date.now() - start;
			}

			const result = this.addModule(module);
			if (!result) {
				module = this.getModule(module);
				onModule(module);

				if (this.profile) {
					module.profile.building = Date.now() - start;
				}

				return callback(null, module);
			}

			if (result instanceof Module) {
				if (this.profile) {
					result.profile = module.profile;
				}
				module = result;
				onModule(module);
				return this._moduleReady(module, start, callback);
			}

			onModule(module);
			this.buildModule(module, false, null, null, (err) => {
				if (err) {
					return errorAndCallback(err);
				}

				if (this.profile) {
					module.profile.building = Date.now() - start;
				}

				this._moduleReady(module, start, callback);
			});
		});
	}

	_moduleReady(module, start, callback) {
		this.processModuleDependencies(module, (err) => {
			if (err) {
				return callback(err);
			}
			return callback(null, module);
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
			return callback(null, module);
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
		this.buildModule(module, false, module, null, (err) =>