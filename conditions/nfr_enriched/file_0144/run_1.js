```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {

	// ============================================================================
	// State Management
	// ============================================================================

	const state = {
		applyOnUpdate: true,
		currentHash: $hash$,
		currentModuleData: {},
		currentChildModule: undefined,
		currentParents: [],
		currentParentsTemp: [],
		statusHandlers: [],
		status: "idle",
		waitingFiles: 0,
		chunksLoading: 0,
		waitingFilesMap: {},
		requestedFilesMap: {},
		availableFilesMap: {},
		deferred: null,
		update: {},
		updateNewHash: null
	};

	// ============================================================================
	// Status Management
	// ============================================================================

	function setStatus(newStatus) {
		state.status = newStatus;
		state.statusHandlers.forEach(handler => handler(newStatus));
	}

	// ============================================================================
	// Module Require Factory
	// ============================================================================

	function createRequire(moduleId) {
		const module = installedModules[moduleId];
		if (!module) return $require$;

		const requireFn = function(request) {
			if (module.hot.active) {
				trackModuleParent(moduleId, request);
				if (!module.children.includes(request)) {
					module.children.push(request);
				}
			} else {
				console.warn(`[HMR] unexpected require(${request}) from disposed module ${moduleId}`);
				state.currentParents = [];
			}
			return $require$(request);
		};

		// Proxy require properties
		Object.keys($require$).forEach(name => {
			if (name !== "e" && Object.prototype.hasOwnProperty.call($require$, name)) {
				Object.defineProperty(requireFn, name, createPropertyDescriptor(name));
			}
		});

		// Handle chunk loading
		requireFn.e = function(chunkId) {
			if (state.status === "ready") setStatus("prepare");
			state.chunksLoading++;

			return $require$.e(chunkId).then(finishChunkLoading, err => {
				finishChunkLoading();
				throw err;
			});

			function finishChunkLoading() {
				state.chunksLoading--;
				if (state.status === "prepare") {
					if (!state.waitingFilesMap[chunkId]) {
						ensureUpdateChunk(chunkId);
					}
					if (state.chunksLoading === 0 && state.waitingFiles === 0) {
						updateDownloaded();
					}
				}
			}
		};

		return requireFn;
	}

	function createPropertyDescriptor(name) {
		return {
			configurable: true,
			enumerable: true,
			get: () => $require$[name],
			set: (value) => { $require$[name] = value; }
		};
	}

	function trackModuleParent(moduleId, request) {
		const requestedModule = installedModules[request];
		if (requestedModule) {
			if (!requestedModule.parents.includes(moduleId)) {
				requestedModule.parents.push(moduleId);
			}
		} else {
			state.currentParents = [moduleId];
			state.currentChildModule = request;
		}
	}

	// ============================================================================
	// Module Hot API Factory
	// ============================================================================

	function createModule(moduleId) {
		const hot = {
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: state.currentChildModule !== moduleId,
			active: true,

			accept: function(dep, callback) {
				if (typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if (typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if (Array.isArray(dep)) {
					dep.forEach(d => {
						hot._acceptedDependencies[d] = callback || (() => {});
					});
				} else {
					hot._acceptedDependencies[dep] = callback || (() => {});
				}
			},

			decline: function(dep) {
				if (typeof dep === "undefined") {
					hot._selfDeclined = true;
				} else if (Array.isArray(dep)) {
					dep.forEach(d => {
						hot._declinedDependencies[d] = true;
					});
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

			check: check,
			apply: apply,

			status: function(handler) {
				if (!handler) return state.status;
				state.statusHandlers.push(handler);
			},

			addStatusHandler: function(handler) {
				state.statusHandlers.push(handler);
			},

			removeStatusHandler: function(handler) {
				const idx = state.statusHandlers.indexOf(handler);
				if (idx >= 0) state.statusHandlers.splice(idx, 1);
			},

			data: state.currentModuleData[moduleId]
		};

		state.currentChildModule = undefined;
		return hot;
	}

	// ============================================================================
	// Update Checking & Downloading
	// ============================================================================

	function toModuleId(id) {
		return (+id) + "" === id ? +id : id;
	}

	function check(applyUpdate) {
		if (state.status !== "idle") {
			throw new Error("check() is only allowed in idle status");
		}

		state.applyOnUpdate = applyUpdate;
		setStatus("check");

		return hotDownloadManifest().then(update => {
			if (!update) {
				setStatus("idle");
				return null;
			}

			state.requestedFilesMap = {};
			state.waitingFilesMap = {};
			state.availableFilesMap = update.c;
			state.updateNewHash = update.h;
			setStatus("prepare");

			const promise = new Promise((resolve, reject) => {
				state.deferred = { resolve, reject };
			});

			state.update = {};
			/*foreachInstalledChunks*/
			{ // eslint-disable-line no-lone-blocks
				/*globals chunkId */
				ensureUpdateChunk(chunkId);
			}

			if (state.status === "prepare" && state.chunksLoading === 0 && state.waitingFiles === 0) {
				updateDownloaded();
			}

			return promise;
		});
	}

	function ensureUpdateChunk(chunkId) {
		if (!state.availableFilesMap[chunkId]) {
			state.waitingFilesMap[chunkId] = true;
		} else {
			state.requestedFilesMap[chunkId] = true;
			state.waitingFiles++;
			hotDownloadUpdateChunk(chunkId);
		}
	}

	function addUpdateChunk(chunkId, moreModules) {
		if (!state.availableFilesMap[chunkId] || !state.requestedFilesMap[chunkId]) {
			return;
		}

		state.requestedFilesMap[chunkId] = false;
		Object.keys(moreModules).forEach(moduleId => {
			state.update[moduleId] = moreModules[moduleId];
		});

		if (--state.waitingFiles === 0 && state.chunksLoading === 0) {
			updateDownloaded();
		}
	}

	function updateDownloaded() {
		setStatus("ready");
		const deferred = state.deferred;
		state.deferred = null;

		if (!deferred) return;

		if (state.applyOnUpdate) {
			apply(state.applyOnUpdate).then(
				result => deferred.resolve(result),
				err => deferred.reject(err)
			);
		} else {
			const outdatedModules = Object.keys(state.update).map(toModuleId);
			deferred.resolve(outdatedModules);
		}
	}

	// ============================================================================
	// Update Application
	// ============================================================================

	function apply(options) {
		if (state.status !== "ready") {
			throw new Error("apply() is only allowed in ready status");
		}

		options = options || {};

		const affectedModules = {
			outdated: [],
			dependencies: {},
			applied: {}
		};

		// Analyze affected modules
		Object.keys(state.update).forEach(id => {
			const moduleId = toModuleId(id);
			const result = state.update[id]
				? getAffectedStuff(moduleId)
				: { type: "disposed", moduleId: id };

			processUpdateResult(result, options, affectedModules);
		});

		// Execute update
		return executeUpdate(affectedModules, options);
	}

	function getAffectedStuff(updateModuleId) {
		const outdatedModules = [updateModuleId];
		const outdatedDependencies = {};
		const queue = [{ chain: [updateModuleId], id: updateModuleId }];

		while (queue.length > 0) {
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
					if (!outdatedDependencies[parentId]) {
						outdatedDependencies[parentId] = [];
					}
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

	function addAllToSet(target, items) {
		items.forEach(item => {
			if (!target.includes(item)) target.push(item);
		});
	}

	function processUpdateResult(result, options, affectedModules) {
		const chainInfo = result.chain ? `\nUpdate propagation: ${result.chain.join(" -> ")}` : "";
		let abortError = null;
		let doApply = false;
		let doDispose = false;

		switch (result.type) {
			case "self-declined":
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) {
					abortError = new Error(`Aborted because of self decline: ${result.moduleId}${chainInfo}`);
				}
				break;

			case "declined":
				if (options.onDeclined) options.onDeclined(result);
				if (!options.ignoreDeclined) {
					abortError = new Error(`Aborted because of declined dependency: ${result.moduleId} in ${result.parentId}${chainInfo}`);
				}
				break;

			case "unaccepted":
				if (options.onUnaccepted) options.onUnaccepted(result);
				if (!options.ignoreUnaccepted) {
					abortError = new Error(`Aborted because ${result.moduleId} is not accepted${chainInfo}`);
				}
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
				throw new Error(`Unexpected type ${result.type}`);
		}

		if (abortError) {
			setStatus("abort");
			throw abortError;
		}

		if (doApply) {
			affectedModules.applied[result.moduleId] = state.update[result.moduleId];
			addAllToSet(affectedModules.outdated, result.outdatedModules);
			Object.keys(result.outdatedDependencies).forEach(moduleId => {
				if (!affectedModules.dependencies[moduleId]) {
					affectedModules.dependencies[moduleId] = [];
				}
				addAllToSet(affectedModules.dependencies[moduleId], result.outdatedDependencies[moduleId]);
			});
		}

		if (doDispose) {
			addAllToSet(affectedModules.outdated, [result.moduleId]);
			affectedModules.applied[result.moduleId] = () => {
				console.warn(`[HMR] unexpected require(${result.moduleId}) to disposed module`);
			};
		}
	}

	function executeUpdate(affectedModules, options) {
		const selfAcceptedModules = affectedModules.outdated
			.filter(moduleId => installedModules[moduleId]?.hot._selfAccepted)
			.map(moduleId => ({
				module: moduleId,
				errorHandler: installedModules[moduleId].hot._selfAccepted
			}));

		// Dispose phase
		setStatus("dispose");
		Object.keys(state.availableFilesMap).forEach(chunkId => {
			if (state.availableFilesMap[chunkId] === false) {
				hotDisposeChunk(chunkId);
			}
		});

		disposeModules(affectedModules.outdated);
		removeOutdatedDependencies(affectedModules.dependencies);

		// Apply phase
		setStatus("apply");
		state.currentHash = state.updateNewHash;

		Object.keys(affectedModules.applied).forEach(moduleId => {
			modules[moduleId] = affectedModules.applied[moduleId];
		});

		// Call accept handlers
		let error = null;
		error = callAcceptHandlers(affectedModules.dependencies, options) || error;
		error = loadSelfAcceptedModules(selfAcceptedModules, options) || error;

		if (error) {
			setStatus("fail");
			return Promise.reject(error);
		}

		setStatus("idle");
		return Promise.resolve(affectedModules.outdated);
	}

	function disposeModules(outdatedModules) {
		const queue = outdatedModules.slice();

		while (queue.length > 0) {
			const moduleId = queue.pop();
			const module = installedModules[moduleId];
			if (!module) continue;

			const data = {};

			// Call dispose handlers
			module.hot._disposeHandlers.forEach(handler => handler(data));
			state.currentModuleData[moduleId] = data;

			// Disable module
			module