/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {

	const hotApplyOnUpdate = true;
	let hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	const hotCurrentModuleData = {};
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	const hotCurrentParents = []; // eslint-disable-line no-unused-vars
	const hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	// -------------------------------------------------------------------------
	// Helper: create a require function that tracks HMR relationships
	// -------------------------------------------------------------------------
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
			get: () => $require$[name],
			set: value => { $require$[name] = value; }
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

	// -------------------------------------------------------------------------
	// Helper: create a hot module object for a given moduleId
	// -------------------------------------------------------------------------
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
					dep.forEach(d => hot._acceptedDependencies[d] = callback || (() => {}));
				} else {
					hot._acceptedDependencies[dep] = callback || (() => {});
				}
			},
			decline(dep) {
				if (typeof dep === "undefined") {
					hot._selfDeclined = true;
				} else if (Array.isArray(dep)) {
					dep.forEach(d => hot._declinedDependencies[d] = true);
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

	// -------------------------------------------------------------------------
	// Status handling
	// -------------------------------------------------------------------------
	const hotStatusHandlers = [];
	let hotStatus = "idle";

	function hotSetStatus(newStatus) {
		hotStatus = newStatus;
		hotStatusHandlers.forEach(handler => handler.call(null, newStatus));
	}

	// -------------------------------------------------------------------------
	// Update download state
	// -------------------------------------------------------------------------
	let hotWaitingFiles = 0;
	let hotChunksLoading = 0;
	const hotWaitingFilesMap = {};
	const hotRequestedFilesMap = {};
	const hotAvailableFilesMap = {};
	let hotDeferred;

	// The update info
	let hotUpdate, hotUpdateNewHash;

	function toModuleId(id) {
		return (+id) + "" === id ? +id : id;
	}

	// -------------------------------------------------------------------------
	// Check for updates
	// -------------------------------------------------------------------------
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
			Object.assign(hotAvailableFilesMap, update.c);
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

	// -------------------------------------------------------------------------
	// Chunk handling helpers
	// -------------------------------------------------------------------------
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

	function hotEnsureUpdateChunk(chunkId) {
		if (!hotAvailableFilesMap[chunkId]) {
			hotWaitingFilesMap[chunkId] = true;
		} else {
			hotRequestedFilesMap[chunkId] = true;
			hotWaitingFiles++;
			hotDownloadUpdateChunk(chunkId);
		}
	}

	function hotUpdateDownloaded() {
		hotSetStatus("ready");
		const deferred = hotDeferred;
		hotDeferred = null;
		if (!deferred) return;

		if (hotApplyOnUpdate) {
			hotApply(hotApplyOnUpdate).then(deferred.resolve, deferred.reject);
		} else {
			const outdatedModules = Object.keys(hotUpdate).map(toModuleId);
			deferred.resolve(outdatedModules);
		}
	}

	// -------------------------------------------------------------------------
	// Apply updates – split into focused helpers
	// -------------------------------------------------------------------------
	function hotApply(options) {
		if (hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		const appliedUpdate = {};
		const outdatedModules = [];
		const outdatedDependencies = {};

		const warnUnexpectedRequire = () => {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		// 1️⃣ Determine affected modules for each update entry
		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;
			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: "disposed", moduleId: id };
			processResult(result, moduleId, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire);
		}

		// 2️⃣ Collect self‑accepted modules
		const selfAccepted = collectSelfAccepted(outdatedModules);

		// 3️⃣ Dispose phase
		disposeModules(outdatedModules, outdatedDependencies);

		// 4️⃣ Apply new code
		applyUpdates(appliedUpdate);

		// 5️⃣ Run accept handlers
		const acceptError = runAcceptHandlers(outdatedDependencies, options);

		// 6️⃣ Load self‑accepted modules
		const selfError = loadSelfAccepted(selfAccepted, options);

		// 7️⃣ Final error handling
		const finalError = acceptError || selfError;
		if (finalError) {
			hotSetStatus("fail");
			return Promise.reject(finalError);
		}
		hotSetStatus("idle");
		return Promise.resolve(outdatedModules);
	}

	/** Determine affected modules and dependencies for a given update */
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
					return { type: "declined", chain: chain.concat(parentId), moduleId, parentId };
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

	/** Merge array `b` into set‑like array `a` */
	function addAllToSet(a, b) {
		b.forEach(item => {
			if (!a.includes(item)) a.push(item);
		});
	}

	/** Process a single update result according to its type */
	function processResult(result, moduleId, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire) {
		let abortError = null;
		let doApply = false;
		let doDispose = false;
		const chainInfo = result.chain ? "\nUpdate propagation: " + result.chain.join(" -> ") : "";

		switch (result.type) {
			case "self-declined":
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) abortError = new Error("Aborted because of self decline: " + result.moduleId + chainInfo);
				break;
			case "declined":
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) abortError = new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + chainInfo);
				break;
			case "unaccepted":
				if (options.onUnaccepted) options.onUnaccepted(result);
				if (!options.ignoreUnaccepted) abortError = new Error("Aborted because " + moduleId + " is not accepted" + chainInfo);
				break;
			case "accepted":
				if (options.onAccepted) options.onAccepted(result);
				doApply = true;
				break;
			case "disposed":
				if (options.onDisposed) options.onDisposed(result);
				doDispose = true;
				break;
			default:
				throw new Error("Unexpected type " + result.type);
		}

		if (abortError) {
			hotSetStatus("abort");
			throw abortError;
		}
		if (doApply) {
			appliedUpdate[moduleId] = hotUpdate[moduleId];
			addAllToSet(outdatedModules, result.outdatedModules);
			for (const depId in result.outdatedDependencies) {
				if (!Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depId)) continue;
				if (!outdatedDependencies[depId]) outdatedDependencies[depId] = [];
				addAllToSet(outdatedDependencies[depId], result.outdatedDependencies[depId]);
			}
		}
		if (doDispose) {
			addAllToSet(outdatedModules, [result.moduleId]);
			appliedUpdate[moduleId] = warnUnexpectedRequire;
		}
	}

	/** Gather modules that self‑accept for later re‑execution */
	function collectSelfAccepted(outdatedModules) {
		const selfAccepted = [];
		outdatedModules.forEach(moduleId => {
			const mod = installedModules[moduleId];
			if (mod && mod.hot._selfAccepted) {
				selfAccepted.push({ module: moduleId, errorHandler: mod.hot._selfAccepted });
			}
		});
		return selfAccepted;
	}

	/** Dispose phase – run dispose handlers and clean up module graph */
	function disposeModules(outdatedModules, outdatedDependencies) {
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(chunkId => {
			if (hotAvailableFilesMap[chunkId] === false) hotDisposeChunk(chunkId);
		});

		const queue = [...outdatedModules];
		while (queue.length) {
			const moduleId = queue.pop();
			const module = installedModules[moduleId];
			if (!module) continue;

			const data = {};
			module.hot._disposeHandlers.forEach(cb => cb(data));
			hotCurrentModuleData[moduleId] = data;
			module.hot.active = false;
			delete installedModules[moduleId];

			module.children.forEach(childId => {
				const child = installedModules[childId];
				if (!child) return;
				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) child.parents.splice(idx, 1);
			});
		}

		// Remove outdated dependencies from remaining modules
		for (const parentId in outdatedDependencies) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, parentId)) continue;
			const parent = installedModules[parentId];
			if (!parent) continue;
			outdatedDependencies[parentId].forEach(depId => {
				const idx = parent.children.indexOf(depId);
				if (idx >= 0) parent.children.splice(idx, 1);
			});
		}
	}

	/** Insert new module code into the module map */
	function applyUpdates(appliedUpdate) {
		hotSetStatus("apply");
		hotCurrentHash = hotUpdateNewHash;
		for (const moduleId in appliedUpdate) {
			if (Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}
	}

	/** Execute accept handlers for outdated dependencies */
	function runAcceptHandlers(outdatedDependencies, options) {
		let firstError = null;
		for (const moduleId in outdatedDependencies) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;
			const module = installedModules[moduleId];
			const deps = outdatedDependencies[moduleId];
			const callbacks = [];

			deps.forEach(depId => {
				const cb = module.hot._acceptedDependencies[depId];
				if (!callbacks.includes(cb)) callbacks.push(cb);
			});

			callbacks.forEach(cb => {
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
					if (!options.ignoreErrored && !firstError) firstError = err;
				}
			});
		}
		return firstError;
	}

	/** Load modules that self‑accepted after disposal */
	function loadSelfAccepted(selfAccepted, options) {
		let firstError = null;
		selfAccepted.forEach(item => {
			const { module, errorHandler } = item;
			hotCurrentParents.splice(0, hotCurrentParents.length, module);
			try {
				$require$(module);
			} catch (err) {
				if (typeof errorHandler === "function") {
					try {
						errorHandler(err);
					} catch (innerErr) {
						if (options.onErrored) {
							options.onErrored({
								type: "self-accept-error-handler-errored",
								moduleId: module,
								error: innerErr,
								orginalError: err
							});
						}
						if (!options.ignoreErrored && !firstError) firstError = innerErr;
					}
				} else {
					if (options.onErrored) {
						options.onErrored({
							type: "self-accept-errored",
							moduleId: module,
							error: err
						});
					}
					if (!options.ignoreErrored && !firstError) firstError = err;
				}
			}
		});
		return firstError;
	}
};