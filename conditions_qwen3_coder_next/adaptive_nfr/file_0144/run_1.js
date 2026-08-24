module.exports = function() {

	var hotApplyOnUpdate = true;
	var hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
	var hotCurrentModuleData = {};
	var hotCurrentChildModule; // eslint-disable-line no-unused-vars
	var hotCurrentParents = []; // eslint-disable-line no-unused-vars
	var hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

	/**
	 * Returns true if the given module is not installed, false otherwise.
	 * @param {number|string} moduleId - The module ID to check.
	 * @returns {boolean}
	 */
	function isModuleNotInstalled(moduleId) {
		return !installedModules[moduleId];
	}

	/**
	 * Returns true if the current module (me) is active.
	 * @returns {boolean}
	 */
	function isCurrentModuleActive() {
		var me = installedModules[hotCurrentChildModule || 0];
		return !!(me && me.hot.active);
	}

	/**
	 * Returns true if the request module is installed and not a parent of the current module.
	 * @param {number|string} request - Requested module ID.
	 * @returns {boolean}
	 */
	function isRequestModuleNewParent(request) {
		var me = installedModules[hotCurrentChildModule || 0];
		return !installedModules[request] || installedModules[request].parents.indexOf(me ? me.id : -1) < 0;
	}

	/**
	 * Returns true if the request is not in the children array.
	 * @param {string|number} request - Requested module ID.
	 * @returns {boolean}
	 */
	function isRequestMissingFromChildren(request) {
		var me = installedModules[hotCurrentChildModule || 0];
		return me ? me.children.indexOf(request) < 0 : true;
	}

	/**
	 * Returns true if the module is self-accepted.
	 * @param {module.exports} module - The module object.
	 * @returns {boolean}
	 */
	function isSelfAccepted(module) {
		return module && module.hot && module.hot._selfAccepted;
	}

	/**
	 * Returns true if the module is self-declined.
	 * @param {module.exports} module - The module object.
	 * @returns {boolean}
	 */
	function isSelfDeclined(module) {
		return module && module.hot && module.hot._selfDeclined;
	}

	/**
	 * Returns true if the parent's declined dependencies include the module.
	 * @param {module.exports} parent - Parent module.
	 * @param {string|number} moduleId - Module ID.
	 * @returns {boolean}
	 */
	function hasDeclinedDependency(parent, moduleId) {
		return parent && parent.hot && !!parent.hot._declinedDependencies[moduleId];
	}

	/**
	 * Returns true if the parent accepts the module's dependencies.
	 * @param {module.exports} parent - Parent module.
	 * @param {string|number} moduleId - Module ID.
	 * @returns {boolean}
	 */
	function hasAcceptedDependency(parent, moduleId) {
		return parent && parent.hot && !!parent.hot._acceptedDependencies[moduleId];
	}

	/**
	 * Returns true if the parent ID is already in the outdated modules list.
	 * @param {string|number} parentId - Parent module ID.
	 * @param {Array} outdatedModules - List of outdated modules.
	 * @returns {boolean}
	 */
	function isInOutdatedModules(parentId, outdatedModules) {
		return outdatedModules.indexOf(parentId) >= 0;
	}

	/**
	 * Returns true if the module is main.
	 * @param {module.exports} module - Module object.
	 * @returns {boolean}
	 */
	function isMainModule(module) {
		return module && module.hot && module.hot._main;
	}

	/**
	 * Returns true if the child module is missing from the parent's children list.
	 * @param {module.exports} parent - Parent module.
	 * @param {string|number} childId - Child module ID.
	 * @returns {boolean}
	 */
	function isChildMissingFromParentsChildren(parent, childId) {
		return parent.children.indexOf(childId) < 0;
	}

	/**
	 * Returns true if dispose handler is present.
	 * @param {module.exports} module - Module object.
	 * @returns {boolean}
	 */
	function hasDisposeHandlers(module) {
		return module && module.hot && module.hot._disposeHandlers.length > 0;
	}

	/**
	 * Returns true if the module has self accepted handlers.
	 * @param {module.exports} module - Module object.
	 * @returns {boolean}
	 */
	function hasSelfAcceptedHandlers(module) {
		return module && module.hot && !!module.hot._selfAccepted;
	}

	/**
	 * Returns true if the error handler is a function.
	 * @param {any} handler - The handler to check.
	 * @returns {boolean}
	 */
	function isErrorHandlerFunction(handler) {
		return typeof handler === "function";
	}

	/**
	 * Registers all dependents of 'b' into 'a' if not already present.
	 * @param {Array} a - Target array.
	 * @param {Array} b - Source array.
	 */
	function addAllToSet(a, b) {
		for(var i = 0; i < b.length; i++) {
			var item = b[i];
			if(a.indexOf(item) < 0) {
				a.push(item);
			}
		}
	}

	/**
	 * Creates a custom require function for HMR.
	 */
	function hotCreateRequire(moduleId) {
		var me = installedModules[moduleId];
		if(isModuleNotInstalled(moduleId)) return $require$;

		var fn = function(request) {
			var currentModule = installedModules[moduleId];
			if(currentModule && currentModule.hot.active) {
				var requestModule = installedModules[request];
				if(requestModule) {
					if(isRequestModuleNewParent(request)) {
						requestModule.parents.push(moduleId);
					}
				} else {
					hotCurrentParents = [moduleId];
					hotCurrentChildModule = request;
				}
				if(isRequestMissingFromChildren(request)) {
					currentModule.children.push(request);
				}
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents = [];
			}
			return $require$(request);
		};

		var ObjectFactory = function(name) {
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

		for(var name in $require$) {
			if(Object.prototype.hasOwnProperty.call($require$, name) && name !== "e") {
				Object.defineProperty(fn, name, ObjectFactory(name));
			}
		}

		fn.e = function(chunkId) {
			if(hotStatus === "ready") {
				hotSetStatus("prepare");
			}
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

	/**
	 * Creates a new HMR module instance.
	 */
	function hotCreateModule(moduleId) {
		var hot = {
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: hotCurrentChildModule !== moduleId,

			active: true,
			accept: function(dep, callback) {
				if(typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if(typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if(Array.isArray(dep)) {
					for(var i = 0; i < dep.length; i++) {
						hot._acceptedDependencies[dep[i]] = callback || function() {};
					}
				} else {
					hot._acceptedDependencies[dep] = callback || function() {};
				}
			},
			decline: function(dep) {
				if(typeof dep === "undefined") {
					hot._selfDeclined = true;
				} else if(Array.isArray(dep)) {
					for(var i = 0; i < dep.length; i++) {
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
				var idx = hot._disposeHandlers.indexOf(callback);
				if(idx >= 0) hot._disposeHandlers.splice(idx, 1);
			},
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
				var idx = hotStatusHandlers.indexOf(l);
				if(idx >= 0) hotStatusHandlers.splice(idx, 1);
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
		for(var i = 0; i < hotStatusHandlers.length; i++) {
			hotStatusHandlers[i].call(null, newStatus);
		}
	}

	var hotWaitingFiles = 0;
	var hotChunksLoading = 0;
	var hotWaitingFilesMap = {};
	var hotRequestedFilesMap = {};
	var hotAvailableFilesMap = {};
	var hotDeferred;

	var hotUpdate, hotUpdateNewHash;

	function toModuleId(id) {
		var isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

	function hotCheck(apply) {
		if(hotStatus !== "idle") {
			throw new Error("check() is only allowed in idle status");
		}
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
			var promise = new Promise(function(resolve, reject) {
				hotDeferred = {
					resolve: resolve,
					reject: reject
				};
			});
			hotUpdate = {};
			{
				/*globals chunkId */
				hotEnsureUpdateChunk(chunkId);
			}
			if(hotStatus === "prepare" && hotChunksLoading === 0 && hotWaitingFiles === 0) {
				hotUpdateDownloaded();
			}
			return promise;
		});
	}

	function hotAddUpdateChunk(chunkId, moreModules) {
		if(!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId]) {
			return;
		}
		hotRequestedFilesMap[chunkId] = false;
		for(var moduleId in moreModules) {
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
		var deferred = hotDeferred;
		hotDeferred = null;
		if(!deferred) return;
		if(hotApplyOnUpdate) {
			hotApply(hotApplyOnUpdate).then(function(result) {
				deferred.resolve(result);
			}, function(err) {
				deferred.reject(err);
			});
		} else {
			var outdatedModules = [];
			for(var id in hotUpdate) {
				if(Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
					outdatedModules.push(toModuleId(id));
				}
			}
			deferred.resolve(outdatedModules);
		}
	}

	function hotApply(options) {
		if(hotStatus !== "ready") {
			throw new Error("apply() is only allowed in ready status");
		}
		options = options || {};

		var cb;
		var i;
		var j;
		var module;
		var moduleId;

		/**
		 * Determines affected modules and dependencies given an update module ID.
		 */
		function getAffectedStuff(updateModuleId) {
			var outdatedModules = [updateModuleId];
			var outdatedDependencies = {};

			var queue = outdatedModules.slice().map(function(id) {
				return {
					chain: [id],
					id: id
				};
			});
			while(queue.length > 0) {
				var queueItem = queue.pop();
				var moduleId = queueItem.id;
				var chain = queueItem.chain;
				module = installedModules[moduleId];
				if(!module || isSelfAccepted(module)) {
					continue;
				}
				if(isSelfDeclined(module)) {
					return {
						type: "self-declined",
						chain: chain,
						moduleId: moduleId
					};
				}
				if(isMainModule(module)) {
					return {
						type: "unaccepted",
						chain: chain,
						moduleId: moduleId
					};
				}
				for(i = 0; i < module.parents.length; i++) {
					var parentId = module.parents[i];
					var parent = installedModules[parentId];
					if(!parent) continue;
					if(hasDeclinedDependency(parent, moduleId)) {
						return {
							type: "declined",
							chain: chain.concat([parentId]),
							moduleId: moduleId,
							parentId: parentId
						};
					}
					if(isInOutdatedModules(parentId, outdatedModules)) continue;
					if(hasAcceptedDependency(parent, moduleId)) {
						if(!outdatedDependencies[parentId]) {
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

		var outdatedDependencies = {};
		var outdatedModules = [];
		var appliedUpdate = {};

		var warnUnexpectedRequire = function warnUnexpectedRequire() {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		for(var id in hotUpdate) {
			if(Object.prototype.hasOwnProperty.call(hotUpdate, id)) {
				moduleId = toModuleId(id);
				var result;
				if(hotUpdate[id]) {
					result = getAffectedStuff(moduleId);
				} else {
					result = {
						type: "disposed",
						moduleId: id
					};
				}
				var abortError = false;
				var doApply = false;
				var doDispose = false;
				var chainInfo = "";
				if(result.chain) {
					chainInfo = "\nUpdate propagation: " + result.chain.join(" -> ");
				}
				switch(result.type) {
					case "self-declined":
						if(options.onDeclined) {
							options.onDeclined(result);
						}
						if(!options.ignoreDeclined) {
							abortError = new Error("Aborted because of self decline: " + result.moduleId + chainInfo);
						}
						break;
					case "declined":
						if(options.onDeclined) {
							options.onDeclined(result);
						}
						if(!options.ignoreDeclined) {
							abortError = new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + chainInfo);
						}
						break;
					case "unaccepted":
						if(options.onUnaccepted) {
							options.onUnaccepted(result);
						}
						if(!options.ignoreUnaccepted) {
							abortError = new Error("Aborted because " + moduleId + " is not accepted" + chainInfo);
						}
						break;
					case "accepted":
						if(options.onAccepted) {
							options.onAccepted(result);
						}
						doApply = true;
						break;
					case "disposed":
						if(options.onDisposed) {
							options.onDisposed(result);
						}
						doDispose = true;
						break;
					default:
						throw new Error("Unexception type " + result.type);
				}
				if(abortError) {
					hotSetStatus("abort");
					return Promise.reject(abortError);
				}
				if(doApply) {
					appliedUpdate[moduleId] = hotUpdate[moduleId];
					addAllToSet(outdatedModules, result.outdatedModules);
					for(moduleId in result.outdatedDependencies) {
						if(Object.prototype.hasOwnProperty.call(result.outdatedDependencies, moduleId)) {
							if(!outdatedDependencies[moduleId]) {
								outdatedDependencies[moduleId] = [];
							}
							addAllToSet(outdatedDependencies[moduleId], result.outdatedDependencies[moduleId]);
						}
					}
				}
				if(doDispose) {
					addAllToSet(outdatedModules, [result.moduleId]);
					appliedUpdate[moduleId] = warnUnexpectedRequire;
				}
			}
		}

		var outdatedSelfAcceptedModules = [];
		for(i = 0; i < outdatedModules.length; i++) {
			moduleId = outdatedModules[i];
			if(installedModules[moduleId] && hasSelfAcceptedHandlers(installedModules[moduleId])) {
				outdatedSelfAcceptedModules.push({
					module: moduleId,
					errorHandler: installedModules[moduleId].hot._selfAccepted
				});
			}
		}

		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(function(chunkId) {
			if(hotAvailableFilesMap[chunkId] === false) {
				hotDisposeChunk(chunkId);
			}
		});

		var idx;
		var queue = outdatedModules.slice();
		while(queue.length > 0) {
			moduleId = queue.pop();
			module = installedModules[moduleId];
			if(!module) continue;

			var data = {};

			var disposeHandlers = module.hot._disposeHandlers;
			for(j = 0; j < disposeHandlers.length; j++) {
				cb = disposeHandlers[j];
				cb(data);
			}
			hotCurrentModuleData[moduleId] = data;

			module.hot.active = false;

			delete installedModules[moduleId];

			for(j = 0; j < module.children.length; j++) {
				var child = installedModules[module.children[j]];
				if(!child) continue;
				idx = child.parents.indexOf(moduleId);
				if(idx >= 0) {
					child.parents.splice(idx, 1);
				}
			}
		}

		var dependency;
		var moduleOutdatedDependencies;
		for(moduleId in outdatedDependencies) {
			if(Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) {
				module = installedModules[moduleId];
				if(module) {
					moduleOutdatedDependencies = outdatedDependencies[moduleId];
					for(j = 0; j < moduleOutdatedDependencies.length; j++) {
						dependency = moduleOutdatedDependencies[j];
						idx = module.children.indexOf(dependency);
						if(idx >= 0) module.children.splice(idx, 1);
					}
				}
			}
		}

		hotSetStatus("apply");

		hotCurrentHash = hotUpdateNewHash;

		for(moduleId in appliedUpdate) {
			if(Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}

		var error = null;
		for(moduleId in outdatedDependencies) {
			if(Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) {
				module = installedModules[moduleId];
				moduleOutdatedDependencies = outdatedDependencies[moduleId];
				var callbacks = [];
				for(i = 0; i < moduleOutdatedDependencies.length; i++) {
					dependency = moduleOutdatedDependencies[i];
					cb = module.hot._acceptedDependencies[dependency];
					if(callbacks.indexOf(cb) >= 0) continue;
					callbacks.push(cb);
				}
				for(i = 0; i < callbacks.length; i++) {
					cb = callbacks[i];
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
							if(!error) {
								error = err;
							}
						}
					}
				}
			}
		}

		for(i = 0; i < outdatedSelfAcceptedModules.length; i++) {
			var item = outdatedSelfAcceptedModules[i];
			moduleId = item.module;
			hotCurrentParents = [moduleId];
			try {
				$require$(moduleId);
			} catch(err) {
				if(isErrorHandlerFunction(item.errorHandler)) {
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
							if(!error) {
								error = err2;
							}
						}
						if(!error) {
							error = err;
						}
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
						if(!error) {
							error = err;
						}
					}
				}
			}
		}

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