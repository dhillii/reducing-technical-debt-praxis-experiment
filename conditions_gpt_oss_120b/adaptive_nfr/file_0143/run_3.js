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

/* Helper utilities */
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
	for (let i = 0; i < arr.length; i++) fn(arr[i]);
}

/* Predicate helpers */
function hasFactory(compilation, dep) {
	return compilation.dependencyFactories.has(dep.constructor);
}
function isOptionalDependencies(dependencies) {
	return dependencies.filter(d => !d.optional).length === 0;
}
function isModuleInstance(obj) {
	return obj instanceof Module;
}
function shouldUseFactoryProfile(compilation) {
	return !!compilation.profile;
}
function shouldRecord(compilation) {
	return compilation.applyPluginsBailResult("should-record") !== false;
}

/**
 * @param {Compilation} compilation
 * @param {Dependency[]} dependencies
 * @returns {Error|null}
 */
function validateFactories(compilation, dependencies) {
	for (let i = 0; i < dependencies.length; i++) {
		if (!hasFactory(compilation, dependencies[i][0])) {
			return new Error(
				`No module factory available for dependency type: ${dependencies[i][0].constructor.name}`
			);
		}
	}
	return null;
}

/**
 * Handles error or warning propagation based on optionality.
 * @param {Compilation} compilation
 * @param {Module} module
 * @param {Dependency[][]} deps
 * @param {boolean} bail
 * @param {Error} err
 */
function propagateErrorOrWarning(compilation, module, deps, bail, err) {
	err.origin = module;
	if (isOptionalDependencies(deps)) {
		compilation.warnings.push(err);
		if (!bail) return;
	}
	compilation.errors.push(err);
	if (bail) compilation.applyPluginsBailResult1("error", err);
}

/**
 * Iterates over dependencies and assigns module/reason.
 * @param {Module} dependentModule
 * @param {Module} originModule
 * @param {Dependency[]} deps
 */
function assignReasons(dependentModule, originModule, deps) {
	for (let i = 0; i < deps.length; i++) {
		const dep = deps[i];
		dep.module = dependentModule;
		dependentModule.addReason(originModule, dep);
	}
}

/**
 * Updates profiling information if enabled.
 * @param {Compilation} compilation
 * @param {Object} target
 * @param {number} start
 * @param {number} afterFactory
 */
function updateProfile(compilation, target, start, afterFactory) {
	if (!shouldUseFactoryProfile(compilation)) return;
	if (!target.profile) target.profile = {};
	target.profile.factory = afterFactory - start;
}

/**
 * Handles a newly created module (cached, existing, or new).
 * @param {Compilation} compilation
 * @param {Module} module
 * @param {Dependency[][]} deps
 * @param {string|null} cacheGroup
 * @param {boolean} recursive
 * @param {Function} callback
 */
function handleNewModule(compilation, module, deps, cacheGroup, recursive, callback) {
	const newModule = compilation.addModule(module, cacheGroup);
	if (!newModule) {
		// from cache
		const cached = compilation.getModule(module);
		if (cached.optional) cached.optional = isOptionalDependencies(deps);
		assignReasons(cached, module, deps);
		return process.nextTick(callback);
	}
	if (isModuleInstance(newModule)) {
		newModule.optional = isOptionalDependencies(deps);
		newModule.issuer = module.issuer;
		assignReasons(newModule, module, deps);
		if (recursive) {
			return process.nextTick(compilation.processModuleDependencies.bind(compilation, newModule, callback));
		}
		return process.nextTick(callback);
	}
	// plain module
	module.optional = isOptionalDependencies(deps);
	assignReasons(module, module, deps);
	compilation.buildModule(
		module,
		isOptionalDependencies(deps),
		module,
		deps,
		err => {
			if (err) {
				propagateErrorOrWarning(compilation, module, deps, compilation.bail, err);
				return;
			}
			if (recursive) {
				compilation.processModuleDependencies(module, callback);
			} else {
				callback();
			}
		}
	);
}

/* Main class */
class Compilation extends Tapable {
	constructor(compiler) {
		super();
		this.compiler = compiler;
		this.resolvers = compiler.resolvers;
		this.inputFileSystem = compiler.inputFileSystem;

		const options = (this.options = compiler.options);
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
		if (this._modules[identifier]) return false;
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
			}
			module.lastId = cacheModule.id;
		}
		module.unbuild();
		this._modules[identifier] = module;
		if (this.cache) this.cache[cacheName] = module;
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
		if (module.building) return module.building.push(thisCallback);
		const building = (module.building = [thisCallback]);

		function callback(err) {
			module.building = undefined;
			building.forEach(cb => cb(err));
		}
		module.build(this.options, this, this.resolvers.normal, this.inputFileSystem, error => {
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
	/**
	 * Adds module dependencies with reduced nesting.
	 */
	addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
		const start = this.profile && Date.now();

		const factoryError = validateFactories(this, dependencies);
		if (factoryError) return callback(factoryError);

		const factories = dependencies.map(dep => [
			this.dependencyFactories.get(dep[0].constructor),
			dep
		]);

		asyncLib.forEach(
			factories,
			(item, done) => {
				const [factory, deps] = item;

				const errorAndCallback = err => {
					err.origin = module;
					this.errors.push(err);
					if (bail) done(err);
					else done();
				};
				const warningAndCallback = err => {
					err.origin = module;
					this.warnings.push(err);
					done();
				};

				factory.create(
					{
						contextInfo: {
							issuer: module.nameForCondition && module.nameForCondition(),
							compiler: this.compiler.name
						},
						context: module.context,
						dependencies: deps
					},
					(err, dependentModule) => {
						if (err) {
							const wrapped = new ModuleNotFoundError(module, err, deps);
							if (isOptionalDependencies(deps)) return warningAndCallback(wrapped);
							return errorAndCallback(wrapped);
						}
						if (!dependentModule) return process.nextTick(done);

						updateProfile(this, dependentModule, start, Date.now());

						dependentModule.issuer = module;
						handleNewModule(this, dependentModule, deps, cacheGroup, recursive, done);
					}
				);
			},
			err => {
				// cleanup reference to avoid V8 leak
				if (err) return callback(err);
				return process.nextTick(callback);
			}
		);
	}
	_addModuleChain(context, dependency, onModule, callback) {
		const start = this.profile && Date.now();

		const errorAndCallback = this.bail
			? err => callback(err)
			: err => {
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
		moduleFactory.create(
			{
				contextInfo: {
					issuer: "",
					compiler: this.compiler.name
				},
				context,
				dependencies: [dependency]
			},
			(err, module) => {
				if (err) return errorAndCallback(new EntryModuleNotFoundError(err));

				if (this.profile) {
					if (!module.profile) module.profile = {};
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
					if (this.profile) result.profile = module.profile;
					module = result;
					onModule(module);
					moduleReady.call(this);
					return;
				}
				onModule(module);
				this.buildModule(module, false, null, null, err => {
					if (err) return errorAndCallback(err);
					if (this.profile) module.profile.building = Date.now() - start;
					moduleReady.call(this);
				});
				function moduleReady() {
					this.processModuleDependencies(module, err => {
						if (err) return callback(err);
						callback(null, module);
					});
				}
			}
		);
	}
	addEntry(context, entry, name, callback) {
		const slot = { name, module: null };
		this.preparedChunks.push(slot);
		this._addModuleChain(context, entry, module => {
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
			callback(null, module);
		});
	}
	prefetch(context, dependency, callback) {
		this._addModuleChain(context, dependency, module => {
			module.prefetched = true;
			module.issuer = null;
		}, callback);
	}
	rebuildModule(module, thisCallback) {
		if (module.variables.length || module.blocks.length)
			throw new Error("Cannot rebuild a complex module with variables or blocks");
		if (module.rebuilding) return module.rebuilding.push(thisCallback);
		const rebuilding = (module.rebuilding = [thisCallback]);

		function callback(err) {
			module.rebuilding = undefined;
			rebuilding.forEach(cb => cb(err));
		}
		const deps = module.dependencies.slice();
		this.buildModule(module, false, module, null, err => {
			if (err) return callback(err);
			this.processModuleDependencies(module, err => {
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
		this.modules.forEach(m => m.unseal());
	}
	seal(callback) {
		const self = this;
		self.applyPlugins0("seal");
		self.nextFreeModuleIndex = 0;
		self.nextFreeModuleIndex2 = 0;
		self.preparedChunks.forEach(preparedChunk => {
			const module = preparedChunk.module;
			const chunk = self.addChunk(preparedChunk.name, module);
			const entrypoint = (self.entrypoints[chunk.name] = new Entrypoint(chunk.name));
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
		while (
			self.applyPluginsBailResult1("optimize-modules-basic", self.modules) ||
			self.applyPluginsBailResult1("optimize-modules", self.modules) ||
			self.applyPluginsBailResult1("optimize-modules-advanced", self.modules)
		);
		self.applyPlugins1("after-optimize-modules", self.modules);
		while (
			self.applyPluginsBailResult1("optimize-chunks-basic", self.chunks) ||
			self.applyPluginsBailResult1("optimize-chunks", self.chunks) ||
			self.applyPluginsBailResult1("optimize-chunks-advanced", self.chunks)
		);
		self.applyPlugins1("after-optimize-chunks", self.chunks);
		self.applyPluginsAsyncSeries("optimize-tree", self.chunks, self.modules, err => {
			if (err) return callback(err);
			self.applyPlugins2("after-optimize-tree", self.chunks, self.modules);
			const shouldRecordFlag = shouldRecord(self);
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
			if (shouldRecordFlag) self.applyPlugins2("record-modules", self.modules, self.records);
			if (shouldRecordFlag) self.applyPlugins2("record-chunks", self.chunks, self.records);
			self.applyPlugins0("before-hash");
			self.createHash();
			self.applyPlugins0("after-hash");
			if (shouldRecordFlag) self.applyPlugins1("record-hash", self.records);
			self.applyPlugins0("before-module-assets");
			self.createModuleAssets();
			if (self.applyPluginsBailResult("should-generate-chunk-assets") !== false) {
				self.applyPlugins0("before-chunk-assets");
				self.createChunkAssets();
			}
			self.applyPlugins1("additional-chunk-assets", self.chunks);
			self.summarizeDependencies();
			if (shouldRecordFlag) self.applyPlugins2("record", self, self.records);
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
						self.applyPluginsAsync("after-seal", callback);
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
		if (name && Object.prototype.hasOwnProperty.call(this.namedChunks, name)) {
			const chunk = this.namedChunks[name];
			if (module) chunk.addOrigin(module, loc);
			return chunk;
		}
		const chunk = new Chunk(name, module, loc);
		this.chunks.push(chunk);
		if (name) this.namedChunks[name] = chunk;
		return chunk;
	}
	assignIndex(module) {
		const _this = this;
		const queue = [() => assignIndexToModule(module)];
		const iteratorAllDependencies = d => queue.push(() => assignIndexToDependency(d));

		function assignIndexToModule(m) {
			if (typeof m.index !== "number") {
				m.index = _this.nextFreeModuleIndex++;
				queue.push(() => (m.index2 = _this.nextFreeModuleIndex2++));
				assignIndexToDependencyBlock(m);
			}
		}
		function assignIndexToDependency(dep) {
			if (dep.module) queue.push(() => assignIndexToModule(dep.module));
		}
		function assignIndexToDependencyBlock(block) {
			const all = [];
			if (block.variables) iterationBlockVariable(block.variables, d => all.push(d));
			if (block.dependencies) iterationOfArrayCallback(block.dependencies, d => all.push(d));
			if (block.blocks) {
				const blocks = block.blocks;
				for (let i = blocks.length - 1; i >= 0; i--) queue.push(() => assignIndexToDependencyBlock(blocks[i]));
			}
			for (let i = all.length - 1; i >= 0; i--) iteratorAllDependencies(all[i]);
		}
		while (queue.length) queue.pop()();
	}
	assignDepth(module) {
		const queue = [() => assignDepthToModule(module, 0)];
		function assignDepthToModule(m, depth) {
			if (typeof m.depth === "number" && m.depth <= depth) return;
			m.depth = depth;
			assignDepthToDependencyBlock(m, depth + 1);
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
			const [curBlock, curChunk] = queue.pop();
			if (curBlock.variables) iterationBlockVariable(curBlock.variables, d => {
				if (!d.module || d.weak) return;
				if (curChunk.addModule(d.module)) {
					d.module.addChunk(curChunk);
					queue.push([d.module, curChunk]);
				}
			});
			if (curBlock.dependencies) iterationOfArrayCallback(curBlock.dependencies, d => {
				if (!d.module || d.weak) return;
				if (curChunk.addModule(d.module)) {
					d.module.addChunk(curChunk);
					queue.push([d.module, curChunk]);
				}
			});
			if (curBlock.blocks) iterationOfArrayCallback(curBlock.blocks, b => {
				let c;
				if (!b.chunks) {
					c = this.addChunk(b.chunkName, b.module, b.loc);
					b.chunks = [c];
					c.addBlock(b);
				} else {
					c = b.chunks[0];
				}
				curChunk.addChunk(c);
				c.addParent(curChunk);
				queue.push([b, c]);
			});
		}
	}
	removeChunkFromDependencies(block, chunk) {
		const iteratorDependency = d => {
			if (!d.module) return;
			if (!d.module.hasReasonForChunk(chunk)) {
				if (d.module.removeChunk(chunk)) this.removeChunkFromDependencies(d.module, chunk);
			}
		};
		if (block.blocks) {
			for (let i = 0; i < block.blocks.length; i++) {
				const subBlocks = block.blocks[i].chunks;
				for (let j = 0; j < subBlocks.length; j++) {
					const blockChunk = subBlocks[j];
					chunk.removeChunk(blockChunk);
					blockChunk.removeParent(chunk);
					this.removeChunkFromDependencies(subBlocks, blockChunk);
				}
			}
		}
		if (block.dependencies) iterationOfArrayCallback(block.dependencies, iteratorDependency);
		if (block.variables) iterationBlockVariable(block.variables, iteratorDependency);
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
		if (usedIds.length) {
			let max = -1;
			usedIds.forEach(id => {
				if (typeof id === "number") max = Math.max(max, id);
			});
			let length = (nextFreeModuleId = max + 1);
			while (length--) if (!usedIdMap[length]) unusedIds.push(length);
		}
		this.modules.forEach(m => {
			if (m.id === null) {
				m.id = unusedIds.length ? unusedIds.pop() : nextFreeModuleId++;
			}
		});
	}
	applyChunkIds() {
		const unusedIds = [];
		let nextFreeChunkId = 0;
		const usedChunkIds = this.usedChunkIds || {};
		const max = Object.keys(usedChunkIds).reduce((prev, key) => {
			const val = usedChunkIds[key];
			return typeof val === "number" ? Math.max(prev, val) : prev;
		}, -1);
		nextFreeChunkId = max + 1;
		for (let i = nextFreeChunkId; i--; ) {
			if (usedChunkIds[i] !== i) unusedIds.push(i);
		}
		this.chunks.forEach(c => {
			if (c.id === null) c.id = unusedIds.length ? unusedIds.pop() : nextFreeChunkId++;
			if (!c.ids) c.ids = [c.id];
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
		const filterDups = arr => {
			const uniq = [];
			for (let i = 0; i < arr.length; i++) if (i === 0 || arr[i - 1] !== arr[i]) uniq.push(arr[i]);
			return uniq;
		};
		this.fileDependencies = (this.compilationDependencies || []).slice();
		this.contextDependencies = [];
		this.missingDependencies = [];
		this.children.forEach(child => {
			this.fileDependencies = this.fileDependencies.concat(child.fileDependencies);
			this.contextDependencies = this.contextDependencies.concat(child.contextDependencies);
			this.missingDependencies = this.missingDependencies.concat(child.missingDependencies);
		});
		this.modules.forEach(m => {
			if (m.fileDependencies) this.fileDependencies.push(...m.fileDependencies);
			if (m.contextDependencies) this.contextDependencies.push(...m.contextDependencies);
		});
		this.errors.forEach(err => {
			if (Array.isArray(err.missing)) err.missing.forEach(item => this.missingDependencies.push(item));
		});
		this.fileDependencies.sort();
		this.fileDependencies = filterDups(this.fileDependencies);
		this.contextDependencies.sort();
		this.contextDependencies = filterDups(this.contextDependencies);
		this.missingDependencies.sort();
		this.missingDependencies = filterDups(this.missingDependencies);
	}
	createHash() {
		const { hashFunction, hashDigest, hashDigestLength, hashSalt } = this.outputOptions;
		const hash = crypto.createHash(hashFunction);
		if (hashSalt) hash.update(hashSalt);
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
			if (hashSalt) chunkHash.update(hashSalt);
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
		const { hashFunction, hashDigest, hashDigestLength } = this.outputOptions;
		const hash = crypto.createHash(hashFunction);
		hash.update(this.fullHash);
		hash.update(update);
		this.fullHash = hash.digest(hashDigest);
		this.hash = this.fullHash.substr(0, hashDigestLength);
	}
	createModuleAssets() {
		this.modules.forEach(m => {
			if (m.assets) {
				Object.keys(m.assets).forEach(name => {
					const fileName = this.getPath(name);
					this.assets[fileName] = m.assets[name];
					this.applyPlugins2("module-asset", m, fileName);
				});
			}
		});
	}
	createChunkAssets() {
		const { filename, chunkFilename, hashFunction, hashDigest, hashDigestLength, hashSalt } = this.outputOptions;
		this.chunks.forEach(chunk => {
			chunk.files = [];
			const useChunkHash = !chunk.hasRuntime() || (this.mainTemplate.useChunkHash && this.mainTemplate.useChunkHash(chunk));
			const usedHash = useChunkHash ? chunk.hash : this.fullHash;
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
						source: (source = source instanceof CachedSource ? source : new CachedSource(source))
					};
				}
			}
			const filenameTemplate = chunk.filenameTemplate
				? chunk.filenameTemplate
				: chunk.isInitial()
				? filename
				: chunkFilename;
			const file = this.getPath(filenameTemplate, { noChunkHash: !useChunkHash, chunk });
			if (this.assets[file]) throw new Error(`Conflict: Multiple assets emit to the same filename ${file}`);
			this.assets[file] = source;
			chunk.files.push(file);
			this.applyPlugins2("chunk-asset", chunk, file);
		});
	}
	getPath(filename, data = {}) {
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
module.exports = Compilation;