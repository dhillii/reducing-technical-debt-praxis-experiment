```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {

	// State management
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

	function setStatus(newStatus) {
		state.status = newStatus;
		state.statusHandlers.forEach(handler => handler(newStatus));
	}

	function toModuleId(id) {
		return (+id) + "" === id ? +id : id;
	}

	function addAllToSet(target, source) {
		source.forEach(item => {
			if(target.indexOf(item) < 0) target.push(item);
		});
	}

	function createRequireProxy(moduleId) {
		const me = installedModules[moduleId];
		if(!me) return $require$;

		const fn = function(request) {
			if(me.hot.active) {
				if(installedModules[request]) {
					if(installedModules[request].parents.indexOf(moduleId) < 0)
						installedModules[request].parents.push(moduleId);
				} else {
					state.currentParents = [moduleId];
					state.currentChildModule = request;
				}
				if(me.children.indexOf(request) < 0)
					me.children.push(request);
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				state.currentParents = [];
			}
			return $require$(request);
		};

		// Proxy require properties
		Object.keys($require$).forEach(name => {
			if(name !== "e" && Object.prototype.hasOwnProperty.call($require$, name)) {
				Object.defineProperty(fn, name, {
					configurable: true,
					enumerable: true,
					get: () => $require$[name],
					set: (value) => { $require$[name] = value; }
				});
			}
		});

		fn.e = function(chunkId) {
			if(state.status === "ready") setStatus("prepare");
			state.chunksLoading++;
			return $require$.e(chunkId).then(finishChunkLoading, err => {
				finishChunkLoading();
				throw err;
			});

			function finishChunkLoading() {
				state.chunksLoading--;
				if(state.status === "prepare") {
					if(!state.waitingFilesMap[chunkId]) {
						ensureUpdateChunk(chunkId);
					}
					if(state.chunksLoading === 0 && state.waitingFiles === 0) {
						updateDownloaded();
					}
				}
			}
		};
		return fn;
	}

	function createHotModule(moduleId) {
		const hot = {
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: state.currentChildModule !== moduleId,
			active: true,

			accept: function(dep, callback) {
				if(typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if(typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if(typeof dep === "object") {
					dep.forEach(d => {
						hot._acceptedDependencies[d] = callback || (() => {});
					});
				} else {
					hot._acceptedDependencies[dep] = callback || (() => {});
				}
			},

			decline: function(dep) {
				if(typeof dep === "undefined") {
					hot._selfDeclined = true;
				} else if(typeof dep === "object") {
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
				if(idx >= 0) hot._disposeHandlers.splice(idx, 1);
			},

			check: check,
			apply: apply,

			status: function(l) {
				if(!l) return state.status;
				state.statusHandlers.push(l);
			},

			addStatusHandler: function(l) {
				state.statusHandlers.push(l);
			},

			removeStatusHandler: function(l) {
				const idx = state.statusHandlers.indexOf(l);
				if(idx >= 0) state.statusHandlers.splice(idx, 1);
			},

			data: state.currentModuleData[moduleId]
		};
		state.currentChildModule = undefined;
		return hot;
	}

	function getAffectedStuff(updateModuleId) {
		const outdatedModules = [updateModuleId];
		const outdatedDependencies = {};
		const queue = outdatedModules.slice().map(id => ({ chain: [id], id }));

		while(queue.length > 0) {
			const { id: moduleId, chain } = queue.pop();
			const module = installedModules[moduleId];

			if(!module || module.hot._selfAccepted) continue;

			if(module.hot._selfDeclined) {
				return { type: "self-declined", chain, moduleId };
			}

			if(module.hot._main) {
				return { type: "unaccepted", chain, moduleId };
			}

			for(let i = 0; i < module.parents.length; i++) {
				const parentId = module.parents[i];
				const parent = installedModules[parentId];
				if(!parent) continue;

				if(parent.hot._declinedDependencies[moduleId]) {
					return {
						type: "declined",
						chain: chain.concat([parentId]),
						moduleId,
						parentId
					};
				}

				if(outdatedModules.indexOf(parentId) >= 0) continue;

				if(parent.hot._acceptedDependencies[moduleId]) {
					if(!outdatedDependencies[parentId]) outdatedDependencies[parentId] = [];
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

	function processUpdateResult(result, options, appliedUpdate, outdatedModules, outdatedDependencies) {
		let abortError = false;
		let doApply = false;
		let doDispose = false;
		const chainInfo = result.chain ? "\nUpdate propagation: " + result.chain.join(" -> ") : "";

		switch(result.type) {
			case "self-declined":
				if(options.onDeclined) options.onDeclined(result);
				if(!options.ignoreDeclined)
					abortError = new Error("Aborted because of self decline: " + result.moduleId + chainInfo);
				break;
			case "declined":
				if(options.onDeclined) options.onDeclined(result);
				if(!options.ignoreDeclined)
					abortError = new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + chainInfo);
				break;
			case "unaccepted":
				if(options.onUnaccepted) options.onUnaccepted(result);
				if(!options.ignoreUnaccepted)
					abortError = new Error("Aborted because " + result.moduleId + " is not accepted" + chainInfo);
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
				throw new Error("Unexpected type " + result.type);
		}

		if(abortError) return { abortError };

		if(doApply) {
			appliedUpdate[result.moduleId] = state.update[result.moduleId];
			addAllToSet(outdatedModules, result.outdatedModules);
			Object.keys(result.outdatedDependencies).forEach(moduleId => {
				if(!outdatedDependencies[moduleId]) outdatedDependencies[moduleId] = [];
				addAllToSet(outdatedDependencies[moduleId], result.outdatedDependencies[moduleId]);
			});
		}

		if(doDispose) {
			addAllToSet(outdatedModules, [result.moduleId]);
			appliedUpdate[result.moduleId] = () => {
				console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
			};
		}

		return { abortError: false };
	}

	function disposeModules(outdatedModules) {
		const queue = outdatedModules.slice();
		while(queue.length > 0) {
			const moduleId = queue.pop();
			const module = installedModules[moduleId];
			if(!module) continue;

			const data = {};
			module.hot._disposeHandlers.forEach(cb => cb(data));
			state.currentModuleData[moduleId] = data;
			module.hot.active = false;
			delete installedModules[moduleId];

			for(let j = 0; j < module.children.length; j++) {
				const child = installedModules[module.children[j]];
				if(!child) continue;
				const idx = child.parents.indexOf(moduleId);
				if(idx >= 0) child.parents.splice(idx, 1);
			}
		}
	}

	function removeOutdatedDependencies(outdatedDependencies) {
		Object.keys(outdatedDependencies).forEach(moduleId => {
			const module = installedModules[moduleId];
			if(module) {
				outdatedDependencies[moduleId].forEach(dependency => {
					const idx = module.children.indexOf(dependency);
					if(idx >= 0) module.children.splice(idx, 1);
				});
			}
		});
	}

	function callAcceptHandlers(outdatedDependencies, options) {
		let error = null;
		Object.keys(outdatedDependencies).forEach(moduleId => {
			const module = installedModules[moduleId];
			const moduleOutdatedDependencies = outdatedDependencies[moduleId];
			const callbacks = [];

			moduleOutdatedDependencies.forEach(dependency => {
				const cb = module.hot._acceptedDependencies[dependency];
				if(callbacks.indexOf(cb) < 0) callbacks.push(cb);
			});

			callbacks.forEach(cb => {
				try {
					cb(moduleOutdatedDependencies);
				} catch(err) {
					if(options.onErrored) {
						options.onErrored({
							type: "accept-errored",
							moduleId,
							error: err
						});
					}
					if(!options.ignoreErrored && !error) error = err;
				}
			});
		});
		return error;
	}

	function loadSelfAcceptedModules(outdatedSelfAcceptedModules, options) {
		let error = null;
		outdatedSelfAcceptedModules.forEach(item => {
			const moduleId = item.module;
			state.currentParents = [moduleId];
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
								moduleId,
								error: err2,
								orginalError: err
							});
						}
						if(!options.ignoreErrored && !error) error = err2;
						if(!error) error = err;
					}
				} else {
					if(options.onErrored) {
						options.onErrored({
							type: "self-accept-errored",
							moduleId,
							error: err
						});
					}
					if(!options.ignoreErrored && !error) error = err;
				}
			}
		});
		return error;
	}

	function check(apply) {
		if(state.status !== "idle") throw new Error("check() is only allowed in idle status");
		state.applyOnUpdate = apply;
		setStatus("check");
		return hotDownloadManifest().then(update => {
			if(!update) {
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
			if(state.status === "prepare" && state.chunksLoading === 0 && state.waitingFiles === 0) {
				updateDownloaded();
			}
			return promise;
		});
	}

	function addUpdateChunk(chunkId, moreModules) {
		if(!state.availableFilesMap[chunkId] || !state.requestedFilesMap[chunkId]) return;
		state.requestedFilesMap[chunkId] = false;
		Object.keys(moreModules).forEach(moduleId => {
			state.update[moduleId] = moreModules[moduleId];
		});
		if(--state.waitingFiles === 0 && state.chunksLoading === 0) {
			updateDownloaded();
		}
	}

	function ensureUpdateChunk(chunkId) {
		if(!state.availableFilesMap[chunkId]) {
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
		if(!deferred) return;

		if(state.applyOnUpdate) {
			apply(state.applyOnUpdate).then(
				result => deferred.resolve(result),
				err => deferred.reject(err)
			);
		} else {
			const outdatedModules = Object.keys(state.update).map(toModuleId);