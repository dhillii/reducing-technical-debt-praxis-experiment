/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {
	// HMR state
	let hotApplyOnUpdate = true;
	const hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	const hotCurrentModuleData = {};
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	let hotCurrentParents = []; // eslint-disable-line no-unused-vars
	let hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	/**
	 * Creates a require function that tracks parent/child relationships for HMR.
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
					hotCurrentParents = [moduleId];
					hotCurrentChildModule = request;
				}
				if (me.children.indexOf(request) < 0) me.children.push(request);
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents = [];
			}
			return $require$(request);
		};

		// Proxy properties from the original require
		const defineProxy = name => {
			Object.defineProperty(fn, name, {
				configurable: true,
				enumerable: true,
				get: () => $require$[name],
				set: value => {
					$require$[name] = value;
				}
			});
		};

		for (const name in $require$) {
			if (Object.prototype.hasOwnProperty.call($require$, name) && name !== "e") {
				defineProxy(name);
			}
		}

		// Chunk loading wrapper
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
	 * Creates a hot module object for a given moduleId.
	 */
	function hotCreateModule(moduleId) { // eslint-disable-line no-unused-vars
		const hot = {
			// private
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: hotCurrentChildModule !== moduleId,

			// public API
			active: true,
			accept(dep, callback) {
				if (typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if (typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if (Array.isArray(dep)) {
					for (let i = 0; i < dep.length; i++) {
						hot._acceptedDependencies[dep[i]] = callback || (() => {});
					}
				} else {
					hot._acceptedDependencies[dep] = callback || (() => {});
				}
			},
			decline(dep) {
				if (typeof dep === "undefined") {
					hot._selfDeclined = true;
				} else if (Array.isArray(dep)) {
					for (let i = 0; i < dep.length; i++) {
						hot._declinedDependencies[dep[i]] = true;
					}
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
			// management API
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
		for (let i = 0; i < hotStatusHandlers.length; i++) {
			hotStatusHandlers[i].call(null, newStatus);
		}
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
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

	/**
	 * Checks for updates and prepares download.
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
			{
				/*globals chunkId */
				hotEnsureUpdateChunk(chunkId);
			}
			if (hotStatus === "prepare" && hotChunksLoading === 0 && hotWaitingFiles === 0) {
				hotUpdateDownloaded();
			}
			return promise;
		});
	}

	function hotAddUpdateChunk(chunkId, moreModules) { // eslint-disable-line no-unused-vars
		if (!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId]) return;
		hotRequestedFilesMap[chunkId] = false;
		for (const moduleId in moreModules) {
			if (Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
				hotUpdate[moduleId] = moreModules[moduleId];
			}
		}
		if (--hotWaitingFiles === 0 && hotChunksLoading === 0) {
			hotUpdateDownloaded();
		}
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
			hotApply(hotApplyOnUpdate).then(
				result => deferred.resolve(result),
				err => deferred.reject(err)
			);
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
	 * Applies the downloaded update.
	 */
	function hotApply(options) {
		if (hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		/*** Helper: collect affected modules ***/
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
				for (let i = 0; i < module.parents.length; i++) {
					const parentId = module.parents[i];
					const parent = installedModules[parentId];
					if (!parent) continue;
					if (parent.hot._declinedDependencies[moduleId]) {
						return {
							type: "declined",
							chain: chain.concat([parentId]),
							moduleId,
							parentId
						};
					}
					if (outdatedModules.includes(parentId)) continue;
					if (parent.hot._acceptedDependencies[moduleId]) {
						if (!outdatedDependencies[parentId]) outdatedDependencies[parentId] = [];
						addAllToSet(outdatedDependencies[parentId], [moduleId]);
						continue;
					}
					delete outdatedDependencies[parentId];
					outdatedModules.push(parentId);
					queue.push({ chain: chain.concat([parentId]), id: parentId });
				}
			}
			return {
				type: "accepted",
				moduleId: updateModuleId,
				outdatedModules,
				outdatedDependencies
			};
		}

		/*** Helper: add items to a set ***/
		function addAllToSet(target, items) {
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (!target.includes(item)) target.push(item);
			}
		}

		/*** Helper: process a single update entry ***/
		function processUpdateEntry(id) {
			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: "disposed", moduleId: id };
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
					applyUpdate(result);
					break;
				case "disposed":
					if (options.onDisposed) options.onDisposed(result);
					markForDispose(result);
					break;
				default:
					throw new Error("Unexpected type " + result.type);
			}
		}

		/*** Helper: apply accepted update ***/
		function applyUpdate(result) {
			appliedUpdate[moduleId] = hotUpdate[moduleId];
			addAllToSet(outdatedModules, result.outdatedModules);
			for (const depId in result.outdatedDependencies) {
				if (Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depId)) {
					if (!outdatedDependencies[depId]) outdatedDependencies[depId] = [];
					addAllToSet(outdatedDependencies[depId], result.outdatedDependencies[depId]);
				}
			}
		}

		/*** Helper: mark module for disposal ***/
		function markForDispose(result) {
			addAllToSet(outdatedModules, [result.moduleId]);
			appliedUpdate[moduleId] = warnUnexpectedRequire;
		}

		/*** Helper: collect self‑accepted modules ***/
		function collectSelfAccepted() {
			const selfAccepted = [];
			for (let i = 0; i < outdatedModules.length; i++) {
				const modId = outdatedModules[i];
				const mod = installedModules[modId];
				if (mod && mod.hot._selfAccepted) {
					selfAccepted.push({ module: modId, errorHandler: mod.hot._selfAccepted });
				}
			}
			return selfAccepted;
		}

		/*** Helper: dispose outdated modules ***/
		function disposeModules() {
			hotSetStatus("dispose");
			Object.keys(hotAvailableFilesMap).forEach(chunkId => {
				if (hotAvailableFilesMap[chunkId] === false) hotDisposeChunk(chunkId);
			});

			const queue = [...outdatedModules];
			while (queue.length) {
				const modId = queue.pop();
				const mod = installedModules[modId];
				if (!mod) continue;

				const data = {};
				mod.hot._disposeHandlers.forEach(cb => cb(data));
				hotCurrentModuleData[modId] = data;
				mod.hot.active = false;
				delete installedModules[modId];

				mod.children.forEach(childId => {
					const child = installedModules[childId];
					if (!child) return;
					const idx = child.parents.indexOf(modId);
					if (idx >= 0) child.parents.splice(idx, 1);
				});
			}
		}

		/*** Helper: remove outdated dependencies from children ***/
		function cleanOutdatedDependencies() {
			for (const modId in outdatedDependencies) {
				if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, modId)) continue;
				const mod = installedModules[modId];
				if (!mod) continue;
				const deps = outdatedDependencies[modId];
				deps.forEach(depId => {
					const idx = mod.children.indexOf(depId);
					if (idx >= 0) mod.children.splice(idx, 1);
				});
			}
		}

		/*** Helper: insert new modules ***/
		function insertNewModules() {
			for (const modId in appliedUpdate) {
				if (Object.prototype.hasOwnProperty.call(appliedUpdate, modId)) {
					modules[modId] = appliedUpdate[modId];
				}
			}
		}

		/*** Helper: invoke accept handlers ***/
		function invokeAcceptHandlers() {
			let error = null;
			for (const modId in outdatedDependencies) {
				if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, modId)) continue;
				const mod = installedModules[modId];
				const deps = outdatedDependencies[modId];
				const callbacks = [];

				deps.forEach(depId => {
					const cb = mod.hot._acceptedDependencies[depId];
					if (!callbacks.includes(cb)) callbacks.push(cb);
				});

				callbacks.forEach(cb => {
					try {
						cb(deps);
					} catch (err) {
						if (options.onErrored) {
							options.onErrored({
								type: "accept-errored",
								moduleId: modId,
								dependencyId: deps[callbacks.indexOf(cb)],
								error: err
							});
						}
						if (!options.ignoreErrored && !error) error = err;
					}
				});
			}
			return error;
		}

		/*** Helper: load self‑accepted modules ***/
		function loadSelfAccepted(selfAccepted) {
			let error = null;
			selfAccepted.forEach(item => {
				const modId = item.module;
				hotCurrentParents = [modId];
				try {
					$require$(modId);
				} catch (err) {
					if (typeof item.errorHandler === "function") {
						try {
							item.errorHandler(err);
						} catch (err2) {
							if (options.onErrored) {
								options.onErrored({
									type: "self-accept-error-handler-errored",
									moduleId: modId,
									error: err2,
									orginalError: err
								});
							}
							if (!options.ignoreErrored && !error) error = err2;
						}
						if (!options.ignoreErrored && !error) error = err;
					} else {
						if (options.onErrored) {
							options.onErrored({
								type: "self-accept-errored",
								moduleId: modId,
								error: err
							});
						}
						if (!options.ignoreErrored && !error) error = err;
					}
				}
			});
			return error;
		}

		/*** Main apply logic ***/
		const outdatedDependencies = {};
		const outdatedModules = [];
		const appliedUpdate = {};
		const warnUnexpectedRequire = () => {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		let abortError = null;
		let result; // reused variable for each entry

		for (const id in hotUpdate) {
			if (Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
				processUpdateEntry(id);
				if (abortError) break;
			}
		}
		if (abortError) {
			hotSetStatus("abort");
			return Promise.reject(abortError);
		}

		const selfAcceptedModules = collectSelfAccepted();

		disposeModules();
		cleanOutdatedDependencies();
		hotSetStatus("apply");
		hotCurrentHash = hotUpdateNewHash;
		insertNewModules();

		const acceptError = invokeAcceptHandlers();
		const selfAcceptError = loadSelfAccepted(selfAcceptedModules);
		const finalError = acceptError || selfAcceptError;

		if (finalError) {
			hotSetStatus("fail");
			return Promise.reject(finalError);
		}
		hotSetStatus("idle");
		return Promise.resolve(outdatedModules);
	}
};