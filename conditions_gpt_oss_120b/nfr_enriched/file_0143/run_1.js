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
		const deps = variables[i].dependencies;
		for (let j = 0; j < deps.length; j++) {
			fn(deps[j]);
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
			}
			module.lastId = cacheModule.id;
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

	/* ---------- Build & Dependency Processing ---------- */

	buildModule(module, optional, origin, dependencies, thisCallback) {
		this.applyPlugins1("build-module", module);
		if (module.building) return module.building.push(thisCallback);
		const building = module.building = [thisCallback];

		const done = err => {
			module.building = undefined;
			building.forEach(cb => cb(err));
		};

		module.build(this.options, this, this.resolvers.normal, this.inputFileSystem, error => {
			this._collectModuleErrors(module, origin, dependencies, optional);
			module.dependencies.sort(Dependency.compare);
			if (error) {
				this.applyPlugins2("failed-module", module, error);
				return done(error);
			}
			this.applyPlugins1("succeed-module", module);
			return done();
		});
	}

	_collectModuleErrors(module, origin, dependencies, optional) {
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
		const addDependency = dep => {
			for (let i = 0; i < dependencies.length; i++) {
				if (dep.isEqualResource(dependencies[i][0])) {
					return dependencies[i].push(dep);
				}
			}
			dependencies.push([dep]);
		};
		const walkBlock = block => {
			if (block.dependencies) iterationOfArrayCallback(block.dependencies, addDependency);
			if (block.blocks) iterationOfArrayCallback(block.blocks, walkBlock);
			if (block.variables) iterationBlockVariable(block.variables, addDependency);
		};
		walkBlock(module);
		this.addModuleDependencies(module, dependencies, this.bail, null, true, callback);
	}

	addModuleDependencies(module, dependencies, bail, cacheGroup, recursive, callback) {
		const start = this.profile && Date.now();
		const factories = this._collectFactories(dependencies);
		if (!factories) return callback(new Error("Factory collection failed"));
		asyncLib.forEach(factories, (item, cb) => this._processFactoryItem(item, module, bail, cacheGroup, recursive, start, cb), err => {
			this._finalizeAddModuleDependencies(err, callback);
		});
	}

	_collectFactories(dependencies) {
		const factories = [];
		for (let i = 0; i < dependencies.length; i++) {
			const factory = this.dependencyFactories.get(dependencies[i][0].constructor);
			if (!factory) return null;
			factories[i] = [factory, dependencies[i]];
		}
		return factories;
	}

	_processFactoryItem(item, module, bail, cacheGroup, recursive, start, callback) {
		const [factory, deps] = item;
		const errorAndCallback = err => {
			err.origin = module;
			this.errors.push(err);
			bail ? callback(err) : callback();
		};
		const warningAndCallback = err => {
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
			dependencies: deps
		}, (err, dependentModule) => {
			if (err) return this._handleFactoryError(err, module, deps, errorAndCallback, warningAndCallback);
			if (!dependentModule) return process.nextTick(callback);
			if (this.profile) {
				dependentModule.profile = dependentModule.profile || {};
				dependentModule.profile.factory = Date.now() - start;
			}
			dependentModule.issuer = module;
			const newModule = this.addModule(dependentModule, cacheGroup);
			if (!newModule) {
				this._handleCachedModule(dependentModule, module, deps, recursive, start, callback);
			} else if (newModule instanceof Module) {
				this._handleNewModuleInstance(newModule, dependentModule, module, deps, recursive, start, callback);
			} else {
				this._buildNonModuleInstance(newModule, module, deps, recursive, start, callback);
			}
		});
	}

	_handleFactoryError(err, module, deps, errorCb, warningCb) {
		const isOptional = deps.filter(d => !d.optional).length === 0;
		(isOptional ? warningCb : errorCb)(new ModuleNotFoundError(module, err, deps));
	}

	_handleCachedModule(cached, parent, deps, recursive, start, callback) {
		const module = this.getModule(cached);
		if (module.optional) module.optional = deps.filter(d => !d.optional).length === 0;
		this._assignDependencies(deps, module, parent);
		if (this.profile) this._updateParentProfile(parent, start);
		process.nextTick(callback);
	}

	_handleNewModuleInstance(newMod, dependent, parent, deps, recursive, start, callback) {
		if (this.profile) newMod.profile = dependent.profile;
		newMod.optional = deps.filter(d => !d.optional).length === 0;
		newMod.issuer = dependent.issuer;
		this._assignDependencies(deps, newMod, parent);
		if (this.profile) {
			const afterBuilding = Date.now();
			parent.profile.building = afterBuilding - (dependent.profile ? dependent.profile.factory : start);
		}
		if (recursive) {
			process.nextTick(() => this.processModuleDependencies(newMod, callback));
		} else {
			process.nextTick(callback);
		}
	}

	_buildNonModuleInstance(module, parent, deps, recursive, start, callback) {
		module.optional = deps.filter(d => !d.optional).length === 0;
		this._assignDependencies(deps, module, parent);
		this.buildModule(module, module.optional, parent, deps, err => {
			if (err) return this._handleFactoryError(err, parent, deps, () => callback(err), () => callback());
			if (this.profile) {
				const afterBuilding = Date.now();
				module.profile = module.profile || {};
				module.profile.building = afterBuilding - (module.profile ? module.profile.factory : start);
			}
			if (recursive) this.processModuleDependencies(module, callback);
			else callback();
		});
	}

	_assignDependencies(deps, target, origin) {
		deps.forEach(dep => {
			dep.module = target;
			target.addReason(origin, dep);
		});
	}

	_updateParentProfile(parent, start) {
		if (!parent.profile) parent.profile = {};
		const time = Date.now() - start;
		if (!parent.profile.dependencies || time > parent.profile.dependencies) {
			parent.profile.dependencies = time;
		}
	}

	_finalizeAddModuleDependencies(err, callback) {
		// break reference cycle for V8 memory leak
		// eslint-disable-next-line no-self-assign
		this = null;
		if (err) return callback(err);
		process.nextTick(callback);
	}

	/* ---------- Entry handling ---------- */

	_addModuleChain(context, dependency, onModule, callback) {
		const start = this.profile && Date.now();
		const errorHandler = this.bail ? err => callback(err) : err => {
			err.dependencies = [dependency];
			this.errors.push(err);
			callback();
		};

		if (!dependency || typeof dependency !== "object" || !dependency.constructor) {
			throw new Error("Parameter 'dependency' must be a Dependency");
		}
		const factory = this.dependencyFactories.get(dependency.constructor);
		if (!factory) {
			throw new Error(`No dependency factory available for this dependency type: ${dependency.constructor.name}`);
		}
		factory.create({
			contextInfo: { issuer: "", compiler: this.compiler.name },
			context,
			dependencies: [dependency]
		}, (err, module) => {
			if (err) return errorHandler(new EntryModuleNotFoundError(err));
			if (this.profile) {
				module.profile = module.profile || {};
				module.profile.factory = Date.now() - start;
			}
			const added = this.addModule(module);
			if (!added) {
				module = this.getModule(module);
				onModule(module);
				if (this.profile) module.profile.building = Date.now() - (module.profile.factory || start);
				return callback(null, module);
			}
			if (added instanceof Module) {
				if (this.profile) added.profile = module.profile;
				module = added;
				onModule(module);
				return this._finalizeModuleChain(module, callback);
			}
			onModule(module);
			this.buildModule(module, false, null, null, err => {
				if (err) return errorHandler(err);
				if (this.profile) module.profile.building = Date.now() - (module.profile.factory || start);
				this._finalizeModuleChain(module, callback);
			});
		});
	}

	_finalizeModuleChain(module, callback) {
		this.processModuleDependencies(module, err => {
			if (err) return callback(err);
			callback(null, module);
		});
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

	/* ---------- Rebuild ---------- */

	rebuildModule(module, thisCallback) {
		if (module.variables.length || module.blocks.length) {
			throw new Error("Cannot rebuild a complex module with variables or blocks");
		}
		if (module.rebuilding) return module.rebuilding.push(thisCallback);
		const rebuilding = module.rebuilding = [thisCallback];
		const done = err => {
			module.rebuilding = undefined;
			rebuilding.forEach(cb => cb(err));
		};
		const deps = module.dependencies.slice();
		this.buildModule(module, false, module, null, err => {
			if (err) return done(err);
			this.processModuleDependencies(module, err => {
				if (err) return done(err);
				deps.forEach(d => {
					if (d.module && d.module.removeReason(module, d)) {
						module.chunks.forEach(chunk => {
							if (!d.module.hasReasonForChunk(chunk) && d.module.removeChunk(chunk)) {
								this.removeChunkFromDependencies(d.module, chunk);
							}
						});
					}
				});
				done();
			});
		});
	}

	/* ---------- Finish ---------- */

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

	/* ---------- Seal ---------- */

	seal(callback) {
		this.applyPlugins0("seal");
		this._resetIndices();
		this._processPreparedChunks();
		this.sortModules(this.modules);
		this.applyPlugins0("optimize");
		this._runOptimizeModules();
		this.applyPlugins1("after-optimize-modules", this.modules);
		this._runOptimizeChunks();
		this.applyPlugins1("after-optimize-chunks", this.chunks);
		this._runAsyncOptimizeTree(callback);
	}

	_resetIndices() {
		this.nextFreeModuleIndex = 0;
		this.nextFreeModuleIndex2 = 0;
	}

	_processPreparedChunks() {
		this.preparedChunks.forEach(prepared => {
			const chunk = this.addChunk(prepared.name, prepared.module);
			const entrypoint = this.entrypoints[chunk.name] = new Entrypoint(chunk.name);
			entrypoint.unshiftChunk(chunk);
			chunk.addModule(prepared.module);
			prepared.module.addChunk(chunk);
			chunk.entryModule = prepared.module;
			this.assignIndex(prepared.module);
			this.assignDepth(prepared.module);
			this.processDependenciesBlockForChunk(prepared.module, chunk);
		});
	}

	_runOptimizeModules() {
		while (
			this.applyPluginsBailResult1("optimize-modules-basic", this.modules) ||
			this.applyPluginsBailResult1("optimize-modules", this.modules) ||
			this.applyPluginsBailResult1("optimize-modules-advanced", this.modules)
		) { /* loop */ }
	}

	_runOptimizeChunks() {
		while (
			this.applyPluginsBailResult1("optimize-chunks-basic", this.chunks) ||
			this.applyPluginsBailResult1("optimize-chunks", this.chunks) ||
			this.applyPluginsBailResult1("optimize-chunks-advanced", this.chunks)
		) { /* loop */ }
	}

	_runAsyncOptimizeTree(callback) {
		this.applyPluginsAsyncSeries("optimize-tree", this.chunks, this.modules, err => {
			if (err) return callback(err);
			this.applyPlugins2("after-optimize-tree", this.chunks, this.modules);
			const shouldRecord = this.applyPluginsBailResult("should-record") !== false;
			this.applyPlugins2("revive-modules", this.modules, this.records);
			this.applyPlugins1("optimize-module-order", this.modules);
			this.applyPlugins1("advanced-optimize-module-order", this.modules);
			this.applyPlugins1("before-module-ids", this.modules);
			this.applyPlugins1("module-ids", this.modules);
			this.applyModuleIds();
			this.applyPlugins1("optimize-module-ids", this.modules);
			this.applyPlugins1("after-optimize-module-ids", this.modules);
			this.sortItemsWithModuleIds();
			this.applyPlugins2("revive-chunks", this.chunks, this.records);
			this.applyPlugins1("optimize-chunk-order", this.chunks);
			this.applyPlugins1("before-chunk-ids", this.chunks);
			this.applyChunkIds();
			this.applyPlugins1("optimize-chunk-ids", this.chunks);
			this.applyPlugins1("after-optimize-chunk-ids", this.chunks);
			this.sortItemsWithChunkIds();
			if (shouldRecord) this.applyPlugins2("record-modules", this.modules, this.records);
			if (shouldRecord) this.applyPlugins2("record-chunks", this.chunks, this.records);
			this.applyPlugins0("before-hash");
			this.createHash();
			this.applyPlugins0("after-hash");
			if (shouldRecord) this.applyPlugins1("record-hash", this.records);
			this.applyPlugins0("before-module-assets");
			this.createModuleAssets();
			if (this.applyPluginsBailResult("should-generate-chunk-assets") !== false) {
				this.applyPlugins0("before-chunk-assets");
				this.createChunkAssets();
			}
			this.applyPlugins1("additional-chunk-assets", this.chunks);
			this.summarizeDependencies();
			if (shouldRecord) this.applyPlugins2("record", this, this.records);
			this.applyPluginsAsync("additional-assets", err => {
				if (err) return callback(err);
				this.applyPluginsAsync("optimize-chunk-assets", this.chunks, err => {
					if (err) return callback(err);
					this.applyPlugins1("after-optimize-chunk-assets", this.chunks);
					this.applyPluginsAsync("optimize-assets", this.assets, err => {
						if (err) return callback(err);
						this.applyPlugins1("after-optimize-assets", this.assets);
						if (this.applyPluginsBailResult("need-additional-seal")) {
							this.unseal();
							return this.seal(callback);
						}
						this.applyPluginsAsync("after-seal", callback);
					});
				});
			});
		});
	}

	/* ---------- Sorting ---------- */

	sortModules(modules) {
		modules.sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0));
	}

	/* ---------- Dependency Reporting ---------- */

	reportDependencyErrorsAndWarnings(module, blocks) {
		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			const deps = block.dependencies;
			for (let j = 0; j < deps.length; j++) {
				const d = deps[j];
				this._pushWarnings(module, d);
				this._pushErrors(module, d);
			}
			this.reportDependencyErrorsAndWarnings(module, block.blocks);
		}
	}

	_pushWarnings(module, dep) {
		const warnings = dep.getWarnings();
		if (!warnings) return;
		for (let i = 0; i < warnings.length; i++) {
			this.warnings.push(new ModuleDependencyWarning(module, warnings[i], dep.loc));
		}
	}

	_pushErrors(module, dep) {
		const errors = dep.getErrors();
		if (!errors) return;
		for (let i = 0; i < errors.length; i++) {
			this.errors.push(new ModuleDependencyError(module, errors[i], dep.loc));
		}
	}

	/* ---------- Chunk handling ---------- */

	addChunk(name, module, loc) {
		if (name && Object.prototype.hasOwnProperty.call(this.namedChunks, name)) {
			const existing = this.namedChunks[name];
			if (module) existing.addOrigin(module, loc);
			return existing;
		}
		const chunk = new Chunk(name, module, loc);
		this.chunks.push(chunk);
		if (name) this.namedChunks[name] = chunk;
		return chunk;
	}

	/* ---------- Index & Depth Assignment ---------- */

	assignIndex(module) {
		const queue = [() => this._assignIndexToModule(module)];
		while (queue.length) queue.pop()();
	}

	_assignIndexToModule(module) {
		if (typeof module.index !== "number") {
			module.index = this.nextFreeModuleIndex++;
			queue.push(() => (module.index2 = this.nextFreeModuleIndex2++));
			this._assignIndexToDependencyBlock(module);
		}
	}

	_assignIndexToDependency(dependency) {
		if (dependency.module) queue.push(() => this._assignIndexToModule(dependency.module));
	}

	_assignIndexToDependencyBlock(block) {
		const all = [];
		const collect = d => all.push(d);
		const recurse = b => queue.push(() => this._assignIndexToDependencyBlock(b));
		if (block.variables) iterationBlockVariable(block.variables, collect);
		if (block.dependencies) iterationOfArrayCallback(block.dependencies, collect);
		if (block.blocks) {
			const blocks = block.blocks;
			for (let i = blocks.length - 1; i >= 0; i--) recurse(blocks[i]);
		}
		while (all.length) this._assignIndexToDependency(all.pop());
	}

	assignDepth(module) {
		const queue = [() => this._assignDepthToModule(module, 0)];
		while (queue.length) queue.pop()();
	}

	_assignDepthToModule(module, depth) {
		if (typeof module.depth === "number" && module.depth <= depth) return;
		module.depth = depth;
		this._assignDepthToDependencyBlock(module, depth + 1);
	}

	_assignDepthToDependency(dependency, depth) {
		if (dependency.module) queue.push(() => this._assignDepthToModule(dependency.module, depth));
	}

	_assignDepthToDependencyBlock(block, depth) {
		const depIter = d => this._assignDepthToDependency(d, depth);
		const blockIter = b => this._assignDepthToDependencyBlock(b, depth);
		if (block.variables) iterationBlockVariable(block.variables, depIter);
		if (block.dependencies) iterationOfArrayCallback(block.dependencies, depIter);
		if (block.blocks) iterationOfArrayCallback(block.blocks, blockIter);
	}

	/* ---------- Chunk‑dependency processing ---------- */

	processDependenciesBlockForChunk(block, chunk) {
		const queue = [[block, chunk]];
		while (queue.length) {
			const [curBlock, curChunk] = queue.pop();
			this._processBlockVariables(curBlock, curChunk, queue);
			this._processBlockDependencies(curBlock, curChunk, queue);
			this._processNestedBlocks(curBlock, curChunk, queue);
		}
	}

	_processBlockVariables(block, chunk, queue) {
		if (!block.variables) return;
		iterationBlockVariable(block.variables, dep => {
			if (!dep.module || dep.weak) return;
			if (chunk.addModule(dep.module)) {
				dep.module.addChunk(chunk);
				queue.push([dep.module, chunk]);
			}
		});
	}

	_processBlockDependencies(block, chunk, queue) {
		if (!block.dependencies) return;
		iterationOfArrayCallback(block.dependencies, dep => {
			if (!dep.module || dep.weak) return;
			if (chunk.addModule(dep.module)) {
				dep.module.addChunk(chunk);
				queue.push([dep.module, chunk]);
			}
		});
	}

	_processNestedBlocks(block, chunk, queue) {
		if (!block.blocks) return;
		iterationOfArrayCallback(block.blocks, b => {
			let c;
			if (!b.chunks) {
				c = this.addChunk(b.chunkName, b.module, b.loc);
				b.chunks = [c];
				c.addBlock(b);
			} else {
				c = b.chunks[0];
			}
			chunk.addChunk(c);
			c.addParent(chunk);
			queue.push([b, c]);
		});
	}

	/* ---------- Chunk removal ---------- */

	removeChunkFromDependencies(block, chunk) {
		if (block.blocks) {
			block.blocks.forEach(b => {
				if (b.chunks) {
					b.chunks.forEach(c => {
						chunk.removeChunk(c);
						c.removeParent(chunk);
						this.removeChunkFromDependencies(c, chunk);
					});
				}
			});
		}
		if (block.dependencies) iterationOfArrayCallback(block.dependencies, d => this._removeChunkFromDep(d, chunk));
		if (block.variables) iterationBlockVariable(block.variables, d => this._removeChunkFromDep(d, chunk));
	}

	_removeChunkFromDep(dep, chunk) {
		if (!dep.module) return;
		if (!dep.module.hasReasonForChunk(chunk)) {
			if (dep.module.removeChunk(chunk)) this.removeChunkFromDependencies(dep.module, chunk);
		}
	}

	/* ---------- ID Assignment ---------- */

	applyModuleIds() {
		const usedIdMap = Object.create(null);
		const usedIds = [];
		if (this.usedModuleIds) {
			Object.keys(this.usedModuleIds).forEach(k => {
				const id = this.usedModuleIds[k];
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
		const unused = this._calculateUnusedIds(usedIds);
		this.modules.forEach(m => {
			if (m.id === null) {
				m.id = unused.length ? unused.pop() : this._nextFreeModuleId(usedIds);
			}
		});
	}

	_calculateUnusedIds(usedIds) {
		if (!usedIds.length) return [];
		const max = Math.max(...usedIds.filter(id => typeof id === "number"));
		const unused = [];
		for (let i = 0; i <= max; i++) {
			if (!usedIds.includes(i)) unused.push(i);
		}
		return unused;
	}

	_nextFreeModuleId(usedIds) {
		let next = Math.max(...usedIds.filter(id => typeof id === "number")) + 1;
		while (usedIds.includes(next)) next++;
		return next;
	}

	applyChunkIds() {
		const unused = [];
		let next = 0;
		if (this.usedChunkIds) {
			next = this._maxUsedChunkId(this.usedChunkIds) + 1;
			for (let i = 0; i < next; i++) {
				if (this.usedChunkIds[i] !== i) unused.push(i);
			}
		}
		this.chunks.forEach(c => {
			if (c.id === null) {
				c.id = unused.length ? unused.pop() : next++;
			}
			if (!c.ids) c.ids = [c.id];
		});
	}

	_maxUsedChunkId(map) {
		return Math.max(...Object.values(map).filter(v => typeof v === "number"));
	}

	/* ---------- Sorting with IDs ---------- */

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

	/* ---------- Dependency summarization ---------- */

	summarizeDependencies() {
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
			if (Array.isArray(err.missing)) this.missingDependencies.push(...err.missing);
		});

		this._dedupeAndSort();
	}

	_dedupeAndSort() {
		const dedupe = arr => {
			const res = [];
			for (let i = 0; i < arr.length; i++) {
				if (i === 0 || arr[i - 1] !== arr[i]) res.push(arr[i]);
			}
			return res;
		};
		this.fileDependencies.sort();
		this.fileDependencies = dedupe(this.fileDependencies);
		this.contextDependencies.sort();
		this.contextDependencies = dedupe(this.contextDependencies);
		this.missingDependencies.sort();
		this.missingDependencies = dedupe(this.missingDependencies);
	}

	/* ---------- Hash creation ---------- */

	createHash() {
		const { hashFunction, hashDigest, hashDigestLength, hashSalt } = this.outputOptions;
		const hash = crypto.createHash(hashFunction);
		if (hashSalt) hash.update(hashSalt);
		this.mainTemplate.updateHash(hash);
		this.chunkTemplate.updateHash(hash);
		this.moduleTemplate.updateHash(hash);
		this.children.forEach(child => hash.update(child.hash));

		const sortedChunks = this._sortedChunksForHash();
		sortedChunks.forEach(chunk => {
			const chunkHash = crypto.createHash(hashFunction);
			if (hashSalt) chunkHash.update(hashSalt);
			chunk.updateHash(chunkHash);
			if (chunk.hasRuntime()) this.mainTemplate.updateHashForChunk(chunkHash, chunk);
			else this.chunkTemplate.updateHashForChunk(chunkHash, chunk);
			this.applyPlugins2("chunk-hash", chunk, chunkHash);
			chunk.hash = chunkHash.digest(hashDigest);
			hash.update(chunk.hash);
			chunk.renderedHash = chunk.hash.substr(0, hashDigestLength);
		});

		this.fullHash = hash.digest(hashDigest);
		this.hash = this.fullHash.substr(0, hashDigestLength);
	}

	_sortedChunksForHash() {
		const copy = this.chunks.slice();
		copy.sort((a, b) => {
			const aRuntime = a.hasRuntime();
			const bRuntime = b.hasRuntime();
			if (aRuntime && !bRuntime) return 1;
			if (!aRuntime && bRuntime) return -1;
			return 0;
		});
		return copy;
	}

	/* ---------- Hash modification ---------- */

	modifyHash(update) {
		const { hashFunction, hashDigest, hashDigestLength } = this.outputOptions;
		const hash = crypto.createHash(hashFunction);
		hash.update(this.fullHash);
		hash.update(update);
		this.fullHash = hash.digest(hashDigest);
		this.hash = this.fullHash.substr(0, hashDigestLength);
	}

	/* ---------- Asset creation ---------- */

	createModuleAssets() {
		this.modules.forEach(module => {
			if (!module.assets) return;
			Object.keys(module.assets).forEach(name => {
				const fileName = this.getPath(name);
				this.assets[fileName] = module.assets[name];
				this.applyPlugins2("module-asset", module, fileName);
			});
		});
	}

	createChunkAssets() {
		const { filename, chunkFilename } = this.outputOptions;
		this.chunks.forEach(chunk => {
			chunk.files = [];
			const useChunkHash = !chunk.hasRuntime() || (this.mainTemplate.useChunkHash && this.mainTemplate.useChunkHash(chunk));
			const usedHash = useChunkHash ? chunk.hash : this.fullHash;
			const cacheName = "c" + chunk.id;
			const source = this._getChunkSource(chunk, usedHash, cacheName);
			const file = this._emitChunkFile(chunk, source, filename, chunkFilename, useChunkHash);
			chunk.files.push(file);
			this.applyPlugins2("chunk-asset", chunk, file);
		});
	}

	_getChunkSource(chunk, usedHash, cacheName) {
		if (this.cache && this.cache[cacheName] && this.cache[cacheName].hash === usedHash) {
			return this.cache[cacheName].source;
		}
		const source = chunk.hasRuntime()
			? this.mainTemplate.render(this.hash, chunk, this.moduleTemplate, this.dependencyTemplates)
			: this.chunkTemplate.render(chunk, this.moduleTemplate, this.dependencyTemplates);
		if (this.cache) {
			this.cache[cacheName] = {
				hash: usedHash,
				source: source instanceof CachedSource ? source : new CachedSource(source)
			};
		}
		return this.cache[cacheName].source;
	}

	_emitChunkFile(chunk, source, filename, chunkFilename, useChunkHash) {
		const template = chunk.filenameTemplate
			? chunk.filenameTemplate
			: chunk.isInitial() ? filename : chunkFilename;
		const file = this.getPath(template, { noChunkHash: !useChunkHash, chunk });
		if (this.assets[file]) throw new Error(`Conflict: Multiple assets emit to the same filename ${file}`);
		this.assets[file] = source;
		return file;
	}

	/* ---------- Path handling ---------- */

	getPath(filename, data) {
		data = data || {};
		data.hash = data.hash || this.hash;
		return this.mainTemplate.applyPluginsWaterfall("asset-path", filename, data);
	}

	/* ---------- Child compiler ---------- */

	createChildCompiler(name, outputOptions) {
		return this.compiler.createChildCompiler(this, name, outputOptions);
	}

	/* ---------- Constraints ---------- */

	checkConstraints() {
		const usedIds = {};
		this.modules.forEach(m => {
			if (usedIds[m.id]) throw new Error(`checkConstraints: duplicate module id ${m.id}`);
			usedIds[m.id] = true;
		});
		this.chunks.forEach((c, i) => {
			if (this.chunks.indexOf(c) !== i) throw new Error(`checkConstraints: duplicate chunk in compilation ${c.debugId}`);
			c.checkConstraints();
		});
	}
}

module.exports = Compilation;