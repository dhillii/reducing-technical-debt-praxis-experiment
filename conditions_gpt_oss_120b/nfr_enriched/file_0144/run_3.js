/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {
	// Core HMR state
	let hotApplyOnUpdate = true;
	let hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	const hotCurrentModuleData = {};
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	let hotCurrentParents = []; // eslint-disable-line no-unused-vars
	let hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	// -------------------------------------------------------------------------
	// Helper: create a require function that tracks parent/child relationships
	// -------------------------------------------------------------------------
	function createRequire(moduleId) { // eslint-disable-line no-unused-vars
		const moduleRecord = installedModules[moduleId];
		if (!moduleRecord) return $require$;

		const wrappedRequire = function(request) {
			if (moduleRecord.hot.active) {
				if (installedModules[request]) {
					const childRecord = installedModules[request];
					if (childRecord.parents.indexOf(moduleId) < 0) {
						childRecord.parents.push(moduleId);
					}
				} else {
					hotCurrentParents = [moduleId];
					hotCurrentChildModule = request;
				}
				if (moduleRecord.children.indexOf(request) < 0) {
					moduleRecord.children.push(request);
				}
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents = [];
			}
			return $require$(request);
		};

		const defineProxy = function(name) {
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
				Object.defineProperty(wrappedRequire, name, defineProxy(name));
			}
		}

		// Chunk loading proxy
		wrappedRequire.e = function(chunkId) {
			if (hotStatus === "ready") hotSetStatus("prepare");
			hotChunksLoading++;
			return $require$.e(chunkId).then(finishChunkLoading, err => {
				finishChunkLoading();
				throw err;
			});

			function finishChunkLoading() {
				hotChunksLoading--;
				if (hotStatus === "prepare") {
					if (!hotWaitingFilesMap[chunkId]) {
						ensureUpdateChunk(chunkId);
					}
					if (hotChunksLoading === 0 && hotWaitingFiles === 0) {
						updateDownloaded();
					}
				}
			}
		};

		return wrappedRequire;
	}

	// -------------------------------------------------------------------------
	// Helper: create a hot module object for a given module id
	// -------------------------------------------------------------------------
	function createModule(moduleId) { // eslint-disable-line no-unused-vars
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
			// inherit data from previous dispose
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

	function setStatus(newStatus) {
		hotStatus = newStatus;
		for (let i = 0; i < hotStatusHandlers.length; i++) {
			hotStatusHandlers[i].call(null, newStatus);
		}
	}

	// -------------------------------------------------------------------------
	// Download state
	// -------------------------------------------------------------------------
	let hotWaitingFiles = 0;
	let hotChunksLoading = 0;
	const hotWaitingFilesMap = {};
	const hotRequestedFilesMap = {};
	const hotAvailableFilesMap = {};
	let hotDeferred;

	// Update info
	let hotUpdate;
	let hotUpdateNewHash;

	// -------------------------------------------------------------------------
	// Utility
	// -------------------------------------------------------------------------
	function toModuleId(id) {
		return (+id) + "" === id ? +id : id;
	}

	// -------------------------------------------------------------------------
	// Public API: check for updates
	// -------------------------------------------------------------------------
	function hotCheck(apply) {
		if (hotStatus !== "idle") throw new Error("check() is only allowed in idle status");
		hotApplyOnUpdate = apply;
		setStatus("check");
		return hotDownloadManifest().then(update => {
			if (!update) {
				setStatus("idle");
				return null;
			}
			hotRequestedFilesMap = {};
			hotWaitingFilesMap = {};
			hotAvailableFilesMap = update.c;
			hotUpdateNewHash = update.h;

			setStatus("prepare");
			const promise = new Promise((resolve, reject) => {
				hotDeferred = { resolve, reject };
			});
			hotUpdate = {};

			/*foreachInstalledChunks*/
			{ // eslint-disable-line no-lone-blocks
				/*globals chunkId */
				ensureUpdateChunk(chunkId);
			}
			if (hotStatus === "prepare" && hotChunksLoading === 0 && hotWaitingFiles === 0) {
				updateDownloaded();
			}
			return promise;
		});
	}

	// -------------------------------------------------------------------------
	// Chunk handling
	// -------------------------------------------------------------------------
	function addUpdateChunk(chunkId, moreModules) { // eslint-disable-line no-unused-vars
		if (!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId]) return;
		hotRequestedFilesMap[chunkId] = false;
		for (const moduleId in moreModules) {
			if (Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
				hotUpdate[moduleId] = moreModules[moduleId];
			}
		}
		if (--hotWaitingFiles === 0 && hotChunksLoading === 0) {
			updateDownloaded();
		}
	}

	function ensureUpdateChunk(chunkId) {
		if (!hotAvailableFilesMap[chunkId]) {
			hotWaitingFilesMap[chunkId] = true;
		} else {
			hotRequestedFilesMap[chunkId] = true;
			hotWaitingFiles++;
			hotDownloadUpdateChunk(chunkId);
		}
	}

	// -------------------------------------------------------------------------
	// Called when all update chunks are ready
	// -------------------------------------------------------------------------
	function updateDownloaded() {
		setStatus("ready");
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

	// -------------------------------------------------------------------------
	// Core apply logic – split into smaller responsibilities
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

		// 1️⃣ Process each module in the update payload
		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;
			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: "disposed", moduleId: id };
			handleResult(result, moduleId, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire);
		}

		// 2️⃣ Collect self‑accepted modules for later re‑require
		const selfAccepted = collectSelfAcceptedModules(outdatedModules);

		// 3️⃣ Dispose phase
		disposeModules(outdatedModules);
		removeOutdatedDependencies(outdatedDependencies);

		// 4️⃣ Apply new code
		setStatus("apply");
		hotCurrentHash = hotUpdateNewHash;
		insertNewModules(appliedUpdate);

		// 5️⃣ Run accept handlers
		const acceptError = runAcceptHandlers(outdatedDependencies, options);

		// 6️⃣ Reload self‑accepted modules
		const selfAcceptError = reloadSelfAcceptedModules(selfAccepted, options);

		// 7️⃣ Final error handling
		const finalError = acceptError || selfAcceptError;
		if (finalError) {
			setStatus("fail");
			return Promise.reject(finalError);
		}
		setStatus("idle");
		return Promise.resolve(outdatedModules);
	}

	// -------------------------------------------------------------------------
	// Determine which modules are affected by an update
	// -------------------------------------------------------------------------
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

	// -------------------------------------------------------------------------
	// Helper: add items from b to a if not already present
	// -------------------------------------------------------------------------
	function addAllToSet(a, b) {
		for (let i = 0; i < b.length; i++) {
			const item = b[i];
			if (!a.includes(item)) a.push(item);
		}
	}

	// -------------------------------------------------------------------------
	// Handle a single module's update result
	// -------------------------------------------------------------------------
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
			setStatus("abort");
			throw abortError; // Propagate to outer caller
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

	// -------------------------------------------------------------------------
	// Gather modules that self‑accepted for later re‑execution
	// -------------------------------------------------------------------------
	function collectSelfAcceptedModules(outdatedModules) {
		const selfAccepted = [];
		for (let i = 0; i < outdatedModules.length; i++) {
			const moduleId = outdatedModules[i];
			const mod = installedModules[moduleId];
			if (mod && mod.hot._selfAccepted) {
				selfAccepted.push({
					module: moduleId,
					errorHandler: mod.hot._selfAccepted
				});
			}
		}
		return selfAccepted;
	}

	// -------------------------------------------------------------------------
	// Dispose phase – run dispose handlers and clean module graph
	// -------------------------------------------------------------------------
	function disposeModules(outdatedModules) {
		setStatus("dispose");
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

			// Remove parent references from children
			module.children.forEach(childId => {
				const child = installedModules[childId];
				if (!child) return;
				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) child.parents.splice(idx, 1);
			});
		}
	}

	// -------------------------------------------------------------------------
	// Remove outdated dependency links from remaining modules
	// -------------------------------------------------------------------------
	function removeOutdatedDependencies(outdatedDeps) {
		for (const moduleId in outdatedDeps) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDeps, moduleId)) continue;
			const module = installedModules[moduleId];
			if (!module) continue;
			const deps = outdatedDeps[moduleId];
			deps.forEach(depId => {
				const idx = module.children.indexOf(depId);
				if (idx >= 0) module.children.splice(idx, 1);
			});
		}
	}

	// -------------------------------------------------------------------------
	// Insert new module code into the module map
	// -------------------------------------------------------------------------
	function insertNewModules(appliedUpdate) {
		for (const moduleId in appliedUpdate) {
			if (Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}
	}

	// -------------------------------------------------------------------------
	// Run accept handlers for updated dependencies
	// -------------------------------------------------------------------------
	function runAcceptHandlers(outdatedDeps, options) {
		let firstError = null;
		for (const moduleId in outdatedDeps) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDeps, moduleId)) continue;
			const module = installedModules[moduleId];
			const deps = outdatedDeps[moduleId];
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

	// -------------------------------------------------------------------------
	// Reload modules that self‑accepted the update
	// -------------------------------------------------------------------------
	function reloadSelfAcceptedModules(selfAccepted, options) {
		let firstError = null;
		selfAccepted.forEach(item => {
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
						if (!options.ignoreErrored && !firstError) firstError = err2;
						if (!firstError) firstError = err;
					}
				} else {
					if (options.onErrored) {
						options.onErrored({
							type: "self-accept-errored",
							moduleId,
							error: err
						});
					}
					if (!options.ignoreErrored && !firstError) firstError = err;
				}
			}
		});
		return firstError;
	}

	// Exported hot API (attached to each module via createModule)
	return {
		hotCreateRequire: createRequire,
		hotCreateModule: createModule,
		hotCheck,
		hotApply
	};
};