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
		const cachedModule = this.cache && this.cache[cacheName];

		if (cachedModule) {
			const shouldRebuild = this._shouldRebuildModule(cachedModule);
			if (!shouldRebuild) {
				return this._restoreModuleFromCache(cachedModule, identifier);
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

	_shouldRebuildModule(module) {
		if (module.error || !module.cacheable) {
			return true;
		}
		if (!this.fileTimestamps || !this.contextTimestamps) {
			return true;
		}
		return module.needRebuild(this.fileTimestamps, this.contextTimestamps);
	}

	_restoreModuleFromCache(cachedModule, identifier) {
		cachedModule.disconnect();
		this._modules[identifier] = cachedModule;
		this.modules.push(cachedModule);
		cachedModule.errors.forEach(err => this.errors.push(err));
		cachedModule.warnings.forEach(err => this.warnings.push(err));
		return cachedModule;
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
			if (optional) {
				this.warnings.push(err);
			} else {
				this.errors.push(err);
			}
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
			if (block.dependencies) {
				iterateArray(block.dependencies, addDependency);
			}
			if (block.blocks) {
				iterateArray(block.blocks, addDependenciesBlock);
			}
			if (block.variables) {
				iterateBlockVariables(block.variables, addDependency);
			}
		};

		addDependenciesBlock(module);
		this.addModuleDependencies(module, dependencies, this.bail, null, true, callback);
	}

	addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
		const start = this.profile && Date.now();
		const factories = this._createDependencyFactories(dependencies, callback);

		asyncLib.forEach(factories, (item, cb) => {
			this._processDependencyFactory(item, module, bail, cacheGroup, recursive, start, cb);
		}, (err) => {
			if (err) {
				return callback(err);
			}
			return process.nextTick(callback);
		});
	}

	_createDependencyFactories(dependencies, callback) {
		const factories = [];
		for (let i = 0; i < dependencies.length; i++) {
			const factory = this.dependencyFactories.get(dependencies[i][0].constructor);
			if (!factory) {
				return callback(new Error(`No module factory available for dependency type: ${dependencies[i][0].constructor.name}`));
			}
			factories[i] = [factory, dependencies[i]];
		}
		return factories;
	}

	_processDependencyFactory(item, module, bail, cacheGroup, recursive, start, callback) {
		const dependencies = item[1];
		const factory = item[0];

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

		factory.create({
			contextInfo: {
				issuer: module.nameForCondition && module.nameForCondition(),
				compiler: this.compiler.name
			},
			context: module.context,
			dependencies: dependencies
		}, (err, dependentModule) => {
			this._handleFactoryResult(err, dependentModule, module, dependencies, bail, cacheGroup, recursive, start, errorAndCallback, warningAndCallback, callback);
		});
	}

	_handleFactoryResult(err, dependentModule, module, dependencies, bail, cacheGroup, recursive, start, errorAndCallback, warningAndCallback, callback) {
		const isOptional = () => dependencies.filter(d => !d.optional).length === 0;

		const errorOrWarningAndCallback = (err) => {
			if (isOptional()) {
				return warningAndCallback(err);
			}
			return errorAndCallback(err);
		};

		if (err) {
			return errorOrWarningAndCallback(new ModuleNotFoundError(module, err, dependencies));
		}

		if (!dependentModule) {
			return process.nextTick(callback);
		}

		this._updateModuleProfile(dependentModule, start);
		dependentModule.issuer = module;

		const newModule = this.addModule(dependentModule, cacheGroup);

		if (!newModule) {
			return this._handleCachedModule(dependentModule, dependencies, isOptional, start, module, callback);
		}

		if (newModule instanceof Module) {
			return this._handleNewModule(newModule, dependentModule, dependencies, isOptional, start, module, recursive, callback);
		}

		dependentModule.optional = isOptional();
		this._assignDependenciesToModule(dependencies, dependentModule);

		this.buildModule(dependentModule, isOptional(), module, dependencies, (err) => {
			if (err) {
				return errorOrWarningAndCallback(err);
			}

			if (this.profile) {
				const afterBuilding = Date.now();
				dependentModule.profile.building = afterBuilding - start;
			}

			if (recursive) {
				this.processModuleDependencies(dependentModule, callback);
			} else {
				return callback();
			}
		});
	}

	_updateModuleProfile(module, start) {
		if (this.profile) {
			if (!module.profile) {
				module.profile = {};
			}
			module.profile.factory = Date.now() - start;
		}
	}

	_assignDependenciesToModule(dependencies, module) {
		dependencies.forEach(dep => {
			dep.module = module;
			module.addReason(module, dep);
		});
	}

	_handleCachedModule(dependentModule, dependencies, isOptional, start, module, callback) {
		dependentModule = this.getModule(dependentModule);

		if (dependentModule.optional) {
			dependentModule.optional = isOptional();
		}

		this._assignDependenciesToModule(dependencies, dependentModule);

		if (this.profile) {
			const time = Date.now() - start;
			if (!module.profile) {
				module.profile = {};
			}
			if (!module.profile.dependencies || time > module.profile.dependencies) {
				module.profile.dependencies = time;
			}
		}

		return process.nextTick(callback);
	}

	_handleNewModule(newModule, dependentModule, dependencies, isOptional, start, module, recursive, callback) {
		if (this.profile) {
			newModule.profile = dependentModule.profile;
		}

		newModule.optional = isOptional();
		newModule.issuer = dependentModule.issuer;

		this._assignDependenciesToModule(dependencies, newModule);

		if (this.profile) {
			const afterBuilding = Date.now();
			module.profile.building = afterBuilding - start;
		}

		if (recursive) {
			return process.nextTick(this.processModuleDependencies.bind(this, newModule, callback));
		}
		return process.nextTick(callback);
	}

	_addModuleChain(context, dependency, onModule, callback) {
		const start = this.profile && Date.now();

		const errorAndCallback = this.bail
			? (err) => callback(err)
			: (err) => {
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

			this._updateModuleProfile(module, start);
			const result = this.addModule(module);

			if (!result) {
				module = this.getModule(module);
				onModule(module);

				if (this.profile) {
					const afterBuilding = Date.now();
					module.profile.building = afterBuilding - start;
				}

				return callback(null, module);
			}

			if (result instanceof Module) {
				if (this.profile) {
					result.profile = module.profile;
				}
				module = result;
				onModule(module);
				this._moduleReady(module, start, callback);
				return;
			}

			onModule(module);

			this.buildModule(module, false, null, null, (err) => {
				if (err) {
					return errorAndCallback(err);
				}

				if (this.profile) {
					const afterBuilding = Date.now();
					module.profile.building = afterBuilding - start;
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
		if (module.variables.length || module