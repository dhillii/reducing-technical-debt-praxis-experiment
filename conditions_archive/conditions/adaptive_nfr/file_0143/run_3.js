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
					return _this._handleFactoryError(err, dependencies, warningAndCallback, errorAndCallback);
				}
				if(!dependentModule) {
					return process.nextTick(callback);
				}

				_this._processFactoryModule(dependentModule, dependencies, module, cacheGroup, recursive, callback, start, warningAndCallback, errorAndCallback);
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

	_handleFactoryError(err, dependencies, warningAndCallback, errorAndCallback) {
		const isOptional = this._isOptionalDependency(dependencies);
		const wrappedErr = new ModuleNotFoundError(null, err, dependencies);
		if(isOptional) {
			return warningAndCallback(wrappedErr);
		} else {
			return errorAndCallback(wrappedErr);
		}
	}

	_processFactoryModule(dependentModule, dependencies, module, cacheGroup, recursive, callback, start, warningAndCallback, errorAndCallback) {
		if(this.profile) {
			if(!dependentModule.profile) {
				dependentModule.profile = {};
			}
			dependentModule.profile.factory = Date.now() - start;
		}

		dependentModule.issuer = module;
		const newModule = this.addModule(dependentModule, cacheGroup);

		if(!newModule) {
			return this._handleCachedModule(dependentModule, dependencies, module, callback, start);
		}

		if(newModule instanceof Module) {
			return this._handleNewModule(newModule, dependentModule, dependencies, module, recursive, callback, start);
		}

		this._handlePendingModule(dependentModule, dependencies, module, recursive, callback, start, warningAndCallback, errorAndCallback);
	}

	_handleCachedModule(dependentModule, dependencies, module, callback, start) {
		dependentModule = this.getModule(dependentModule);

		if(dependentModule.optional) {
			dependentModule.optional = this._isOptionalDependency(dependencies);
		}

		this._assignDependenciesToModule(dependentModule, dependencies);

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

	_handleNewModule(newModule, dependentModule, dependencies, module, recursive, callback, start) {
		if(this.profile) {
			newModule.profile = dependentModule.profile;
		}

		newModule.optional = this._isOptionalDependency(dependencies);
		newModule.issuer = dependentModule.issuer;

		this._assignDependenciesToModule(newModule, dependencies);

		if(this.profile) {
			module.profile.building = Date.now() - start;
		}

		if(recursive) {
			return process.nextTick(this.processModuleDependencies.bind(this, newModule, callback));
		} else {
			return process.nextTick(callback);
		}
	}

	_handlePendingModule(dependentModule, dependencies, module, recursive, callback, start, warningAndCallback, errorAndCallback) {
		dependentModule.optional = this._isOptionalDependency(dependencies);

		this._assignDependenciesToModule(dependentModule, dependencies);

		this.buildModule(dependentModule, dependentModule.optional, module, dependencies, err => {
			if(err) {
				return this._handleBuildError(err, dependencies, warningAndCallback, errorAndCallback);
			}

			if(this.profile) {
				dependentModule.profile.building = Date.now() - start;
			}

			if(recursive) {
				this.processModuleDependencies(dependentModule, callback);
			} else {
				return callback();
			}
		});
	}

	_assignDependenciesToModule(dependentModule, dependencies) {
		for(let index = 0; index < dependencies.length; index++) {
			const dep = dependencies[index];
			dep.module = dependentModule;
			dependentModule.addReason(null, dep);
		}
	}

	_handleBuildError(err, dependencies, warningAndCallback, errorAndCallback) {
		const isOptional = this._isOptionalDependency(dependencies);
		if(isOptional) {
			return warningAndCallback(err);
		} else {
			return errorAndCallback(err);
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

			this._processAddModuleChain(module, start, onModule, errorAndCallback, callback);
		});
	}

	_isValidDependency(dependency) {
		return typeof dependency === "object" && dependency !== null && dependency.constructor;
	}

	_processAddModuleChain(module, start, onModule, errorAndCallback, callback) {
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
			return this._handleAddModuleChainCached(module, start, afterFactory, onModule, callback);
		}

		if(result instanceof Module) {
			return this._handleAddModuleChainNewModule(result, module, start, afterFactory, onModule, callback);
		}

		this._handleAddModuleChainPending(module, start, afterFactory, onModule, errorAndCallback, callback);
	}

	_handleAddModuleChainCached(module, start, afterFactory, onModule, callback) {
		module = this.getModule(module);

		onModule(module);

		if(this.profile) {
			module.profile.building = Date.now() - afterFactory;
		}

		return callback(null, module);
	}

	_handleAddModuleChainNewModule(result, module, start, afterFactory, onModule, callback) {
		if(this.profile) {
			result.profile = module.profile;
		}

		module = result;
		onModule(module);

		this._moduleReady(module, start, afterFactory, callback);
	}

	_handleAddModuleChainPending(module, start, afterFactory, onModule, errorAndCallback, callback) {
		onModule(module);

		this.buildModule(module, false, null, null, (err) => {
			if(err) {
				return errorAndCallback(err);
			}

			if(this.profile) {
				module.profile.building = Date.now() - afterFactory;
			}

			this._moduleReady(module, start, afterFactory, callback);
		});
	}

	_moduleReady(module, start, afterFactory, callback) {
		this.processModuleDependencies(module, err => {
			if(err) {
				return callback(err);
			}

			return callback(null, module);
		});
	}

	addEntry(context, entry, name, callback) {
		const slot = {
			name: name,
			module: null
		};
		this.preparedChunks.push(slot);
		this._addModuleChain(context, entry, (module) => {

			entry.module = module;
			this.entries.push(module);
			module.issuer = null;

		}, (err, module) => {
			if(err) {
				return callback(err);
			}

			this._finalizeAddEntry(slot, module, callback);
		});
	}

	_finalizeAddEntry(slot, module, callback) {
		if(module) {
			slot.module = module;
		} else {
			const idx = this.preparedChunks.indexOf(slot);
			this.preparedChunks.splice(idx, 1);
		}
		return callback(null, module);
	}

	prefetch(context, dependency, callback) {
		this._addModuleChain(context, dependency, module => {

			module.prefetched = true;
			module.issuer = null;

		}, callback);
	}

	rebuildModule(module, thisCallback) {
		if(module.variables.length || module.blocks.length)
			throw new Error("Cannot rebuild a complex module with variables or blocks");
		if(module.rebuilding) {
			return module.rebuilding.push(thisCallback);
		}
		const rebuilding = module.rebuilding = [thisCallback];

		function callback(err) {
			module.rebuilding = undefined;
			rebuilding.forEach(cb => cb(err));
		}
		const deps = module.dependencies.slice();
		this.buildModule(module, false, module, null, (err) => {
			if(err) return callback(err);

			this.processModuleDependencies(module, (err) => {
				if(err) return callback(err);
				deps.forEach(d => {
					if(d.module && d.module.removeReason(module, d)) {
						module.chunks.forEach(chunk => {
							if(!d.module.hasReasonForChunk(chunk)) {
								if(d.module.removeChunk(chunk)) {
									this.removeChunkFromDependencies(d.module, chunk);
								}
							}
						});
					}
				});
				callback();
			});

		});
	}

	finish() {
		const modules = this.modules;
		this.applyPlugins1("finish-modules", modules);

		for(let index = 0; index < modules.length; index++) {
			const module = modules[index];
			this.reportDependencyErrorsAndWarnings(module, [module]);
		}
	}

	unseal() {
		this.applyPlugins0("unseal");
		this.chunks.length = 0;
		this.namedChunks = {};
		this.additionalChunkAssets.length = 0;
		this.assets = {};
		this.modules.forEach(module => module.unseal());
	}

	seal(callback) {
		const self = this;
		self.applyPlugins0("seal");
		self.nextFreeModuleIndex = 0;
		self.nextFreeModuleIndex2 = 0;
		self.preparedChunks.forEach(preparedChunk => {
			const module = preparedChunk.module;
			const chunk = self.addChunk(preparedChunk.name, module);
			const entrypoint = self.entrypoints[chunk.name] = new Entrypoint(chunk.name);
			entrypoint.unshiftChunk(chunk);

			chunk.addModule(module);
			module.addChunk(chunk);
			chunk.entryModule = module;
			self.assignIndex(module);
			self.assignDepth(module);
			self.processDependenciesBlockForChunk(module, chunk);
		});
		self.sortModules(self.modules);
		self.applyPlugins0("optimize");

		while(self.applyPluginsBailResult1("optimize-modules-basic", self.modules) ||
			self.applyPluginsBailResult1("optimize-modules", self.modules) ||
			self.applyPluginsBailResult1("optimize-modules-advanced", self.modules)); // eslint-disable-line no-extra-semi
		self.applyPlugins1("after-optimize-modules", self.modules);

		while(self.applyPluginsBailResult1("optimize-chunks-basic", self.chunks) ||
			self.applyPluginsBailResult1("optimize-chunks", self.chunks) ||
			self.applyPluginsBailResult1("optimize-chunks-advanced", self.chunks)); // eslint-disable-line no-extra-semi
		self.applyPlugins1("after-optimize-chunks", self.chunks);

		self.applyPluginsAsyncSeries("optimize-tree", self.chunks, self.modules, function sealPart2(err) {
			if(err) {
				return callback(err);
			}

			self._executeSealPart2(callback);
		});
	}

	_executeSealPart2(callback) {
		const self = this;
		self.applyPlugins2("after-optimize-tree", self.chunks, self.modules);

		const shouldRecord = self.applyPluginsBailResult("should-record") !== false;

		self.applyPlugins2("revive-modules", self.modules, self.records);
		self.applyPlugins1("optimize-module-order", self.modules);
		self.applyPlugins1("advanced-optimize-module-order", self.modules);
		self.applyPlugins1("before-module-ids", self.modules);
		self.applyPlugins1("module-ids", self.modules);
		self.applyModuleIds();
		self.applyPlugins1("optimize-module-ids", self.modules);
		self.applyPlugins1("after-optimize-module-ids", self.modules);

		self.sortItemsWithModuleIds();

		self.applyPlugins2("revive-chunks", self.chunks, self.records);
		self.applyPlugins1("optimize-chunk-order", self.chunks);
		self.applyPlugins1("before-chunk-ids", self.chunks);
		self.applyChunkIds();
		self.applyPlugins1("optimize-chunk-ids", self.chunks);
		self.applyPlugins1("after-optimize-chunk-ids", self.chunks);

		self.sortItemsWithChunkIds();

		if(shouldRecord)
			self.applyPlugins2("record-modules", self.modules, self.records);
		if(shouldRecord)
			self.applyPlugins2("record-chunks", self.chunks, self.records);

		self.applyPlugins0("before-hash");
		self.createHash();
		self.applyPlugins0("after-hash");

		if(shouldRecord)
			self.applyPlugins1("record-hash", self.records);

		self.applyPlugins0("before-module-assets");
		self.createModuleAssets();
		if(self.applyPluginsBailResult("should-generate-chunk-assets") !== false) {
			self.applyPlugins0("before-chunk-assets");
			self.createChunkAssets();
		}
		self.applyPlugins1("additional-chunk-assets", self.chunks);
		self.summarizeDependencies();
		if(shouldRecord)
			self.applyPlugins2("record", self, self.records);

		self.applyPluginsAsync("additional-assets", err => {
			if(err) {
				return callback(err);
			}
			self._executeOptimizeChunkAssets(callback);
		});
	}

	_executeOptimizeChunkAssets(callback) {
		const self = this;
		self.applyPluginsAsync("optimize-chunk-assets", self.chunks, err => {
			if(err) {
				return callback(err);
			}
			self.applyPlugins1("after-optimize-chunk-assets", self.chunks);
			self._executeOptimizeAssets(callback);
		});
	}

	_executeOptimizeAssets(callback) {
		const self = this;
		self.applyPluginsAsync("optimize-assets", self.assets, err => {
			if(err) {
				return callback(err);
			}
			self.applyPlugins1("after-optimize-assets", self.assets);
			if(self.applyPluginsBailResult("need-additional-seal")) {
				self.unseal();
				return self.seal(callback);
			}
			return self.applyPluginsAsync("after-seal", callback);
		});
	}

	sortModules(modules) {
		modules.sort((a, b) => {
			if(a.index < b.index) return -1;
			if(a.index > b.index) return 1;
			return 0;
		});
	}

	reportDependencyErrorsAndWarnings(module, blocks) {
		for(let indexBlock = 0; indexBlock < blocks.length; indexBlock++) {
			const block = blocks[indexBlock];
			const dependencies = block.dependencies;

			for(let indexDep = 0; indexDep < dependencies.length; indexDep++) {
				const d = dependencies[indexDep];

				this._reportDependencyWarnings(module, d);
				this._reportDependencyErrors(module, d);
			}

			this.reportDependencyErrorsAndWarnings(module, block.blocks);
		}
	}

	_reportDependencyWarnings(module, dependency) {
		const warnings = dependency.getWarnings();
		if(!warnings) return;

		for(let indexWar = 0; indexWar < warnings.length; indexWar++) {
			const w = warnings[indexWar];
			const warning = new ModuleDependencyWarning(module, w, dependency.loc);
			this.warnings.push(warning);
		}
	}

	_reportDependencyErrors(module, dependency) {
		const errors = dependency.getErrors();
		if(!errors) return;

		for(let indexErr = 0; indexErr < errors.length; indexErr++) {
			const e = errors[indexErr];
			const error = new ModuleDependencyError(module, e, dependency.loc);
			this.errors.push(error);
		}
	}

	addChunk(name, module, loc) {
		if(name) {
			if(Object.prototype.hasOwnProperty.call(this.namedChunks, name)) {
				const chunk = this.namedChunks[name];
				if(module) {
					chunk.addOrigin(module, loc);
				}
				return chunk;
			}
		}
		const chunk = new Chunk(name, module, loc);
		this.chunks.push(chunk);
		if(name) {
			this.namedChunks[name] = chunk;
		}
		return chunk;
	}

	assignIndex(module) {
		const _this = this;

		const queue = [() => {
			assignIndexToModule(module);
		}];

		const iteratorAllDependencies = d => {
			queue.push(() => assignIndexToDependency(d));
		};

		function assignIndexToModule(module) {
			if(typeof module.index !== "number") {
				module.index = _this.nextFreeModuleIndex++;
				queue.push(() => module.index2 = _this.nextFreeModuleIndex2++);
				assignIndexToDependencyBlock(module);
			}
		}

		function assignIndexToDependency(dependency) {
			if(dependency.module) {
				queue.push(() => assignIndexToModule(dependency.module));
			}
		}

		function assignIndexToDependencyBlock(block) {
			let allDependencies = [];

			function iteratorDependency(d) {
				allDependencies.push(d);
			}

			function iteratorBlock(b) {
				queue.push(() => assignIndexToDependencyBlock(b));
			}

			if(block.variables) {
				iterationBlockVariable(block.variables, iteratorDependency);
			}

			if(block.dependencies) {
				iterationOfArrayCallback(block.dependencies, iteratorDependency);
			}
			if(block.blocks) {
				const blocks = block.blocks;
				let indexBlock = blocks.length;
				while(indexBlock--) {
					iteratorBlock(blocks[indexBlock]);
				}
			}

			let indexAll = allDependencies.length;
			while(indexAll--) {
				iteratorAllDependencies(allDependencies[indexAll]);
			}
		}

		while(queue.length) {
			queue.pop()();
		}
	}

	assignDepth(module) {
		function assignDepthToModule(module, depth) {
			if(typeof module.depth === "number" && module.depth <= depth) return;
			module.depth = depth;
			assignDepthToDependencyBlock(module, depth + 1);
		}

		function assignDepthToDependency(dependency, depth) {
			if(dependency.module) {
				queue.push(() => assignDepthToModule(dependency.module, depth));
			}
		}

		function assignDepthToDependencyBlock(block, depth) {
			function iteratorDependency(d) {
				assignDepthToDependency(d, depth);
			}

			function iteratorBlock(b) {
				assignDepthToDependencyBlock(b, depth);
			}

			if(block.variables) {
				iterationBlockVariable(block.variables, iteratorDependency);
			}

			if(block.dependencies) {
				iterationOfArrayCallback(block.dependencies, iteratorDependency);
			}

			if(block.blocks) {
				iterationOfArrayCallback(block.blocks, iteratorBlock);
			}
		}

		const queue = [() => {
			assignDepthToModule(module, 0);
		}];
		while(queue.length) {
			queue.pop()();
		}
	}

	processDependenciesBlockForChunk(block, chunk) {
		const iteratorBlock = b => {
			let c;
			if(!b.chunks) {
				c = this.addChunk(b.chunkName, b.module, b.loc);
				b.chunks = [c];
				c.addBlock(b);
			} else {
				c = b.chunks[0];
			}
			chunk.addChunk(c);
			c.addParent(chunk);
			queue.push([b, c]);
		};

		const iteratorDependency = d => {
			if(!d.module) {
				return;
			}
			if(d.weak) {
				return;
			}
			if(chunk.addModule(d.module)) {
				d.module.addChunk(chunk);
				queue.push([d.module, chunk]);
			}
		};

		const queue = [
			[block, chunk]
		];

		while(queue.length) {
			const queueItem = queue.pop();
			block = queueItem[0];
			chunk = queueItem[1];

			if(block.variables) {
				iterationBlockVariable(block.variables, iteratorDependency);
			}

			if(block.dependencies) {
				iterationOfArrayCallback(block.dependencies, iteratorDependency);
			}

			if(block.blocks) {
				iterationOfArrayCallback(block.blocks, iteratorBlock);
			}
		}
	}

	removeChunkFromDependencies(block, chunk) {
		const iteratorDependency = d => {
			if(!d.module) {
				return;
			}
			if(!d.module.hasReasonForChunk(chunk)) {
				if(d.module.removeChunk(chunk)) {
					this.removeChunkFromDependencies(d.module, chunk);
				}
			}
		};

		const blocks = block.blocks;
		for(let indexBlock = 0; indexBlock < blocks.length; indexBlock++) {
			const chunks = blocks[indexBlock].chunks;
			for(let indexChunk = 0; indexChunk < chunks.length; indexChunk++) {
				const blockChunk = chunks[indexChunk];
				chunk.removeChunk(blockChunk);
				blockChunk.removeParent(chunk);
				this.removeChunkFromDependencies(chunks, blockChunk);
			}
		}

		if(block.dependencies) {
			iterationOfArrayCallback(block.dependencies, iteratorDependency);
		}

		if(block.variables) {
			iterationBlockVariable(block.variables, iteratorDependency);
		}
	}

	applyModuleIds() {
		let unusedIds = [];
		let nextFreeModuleId = 0;
		let usedIds = [];
		const usedIdMap = Object.create(null);
		
		this._collectUsedModuleIds(usedIds, usedIdMap);
		this._findUnusedModuleIds(usedIds, usedIdMap, unusedIds, nextFreeModuleId);
		this._assignModuleIds(unusedIds, nextFreeModuleId);
	}

	_collectUsedModuleIds(usedIds, usedIdMap) {
		if(this.usedModuleIds) {
			Object.keys(this.usedModuleIds).forEach(key => {
				const id = this.usedModuleIds[key];
				if(!usedIdMap[id]) {
					usedIds.push(id);
					usedIdMap[id] = true;
				}
			});
		}

		const modules1 = this.modules;
		for(let indexModule1 = 0; indexModule1 < modules1.length; indexModule1++) {
			const module1 = modules1[indexModule1];
			if(module1.id && !usedIdMap[module1.id]) {
				usedIds.push(module1.id);
				usedIdMap[module1.id] = true;
			}
		}
	}

	_findUnusedModuleIds(usedIds, usedIdMap, unusedIds, nextFreeModuleId) {
		if(usedIds.length === 0) return;

		let usedIdMax = -1;
		for(let index = 0; index < usedIds.length; index++) {
			const usedIdKey = usedIds[index];
			if(typeof usedIdKey !== "number") {
				continue;
			}
			usedIdMax = Math.max(usedIdMax, usedIdKey);
		}

		let lengthFreeModules = nextFreeModuleId = usedIdMax + 1;
		while(lengthFreeModules--) {
			if(!usedIdMap[lengthFreeModules]) {
				unusedIds.push(lengthFreeModules);
			}
		}
	}

	_assignModuleIds(unusedIds, nextFreeModuleId) {
		const modules2 = this.modules;
		for(let indexModule2 = 0; indexModule2 < modules2.length; indexModule2++) {
			const module2 = modules2[indexModule2];
			if(module2.id === null) {
				if(unusedIds.length > 0)
					module2.id = unusedIds.pop();
				else
					module2.id = nextFreeModuleId++;
			}
		}
	}

	applyChunkIds() {
		const unusedIds = [];
		let nextFreeChunkId = 0;

		if(this.usedChunkIds) {
			nextFreeChunkId = this._getNextFreeChunkId(this.usedChunkIds) + 1;
			let index = nextFreeChunkId;
			while(index--) {
				if(this.usedChunkIds[index] !== index) {
					unusedIds.push(index);
				}
			}
		}

		this._assignChunkIds(unusedIds, nextFreeChunkId);
	}

	_getNextFreeChunkId(usedChunkIds) {
		const keyChunks = Object.keys(usedChunkIds);
		let result = -1;

		for(let index = 0; index < keyChunks.length; index++) {
			const usedIdKey = keyChunks[index];
			const usedIdValue = usedChunkIds[usedIdKey];

			if(typeof usedIdValue !== "number") {
				continue;
			}

			result = Math.max(result, usedIdValue);
		}

		return result;
	}

	_assignChunkIds(unusedIds, nextFreeChunkId) {
		const chunks = this.chunks;
		for(let indexChunk = 0; indexChunk < chunks.length; indexChunk++) {
			const chunk = chunks[indexChunk];
			if(chunk.id === null) {
				if(unusedIds.length > 0)
					chunk.id = unusedIds.pop();
				else
					chunk.id = nextFreeChunkId++;
			}
			if(!chunk.ids) {
				chunk.ids = [chunk.id];
			}
		}
	}

	sortItemsWithModuleIds() {
		this.modules.sort(byId);

		const modules = this.modules;
		for(let indexModule = 0; indexModule < modules.length; indexModule++) {
			modules[indexModule].sortItems();
		}

		const chunks = this.chunks;
		for(let indexChunk = 0; indexChunk < chunks.length; indexChunk++) {
			chunks[indexChunk].sortItems();
		}
	}

	sortItemsWithChunkIds() {
		this.chunks.sort(byId);

		const modules = this.modules;
		for(let indexModule = 0; indexModule < modules.length; indexModule++) {
			modules[indexModule].sortItems();
		}

		const chunks = this.chunks;
		for(let indexChunk = 0; indexChunk < chunks.length; indexChunk++) {
			chunks[indexChunk].sortItems();
		}
	}

	summarizeDependencies() {
		function filterDups(array) {
			const newArray = [];
			for(let i = 0; i < array.length; i++) {
				if(i === 0 || array[i - 1] !== array[i])
					newArray.push(array[i]);
			}
			return newArray;
		}
		this.fileDependencies = (this.compilationDependencies || []).slice();
		this.contextDependencies = [];
		this.missingDependencies = [];

		this._collectChildDependencies();
		this._collectModuleDependencies();
		this._collectErrorMissingDependencies();

		this.fileDependencies.sort();
		this.fileDependencies = filterDups(this.fileDependencies);
		this.contextDependencies.sort();
		this.contextDependencies = filterDups(this.contextDependencies);
		this.missingDependencies.sort();
		this.missingDependencies = filterDups(this.missingDependencies);
	}

	_collectChildDependencies() {
		const children = this.children;
		for(let indexChildren = 0; indexChildren < children.length; indexChildren++) {
			const child = children[indexChildren];

			this.fileDependencies = this.fileDependencies.concat(child.fileDependencies);
			this.contextDependencies = this.contextDependencies.concat(child.contextDependencies);
			this.missingDependencies = this.missingDependencies.concat(child.missingDependencies);
		}
	}

	_collectModuleDependencies() {
		const modules = this.modules;
		for(let indexModule = 0; indexModule < modules.length; indexModule++) {
			const module = modules[indexModule];

			if(module.fileDependencies) {
				const fileDependencies = module.fileDependencies;
				for(let indexFileDep = 0; indexFileDep < fileDependencies.length; indexFileDep++) {
					this.fileDependencies.push(fileDependencies[indexFileDep]);
				}
			}
			if(module.contextDependencies) {
				const contextDependencies = module.contextDependencies;
				for(let indexContextDep = 0; indexContextDep < contextDependencies.length; indexContextDep++) {
					this.contextDependencies.push(contextDependencies[indexContextDep]);
				}
			}
		}
	}

	_collectErrorMissingDependencies() {
		this.errors.forEach(error => {
			if(Array.isArray(error.missing)) {
				error.missing.forEach(item => this.missingDependencies.push(item));
			}
		});
	}

	createHash() {
		const outputOptions = this.outputOptions;
		const hashFunction = outputOptions.hashFunction;
		const hashDigest = outputOptions.hashDigest;
		const hashDigestLength = outputOptions.hashDigestLength;
		const hash = crypto.createHash(hashFunction);
		if(outputOptions.hashSalt)
			hash.update(outputOptions.hashSalt);
		this.mainTemplate.updateHash(hash);
		this.chunkTemplate.updateHash(hash);
		this.moduleTemplate.updateHash(hash);
		this.children.forEach(function(child) {
			hash.update(child.hash);
		});
		const chunks = this.chunks.slice();
		chunks.sort((a, b) => {
			const aEntry = a.hasRuntime();
			const bEntry = b.hasRuntime();
			if(aEntry && !bEntry) return 1;
			if(!aEntry && bEntry) return -1;
			return 0;
		});
		for(let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			this._updateChunkHash(chunk, hashFunction, hashDigest, hashDigestLength, hash, outputOptions);
		}
		this.fullHash = hash.digest(hashDigest);
		this.hash = this.fullHash.substr(0, hashDigestLength);
	}

	_updateChunkHash(chunk, hashFunction, hashDigest, hashDigestLength, hash, outputOptions) {
		const chunkHash = crypto.createHash(hashFunction);
		if(outputOptions.hashSalt)
			chunkHash.update(outputOptions.hashSalt);
		chunk.updateHash(chunkHash);
		if(chunk.hasRuntime()) {
			this.mainTemplate.updateHashForChunk(chunkHash, chunk);
		} else {
			this.chunkTemplate.updateHashForChunk(chunkHash, chunk);
		}
		this.applyPlugins2("chunk-hash", chunk, chunkHash);
		chunk.hash = chunkHash.digest(hashDigest);
		hash.update(chunk.hash);
		chunk.renderedHash = chunk.hash.substr(0, hashDigestLength);
	}

	modifyHash(update) {
		const outputOptions = this.outputOptions;
		const hashFunction = outputOptions.hashFunction;
		const hashDigest = outputOptions.hashDigest;
		const hashDigestLength = outputOptions.hashDigestLength;
		const hash = crypto.createHash(hashFunction);
		hash.update(this.fullHash);
		hash.update(update);
		this.fullHash = hash.digest(hashDigest);
		this.hash = this.fullHash.substr(0, hashDigestLength);
	}

	createModuleAssets() {
		for(let i = 0; i < this.modules.length; i++) {
			const module = this.modules[i];
			if(module.assets) {
				Object.keys(module.assets).forEach((assetName) => {
					const fileName = this.getPath(assetName);
					this.assets[fileName] = module.assets[assetName];
					this.applyPlugins2("module-asset", module, fileName);
				});
			}
		}
	}

	createChunkAssets() {
		const outputOptions = this.outputOptions;
		const filename = outputOptions.filename;
		const chunkFilename = outputOptions.chunkFilename;
		for(let i = 0; i < this.chunks.length; i++) {
			const chunk = this.chunks[i];
			chunk.files = [];
			const chunkHash = chunk.hash;
			let source;
			let file;
			const filenameTemplate = chunk.filenameTemplate ? chunk.filenameTemplate :
				chunk.isInitial() ? filename :
				chunkFilename;
			try {
				this._renderChunkAsset(chunk, chunkHash, filenameTemplate, outputOptions);
			} catch(err) {
				this.errors.push(new ChunkRenderError(chunk, file || filenameTemplate, err));
			}
		}
	}

	_renderChunkAsset(chunk, chunkHash, filenameTemplate, outputOptions) {
		const useChunkHash = !chunk.hasRuntime() || (this.mainTemplate.useChunkHash && this.mainTemplate.useChunkHash(chunk));
		const usedHash = useChunkHash ? chunkHash : this.fullHash;
		const cacheName = "c" + chunk.id;
		let source;

		if(this.cache && this.cache[cacheName] && this.cache[cacheName].hash === usedHash) {
			source = this.cache[cacheName].source;
		} else {
			source = this._generateChunkSource(chunk, useChunkHash);
			if(this.cache) {
				this.cache[cacheName] = {
					hash: usedHash,
					source: source = (source instanceof CachedSource ? source : new CachedSource(source))
				};
			}
		}

		const file = this.getPath(filenameTemplate, {
			noChunkHash: !useChunkHash,
			chunk
		});

		if(this.assets[file])
			throw new Error(`Conflict: Multiple assets emit to the same filename ${file}`);
		this.assets[file] = source;
		chunk.files.push(file);
		this.applyPlugins2("chunk-asset", chunk, file);
	}

	_generateChunkSource(chunk, useChunkHash) {
		if(chunk.hasRuntime()) {
			return this.mainTemplate.render(this.hash, chunk, this.moduleTemplate, this.dependencyTemplates);
		} else {
			return this.chunkTemplate.render(chunk, this.moduleTemplate, this.dependencyTemplates);
		}
	}

	getPath(filename, data) {
		data = data || {};
		data.hash = data.hash || this.hash;
		return this.mainTemplate.applyPluginsWaterfall("asset-path", filename, data);
	}

	createChildCompiler(name, outputOptions) {
		return this.compiler.createChildCompiler(this, name, outputOptions);
	}

	checkConstraints() {
		const usedIds = {};

		const modules = this.modules;
		for(let indexModule = 0; indexModule < modules.length; indexModule++) {
			const moduleId = modules[indexModule].id;

			if(usedIds[moduleId])
				throw new Error(`checkConstraints: duplicate module id ${moduleId}`);
		}

		const chunks = this.chunks;
		for(let indexChunk = 0; indexChunk < chunks.length; indexChunk++) {
			const chunk = chunks[indexChunk];

			if(chunks.indexOf(chunk) !== indexChunk)
				throw new Error(`checkConstraints: duplicate chunk in compilation ${chunk.debugId}`);
			chunk.checkConstraints();
		}
	}
}

module.exports = Compilation;
```