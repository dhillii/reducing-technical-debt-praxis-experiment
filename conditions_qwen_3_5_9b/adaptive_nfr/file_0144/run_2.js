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

	var hotStatusHandlers = [];
	var hotStatus = "idle";

	function hotSetStatus(newStatus) {
		hotStatus = newStatus;
		for (let i = 0; i < hotStatusHandlers.length; i++) {
			hotStatusHandlers[i].call(null, newStatus);
		}
	}

	// while downloading
	var hotWaitingFiles = 0;
	var hotChunksLoading = 0;
	var hotWaitingFilesMap = {};
	var hotRequestedFilesMap = {};
	var hotAvailableFilesMap = {};
	var hotDeferred;

	// The update info
	var hotUpdate, hotUpdateNewHash;

	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

	function isIdleStatus() {
		return hotStatus === "idle";
	}

	function isReadyStatus() {
		return hotStatus === "ready";
	}

	function isPrepareStatus() {
		return hotStatus === "prepare";
	}

	function isAbortStatus() {
		return hotStatus === "abort";
	}

	function isFailStatus() {
		return hotStatus === "fail";
	}

	function hasUpdate() {
		return hotUpdateNewHash !== hotCurrentHash;
	}

	function hasChunk(chunkId) {
		return hotAvailableFilesMap[chunkId];
	}

	function hasRequestedChunk(chunkId) {
		return hotRequestedFilesMap[chunkId];
	}

	function hasWaitingChunk(chunkId) {
		return hotWaitingFilesMap[chunkId];
	}

	function hasWaitingFiles() {
		return hotWaitingFiles > 0;
	}

	function hasChunksLoading() {
		return hotChunksLoading > 0;
	}

	function hasDeferred() {
		return hotDeferred !== null;
	}

	function hasUpdateChunk(chunkId) {
		return hotAvailableFilesMap[chunkId] !== false;
	}

	function hasDeclinedDependency(parentId, moduleId) {
		return parent.hot._declinedDependencies[moduleId];
	}

	function hasAcceptedDependency(parentId, moduleId) {
		return parent.hot._acceptedDependencies[moduleId];
	}

	function hasOutdatedModule(moduleId) {
		return outdatedModules.indexOf(moduleId) >= 0;
	}

	function hasSelfAccepted(module) {
		return module.hot._selfAccepted;
	}

	function hasSelfDeclined(module) {
		return module.hot._selfDeclined;
	}

	function hasMainModule(module) {
		return module.hot._main;
	}

	function hasWaitingFilesMapChunk(chunkId) {
		return hotWaitingFilesMap[chunkId];
	}

	function hasAvailableFilesMapChunk(chunkId) {
		return hotAvailableFilesMap[chunkId];
	}

	function hasRequestedFilesMapChunk(chunkId) {
		return hotRequestedFilesMap[chunkId];
	}

	function hotCheck(apply) {
		if (!isIdleStatus()) {
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

			if (isPrepareStatus() && !hasChunksLoading() && !hasWaitingFiles()) {
				hotUpdateDownloaded();
			}

			return promise;
		});
	}

	function hotAddUpdateChunk(chunkId, moreModules) {
		if (!hasChunk(chunkId) || !hasRequestedChunk(chunkId)) {
			return;
		}

		hotRequestedFilesMap[chunkId] = false;

		for (const moduleId in moreModules) {
			if (Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
				hotUpdate[moduleId] = moreModules[moduleId];
			}
		}

		if (!hasWaitingFiles() && !hasChunksLoading()) {
			hotUpdateDownloaded();
		}
	}

	function hotEnsureUpdateChunk(chunkId) {
		if (!hasAvailableFilesMapChunk(chunkId)) {
			hotWaitingFilesMap[chunkId] = true;
		} else {
			hotRequestedFilesMap[chunkId] = true;
			hotWaitingFiles++;
			hotDownloadUpdateChunk(chunkId);
		}
	}

	function hotUpdateDownloaded() {
		hotSetStatus("ready");
		const deferred = hotDeferred;
		hotDeferred = null;

		if (!hasDeferred()) {
			return;
		}

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

	function hotApply(options) {
		if (!isReadyStatus()) {
			throw new Error("apply() is only allowed in ready status");
		}

		options = options || {};

		const cb = null;
		const i = 0;
		const j = 0;
		let module = null;
		let moduleId = null;

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
				moduleId = queueItem.id;
				const chain = queueItem.chain;
				module = installedModules[moduleId];

				if (!module || hasSelfAccepted(module)) {
					continue;
				}

				if (hasSelfDeclined(module)) {
					return {
						type: "self-declined",
						chain: chain,
						moduleId: moduleId
					};
				}

				if (hasMainModule(module)) {
					return {
						type: "unaccepted",
						chain: chain,
						moduleId: moduleId
					};
				}

				for (let k = 0; k < module.parents.length; k++) {
					const parentId = module.parents[k];
					const parent = installedModules[parentId];

					if (!parent) {
						continue;
					}

					if (hasDeclinedDependency(parent, moduleId)) {
						return {
							type: "declined",
							chain: chain.concat([parentId]),
							moduleId: moduleId,
							parentId: parentId
						};
					}

					if (hasOutdatedModule(parentId)) {
						continue;
					}

					if (hasAcceptedDependency(parent, moduleId)) {
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

		function addAllToSet(a, b) {
			for (let k = 0; k < b.length; k++) {
				const item = b[k];
				if (a.indexOf(item) < 0) {
					a.push(item);
				}
			}
		}

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

		const outdatedSelfAcceptedModules = [];
		for (let k = 0; k < outdatedModules.length; k++) {
			moduleId = outdatedModules[k];
			if (installedModules[moduleId] && hasSelfAccepted(installedModules[moduleId])) {
				outdatedSelfAcceptedModules.push({
					module: moduleId,
					errorHandler: installedModules[moduleId].hot._selfAccepted
				});
			}
		}

		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(function(chunkId) {
			if (hotAvailableFilesMap[chunkId] === false) {
				hotDisposeChunk(chunkId);
			}
		});

		const queue = outdatedModules.slice();
		while (queue.length > 0) {
			moduleId = queue.pop();
			module = installedModules[moduleId];

			if (!module) {
				continue;
			}

			const data = {};

			const disposeHandlers = module.hot._disposeHandlers;
			for (let k = 0; k < disposeHandlers.length; k++) {
				cb = disposeHandlers[k];
				cb(data);
			}
			hotCurrentModuleData[moduleId] = data;

			module.hot.active = false;

			delete installedModules[moduleId];

			for (let k = 0; k < module.children.length; k++) {
				const child = installedModules[module.children[k]];

				if (!child) {
					continue;
				}

				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) {
					child.parents.splice(idx, 1);
				}
			}
		}

		const dependency = null;
		const moduleOutdatedDependencies = null;
		for (const moduleId2 in outdatedDependencies) {
			if (Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId2)) {
				module = installedModules[moduleId2];

				if (module) {
					moduleOutdatedDependencies = outdatedDependencies[moduleId2];
					for (let k = 0; k < moduleOutdatedDependencies.length; k++) {
						dependency = moduleOutdatedDependencies[k];
						const idx = module.children.indexOf(dependency);
						if (idx >= 0) {
							module.children.splice(idx, 1);
						}
					}
				}
			}
		}

		hotSetStatus("apply");

		hotCurrentHash = hotUpdateNewHash;

		for (const moduleId2 in appliedUpdate) {
			if (Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId2)) {
				modules[moduleId2] = appliedUpdate[moduleId2];
			}
		}

		let error = null;
		for (const moduleId2 in outdatedDependencies) {
			if (Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId2)) {
				module = installedModules[moduleId2];
				moduleOutdatedDependencies = outdatedDependencies[moduleId2];
				const callbacks = [];

				for (let k = 0; k < moduleOutdatedDependencies.length; k++) {
					dependency = moduleOutdatedDependencies[k];
					cb = module.hot._acceptedDependencies[dependency];

					if (callbacks.indexOf(cb) >= 0) {
						continue;
					}
					callbacks.push(cb);
				}

				for (let k = 0; k < callbacks.length; k++) {
					cb = callbacks[k];
					try {
						cb(moduleOutdatedDependencies);
					} catch(err) {
						if (options.onErrored) {
							options.onErrored({
								type: "accept-errored",
								moduleId: moduleId2,
								dependencyId: moduleOutdatedDependencies[k],
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

		for (let k = 0; k < outdatedSelfAcceptedModules.length; k++) {
			const item = outdatedSelfAcceptedModules[k];
			moduleId = item.module;
			hotCurrentParents = [moduleId];

			try {
				$require$(moduleId);
			} catch(err) {
				if (typeof item.errorHandler === "function") {
					try {
						item.errorHandler(err);
					} catch(err2) {
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