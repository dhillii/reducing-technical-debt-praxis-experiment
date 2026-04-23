/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function () {
	// State variables
	let hotApplyOnUpdate = true;
	const hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	const hotCurrentModuleData = {};
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	let hotCurrentParents = []; // eslint-disable-line no-unused-vars
	let hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	const hotStatusHandlers = [];
	let hotStatus = "idle";

	// while downloading
	let hotWaitingFiles = 0;
	let hotChunksLoading = 0;
	const hotWaitingFilesMap = {};
	const hotRequestedFilesMap = {};
	const hotAvailableFilesMap = {};
	let hotDeferred;

	// The update info
	let hotUpdate;
	let hotUpdateNewHash;

	/** Convert id to module id (number or string) */
	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

	/** Guard clause: ensure status is idle before checking */
	function ensureIdleStatus() {
		if (hotStatus !== "idle") {
			throw new Error("check() is only allowed in idle status");
		}
	}

	/** Guard clause: ensure status is ready before applying */
	function ensureReadyStatus() {
		if (hotStatus !== "ready") {
			throw new Error("apply() is only allowed in ready status");
		}
	}

	/** Update the global status and notify handlers */
	function hotSetStatus(newStatus) {
		hotStatus = newStatus;
		for (const handler of hotStatusHandlers) {
			handler.call(null, newStatus);
		}
	}

	/** Predicate: is a module active? */
	function isModuleActive(module) {
		return module && module.hot && module.hot.active;
	}

	/** Predicate: is a module self-accepted? */
	function isSelfAccepted(module) {
		return module && module.hot && module.hot._selfAccepted;
	}

	/** Predicate: is a module self-declined? */
	function isSelfDeclined(module) {
		return module && module.hot && module.hot._selfDeclined;
	}

	/** Predicate: is a module main (entry) */
	function isMainModule(module) {
		return module && module.hot && module.hot._main;
	}

	/** Create a require function that tracks HMR relationships */
	function hotCreateRequire(moduleId) {
		const me = installedModules[moduleId];
		if (!me) return $require$;

		const fn = function (request) {
			if (isModuleActive(me)) {
				if (installedModules[request]) {
					const parents = installedModules[request].parents;
					if (parents.indexOf(moduleId) < 0) parents.push(moduleId);
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

		const ObjectFactory = function (name) {
			return {
				configurable: true,
				enumerable: true,
				get() {
					return $require$[name];
				},
				set(value) {
					$require$[name] = value;
				}
			};
		};

		for (const name in $require$) {
			if (Object.prototype.hasOwnProperty.call($require$, name) && name !== "e") {
				Object.defineProperty(fn, name, ObjectFactory(name));
			}
		}

		fn.e = function (chunkId) {
			if (hotStatus === "ready") hotSetStatus("prepare");
			hotChunksLoading++;
			return $require$.e(chunkId).then(finishChunkLoading, function (err) {
				finishChunkLoading();
				throw err;
			});
		};

		function finishChunkLoading() {
			hotChunksLoading--;
			if (hotStatus === "prepare") {
				if (!hotWaitingFilesMap[chunkId]) {
					hotEnsureUpdateChunk(chunkId);
				}
				if (hotChunksLoading === 0 && hotWaitingFiles === 0) {
					hotUpdateDownloaded();
				}
			}
		}

		return fn;
	}

	/** Create a hot module object */
	function hotCreateModule(moduleId) {
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
					for (const d of dep) {
						hot._acceptedDependencies[d] = callback || function () { };
					}
				} else {
					hot._acceptedDependencies[dep] = callback || function () { };
				}
			},
			decline(dep) {
				if (typeof dep === "undefined") {
					hot._selfDeclined = true;
				} else if (Array.isArray(dep)) {
					for (const d of dep) {
						hot._declinedDependencies[d] = true;
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

	/** Ensure a chunk is requested or marked as waiting */
	function hotEnsureUpdateChunk(chunkId) {
		if (!hotAvailableFilesMap[chunkId]) {
			hotWaitingFilesMap[chunkId] = true;
		} else {
			hotRequestedFilesMap[chunkId] = true;
			hotWaitingFiles++;
			hotDownloadUpdateChunk(chunkId);
		}
	}

	/** Called when all update chunks have been downloaded */
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

	/** Add a newly downloaded chunk to the update set */
	function hotAddUpdateChunk(chunkId, moreModules) {
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

	/** Initiate a check for updates */
	function hotCheck(apply) {
		ensureIdleStatus();
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

	/** Add an item to a set if not already present */
	function addAllToSet(set, items) {
		for (const item of items) {
			if (set.indexOf(item) < 0) set.push(item);
		}
	}

	/** Process a single update result */
	function processUpdateResult(result, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire) {
		let abortError = false;
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
				if (!options.ignoreUnaccepted) abortError = new Error("Aborted because " + result.moduleId + " is not accepted" + chainInfo);
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
			appliedUpdate[result.moduleId] = hotUpdate[result.moduleId];
			addAllToSet(outdatedModules, result.outdatedModules);
			for (const modId in result.outdatedDependencies) {
				if (Object.prototype.hasOwnProperty.call(result.outdatedDependencies, modId)) {
					if (!outdatedDependencies[modId]) outdatedDependencies[modId] = [];
					addAllToSet(outdatedDependencies[modId], result.outdatedDependencies[modId]);
				}
			}
		}
		if (doDispose) {
			addAllToSet(outdatedModules, [result.moduleId]);
			appliedUpdate[result.moduleId] = warnUnexpectedRequire;
		}
	}

	/** Determine affected modules for a given update */
	function getAffectedStuff(updateModuleId) {
		const outdatedModules = [updateModuleId];
		const outdatedDependencies = {};

		const queue = outdatedModules.slice().map(id => ({ chain: [id], id }));
		while (queue.length) {
			const { id: moduleId, chain } = queue.pop();
			const module = installedModules[moduleId];
			if (!module || isSelfAccepted(module)) continue;
			if (isSelfDeclined(module)) {
				return { type: "self-declined", chain, moduleId };
			}
			if (isMainModule(module)) {
				return { type: "unaccepted", chain, moduleId };
			}
			for (const parentId of module.parents) {
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

	/** Dispose outdated modules */
	function disposeModules(outdatedModules) {
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(chunkId => {
			if (hotAvailableFilesMap[chunkId] === false) hotDisposeChunk(chunkId);
		});

		const queue = outdatedModules.slice();
		while (queue.length) {
			const moduleId = queue.pop();
			const module = installedModules[moduleId];
			if (!module) continue;

			const data = {};

			// Call dispose handlers
			for (const cb of module.hot._disposeHandlers) {
				cb(data);
			}
			hotCurrentModuleData[moduleId] = data;

			// Disable module
			module.hot.active = false;

			// Remove from cache
			delete installedModules[moduleId];

			// Clean parent references from children
			for (const childId of module.children) {
				const child = installedModules[childId];
				if (!child) continue;
				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) child.parents.splice(idx, 1);
			}
		}
	}

	/** Remove outdated dependencies from module children */
	function removeOutdatedDependencies(outdatedDependencies) {
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

	/** Call accept handlers for outdated dependencies */
	function callAcceptHandlers(outdatedDependencies, options) {
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

	/** Load self-accepted modules */
	function loadSelfAcceptedModules(outdatedSelfAcceptedModules, options) {
		let error = null;
		for (const item of outdatedSelfAcceptedModules) {
			const { module: moduleId, errorHandler } = item;
			hotCurrentParents = [moduleId];
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

	/** Main apply function */
	function hotApply(options) {
		ensureReadyStatus();
		options = options || {};

		const appliedUpdate = {};
		const outdatedModules = [];
		const outdatedDependencies = {};
		const warnUnexpectedRequire = function () {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		// Determine affected modules for each update
		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;
			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: "disposed", moduleId: id };
			processUpdateResult(result, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire);
		}

		// Collect self-accepted modules for later loading
		const outdatedSelfAcceptedModules = [];
		for (const moduleId of outdatedModules) {
			const mod = installedModules[moduleId];
			if (mod && mod.hot._selfAccepted) {
				outdatedSelfAcceptedModules.push({
					module: moduleId,
					errorHandler: mod.hot._selfAccepted
				});
			}
		}

		// Dispose phase
		disposeModules(outdatedModules);
		removeOutdatedDependencies(outdatedDependencies);

		// Apply phase
		hotSetStatus("apply");
		hotCurrentHash = hotUpdateNewHash;

		// Insert new code
		for (const moduleId in appliedUpdate) {
			if (Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}

		// Call accept handlers
		const acceptError = callAcceptHandlers(outdatedDependencies, options);
		const selfAcceptError = loadSelfAcceptedModules(outdatedSelfAcceptedModules, options);
		const finalError = acceptError || selfAcceptError;

		if (finalError) {
			hotSetStatus("fail");
			return Promise.reject(finalError);
		}

		hotSetStatus("idle");
		return Promise.resolve(outdatedModules);
	}
};