/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function () {
	/** @type {boolean} */
	let hotApplyOnUpdate = true;
	/** @type {string} */
	let hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	/** @type {Object<string, any>} */
	const hotCurrentModuleData = {};
	/** @type {string|undefined} */
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	/** @type {Array<string>} */
	let hotCurrentParents = []; // eslint-disable-line no-unused-vars
	/** @type {Array<string>} */
	let hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	/**
	 * Creates a require function that tracks HMR relationships.
	 * @param {string} moduleId
	 * @returns {Function}
	 */
	function hotCreateRequire(moduleId) { // eslint-disable-line no-unused-vars
		const me = installedModules[moduleId];
		if (!me) return $require$;

		const fn = function (request) {
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

		const ObjectFactory = name => ({
			configurable: true,
			enumerable: true,
			get() {
				return $require$[name];
			},
			set(value) {
				$require$[name] = value;
			}
		});

		for (const name in $require$) {
			if (Object.prototype.hasOwnProperty.call($require$, name) && name !== "e") {
				Object.defineProperty(fn, name, ObjectFactory(name));
			}
		}

		fn.e = function (chunkId) {
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
	 * Creates a hot module object.
	 * @param {string} moduleId
	 * @returns {Object}
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
			accept(dep, callback) {
				if (typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if (typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if (Array.isArray(dep)) {
					for (const d of dep) {
						hot._acceptedDependencies[d] = callback || (() => {});
					}
				} else {
					hot._acceptedDependencies[dep] = callback || (() => {});
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

	/** @type {Array<Function>} */
	const hotStatusHandlers = [];
	/** @type {string} */
	let hotStatus = "idle";

	/**
	 * Updates the HMR status and notifies handlers.
	 * @param {string} newStatus
	 */
	function hotSetStatus(newStatus) {
		hotStatus = newStatus;
		for (const handler of hotStatusHandlers) {
			handler.call(null, newStatus);
		}
	}

	// while downloading
	/** @type {number} */
	let hotWaitingFiles = 0;
	/** @type {number} */
	let hotChunksLoading = 0;
	/** @type {Object<string, boolean>} */
	const hotWaitingFilesMap = {};
	/** @type {Object<string, boolean>} */
	const hotRequestedFilesMap = {};
	/** @type {Object<string, boolean>} */
	const hotAvailableFilesMap = {};
	/** @type {{resolve: Function, reject: Function}|null} */
	let hotDeferred = null;

	// The update info
	/** @type {Object|null} */
	let hotUpdate = null;
	/** @type {string|null} */
	let hotUpdateNewHash = null;

	/**
	 * Normalizes a module identifier.
	 * @param {string|number} id
	 * @returns {string|number}
	 */
	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

	/**
	 * Checks for updates and prepares download.
	 * @param {boolean} apply
	 * @returns {Promise<null|Array<string>>}
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

	/**
	 * Adds a newly downloaded chunk to the update.
	 * @param {string} chunkId
	 * @param {Object<string, Function>} moreModules
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
	 * Ensures a chunk is requested or marked as waiting.
	 * @param {string} chunkId
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
	 * Applies the update.
	 * @param {Object} [options]
	 * @returns {Promise<Array<string>>}
	 */
	function hotApply(options) {
		if (hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		/** @type {Array<string>} */
		const outdatedModules = [];
		/** @type {Object<string, Array<string>>} */
		const outdatedDependencies = {};
		/** @type {Object<string, Function>} */
		const appliedUpdate = {};
		/** @type {Error|null} */
		let error = null;

		/**
		 * Determines affected modules for a given update.
		 * @param {string|number} updateModuleId
		 * @returns {Object}
		 */
		function getAffectedStuff(updateModuleId) {
			const outdatedModules = [updateModuleId];
			const outdatedDependencies = {};

			const queue = outdatedModules.map(id => ({
				chain: [id],
				id
			}));

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

		/**
		 * Adds items from source array to target array if not already present.
		 * @param {Array<any>} target
		 * @param {Array<any>} source
		 */
		function addAllToSet(target, source) {
			for (const item of source) {
				if (!target.includes(item)) target.push(item);
			}
		}

		/**
		 * Logs unexpected require usage.
		 */
		const warnUnexpectedRequire = () => {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		// Process each updated module
		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;
			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: "disposed", moduleId: id };
			const chainInfo = result.chain ? "\nUpdate propagation: " + result.chain.join(" -> ") : "";

			switch (result.type) {
				case "self-declined":
					if (options.onDeclined) options.onDeclined(result);
					if (!options.ignoreDeclined) {
						hotSetStatus("abort");
						return Promise.reject(new Error("Aborted because of self decline: " + result.moduleId + chainInfo));
					}
					break;
				case "declined":
					if (options.onDeclined) options.onDeclined(result);
					if (!options.ignoreDeclined) {
						hotSetStatus("abort");
						return Promise.reject(new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + chainInfo));
					}
					break;
				case "unaccepted":
					if (options.onUnaccepted) options.onUnaccepted(result);
					if (!options.ignoreUnaccepted) {
						hotSetStatus("abort");
						return Promise.reject(new Error("Aborted because " + moduleId + " is not accepted" + chainInfo));
					}
					break;
				case "accepted":
					if (options.onAccepted) options.onAccepted(result);
					appliedUpdate[moduleId] = hotUpdate[moduleId];
					addAllToSet(outdatedModules, result.outdatedModules);
					for (const depModuleId in result.outdatedDependencies) {
						if (!Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depModuleId)) continue;
						if (!outdatedDependencies[depModuleId]) outdatedDependencies[depModuleId] = [];
						addAllToSet(outdatedDependencies[depModuleId], result.outdatedDependencies[depModuleId]);
					}
					break;
				case "disposed":
					if (options.onDisposed) options.onDisposed(result);
					addAllToSet(outdatedModules, [result.moduleId]);
					appliedUpdate[moduleId] = warnUnexpectedRequire;
					break;
				default:
					throw new Error("Unexpected type " + result.type);
			}
		}

		// Collect self-accepted modules for later re-require
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
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(chunkId => {
			if (hotAvailableFilesMap[chunkId] === false) hotDisposeChunk(chunkId);
		});

		const disposeQueue = [...outdatedModules];
		while (disposeQueue.length) {
			const moduleId = disposeQueue.pop();
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

		// Remove outdated dependencies from module children
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

		// Load self-accepted modules
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

		// Final error handling
		if (error) {
			hotSetStatus("fail");
			return Promise.reject(error);
		}

		hotSetStatus("idle");
		return Promise.resolve(outdatedModules);
	}
};