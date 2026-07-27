/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {

	let hotApplyOnUpdate = true;
	let hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	let hotCurrentModuleData = {};
	let hotCurrentChildModule; // eslint-disable-line no-unused-vars
	let hotCurrentParents = []; // eslint-disable-line no-unused-vars
	let hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	function hotCreateRequire(moduleId) { // eslint-disable-line no-unused-vars
		const me = installedModules[moduleId];
		if(!me) return $require$;
		const fn = function(request) {
			if(me.hot.active) {
				handleActiveModuleRequire(moduleId, request);
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents = [];
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
		for(const name in $require$) {
			if(Object.prototype.hasOwnProperty.call($require$, name) && name !== "e") {
				Object.defineProperty(fn, name, ObjectFactory(name));
			}
		}
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
	}

	/** @description Handle require calls from active modules */
	function handleActiveModuleRequire(moduleId, request) {
		if(installedModules[request]) {
			if(installedModules[request].parents.indexOf(moduleId) < 0)
				installedModules[request].parents.push(moduleId);
		} else {
			hotCurrentParents = [moduleId];
			hotCurrentChildModule = request;
		}
		if(installedModules[moduleId].children.indexOf(request) < 0)
			installedModules[moduleId].children.push(request);
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
				if(typeof dep === "undefined")
					hot._selfAccepted = true;
				else if(typeof dep === "function")
					hot._selfAccepted = dep;
				else if(typeof dep === "object")
					for(let i = 0; i < dep.length; i++)
						hot._acceptedDependencies[dep[i]] = callback || function() {};
				else
					hot._acceptedDependencies[dep] = callback || function() {};
			},
			decline: function(dep) {
				if(typeof dep === "undefined")
					hot._selfDeclined = true;
				else if(typeof dep === "object")
					for(let i = 0; i < dep.length; i++)
						hot._declinedDependencies[dep[i]] = true;
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

	let hotStatusHandlers = [];
	let hotStatus = "idle";

	function hotSetStatus(newStatus) {
		hotStatus = newStatus;
		for(let i = 0; i < hotStatusHandlers.length; i++)
			hotStatusHandlers[i].call(null, newStatus);
	}

	// while downloading
	let hotWaitingFiles = 0;
	let hotChunksLoading = 0;
	let hotWaitingFilesMap = {};
	let hotRequestedFilesMap = {};
	let hotAvailableFilesMap = {};
	let hotDeferred;

	// The update info
	let hotUpdate, hotUpdateNewHash;

	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

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

	function hotEnsureUpdateChunk(chunkId) {
		if(!hotAvailableFilesMap[chunkId]) {
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

	function hotApply(options) {
		if(hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
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
			while(queue.length > 0) {
				const queueItem = queue.pop();
				const itemModuleId = queueItem.id;
				const chain = queueItem.chain;
				module = installedModules[itemModuleId];
				if(!module || module.hot._selfAccepted)
					continue;
				if(module.hot._selfDeclined) {
					return {
						type: "self-declined",
						chain: chain,
						moduleId: itemModuleId
					};
				}
				if(module.hot._main) {
					return {
						type: "unaccepted",
						chain: chain,
						moduleId: itemModuleId
					};
				}
				processParents(itemModuleId, chain, module, outdatedModules, outdatedDependencies, queue);
			}

			return {
				type: "accepted",
				moduleId: updateModuleId,
				outdatedModules: outdatedModules,
				outdatedDependencies: outdatedDependencies
			};
		}

		/** @description Process parent modules for affected stuff calculation */
		function processParents(moduleId, chain, module, outdatedModules, outdatedDependencies, queue) {
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

		function addAllToSet(a, b) {
			for(let i = 0; i < b.length; i++) {
				const item = b[i];
				if(a.indexOf(item) < 0)
					a.push(item);
			}
		}

		// at begin all updates modules are outdated
		// the "outdated" status can propagate to parents if they don't accept the children
		const outdatedDependencies = {};
		const outdatedModules = [];
		const appliedUpdate = {};

		const warnUnexpectedRequire = function warnUnexpectedRequire() {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		for(const id in hotUpdate) {
			if(Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
				moduleId = toModuleId(id);
				const result = getResultForUpdate(id, moduleId);
				processUpdateResult(result, moduleId, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire);
			}
		}

		// Store self accepted outdated modules to require them later by the module system
		const outdatedSelfAcceptedModules = [];
		for(i = 0; i < outdatedModules.length; i++) {
			moduleId = outdatedModules[i];
			if(installedModules[moduleId] && installedModules[moduleId].hot._selfAccepted)
				outdatedSelfAcceptedModules.push({
					module: moduleId,
					errorHandler: installedModules[moduleId].hot._selfAccepted
				});
		}

		// Now in "dispose" phase
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(function(chunkId) {
			if(hotAvailableFilesMap[chunkId] === false) {
				hotDisposeChunk(chunkId);
			}
		});

		let idx;
		const queue = outdatedModules.slice();
		while(queue.length > 0) {
			moduleId = queue.pop();
			module = installedModules[moduleId];
			if(!module) continue;

			disposeModule(moduleId, module);
		}

		// remove outdated dependency from module children
		removeOutdatedDependencies(outdatedDependencies);

		// Not in "apply" phase
		hotSetStatus("apply");

		hotCurrentHash = hotUpdateNewHash;

		// insert new code
		for(moduleId in appliedUpdate) {
			if(Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}

		// call accept handlers
		let error = null;
		error = callAcceptHandlers(outdatedDependencies, error, options);

		// Load self accepted modules
		error = loadSelfAcceptedModules(outdatedSelfAcceptedModules, error, options);

		// handle errors in accept handlers and self accepted module load
		if(error) {
			hotSetStatus("fail");
			return Promise.reject(error);
		}

		hotSetStatus("idle");
		return new Promise(function(resolve) {
			resolve(outdatedModules);
		});
	}

	/** @description Get result object for an update */
	function getResultForUpdate(id, moduleId) {
		if(hotUpdate[id]) {
			return getAffectedStuff(moduleId);
		}
		return {
			type: "disposed",
			moduleId: id
		};
	}

	/** @description Process a single update result */
	function processUpdateResult(result, moduleId, options, appliedUpdate, outdatedModules, outdatedDependencies, warnUnexpectedRequire) {
		let abortError = false;
		let doApply = false;
		let doDispose = false;
		const chainInfo = result.chain ? "\nUpdate propagation: " + result.chain.join(" -> ") : "";

		const resultType = result.type;
		if(resultType === "self-declined") {
			handleSelfDeclined(options, result, chainInfo);
			abortError = !options.ignoreDeclined ? new Error("Aborted because of self decline: " + result.moduleId + chainInfo) : false;
		} else if(resultType === "declined") {
			handleDeclined(options, result, chainInfo);
			abortError = !options.ignoreDeclined ? new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + chainInfo) : false;
		} else if(resultType === "unaccepted") {
			handleUnaccepted(options, result, chainInfo);
			abortError = !options.ignoreUnaccepted ? new Error("Aborted because " + moduleId + " is not accepted" + chainInfo) : false;
		} else if(resultType === "accepted") {
			if(options.onAccepted)
				options.onAccepted(result);
			doApply = true;
		} else if(resultType === "disposed") {
			if(options.onDisposed)
				options.onDisposed(result);
			doDispose = true;
		} else {
			throw new Error("Unexception type " + resultType);
		}

		if(abortError) {
			hotSetStatus("abort");
			throw abortError;
		}

		if(doApply) {
			appliedUpdate[moduleId] = hotUpdate[moduleId];
			addAllToSet(outdatedModules, result.outdatedModules);
			mergeOutdatedDependencies(outdatedDependencies, result.outdatedDependencies);
		}

		if(doDispose) {
			addAllToSet(outdatedModules, [result.moduleId]);
			appliedUpdate[moduleId] = warnUnexpectedRequire;
		}
	}

	/** @description Handle self-declined result */
	function handleSelfDeclined(options, result, chainInfo) {
		if(options.onDeclined)
			options.onDeclined(result);
	}

	/** @description Handle declined result */
	function handleDeclined(options, result, chainInfo) {
		if(options.onDeclined)
			options.onDeclined(result);
	}

	/** @description Handle unaccepted result */
	function handleUnaccepted(options, result, chainInfo) {
		if(options.onUnaccepted)
			options.onUnaccepted(result);
	}

	/** @description Merge outdated dependencies */
	function mergeOutdatedDependencies(outdatedDependencies, resultOutdatedDependencies) {
		for(const moduleId in resultOutdatedDependencies) {
			if(Object.prototype.hasOwnProperty.call(resultOutdatedDependencies, moduleId)) {
				if(!outdatedDependencies[moduleId])
					outdatedDependencies[moduleId] = [];
				addAllToSet(outdatedDependencies[moduleId], resultOutdatedDependencies[moduleId]);
			}
		}
	}

	/** @description Dispose a module */
	function disposeModule(moduleId, module) {
		const data = {};

		// Call dispose handlers
		const disposeHandlers = module.hot._disposeHandlers;
		for(let j = 0; j < disposeHandlers.length; j++) {
			const cb = disposeHandlers[j];
			cb(data);
		}
		hotCurrentModuleData[moduleId] = data;

		// disable module (this disables requires from this module)
		module.hot.active = false;

		// remove module from cache
		delete installedModules[moduleId];

		// remove "parents" references from all children
		for(let j = 0; j < module.children.length; j++) {
			const child = installedModules[module.children[j]];
			if(!child) continue;
			const idx = child.parents.indexOf(moduleId);
			if(idx >= 0) {
				child.parents.splice(idx, 1);
			}
		}
	}

	/** @description Remove outdated dependencies from modules */
	function removeOutdatedDependencies(outdatedDependencies) {
		for(const moduleId in outdatedDependencies) {
			if(Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) {
				const module = installedModules[moduleId];
				if(module) {
					const moduleOutdatedDependencies = outdatedDependencies[moduleId];
					for(let j = 0; j < moduleOutdatedDependencies.length; j++) {
						const dependency = moduleOutdatedDependencies[j];
						const idx = module.children.indexOf(dependency);
						if(idx >= 0) module.children.splice(idx, 1);
					}
				}
			}
		}
	}

	/** @description Call accept handlers for outdated dependencies */
	function callAcceptHandlers(outdatedDependencies, error, options) {
		for(const moduleId in outdatedDependencies) {
			if(Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) {
				const module = installedModules[moduleId];
				const moduleOutdatedDependencies = outdatedDependencies[moduleId];
				const callbacks = [];
				for(let i = 0; i < moduleOutdatedDependencies.length; i++) {
					const dependency = moduleOutdatedDependencies[i];
					const cb = module.hot._acceptedDependencies[dependency];
					if(callbacks.indexOf(cb) >= 0) continue;
					callbacks.push(cb);
				}
				error = executeCallbacks(callbacks, moduleOutdatedDependencies, moduleId, error, options);
			}
		}
		return error;
	}

	/** @description Execute callbacks and handle errors */
	function executeCallbacks(callbacks, moduleOutdatedDependencies, moduleId, error, options) {
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
					if(!error)
						error = err;
				}
			}
		}
		return error;
	}

	/** @description Load self-accepted modules */
	function loadSelfAcceptedModules(outdatedSelfAcceptedModules, error, options) {
		for(let i = 0; i < outdatedSelfAcceptedModules.length; i++) {
			const item = outdatedSelfAcceptedModules[i];
			const moduleId = item.module;
			hotCurrentParents = [moduleId];
			error = requireSelfAcceptedModule(moduleId, item, error, options);
		}
		return error;
	}

	/** @description Require a self-accepted module and handle errors */
	function requireSelfAcceptedModule(moduleId, item, error, options) {
		try {
			$require$(moduleId);
		} catch(err) {
			error = handleSelfAcceptError(moduleId, item, err, error, options);
		}
		return error;
	}

	/** @description Handle errors from self-accepted module loading */
	function handleSelfAcceptError(moduleId, item, err, error, options) {
		if(typeof item.errorHandler === "function") {
			return handleSelfAcceptErrorHandler(moduleId, item, err, error, options);
		}
		return handleSelfAcceptErrorWithoutHandler(moduleId, err, error, options);
	}

	/** @description Handle self-accept error with error handler */
	function handleSelfAcceptErrorHandler(moduleId, item, err, error, options) {
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
				if(!error)
					error = err2;
			}
			if(!error)
				error = err;
		}
		return error;
	}

	/** @description Handle self-accept error without error handler */
	function handleSelfAcceptErrorWithoutHandler(moduleId, err, error, options) {
		if(options.onErrored) {
			options.onErrored({
				type: "self-accept-errored",
				moduleId: moduleId,
				error: err
			});
		}
		if(!options.ignoreErrored) {
			if(!error)
				error = err;
		}
		return error;
	}
};