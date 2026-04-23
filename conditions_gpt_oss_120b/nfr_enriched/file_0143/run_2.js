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
		if (this.cache && this.cache[cacheName]) {
			const cacheModule = this.cache[cacheName];

			let rebuild = true;
			if (!cacheModule.error && cacheModule.cacheable && this.fileTimestamps && this.contextTimestamps) {
				rebuild = cacheModule.needRebuild(this.fileTimestamps, this.contextTimestamps);
			}

			if (!rebuild) {
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
		if (this.cache) {
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
		if (module.building) return module.building.push(thisCallback);
		const building = module.building = [thisCallback];

		function callback(err) {
			module.building = undefined;
			building.forEach(cb => cb(err));
		}
		module.build(this.options, this, this.resolvers.normal, this.inputFileSystem, (error) => {
			const errors = module.errors;
			for (let i = 0; i < errors.length; i++) {
				const err = errors[i];
				err.origin = origin;
				err.dependencies = dependencies;
				if (optional) this.warnings.push(err);
				else this.errors.push(err);
			}

			const warnings = module.warnings;
			for (let i = 0; i < warnings.length; i++) {
				const war = warnings[i];
				war.origin = origin;
				war.dependencies = dependencies;
				this.warnings.push(war);
			}
			module.dependencies.sort(Dependency.compare);
			if (error) {
				this.applyPlugins2("failed-module", module, error);
				return callback(error);
			}
			this.applyPlugins1("succeed-module", module);
			return callback();
		});
	}

	processModuleDependencies(module, callback) {
		const dependencies = [];

		function addDependency(dep) {
			for (let i = 0; i < dependencies.length; i++) {
				if (dep.isEqualResource(dependencies[i][0])) {
					return dependencies[i].push(dep);
				}
			}
			dependencies.push([dep]);
		}

		function addDependenciesBlock(block) {
			if (block.dependencies) iterationOfArrayCallback(block.dependencies, addDependency);
			if (block.blocks) iterationOfArrayCallback(block.blocks, addDependenciesBlock);
			if (block.variables) iterationBlockVariable(block.variables, addDependency);
		}
		addDependenciesBlock(module);
		this.addModuleDependencies(module, dependencies, this.bail, null, true, callback);
	}

	/** Validate that factories exist for all dependencies */
	_validateFactories(dependencies) {
		const factories = [];
		for (let i = 0; i < dependencies.length; i++) {
			const factory = this.dependencyFactories.get(dependencies[i][0].constructor);
			if (!factory) {
				throw new Error(`No module factory available for dependency type: ${dependencies[i][0].constructor.name}`);
			}
			factories[i] = [factory, dependencies[i]];
		}
		return factories;
	}

	/** Push error or warning based on optional flag */
	_pushErrorOrWarning(err, module, isOptional) {
		err.origin = module;
		if (isOptional) {
			this.warnings.push(err);
		} else {
			this.errors.push(err);
		}
	}

	/** Process a single factory result */
	_processFactoryResult(item, module, bail, cacheGroup, recursive, callback) {
		const [factory, dependencies] = item;
		const isOptional = () => dependencies.filter(d => !d.optional).length === 0;

		const errorAndCallback = (err) => {
			err.origin = module;
			this.errors.push(err);
			if (bail) callback(err);
			else callback();
		};

		const warningAndCallback = (err) => {
			err.origin = module;
			this.warnings.push(err);
			callback();
		};

		const errorOrWarning = (err) => {
			if (isOptional()) warningAndCallback(err);
			else errorAndCallback(err);
		};

		const iterateDependencies = (depend) => {
			for (let i = 0; i < depend.length; i++) {
				const dep = depend[i];
				dep.module = dependentModule;
				dependentModule.addReason(module, dep);
			}
		};

		factory.create({
			contextInfo: {
				issuer: module.nameForCondition && module.nameForCondition(),
				compiler: this.compiler.name
			},
			context: module.context,
			dependencies: dependencies
		}, (err, dependentModule) => {
			if (err) return errorOrWarning(new ModuleNotFoundError(module, err, dependencies));
			if (!dependentModule) return process.nextTick(callback);

			if (this.profile) {
				if (!dependentModule.profile) dependentModule.profile = {};
				dependentModule.profile.factory = Date.now() - this._startTime;
			}
			dependentModule.issuer = module;
			const newModule = this.addModule(dependentModule, cacheGroup);

			if (!newModule) {
				dependentModule = this.getModule(dependentModule);
				if (dependentModule.optional) dependentModule.optional = isOptional();
				iterateDependencies(dependencies);
				if (this.profile) {
					if (!module.profile) module.profile = {};
					const time = Date.now() - this._startTime;
					if (!module.profile.dependencies || time > module.profile.dependencies) {
						module.profile.dependencies = time;
					}
				}
				return process.nextTick(callback);
			}

			if (newModule instanceof Module) {
				if (this.profile) newModule.profile = dependentModule.profile;
				newModule.optional = isOptional();
				newModule.issuer = dependentModule.issuer;
				dependentModule = newModule;
				iterateDependencies(dependencies);
				if (this.profile) {
					const afterBuilding = Date.now();
					module.profile.building = afterBuilding - (dependentModule.profile ? dependentModule.profile.factory : 0);
				}
				if (recursive) return process.nextTick(this.processModuleDependencies.bind(this, dependentModule, callback));
				return process.nextTick(callback);
			}

			dependentModule.optional = isOptional();
			iterateDependencies(dependencies);
			this.buildModule(dependentModule, isOptional(), module, dependencies, (err) => {
				if (err) return errorOrWarning(err);
				if (this.profile) {
					const afterBuilding = Date.now();
					dependentModule.profile.building = afterBuilding - (dependentModule.profile ? dependentModule.profile.factory : 0);
				}
				if (recursive) this.processModuleDependencies(dependentModule, callback);
				else callback();
			});
		});
	}

	addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
		this._startTime = this.profile && Date.now();
		let factories;
		try {
			factories = this._validateFactories(dependencies);
		} catch (e) {
			return callback(e);
		}
		asyncLib.forEach(factories, (item, cb) => {
			this._processFactoryResult(item, module, bail, cacheGroup, recursive, cb);
		}, (err) => {
			// Prevent V8 memory leak by clearing reference
			this._startTime = null;
			if (err) return callback(err);
			return process.nextTick(callback);
		});
	}

	_addModuleChain(context, dependency, onModule, callback) {
		const start = this.profile && Date.now();

		const errorAndCallback = this.bail ? (err) => callback(err) : (err) => {
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
			context,
			dependencies: [dependency]
		}, (err, module) => {
			if (err) return errorAndCallback(new EntryModuleNotFoundError(err));

			let afterFactory;
			if (this.profile) {
				if (!module.profile) module.profile = {};
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
				if (this.profile) result.profile = module.profile;
				module = result;
				onModule(module);
				moduleReady.call(this);
				return;
			}

			onModule(module);
			this.buildModule(module, false, null, null, (err) => {
				if (err) return errorAndCallback(err);
				if (this.profile) {
					const afterBuilding = Date.now();
					module.profile.building = afterBuilding - afterFactory;
				}
				moduleReady.call(this);
			});

			function moduleReady() {
				this.processModuleDependencies(module, (err) => {
					if (err) return callback(err);
					return callback(null, module);
				});
			}
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
			if (err) return callback(err);
			if (module) slot.module = module;
			else {
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
		if (module.variables.length || module.blocks.length)
			throw new Error("Cannot rebuild a complex module with variables or blocks");
		if (module.rebuilding) {
			return module.rebuilding.push(thisCallback);
		}
		const rebuilding = module.rebuilding = [thisCallback];

		function callback(err) {
			module.rebuilding = undefined;
			rebuilding.forEach(cb => cb(err));
		}
		const deps = module.dependencies.slice();
		this.buildModule(module, false, module, null, (err) => {
			if (err) return callback(err);
			this.processModuleDependencies(module, (err) => {
				if (err) return callback(err);
				deps.forEach(d => {
					if (d.module && d.module.removeReason(module, d)) {
						module.chunks.forEach(chunk => {
							if (!d.module.hasReasonForChunk(chunk)) {
								if (d.module.removeChunk(chunk)) {
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
		for (let i = 0; i < modules.length; i++) {
			this.reportDependencyErrorsAndWarnings(modules[i], [modules[i]]);
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

		while (self.applyPluginsBailResult1("optimize-modules-basic", self.modules) ||
			self.applyPluginsBailResult1("optimize-modules", self.modules) ||
			self.applyPluginsBailResult1("optimize-modules-advanced", self.modules));
		self.applyPlugins1("after-optimize-modules", self.modules);

		while (self.applyPluginsBailResult1("optimize-chunks-basic", self.chunks) ||
			self.applyPluginsBailResult1("optimize-chunks", self.chunks) ||
			self.applyPluginsBailResult1("optimize-chunks-advanced", self.chunks));
		self.applyPlugins1("after-optimize-chunks", self.chunks);

		self.applyPluginsAsyncSeries("optimize-tree", self.chunks, self.modules, function sealPart2(err) {
			if (err) return callback(err);
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
			if (shouldRecord) self.applyPlugins2("record-modules", self.modules, self.records);
			if (shouldRecord) self.applyPlugins2("record-chunks", self.chunks, self.records);
			self.applyPlugins0("before-hash");
			self.createHash();
			self.applyPlugins0("after-hash");
			if (shouldRecord) self.applyPlugins1("record-hash", self.records);
			self.applyPlugins0("before-module-assets");
			self.createModuleAssets();
			if (self.applyPluginsBailResult("should-generate-chunk-assets") !== false) {
				self.applyPlugins0("before-chunk-assets");
				self.createChunkAssets();
			}
			self.applyPlugins1("additional-chunk-assets", self.chunks);
			self.summarizeDependencies();
			if (shouldRecord) self.applyPlugins2("record", self, self.records);
			self.applyPluginsAsync("additional-assets", err => {
				if (err) return callback(err);
				self.applyPluginsAsync("optimize-chunk-assets", self.chunks, err => {
					if (err) return callback(err);
					self.applyPlugins1("after-optimize-chunk-assets", self.chunks);
					self.applyPluginsAsync("optimize-assets", self.assets, err => {
						if (err) return callback(err);
						self.applyPlugins1("after-optimize-assets", self.assets);
						if (self.applyPluginsBailResult("need-additional-seal")) {
							self.unseal();
							return self.seal(callback);
						}
						return self.applyPluginsAsync("after-seal", callback);
					});
				});
			});
		});
	}

	sortModules(modules) {
		modules.sort((a, b) => {
			if (a.index < b.index) return -1;
			if (a.index > b.index) return 1;
			return 0;
		});
	}

	reportDependencyErrorsAndWarnings(module, blocks) {
		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			const dependencies = block.dependencies;
			for (let j = 0; j < dependencies.length; j++) {
				const d = dependencies[j];
				const warnings = d.getWarnings();
				if (warnings) {
					for (let k = 0; k < warnings.length; k++) {
						const w = warnings[k];
						this.warnings.push(new ModuleDependencyWarning(module, w, d.loc));
					}
				}
				const errors = d.getErrors();
				if (errors) {
					for (let k = 0; k < errors.length; k++) {
						const e = errors[k];
						this.errors.push(new ModuleDependencyError(module, e, d.loc));
					}
				}
			}
			this.reportDependencyErrorsAndWarnings(module, block.blocks);
		}
	}

	addChunk(name, module, loc) {
		if (name) {
			if (Object.prototype.hasOwnProperty.call(this.namedChunks, name)) {
				const chunk = this.namedChunks[name];
				if (module) chunk.addOrigin(module, loc);
				return chunk;
			}
		}
		const chunk = new Chunk(name, module, loc);
		this.chunks.push(chunk);
		if (name) this.namedChunks[name] = chunk;
		return chunk;
	}

	assignIndex(module) {
		const queue = [() => assignIndexToModule(module)];
		const self = this;

		function assignIndexToModule(mod) {
			if (typeof mod.index !== "number") {
				mod.index = self.nextFreeModuleIndex++;
				queue.push(() => mod.index2 = self.nextFreeModuleIndex2++);
				assignIndexToDependencyBlock(mod);
			}
		}

		function assignIndexToDependency(dep) {
			if (dep.module) queue.push(() => assignIndexToModule(dep.module));
		}

		function assignIndexToDependencyBlock(block) {
			const allDeps = [];
			if (block.variables) iterationBlockVariable(block.variables, d => allDeps.push(d));
			if (block.dependencies) iterationOfArrayCallback(block.dependencies, d => allDeps.push(d));
			if (block.blocks) {
				const blocks = block.blocks;
				for (let i = blocks.length - 1; i >= 0; i--) {
					queue.push(() => assignIndexToDependencyBlock(blocks[i]));
				}
			}
			for (let i = allDeps.length - 1; i >= 0; i--) {
				queue.push(() => assignIndexToDependency(allDeps[i]));
			}
		}

		while (queue.length) queue.pop()();
	}

	assignDepth(module) {
		const queue = [() => assignDepthToModule(module, 0)];
		const self = this;

		function assignDepthToModule(mod, depth) {
			if (typeof mod.depth === "number" && mod.depth <= depth) return;
			mod.depth = depth;
			assignDepthToDependencyBlock(mod, depth + 1);
		}

		function assignDepthToDependency(dep, depth) {
			if (dep.module) queue.push(() => assignDepthToModule(dep.module, depth));
		}

		function assignDepthToDependencyBlock(block, depth) {
			if (block.variables) iterationBlockVariable(block.variables, d => assignDepthToDependency(d, depth));
			if (block.dependencies) iterationOfArrayCallback(block.dependencies, d => assignDepthToDependency(d, depth));
			if (block.blocks) iterationOfArrayCallback(block.blocks, b => assignDepthToDependencyBlock(b, depth));
		}

		while (queue.length) queue.pop()();
	}

	processDependenciesBlockForChunk(block, chunk) {
		const queue = [[block, chunk]];
		while (queue.length) {
			const [currentBlock, currentChunk] = queue.pop();
			const iteratorDependency = (d) => {
				if (!d.module || d.weak) return;
				if (currentChunk.addModule(d.module)) {
					d.module.addChunk(currentChunk);
					queue.push([d.module, currentChunk]);
				}
			};
			const iteratorBlock = (b) => {
				let c;
				if (!b.chunks) {
					c = this.addChunk(b.chunkName, b.module, b.loc);
					b.chunks = [c];
					c.addBlock(b);
				} else {
					c = b.chunks[0];
				}
				currentChunk.addChunk(c);
				c.addParent(currentChunk);
				queue.push([b, c]);
			};
			if (currentBlock.variables) iterationBlockVariable(currentBlock.variables, iteratorDependency);
			if (currentBlock.dependencies) iterationOfArrayCallback(currentBlock.dependencies, iteratorDependency);
			if (currentBlock.blocks) iterationOfArrayCallback(currentBlock.blocks, iteratorBlock);
		}
	}

	removeChunkFromDependencies(block, chunk) {
		const iteratorDependency = (d) => {
			if (!d.module) return;
			if (!d.module.hasReasonForChunk(chunk) && d.module.removeChunk(chunk)) {
				this.removeChunkFromDependencies(d.module, chunk);
			}
		};

		if (block.dependencies) iterationOfArrayCallback(block.dependencies, iteratorDependency);
		if (block.variables) iterationBlockVariable(block.variables, iteratorDependency);

		if (block.blocks) {
			for (let i = 0; i < block.blocks.length; i++) {
				const subBlock = block.blocks[i];
				if (subBlock.chunks) {
					for (let j = 0; j < subBlock.chunks.length; j++) {
						const subChunk = subBlock.chunks[j];
						chunk.removeChunk(subChunk);
						subChunk.removeParent(chunk);
						this.removeChunkFromDependencies(subChunk, subChunk);
					}
				}
				this.removeChunkFromDependencies(subBlock, chunk);
			}
		}
	}

	applyModuleIds() {
		const unusedIds = [];
		let nextFreeModuleId = 0;
		const usedIds = [];
		const usedIdMap = Object.create(null);
		if (this.usedModuleIds) {
			Object.keys(this.usedModuleIds).forEach(key => {
				const id = this.usedModuleIds[key];
				if (!usedIdMap[id]) {
					usedIds.push(id);
					usedIdMap[id] = true;
				}
			});
		}
		this.modules.forEach(m => {
			if (m.id && !usedIdMap[m.id]) {
				usedIds.push(m.id);
				usedIdMap[m.id] = true;
			}
		});
		if (usedIds.length > 0) {
			let usedIdMax = -1;
			usedIds.forEach(id => {
				if (typeof id === "number") usedIdMax = Math.max(usedIdMax, id);
			});
			let lengthFreeModules = nextFreeModuleId = usedIdMax + 1;
			while (lengthFreeModules--) {
				if (!usedIdMap[lengthFreeModules]) unusedIds.push(lengthFreeModules);
			}
		}
		this.modules.forEach(m => {
			if (m.id === null) {
				if (unusedIds.length > 0) m.id = unusedIds.pop();
				else m.id = nextFreeModuleId++;
			}
		});
	}

	applyChunkIds() {
		const unusedIds = [];
		let nextFreeChunkId = 0;

		const getNextFreeChunkId = (usedChunkIds) => {
			const keys = Object.keys(usedChunkIds);
			let max = -1;
			keys.forEach(k => {
				const v = usedChunkIds[k];
				if (typeof v === "number") max = Math.max(max, v);
			});
			return max;
		};

		if (this.usedChunkIds) {
			nextFreeChunkId = getNextFreeChunkId(this.usedChunkIds) + 1;
			for (let i = nextFreeChunkId; i--;) {
				if (this.usedChunkIds[i] !== i) unusedIds.push(i);
			}
		}
		this.chunks.forEach(chunk => {
			if (chunk.id === null) {
				if (unusedIds.length > 0) chunk.id = unusedIds.pop();
				else chunk.id = nextFreeChunkId++;
			}
			if (!chunk.ids) chunk.ids = [chunk.id];
		});
	}

	sortItemsWithModuleIds() {
		this.modules.sort(byId);
		this.modules.forEach(m => m.sortItems());
		this.chunks.forEach(c => c.sortItems());
	}

	sortItemsWithChunkIds() {
		this.chunks.sort(byId);
		this.modules.forEach(m => m.sortItems());
		this.chunks.forEach(c => c.sortItems());
	}

	summarizeDependencies() {
		const filterDups = (array) => {
			const result = [];
			for (let i = 0; i < array.length; i++) {
				if (i === 0 || array[i - 1] !== array[i]) result.push(array[i]);
			}
			return result;
		};
		this.fileDependencies = (this.compilationDependencies || []).slice();
		this.contextDependencies = [];
		this.missingDependencies = [];

		this.children.forEach(child => {
			this.fileDependencies = this.fileDependencies.concat(child.fileDependencies);
			this.contextDependencies = this.contextDependencies.concat(child.contextDependencies);
			this.missingDependencies = this.missingDependencies.concat(child.missingDependencies);
		});

		this.modules.forEach(module => {
			if (module.fileDependencies) {
				module.fileDependencies.forEach(fd => this.fileDependencies.push(fd));
			}
			if (module.contextDependencies) {
				module.contextDependencies.forEach(cd => this.contextDependencies.push(cd));
			}
		});

		this.errors.forEach(error => {
			if (Array.isArray(error.missing)) {
				error.missing.forEach(item => this.missingDependencies.push(item));
			}
		});

		this.fileDependencies.sort();
		this.fileDependencies = filterDups(this.fileDependencies);
		this.contextDependencies.sort();
		this.contextDependencies = filterDups(this.contextDependencies);
		this.missingDependencies.sort();
		this.missingDependencies = filterDups(this.missingDependencies);
	}

	createHash() {
		const outputOptions = this.outputOptions;
		const hashFunction = outputOptions.hashFunction;
		const hashDigest = outputOptions.hashDigest;
		const hashDigestLength = outputOptions.hashDigestLength;
		const hash = crypto.createHash(hashFunction);
		if (outputOptions.hashSalt) hash.update(outputOptions.hashSalt);
		this.mainTemplate.updateHash(hash);
		this.chunkTemplate.updateHash(hash);
		this.moduleTemplate.updateHash(hash);
		this.children.forEach(child => hash.update(child.hash));
		const chunks = this.chunks.slice();
		chunks.sort((a, b) => {
			const aEntry = a.hasRuntime();
			const bEntry = b.hasRuntime();
			if (aEntry && !bEntry) return 1;
			if (!aEntry && bEntry) return -1;
			return 0;
		});
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			const chunkHash = crypto.createHash(hashFunction);
			if (outputOptions.hashSalt) chunkHash.update(outputOptions.hashSalt);
			chunk.updateHash(chunkHash);
			if (chunk.hasRuntime()) this.mainTemplate.updateHashForChunk(chunkHash, chunk);
			else this.chunkTemplate.updateHashForChunk(chunkHash, chunk);
			this.applyPlugins2("chunk-hash", chunk, chunkHash);
			chunk.hash = chunkHash.digest(hashDigest);
			hash.update(chunk.hash);
			chunk.renderedHash = chunk.hash.substr(0, hashDigestLength);
		}
		this.fullHash = hash.digest(hashDigest);
		this.hash = this.fullHash.substr(0, hashDigestLength);
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
		this.modules.forEach(module => {
			if (module.assets) {
				Object.keys(module.assets).forEach(assetName => {
					const fileName = this.getPath(assetName);
					this.assets[fileName] = module.assets[assetName];
					this.applyPlugins2("module-asset", module, fileName);
				});
			}
		});
	}

	createChunkAssets() {
		const outputOptions = this.outputOptions;
		const filename = outputOptions.filename;
		const chunkFilename = outputOptions.chunkFilename;
		this.chunks.forEach(chunk => {
			chunk.files = [];
			const chunkHash = chunk.hash;
			const filenameTemplate = chunk.filenameTemplate ? chunk.filenameTemplate :
				chunk.isInitial() ? filename :
				chunkFilename;
			try {
				const useChunkHash = !chunk.hasRuntime() || (this.mainTemplate.useChunkHash && this.mainTemplate.useChunkHash(chunk));
				const usedHash = useChunkHash ? chunkHash : this.fullHash;
				const cacheName = "c" + chunk.id;
				let source;
				if (this.cache && this.cache[cacheName] && this.cache[cacheName].hash === usedHash) {
					source = this.cache[cacheName].source;
				} else {
					if (chunk.hasRuntime()) source = this.mainTemplate.render(this.hash, chunk, this.moduleTemplate, this.dependencyTemplates);
					else source = this.chunkTemplate.render(chunk, this.moduleTemplate, this.dependencyTemplates);
					if (this.cache) {
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
				if (this.assets[file]) throw new Error(`Conflict: Multiple assets emit to the same filename ${file}`);
				this.assets[file] = source;
				chunk.files.push(file);
				this.applyPlugins2("chunk-asset", chunk, file);
			} catch (err) {
				this.errors.push(new ChunkRenderError(chunk, file || filenameTemplate, err));
			}
		});
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
		this.modules.forEach(m => {
			if (usedIds[m.id]) throw new Error(`checkConstraints: duplicate module id ${m.id}`);
			usedIds[m.id] = true;
		});
		this.chunks.forEach((chunk, idx) => {
			if (this.chunks.indexOf(chunk) !== idx) throw new Error(`checkConstraints: duplicate chunk in compilation ${chunk.debugId}`);
			chunk.checkConstraints();
		});
	}
}

module.exports = Compilation