var hotCreateRequire = function(hotCreateRequire$$1, installedModules, $require$, hotCurrentParents, hotCurrentChildModule, hotChunksLoading, hotStatus, hotWaitingFilesMap, hotEnsureUpdateChunk, hotUpdateDownloaded, hotSetStatus, hotWaitingFiles, hotStatusHandlers) {
	return function(hotCreateRequiremoduleId) {
		var me = installedModules[hotCreateRequiremoduleId];
		if(!me) return $require$;
		var fn = function(request) {
			if(me.hot.active) {
				if(installedModules[request]) {
					if(installedModules[request].parents.indexOf(hotCreateRequiremoduleId) < 0)
						installedModules[request].parents.push(hotCreateRequiremoduleId);
				} else {
					hotCurrentParents = [hotCreateRequiremoduleId];
					hotCurrentChildModule = request;
				}
				if(me.children.indexOf(request) < 0)
					me.children.push(request);
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + hotCreateRequiremoduleId);
				hotCurrentParents = [];
			}
			return $require$(request);
		};
		var ObjectFactory = function ObjectFactory(name) {
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
};

var hotCreateModule = function(hotCurrentChildModule, hotCurrentModuleData) {
	return function(hotCreateModulemoduleId) {
		var hot = {
			acceptedDependencies: {},
			declinedDependencies: {},
			selfAccepted: false,
			selfDeclined: false,
			disposeHandlers: [],
			main: hotCurrentChildModule !== hotCreateModulemoduleId,

			active: true,
			accept: function(dep, callback) {
				if(typeof dep === "undefined")
					hot.selfAccepted = true;
				else if(typeof dep === "function")
					hot.selfAccepted = dep;
				else if(typeof dep === "object")
					for(var i = 0; i < dep.length; i++)
						hot.acceptedDependencies[dep[i]] = callback || function() {};
				else
					hot.acceptedDependencies[dep] = callback || function() {};
			},
			decline: function(dep) {
				if(typeof dep === "undefined")
					hot.selfDeclined = true;
				else if(typeof dep === "object")
					for(var i = 0; i < dep.length; i++)
						hot.declinedDependencies[dep[i]] = true;
				else
					hot.declinedDependencies[dep] = true;
			},
			dispose: function(callback) {
				hot.disposeHandlers.push(callback);
			},
			addDisposeHandler: function(callback) {
				hot.disposeHandlers.push(callback);
			},
			removeDisposeHandler: function(callback) {
				var idx = hot.disposeHandlers.indexOf(callback);
				if(idx >= 0) hot.disposeHandlers.splice(idx, 1);
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

			data: hotCurrentModuleData[hotCreateModulemoduleId]
		};
		hotCurrentChildModule = undefined;
		return hot;
	};
};

var getAffectedStuff = function(installedModules, getAffectedStuffupdateModuleId) {
	var outdatedModules = [getAffectedStuffupdateModuleId];
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
		var module = installedModules[moduleId];
		if(!module || module.hot.selfAccepted)
			continue;
		if(module.hot.selfDeclined) {
			return {
				type: "self-declined",
				chain: chain,
				moduleId: moduleId
			};
		}
		if(module.hot.main) {
			return {
				type: "unaccepted",
				chain: chain,
				moduleId: moduleId
			};
		}
		for(var i = 0; i < module.parents.length; i++) {
			var parentId = module.parents[i];
			var parent = installedModules[parentId];
			if(!parent) continue;
			if(parent.hot.declinedDependencies[moduleId]) {
				return {
					type: "declined",
					chain: chain.concat([parentId]),
					moduleId: moduleId,
					parentId: parentId
				};
			}
			if(outdatedModules.indexOf(parentId) >= 0) continue;
			if(parent.hot.acceptedDependencies[moduleId]) {
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

	return {
		type: "accepted",
		moduleId: getAffectedStuffupdateModuleId,
		outdatedModules: outdatedModules,
		outdatedDependencies: outdatedDependencies
	};
};

var addAllToSet = function(a, b) {
	for(var i = 0; i < b.length; i++) {
		var item = b[i];
		if(a.indexOf(item) < 0)
			a.push(item);
	}
};

var toModuleId = function(id) {
	var isNumber = (+id) + "" === id;
	return isNumber ? +id : id;
};

var hotSetStatus = function(hotStatusHandlers, hotStatus) {
	return function(newStatus) {
		hotStatus = newStatus;
		for(var i = 0; i < hotStatusHandlers.length; i++)
			hotStatusHandlers[i].call(null, newStatus);
	};
};

var hotCheck = function(hotSetStatus, hotApplyOnUpdate, hotDownloadManifest, hotRequestedFilesMap, hotWaitingFilesMap, hotAvailableFilesMap, hotUpdateNewHash, hotChunksLoading, hotWaitingFiles, hotDeferred, hotUpdate, hotEnsureUpdateChunk, hotUpdateDownloaded) {
	return function(apply) {
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
			var promise = new Promise(function(resolve, reject) {
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
};

var hotAddUpdateChunk = function(hotAvailableFilesMap, hotRequestedFilesMap, hotWaitingFiles, hotUpdateDownloaded) {
	return function(chunkId, moreModules) {
		if(!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId])
			return;
		hotRequestedFilesMap[chunkId] = false;
		for(var moduleId in moreModules) {
			if(Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
				hotUpdate[moduleId] = moreModules[moduleId];
			}
		}
		if(--hotWaitingFiles === 0 && hotChunksLoading === 0) {
			hotUpdateDownloaded();
		}
	};
};

var hotEnsureUpdateChunk = function(hotAvailableFilesMap, hotRequestedFilesMap, hotWaitingFiles, hotDownloadUpdateChunk) {
	return function(chunkId) {
		if(!hotAvailableFilesMap[chunkId]) {
			hotWaitingFilesMap[chunkId] = true;
		} else {
			hotRequestedFilesMap[chunkId] = true;
			hotWaitingFiles++;
			hotDownloadUpdateChunk(chunkId);
		}
	};
};

var hotUpdateDownloaded = function(hotSetStatus, hotDeferred, hotApplyOnUpdate, hotApply, hotUpdate) {
	return function() {
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
	};
};

var hotApply = function(hotSetStatus, hotCurrentHash, hotUpdateNewHash, hotAvailableFilesMap, hotDisposeChunk, installedModules, hotCurrentModuleData, modules, toModuleId, getAffectedStuff, addAllToSet) {
	return function(options) {
		if(hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		var cb;
		var i;
		var j;
		var module;
		var moduleId;

		var outdatedDependencies = {};
		var outdatedModules = [];
		var appliedUpdate = {};

		var warnUnexpectedRequire = function warnUnexpectedRequire(result) {
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
					hotSetStatus("abort");
					return Promise.reject(abortError);
				}
				if(doApply) {
					appliedUpdate[moduleId] = hotUpdate[moduleId];
					addAllToSet(outdatedModules, result.outdatedModules);
					for(moduleId in result.outdatedDependencies) {
						if(Object.prototype.hasOwnProperty.call(result.outdatedDependencies, moduleId)) {
							if(!outdatedDependencies[moduleId])
								outdatedDependencies[moduleId] = [];
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
			if(installedModules[moduleId] && installedModules[moduleId].hot.selfAccepted)
				outdatedSelfAcceptedModules.push({
					module: moduleId,
					errorHandler: installedModules[moduleId].hot.selfAccepted
				});
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

			var disposeHandlers = module.hot.disposeHandlers;
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

		for(moduleId in outdatedDependencies) {
			if(Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) {
				module = installedModules[moduleId];
				if(module) {
					var moduleOutdatedDependencies = outdatedDependencies[moduleId];
					for(j = 0; j < moduleOutdatedDependencies.length; j++) {
						var dependency = moduleOutdatedDependencies[j];
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
				var moduleOutdatedDependencies = outdatedDependencies[moduleId];
				var callbacks = [];
				for(i = 0; i < moduleOutdatedDependencies.length; i++) {
					var dependency = moduleOutdatedDependencies[i];
					cb = module.hot.acceptedDependencies[dependency];
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
							if(!error)
								error = err;
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
							if(!error)
								error = err2;
						}
						if(!error)
							error = err;
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
						if(!error)
							error = err;
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
	};
};

/*global $hash$ installedModules $require$ hotDownloadManifest hotDownloadUpdateChunk hotDisposeChunk modules */
module.exports = function() {

	var hotApplyOnUpdate = true;
	var hotCurrentHash = $hash$;
	var hotCurrentModuleData = {};
	var hotCurrentChildModule;
	var hotCurrentParents = [];
	var hotCurrentParentsTemp = [];

	var hotStatusHandlers = [];
	var hotStatus = "idle";

	var hotCreateRequire$$1 = hotCreateRequire(hotCreateRequire, installedModules, $require$, hotCurrentParents, hotCurrentChildModule, 0, "idle", {}, function() {}, function() {}, hotSetStatus, 0, hotStatusHandlers);
	var hotCreateModule$$1 = hotCreateModule(hotCurrentChildModule, hotCurrentModuleData);
	var getAffectedStuff$$1 = getAffectedStuff(installedModules);
	var addAllToSet$$1 = addAllToSet;
	var toModuleId$$1 = toModuleId;
	var hotSetStatus$$1 = hotSetStatus(hotStatusHandlers, hotStatus);
	var hotCheck$$1 = hotCheck(hotSetStatus, hotApplyOnUpdate, hotDownloadManifest, {}, {}, {}, "", 0, 0, null, {}, hotEnsureUpdateChunk$$1, hotUpdateDownloaded$$1);
	var hotAddUpdateChunk$$1 = hotAddUpdateChunk({}, {}, 0, hotUpdateDownloaded$$1);
	var hotEnsureUpdateChunk$$1 = hotEnsureUpdateChunk({}, {}, 0, hotDownloadUpdateChunk);
	var hotUpdateDownloaded$$1 = hotUpdateDownloaded(hotSetStatus, null, hotApplyOnUpdate, hotApply$$1, {});
	var hotApply$$1 = hotApply(hotSetStatus, hotCurrentHash, "", {}, hotDisposeChunk, installedModules, hotCurrentModuleData, modules, toModuleId$$1, getAffectedStuff$$1, addAllToSet$$1);

	var hotDeferred = null;
	var hotWaitingFiles = 0;
	var hotChunksLoading = 0;
	var hotWaitingFilesMap = {};
	var hotRequestedFilesMap = {};
	var hotAvailableFilesMap = {};
	var hotUpdate = {};
	var hotUpdateNewHash = "";

	var hotSetStatus = function(newStatus) {
		hotStatus = newStatus;
		for(var i = 0; i < hotStatusHandlers.length; i++)
			hotStatusHandlers[i].call(null, newStatus);
	};

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
			var promise = new Promise(function(resolve, reject) {
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

	function hotAddUpdateChunk(chunkId, moreModules) {
		if(!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId])
			return;
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
		if(hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		var cb;
		var i;
		var j;
		var module;
		var moduleId;

		var outdatedDependencies = {};
		var outdatedModules = [];
		var appliedUpdate = {};

		var warnUnexpectedRequire = function warnUnexpectedRequire(result) {
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
					hotSetStatus("abort");
					return Promise.reject(abortError);
				}
				if(doApply) {
					appliedUpdate[moduleId] = hotUpdate[moduleId];
					addAllToSet(outdatedModules, result.outdatedModules);
					for(moduleId in result.outdatedDependencies) {
						if(Object.prototype.hasOwnProperty.call(result.outdatedDependencies, moduleId)) {
							if(!outdatedDependencies[moduleId])
								outdatedDependencies[moduleId] = [];
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
			if(installedModules[moduleId] && installedModules[moduleId].hot.selfAccepted)
				outdatedSelfAcceptedModules.push({
					module: moduleId,
					errorHandler: installedModules[moduleId].hot.selfAccepted
				});
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

			var disposeHandlers = module.hot.disposeHandlers;
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

		for(moduleId in outdatedDependencies) {
			if(Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) {
				module = installedModules[moduleId];
				if(module) {
					var moduleOutdatedDependencies = outdatedDependencies[moduleId];
					for(j = 0; j < moduleOutdatedDependencies.length; j++) {
						var dependency = moduleOutdatedDependencies[j];
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
				var moduleOutdatedDependencies = outdatedDependencies[moduleId];
				var callbacks = [];
				for(i = 0; i < moduleOutdatedDependencies.length; i++) {
					var dependency = moduleOutdatedDependencies[i];
					cb = module.hot.acceptedDependencies[dependency];
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
							if(!error)
								error = err;
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
							if(!error)
								error = err2;
						}
						if(!error)
							error = err;
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
						if(!error)
							error = err;
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

	return {
		createRequire: hotCreateRequire$$1,
		createModule: hotCreateModule$$1,
		check: hotCheck,
		apply: hotApply,
		addUpdateChunk: hotAddUpdateChunk,
		ensureUpdateChunk: hotEnsureUpdateChunk,
		updateDownloaded: hotUpdateDownloaded,
		setStatus: hotSetStatus
	};
};