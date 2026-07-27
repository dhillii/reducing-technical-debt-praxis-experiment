/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {

	const hotApplyOnUpdateDefault = true;
	let hotApplyOnUpdate = hotApplyOnUpdateDefault;
	const hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	const hotCurrentModuleData = {};
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	let hotCurrentParents = []; // eslint-disable-line no-unused-vars
	let hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	/**
	 * Creates a require function that tracks hot module relationships.
	 * @param {string|number} moduleId
	 * @returns {function(string): any}
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
				if (me.children.indexOf(request) < 0) {
					me.children.push(request);
				}
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents = [];
			}
			return $require$(request);
		};

		const ObjectFactory = function ObjectFactory(name) {
			return {
				configurable: true,
				enumerable: true,
				get: function() {
					return $require$[name];
				},
				set: function(value) {
					$require$[name] = value;
				}
			};
		};

		for (const name in $require$) {
			if (Object.prototype.hasOwnProperty.call($require$, name) && name !== "e") {
				Object.defineProperty(fn, name, ObjectFactory(name));
			}
		}

		fn.e = function(chunkId) {
			if (hotStatus === "ready") hotSetStatus("prepare");
			hotChunksLoading++;
			return $require$.e(chunkId).then(finishChunkLoading, function(err) {
				finishChunkLoading();
				throw err;
			});

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
		};

		return fn;
	}

	/**
	 * Creates a hot module object for a given module id.
	 * @param {string|number} moduleId
	 * @returns {object}
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
			accept: function(dep, callback) {
				if (typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if (typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if (Array.isArray(dep)) {
					for (let i = 0; i < dep.length; i++) {
						hot._acceptedDependencies[dep[i]] = callback || function() {};
					}
				} else {
					hot._acceptedDependencies[dep] = callback || function() {};
				}
			},
			decline: function(dep) {
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
			dispose: function(callback) {
				hot._disposeHandlers.push(callback);
			},
			addDisposeHandler: function(callback) {
				hot._disposeHandlers.push(callback);
			},
			removeDisposeHandler: function(callback) {
				const idx = hot._disposeHandlers.indexOf(callback);
				if (idx >= 0) hot._disposeHandlers.splice(idx, 1);
			},

			// Management API
			check: hotCheck,
			apply: hotApply,
			status: function(l) {
				if (!l) return hotStatus;
				hotStatusHandlers.push(l);
			},
			addStatusHandler: function(l) {
				hotStatusHandlers.push(l);
			},
			removeStatusHandler: function(l) {
				const idx = hotStatusHandlers.indexOf(l);
				if (idx >= 0) hotStatusHandlers.splice(idx, 1);
			},

			//inherit from previous dispose call
			data: hotCurrentModuleData[moduleId]
		};
		hotCurrentChildModule = undefined;
		return hot;
	}

	const hotStatusHandlers = [];
	let hotStatus = "idle";

	/**
	 * Updates the current hot status and notifies handlers.
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

	/**
	 * Normalizes a module id to number if possible.
	 * @param {string} id
	 * @returns {string|number}
	 */
	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

	/**
	 * Checks for updates and prepares download.
	 * @param {boolean} apply
	 * @returns {Promise<null|Array>}
	 */
	function hotCheck(apply) {
		if (hotStatus !== "idle") throw new Error("check() is only allowed in idle status");
		hotApplyOnUpdate = apply;
		hotSetStatus("check");
		return hotDownloadManifest().then(function(update) {
			if (!update) {
				hotSetStatus("idle");
				return null;
			}
			hotRequestedFilesMap = {};
			hotWaitingFilesMap = {};
			hotAvailableFilesMap = update.c;
			hotUpdateNewHash = update.h;

			hotSetStatus("prepare");
			const promise = new Promise(function(resolve, reject) {
				hotDeferred = {
					resolve,
					reject
				};
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
	 * Handles an incoming update chunk.
	 * @param {string|number} chunkId
	 * @param {object} moreModules
	 */
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

	/**
	 * Ensures a chunk is requested for update.
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
			hotApply(hotApplyOnUpdate).then(function(result) {
				deferred.resolve(result);
			}, function(err) {
				deferred.reject(err);
			});
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
	 * Determines whether a result type should abort the apply process.
	 * @param {object} result
	 * @param {object} options
	 * @returns {Error|false}
	 */
	function getAbortError(result, options) {
		const chainInfo = result.chain ? "\nUpdate propagation: " + result.chain.join(" -> ") : "";
		switch (result.type) {
			case "self-declined":
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) {
					return new Error("Aborted because of self decline: " + result.moduleId + chainInfo);
				}
				break;
			case "declined":
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) {
					return new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + chainInfo);
				}
				break;
			case "unaccepted":
				if (options.onUnaccepted) options.onUnaccepted(result);
				if (!options.ignoreUnaccepted) {
					return new Error("Aborted because " + result.moduleId + " is not accepted" + chainInfo);
				}
				break;
			default:
				return false;
		}
		return false;
	}

	/**
	 * Handles accepted results.
	 * @param {object} result
	 * @param {object} appliedUpdate
	 * @param {Array} outdatedModules
	 * @param {object} outdatedDependencies
	 */
	function handleAccepted(result, appliedUpdate, outdatedModules, outdatedDependencies) {
		const moduleId = result.moduleId;
		appliedUpdate[moduleId] = hotUpdate[moduleId];
		addAllToSet(outdatedModules, result.outdatedModules);
		for (const depModuleId in result.outdatedDependencies) {
			if (Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depModuleId)) {
				if (!outdatedDependencies[depModuleId]) outdatedDependencies[depModuleId] = [];
				addAllToSet(outdatedDependencies[depModuleId], result.outdatedDependencies[depModuleId]);
			}
		}
	}

	/**
	 * Handles disposed results.
	 * @param {object} result
	 * @param {object} appliedUpdate
	 * @param {Array} outdatedModules
	 */
	function handleDisposed(result, appliedUpdate, outdatedModules) {
		addAllToSet(outdatedModules, [result.moduleId]);
		appliedUpdate[result.moduleId] = warnUnexpectedRequire;
	}

	/**
	 * Warns about unexpected require calls.
	 */
	const warnUnexpectedRequire = function() {
		console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
	};

	/**
	 * Adds all items from source array to target array if not already present.
	 * @param {Array} target
	 * @param {Array} source
	 */
	function addAllToSet(target, source) {
		for (let i = 0; i < source.length; i++) {
			const item = source[i];
			if (target.indexOf(item) < 0) target.push(item);
		}
	}

	/**
	 * Applies updates based on the provided options.
	 * @param {object} [options]
	 * @returns {Promise<Array>}
	 */
	function hotApply(options) {
		if (hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		const outdatedDependencies = {};
		const outdatedModules = [];
		const appliedUpdate = {};

		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;

			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: "disposed", moduleId: id };

			const abortError = getAbortError(result, options);
			if (abortError) {
				hotSetStatus("abort");
				return Promise.reject(abortError);
			}

			if (result.type === "accepted") {
				handleAccepted(result, appliedUpdate, outdatedModules, outdatedDependencies);
			} else if (result.type === "disposed") {
				handleDisposed(result, appliedUpdate, outdatedModules);
			}
		}

		// Store self accepted outdated modules to require them later by the module system
		const outdatedSelfAcceptedModules = [];
		for (let i = 0; i < outdatedModules.length; i++) {
			const moduleId = outdatedModules[i];
			const mod = installedModules[moduleId];
			if (mod && mod.hot._selfAccepted) {
				outdatedSelfAcceptedModules.push({
					module: moduleId,
					errorHandler: mod.hot._selfAccepted
				});
			}
		}

		// Dispose phase
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(function(chunkId) {
			if (hotAvailableFilesMap[chunkId] === false) {
				hotDisposeChunk(chunkId);
			}
		});

		const disposeQueue = outdatedModules.slice();
		while (disposeQueue.length > 0) {
			const moduleId = disposeQueue.pop();
			const mod = installedModules[moduleId];
			if (!mod) continue;

			const data = {};

			// Call dispose handlers
			const disposeHandlers = mod.hot._disposeHandlers;
			for (let j = 0; j < disposeHandlers.length; j++) {
				const cb = disposeHandlers[j];
				cb(data);
			}
			hotCurrentModuleData[moduleId] = data;

			// disable module (this disables requires from this module)
			mod.hot.active = false;

			// remove module from cache
			delete installedModules[moduleId];

			// remove "parents" references from all children
			for (let j = 0; j < mod.children.length; j++) {
				const child = installedModules[mod.children[j]];
				if (!child) continue;
				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) child.parents.splice(idx, 1);
			}
		}

		// remove outdated dependency from module children
		for (const parentId in outdatedDependencies) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, parentId)) continue;
			const parentMod = installedModules[parentId];
			if (!parentMod) continue;
			const deps = outdatedDependencies[parentId];
			for (let j = 0; j < deps.length; j++) {
				const dep = deps[j];
				const idx = parentMod.children.indexOf(dep);
				if (idx >= 0) parentMod.children.splice(idx, 1);
			}
		}

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
		let error = null;
		for (const parentId in outdatedDependencies) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, parentId)) continue;
			const parentMod = installedModules[parentId];
			const deps = outdatedDependencies[parentId];
			const callbacks = [];
			for (let i = 0; i < deps.length; i++) {
				const dep = deps[i];
				const cb = parentMod.hot._acceptedDependencies[dep];
				if (callbacks.indexOf(cb) >= 0) continue;
				callbacks.push(cb);
			}
			for (let i = 0; i < callbacks.length; i++) {
				const cb = callbacks[i];
				try {
					cb(deps);
				} catch (err) {
					if (options.onErrored) {
						options.onErrored({
							type: "accept-errored",
							moduleId: parentId,
							dependencyId: deps[i],
							error: err
						});
					}
					if (!options.ignoreErrored && !error) {
						error = err;
					}
				}
			}
		}

		// Load self accepted modules
		for (let i = 0; i < outdatedSelfAcceptedModules.length; i++) {
			const item = outdatedSelfAcceptedModules[i];
			const moduleId = item.module;
			hotCurrentParents = [moduleId];
			try {
				$require$(moduleId);
			} catch (err) {
				if (typeof item.errorHandler === "function") {
					try {
						item.errorHandler(err);
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

		// handle errors in accept handlers and self accepted module load
		if (error) {
			hotSetStatus("fail");
			return Promise.reject(error);
		}

		hotSetStatus("idle");
		return Promise.resolve(outdatedModules);
	}

	/**
	 * Determines affected modules for a given update.
	 * @param {string|number} updateModuleId
	 * @returns {object}
	 */
	function getAffectedStuff(updateModuleId) {
		const outdatedModules = [updateModuleId];
		const outdatedDependencies = {};

		const queue = outdatedModules.slice().map(function(id) {
			return {
				chain: [id],
				id: id
			};
		});

		while (queue.length > 0) {
			const queueItem = queue.pop();
			const moduleId = queueItem.id;
			const chain = queueItem.chain;
			const module = installedModules[moduleId];
			if (!module || module.hot._selfAccepted) continue;
			if (module.hot._selfDeclined) {
				return {
					type: "self-declined",
					chain,
					moduleId
				};
			}
			if (module.hot._main) {
				return {
					type: "unaccepted",
					chain,
					moduleId
				};
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
				if (outdatedModules.indexOf(parentId) >= 0) continue;
				if (parent.hot._acceptedDependencies[moduleId]) {
					if (!outdatedDependencies[parentId]) outdatedDependencies[parentId] = [];
					addAllToSet(outdatedDependencies[parentId], [moduleId]);
					continue;
				}
				delete outdatedDependencies[parentId];
				outdatedModules.push(parentId);
				queue.push({
					chain: chain.concat([parentId]),
					id: parentId
				});
			}
		}

		return {
			type: "accepted",
			moduleId: updateModuleId,
			outdatedModules,
			outdatedDependencies
		};
	}
};