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
			if(!me.hot.active) {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents = [];
				return $require$(request);
			}
			
			if(installedModules[request]) {
				if(installedModules[request].parents.indexOf(moduleId) < 0)
					installedModules[request].parents.push(moduleId);
			} else {
				hotCurrentParents = [moduleId];
				hotCurrentChildModule = request;
			}
			if(me.children.indexOf(request) < 0)
				me.children.push(request);
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
				if(hotStatus !== "prepare") return;
				if(!hotWaitingFilesMap[chunkId]) {
					hotEnsureUpdateChunk(chunkId);
				}
				if(hotChunksLoading === 0 && hotWaitingFiles === 0) {
					hotUpdateDownloaded();
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
				if(typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if(typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if(typeof dep === "object") {
					for(let i = 0; i < dep.length; i++)
						hot._acceptedDependencies[dep[i]] = callback || function() {};
				} else {
					hot._acceptedDependencies[dep] = callback || function() {};
				}
			},
			decline: function(dep) {
				if(typeof dep === "undefined") {
					hot._selfDeclined = true;
				} else if(typeof dep === "object") {
					for(let i = 0; i < dep.length; i++)
						hot._declinedDependencies[dep[i]] = true;
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
			return;
		}
		hotRequestedFilesMap[chunkId] = true;
		hotWaitingFiles++;
		hotDownloadUpdateChunk(chunkId);
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
			return;
		}
		const outdatedModules = [];
		for(const id in hotUpdate) {
			if(Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
				outdatedModules.push(toModuleId(id));
			}
		}
		deferred.resolve(outdatedModules);
	}

	function hotApply(options) {
		if(hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		let cb;
		let i;
		let j;
		let module;
		let moduleId;

		/**
		 * Determines if a module is self-accepted
		 * @param {Object} mod - The module to check
		 * @returns {boolean}
		 */
		function isModuleSelfAccepted(mod) {
			return mod && mod.hot._selfAccepted;
		}

		/**
		 * Determines if a module is self-declined
		 * @param {Object} mod - The module to check
		 * @returns {boolean}
		 */
		function isModuleSelfDeclined(mod) {
			return mod && mod.hot._selfDeclined;
		}

		/**
		 * Determines if a module is main
		 * @param {Object} mod - The module to check
		 * @returns {boolean}
		 */
		function isModuleMain(mod) {
			return mod && mod.hot._main;
		}

		/**
		 * Determines if parent declined the dependency
		 * @param {Object} parent - The parent module
		 * @param {string} moduleId - The module id
		 * @returns {boolean}
		 */
		function isParentDeclinedDependency(parent, moduleId) {
			return parent && parent.hot._declinedDependencies[moduleId];
		}

		/**
		 * Determines if parent accepted the dependency
		 * @param {Object} parent - The parent module
		 * @param {string} moduleId - The module id
		 * @returns {boolean}
		 */
		function isParentAcceptedDependency(parent, moduleId) {
			return parent && parent.hot._acceptedDependencies[moduleId];
		}

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
				const currentModuleId = queueItem.id;
				const chain = queueItem.chain;
				module = installedModules[currentModuleId];
				
				if(!module || isModuleSelfAccepted(module))
					continue;
				
				if(isModuleSelfDeclined(module)) {
					return {
						type: "self-declined",
						chain: chain,
						moduleId: currentModuleId
					};
				}
				
				if(isModuleMain(module)) {
					return {
						type: "unaccepted",
						chain: chain,
						moduleId: currentModuleId
					};
				}
				
				processModuleParents(module, currentModuleId, chain, outdatedModules, outdatedDependencies, queue);
			}

			return {
				type: "accepted",
				moduleId: updateModuleId,
				outdatedModules: outdatedModules,
				outdatedDependencies: outdatedDependencies
			};
		}

		function processModuleParents(module, moduleId, chain, outdatedModules, outdatedDependencies, queue) {
			for(let i = 0; i < module.parents.length; i++) {
				const parentId = module.parents[i];
				const parent = installedModules[parentId];
				if(!parent) continue;
				
				if(isParentDeclinedDependency(parent, moduleId)) {
					return {
						type: "declined",
						chain: chain.concat([parentId]),
						moduleId: moduleId,
						parentId: parentId
					};
				}
				
				if(outdatedModules.indexOf(parentId) >= 0) continue;
				
				if(isParentAcceptedDependency(parent, moduleId)) {
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
			if(!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;
			
			moduleId = toModuleId(id);
			let result;
			if(hotUpdate[id]) {
				result = getAffectedStuff(moduleId);
			} else {
				result = {
					type: "disposed",
					moduleId: id
				};
			}
			
			const chainInfo = result.chain ? "\nUpdate propagation: " + result.chain.join(" -> ") : "";
			const { abortError, doApply, doDispose } = processResultType(result, options, chainInfo, moduleId);
			
			if(abortError) {
				hotSetStatus("abort");
				return Promise.reject(abortError);
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

		/**
		 * Processes the result type and returns abort/apply/dispose flags
		 * @param {Object} result - The result object
		 * @param {Object} options - The options object
		 * @param {string} chainInfo - Chain information string
		 * @param {string} moduleId - The module id
		 * @returns {Object} Object with abortError, doApply, doDispose flags
		 */
		function processResultType(result, options, chainInfo, moduleId) {
			let abortError = false;
			let doApply = false;
			let doDispose = false;
			
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
			
			return { abortError, doApply, doDispose };
		}

		function mergeOutdatedDependencies(outdatedDependencies, resultOutdatedDependencies) {
			for(const moduleId in resultOutdatedDependencies) {
				if(!Object.prototype.hasOwnProperty.call(resultOutdatedDependencies, moduleId)) continue;
				if(!outdatedDependencies[moduleId])
					outdatedDependencies[moduleId] = [];
				addAllToSet(outdatedDependencies[moduleId], resultOutdatedDependencies[moduleId]);
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
		let queue = outdatedModules.slice();
		while(queue.length > 0) {
			moduleId = queue.pop();
			module = installedModules[moduleId];
			if(!module) continue;

			disposeModule(module, moduleId);
		}

		function disposeModule(module, moduleId) {
			const data = {};

			// Call dispose handlers
			const disposeHandlers = module.hot._disposeHandlers;
			for(j = 0; j < disposeHandlers.length; j++) {
				cb = disposeHandlers[j];
				cb(data);
			}
			hotCurrentModuleData[moduleId] = data;

			// disable module (this disables requires from this module)
			module.hot.active = false;

			// remove module from cache
			delete installedModules[moduleId];

			// remove "parents" references from all children
			for(j = 0; j < module.children.length; j++) {
				const child = installedModules[module.children[j]];
				if(!child) continue;
				idx = child.parents.indexOf(moduleId);
				if(idx >= 0) {
					child.parents.splice(idx, 1);
				}
			}
		}

		// remove outdated dependency from module children
		for(moduleId in outdatedDependencies) {
			if(!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;
			module = installedModules[moduleId];
			if(!module) continue;
			
			const moduleOutdatedDependencies = outdatedDependencies[moduleId];
			for(j = 0; j < moduleOutdatedDependencies.length; j++) {
				const dependency = moduleOutdatedDependencies[j];
				idx = module.children.indexOf(dependency);
				if(idx >= 0) module.children.splice(idx, 1);
			}
		}

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
		for(moduleId in outdatedDependencies) {
			if(!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;
			module = installedModules[moduleId];
			const moduleOutdatedDependencies = outdatedDependencies[moduleId];
			const callbacks = [];
			
			for(i = 0; i < moduleOutdatedDependencies.length; i++) {
				const dependency = moduleOutdatedDependencies[i];
				cb = module.hot._acceptedDependencies[dependency];
				if(callbacks.indexOf(cb) >= 0) continue;
				callbacks.push(cb);
			}
			
			for(i = 0; i < callbacks.length; i++) {
				cb = callbacks[i];
				error = executeCallback(cb, moduleOutdatedDependencies, i, options, error, moduleId);
			}
		}

		function executeCallback(cb, moduleOutdatedDependencies, index, options, error, moduleId) {
			try {
				cb(moduleOutdatedDependencies);
			} catch(err) {
				if(options.onErrored) {
					options.onErrored({
						type: "accept-errored",
						moduleId: moduleId,
						dependencyId: moduleOutdatedDependencies[index],
						error: err
					});
				}
				if(!options.ignoreErrored && !error)
					return err;
			}
			return error;
		}

		// Load self accepted modules
		for(i = 0; i < outdatedSelfAcceptedModules.length; i++) {
			const item = outdatedSelfAcceptedModules[i];
			moduleId = item.module;
			hotCurrentParents = [moduleId];
			error = loadSelfAcceptedModule(item, options, error, moduleId);
		}

		function loadSelfAcceptedModule(item, options, error, moduleId) {
			try {
				$require$(moduleId);
			} catch(err) {
				error = handleSelfAcceptError(item, err, options, error, moduleId);
			}
			return error;
		}

		function handleSelfAcceptError(item, err, options, error, moduleId) {
			if(typeof item.errorHandler !== "function") {
				if(options.onErrored) {
					options.onErrored({
						type: "self-accept-errored",
						moduleId: moduleId,
						error: err
					});
				}
				if(!options.ignoreErrored && !error)
					return err;
				return error;
			}
			
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
				if(!options.ignoreErrored && !error)
					return err2;
				if(!error)
					return err;
			}
			return error;
		}

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
};
```