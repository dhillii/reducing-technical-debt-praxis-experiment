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
		this.outputOptions = options && options.output;
		this.bail = options && options.bail;
		this.profile = options && options.profile;
		this.performance = options && options.performance;

		this._initializeTemplates();
		this._initializeCollections();
	}

	_initializeTemplates() {
		this.mainTemplate = new MainTemplate(this.outputOptions);
		this.chunkTemplate = new ChunkTemplate(this.outputOptions);
		this.hotUpdateChunkTemplate = new HotUpdateChunkTemplate(this.outputOptions);
		this.moduleTemplate = new ModuleTemplate(this.outputOptions);
	}

	_initializeCollections() {
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
		const cachedModule = this._tryGetCachedModule(module, cacheName);
		if (cachedModule) {
			return cachedModule;
		}

		module.unbuild();
		this._modules[identifier] = module;
		if (this.cache) {
			this.cache[cacheName] = module;
		}
		this.modules.push(module);
		return true;
	}

	_tryGetCachedModule(module, cacheName) {
		if (!this.cache || !this.cache[cacheName]) {
			return null;
		}

		const cacheModule = this.cache[cacheName];
		const shouldRebuild = this._shouldRebuildModule(cacheModule);

		if (!shouldRebuild) {
			cacheModule.disconnect();
			this._modules[module.identifier()] = cacheModule;
			this.modules.push(cacheModule);
			cacheModule.errors.forEach(err => this.errors.push(err));
			cacheModule.warnings.forEach(err => this.warnings.push(err));
			return cacheModule;
		}

		module.lastId = cacheModule.id;
		return null;
	}

	_shouldRebuildModule(cacheModule) {
		if (cacheModule.error || !cacheModule.cacheable) {
			return true;
		}
		if (!this.fileTimestamps || !this.contextTimestamps) {
			return true;
		}
		return cacheModule.needRebuild(this.fileTimestamps, this.contextTimestamps);
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
		const errors = module.errors;
		for (let i = 0; i < errors.length; i++) {
			const err = errors[i];
			err.origin = origin;
			err.dependencies = dependencies;
			if (optional) {
				this.warnings.push(err);
			} else {
				this.errors.push(err);
			}
		}

		const warnings = module.warnings;
		for (let i = 0; i < warnings.length; i++) {
			const war = warnings[i];
			war.origin = origin;
			war.dependencies = dependencies;
			this.warnings.push(war);
		}
	}

	processModuleDependencies(module, callback) {
		const dependencies = [];

		const addDependency = (dep) => {
			for (let i = 0; i < dependencies.length; i++) {
				if (dep.isEqualResource(dependencies[i][0])) {
					return dependencies[i].push(dep);
				}
			}
			dependencies.push([dep]);
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
		const factories = this._buildFactoriesList(dependencies, callback);

		if (factories === null) {
			return;
		}

		asyncLib.forEach(factories, (item, cb) => {
			this._processFactory(item, module, bail, cacheGroup, recursive, start, cb);
		}, (err) => {
			if (err) {
				return callback(err);
			}
			return process.nextTick(callback);
		});
	}

	_buildFactoriesList(dependencies, callback) {
		const factories = [];
		for (let i = 0; i < dependencies.length; i++) {
			const factory = this.dependencyFactories.get(dependencies[i][0].constructor);
			if (!factory) {
				return callback(new Error(`No module factory available for dependency type: ${dependencies[i][0].constructor.name}`)), null;
			}
			factories[i] = [factory, dependencies[i]];
		}
		return factories;
	}

	_processFactory(item, module, bail, cacheGroup, recursive, start, callback) {
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
			this._handleFactoryResult(err, dependentModule, dependencies, module, bail, cacheGroup, recursive, start, errorAndCallback, warningAndCallback, callback);
		});
	}

	_handleFactoryResult(err, dependentModule, dependencies, module, bail, cacheGroup, recursive, start, errorAndCallback, warningAndCallback, callback) {
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

		let afterFactory;
		if (this.profile) {
			if (!dependentModule.profile) {
				dependentModule.profile = {};
			}
			afterFactory = Date.now();
			dependentModule.profile.factory = afterFactory - start;
		}

		dependentModule.issuer = module;
		const newModule = this.addModule(dependentModule, cacheGroup);

		if (!newModule) {
			return this._handleCachedModule(dependentModule, dependencies, module, isOptional, start, callback);
		}

		if (newModule instanceof Module) {
			return this._handleNewModule(newModule, dependentModule, dependencies, module, recursive, start, afterFactory, callback);
		}

		dependentModule.optional = isOptional();
		this._assignDependenciesToModule(dependencies, dependentModule);

		this.buildModule(dependentModule, isOptional(), module, dependencies, (err) => {
			if (err) {
				return errorOrWarningAndCallback(err);
			}

			if (this.profile) {
				const afterBuilding = Date.now();
				dependentModule.profile.building = afterBuilding - afterFactory;
			}

			if (recursive) {
				this.processModuleDependencies(dependentModule, callback);
			} else {
				return callback();
			}
		});
	}

	_handleCachedModule(dependentModule, dependencies, module, isOptional, start, callback) {
		dependentModule = this.getModule(dependentModule);

		if (dependentModule.optional) {
			dependentModule.optional = isOptional();
		}

		this._assignDependenciesToModule(dependencies, dependentModule);

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

	_handleNewModule(newModule, dependentModule, dependencies, module, recursive, start, afterFactory, callback) {
		if (this.profile) {
			newModule.profile = dependentModule.profile;
		}

		newModule.optional = dependencies.filter(d => !d.optional).length === 0;
		newModule.issuer = dependentModule.issuer;
		dependentModule = newModule;

		this._assignDependenciesToModule(dependencies, dependentModule);

		if (this.profile) {
			const afterBuilding = Date.now();
			module.profile.building = afterBuilding - afterFactory;
		}

		if (recursive) {
			return process.nextTick(this.processModuleDependencies.bind(this, dependentModule, callback));
		}
		return process.nextTick(callback);
	}

	_assignDependenciesToModule(dependencies, module) {
		for (let i = 0; i < dependencies.length; i++) {
			const dep = dependencies[i];
			dep.module = module;
			module.addReason(module, dep);
		}
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

			let afterFactory;
			if (this.profile) {
				if (!module.profile) {
					module.profile = {};
				}
				afterFactory = Date.now();
				module.profile.factory = afterFactory - start;
			}

			const result = this.addModule(module);
			if (!result) {
				module = this.getModule(module);
				onModule(module);

				if (this.profile) {
					const afterBuilding = Date.now();
					module.profile.building = afterBuilding - afterFactory;
				}

				return callback(null, module);
			}

			if (result instanceof Module) {
				if (this.profile) {
					result.profile = module.profile;
				}
				module = result;
				onModule(module);
				this._moduleReady(module, start, afterFactory, callback);
				return;
			}

			onModule(module);

			this.buildModule(module, false, null, null, (err) => {
				if (err) {
					return errorAndCallback(err);
				}

				if (this.profile) {
					const afterBuilding = Date.now();
					module.profile.building = afterBuilding - afterFactory;
				}

				this._moduleReady(module, start, afterFactory, callback);
			});
		});
	}