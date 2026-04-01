```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
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
			handleRequireCall(request, moduleId, me);
			return $require$(request);
		};
		
		copyRequireProperties(fn);
		fn.e = createChunkLoadHandler();
		return fn;
	}

	// Handle require calls in HMR context
	function handleRequireCall(request, moduleId, me) {
		if(me.hot.active) {
			if(installedModules[request]) {
				if(installedModules[request].parents.indexOf(moduleId) < 0)
					installedModules[request].parents.push(moduleId);
			} else {
				hotCurrentParents = [moduleId];
				hotCurrentChildModule = request;
			}
			if(me.children.indexOf(request) < 0)
				me.children.push(request);
		} else {
			console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
			hotCurrentParents = [];
		}
	}

	// Copy properties from $require$ to custom require function
	function copyRequireProperties(fn) {
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
	}

	// Create chunk load handler for require.e
	function createChunkLoadHandler() {
		return function(chunkId) {
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
				handleAccept(hot, dep, callback);
			},
			decline: function(dep) {
				handleDecline(hot, dep);
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

	// Handle module accept calls
	function handleAccept(hot, dep, callback) {
		if(typeof dep === "undefined")
			hot._selfAccepted = true;
		else if(typeof dep === "function")
			hot._selfAccepted = dep;
		else if(typeof dep === "object")
			for(let i = 0; i < dep.length; i++)
				hot._acceptedDependencies[dep[i]] = callback || function() {};
		else
			hot._acceptedDependencies[dep] = callback || function() {};
	}

	// Handle module decline calls
	function handleDecline(hot, dep) {
		if(typeof dep === "undefined")
			hot._selfDeclined = true;
		else if(typeof dep === "object")
			for(let i = 0; i < dep.length; i++)
				hot._declinedDependencies[dep[i]] = true;
		else
			hot._declinedDependencies[dep] = true;
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

		const applyState = {
			outdatedDependencies: {},
			outdatedModules: [],
			appliedUpdate: {},
			outdatedSelfAcceptedModules: []
		};

		// Process all updates and determine affected modules
		processUpdates(applyState, options);

		if(applyState.abortError) {
			hotSetStatus("abort");
			return Promise.reject(applyState.abortError);
		}

		// Collect self-accepted modules
		collectSelfAcceptedModules(applyState);

		// Dispose phase
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(function(chunkId) {
			if(hotAvailableFilesMap[chunkId] === false) {
				hotDisposeChunk(chunkId);
			}
		});

		// Execute dispose handlers and clean up modules
		disposeOutdatedModules(applyState);

		// Apply phase
		hotSetStatus("apply");
		hotCurrentHash = hotUpdateNewHash;

		// Insert new code
		for(const moduleId in applyState.appliedUpdate) {
			if(Object.prototype.hasOwnProperty.call(applyState.appliedUpdate, moduleId)) {
				modules[moduleId] = applyState.appliedUpdate[moduleId];
			}
		}

		// Call accept handlers and load self-accepted modules
		const error = executeAcceptHandlers(applyState, options);

		if(error) {
			hotSetStatus("fail");
			return Promise.reject(error);
		}

		hotSetStatus("idle");
		return new Promise(function(resolve) {
			resolve(applyState.outdatedModules);
		});
	}

	// Process all updates and determine which modules are affected
	function processUpdates(applyState, options) {
		for(const id in hotUpdate) {
			if(Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
				const moduleId = toModuleId(id);
				const result = hotUpdate[id] ? 
					getAffectedStuff(moduleId) : 
					{ type: "disposed", moduleId: id };
				
				const chainInfo = result.chain ? "\nUpdate propagation: " + result.chain.join(" -> ") : "";
				
				if(!handleUpdateResult(result, moduleId, applyState, options, chainInfo)) {
					applyState.abortError = true;
					return;
				}
			}
		}
	}

	// Handle individual update result
	function handleUpdateResult(result, moduleId, applyState, options, chainInfo) {
		let abortError = false;
		let doApply = false;
		let doDispose = false;

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
					abortError = new Error("Aborted because " + moduleId + " is not accepted" + chainInfo);
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
			applyState.abortError = abortError;
			return false;
		}

		if(doApply) {
			applyState.appliedUpdate[moduleId] = hotUpdate[moduleId];
			addAllToSet(applyState.outdatedModules, result.outdatedModules);
			for(const depId in result.outdatedDependencies) {
				if(Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depId)) {
					if(!applyState.outdatedDependencies[depId])
						applyState.outdatedDependencies[depId] = [];
					addAllToSet(applyState.outdatedDependencies[depId], result.outdatedDependencies[depId]);
				}
			}
		}

		if(doDispose) {
			addAllToSet(applyState.outdatedModules, [result.moduleId]);
			applyState.appliedUpdate[moduleId] = function() {
				console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
			};
		}

		return true;
	}

	// Determine affected modules for a given update
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