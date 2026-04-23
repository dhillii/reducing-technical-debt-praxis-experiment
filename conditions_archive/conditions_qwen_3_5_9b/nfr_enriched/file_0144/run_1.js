```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */

module.exports = function() {
	// Module state variables
	const hotApplyOnUpdate = true;
	const hotCurrentHash = $hash$;
	const hotCurrentModuleData = {};
	let hotCurrentChildModule;
	let hotCurrentParents = [];
	let hotCurrentParentsTemp = [];

	// Status management
	let hotStatusHandlers = [];
	let hotStatus = "idle";

	// Update tracking
	let hotWaitingFiles = 0;
	let hotChunksLoading = 0;
	let hotWaitingFilesMap = {};
	let hotRequestedFilesMap = {};
	let hotAvailableFilesMap = {};
	let hotDeferred = null;
	let hotUpdate = null;
	let hotUpdateNewHash = null;

	/**
	 * Convert module ID to number if possible
	 * @param {string|number} id - Module identifier
	 * @returns {number|string} - Normalized module ID
	 */
	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

	/**
	 * Set status and notify all registered handlers
	 * @param {string} newStatus - New status value
	 */
	function hotSetStatus(newStatus) {
		hotStatus = newStatus;
		hotStatusHandlers.forEach(handler => handler.call(null, newStatus));
	}

	/**
	 * Create a module-specific require function with hot module replacement support
	 * @param {number|string} moduleId - Module identifier
	 * @returns {Function} - Module-specific require function
	 */
	function hotCreateRequire(moduleId) {
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

		// Create property descriptors for require properties
		const ObjectFactory = (name) => ({
			configurable: true,
			enumerable: true,
			get: () => $require$[name],
			set: (value) => { $require$[name] = value; }
		});

		for (const name in $require$) {
			if (Object.prototype.hasOwnProperty.call($require$, name) && name !== "e") {
				Object.defineProperty(fn, name, ObjectFactory(name));
			}
		}

		// Add chunk loading support
		fn.e = (chunkId) => {
			if (hotStatus === "ready") hotSetStatus("prepare");
			hotChunksLoading++;
			return $require$.e(chunkId).then(finishChunkLoading, (err) => {
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
	 * Create a module hot object with HMR API
	 * @param {number|string} moduleId - Module identifier
	 * @returns {Object} - Module hot object with HMR API
	 */
	function hotCreateModule(moduleId) {
		const hot = {
			// Private state
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: hotCurrentChildModule !== moduleId,

			// Module API
			active: true,
			accept: (dep, callback) => {
				if (typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if (typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if (Array.isArray(dep)) {
					dep.forEach((d) => {
						hot._acceptedDependencies[d] = callback || (() => {});
					});
				} else {
					hot._acceptedDependencies[dep] = callback || (() => {});
				}
			},
			decline: (dep) => {
				if (typeof dep === "undefined") {
					hot._selfDeclined = true;
				} else if (Array.isArray(dep)) {
					dep.forEach((d) => {
						hot._declinedDependencies[d] = true;
					});
				} else {
					hot._declinedDependencies[dep] = true;
				}
			},
			dispose: (callback) => {
				hot._disposeHandlers.push(callback);
			},
			addDisposeHandler: (callback) => {
				hot._disposeHandlers.push(callback);
			},
			removeDisposeHandler: (callback) => {
				const idx = hot._disposeHandlers.indexOf(callback);
				if (idx >= 0) hot._disposeHandlers.splice(idx, 1);
			},

			// Management API
			check: hotCheck,
			apply: hotApply,
			status: (l) => {
				if (!l) return hotStatus;
				hotStatusHandlers.push(l);
			},
			addStatusHandler: (l) => {
				hotStatusHandlers.push(l);
			},
			removeStatusHandler: (l) => {
				const idx = hotStatusHandlers.indexOf(l);
				if (idx >= 0) hotStatusHandlers.splice(idx, 1);
			},

			// Inherit from previous dispose call
			data: hotCurrentModuleData[moduleId]
		};
		hotCurrentChildModule = undefined;
		return hot;
	}

	/**
	 * Ensure update chunk is downloaded
	 * @param {string} chunkId - Chunk identifier
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
	 * Handle downloaded updates
	 */
	function hotUpdateDownloaded() {
		hotSetStatus("ready");
		const deferred = hotDeferred;
		hotDeferred = null;
		if (!deferred) return;

		if (hotApplyOnUpdate) {
			hotApply(hotApplyOnUpdate).then(
				(result) => deferred.resolve(result),
				(err) => deferred.reject(err)
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
	 * Check for updates
	 * @param {boolean} apply - Whether to apply updates
	 * @returns {Promise} - Promise resolving to update info or null
	 */
	function hotCheck(apply) {
		if (hotStatus !== "idle") {
			throw new Error("check() is only allowed in idle status");
		}
		hotApplyOnUpdate = apply;
		hotSetStatus("check");
		return hotDownloadManifest().then((update) => {
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
				hotDeferred = {
					resolve,
					reject
				};
			});

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
	 * Add update chunk
	 * @param {string} chunkId - Chunk identifier
	 * @param {Object} moreModules - Additional modules
	 */
	function hotAddUpdateChunk(chunkId, moreModules) {
		if (!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId]) {
			return;
		}
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
	 * Add items to set without duplicates
	 * @param {Array} target - Target array
	 * @param {Array} items - Items to add
	 */
	function addAllToSet(target, items) {
		items.forEach((item) => {
			if (target.indexOf(item) < 0) {
				target.push(item);
			}
		});
	}

	/**
	 * Get affected modules and dependencies for update
	 * @param {number|string} updateModuleId - Module ID to update
	 * @returns {Object} - Result with type, chain, modules, and dependencies
	 */
	function getAffectedStuff(updateModuleId) {
		const outdatedModules = [updateModuleId];
		const outdatedDependencies = {};

		const queue = outdatedModules.slice().map((id) => ({
			chain: [id],
			id
		}));

		while (queue.length > 0) {
			const queueItem = queue.pop();
			const moduleId = queueItem.id;
			const chain = queueItem.chain;
			const module = installedModules[moduleId];

			if (!module || module.hot._selfAccepted) {
				continue;
			}

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

				if (!parent) {
					continue;
				}

				if (parent.hot._declinedDependencies[moduleId]) {
					return {
						type: "declined",
						chain: chain.concat([parentId]),
						moduleId,
						parentId
					};
				}

				if (outdatedModules.indexOf(parentId) >= 0) {
					continue;
				}

				if (parent.hot._acceptedDependencies[moduleId]) {
					if (!outdatedDependencies[parentId]) {
						outdatedDependencies[parentId] = [];
					}
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

	/**
	 * Process update result and handle errors
	 * @param {Object} result - Update result from getAffectedStuff
	 * @param {Object} options - Apply options
	 * @returns {Error|null} - Error if update should abort, null otherwise
	 */
	function processUpdateResult(result, options) {
		const chainInfo = result.chain ? "\nUpdate propagation: " + result.chain.join(" -> ") : "";

		switch (result.type) {
			case "self-declined":
				if (options.onDeclined) {
					options.onDeclined(result);
				}
				if (!options.ignoreDeclined) {
					return new Error("Aborted because of self decline: " + result.moduleId + chainInfo);
				}
				break;

			case "declined":
				if (options.onDeclined) {
					options.onDeclined(result);
				}
				if (!options.ignoreDeclined) {
					return new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + chainInfo);
				}
				break;

			case "unaccepted":
				if (options.onUnaccepted) {
					options.onUnaccepted(result);
				}
				if (!options.ignoreUnaccepted) {
					return new Error("Aborted because " + result.moduleId + " is not accepted" + chainInfo);
				}
				break;

			case "accepted":
				if (options.onAccepted) {
					options.onAccepted(result);
				}
				break;

			case "disposed":
				if (options.onDisposed) {
					options.onDisposed(result);
				}
				break;

			default:
				throw new Error("Unexception type " + result.type);
		}

		return null;
	}

	/**
	 * Warn about unexpected require to disposed module
	 * @param {Object} result - Update result
	 */
	function warnUnexpectedRequire(result) {
		console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
	}

	/**
	 * Apply hot module updates
	 * @param {Object} options - Apply options
	 * @returns {Promise} - Promise resolving to outdated modules
	 */
	function hotApply(options) {
		if (hotStatus !== "ready") {
			throw new Error("apply() is only allowed in ready status");
		}

		options = options || {};
		const outdatedDependencies = {};
		const outdatedModules = [];
		const appliedUpdate = {};
		const outdatedSelfAcceptedModules = [];

		// Phase 1: Analyze dependencies
		for (const id in hotUpdate) {
			if (Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
				const moduleId = toModuleId(id);
				let result;

				if (hotUpdate[id]) {
					result = getAffectedStuff(moduleId);
				} else {
					result = {
						type: "disposed",
						moduleId: id
					};
				}

				const abortError = processUpdateResult(result, options);
				if (abortError) {
					hotSetStatus("abort");
					return Promise.reject(abortError);
				}

				if (result.type === "accepted") {
					appliedUpdate[moduleId] = hotUpdate[moduleId];
					addAllToSet(outdatedModules, result.outdatedModules);
					for (const depId in result.outdatedDependencies) {
						if (Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depId)) {
							if (!outdatedDependencies[depId]) {
								outdatedDependencies[depId] = [];
							}
							addAllToSet(outdatedDependencies[depId], result.outdatedDependencies[depId]);
						}
					}
				}

				if (result.type === "disposed") {
					addAllToSet(outdatedModules, [result.moduleId]);
					appliedUpdate[moduleId] = warnUnexpectedRequire;
				}
			}
		}

		// Collect self-accepted modules
		for (let i = 0; i < outdatedModules.length; i++) {
			const moduleId = outdatedModules[i];
			const module = installedModules[moduleId];

			if (module && module.hot._selfAccepted) {
				outdatedSelfAcceptedModules.push({
					module: moduleId,
					errorHandler: module.hot._selfAccepted
				});
			}
		}

		// Phase 2: Dispose modules
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach((chunkId) => {
			if (hotAvailableFilesMap[chunkId] === false) {
				hotDisposeChunk(chunkId);
			}
		});

		const disposeQueue = outdatedModules.slice();
		while (disposeQueue.length > 0) {
			const moduleId = disposeQueue.pop();
			const module = installedModules[moduleId];

			if (!module) {
				continue;
			}

			const data = {};

			// Call dispose handlers
			const disposeHandlers = module.hot._disposeHandlers;
			for (let j = 0; j < disposeHandlers.length; j++) {
				const cb = disposeHandlers[j];
				cb(data);
			}
			hotCurrentModuleData[moduleId] = data;

			// Disable module
			module.hot.active = false;

			// Remove from cache
			delete installedModules[moduleId];

			// Remove parent references from children
			for (let j = 0; j < module.children.length; j++) {
				const child = installedModules[module.children[j]];

				if (!child) {
					continue;
				}

				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) {
					child.parents.splice(idx, 1);
				}
			}
		}

		// Remove outdated dependencies from module children
		for (const moduleId in outdatedDependencies) {
			if (Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) {
				const module = installedModules[moduleId];

				if (module) {
					const moduleOutdatedDependencies = outdatedDependencies[moduleId];
					for (let j = 0; j < moduleOutdatedDependencies.length; j++) {
						const dependency = moduleOutdatedDependencies[j];
						const idx = module.children.indexOf(dependency);

						if (idx >= 0) {
							module.children.splice(idx, 1);
						}
					}
				}
			}
		}

		// Phase 3: Apply updates
		hotSetStatus("apply");
		hotCurrentHash = hotUpdateNewHash;

		for (const moduleId in appliedUpdate) {
			if (Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}

		// Phase 4: Call accept handlers
		let error = null;
		for (const moduleId in outdatedDependencies) {
			if (Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) {
				const module = installedModules[moduleId];

				if (module) {
					const moduleOutdatedDependencies = outdatedDependencies[moduleId];
					const callbacks = [];

					for (let i = 0; i < moduleOutdatedDependencies.length; i++) {
						const dependency = moduleOutdatedDependencies[i];
						const cb = module.hot._acceptedDependencies[dependency];

						if (callbacks.indexOf(cb) >= 0) {
							continue;
						}
						callbacks.push(cb);
					}

					for (let i = 0; i < callbacks.length; i++) {
						const cb = callbacks[i];
						try {
							cb(moduleOutdatedDependencies);
						} catch (err) {
							if (options.onErrored) {
								options.onErrored({
									type: "accept-errored",
									moduleId,
									dependencyId: moduleOutdatedDependencies[i],
									error: err
								});
							}
							if (!options.ignoreErrored) {
								if (!error) {
									error = err;
								}
							}
						}
					}
				}
			}
		}

		// Phase 5: Load self-accepted modules
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
						if (!options.ignoreErrored) {
							if (!error) {
								error = err2;
							}
						}
						if (!error) {
							error = err;
						}
					}
				} else {
					if (options.onErrored) {
						options.onErrored({
							type: "self-accept-errored",
							moduleId,
							error: err
						});
					}
					if (!options.ignoreErrored) {
						if (!error) {
							error = err;
						}
					}
				}
			}
		}

		// Handle errors
		if (error) {
			hotSetStatus("fail");
			return Promise.reject(error);
		}

		hotSetStatus("idle");
		return new Promise((resolve) => {
			resolve(outdatedModules);
		});
	}
};
```