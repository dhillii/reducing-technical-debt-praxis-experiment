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

/**
 * Compilation class – core of webpack compilation.
 */
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

	/* --------------------------------------------------------------------- */
	/* Public API                                                            */
	/* --------------------------------------------------------------------- */

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
			const rebuild = this._shouldRebuildCacheModule(cacheModule);
			if (!rebuild) {
				this._reuseCacheModule(cacheModule);
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

		const onDone = err => {
			module.building = undefined;
			building.forEach(cb => cb(err));
		};

		module.build(this.options, this, this.resolvers.normal, this.inputFileSystem, error => {
			this._collectModuleIssues(module, origin, dependencies, optional);
			module.dependencies.sort(Dependency.compare);
			if (error) {
				this.applyPlugins2("failed-module", module, error);
				return onDone(error);
			}
			this.applyPlugins1("succeed-module", module);
			return onDone();
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
		if (factories instanceof Error) return callback(factories);
		asyncLib.forEach(
			factories,
			(item, cb) => this._processFactoryItem(item, module, bail, cacheGroup, recursive, start, cb),
			err => {
				// Prevent V8 memory leak (see original comment)
				this = null;
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

		if (!dependency || typeof dependency !== "object" || !dependency.constructor) {
			throw new Error("Parameter 'dependency' must be a Dependency");
		}
		const moduleFactory = this.dependencyFactories.get(dependency.constructor);
		if (!moduleFactory) {
			throw new Error(`No dependency factory available for this dependency type: ${dependency.constructor.name}`);
		}
		moduleFactory.create(
			{
				contextInfo: { issuer: "", compiler: this.compiler.name },
				context,
				dependencies: [dependency]
			},
			(err, module) => {
				if (err) return errorAndCallback(new EntryModuleNotFoundError(err));
				this._handleCreatedModule(module, start, onModule, callback, errorAndCallback);
			}
		);
	}

	addEntry(context, entry, name, callback) {
		const slot = { name, module: null };
		this.preparedChunks.push(slot);
		this._addModuleChain(
			context,
			entry,
			module => {
				entry.module = module;
				this.entries.push(module);
				module.issuer = null;
			},
			(err, module) => {
				if (err) return callback(err);
				if (module) slot.module = module;
				else {
					const idx = this.preparedChunks.indexOf(slot);
					this.preparedChunks.splice(idx, 1);
				}
				return callback(null, module);
			}
		);
	}

	prefetch(context, dependency, callback) {
		this._addModuleChain(
			context,
			dependency,
			module => {
				module.prefetched = true;
				module.issuer = null;
			},
			callback
		);
	}

	rebuildModule(module, thisCallback) {
		if (module.variables.length || module.blocks.length)
			throw new Error("Cannot rebuild a complex module with variables or blocks");
		if (module.rebuilding) return module.rebuilding.push(thisCallback);
		const rebuilding = (module.rebuilding = [thisCallback]);

		const done = err => {
			module.rebuilding = undefined;
			rebuilding.forEach(cb => cb(err));
		};

		const deps = module.dependencies.slice();
		this.buildModule(module, false, module, null, err => {
			if (err) return done(err);
			this.processModuleDependencies(module, err => {
				if (err) return done(err);
				this._cleanupRebuiltDependencies(module, deps);
				done();
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
		this.applyPlugins0("seal");
		this._resetIndices();
		this._prepareChunks();
		this.sortModules(this.modules);
		this.applyPlugins0("optimize");

		this._runOptimizePhases();
		this.applyPlugins1("after-optimize-modules", this.modules);
		this._runChunkOptimizePhases();
		this.applyPlugins1("after-optimize-chunks", this.chunks);

		this.applyPluginsAsyncSeries("optimize-tree", this.chunks, this.modules, err => {
			if (err) return callback(err);
			this._finalizeSeal(callback);
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
				this._pushWarningsAndErrors(module, d);
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
		const queue = [() => this._assignIndexToModule(module)];
		while (queue.length) queue.pop()();
	}

	assignDepth(module) {
		const queue = [() => this._assignDepthToModule(module, 0)];
		while (queue.length) queue.pop()();
	}

	processDependenciesBlockForChunk(block, chunk) {
		const queue = [[block, chunk]];
		while (queue.length) {
			const [curBlock, curChunk] = queue.pop();
			this._processBlockForChunk(curBlock, curChunk, queue);
		}
	}

	removeChunkFromDependencies(block, chunk) {
		this._removeChunkFromBlock(block, chunk);
	}

	applyModuleIds() {
		const { unusedIds, nextFreeModuleId, usedIds, usedIdMap } = this._collectUsedModuleIds();
		this._assignMissingModuleIds(unusedIds, nextFreeModuleId);
	}

	applyChunkIds() {
		const { unusedIds, nextFreeChunkId } = this._collectUsedChunkIds();
		this._assignMissingChunkIds(unusedIds, nextFreeChunkId);
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
		this._initDependencyCollections();
		this._collectChildDependencies();
		this._collectModuleDependencies();
		this._collectErrorMissingDependencies();
		this._finalizeDependencyCollections();
	}

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

	modifyHash(update) {
		const { hashFunction, hashDigest, hashDigestLength } = this.outputOptions;
		const hash = crypto.createHash(hashFunction);
		hash.update(this.fullHash);
		hash.update(update);
		this.fullHash = hash.digest(hashDigest);
		this.hash = this.fullHash.substr(0, hashDigestLength);
	}

	createModuleAssets() {
		for (let i = 0; i < this.modules.length; i++) {
			const module = this.modules[i];
			if (!module.assets) continue;
			Object.keys(module.assets).forEach(assetName => {
				const fileName = this.getPath(assetName);
				this.assets[fileName] = module.assets[assetName];
				this.applyPlugins2("module-asset", module, fileName);
			});
		}
	}

	createChunkAssets() {
		const { filename, chunkFilename, hashFunction, hashDigest, hashDigestLength, hashSalt } = this.outputOptions;
		for (let i = 0; i < this.chunks.length; i++) {
			const chunk = this.chunks[i];
			chunk.files = [];
			const chunkHash = chunk.hash;
			const filenameTemplate = chunk.filenameTemplate
				? chunk.filenameTemplate
				: chunk.isInitial()
				? filename
				: chunkFilename;
			try {
				const useChunkHash = !chunk.hasRuntime() || (this.mainTemplate.useChunkHash && this.mainTemplate.useChunkHash(chunk));
				const usedHash = useChunkHash ? chunkHash : this.fullHash;
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
		this.modules.forEach(m => {
			if (usedIds[m.id]) throw new Error(`checkConstraints: duplicate module id ${m.id}`);
			usedIds[m.id] = true;
		});
		this.chunks.forEach((c, idx) => {
			if (this.chunks.indexOf(c) !== idx) throw new Error(`checkConstraints: duplicate chunk in compilation ${c.debugId}`);
			c.checkConstraints();
		});
	}

	/* --------------------------------------------------------------------- */
	/* Private helpers – each kept small for low cognitive complexity        */
	/* --------------------------------------------------------------------- */

	_shouldRebuildCacheModule(cacheModule) {
		if (cacheModule.error || !cacheModule.cacheable || !this.fileTimestamps || !this.contextTimestamps) return true;
		return cacheModule.needRebuild(this.fileTimestamps, this.contextTimestamps);
	}

	_reuseCacheModule(cacheModule) {
		cacheModule.disconnect();
		this._modules[cacheModule.identifier()] = cacheModule;
		this.modules.push(cacheModule);
		cacheModule.errors.forEach(err => this.errors.push(err));
		cacheModule.warnings.forEach(war => this.warnings.push(war));
	}

	_collectModuleIssues(module, origin, dependencies, optional) {
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

	_collectFactories(dependencies) {
		const factories = [];
		for (let i = 0; i < dependencies.length; i++) {
			const factory = this.dependencyFactories.get(dependencies[i][0].constructor);
			if (!factory) {
				return new Error(`No module factory available for dependency type: ${dependencies[i][0].constructor.name}`);
			}
			factories[i] = [factory, dependencies[i]];
		}
		return factories;
	}

	_processFactoryItem(item, module, bail, cacheGroup, recursive, start, callback) {
		const [factory, deps] = item;
		const errorAndCallback = err => {
			err.origin = module;
			this.errors.push(err);
			if (bail) callback(err);
			else callback();
		};
		const warningAndCallback = err => {
			err.origin = module;
			this.warnings.push(err);
			callback();
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
				if (err) return this._handleFactoryError(err, deps, module, bail, errorAndCallback, warningAndCallback);
				if (!dependentModule) return process.nextTick(callback);
				if (this.profile) {
					if (!dependentModule.profile) dependentModule.profile = {};
					dependentModule.profile.factory = Date.now() - start;
				}
				dependentModule.issuer = module;
				const newModule = this.addModule(dependentModule, cacheGroup);
				if (!newModule) {
					this._handleCachedModule(dependentModule, deps, module, start, callback);
				} else if (newModule instanceof Module) {
					this._handleNewModuleInstance(newModule, dependentModule, deps, module, start, recursive, callback);
				} else {
					this._handleNonModuleResult(dependentModule, deps, module, start, recursive, callback, errorAndCallback);
				}
			}
		);
	}

	_handleFactoryError(err, deps, module, bail, errorAndCallback, warningAndCallback) {
		const isOptional = deps.filter(d => !d.optional).length === 0;
		if (isOptional) warningAndCallback(new ModuleNotFoundError(module, err, deps));
		else errorAndCallback(new ModuleNotFoundError(module, err, deps));
	}

	_handleCachedModule(cached, deps, parentModule, start, callback) {
		const module = this.getModule(cached);
		module.optional = module.optional || deps.every(d => d.optional);
		deps.forEach(dep => {
			dep.module = module;
			module.addReason(parentModule, dep);
		});
		if (this.profile) {
			if (!parentModule.profile) parentModule.profile = {};
			const time = Date.now() - start;
			if (!parentModule.profile.dependencies || time > parentModule.profile.dependencies) {
				parentModule.profile.dependencies = time;
			}
		}
		process.nextTick(callback);
	}

	_handleNewModuleInstance(newModule, dependentModule, deps, parentModule, start, recursive, callback) {
		if (this.profile) newModule.profile = dependentModule.profile;
		newModule.optional = deps.every(d => d.optional);
		newModule.issuer = dependentModule.issuer;
		deps.forEach(dep => {
			dep.module = newModule;
			newModule.addReason(parentModule, dep);
		});
		if (this.profile) {
			newModule.profile.building = Date.now() - (dependentModule.profile ? dependentModule.profile.factory : start);
		}
		if (recursive) {
			process.nextTick(this.processModuleDependencies.bind(this, newModule, callback));
		} else {
			process.nextTick(callback);
		}
	}

	_handleNonModuleResult(dependentModule, deps, parentModule, start, recursive, callback, errorAndCallback) {
		dependentModule.optional = deps.every(d => d.optional);
		deps.forEach(dep => {
			dep.module = dependentModule;
			dependentModule.addReason(parentModule, dep);
		});
		this.buildModule(dependentModule, deps.every(d => d.optional), parentModule, deps, err => {
			if (err) return errorAndCallback(err);
			if (this.profile) dependentModule.profile.building = Date.now() - (dependentModule.profile ? dependentModule.profile.factory : start);
			if (recursive) this.processModuleDependencies(dependentModule, callback);
			else callback();
		});
	}

	_handleCreatedModule(module, start, onModule, callback, errorAndCallback) {
		if (this.profile) {
			if (!module.profile) module.profile = {};
			module.profile.factory = Date.now() - start;
		}
		const result = this.addModule(module);
		if (!result) {
			module = this.getModule(module);
			onModule(module);
			if (this.profile) module.profile.building = Date.now() - module.profile.factory;
			return callback(null, module);
		}
		if (result instanceof Module) {
			if (this.profile) result.profile = module.profile;
			module = result;
			onModule(module);
			this._processModuleReady(module, callback);
			return;
		}
		onModule(module);
		this.buildModule(module, false, null, null, err => {
			if (err) return errorAndCallback(err);
			if (this.profile) module.profile.building = Date.now() - module.profile.factory;
			this._processModuleReady(module, callback);
		});
	}

	_processModuleReady(module, callback) {
		this.processModuleDependencies(module, err => {
			if (err) return callback(err);
			callback(null, module);
		});
	}

	_resetIndices() {
		this.nextFreeModuleIndex = 0;
		this.nextFreeModuleIndex2 = 0;
	}

	_prepareChunks() {
		this.preparedChunks.forEach(preparedChunk => {
			const { module, name } = preparedChunk;
			const chunk = this.addChunk(name, module);
			const entrypoint = (this.entrypoints[chunk.name] = new Entrypoint(chunk.name));
			entrypoint.unshiftChunk(chunk);
			chunk.addModule(module);
			module.addChunk(chunk);
			chunk.entryModule = module;
			this.assignIndex(module);
			this.assignDepth(module);
			this.processDependenciesBlockForChunk(module, chunk);
		});
	}

	_runOptimizePhases() {
		while (
			this.applyPluginsBailResult1("optimize-modules-basic", this.modules) ||
			this.applyPluginsBailResult1("optimize-modules", this.modules) ||
			this.applyPluginsBailResult1("optimize-modules-advanced", this.modules)
		) {
			/* empty */
		}
	}

	_runChunkOptimizePhases() {
		while (
			this.applyPluginsBailResult1("optimize-chunks-basic", this.chunks) ||
			this.applyPluginsBailResult1("optimize-chunks", this.chunks) ||
			this.applyPluginsBailResult1("optimize-chunks-advanced", this.chunks)
		) {
			/* empty */
		}
	}

	_finalizeSeal(callback) {
		this.applyPlugins1("after-optimize-modules", this.modules);
		this.applyPlugins1("after-optimize-chunks", this.chunks);
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

	_assignIndexToModule(module) {
		if (typeof module.index !== "number") {
			module.index = this.nextFreeModuleIndex++;
			module.index2 = this.nextFreeModuleIndex2++;
			this._assignIndexToDependencyBlock(module);
		}
	}

	_assignIndexToDependency(dependency) {
		if (dependency.module) this._assignIndexToModule(dependency.module);
	}

	_assignIndexToDependencyBlock(block) {
		const allDeps = [];
		if (block.variables) iterationBlockVariable(block.variables, d => allDeps.push(d));
		if (block.dependencies) iterationOfArrayCallback(block.dependencies, d => allDeps.push(d));
		if (block.blocks) {
			const blocks = block.blocks;
			for (let i = blocks.length - 1; i >= 0; i--) this._assignIndexToDependencyBlock(blocks[i]);
		}
		allDeps.forEach(d => this._assignIndexToDependency(d));
	}

	_assignDepthToModule(module, depth) {
		if (typeof module.depth === "number" && module.depth <= depth) return;
		module.depth = depth;
		this._assignDepthToDependencyBlock(module, depth + 1);
	}

	_assignDepthToDependency(dependency, depth) {
		if (dependency.module) this._assignDepthToModule(dependency.module, depth);
	}

	_assignDepthToDependencyBlock(block, depth) {
		if (block.variables) iterationBlockVariable(block.variables, d => this._assignDepthToDependency(d, depth));
		if (block.dependencies) iterationOfArrayCallback(block.dependencies, d => this._assignDepthToDependency(d, depth));
		if (block.blocks) iterationOfArrayCallback(block.blocks, b => this._assignDepthToDependencyBlock(b, depth));
	}

	_processBlockForChunk(block, chunk, queue) {
		const handleDependency = d => {
			if (!d.module || d.weak) return;
			if (chunk.addModule(d.module)) {
				d.module.addChunk(chunk);
				queue.push([d.module, chunk]);
			}
		};
		const handleSubBlock = b => {
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
		};
		if (block.variables) iterationBlockVariable(block.variables, handleDependency);
		if (block.dependencies) iterationOfArrayCallback(block.dependencies, handleDependency);
		if (block.blocks) iterationOfArrayCallback(block.blocks, handleSubBlock);
	}

	_removeChunkFromBlock(block, chunk) {
		const removeDep = d => {
			if (!d.module) return;
			if (!d.module.hasReasonForChunk(chunk)) {
				if (d.module.removeChunk(chunk)) this.removeChunkFromDependencies(d.module, chunk);
			}
		};
		if (block.dependencies) iterationOfArrayCallback(block.dependencies, removeDep);
		if (block.variables) iterationBlockVariable(block.variables, removeDep);
		if (block.blocks) {
			for (let i = 0; i < block.blocks.length; i++) {
				const sub = block.blocks[i];
				for (let j = 0; j < sub.chunks.length; j++) {
					const subChunk = sub.chunks[j];
					chunk.removeChunk(subChunk);
					subChunk.removeParent(chunk);
					this.removeChunkFromDependencies(subChunk, chunk);
				}
				this._removeChunkFromBlock(sub, chunk);
			}
		}
	}

	_collectUsedModuleIds() {
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
			let free = (nextFreeModuleId = max + 1);
			while (free--) {
				if (!usedIdMap[free]) unusedIds.push(free);
			}
		}
		return { unusedIds, nextFreeModuleId, usedIds, usedIdMap };
	}

	_assignMissingModuleIds(unusedIds, nextFreeModuleId) {
		this.modules.forEach(m => {
			if (m.id === null) {
				if (unusedIds.length) m.id = unusedIds.pop();
				else m.id = nextFreeModuleId++;
			}
		});
	}

	_collectUsedChunkIds() {
		const unusedIds = [];
		let nextFreeChunkId = 0;
		const getNextFreeChunkId = usedChunkIds => {
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
			for (let i = nextFreeChunkId; i--; ) {
				if (this.usedChunkIds[i] !== i) unusedIds.push(i);
			}
		}
		return { unusedIds, nextFreeChunkId };
	}

	_assignMissingChunkIds(unusedIds, nextFreeChunkId) {
		this.chunks.forEach(chunk => {
			if (chunk.id === null) {
				if (unusedIds.length) chunk.id = unusedIds.pop();
				else chunk.id = nextFreeChunkId++;
			}
			if (!chunk.ids) chunk.ids = [chunk.id];
		});
	}

	_initDependencyCollections() {
		this.fileDependencies = (this.compilationDependencies || []).slice();
		this.contextDependencies = [];
		this.missingDependencies = [];
	}

	_collectChildDependencies() {
		this.children.forEach(child => {
			this.fileDependencies = this.fileDependencies.concat(child.fileDependencies);
			this.contextDependencies = this.contextDependencies.concat(child.contextDependencies);
			this.missingDependencies = this.missingDependencies.concat(child.missingDependencies);
		});
	}

	_collectModuleDependencies() {
		this.modules.forEach(module => {
			if (module.fileDependencies) module.fileDependencies.forEach(f => this.fileDependencies.push(f));
			if (module.contextDependencies) module.contextDependencies.forEach(c => this.contextDependencies.push(c));
		});
	}

	_collectErrorMissingDependencies() {
		this.errors.forEach(error => {
			if (Array.isArray(error.missing)) error.missing.forEach(item => this.missingDependencies.push(item));
		});
	}

	_finalizeDependencyCollections() {
		const filterDups = arr => {
			const uniq = [];
			for (let i = 0; i < arr.length; i++) {
				if (i === 0 || arr[i - 1] !== arr[i]) uniq.push(arr[i]);
			}
			return uniq;
		};
		this.fileDependencies.sort();
		this.fileDependencies = filterDups(this.fileDependencies);
		this.contextDependencies.sort();
		this.contextDependencies = filterDups(this.contextDependencies);
		this.missingDependencies.sort();
		this.missingDependencies = filterDups(this.missingDependencies);
	}

	_pushWarningsAndErrors(module, dependency) {
		const warnings = dependency.getWarnings();
		if (warnings) {
			warnings.forEach(w => {
				this.warnings.push(new ModuleDependencyWarning(module, w, dependency.loc));
			});
		}
		const errors = dependency.getErrors();
		if (errors) {
			errors.forEach(e => {
				this.errors.push(new ModuleDependencyError(module, e, dependency.loc));
			});
		}
	}

	_sortedChunksForHash() {
		const chunks = this.chunks.slice();
		chunks.sort((a, b) => {
			const aEntry = a.hasRuntime();
			const bEntry = b.hasRuntime();
			if (aEntry && !bEntry) return 1;
			if (!aEntry && bEntry) return -1;
			return 0;
		});
		return chunks;
	}
}

module.exports = Compilation;