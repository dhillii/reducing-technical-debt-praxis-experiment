/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {

	const hotApplyOnUpdate = true;
	const hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	const hotCurrentModuleData = {};
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	const hotCurrentParents = []; // eslint-disable-line no-unused-vars
	const hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	/**
	 * Creates a require function capable of tracking module dependencies for HMR
	 * @param {string} moduleId - The ID of the module creating the require
	 * @returns {Function} - A wrapped require function
	 */
	function hotCreateRequire(moduleId) { // eslint-disable-line no-unused-vars
		const me = installedModules[moduleId];
		if(!me) return $require$;

		/**
		 * HMR-aware require function
		 * @param {string} request - Module request
		 * @returns {any} - The requested module
		 */
		const fn = function(request) {
			if(!me.hot.active) {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents = [];
				return $require$(request);
			}

			if(installedModules[request]) {
				if(installedModules[request].parents.indexOf(moduleId) < 0)
					installedModules[request].parents.push(moduleId);
			} else {
				hotCurrentParents = [moduleId];
				hotCurrentChildModule = request;
			}

			if(me.children.indexOf(request) < 0)
				me.children.push(request);

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

		for(const name in $require$) {
			if(Object.prototype.hasOwnProperty.call($require$, name) && name !== "e") {
				Object.defineProperty(fn, name, ObjectFactory(name));
			}
		}

		/**
		 * Handles chunk loading for hot updates
		 * @param {string} chunkId - The chunk ID to load
		 * @returns {Promise} - Promise resolving when chunk is loaded
		 */
		fn.e = function(chunkId) {
			if(hotStatus === "ready")
				hotSetStatus("prepare");

			hotChunksLoading++;
			return $require$.e(chunkId).then(finishChunkLoading, function(err) {
				finishChunkLoading();
				throw err;
			});

			/**
			 * Called when chunk loading completes
			 */
			function finishChunkLoading() {
				hotChunksLoading--;
				if(hotStatus !== "prepare") return;

				if(!hotWaitingFilesMap[chunkId]) {
					hotEnsureUpdateChunk(chunkId);
				}

				if(hotChunksLoading === 0 && hotWaitingFiles === 0) {
					hotUpdateDownloaded();
				}
			}
		};

		return fn;
	}

	/**
	 * Creates an HMR object for a module
	 * @param {string} moduleId - The module ID
	 * @returns {Object} - The HMR object for the module
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
				if(typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if(typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if(Array.isArray(dep)) {
					for(let i = 0; i < dep.length; i++) {
						hot._acceptedDependencies[dep[i]] = callback || function() {};
					}
				} else {
					hot._acceptedDependencies[dep] = callback || function() {};
				}
			},
			decline: function(dep) {
				if(Array.isArray(dep)) {
					for(let i = 0; i < dep.length; i++) {
						hot._declinedDependencies[dep[i]] = true;
					}
				} else if(typeof dep === "undefined") {
					hot._selfDeclined = true;
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
				if(idx >= 0) hot._disposeHandlers.splice(idx, 1);
			},

			// Management API
			check: hotCheck,
			apply: hotApply,
			status: function(l) {
				if(!l) return hotStatus;
				hotStatusHandlers.push(l);
			},
			addStatusHandler: function(l) {
				hotStatusHandlers.push(l);
			},
			removeStatusHandler: function(l) {
				const idx = hotStatusHandlers.indexOf(l);
				if(idx >= 0) hotStatusHandlers.splice(idx, 1);
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
	 * Updates the HMR status and notifies all status handlers
	 * @param {string} newStatus - The new HMR status
	 */
	function hotSetStatus(newStatus) {
		hotStatus = newStatus;
		for(let i = 0; i < hotStatusHandlers.length; i++) {
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
	 * Converts ID string to proper type (number if numeric)
	 * @param {string|number} id - The ID to convert
	 * @returns {string|number} - Converted ID
	 */
	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

	/**
	 * Checks for available updates
	 * @param {boolean} apply - Whether to apply updates automatically
	 * @returns {Promise} - Promise resolving with outdated modules or null
	 */
	function hotCheck(apply) {
		if(hotStatus !== "idle") throw new Error("check() is only allowed in idle status");
		hotApplyOnUpdate = apply;
		hotSetStatus("check");

		return hotDownloadManifest().then(function(update) {
			if(!update) {
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

			if(hotStatus === "prepare" && hotChunksLoading === 0 && hotWaitingFiles === 0) {
				hotUpdateDownloaded();
			}

			return promise;
		});
	}

	/**
	 * Adds an update chunk to the current update
	 * @param {string} chunkId - The chunk ID
	 * @param {Object} moreModules - New module content
	 */
	function hotAddUpdateChunk(chunkId, moreModules) { // eslint-disable-line no-unused-vars
		if(!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId])
			return;

		hotRequestedFilesMap[chunkId] = false;
		for(const moduleId in moreModules) {
			if(Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
				hotUpdate[moduleId] = moreModules[moduleId];
			}
		}

		if(--hotWaitingFiles === 0 && hotChunksLoading === 0) {
			hotUpdateDownloaded();
		}
	}

	/**
	 * Ensures the specified chunk is downloaded
	 * @param {string} chunkId - The chunk ID
	 */
	function hotEnsureUpdateChunk(chunkId) {
		if(!hotAvailableFilesMap[chunkId]) {
			hotWaitingFilesMap[chunkId] = true;
		} else {
			hotRequestedFilesMap[chunkId] = true;
			hotWaitingFiles++;
			hotDownloadUpdateChunk(chunkId);
		}
	}

	/**
	 * Handles update download completion
	 */
	function hotUpdateDownloaded() {
		hotSetStatus("ready");
		const deferred = hotDeferred;
		hotDeferred = null;

		if(!deferred) return;

		if(hotApplyOnUpdate) {
			hotApply(hotApplyOnUpdate).then(function(result) {
				deferred.resolve(result);
			}, function(err) {
				deferred.reject(err);
			});
		} else {
			const outdatedModules = [];
			for(const id in hotUpdate) {
				if(Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
					outdatedModules.push(toModuleId(id));
				}
			}
			deferred.resolve(outdatedModules);
		}
	}

	/**
	 * Applies updates to modules
	 * @param {Object} options - Options for applying updates
	 * @returns {Promise} - Promise resolving with outdated modules
	 */
	function hotApply(options) {
		if(hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		const outdatedDependencies = {};
		const outdatedModules = [];
		const appliedUpdate = {};

		/**
		 * Determines affected modules and dependencies for the given module
		 * @param {string} updateModuleId - The module ID to analyze
		 * @returns {Object} - Update information
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

			while(queue.length > 0) {
				const queueItem = queue.pop();
				const moduleId = queueItem.id;
				const chain = queueItem.chain;
				const module = installedModules[moduleId];

				if(!module || module.hot._selfAccepted)
					continue;

				if(module.hot._selfDeclined) {
					return {
						type: "self-declined",
						chain: chain,
						moduleId: moduleId
					};
				}

				if(module.hot._main) {
					return {
						type: "unaccepted",
						chain: chain,
						moduleId: moduleId
					};
				}

				for(let i = 0; i < module.parents.length; i++) {
					const parentId = module.parents[i];
					const parent = installedModules[parentId];

					if(!parent) continue;

					if(parent.hot._declinedDependencies[moduleId]) {
						return {
							type: "declined",
							chain: chain.concat([parentId]),
							moduleId: moduleId,
							parentId: parentId
						};
					}

					if(outdatedModules.indexOf(parentId) >= 0) continue;

					if(parent.hot._acceptedDependencies[moduleId]) {
						if(!outdatedDependencies[parentId])
							outdatedDependencies[parentId] = [];
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
				outdatedModules: outdatedModules,
				outdatedDependencies: outdatedDependencies
			};
		}

		/**
		 * Adds all items from array b to array a unless duplicates exist
		 * @param {Array} a - Target array
		 * @param {Array} b - Source array
		 */
		function addAllToSet(a, b) {
			for(let i = 0; i < b.length; i++) {
				const item = b[i];
				if(a.indexOf(item) < 0)
					a.push(item);
			}
		}

		/**
		 *.warnUnexpectedRequire - warning function for unexpected requires
		 */
		function warnUnexpectedRequire() {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		}

		for(let id in hotUpdate) {
			if(!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;

			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : {
				type: "disposed",
				moduleId: id
			};

			let abortError = false;
			let doApply = false;
			let doDispose = false;
			let chainInfo = "";

			if(result.chain) {
				chainInfo = "\nUpdate propagation: " + result.chain.join(" -> ");
			}

			switch(result.type) {
				case "self-declined":
					if(options.onDeclined) options.onDeclined(result);
					if(!options.ignoreDeclined) abortError = new Error("Aborted because of self decline: " + result.moduleId + chainInfo);
					break;
				case "declined":
					if(options.onDeclined) options.onDeclined(result);
					if(!options.ignoreDeclined) abortError = new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + chainInfo);
					break;
				case "unaccepted":
					if(options.onUnaccepted) options.onUnaccepted(result);
					if(!options.ignoreUnaccepted) abortError = new Error("Aborted because " + moduleId + " is not accepted" + chainInfo);
					break;
				case "accepted":
					if(options.onAccepted) options.onAccepted(result);
					doApply = true;
					break;
				case "disposed":
					if(options.onDisposed) options.onDisposed(result);
					doDispose = true;
					break;
				default:
					throw new Error("Unexception type " + result.type);
			}

			if(abortError) {
				hotSetStatus("abort");
				return Promise.reject(abortError);
			}

			if(doApply) {
				appliedUpdate[moduleId] = hotUpdate[moduleId];
				addAllToSet(outdatedModules, result.outdatedModules);
				for(const moduleId in result.outdatedDependencies) {
					if(!Object.prototype.hasOwnProperty.call(result.outdatedDependencies, moduleId)) continue;
					if(!outdatedDependencies[moduleId]) outdatedDependencies[moduleId] = [];
					addAllToSet(outdatedDependencies[moduleId], result.outdatedDependencies[moduleId]);
				}
			}

			if(doDispose) {
				addAllToSet(outdatedModules, [result.moduleId]);
				appliedUpdate[moduleId] = warnUnexpectedRequire;
			}
		}

		// Store self accepted outdated modules to require them later
		const outdatedSelfAcceptedModules = [];
		for(let i = 0; i < outdatedModules.length; i++) {
			const moduleId = outdatedModules[i];
			if(installedModules[moduleId] && installedModules[moduleId].hot._selfAccepted) {
				outdatedSelfAcceptedModules.push({
					module: moduleId,
					errorHandler: installedModules[moduleId].hot._selfAccepted
				});
			}
		}

		// Dispose phase
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(function(chunkId) {
			if(hotAvailableFilesMap[chunkId] === false) {
				hotDisposeChunk(chunkId);
			}
		});

		const queue = outdatedModules.slice();
		while(queue.length > 0) {
			const moduleId = queue.pop();
			const module = installedModules[moduleId];
			if(!module) continue;

			const data = {};

			// Call dispose handlers
			const disposeHandlers = module.hot._disposeHandlers;
			for(let j = 0; j < disposeHandlers.length; j++) {
				const cb = disposeHandlers[j];
				cb(data);
			}
			hotCurrentModuleData[moduleId] = data;

			// Disable module
			module.hot.active = false;

			// Remove from cache
			delete installedModules[moduleId];

			// Remove "parents" references from children
			for(let j = 0; j < module.children.length; j++) {
				const child = installedModules[module.children[j]];
				if(!child) continue;
				const idx = child.parents.indexOf(moduleId);
				if(idx >= 0) {
					child.parents.splice(idx, 1);
				}
			}
		}

		// Remove outdated dependencies from module children
		for(const moduleId in outdatedDependencies) {
			if(!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;
			const module = installedModules[moduleId];
			if(!module) continue;

			const moduleOutdatedDependencies = outdatedDependencies[moduleId];
			for(let j = 0; j < moduleOutdatedDependencies.length; j++) {
				const dependency = moduleOutdatedDependencies[j];
				const idx = module.children.indexOf(dependency);
				if(idx >= 0) module.children.splice(idx, 1);
			}
		}

		// Apply phase
		hotSetStatus("apply");

		hotCurrentHash = hotUpdateNewHash;

		// Insert new code
		for(const moduleId in appliedUpdate) {
			if(Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}

		// Call accept handlers
		let error = null;
		for(const moduleId in outdatedDependencies) {
			if(!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;
			const module = installedModules[moduleId];
			const moduleOutdatedDependencies = outdatedDependencies[moduleId];
			const callbacks = [];

			for(let i = 0; i < moduleOutdatedDependencies.length; i++) {
				const dependency = moduleOutdatedDependencies[i];
				const cb = module.hot._acceptedDependencies[dependency];
				if(callbacks.indexOf(cb) >= 0) continue;
				callbacks.push(cb);
			}

			for(let i = 0; i < callbacks.length; i++) {
				const cb = callbacks[i];
				try {
					cb(moduleOutdatedDependencies);
				} catch(err) {
					if(options.onErrored) {
						options.onErrored({
							type: "accept-errored",
							moduleId: moduleId,
							dependencyId: moduleOutdatedDependencies[i],
							error: err
						});
					}
					if(!options.ignoreErrored) {
						if(!error) error = err;
					}
				}
			}
		}

		// Load self accepted modules
		for(let i = 0; i < outdatedSelfAcceptedModules.length; i++) {
			const item = outdatedSelfAcceptedModules[i];
			const moduleId = item.module;
			hotCurrentParents = [moduleId];

			try {
				$require$(moduleId);
			} catch(err) {
				if(typeof item.errorHandler === "function") {
					try {
						item.errorHandler(err);
					} catch(err2) {
						if(options.onErrored) {
							options.onErrored({
								type: "self-accept-error-handler-errored",
								moduleId: moduleId,
								error: err2,
								originalError: err
							});
						}
						if(!options.ignoreErrored) {
							if(!error) error = err2;
						}
						if(!error) error = err;
					}
				} else {
					if(options.onErrored) {
						options.onErrored({
							type: "self-accept-errored",
							moduleId: moduleId,
							error: err
						});
					}
					if(!options.ignoreErrored) {
						if(!error) error = err;
					}
				}
			}
		}

		// Handle errors
		if(error) {
			hotSetStatus("fail");
			return Promise.reject(error);
		}

		hotSetStatus("idle");
		return new Promise(function(resolve) {
			resolve(outdatedModules);
		});
	}
};