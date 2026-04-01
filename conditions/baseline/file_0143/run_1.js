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
		if(this.cache && this.cache[cacheName]) {
			const cacheModule = this.cache[cacheName];

			let rebuild = true;
			if(!cacheModule.error && cacheModule.cacheable && this.fileTimestamps && this.contextTimestamps) {
				rebuild = cacheModule.needRebuild(this.fileTimestamps, this.contextTimestamps);
			}

			if(!rebuild) {
				cacheModule.disconnect();
				this._modules[identifier] = cacheModule;
				this.modules.push(cacheModule);
				cacheModule.errors.forEach(err => this.errors.push(err), this);
				cacheModule.warnings.forEach(err => this.warnings.push(err), this);
				return cacheModule;
			} else {
				module.lastId = cacheModule.id;
			}
		}
		module.unbuild();
		this._modules[identifier] = module;
		if(this.cache) {
			this.cache[cacheName] = module;
		}
		this.modules.push(module);
		return true;
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
			this._processModuleErrors(module, error, origin, dependencies, optional);
			module.dependencies.sort(Dependency.compare);
			if(error) {
				this.applyPlugins2("failed-module", module, error);
				return callback(error);
			}
			this.applyPlugins1("succeed-module", module);
			return callback();
		});
	}

	_processModuleErrors(module, error, origin, dependencies, optional) {
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
		asyncLib.forEach(factories, (item, callback) => {
			this._processFactory(item, module, bail, cacheGroup, recursive, start, callback);
		}, function finalCallbackAddModuleDependencies(err) {
			_this = null;
			if(err) {
				return callback(err);
			}
			return process.nextTick(callback);
		});
	}

	_processFactory(item, module, bail, cacheGroup, recursive, start, callback) {
		const dependencies = item[1];
		const factory = item[0];
		const _this = this;

		const errorAndCallback = (err) => {
			err.origin = module;
			_this.errors.push(err);
			if(bail) {
				callback(err);
			} else {
				callback();
			}
		};

		const warningAndCallback = (err) => {
			err.origin = module;
			_this.warnings.push(err);
			callback();
		};

		const isOptional = () => dependencies.filter(d => !d.optional).length === 0;

		const errorOrWarningAndCallback = (err) => {
			if(isOptional()) {
				return warningAndCallback(err);
			} else {
				return errorAndCallback(err);
			}
		};

		factory.create({
			contextInfo: {
				issuer: module.nameForCondition && module.nameForCondition(),
				compiler: _this.compiler.name
			},
			context: module.context,
			dependencies: dependencies
		}, (err, dependentModule) => {
			if(err) {
				return errorOrWarningAndCallback(new ModuleNotFoundError(module, err, dependencies));
			}
			if(!dependentModule) {
				return process.nextTick(callback);
			}

			this._handleDependentModule(dependentModule, module, dependencies, cacheGroup, recursive, start, isOptional, errorOrWarningAndCallback, callback);
		});
	}

	_handleDependentModule(dependentModule, module, dependencies, cacheGroup, recursive, start, isOptional, errorOrWarningAndCallback, callback) {
		let afterFactory;
		if(this.profile) {
			if(!dependentModule.profile) {
				dependentModule.profile = {};
			}
			afterFactory = Date.now();
			dependentModule.profile.factory = afterFactory - start;
		}

		dependentModule.issuer = module;
		const newModule = this.addModule(dependentModule, cacheGroup);

		if(!newModule) {
			this._handleCachedModule(dependentModule, module, dependencies, start, isOptional, callback);
			return;
		}

		if(newModule instanceof Module) {
			this._handleNewModule(newModule, dependentModule, module, dependencies, start, afterFactory, recursive, isOptional, callback);
			return;
		}

		dependentModule.optional = isOptional();
		this._iterationDependencies(dependencies, dependentModule);

		this.buildModule(dependentModule, isOptional(), module, dependencies, (err) => {
			if(err) {
				return errorOrWarningAndCallback(err);
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

	_handleCachedModule(dependentModule, module, dependencies, start, isOptional, callback) {
		dependentModule = this.getModule(dependentModule);

		if(dependentModule.optional) {
			dependentModule.optional = isOptional();
		}

		this._iterationDependencies(dependencies, dependentModule);

		if(this.profile) {
			if(!module.profile) {
				module.profile = {};
			}
			const time = Date.now() - start;
			if(!module.profile.dependencies || time > module.profile.dependencies) {
				module.profile.dependencies = time;
			}
		}

		return process.nextTick(callback);
	}

	_handleNewModule(newModule, dependentModule, module, dependencies, start, afterFactory, recursive, isOptional, callback) {
		if(this.profile) {
			newModule.profile = dependentModule.profile;
		}

		newModule.optional = isOptional();
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

	_iterationDependencies(dependencies, dependentModule) {
		for(let index = 0; index < dependencies.length; index++) {
			const dep = dependencies[index];
			dep.module = dependentModule;
			dependentModule.addReason(module, dep);
		}
	}

	_addModuleChain(context, dependency, onModule, callback) {
		const start = this.profile && Date.now();

		const errorAndCallback = this.bail ? (err) => {
			callback(err);
		} : (err) => {
			err.dependencies = [dependency];
			this.errors.push(err);
			callback();
		};

		if(typeof dependency !== "object" || dependency === null || !dependency.constructor) {
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

			let afterFactory;

			if(this.profile) {
				if(!module.profile) {
					module.profile = {};
				}
				afterFactory = Date.now();
				module.profile.factory = afterFactory - start;
			}

			const result = this.addModule(module);
			if(!result) {
				module = this.getModule(module);

				onModule(module);

				if(this.profile) {
					const afterBuilding = Date.now();
					module.profile.building = afterBuilding - afterFactory;
				}

				return callback(null, module);
			}

			if(result instanceof Module) {
				if(this.profile) {
					result.profile = module.profile;
				}

				module = result;

				onModule(module);

				moduleReady.call(this);
				return;
			}

			onModule(module);

			this.buildModule(module, false, null, null, (err) => {
				if(err) {
					return errorAndCallback(err);
				}

				if(this.profile) {
					const afterBuilding = Date.now();
					module.profile.building = afterBuilding - afterFactory;
				}

				moduleReady.call(this);
			});

			const moduleReady = () => {
				this.processModuleDependencies(module, err => {
					if(err) {
						return callback(err);
					}

					return callback(null, module);
				});
			};
		});
	}

	addEntry(context, entry, name, callback) {
		const slot = {
			name: name,
			module: null
		};
		this.preparedChunks.push(slot);
		this._addModuleChain(context