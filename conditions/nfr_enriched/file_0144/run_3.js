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
				Object.defineProperty(requireFn, name, {
					configurable: true,
					enumerable: true,
					get: () => $require$[name],
					set: (value) => { $require$[name] = value; }
				});
			}
		});

		// Handle chunk loading
		requireFn.e = function(chunkId) {
			if (state.status === "ready") setStatus("prepare");
			state.chunksLoading++;

			return $require$.e(chunkId).then(
				() => finishChunkLoading(),
				(err) => {
					finishChunkLoading();
					throw err;
				}
			);

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

			check: hotCheck,
			apply: hotApply,

			status: function(l) {
				if (!l) return state.status;
				state.statusHandlers.push(l);
			},

			addStatusHandler: function(l) {
				state.statusHandlers.push(l);
			},

			removeStatusHandler: function(l) {
				const idx = state.statusHandlers.indexOf(l);
				if (idx >= 0) state.statusHandlers.splice(idx, 1);
			},

			data: state.currentModuleData[moduleId]
		};

		state.currentChildModule = undefined;
		return hot;
	}

	// ============================================================================
	// Update Check & Download
	// ============================================================================

	function toModuleId(id) {
		return (+id) + "" === id ? +id : id;
	}

	function hotCheck(apply) {
		if (state.status !== "idle") {
			throw new Error("check() is only allowed in idle status");
		}

		state.applyOnUpdate = apply;
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

	function ensureUpdateChunk(chunkId) {
		if (!state.availableFilesMap[chunkId]) {
			state.waitingFilesMap[chunkId] = true;
		} else {
			state.requestedFilesMap[chunkId] = true;
			state.waitingFiles++;
			hotDownloadUpdateChunk(chunkId);
		}
	}

	function updateDownloaded() {
		setStatus("ready");
		const deferred = state.deferred;
		state.deferred = null;

		if (!deferred) return;

		if (state.applyOnUpdate) {
			hotApply(state.applyOnUpdate).then(
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

	function getAffectedStuff(updateModuleId) {
		const outdatedModules = [updateModuleId];
		const outdatedDependencies = {};

		const queue = outdatedModules.slice().map(id => ({
			chain: [id],
			id: id
		}));

		while (queue.length > 0) {
			const queueItem = queue.pop();
			const moduleId = queueItem.id;
			const chain = queueItem.chain;
			const module = installedModules[moduleId];

			if (!module || module.hot._selfAccepted) continue;

			if (module.hot._selfDeclined) {
				return {
					type: "self-declined",
					chain: chain,
					moduleId: moduleId
				};
			}

			if (module.hot._main) {
				return {
					type: "unaccepted",
					chain: chain,
					moduleId: moduleId
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
						moduleId: moduleId,
						parentId: parentId
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

	function addAllToSet(target, items) {
		items.forEach(item => {
			if (!target.includes(item)) {
				target.push(item);
			}
		});
	}

	function processUpdateResult(result, options, appliedUpdate, outdatedModules, outdatedDependencies) {
		const chainInfo = result.chain ? `\nUpdate propagation: ${result.chain.join(" -> ")}` : "";
		let abortError = false;
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
			return { abortError, doApply: false, doDispose: false };
		}

		if (doApply) {
			appliedUpdate[result.moduleId] = state.update[result.moduleId];
			addAllToSet(outdatedModules, result.outdatedModules);
			Object.keys(result.outdatedDependencies).forEach(moduleId => {
				if (!outdatedDependencies[moduleId]) {
					outdatedDependencies[moduleId] = [];
				}
				addAllToSet(outdatedDependencies[moduleId], result.outdatedDependencies[moduleId]);
			});
		}

		if (doDispose) {
			addAllToSet(outdatedModules, [result.moduleId]);
			appliedUpdate[result.moduleId] = () => {
				console.warn(`[HMR] unexpected require(${result.moduleId}) to disposed module`);
			};
		}

		return { abortError: false, doApply, doDispose };
	}

	function disposeModules(outdatedModules) {
		setStatus("dispose");
		Object.keys(state.availableFilesMap).forEach(chunkId => {
			if (state.availableFilesMap[chunkId] === false) {
				hotDisposeChunk(chunkId);
			}
		});

		const queue = outdatedModules.slice();
		while (queue.length > 0) {
			const moduleId = queue.pop();
			const module = installedModules[moduleId];
			if (!module) continue;

			const data = {};

			// Call dispose handlers
			module.hot._disposeHandlers.forEach(cb => cb(data));
			state.currentModuleData[moduleId] = data;

			// Disable module
			module.hot.active = false;
			delete installedModules[moduleId];

			// Remove parent references
			module.children.forEach(childId => {
				const child = installedModules[childId];
				if (child) {
					const idx = child.parents.indexOf(moduleId);
					if (idx >= 0) child.parents.splice(idx, 1);
				}
			});
		}
	}

	function removeOutdatedDependencies(outdatedDependencies) {
		Object.keys(outdatedDependencies).forEach(moduleId => {
			const module = installedModules[moduleId];
			if (module) {
				outdatedDependencies[moduleId].forEach(dependency => {
					const idx = module.children.indexOf(dependency);
					if (idx >= 0) module.children.splice(idx, 1);
				});
			}
		});
	}

	function applyModuleUpdates(appliedUpdate) {
		Object.keys(appliedUpdate).forEach(moduleId => {
			modules[moduleId] = appliedUpdate[moduleId];
		});
	}

	function callAcceptHandlers(outdatedDependencies, options) {
		let error = null;

		Object.keys(outdatedDependencies).forEach(moduleId => {
			const module = installedModules[moduleId];
			const moduleOutdatedDependencies = outdatedDependencies[moduleId];
			const callbacks = [];

			moduleOutdatedDependencies.forEach(dependency => {
				const cb = module.hot._acceptedDependencies[dependency