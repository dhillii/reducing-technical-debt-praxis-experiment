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
	const hotCurrentParents = []; // eslint-disable-line no-unused-vars
	const hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	/**
	 * Creates a require function that tracks HMR relationships.
	 * @param {string|number} moduleId
	 * @returns {function}
	 */
	function hotCreateRequire(moduleId) {
		const me = installedModules[moduleId];
		if (!me) return $require$;

		const fn = function (request) {
			if (me.hot.active) {
				if (installedModules[request]) {
					if (installedModules[request].parents.indexOf(moduleId) < 0) {
						installedModules[request].parents.push(moduleId);
					}
				} else {
					hotCurrentParents.splice(0, hotCurrentParents.length, moduleId);
					hotCurrentChildModule = request;
				}
				if (me.children.indexOf(request) < 0) {
					me.children.push(request);
				}
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents.length = 0;
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

			function finishChunkLoading() {
				hotChunksLoading--;
				if (hotStatus !== "prepare") return;
				if (!hotWaitingFilesMap[chunkId]) {
					hotEnsureUpdateChunk(chunkId);
				}
				if (hotChunksLoading === 0 && hotWaitingFiles === 0) {
					hotUpdateDownloaded();
				}
			}
		};

		return fn;
	}

	/**
	 * Creates a hot module object.
	 * @param {string|number} moduleId
	 * @returns {object}
	 */
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
				if (dep === undefined) {
					hot._selfAccepted = true;
				} else if (typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if (Array.isArray(dep)) {
					for (let i = 0; i < dep.length; i++) {
						hot._acceptedDependencies[dep[i]] = callback || function () { };
					}
				} else {
					hot._acceptedDependencies[dep] = callback || function () { };
				}
			},
			decline(dep) {
				if (dep === undefined) {
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

	const hotStatusHandlers = [];
	let hotStatus = "idle";

	/**
	 * Updates the HMR status and notifies handlers.
	 * @param {string} newStatus
	 */
	function hotSetStatus(newStatus) {
		hotStatus = newStatus;
		for (let i = 0; i < hotStatusHandlers.length; i++) {
			hotStatusHandlers[i].call(null, newStatus);
		}
	}

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

	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

	/**
	 * Initiates a check for updates.
	 * @param {boolean} apply
	 * @returns {Promise}
	 */
	function hotCheck(apply) {
		if (hotStatus !== "idle") throw new Error("check() is only allowed in idle status");
		hotApplyOnUpdate = apply;
		hotSetStatus("check");
		return hotDownloadManifest().then(function (update) {
			if (!update) {
				hotSetStatus("idle");
				return null;
			}
			hotRequestedFilesMap = {};
			hotWaitingFilesMap = {};
			hotAvailableFilesMap = update.c;
			hotUpdateNewHash = update.h;

			hotSetStatus("prepare");
			const promise = new Promise(function (resolve, reject) {
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

	/**
	 * Handles an incoming update chunk.
	 * @param {string|number} chunkId
	 * @param {object} moreModules
	 */
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

	/**
	 * Ensures a chunk is requested or marked as waiting.
	 * @param {string|number} chunkId
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
	 * Determines if a module is self‑declined.
	 * @param {object} module
	 * @returns {boolean}
	 */
	function isSelfDeclined(module) {
		return module.hot._selfDeclined;
	}

	/**
	 * Determines if a module is self‑accepted.
	 * @param {object} module
	 * @returns {boolean}
	 */
	function isSelfAccepted(module) {
		return module.hot._selfAccepted;
	}

	/**
	 * Determines if a module is the main entry.
	 * @param {object} module
	 * @returns {boolean}
	 */
	function isMainEntry(module) {
		return module.hot._main;
	}

	/**
	 * Retrieves affected modules for a given update.
	 * @param {string|number} updateModuleId
	 * @returns {object}
	 */
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
			if (isMainEntry(module)) {
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
				} else {
					delete outdatedDependencies[parentId];
					outdatedModules.push(parentId);
					queue.push({ chain: chain.concat([parentId]), id: parentId });
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
	 * @param {Array} target
	 * @param {Array} source
	 */
	function addAllToSet(target, source) {
		for (let i = 0; i < source.length; i++) {
			const item = source[i];
			if (!target.includes(item)) target.push(item);
		}
	}

	/**
	 * Processes a single update result.
	 * @param {object} result
	 * @param {object} options
	 * @param {object} state
	 * @returns {boolean} true if processing should continue, false if abort
	 */
	function processUpdateResult(result, options, state) {
		const { moduleId } = result;
		const chainInfo = result.chain ? "\nUpdate propagation: " + result.chain.join(" -> ") : "";
		switch (result.type) {
			case "self-declined":
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) {
					state.abortError = new Error("Aborted because of self decline: " + moduleId + chainInfo);
				}
				break;
			case "declined":
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) {
					state.abortError = new Error(
						"Aborted because of declined dependency: " + moduleId + " in " + result.parentId + chainInfo
					);
				}
				break;
			case "unaccepted":
				if (options.onUnaccepted) options.onUnaccepted(result);
				if (!options.ignoreUnaccepted) {
					state.abortError = new Error("Aborted because " + moduleId + " is not accepted" + chainInfo);
				}
				break;
			case "accepted":
				if (options.onAccepted) options.onAccepted(result);
				state.doApply = true;
				break;
			case "disposed":
				if (options.onDisposed) options.onDisposed(result);
				state.doDispose = true;
				break;
			default:
				throw new Error("Unexpected type " + result.type);
		}
		return !state.abortError;
	}

	/**
	 * Applies updates according to HMR logic.
	 * @param {object} [options]
	 * @returns {Promise}
	 */
	function hotApply(options) {
		if (hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		const appliedUpdate = {};
		const outdatedModules = [];
		const outdatedDependencies = {};

		const warnUnexpectedRequire = function () {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		// Process each module in the update payload
		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;
			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: "disposed", moduleId: id };
			const state = { abortError: null, doApply: false, doDispose: false };
			if (!processUpdateResult(result, options, state)) {
				hotSetStatus("abort");
				return Promise.reject(state.abortError);
			}
			if (state.doApply) {
				appliedUpdate[moduleId] = hotUpdate[moduleId];
				addAllToSet(outdatedModules, result.outdatedModules);
				for (const depId in result.outdatedDependencies) {
					if (!Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depId)) continue;
					if (!outdatedDependencies[depId]) outdatedDependencies[depId] = [];
					addAllToSet(outdatedDependencies[depId], result.outdatedDependencies[depId]);
				}
			}
			if (state.doDispose) {
				addAllToSet(outdatedModules, [result.moduleId]);
				appliedUpdate[moduleId] = warnUnexpectedRequire;
			}
		}

		// Collect self‑accepted modules for later re‑execution
		const outdatedSelfAcceptedModules = [];
		for (let i = 0; i < outdatedModules.length; i++) {
			const modId = outdatedModules[i];
			const mod = installedModules[modId];
			if (mod && mod.hot._selfAccepted) {
				outdatedSelfAcceptedModules.push({
					module: modId,
					errorHandler: mod.hot._selfAccepted
				});
			}
		}

		// Dispose phase
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(chunkId => {
			if (hotAvailableFilesMap[chunkId] === false) hotDisposeChunk(chunkId);
		});

		disposeOutdatedModules(outdatedModules);
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

		// Run accept handlers
		const acceptError = runAcceptHandlers(outdatedDependencies, options);
		// Load self‑accepted modules
		const selfAcceptError = loadSelfAcceptedModules(outdatedSelfAcceptedModules, options);

		const finalError = acceptError || selfAcceptError;
		if (finalError) {
			hotSetStatus("fail");
			return Promise.reject(finalError);
		}

		hotSetStatus("idle");
		return Promise.resolve(outdatedModules);
	}

	/**
	 * Disposes outdated modules and cleans parent/child references.
	 * @param {Array} modulesToDispose
	 */
	function disposeOutdatedModules(modulesToDispose) {
		const queue = modulesToDispose.slice();
		while (queue.length) {
			const moduleId = queue.pop();
			const module = installedModules[moduleId];
			if (!module) continue;

			const data = {};

			// Call dispose handlers
			for (let i = 0; i < module.hot._disposeHandlers.length; i++) {
				module.hot._disposeHandlers[i](data);
			}
			hotCurrentModuleData[moduleId] = data;

			// Deactivate and remove from cache
			module.hot.active = false;
			delete installedModules[moduleId];

			// Remove parent references from children
			for (let i = 0; i < module.children.length; i++) {
				const child = installedModules[module.children[i]];
				if (!child) continue;
				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) child.parents.splice(idx, 1);
			}
		}
	}

	/**
	 * Removes outdated dependency links from module children.
	 * @param {object} outdatedDeps
	 */
	function removeOutdatedDependencies(outdatedDeps) {
		for (const moduleId in outdatedDeps) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDeps, moduleId)) continue;
			const module = installedModules[moduleId];
			if (!module) continue;
			const deps = outdatedDeps[moduleId];
			for (let i = 0; i < deps.length; i++) {
				const dep = deps[i];
				const idx = module.children.indexOf(dep);
				if (idx >= 0) module.children.splice(idx, 1);
			}
		}
	}

	/**
	 * Executes accept callbacks for outdated dependencies.
	 * @param {object} outdatedDeps
	 * @param {object} options
	 * @returns {Error|null}
	 */
	function runAcceptHandlers(outdatedDeps, options) {
		let firstError = null;
		for (const moduleId in outdatedDeps) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDeps, moduleId)) continue;
			const module = installedModules[moduleId];
			const deps = outdatedDeps[moduleId];
			const callbacks = [];

			for (let i = 0; i < deps.length; i++) {
				const dep = deps[i];
				const cb = module.hot._acceptedDependencies[dep];
				if (!callbacks.includes(cb)) callbacks.push(cb);
			}
			for (let i = 0; i < callbacks.length; i++) {
				try {
					callbacks[i](deps);
				} catch (err) {
					if (options.onErrored) {
						options.onErrored({
							type: "accept-errored",
							moduleId,
							dependencyId: deps[i],
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
	 * Loads modules that self‑accepted during the update.
	 * @param {Array} selfAccepted
	 * @param {object} options
	 * @returns {Error|null}
	 */
	function loadSelfAcceptedModules(selfAccepted, options) {
		let firstError = null;
		for (let i = 0; i < selfAccepted.length; i++) {
			const { module: moduleId, errorHandler } = selfAccepted[i];
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
		}
		return firstError;
	}
};