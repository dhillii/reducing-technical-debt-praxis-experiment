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

/* Helper to iterate over block variables */
function iterationBlockVariable(variables, fn) {
	for (let i = 0; i < variables.length; i++) {
		const deps = variables[i].dependencies;
		for (let j = 0; j < deps.length; j++) {
			fn(deps[j]);
		}
	}
}

/* Helper to iterate over generic arrays */
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

	/* Public API */
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
				cacheModule.errors.forEach(err => this.errors.push(err));
				cacheModule.warnings.forEach(war => this.warnings.push(war));
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
			if (optional) this.warnings.push(err);
			else this.errors.push(err);
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
					dependencies[i].push(dep);
					return;
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
		const factories = dependencies.map(depArr => {
			const factory = this.dependencyFactories.get(depArr[0].constructor);
			if (!factory) {
				throw new Error(`No module factory available for dependency type: ${depArr[0].constructor.name}`);
			}
			return [factory, depArr];
		});
		asyncLib.forEach(factories, (item, cb) => this._processFactory(item, module, bail, cacheGroup, recursive, start, cb), err => {
			if (err) return callback(err);
			return process.nextTick(callback);
		});
	}
	_processFactory(item, module, bail, cacheGroup, recursive, start, callback) {
		const [factory, dependencies] = item;
		const handleError = err => {
			err.origin = module;
			this.errors.push(err);
			if (bail) callback(err);
			else callback();
		};
		const handleWarning = err => {
			err.origin = module;
			this.warnings.push(err);
			callback();
		};
		const isOptional = () => dependencies.filter(d => !d.optional).length === 0;
		const errorOrWarning = err => (isOptional() ? handleWarning(err) : handleError(err));

		factory.create({
			contextInfo: {
				issuer: module.nameForCondition && module.nameForCondition(),
				compiler: this.compiler.name
			},
			context: module.context,
			dependencies
		}, (err, dependentModule) => {
			if (err) return errorOrWarning(new ModuleNotFoundError(module, err, dependencies));
			if (!dependentModule) return process.nextTick(callback);

			if (this.profile) {
				if (!dependentModule.profile) dependentModule.profile = {};
				dependentModule.profile.factory = Date.now() - start;
			}
			dependentModule.issuer = module;
			const added = this.addModule(dependentModule, cacheGroup);
			if (!added) {
				this._handleCachedModule(module, dependentModule, dependencies, isOptional, start, callback);
				return;
			}
			if (added instanceof Module) {
				this._handleNewModuleInstance(module, added, dependentModule, dependencies, isOptional, start, recursive, callback);
				return;
			}
			this._handleNonModuleInstance(module, dependentModule, dependencies, isOptional, start, recursive, callback);
		});
	}
	_handleCachedModule(parent, cached, dependencies, isOptional, start, callback) {
		cached = this.getModule(cached);
		if (cached.optional) cached.optional = isOptional();
		this._assignDependencies(dependencies, cached, parent);
		if (this.profile) {
			if (!parent.profile) parent.profile = {};
			const time = Date.now() - start;
			if (!parent.profile.dependencies || time > parent.profile.dependencies) {
				parent.profile.dependencies = time;
			}
		}
		process.nextTick(callback);
	}
	_handleNewModuleInstance(parent, newMod, original, dependencies, isOptional, start, recursive, callback) {
		if (this.profile) newMod.profile = original.profile;
		newMod.optional = isOptional();
		newMod.issuer = original.issuer;
		this._assignDependencies(dependencies, newMod, parent);
		if (this.profile) newMod.profile.building = Date.now() - start;
		if (recursive) {
			process.nextTick(() => this.processModuleDependencies(newMod, callback));
		} else {
			process.nextTick(callback);
		}
	}
	_handleNonModuleInstance(parent, mod, dependencies, isOptional, start, recursive, callback) {
		mod.optional = isOptional();
		this._assignDependencies(dependencies, mod, parent);
		this.buildModule(mod, isOptional(), parent, dependencies, err => {
			if (err) return this._errorOrWarning(err, parent, callback);
			if (this.profile) mod.profile.building = Date.now() - start;
			if (recursive) this.processModuleDependencies(mod, callback);
			else callback();
		});
	}
	_assignDependencies(dependencies, target, origin) {
		dependencies.forEach(depArr => {
			depArr.forEach(dep => {
				dep.module = target;
				target.addReason(origin, dep);
			});
		});
	}
	_errorOrWarning(err, module, callback) {
		if (module.optional) {
			this.warnings.push(err);
			callback();
		} else {
			this.errors.push(err);
			callback(err);
		}
	}
	_addModuleChain(context, dependency, onModule, callback) {
		const start = this.profile && Date.now();
		const errorHandler = this.bail
			? err => callback(err)
			: err => {
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
				if (!module.profile) module.profile = {};
				module.profile.factory = Date.now() - start;
			}
			const added = this.addModule(module);
			if (!added) {
				module = this.getModule(module);
				onModule(module);
				if (this.profile) module.profile.building = Date.now() - start;
				return callback(null, module);
			}
			if (added instanceof Module) {
				if (this.profile) added.profile = module.profile;
				module = added;
				onModule(module);
				return this._finalizeModule(module, callback);
			}
			onModule(module);
			this.buildModule(module, false, null, null, err => {
				if (err) return errorHandler(err);
				if (this.profile) module.profile.building = Date.now() - start;
				this._finalizeModule(module, callback);
			});
		});
	}
	_finalizeModule(module, callback) {
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
	finish() {
		const modules = this.modules;
		this.applyPlugins1("finish-modules", modules);
		modules.forEach(m => this.reportDependencyErrorsAndWarnings(m, [m]));
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
		this.applyPlugins0("seal");
		this.nextFreeModuleIndex = 0;
		this.nextFreeModuleIndex2 = 0;
		this._sealPrepareChunks();
		this.sortModules(this.modules);
		this.applyPlugins0("optimize");
		this._sealOptimizeModules();
		this._sealOptimizeChunks();
		this._sealAsyncTree(callback);
	}
	_sealPrepareChunks() {
		this.preparedChunks.forEach(preparedChunk => {
			const { module, name } = preparedChunk;
			const chunk = this.addChunk(name, module);
			const entrypoint = this.entrypoints[chunk.name] = new Entrypoint(chunk.name);
			entrypoint.unshiftChunk(chunk);
			chunk.addModule(module);
			module.addChunk(chunk);
			chunk.entryModule = module;
			this.assignIndex(module);
			this.assignDepth(module);
			this.processDependenciesBlockForChunk(module, chunk);
		});
	}
	_sealOptimizeModules() {
		while (
			this.applyPluginsBailResult1("optimize-modules-basic", this.modules) ||
			this.applyPluginsBailResult1("optimize-modules", this.modules) ||
			this.applyPluginsBailResult1("optimize-modules-advanced", this.modules)
		) { /* loop until no more optimizations */ }
		this.applyPlugins1("after-optimize-modules", this.modules);
	}
	_sealOptimizeChunks() {
		while (
			this.applyPluginsBailResult1("optimize-chunks-basic", this.chunks) ||
			this.applyPluginsBailResult1("optimize-chunks", this.chunks) ||
			this.applyPluginsBailResult1("optimize-chunks-advanced", this.chunks)
		) { /* loop until no more optimizations */ }
		this.applyPlugins1("after-optimize-chunks", this.chunks);
	}
	_sealAsyncTree(callback) {
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
	sortModules(modules) {
		modules.sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0));
	}
	reportDependencyErrorsAndWarnings(module, blocks) {
		blocks.forEach(block => {
			block.dependencies.forEach(d => {
				(d.getWarnings() || []).forEach(w => {
					this.warnings.push(new ModuleDependencyWarning(module, w, d.loc));
				});
				(d.getErrors() || []).forEach(e => {
					this.errors.push(new ModuleDependencyError(module, e, d.loc));
				});
			});
			this.reportDependencyErrorsAndWarnings(module, block.blocks);
		});
	}
	addChunk(name, module, loc) {
		if (name && this.namedChunks[name]) {
			const existing = this.namedChunks[name];
			if (module) existing.addOrigin(module, loc);
			return existing;
		}
		const chunk = new Chunk(name, module, loc);
		this.chunks.push(chunk);
		if (name) this.namedChunks[name] = chunk;
		return chunk;
	}
	/* Index assignment – split into small helpers */
	assignIndex(module) {
		const queue = [() => this._assignIndexToModule(module)];
		const enqueueDep = d => queue.push(() => this._assignIndexToDependency(d));
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
		if (dependency.module) this._assignIndexToModule(dependency.module);
	}
	_assignIndexToDependencyBlock(block) {
		const allDeps = [];
		const collectDep = d => allDeps.push(d);
		const recurseBlock = b => queue.push(() => this._assignIndexToDependencyBlock(b));
		if (block.variables) iterationBlockVariable(block.variables, collectDep);
		if (block.dependencies) iterationOfArrayCallback(block.dependencies, collectDep);
		if (block.blocks) block.blocks.forEach(b => recurseBlock(b));
		while (allDeps.length) this._assignIndexToDependency(allDeps.pop());
	}
	/* Depth assignment – split into small helpers */
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
		const walkDep = d => this._assignDepthToDependency(d, depth);
		const walkBlock = b => this._assignDepthToDependencyBlock(b, depth);
		if (block.variables) iterationBlockVariable(block.variables, walkDep);
		if (block.dependencies) iterationOfArrayCallback(block.dependencies, walkDep);
		if (block.blocks) iterationOfArrayCallback(block.blocks, walkBlock);
	}
	processDependenciesBlockForChunk(block, chunk) {
		const queue = [[block, chunk]];
		while (queue.length) {
			const [curBlock, curChunk] = queue.pop();
			const handleDep = d => {
				if (!d.module || d.weak) return;
				if (curChunk.addModule(d.module)) {
					d.module.addChunk(curChunk);
					queue.push([d.module, curChunk]);
				}
			};
			const handleBlock = b => {
				let childChunk;
				if (!b.chunks) {
					childChunk = this.addChunk(b.chunkName, b.module, b.loc);
					b.chunks = [childChunk];
					childChunk.addBlock(b);
				} else {
					childChunk = b.chunks[0];
				}
				curChunk.addChunk(childChunk);
				childChunk.addParent(curChunk);
				queue.push([b, childChunk]);
			};
			if (curBlock.variables) iterationBlockVariable(curBlock.variables, handleDep);
			if (curBlock.dependencies) iterationOfArrayCallback(curBlock.dependencies, handleDep);
			if (curBlock.blocks) iterationOfArrayCallback(curBlock.blocks, handleBlock);
		}
	}
	removeChunkFromDependencies(block, chunk) {
		const walkDep = d => {
			if (!d.module) return;
			if (!d.module.hasReasonForChunk(chunk) && d.module.removeChunk(chunk)) {
				this.removeChunkFromDependencies(d.module, chunk);
			}
		};
		if (block.blocks) {
			block.blocks.forEach(b => {
				b.chunks.forEach(c => {
					chunk.removeChunk(c);
					c.removeParent(chunk);
					this.removeChunkFromDependencies(c, c);
				});
			});
		}
		if (block.dependencies) iterationOfArrayCallback(block.dependencies, walkDep);
		if (block.variables) iterationBlockVariable(block.variables, walkDep);
	}
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
		const unusedIds = [];
		let nextFree = 0;
		if (usedIds.length) {
			const max = Math.max(...usedIds.filter(id => typeof id === "number"));
			nextFree = max + 1;
			for (let i = 0; i < nextFree; i++) if (!usedIdMap[i]) unusedIds.push(i);
		}
		this.modules.forEach(m => {
			if (m.id === null) {
				m.id = unusedIds.length ? unusedIds.pop() : nextFree++;
			}
		});
	}
	applyChunkIds() {
		const unused = [];
		let nextFree = 0;
		const getMax = used => {
			const keys = Object.keys(used);
			return Math.max(...keys.map(k => used[k]).filter(v => typeof v === "number"));
		};
		if (this.usedChunkIds) {
			nextFree = getMax(this.usedChunkIds) + 1;
			for (let i = 0; i < nextFree; i++) if (this.usedChunkIds[i] !== i) unused.push(i);
		}
		this.chunks.forEach(c => {
			if (c.id === null) {
				c.id = unused.length ? unused.pop() : nextFree++;
			}
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
		const uniq = arr => {
			const res = [];
			for (let i = 0; i < arr.length; i++) if (i === 0 || arr[i - 1] !== arr[i]) res.push(arr[i]);
			return res;
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
			if (Array.isArray(err.missing)) this.missingDependencies.push(...err.missing);
		});
		this.fileDependencies.sort();
		this.fileDependencies = uniq(this.fileDependencies);
		this.contextDependencies.sort();
		this.contextDependencies = uniq(this.contextDependencies);
		this.missingDependencies.sort();
		this.missingDependencies = uniq(this.missingDependencies);
	}
	createHash() {
		const { hashFunction, hashDigest, hashDigestLength, hashSalt } = this.outputOptions;
		const hash = crypto.createHash(hashFunction);
		if (hashSalt) hash.update(hashSalt);
		this.mainTemplate.updateHash(hash);
		this.chunkTemplate.updateHash(hash);
		this.moduleTemplate.updateHash(hash);
		this.children.forEach(child => hash.update(child.hash));
		const chunks = this.chunks.slice().sort((a, b) => {
			const aRun = a.hasRuntime();
			const bRun = b.hasRuntime();
			if (aRun && !bRun) return 1;
			if (!aRun && bRun) return -1;
			return 0;
		});
		chunks.forEach(chunk => {
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
	modifyHash(update) {
		const { hashFunction, hashDigest, hashDigestLength } = this.outputOptions;
		const hash = crypto.createHash(hashFunction);
		hash.update(this.fullHash);
		hash.update(update);
		this.fullHash = hash.digest(hashDigest);
		this.hash = this.fullHash.substr(0, hashDigestLength);
	}
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
		const { filename, chunkFilename, hashFunction, hashDigest, hashDigestLength, hashSalt } = this.outputOptions;
		this.chunks.forEach(chunk => {
			chunk.files = [];
			const filenameTemplate = chunk.filenameTemplate
				? chunk.filenameTemplate
				: chunk.isInitial()
					? filename
					: chunkFilename;
			try {
				const useChunkHash = !chunk.hasRuntime() || (this.mainTemplate.useChunkHash && this.mainTemplate.useChunkHash(chunk));
				const usedHash = useChunkHash ? chunk.hash : this.fullHash;
				const cacheName = "c" + chunk.id;
				let source;
				if (this.cache && this.cache[cacheName] && this.cache[cacheName].hash === usedHash) {
					source = this.cache[cacheName].source;
				} else {
					source = chunk.hasRuntime()
						? this.mainTemplate.render(this.hash, chunk, this.moduleTemplate, this.dependencyTemplates)
						: this.chunkTemplate.render(chunk, this.moduleTemplate, this.dependencyTemplates);
					if (this.cache) {
						this.cache[cacheName] = {
							hash: usedHash,
							source: source instanceof CachedSource ? source : new CachedSource(source)
						};
					}
				}
				const file = this.getPath(filenameTemplate, { noChunkHash: !useChunkHash, chunk });
				if (this.assets[file]) throw new Error(`Conflict: Multiple assets emit to the same filename ${file}`);
				this.assets[file] = source;
				chunk.files.push(file);
				this.applyPlugins2("chunk-asset", chunk, file);
			} catch (err) {
				this.errors.push(new ChunkRenderError(chunk, file || filenameTemplate, err));
			}
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
		const used = {};
		this.modules.forEach(m => {
			if (used[m.id]) throw new Error(`checkConstraints: duplicate module id ${m.id}`);
			used[m.id] = true;
		});
		this.chunks.forEach((c, i) => {
			if (this.chunks.indexOf(c) !== i) throw new Error(`checkConstraints: duplicate chunk in compilation ${c.debugId}`);
			c.checkConstraints();
		});
	}
}
module.exports = Compilation;