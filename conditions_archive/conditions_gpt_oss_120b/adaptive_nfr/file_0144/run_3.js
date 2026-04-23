/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {

	const hotApplyOnUpdate = true;
	let hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	const hotCurrentModuleData = {};
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	const hotCurrentParents = []; // eslint-disable-line no-unused-vars
	const hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

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
					hotCurrentParents.splice(0, hotCurrentParents.length, moduleId);
					hotCurrentChildModule = request;
				}
				if (me.children.indexOf(request) < 0) {
					me.children.push(request);
				}
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents.length = 0;
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

	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

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

	function hotEnsureUpdateChunk(chunkId) {
		if (!hotAvailableFilesMap[chunkId]) {
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
	 * Determines if a module has self-declined status.
	 * @param {Object} module
	 * @returns {boolean}
	 */
	function isSelfDeclined(module) {
		return module.hot._selfDeclined;
	}

	/**
	 * Determines if a module has self-accepted status.
	 * @param {Object} module
	 * @returns {boolean}
	 */
	function isSelfAccepted(module) {
		return !!module.hot._selfAccepted;
	}

	/**
	 * Determines if a module is the main entry.
	 * @param {Object} module
	 * @returns {boolean}
	 */
	function isMainModule(module) {
		return !!module.hot._main;
	}

	function hotApply(options) {
		if (hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		let cb;
		let i;
		let j;
		let module;
		let moduleId;

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
				const currentId = queueItem.id;
				const chain = queueItem.chain;
				module = installedModules[currentId];
				if (!module || isSelfAccepted(module)) continue;
				if (isSelfDeclined(module)) {
					return {
						type: "self-declined",
						chain,
						moduleId: currentId
					};
				}
				if (isMainModule(module)) {
					return {
						type: "unaccepted",
						chain,
						moduleId: currentId
					};
				}
				for (let p = 0; p < module.parents.length; p++) {
					const parentId = module.parents[p];
					const parent = installedModules[parentId];
					if (!parent) continue;
					if (parent.hot._declinedDependencies[currentId]) {
						return {
							type: "declined",
							chain: chain.concat([parentId]),
							moduleId: currentId,
							parentId: parentId
						};
					}
					if (outdatedModules.indexOf(parentId) >= 0) continue;
					if (parent.hot._acceptedDependencies[currentId]) {
						if (!outdatedDependencies[parentId]) outdatedDependencies[parentId] = [];
						addAllToSet(outdatedDependencies[parentId], [currentId]);
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

		function addAllToSet(a, b) {
			for (let k = 0; k < b.length; k++) {
				const item = b[k];
				if (a.indexOf(item) < 0) a.push(item);
			}
		}

		const outdatedDependencies = {};
		const outdatedModules = [];
		const appliedUpdate = {};

		const warnUnexpectedRequire = function() {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;
			moduleId = toModuleId(id);
			let result;
			if (hotUpdate[id]) {
				result = getAffectedStuff(moduleId);
			} else {
				result = {
					type: "disposed",
					moduleId: id
				};
			}
			let abortError = false;
			let doApply = false;
			let doDispose = false;
			let chainInfo = "";
			if (result.chain) {
				chainInfo = "\nUpdate propagation: " + result.chain.join(" -> ");
			}
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
					throw new Error("Unexception type " + result.type);
			}
			if (abortError) {
				hotSetStatus("abort");
				return Promise.reject(abortError);
			}
			if (doApply) {
				appliedUpdate[moduleId] = hotUpdate[moduleId];
				addAllToSet(outdatedModules, result.outdatedModules);
				for (const depId in result.outdatedDependencies) {
					if (!Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depId)) continue;
					if (!outdatedDependencies[depId]) outdatedDependencies[depId] = [];
					addAllToSet(outdatedDependencies[depId], result.outdatedDependencies[depId]);
				}
			}
			if (doDispose) {
				addAllToSet(outdatedModules, [result.moduleId]);
				appliedUpdate[moduleId] = warnUnexpectedRequire;
			}
		}

		const outdatedSelfAcceptedModules = [];
		for (i = 0; i < outdatedModules.length; i++) {
			moduleId = outdatedModules[i];
			if (installedModules[moduleId] && installedModules[moduleId].hot._selfAccepted) {
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
			if (!module) continue;

			const data = {};

			const disposeHandlers = module.hot._disposeHandlers;
			for (j = 0; j < disposeHandlers.length; j++) {
				cb = disposeHandlers[j];
				cb(data);
			}
			hotCurrentModuleData[moduleId] = data;

			module.hot.active = false;
			delete installedModules[moduleId];

			for (j = 0; j < module.children.length; j++) {
				const child = installedModules[module.children[j]];
				if (!child) continue;
				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) child.parents.splice(idx, 1);
			}
		}

		for (const modId in outdatedDependencies) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, modId)) continue;
			module = installedModules[modId];
			if (!module) continue;
			const deps = outdatedDependencies[modId];
			for (j = 0; j < deps.length; j++) {
				const dep = deps[j];
				const idx = module.children.indexOf(dep);
				if (idx >= 0) module.children.splice(idx, 1);
			}
		}

		hotSetStatus("apply");
		hotCurrentHash = hotUpdateNewHash;

		for (moduleId in appliedUpdate) {
			if (!Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) continue;
			modules[moduleId] = appliedUpdate[moduleId];
		}

		let error = null;
		for (moduleId in outdatedDependencies) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;
			module = installedModules[moduleId];
			const deps = outdatedDependencies[moduleId];
			const callbacks = [];
			for (i = 0; i < deps.length; i++) {
				const dep = deps[i];
				cb = module.hot._acceptedDependencies[dep];
				if (callbacks.indexOf(cb) >= 0) continue;
				callbacks.push(cb);
			}
			for (i = 0; i < callbacks.length; i++) {
				cb = callbacks[i];
				try {
					cb(deps);
				} catch (err) {
					if (options.onErrored) {
						options.onErrored({
							type: "accept-errored",
							moduleId,
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

		for (i = 0; i < outdatedSelfAcceptedModules.length; i++) {
			const item = outdatedSelfAcceptedModules[i];
			moduleId = item.module;
			hotCurrentParents.splice(0, hotCurrentParents.length, moduleId);
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