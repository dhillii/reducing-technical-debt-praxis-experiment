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

const iterationBlockVariable = (variables, fn) => {
	for (let i = 0; i < variables.length; i++) {
		const varDep = variables[i].dependencies;
		for (let j = 0; j < varDep.length; j++) {
			fn(varDep[j]);
		}
	}
};

const iterationOfArrayCallback = (arr, fn) => {
	for (let i = 0; i < arr.length; i++) {
		fn(arr[i]);
	}
};

class Compilation extends Tapable {
	constructor(compiler) {
		super();
		this.compiler = compiler;
		this.resolvers = compiler.resolvers;
		this.inputFileSystem = compiler.inputFileSystem;

		const options = this.options = compiler.options;
		const outputOptions = this.outputOptions = options && options.output;
		
		this.bail = options && options.bail;
		this.profile = options && options.profile;
		this.performance = options && options.performance;

		this.mainTemplate = new MainTemplate(outputOptions);
		this.chunkTemplate = new ChunkTemplate(outputOptions);
		this.hotUpdateChunkTemplate = new HotUpdateChunkTemplate(outputOptions);
		this.moduleTemplate = new ModuleTemplate(outputOptions);

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
		const cached = this.cache && this.cache[cacheName];

		if (cached) {
			const shouldRebuild = cached.error || !cached.cacheable || 
				!this.fileTimestamps || !this.contextTimestamps ||
				cached.needRebuild(this.fileTimestamps, this.contextTimestamps);

			if (!shouldRebuild) {
				cached.disconnect();
				this._modules[identifier] = cached;
				this.modules.push(cached);
				cached.errors.forEach(err => this.errors.push(err));
				cached.warnings.forEach(err => this.warnings.push(err));
				return cached;
			}
			module.lastId = cached.id;
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
				iterationOfArrayCallback(block.dependencies, addDependency);
			}
			if (block.blocks) {
				iterationOfArrayCallback(block.blocks, addDependenciesBlock);
			}
			if (block.variables) {
				iterationBlockVariable(block.variables, addDependency);
			}
		};

		addDependenciesBlock(module);
		this.addModuleDependencies(module, dependencies, this.bail, null, true, callback);
	}

	addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
		const start = this.profile && Date.now();
		const factories = dependencies.map((dep, i) => {
			const factory = this.dependencyFactories.get(dep[0].constructor);
			if (!factory) {
				return callback(new Error(`No module factory available for dependency type: ${dep[0].constructor.name}`));
			}
			return [factory, dep];
		});

		asyncLib.forEach(factories, (item, cb) => this._processFactory(item, module, start, bail, cacheGroup, recursive, cb), 
			(err) => {
				if (err) {
					return callback(err);
				}
				return process.nextTick(callback);
			}
		);
	}

	_processFactory(item, module, start, bail, cacheGroup, recursive, callback) {
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

		factory.create({
			contextInfo: {
				issuer: module.nameForCondition && module.nameForCondition(),
				compiler: this.compiler.name
			},
			context: module.context,
			dependencies: dependencies
		}, (err, dependentModule) => {
			if (err) {
				return this._handleFactoryError(err, module, dependencies, errorAndCallback, warningAndCallback);
			}
			if (!dependentModule) {
				return process.nextTick(callback);
			}

			this._processFactoryModule(dependentModule, module, dependencies, start, bail, cacheGroup, recursive, callback, errorAndCallback, warningAndCallback);
		});
	}

	_handleFactoryError(err, module, dependencies, errorAndCallback, warningAndCallback) {
		const isOptional = dependencies.filter(d => !d.optional).length === 0;
		const error = new ModuleNotFoundError(module, err, dependencies);
		if (isOptional) {
			warningAndCallback(error);
		} else {
			errorAndCallback(error);
		}
	}

	_processFactoryModule(dependentModule, module, dependencies, start, bail, cacheGroup, recursive, callback, errorAndCallback, warningAndCallback) {
		const isOptional = dependencies.filter(d => !d.optional).length === 0;

		if (this.profile) {
			if (!dependentModule.profile) {
				dependentModule.profile = {};
			}
			dependentModule.profile.factory = Date.now() - start;
		}

		dependentModule.issuer = module;
		const newModule = this.addModule(dependentModule, cacheGroup);

		if (!newModule) {
			return this._handleCachedModule(dependentModule, module, dependencies, isOptional, start, callback);
		}

		if (newModule instanceof Module) {
			return this._handleNewModule(newModule, dependentModule, module, dependencies, isOptional, start, recursive, callback);
		}

		dependentModule.optional = isOptional;
		this._assignDependenciesToModule(dependentModule, dependencies);

		this.buildModule(dependentModule, isOptional, module, dependencies, (err) => {
			if (err) {
				return this._handleBuildError(err, isOptional, errorAndCallback, warningAndCallback);
			}

			if (this.profile) {
				dependentModule.profile.building = Date.now() - start - dependentModule.profile.factory;
			}

			if (recursive) {
				this.processModuleDependencies(dependentModule, callback);
			} else {
				return callback();
			}
		});
	}

	_handleCachedModule(dependentModule, module, dependencies, isOptional, start, callback) {
		const cached = this.getModule(dependentModule);
		if (cached.optional) {
			cached.optional = isOptional;
		}
		this._assignDependenciesToModule(cached, dependencies);

		if (this.profile) {
			if (!module.profile) {
				module.profile = {};
			}
			const time = Date.now() - start;
			if (!module.profile.dependencies || time > module.profile.dependencies) {
				module.profile.dependencies = time;
			}
		}

		return process.nextTick(callback);
	}

	_handleNewModule(newModule, dependentModule, module, dependencies, isOptional, start, recursive, callback) {
		if (this.profile) {
			newModule.profile = dependentModule.profile;
		}

		newModule.optional = isOptional;
		newModule.issuer = dependentModule.issuer;

		this._assignDependenciesToModule(newModule, dependencies);

		if (this.profile) {
			newModule.profile.building = Date.now() - start - newModule.profile.factory;
		}

		if (recursive) {
			return process.nextTick(this.processModuleDependencies.bind(this, newModule, callback));
		} else {
			return process.nextTick(callback);
		}
	}

	_handleBuildError(err, isOptional, errorAndCallback, warningAndCallback) {
		if (isOptional) {
			warningAndCallback(err);
		} else {
			errorAndCallback(err);
		}
	}

	_assignDependenciesToModule(dependentModule, dependencies) {
		dependencies.forEach(dep => {
			dep.module = dependentModule;
			dependentModule.addReason(this.modules[this.modules.indexOf(this.modules.find(m => m === dependentModule))], dep);
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

			if (this.profile && !module.profile) {
				module.profile = {};
			}
			const afterFactory = this.profile && Date.now();
			if (this.profile) {
				module.profile.factory = afterFactory - start;
			}

			const result = this.addModule(module);
			if (!result) {
				module = this.getModule(module);
				onModule(module);

				if (this.profile) {
					module.profile.building = Date.now() - afterFactory;
				}

				return callback(null, module);
			}

			if (result instanceof Module) {
				if (this.profile) {
					result.profile = module.profile;
				}
				module = result;
				onModule(module);
				return this._moduleReady(module, start, afterFactory, callback);
			}

			onModule(module);

			this.buildModule(module, false, null, null, (err) => {
				if (err) {
					return errorAndCallback(err);
				}

				if (this.profile) {
					module.profile.building = Date.now() - afterFactory;
				}

				return this._moduleReady(module, start, afterFactory, callback);
			});
		});
	}

	_moduleReady(module, start, afterFactory, callback) {
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
		this._addModule