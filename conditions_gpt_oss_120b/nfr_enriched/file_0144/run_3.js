/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {

	// HMR state
	let hotApplyOnUpdate = true;
	let hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	const hotCurrentModuleData = {};
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	const hotCurrentParents = []; // eslint-disable-line no-unused-vars
	const hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	/**
	 * Creates a require function that tracks HMR relationships.
	 */
	function hotCreateRequire(moduleId) { // eslint-disable-line no-unused-vars
		const me = installedModules[moduleId];
		if (!me) return $require$;

		const fn = function(request) {
			if (me.hot.active) {
				if (installedModules[request]) {
					if (installedModules[request].parents.indexOf(moduleId) < 0) {
						installedModules[request].parents.push(moduleId);
					}
				} else {
					hotCurrentParents.splice(0, hotCurrentParents.length, moduleId);
					hotCurrentChildModule = request;
				}
				if (me.children.indexOf(request) < 0) me.children.push(request);
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents.length = 0;
			}
			return $require$(request);
		};

		const ObjectFactory = name => ({
			configurable: true,
			enumerable: true,
			get() {
				return $require$[name];
			},
			set(value) {
				$require$[name] = value;
			}
		});

		for (const name in $require$) {
			if (Object.prototype.hasOwnProperty.call($require$, name) && name !== "e") {
				Object.defineProperty(fn, name, ObjectFactory(name));
			}
		}

		fn.e = function(chunkId) {
			if (hotStatus === "ready") hotSetStatus("prepare");
			hotChunksLoading++;
			return $require$.e(chunkId).then(finishChunkLoading, err => {
				finishChunkLoading();
				throw err;
			});

			function finishChunkLoading() {
				hotChunksLoading--;
				if (hotStatus === "prepare") {
					if (!hotWaitingFilesMap[chunkId]) hotEnsureUpdateChunk(chunkId);
					if (hotChunksLoading === 0 && hotWaitingFiles === 0) hotUpdateDownloaded();
				}
			}
		};

		return fn;
	}

	/**
	 * Creates a hot module object for a given module id.
	 */
	function hotCreateModule(moduleId) { // eslint-disable-line no-unused-vars
		const hot = {
			// private stuff
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: hotCurrentChildModule !== moduleId,

			// Module API
			active: true,
			accept(dep, callback) {
				if (typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if (typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if (Array.isArray(dep)) {
					for (const d of dep) hot._acceptedDependencies[d] = callback || (() => {});
				} else {
					hot._acceptedDependencies[dep] = callback || (() => {});
				}
			},
			decline(dep) {
				if (typeof dep === "undefined") {
					hot._selfDeclined = true;
				} else if (Array.isArray(dep)) {
					for (const d of dep) hot._declinedDependencies[d] = true;
				} else {
					hot._declinedDependencies[dep] = true;
				}
			},
			dispose(callback) {
				hot._disposeHandlers.push(callback);
			},
			addDisposeHandler(callback) {
				hot._disposeHandlers.push(callback);
			},
			removeDisposeHandler(callback) {
				const idx = hot._disposeHandlers.indexOf(callback);
				if (idx >= 0) hot._disposeHandlers.splice(idx, 1);
			},

			// Management API
			check: hotCheck,
			apply: hotApply,
			status(l) {
				if (!l) return hotStatus;
				hotStatusHandlers.push(l);
			},
			addStatusHandler(l) {
				hotStatusHandlers.push(l);
			},
			removeStatusHandler(l) {
				const idx = hotStatusHandlers.indexOf(l);
				if (idx >= 0) hotStatusHandlers.splice(idx, 1);
			},

			// inherit from previous dispose call
			data: hotCurrentModuleData[moduleId]
		};
		hotCurrentChildModule = undefined;
		return hot;
	}

	// Status handling
	const hotStatusHandlers = [];
	let hotStatus = "idle";

	function hotSetStatus(newStatus) {
		hotStatus = newStatus;
		for (const handler of hotStatusHandlers) handler.call(null, newStatus);
	}

	// Download state
	let hotWaitingFiles = 0;
	let hotChunksLoading = 0;
	const hotWaitingFilesMap = {};
	const hotRequestedFilesMap = {};
	const hotAvailableFilesMap = {};
	let hotDeferred;

	// Update info
	let hotUpdate;
	let hotUpdateNewHash;

	function toModuleId(id) {
		return (+id) + "" === id ? +id : id;
	}

	/**
	 * Initiates a check for updates.
	 */
	function hotCheck(apply) {
		if (hotStatus !== "idle") throw new Error("check() is only allowed in idle status");
		hotApplyOnUpdate = apply;
		hotSetStatus("check");
		return hotDownloadManifest().then(update => {
			if (!update) {
				hotSetStatus("idle");
				return null;
			}
			hotRequestedFilesMap = {};
			hotWaitingFilesMap = {};
			hotAvailableFilesMap = update.c;
			hotUpdateNewHash = update.h;

			hotSetStatus("prepare");
			const promise = new Promise((resolve, reject) => {
				hotDeferred = { resolve, reject };
			});
			hotUpdate = {};

			/*foreachInstalledChunks*/
			{ // eslint-disable-line no-lone-blocks
				/*globals chunkId */
				hotEnsureUpdateChunk(chunkId);
			}
			if (hotStatus === "prepare" && hotChunksLoading === 0 && hotWaitingFiles === 0) {
				hotUpdateDownloaded();
			}
			return promise;
		});
	}

	/**
	 * Handles a newly downloaded update chunk.
	 */
	function hotAddUpdateChunk(chunkId, moreModules) { // eslint-disable-line no-unused-vars
		if (!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId]) return;
		hotRequestedFilesMap[chunkId] = false;
		for (const moduleId in moreModules) {
			if (Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
				hotUpdate[moduleId] = moreModules[moduleId];
			}
		}
		if (--hotWaitingFiles === 0 && hotChunksLoading === 0) hotUpdateDownloaded();
	}

	/**
	 * Ensures a chunk is requested for update.
	 */
	function hotEnsureUpdateChunk(chunkId) {
		if (!hotAvailableFilesMap[chunkId]) {
			hotWaitingFilesMap[chunkId] = true;
		} else {
			hotRequestedFilesMap[chunkId] = true;
			hotWaitingFiles++;
			hotDownloadUpdateChunk(chunkId);
		}
	}

	/**
	 * Called when all update chunks have been downloaded.
	 */
	function hotUpdateDownloaded() {
		hotSetStatus("ready");
		const deferred = hotDeferred;
		hotDeferred = null;
		if (!deferred) return;
		if (hotApplyOnUpdate) {
			hotApply(hotApplyOnUpdate).then(deferred.resolve, deferred.reject);
		} else {
			const outdatedModules = [];
			for (const id in hotUpdate) {
				if (Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
					outdatedModules.push(toModuleId(id));
				}
			}
			deferred.resolve(outdatedModules);
		}
	}

	/**
	 * Determines affected modules for a given update.
	 */
	function getAffectedStuff(updateModuleId) {
		const outdatedModules = [updateModuleId];
		const outdatedDependencies = {};

		const queue = outdatedModules.map(id => ({ chain: [id], id }));
		while (queue.length) {
			const { id: moduleId, chain } = queue.pop();
			const module = installedModules[moduleId];
			if (!module || module.hot._selfAccepted) continue;

			if (module.hot._selfDeclined) {
				return { type: "self-declined", chain, moduleId };
			}
			if (module.hot._main) {
				return { type: "unaccepted", chain, moduleId };
			}
			for (const parentId of module.parents) {
				const parent = installedModules[parentId];
				if (!parent) continue;
				if (parent.hot._declinedDependencies[moduleId]) {
					return {
						type: "declined",
						chain: chain.concat(parentId),
						moduleId,
						parentId
					};
				}
				if (outdatedModules.includes(parentId)) continue;
				if (parent.hot._acceptedDependencies[moduleId]) {
					if (!outdatedDependencies[parentId]) outdatedDependencies[parentId] = [];
					addAllToSet(outdatedDependencies[parentId], [moduleId]);
				} else {
					delete outdatedDependencies[parentId];
					outdatedModules.push(parentId);
					queue.push({ chain: chain.concat(parentId), id: parentId });
				}
			}
		}
		return {
			type: "accepted",
			moduleId: updateModuleId,
			outdatedModules,
			outdatedDependencies
		};
	}

	/**
	 * Adds all items from source array to target array if not already present.
	 */
	function addAllToSet(target, source) {
		for (const item of source) {
			if (!target.includes(item)) target.push(item);
		}
	}

	/**
	 * Processes a single update result and returns flags for further actions.
	 */
	function processResult(result, options, moduleId) {
		const flags = {
			abortError: null,
			doApply: false,
			doDispose: false,
			chainInfo: result.chain ? "\nUpdate propagation: " + result.chain.join(" -> ") : ""
		};

		switch (result.type) {
			case "self-declined":
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) flags.abortError = new Error("Aborted because of self decline: " + result.moduleId + flags.chainInfo);
				break;
			case "declined":
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) flags.abortError = new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + flags.chainInfo);
				break;
			case "unaccepted":
				if (options.onUnaccepted) options.onUnaccepted(result);
				if (!options.ignoreUnaccepted) flags.abortError = new Error("Aborted because " + moduleId + " is not accepted" + flags.chainInfo);
				break;
			case "accepted":
				if (options.onAccepted) options.onAccepted(result);
				flags.doApply = true;
				break;
			case "disposed":
				if (options.onDisposed) options.onDisposed(result);
				flags.doDispose = true;
				break;
			default:
				throw new Error("Unexpected type " + result.type);
		}
		return flags;
	}

	/**
	 * Applies updates based on processed results.
	 */
	function applyUpdates(result, moduleId, appliedUpdate, outdatedModules, outdatedDependencies) {
		addAllToSet(outdatedModules, result.outdatedModules);
		for (const depModuleId in result.outdatedDependencies) {
			if (Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depModuleId)) {
				if (!outdatedDependencies[depModuleId]) outdatedDependencies[depModuleId] = [];
				addAllToSet(outdatedDependencies[depModuleId], result.outdatedDependencies[depModuleId]);
			}
		}
		appliedUpdate[moduleId] = hotUpdate[moduleId];
	}

	/**
	 * Marks a module for disposal.
	 */
	function markForDispose(result, moduleId, appliedUpdate, outdatedModules) {
		addAllToSet(outdatedModules, [result.moduleId]);
		appliedUpdate[moduleId] = warnUnexpectedRequire;
	}

	/**
	 * Warns about unexpected require after disposal.
	 */
	const warnUnexpectedRequire = () => {
		console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
	};

	/**
	 * Disposes outdated modules.
	 */
	function disposeModules(outdatedModules) {
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(chunkId => {
			if (hotAvailableFilesMap[chunkId] === false) hotDisposeChunk(chunkId);
		});

		for (const moduleId of outdatedModules) {
			const module = installedModules[moduleId];
			if (!module) continue;

			const data = {};
			for (const handler of module.hot._disposeHandlers) handler(data);
			hotCurrentModuleData[moduleId] = data;

			module.hot.active = false;
			delete installedModules[moduleId];

			for (const childId of module.children) {
				const child = installedModules[childId];
				if (!child) continue;
				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) child.parents.splice(idx, 1);
			}
		}
	}

	/**
	 * Removes outdated dependencies from module children.
	 */
	function cleanOutdatedDependencies(outdatedDependencies) {
		for (const moduleId in outdatedDependencies) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;
			const module = installedModules[moduleId];
			if (!module) continue;
			const deps = outdatedDependencies[moduleId];
			for (const dep of deps) {
				const idx = module.children.indexOf(dep);
				if (idx >= 0) module.children.splice(idx, 1);
			}
		}
	}

	/**
	 * Calls accept handlers for outdated dependencies.
	 */
	function invokeAcceptHandlers(outdatedDependencies, options) {
		let error = null;
		for (const moduleId in outdatedDependencies) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;
			const module = installedModules[moduleId];
			const deps = outdatedDependencies[moduleId];
			const callbacks = [];

			for (const dep of deps) {
				const cb = module.hot._acceptedDependencies[dep];
				if (!callbacks.includes(cb)) callbacks.push(cb);
			}
			for (const cb of callbacks) {
				try {
					cb(deps);
				} catch (err) {
					if (options.onErrored) {
						options.onErrored({
							type: "accept-errored",
							moduleId,
							dependencyId: deps[callbacks.indexOf(cb)],
							error: err
						});
					}
					if (!options.ignoreErrored && !error) error = err;
				}
			}
		}
		return error;
	}

	/**
	 * Loads modules that self‑accepted during the update.
	 */
	function loadSelfAcceptedModules(selfAccepted, options) {
		let error = null;
		for (const { module: moduleId, errorHandler } of selfAccepted) {
			hotCurrentParents.splice(0, hotCurrentParents.length, moduleId);
			try {
				$require$(moduleId);
			} catch (err) {
				if (typeof errorHandler === "function") {
					try {
						errorHandler(err);
					} catch (err2) {
						if (options.onErrored) {
							options.onErrored({
								type: "self-accept-error-handler-errored",
								moduleId,
								error: err2,
								orginalError: err
							});
						}
						if (!options.ignoreErrored && !error) error = err2;
						if (!error) error = err;
					}
				} else {
					if (options.onErrored) {
						options.onErrored({
							type: "self-accept-errored",
							moduleId,
							error: err
						});
					}
					if (!options.ignoreErrored && !error) error = err;
				}
			}
		}
		return error;
	}

	/**
	 * Main apply logic – orchestrates the whole HMR apply flow.
	 */
	function hotApply(options) {
		if (hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		const appliedUpdate = {};
		const outdatedModules = [];
		const outdatedDependencies = {};

		// Determine affected modules and collect actions
		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;
			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: "disposed", moduleId: id };
			const { abortError, doApply, doDispose } = processResult(result, options, moduleId);
			if (abortError) {
				hotSetStatus("abort");
				return Promise.reject(abortError);
			}
			if (doApply) applyUpdates(result, moduleId, appliedUpdate, outdatedModules, outdatedDependencies);
			if (doDispose) markForDispose(result, moduleId, appliedUpdate, outdatedModules);
		}

		// Collect self‑accepted modules for later loading
		const selfAccepted = [];
		for (const moduleId of outdatedModules) {
			const mod = installedModules[moduleId];
			if (mod && mod.hot._selfAccepted) {
				selfAccepted.push({ module: moduleId, errorHandler: mod.hot._selfAccepted });
			}
		}

		// Dispose phase
		disposeModules(outdatedModules);
		cleanOutdatedDependencies(outdatedDependencies);

		// Apply new code
		hotSetStatus("apply");
		hotCurrentHash = hotUpdateNewHash;
		for (const moduleId in appliedUpdate) {
			if (Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}

		// Run accept handlers
		let error = invokeAcceptHandlers(outdatedDependencies, options);
		// Load self‑accepted modules
		const selfError = loadSelfAcceptedModules(selfAccepted, options);
		if (selfError && !error) error = selfError;

		// Finalize
		if (error) {
			hotSetStatus("fail");
			return Promise.reject(error);
		}
		hotSetStatus("idle");
		return Promise.resolve(outdatedModules);
	}
};