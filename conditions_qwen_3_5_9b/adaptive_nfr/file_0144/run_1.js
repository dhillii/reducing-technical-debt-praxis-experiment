```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {

	const hotApplyOnUpdate = true;
	const hotCurrentHash = $hash$;
	const hotCurrentModuleData = {};
	let hotCurrentChildModule;
	const hotCurrentParents = [];
	const hotCurrentParentsTemp = [];

	/**
	 * Creates a require function for a specific module with HMR support
	 * @param {string} moduleId - The module ID
	 * @returns {Function} A require function with HMR capabilities
	 */
	function hotCreateRequire(moduleId) {
		const me = installedModules[moduleId];
		if (!me) return $require$;

		const fn = function(request) {
			if (!me.hot.active) {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents = [];
				return $require$(request);
			}

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

			return $require$(request);
		};

		const ObjectFactory = function(name) {
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
			if (hotStatus === "ready") {
				hotSetStatus("prepare");
			}
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
	 * Creates a module hot object with HMR capabilities
	 * @param {string} moduleId - The module ID
	 * @returns {Object} A hot module object with HMR API
	 */
	function hotCreateModule(moduleId) {
		const hot = {
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: hotCurrentChildModule !== moduleId,

			active: true,

			accept: function(dep, callback) {
				if (typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if (typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if (typeof dep === "object") {
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
				} else if (typeof dep === "object") {
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
				if (idx >= 0) {
					hot._disposeHandlers.splice(idx, 1);
				}
			},

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
				if (idx >= 0) {
					hotStatusHandlers.splice(idx, 1);
				}
			},

			data: hotCurrentModuleData[moduleId]
		};

		hotCurrentChildModule = undefined;
		return hot;
	}

	let hotStatusHandlers = [];
	let hotStatus = "idle";

	/**
	 * Sets the current hot status and notifies all handlers
	 * @param {string} newStatus - The new status to set
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
	let hotUpdate, hotUpdateNewHash;

	/**
	 * Converts a module ID to a proper module identifier
	 * @param {string|number} id - The module ID
	 * @returns {number|string} The converted module ID
	 */
	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

	/**
	 * Checks for available updates
	 * @param {boolean} apply - Whether to apply updates
	 * @returns {Promise|null} A promise with update information or null
	 */
	function hotCheck(apply) {
		if (hotStatus !== "idle") {
			throw new Error("check() is only allowed in idle status");
		}
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
					resolve: resolve,
					reject: reject
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
	 * Adds an update chunk to the pending updates
	 * @param {string} chunkId - The chunk ID
	 * @param {Object} moreModules - The modules in the chunk
	 */
	function hotAddUpdateChunk(chunkId, moreModules) { // eslint-disable-line no-unused-vars
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
	 * Ensures an update chunk is available and requested
	 * @param {string} chunkId - The chunk ID
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
	 * Handles the completion of update downloads
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
	 * Applies the update to the module system
	 * @param {Object} options - The apply options
	 * @returns {Promise} A promise with the result
	 */
	function hotApply(options) {
		if (hotStatus !== "ready") {
			throw new Error("apply() is only allowed in ready status");
		}

		options = options || {};

		const cb = null;
		const i = null;
		const j = null;
		let module = null;
		let moduleId = null;

		/**
		 * Determines which modules are affected by an update
		 * @param {string} updateModuleId - The module ID being updated
		 * @returns {Object} Information about affected modules
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
				const queueModuleId = queueItem.id;
				const queueChain = queueItem.chain;
				module = installedModules[queueModuleId];

				if (!module || module.hot._selfAccepted) {
					continue;
				}

				if (module.hot._selfDeclined) {
					return {
						type: "self-declined",
						chain: queueChain,
						moduleId: queueModuleId
					};
				}

				if (module.hot._main) {
					return {
						type: "unaccepted",
						chain: queueChain,
						moduleId: queueModuleId
					};
				}

				for (let p = 0; p < module.parents.length; p++) {
					const parentId = module.parents[p];
					const parent = installedModules[parentId];

					if (!parent) {
						continue;
					}

					if (parent.hot._declinedDependencies[queueModuleId]) {
						return {
							type: "declined",
							chain: queueChain.concat([parentId]),
							moduleId: queueModuleId,
							parentId: parentId
						};
					}

					if (outdatedModules.indexOf(parentId) >= 0) {
						continue;
					}

					if (parent.hot._acceptedDependencies[queueModuleId]) {
						if (!outdatedDependencies[parentId]) {
							outdatedDependencies[parentId] = [];
						}
						addAllToSet(outdatedDependencies[parentId], [queueModuleId]);
						continue;
					}

					delete outdatedDependencies[parentId];
					outdatedModules.push(parentId);
					queue.push({
						chain: queueChain.concat([parentId]),
						id: parentId
					});
				}
			}

			return {
				type: "accepted",
				moduleId: updateModuleId,
				outdatedModules: outdatedModules,
				outdatedDependencies: outdatedDependencies
			};
		}

		/**
		 * Adds all items from array b to array a
		 * @param {Array} a - The target array
		 * @param {Array} b - The source array
		 */
		function addAllToSet(a, b) {
			for (let k = 0; k < b.length; k++) {
				const item = b[k];
				if (a.indexOf(item) < 0) {
					a.push(item);
				}
			}
		}

		// at begin all updates modules are outdated
		// the "outdated" status can propagate to parents if they don't accept the children
		const outdatedDependencies = {};
		const outdatedModules = [];
		const appliedUpdate = {};

		const warnUnexpectedRequire = function() {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		for (const id in hotUpdate) {
			if (Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
				moduleId = toModuleId(id);
				let result = null;

				if (hotUpdate[id]) {
					result = getAffectedStuff(moduleId);
				} else {
					result = {
						type: "disposed",
						moduleId: id
					};
				}

				let abortError = null;
				let doApply = false;
				let doDispose = false;
				let chainInfo = "";

				if (result.chain) {
					chainInfo = "\nUpdate propagation: " + result.chain.join(" -> ");
				}

				switch (result.type) {
					case "self-declined":
						if (options.onDeclined) {
							options.onDeclined(result);
						}
						if (!options.ignoreDeclined) {
							abortError = new Error("Aborted because of self decline: " + result.moduleId + chainInfo);
						}
						break;
					case "declined":
						if (options.onDeclined) {
							options.onDeclined(result);
						}
						if (!options.ignoreDeclined) {
							abortError = new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + chainInfo);
						}
						break;
					case "unaccepted":
						if (options.onUnaccepted) {
							options.onUnaccepted(result);
						}
						if (!options.ignoreUnaccepted) {
							abortError = new Error("Aborted because " + moduleId + " is not accepted" + chainInfo);
						}
						break;
					case "accepted":
						if (options.onAccepted) {
							options.onAccepted(result);
						}
						doApply = true;
						break;
					case "disposed":
						if (options.onDisposed) {
							options.onDisposed(result);
						}
						doDispose = true;
						break;
					default:
						throw new Error("Unexception type " + result.type);
				}

				if (abortError) {
					hotSetStatus("abort");
					return Promise.reject(abortError);
				}

				if (doApply) {
					appliedUpdate[moduleId] = hotUpdate[moduleId];
					addAllToSet(outdatedModules, result.outdatedModules);

					for (const moduleId2 in result.outdatedDependencies) {
						if (Object.prototype.hasOwnProperty.call(result.outdatedDependencies, moduleId2)) {
							if (!outdatedDependencies[moduleId2]) {
								outdatedDependencies[moduleId2] = [];
							}
							addAllToSet(outdatedDependencies[moduleId2], result.outdatedDependencies[moduleId2]);
						}
					}
				}

				if (doDispose) {
					addAllToSet(outdatedModules, [result.moduleId]);
					appliedUpdate[moduleId] = warnUnexpectedRequire;
				}
			}
		}

		// Store self accepted outdated modules to require them later by the module system
		const outdatedSelfAcceptedModules = [];
		for (let m = 0; m < outdatedModules.length; m++) {
			moduleId = outdatedModules[m];
			if (installedModules[moduleId] && installedModules[moduleId].hot._selfAccepted) {
				outdatedSelfAcceptedModules.push({
					module: moduleId,
					errorHandler: installedModules[moduleId].hot._selfAccepted
				});
			}
		}

		// Now in "dispose" phase
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(function(chunkId) {
			if (hotAvailableFilesMap[chunkId] === false) {
				hotDisposeChunk(chunkId);
			}
		});

		const idx = null;
		const queue = outdatedModules.slice();

		while (queue.length > 0) {
			moduleId = queue.pop();
			module = installedModules[moduleId];

			if (!module) {
				continue;
			}

			const data = {};

			// Call dispose handlers
			const disposeHandlers = module.hot._disposeHandlers;
			for (let d = 0; d < disposeHandlers.length; d++) {
				cb = disposeHandlers[d];
				cb(data);
			}
			hotCurrentModuleData[moduleId] = data;

			// disable module (this disables requires from this module)
			module.hot.active = false;

			// remove module from cache
			delete installedModules[moduleId];

			// remove "parents" references from all children
			for (let c = 0; c < module.children.length; c++) {
				const child = installedModules[module.children[c]];

				if (!child) {
					continue;
				}

				idx = child.parents.indexOf(moduleId);
				if (idx >= 0) {
					child.parents.splice(idx, 1);
				}
			}
		}

		// remove outdated dependency from module children
		const dependency = null;
		const moduleOutdatedDependencies = null;
		for (const moduleId3 in outdatedDependencies) {
			if (Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId3)) {
				module = installedModules[moduleId3];

				if (module) {
					moduleOutdatedDependencies = outdatedDependencies[moduleId3];

					for (let o = 0; o < moduleOutdatedDependencies.length; o++) {
						dependency = moduleOutdatedDependencies[o];
						idx = module.children.indexOf(dependency);
						if (idx >= 0) {
							module.children.splice(idx, 1);
						}
					}
				}
			}
		}

		// Not in "apply" phase
		hotSetStatus("apply");

		hotCurrentHash = hotUpdateNewHash;

		// insert new code
		for (const moduleId4 in appliedUpdate) {
			if (Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId4)) {
				modules[moduleId4] = appliedUpdate[moduleId4];
			}
		}

		// call accept handlers
		let error = null;
		for (const moduleId5 in outdatedDependencies) {
			if (Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId5)) {
				module = installedModules[moduleId5];
				moduleOutdatedDependencies = outdatedDependencies[moduleId5];
				const callbacks = [];

				for (let a = 0; a < moduleOutdatedDependencies.length; a++) {
					dependency = moduleOutdatedDependencies[a];
					cb = module.hot._acceptedDependencies[dependency];

					if (callbacks.indexOf(cb) >= 0) {
						continue;
					}
					callbacks.push(cb);
				}

				for (let b = 0; b < callbacks.length; b++) {
					cb = callbacks[b];
					try {
						cb(moduleOutdatedDependencies);
					} catch (err) {
						if (options.onErrored) {
							options.onErrored({
								type: "accept-errored",
								moduleId: moduleId5,
								dependencyId: moduleOutdatedDependencies[a],
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

		// Load self accepted modules
		for (let c = 0; c < outdatedSelfAcceptedModules.length; c++) {
			const item = outdatedSelfAcceptedModules[c];
			moduleId = item.module;
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
								moduleId: moduleId,
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
							moduleId: moduleId,
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

		// handle errors in accept handlers and self accepted module load
		if (error) {
			hotSetStatus("fail");
			return Promise.reject(error);
		}

		hotSetStatus("idle");
		return new Promise(function(resolve) {
			resolve(outdatedModules);
		});
	}
};
```