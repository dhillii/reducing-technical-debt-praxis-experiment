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

	/**
	 * Creates a require function that tracks HMR relationships.
	 * @param {string|number} moduleId
	 * @returns {function(string): any}
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

		const ObjectFactory = function (name) {
			return {
				configurable: true,
				enumerable: true,
				get: function () {
					return $require$[name];
				},
				set: function (value) {
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
			accept: function (dep, callback) {
				if (typeof dep === "undefined") {
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
			decline: function (dep) {
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
			dispose: function (callback) {
				hot._disposeHandlers.push(callback);
			},
			addDisposeHandler: function (callback) {
				hot._disposeHandlers.push(callback);
			},
			removeDisposeHandler: function (callback) {
				const idx = hot._disposeHandlers.indexOf(callback);
				if (idx >= 0) hot._disposeHandlers.splice(idx, 1);
			},

			// Management API
			check: hotCheck,
			apply: hotApply,
			status: function (l) {
				if (!l) return hotStatus;
				hotStatusHandlers.push(l);
			},
			addStatusHandler: function (l) {
				hotStatusHandlers.push(l);
			},
			removeStatusHandler: function (l) {
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
	 * Updates the global HMR status and notifies handlers.
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
	 * @param {string|number} id
	 * @returns {string|number}
	 */
	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		if (isNumber) {
			return +id;
		}
		return id;
	}

	/**
	 * Initiates a check for updates.
	 * @param {boolean} apply
	 * @returns {Promise<null|Array>}
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
	 * Determines if a module should be ignored based on its status.
	 * @param {object} module
	 * @returns {boolean}
	 */
	function isSelfAccepted(module) {
		return module && module.hot && module.hot._selfAccepted;
	}

	/**
	 * Determines if a module has self-declined.
	 * @param {object} module
	 * @returns {boolean}
	 */
	function isSelfDeclined(module) {
		return module && module.hot && module.hot._selfDeclined;
	}

	/**
	 * Determines if a module is the main entry.
	 * @param {object} module
	 * @returns {boolean}
	 */
	function isMainModule(module) {
		return module && module.hot && module.hot._main;
	}

	/**
	 * Retrieves affected modules and dependencies for a given update.
	 * @param {string|number} updateModuleId
	 * @returns {object}
	 */
	function getAffectedStuff(updateModuleId) {
		const outdatedModules = [updateModuleId];
		const outdatedDependencies = {};

		const queue = outdatedModules.slice().map(function (id) {
			return { chain: [id], id };
		});

		while (queue.length > 0) {
			const { id: moduleId, chain } = queue.pop();
			const module = installedModules[moduleId];
			if (!module || isSelfAccepted(module)) continue;

			if (isSelfDeclined(module)) {
				return { type: "self-declined", chain, moduleId };
			}
			if (isMainModule(module)) {
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
				if (outdatedModules.indexOf(parentId) >= 0) continue;
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
	 * Main apply logic – processes updates, disposes old modules, and runs accept handlers.
	 * @param {object} [options]
	 * @returns {Promise<Array>}
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

		// Process each updated module
		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;

			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: "disposed", moduleId: id };
			const { abortError, doApply, doDispose } = evaluateResult(result, options, moduleId);
			if (abortError) {
				hotSetStatus("abort");
				return Promise.reject(abortError);
			}
			if (doApply) {
				appliedUpdate[moduleId] = hotUpdate[moduleId];
				addAllToSet(outdatedModules, result.outdatedModules);
				mergeOutdatedDependencies(result.outdatedDependencies, outdatedDependencies);
			}
			if (doDispose) {
				addAllToSet(outdatedModules, [result.moduleId]);
				appliedUpdate[moduleId] = warnUnexpectedRequire;
			}
		}

		const outdatedSelfAcceptedModules = collectSelfAcceptedModules(outdatedModules);
		hotSetStatus("dispose");
		disposeModules(outdatedModules);
		removeOutdatedDependencies(outdatedDependencies);
		hotSetStatus("apply");
		hotCurrentHash = hotUpdateNewHash;
		applyNewModules(appliedUpdate);
		const error = runAcceptHandlers(outdatedDependencies, options);
		loadSelfAcceptedModules(outdatedSelfAcceptedModules, options, error);
		if (error) {
			hotSetStatus("fail");
			return Promise.reject(error);
		}
		hotSetStatus("idle");
		return Promise.resolve(outdatedModules);
	}

	/**
	 * Evaluates the result of getAffectedStuff and returns control flags.
	 * @param {object} result
	 * @param {object} options
	 * @param {string|number} moduleId
	 * @returns {{abortError: (Error|null), doApply: boolean, doDispose: boolean}}
	 */
	function evaluateResult(result, options, moduleId) {
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
		return { abortError, doApply, doDispose };
	}

	/**
	 * Merges newly discovered outdated dependencies into the global map.
	 * @param {object} source
	 * @param {object} target
	 */
	function mergeOutdatedDependencies(source, target) {
		for (const moduleId in source) {
			if (!Object.prototype.hasOwnProperty.call(source, moduleId)) continue;
			if (!target[moduleId]) target[moduleId] = [];
			addAllToSet(target[moduleId], source[moduleId]);
		}
	}

	/**
	 * Collects modules that self-accepted for later re-require.
	 * @param {Array} modulesList
	 * @returns {Array}
	 */
	function collectSelfAcceptedModules(modulesList) {
		const result = [];
		for (let i = 0; i < modulesList.length; i++) {
			const moduleId = modulesList[i];
			const mod = installedModules[moduleId];
			if (mod && mod.hot._selfAccepted) {
				result.push({
					module: moduleId,
					errorHandler: mod.hot._selfAccepted
				});
			}
		}
		return result;
	}

	/**
	 * Disposes outdated modules and cleans up parent/child references.
	 * @param {Array} modulesList
	 */
	function disposeModules(modulesList) {
		const queue = modulesList.slice();
		while (queue.length > 0) {
			const moduleId = queue.pop();
			const module = installedModules[moduleId];
			if (!module) continue;

			const data = {};
			const disposeHandlers = module.hot._disposeHandlers;
			for (let j = 0; j < disposeHandlers.length; j++) {
				disposeHandlers[j](data);
			}
			hotCurrentModuleData[moduleId] = data;
			module.hot.active = false;
			delete installedModules[moduleId];

			// Remove parent references from children
			for (let j = 0; j < module.children.length; j++) {
				const child = installedModules[module.children[j]];
				if (!child) continue;
				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) child.parents.splice(idx, 1);
			}
		}
	}

	/**
	 * Removes outdated dependency links from module children.
	 * @param {object} depsMap
	 */
	function removeOutdatedDependencies(depsMap) {
		for (const moduleId in depsMap) {
			if (!Object.prototype.hasOwnProperty.call(depsMap, moduleId)) continue;
			const module = installedModules[moduleId];
			if (!module) continue;
			const deps = depsMap[moduleId];
			for (let i = 0; i < deps.length; i++) {
				const dep = deps[i];
				const idx = module.children.indexOf(dep);
				if (idx >= 0) module.children.splice(idx, 1);
			}
		}
	}

	/**
	 * Inserts new module code into the modules map.
	 * @param {object} updates
	 */
	function applyNewModules(updates) {
		for (const moduleId in updates) {
			if (Object.prototype.hasOwnProperty.call(updates, moduleId)) {
				modules[moduleId] = updates[moduleId];
			}
		}
	}

	/**
	 * Executes accept handlers for outdated dependencies.
	 * @param {object} depsMap
	 * @param {object} options
	 * @returns {Error|null}
	 */
	function runAcceptHandlers(depsMap, options) {
		let firstError = null;
		for (const moduleId in depsMap) {
			if (!Object.prototype.hasOwnProperty.call(depsMap, moduleId)) continue;
			const module = installedModules[moduleId];
			const deps = depsMap[moduleId];
			const callbacks = [];

			for (let i = 0; i < deps.length; i++) {
				const depId = deps[i];
				const cb = module.hot._acceptedDependencies[depId];
				if (callbacks.indexOf(cb) >= 0) continue;
				callbacks.push(cb);
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
					if (!options.ignoreErrored && !firstError) {
						firstError = err;
					}
				}
			}
		}
		return firstError;
	}

	/**
	 * Loads modules that self-accepted after disposal.
	 * @param {Array} selfAccepted
	 * @param {object} options
	 * @param {Error|null} priorError
	 */
	function loadSelfAcceptedModules(selfAccepted, options, priorError) {
		let error = priorError;
		for (let i = 0; i < selfAccepted.length; i++) {
			const { module: moduleId, errorHandler } = selfAccepted[i];
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
		if (error) {
			hotSetStatus("fail");
			throw error;
		}
	}

	return {
		hotCreateRequire,
		hotCreateModule,
		hotCheck,
		hotApply,
		hotSetStatus,
		hotUpdateDownloaded,
		hotAddUpdateChunk,
		hotEnsureUpdateChunk
	};
};