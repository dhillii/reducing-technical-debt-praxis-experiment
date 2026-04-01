```javascript
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
	if(a.id < b.id) return -1;
	if(a.id > b.id) return 1;
	return 0;
}

function iterationBlockVariable(variables, fn) {
	for(let indexVariable = 0; indexVariable < variables.length; indexVariable++) {
		let varDep = variables[indexVariable].dependencies;
		for(let indexVDep = 0; indexVDep < varDep.length; indexVDep++) {
			fn(varDep[indexVDep]);
		}
	}
}

function iterationOfArrayCallback(arr, fn) {
	for(let index = 0; index < arr.length; index++) {
		fn(arr[index]);
	}
}

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
		if(this._modules[identifier]) {
			return false;
		}
		const cacheName = (cacheGroup || "m") + identifier;
		if(!this.cache || !this.cache[cacheName]) {
			this._addNewModule(module, cacheName);
			return true;
		}

		const cacheModule = this.cache[cacheName];
		if(this._shouldRebuildCachedModule(cacheModule)) {
			module.lastId = cacheModule.id;
			this._addNewModule(module, cacheName);
			return true;
		}

		this._restoreCachedModule(cacheModule);
		return cacheModule;
	}

	_shouldRebuildCachedModule(cacheModule) {
		if(cacheModule.error) return true;
		if(!cacheModule.cacheable) return true;
		if(!this.fileTimestamps || !this.contextTimestamps) return true;
		return cacheModule.needRebuild(this.fileTimestamps, this.contextTimestamps);
	}

	_restoreCachedModule(cacheModule) {
		cacheModule.disconnect();
		const identifier = cacheModule.identifier();
		this._modules[identifier] = cacheModule;
		this.modules.push(cacheModule);
		cacheModule.errors.forEach(err => this.errors.push(err), this);
		cacheModule.warnings.forEach(err => this.warnings.push(err), this);
	}

	_addNewModule(module, cacheName) {
		module.unbuild();
		const identifier = module.identifier();
		this._modules[identifier] = module;
		if(this.cache) {
			this.cache[cacheName] = module;
		}
		this.modules.push(module);
	}

	getModule(module) {
		const identifier = module.identifier();
		return this._modules[identifier];
	}

	findModule(identifier) {
		return this._modules[identifier];
	}

	buildModule(module, optional, origin, dependencies, thisCallback) {
		this.applyPlugins1("build-module", module);
		if(module.building) return module.building.push(thisCallback);
		const building = module.building = [thisCallback];

		function callback(err) {
			module.building = undefined;
			building.forEach(cb => cb(err));
		}
		module.build(this.options, this, this.resolvers.normal, this.inputFileSystem, (error) => {
			this._processModuleErrors(module, origin, dependencies, optional);
			module.dependencies.sort(Dependency.compare);
			if(error) {
				this.applyPlugins2("failed-module", module, error);
				return callback(error);
			}
			this.applyPlugins1("succeed-module", module);
			return callback();
		});
	}

	_processModuleErrors(module, origin, dependencies, optional) {
		const errors = module.errors;
		for(let indexError = 0; indexError < errors.length; indexError++) {
			const err = errors[indexError];
			err.origin = origin;
			err.dependencies = dependencies;
			if(optional)
				this.warnings.push(err);
			else
				this.errors.push(err);
		}

		const warnings = module.warnings;
		for(let indexWarning = 0; indexWarning < warnings.length; indexWarning++) {
			const war = warnings[indexWarning];
			war.origin = origin;
			war.dependencies = dependencies;
			this.warnings.push(war);
		}
	}

	processModuleDependencies(module, callback) {
		const dependencies = [];

		function addDependency(dep) {
			for(let i = 0; i < dependencies.length; i++) {
				if(dep.isEqualResource(dependencies[i][0])) {
					return dependencies[i].push(dep);
				}
			}
			dependencies.push([dep]);
		}

		function addDependenciesBlock(block) {
			if(block.dependencies) {
				iterationOfArrayCallback(block.dependencies, addDependency);
			}
			if(block.blocks) {
				iterationOfArrayCallback(block.blocks, addDependenciesBlock);
			}
			if(block.variables) {
				iterationBlockVariable(block.variables, addDependency);
			}
		}
		addDependenciesBlock(module);
		this.addModuleDependencies(module, dependencies, this.bail, null, true, callback);
	}

	addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
		let _this = this;
		const start = _this.profile && Date.now();

		const factories = [];
		for(let i = 0; i < dependencies.length; i++) {
			const factory = _this.dependencyFactories.get(dependencies[i][0].constructor);
			if(!factory) {
				return callback(new Error(`No module factory available for dependency type: ${dependencies[i][0].constructor.name}`));
			}
			factories[i] = [factory, dependencies[i]];
		}
		asyncLib.forEach(factories, function iteratorFactory(item, callback) {
			const dependencies = item[1];

			const errorAndCallback = function errorAndCallback(err) {
				err.origin = module;
				_this.errors.push(err);
				if(bail) {
					callback(err);
				} else {
					callback();
				}
			};
			const warningAndCallback = function warningAndCallback(err) {
				err.origin = module;
				_this.warnings.push(err);
				callback();
			};

			const factory = item[0];
			factory.create({
				contextInfo: {
					issuer: module.nameForCondition && module.nameForCondition(),
					compiler: _this.compiler.name
				},
				context: module.context,
				dependencies: dependencies
			}, function factoryCallback(err, dependentModule) {
				if(err) {
					return _this._handleFactoryError(err, dependencies, module, warningAndCallback, errorAndCallback);
				}
				if(!dependentModule) {
					return process.nextTick(callback);
				}

				const afterFactory = _this._recordFactoryProfile(dependentModule, start);
				dependentModule.issuer = module;
				const newModule = _this.addModule(dependentModule, cacheGroup);

				if(!newModule) {
					return _this._handleCachedModule(dependentModule, dependencies, module, start, afterFactory, callback);
				}

				if(newModule instanceof Module) {
					return _this._handleNewModule(newModule, dependentModule, dependencies, module, start, afterFactory, recursive, callback);
				}

				return _this._handlePendingModule(dependentModule, dependencies, module, start, afterFactory, recursive, callback);
			});
		}, function finalCallbackAddModuleDependencies(err) {
			_this = null;
			if(err) {
				return callback(err);
			}
			return process.nextTick(callback);
		});
	}

	_isOptionalDependency(dependencies) {
		return dependencies.filter(d => !d.optional).length === 0;
	}

	_handleFactoryError(err, dependencies, module, warningAndCallback, errorAndCallback) {
		const isOptional = this._isOptionalDependency(dependencies);
		const error = new ModuleNotFoundError(module, err, dependencies);
		if(isOptional) {
			return warningAndCallback(error);
		} else {
			return errorAndCallback(error);
		}
	}

	_recordFactoryProfile(dependentModule, start) {
		if(!this.profile) return undefined;
		if(!dependentModule.profile) {
			dependentModule.profile = {};
		}
		const afterFactory = Date.now();
		dependentModule.profile.factory = afterFactory - start;
		return afterFactory;
	}

	_handleCachedModule(dependentModule, dependencies, module, start, afterFactory, callback) {
		dependentModule = this.getModule(dependentModule);

		if(dependentModule.optional) {
			dependentModule.optional = this._isOptionalDependency(dependencies);
		}

		this._iterationDependencies(dependencies, dependentModule);

		if(this.profile) {
			this._recordModuleProfile(module, start);
		}

		return process.nextTick(callback);
	}

	_handleNewModule(newModule, dependentModule, dependencies, module, start, afterFactory, recursive, callback) {
		if(this.profile) {
			newModule.profile = dependentModule.profile;
		}

		newModule.optional = this._isOptionalDependency(dependencies);
		newModule.issuer = dependentModule.issuer;
		dependentModule = newModule;

		this._iterationDependencies(dependencies, dependentModule);

		if(this.profile) {
			const afterBuilding = Date.now();
			module.profile.building = afterBuilding - afterFactory;
		}

		if(recursive) {
			return process.nextTick(this.processModuleDependencies.bind(this, dependentModule, callback));
		} else {
			return process.nextTick(callback);
		}
	}

	_handlePendingModule(dependentModule, dependencies, module, start, afterFactory, recursive, callback) {
		dependentModule.optional = this._isOptionalDependency(dependencies);

		this._iterationDependencies(dependencies, dependentModule);

		this.buildModule(dependentModule, dependentModule.optional, module, dependencies, err => {
			if(err) {
				const isOptional = this._isOptionalDependency(dependencies);
				if(isOptional) {
					err.origin = module;
					this.warnings.push(err);
				} else {
					err.origin = module;
					this.errors.push(err);
				}
				return callback();
			}

			if(this.profile) {
				const afterBuilding = Date.now();
				dependentModule.profile.building = afterBuilding - afterFactory;
			}

			if(recursive) {
				this.processModuleDependencies(dependentModule, callback);
			} else {
				return callback();
			}
		});
	}

	_iterationDependencies(dependencies, dependentModule) {
		for(let index = 0; index < dependencies.length; index++) {
			const dep = dependencies[index];
			dep.module = dependentModule;
			dependentModule.addReason(this.modules[this.modules.indexOf(dependentModule) - 1] || null, dep);
		}
	}

	_recordModuleProfile(module, start) {
		if(!module.profile) {
			module.profile = {};
		}
		const time = Date.now() - start;
		if(!module.profile.dependencies || time > module.profile.dependencies) {
			module.profile.dependencies = time;
		}
	}

	_addModuleChain(context, dependency, onModule, callback) {
		const start = this.profile && Date.now();

		const errorAndCallback = this.bail ? function errorAndCallback(err) {
			callback(err);
		} : function errorAndCallback(err) {
			err.dependencies = [dependency];
			this.errors.push(err);
			callback();
		}.bind(this);

		if(!this._isValidDependency(dependency)) {
			throw new Error("Parameter 'dependency' must be a Dependency");
		}

		const moduleFactory = this.dependencyFactories.get(dependency.constructor);
		if(!moduleFactory) {
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
			if(err) {
				return errorAndCallback(new EntryModuleNotFoundError(err));
			}

			const afterFactory = this._recordFactoryProfile(module, start);

			const result = this.addModule(module);
			if(!result) {
				return this._handleAddModuleChainCached(module, afterFactory, onModule, callback);
			}

			if(result instanceof Module) {
				return this._handleAddModuleChainNewModule(result, module, afterFactory, onModule, callback);
			}

			return this._handleAddModuleChainPending(module, afterFactory, onModule, callback);
		});
	}

	_isValidDependency(dependency)