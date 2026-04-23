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

	/**
	 * Creates a hot module object with HMR API.
	 */
	function hotCreateModule(moduleId) { // eslint-disable-line no-unused-vars
		const hot = {
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: hotCurrentChildModule !== moduleId,

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
			data: hotCurrentModuleData[moduleId]
		};
		hotCurrentChildModule = undefined;
		return hot;
	}

	const hotStatusHandlers = [];
	let hotStatus = "idle";

	function hotSetStatus(newStatus) {
		hotStatus = newStatus;
		for (const handler of hotStatusHandlers) handler.call(null, newStatus);
	}

	// while downloading
	let hotWaitingFiles = 0;
	let hotChunksLoading = 0;
	const hotWaitingFilesMap = {};
	const hotRequestedFilesMap = {};
	const hotAvailableFilesMap = {};
	let hotDeferred;

	// The update info
	let hotUpdate, hotUpdateNewHash;

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
	 * Adds a newly downloaded chunk to the update.
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
	 * Ensures a chunk is requested or marked as waiting.
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
	 * Core apply logic – split into smaller responsibilities.
	 */
	function hotApply(options) {
		if (hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		const appliedUpdate = {};
		const outdatedModules = [];
		const outdatedDependencies = {};

		const warnUnexpectedRequire = () => {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		// 1️⃣ Determine affected modules
		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;
			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: "disposed", moduleId: id };
			handleResult(result, moduleId, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire);
		}

		// 2️⃣ Collect self‑accepted modules
		const outdatedSelfAcceptedModules = collectSelfAcceptedModules(outdatedModules);

		// 3️⃣ Dispose phase
		hotSetStatus("dispose");
		disposeOutdatedModules(outdatedModules);
		cleanOutdatedDependencies(outdatedDependencies);

		// 4️⃣ Apply new code
		hotSetStatus("apply");
		hotCurrentHash = hotUpdateNewHash;
		applyUpdates(appliedUpdate);

		// 5️⃣ Run accept handlers
		const error = runAcceptHandlers(outdatedDependencies, options);

		// 6️⃣ Load self‑accepted modules
		const selfAcceptError = loadSelfAcceptedModules(outdatedSelfAcceptedModules, options);
		if (selfAcceptError && !error) error = selfAcceptError;

		// 7️⃣ Finalize
		if (error) {
			hotSetStatus("fail");
			return Promise.reject(error);
		}
		hotSetStatus("idle");
		return Promise.resolve(outdatedModules);
	}

	/**
	 * Determines which modules are affected by an update.
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
	 * Adds items from source array to target array if not already present.
	 */
	function addAllToSet(target, source) {
		for (const item of source) {
			if (!target.includes(item)) target.push(item);
		}
	}

	/**
	 * Handles a single result from getAffectedStuff.
	 */
	function handleResult(result, moduleId, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire) {
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
			for (const depModuleId in result.outdatedDependencies) {
				if (!Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depModuleId)) continue;
				if (!outdatedDependencies[depModuleId]) outdatedDependencies[depModuleId] = [];
				addAllToSet(outdatedDependencies[depModuleId], result.outdatedDependencies[depModuleId]);
			}
		}
		if (doDispose) {
			addAllToSet(outdatedModules, [result.moduleId]);
			appliedUpdate[moduleId] = warnUnexpectedRequire;
		}
	}

	/**
	 * Gathers modules that self‑accepted for later re‑execution.
	 */
	function collectSelfAcceptedModules(outdatedModules) {
		const result = [];
		for (const moduleId of outdatedModules) {
			const mod = installedModules[moduleId];
			if (mod && mod.hot._selfAccepted) {
				result.push({ module: moduleId, errorHandler: mod.hot._selfAccepted });
			}
		}
		return result;
	}

	/**
	 * Disposes outdated modules and cleans parent/child links.
	 */
	function disposeOutdatedModules(outdatedModules) {
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
	 * Removes references to outdated dependencies from remaining modules.
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
	 * Inserts updated module code into the module map.
	 */
	function applyUpdates(appliedUpdate) {
		for (const moduleId in appliedUpdate) {
			if (Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}
	}

	/**
	 * Executes accept handlers for outdated dependencies.
	 */
	function runAcceptHandlers(outdatedDependencies, options) {
		let firstError = null;
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
					if (!options.ignoreErrored && !firstError) firstError = err;
				}
			}
		}
		return firstError;
	}

	/**
	 * Loads modules that self‑accepted after disposal.
	 */
	function loadSelfAcceptedModules(modulesInfo, options) {
		let firstError = null;
		for (const { module, errorHandler } of modulesInfo) {
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
		}
		return firstError;
	}
};