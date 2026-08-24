/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {

	var hotApplyOnUpdate = true;
	var hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	var hotCurrentModuleData = {};
	var hotCurrentChildModule; // eslint-disable-line no-unused-vars
	var hotCurrentParents = []; // eslint-disable-line no-unused-vars
	var hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	const createRequire = function(moduleId) { // eslint-disable-line no-unused-vars
		const moduleRef = installedModules[moduleId];
		if(!moduleRef) return $require$;

		const fn = function(request) {
			if(moduleRef.hot.active) {
				if(installedModules[request]) {
					if(installedModules[request].parents.indexOf(moduleId) < 0)
						installedModules[request].parents.push(moduleId);
				} else {
					hotCurrentParents = [moduleId];
					hotCurrentChildModule = request;
				}
				if(moduleRef.children.indexOf(request) < 0)
					moduleRef.children.push(request);
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents = [];
			}
			return $require$(request);
		};

		const createPropertyDescriptor = function(name) {
			return {
				configurable: true,
				enumerable: true,
				get: () => $require$[name],
				set: (value) => $require$[name] = value
			};
		};

		Object.keys($require$).forEach((name) => {
			if(Object.prototype.hasOwnProperty.call($require$, name) && name !== "e") {
				Object.defineProperty(fn, name, createPropertyDescriptor(name));
			}
		});

		fn.e = function(chunkId) {
			if(hotStatus === "ready")
				hotSetStatus("prepare");
			hotChunksLoading++;
			return $require$.e(chunkId).then(finishChunkLoading, function(err) {
				finishChunkLoading();
				throw err;
			});

			function finishChunkLoading() {
				hotChunksLoading--;
				if(hotStatus === "prepare") {
					if(!hotWaitingFilesMap[chunkId]) {
						hotEnsureUpdateChunk(chunkId);
					}
					if(hotChunksLoading === 0 && hotWaitingFiles === 0) {
						hotUpdateDownloaded();
					}
				}
			}
		};

		return fn;
	};

	const createModuleHotAPI = function(moduleId) { // eslint-disable-line no-unused-vars
		const hot = {
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: hotCurrentChildModule !== moduleId,

			active: true,
			accept: function(dep, callback) {
				if(typeof dep === "undefined")
					hot._selfAccepted = true;
				else if(typeof dep === "function")
					hot._selfAccepted = dep;
				else if(Array.isArray(dep))
					dep.forEach((d) => hot._acceptedDependencies[d] = callback || (() => {}));
				else
					hot._acceptedDependencies[dep] = callback || (() => {});
			},
			decline: function(dep) {
				if(typeof dep === "undefined")
					hot._selfDeclined = true;
				else if(Array.isArray(dep))
					dep.forEach((d) => hot._declinedDependencies[d] = true);
				else
					hot._declinedDependencies[dep] = true;
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

			data: hotCurrentModuleData[moduleId]
		};

		hotCurrentChildModule = undefined;
		return hot;
	};

	const hotStatusHandlers = [];
	let hotStatus = "idle";

	const setStatus = function(newStatus) {
		hotStatus = newStatus;
		hotStatusHandlers.forEach((handler) => handler.call(null, newStatus));
	};

	// while downloading
	let hotWaitingFiles = 0;
	let hotChunksLoading = 0;
	const hotWaitingFilesMap = {};
	const hotRequestedFilesMap = {};
	const hotAvailableFilesMap = {};
	let hotDeferred;

	// The update info
	let hotUpdate, hotUpdateNewHash;

	const toModuleId = function(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	};

	const check = function(apply) {
		if(hotStatus !== "idle") throw new Error("check() is only allowed in idle status");
		hotApplyOnUpdate = apply;
		setStatus("check");
		return hotDownloadManifest().then(function(update) {
			if(!update) {
				setStatus("idle");
				return null;
			}
			Object.assign(hotRequestedFilesMap, {});
			Object.assign(hotWaitingFilesMap, {});
			Object.assign(hotAvailableFilesMap, update.c);
			hotUpdateNewHash = update.h;

			setStatus("prepare");
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
	};

	const addUpdateChunk = function(chunkId, moreModules) { // eslint-disable-line no-unused-vars
		if(!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId])
			return;
		hotRequestedFilesMap[chunkId] = false;
		Object.keys(moreModules).forEach((moduleId) => {
			if(Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
				hotUpdate[moduleId] = moreModules[moduleId];
			}
		});
		if(--hotWaitingFiles === 0 && hotChunksLoading === 0) {
			hotUpdateDownloaded();
		}
	};

	const ensureUpdateChunk = function(chunkId) {
		if(!hotAvailableFilesMap[chunkId]) {
			hotWaitingFilesMap[chunkId] = true;
		} else {
			hotRequestedFilesMap[chunkId] = true;
			hotWaitingFiles++;
			hotDownloadUpdateChunk(chunkId);
		}
	};

	const updateDownloaded = function() {
		setStatus("ready");
		const deferred = hotDeferred;
		hotDeferred = null;
		if(!deferred) return;
		if(hotApplyOnUpdate) {
			apply(hotApplyOnUpdate).then(function(result) {
				deferred.resolve(result);
			}, function(err) {
				deferred.reject(err);
			});
		} else {
			const outdatedModules = [];
			Object.keys(hotUpdate).forEach((id) => {
				if(Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
					outdatedModules.push(toModuleId(id));
				}
			});
			deferred.resolve(outdatedModules);
		}
	};

	const apply = function(options) {
		if(hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		const getAffectedStuff = function(updateModuleId) {
			const outdatedModules = [updateModuleId];
			const outdatedDependencies = {};

			const queue = outdatedModules.slice().map((id) => ({
				chain: [id],
				id: id
			}));
			while(queue.length > 0) {
				const queueItem = queue.pop();
				const moduleId = queueItem.id;
				const chain = queueItem.chain;
				const moduleRef = installedModules[moduleId];
				if(!moduleRef || moduleRef.hot._selfAccepted)
					continue;
				if(moduleRef.hot._selfDeclined) {
					return {
						type: "self-declined",
						chain: chain,
						moduleId: moduleId
					};
				}
				if(moduleRef.hot._main) {
					return {
						type: "unaccepted",
						chain: chain,
						moduleId: moduleId
					};
				}
				moduleRef.parents.forEach((parentId) => {
					const parent = installedModules[parentId];
					if(!parent) return;
					if(parent.hot._declinedDependencies[moduleId]) {
						return {
							type: "declined",
							chain: chain.concat([parentId]),
							moduleId: moduleId,
							parentId: parentId
						};
					}
					if(outdatedModules.indexOf(parentId) >= 0) return;
					if(parent.hot._acceptedDependencies[moduleId]) {
						if(!outdatedDependencies[parentId])
							outdatedDependencies[parentId] = [];
						addAllToSet(outdatedDependencies[parentId], [moduleId]);
						return;
					}
					delete outdatedDependencies[parentId];
					outdatedModules.push(parentId);
					queue.push({
						chain: chain.concat([parentId]),
						id: parentId
					});
				});
			}

			return {
				type: "accepted",
				moduleId: updateModuleId,
				outdatedModules: outdatedModules,
				outdatedDependencies: outdatedDependencies
			};
		};

		const addAllToSet = function(a, b) {
			b.forEach((item) => {
				if(a.indexOf(item) < 0) a.push(item);
			});
		};

		const outdatedDependencies = {};
		const outdatedModules = [];
		const appliedUpdate = {};

		const warnUnexpectedRequire = function warnUnexpectedRequire() {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		Object.keys(hotUpdate).forEach((id) => {
			const moduleId = toModuleId(id);
			let result;
			if(hotUpdate[id]) {
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
			if(result.chain) {
				chainInfo = "\nUpdate propagation: " + result.chain.join(" -> ");
			}
			switch(result.type) {
				case "self-declined":
					if(options.onDeclined)
						options.onDeclined(result);
					if(!options.ignoreDeclined)
						abortError = new Error("Aborted because of self decline: " + result.moduleId + chainInfo);
					break;
				case "declined":
					if(options.onDeclined)
						options.onDeclined(result);
					if(!options.ignoreDeclined)
						abortError = new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + chainInfo);
					break;
				case "unaccepted":
					if(options.onUnaccepted)
						options.onUnaccepted(result);
					if(!options.ignoreUnaccepted)
						abortError = new Error("Aborted because " + moduleId + " is not accepted" + chainInfo);
					break;
				case "accepted":
					if(options.onAccepted)
						options.onAccepted(result);
					doApply = true;
					break;
				case "disposed":
					if(options.onDisposed)
						options.onDisposed(result);
					doDispose = true;
					break;
				default:
					throw new Error("Unexception type " + result.type);
			}
			if(abortError) {
				setStatus("abort");
				return Promise.reject(abortError);
			}
			if(doApply) {
				appliedUpdate[moduleId] = hotUpdate[moduleId];
				addAllToSet(outdatedModules, result.outdatedModules);
				Object.keys(result.outdatedDependencies).forEach((moduleId) => {
					if(Object.prototype.hasOwnProperty.call(result.outdatedDependencies, moduleId)) {
						if(!outdatedDependencies[moduleId])
							outdatedDependencies[moduleId] = [];
						addAllToSet(outdatedDependencies[moduleId], result.outdatedDependencies[moduleId]);
					}
				});
			}
			if(doDispose) {
				addAllToSet(outdatedModules, [result.moduleId]);
				appliedUpdate[result.moduleId] = warnUnexpectedRequire;
			}
		});

		const outdatedSelfAcceptedModules = [];
		outdatedModules.forEach((moduleId) => {
			const moduleRef = installedModules[moduleId];
			if(moduleRef && moduleRef.hot._selfAccepted) {
				outdatedSelfAcceptedModules.push({
					module: moduleId,
					errorHandler: moduleRef.hot._selfAccepted
				});
			}
		});

		setStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach((chunkId) => {
			if(hotAvailableFilesMap[chunkId] === false) {
				hotDisposeChunk(chunkId);
			}
		});

		const queue = outdatedModules.slice();
		while(queue.length > 0) {
			const moduleId = queue.pop();
			const moduleRef = installedModules[moduleId];
			if(!moduleRef) continue;

			const data = {};

			moduleRef.hot._disposeHandlers.forEach((cb) => {
				cb(data);
			});
			hotCurrentModuleData[moduleId] = data;

			moduleRef.hot.active = false;

			delete installedModules[moduleId];

			moduleRef.children.forEach((childId) => {
				const child = installedModules[childId];
				if(!child) return;
				const idx = child.parents.indexOf(moduleId);
				if(idx >= 0) {
					child.parents.splice(idx, 1);
				}
			});
		}

		Object.keys(outdatedDependencies).forEach((moduleId) => {
			const moduleRef = installedModules[moduleId];
			if(!moduleRef) return;
			const moduleOutdatedDependencies = outdatedDependencies[moduleId];
			moduleOutdatedDependencies.forEach((dependency) => {
				const idx = moduleRef.children.indexOf(dependency);
				if(idx >= 0) moduleRef.children.splice(idx, 1);
			});
		});

		setStatus("apply");

		hotCurrentHash = hotUpdateNewHash;

		Object.keys(appliedUpdate).forEach((moduleId) => {
			if(Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		});

		let error = null;
		Object.keys(outdatedDependencies).forEach((moduleId) => {
			const moduleRef = installedModules[moduleId];
			const moduleOutdatedDependencies = outdatedDependencies[moduleId];
			const callbacks = [];
		(moduleOutdatedDependencies || []).forEach((dependency) => {
				const cb = moduleRef.hot._acceptedDependencies[dependency];
				if(callbacks.indexOf(cb) < 0) callbacks.push(cb);
			});
			callbacks.forEach((cb) => {
				try {
					cb(moduleOutdatedDependencies);
				} catch(err) {
					if(options.onErrored) {
						options.onErrored({
							type: "accept-errored",
							moduleId: moduleId,
							dependencyId: moduleOutdatedDependencies[0],
							error: err
						});
					}
					if(!options.ignoreErrored) {
						if(!error) error = err;
					}
				}
			});
		});

		outdatedSelfAcceptedModules.forEach((item) => {
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
								orginalError: err
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
		});

		if(error) {
			setStatus("fail");
			return Promise.reject(error);
		}

		setStatus("idle");
		return new Promise(function(resolve) {
			resolve(outdatedModules);
		});
	};

	return {
		check: check,
		apply: apply
	};
};