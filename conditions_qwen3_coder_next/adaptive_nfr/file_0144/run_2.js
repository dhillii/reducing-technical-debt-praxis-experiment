var hotApplyOnUpdate = true;
var hotCurrentHash = $hash$; // eslint-disable-line no-unused-vars
var hotCurrentModuleData = {};
var hotCurrentChildModule; // eslint-disable-line no-unused-vars
var hotCurrentParents = []; // eslint-disable-line no-unused-vars
var hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

function hotCreateRequire(moduleId) { // eslint-disable-line no-unused-vars
	var me = installedModules[moduleId];
	if(!me) return $require$;

	var fn = function(request) {
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
}

function hotCreateModule(moduleId) { // eslint-disable-line no-unused-vars
	var hot = {
		acceptedDependencies: {},
		declinedDependencies: {},
		selfAccepted: false,
		selfDeclined: false,
		disposeHandlers: [],
		main: hotCurrentChildModule !== moduleId,

		active: true,
		accept: function(dep, callback) {
			if typeof dep === "undefined" ? hot.selfAccepted = true :
				typeof dep === "function" ? hot.selfAccepted = dep :
					typeof dep === "object" ? dep.forEach(function(id) {
						hot.acceptedDependencies[id] = callback || function() {};
					}) :
					hot.acceptedDependencies[dep] = callback || function() {};
		},
		decline: function(dep) {
			if typeof dep === "undefined" ? hot.selfDeclined = true :
				typeof dep === "object" ? dep.forEach(function(id) {
					hot.declinedDependencies[id] = true;
				}) :
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

		data: hotCurrentModuleData[moduleId]
	};

	hotCurrentChildModule = undefined;
	return hot;
}

var hotStatusHandlers = [];
var hotStatus = "idle";

function hotSetStatus(newStatus) {
	hotStatus = newStatus;
	for(var i = 0; i < hotStatusHandlers.length; i++)
		hotStatusHandlers[i].call(null, newStatus);
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
			hotDeferred = { resolve: resolve, reject: reject };
		});

		hotUpdate = {};
		{ /* foreachInstalledChunks */ /* globals chunkId */
			hotEnsureUpdateChunk(chunkId);
		}

		if(hotStatus === "prepare" && hotChunksLoading === 0 && hotWaitingFiles === 0)
			hotUpdateDownloaded();

		return promise;
	});
}

function hotAddUpdateChunk(chunkId, moreModules) { // eslint-disable-line no-unused-vars
	if(!hotAvailableFilesMap[chunkId] || !hotRequestedFilesMap[chunkId])
		return;

	hotRequestedFilesMap[chunkId] = false;

	for(var moduleId in moreModules) {
		if(Object.prototype.hasOwnProperty.call(moreModules, moduleId))
			hotUpdate[moduleId] = moreModules[moduleId];
	}

	if(--hotWaitingFiles === 0 && hotChunksLoading === 0)
		hotUpdateDownloaded();
}

function hotEnsureUpdateChunk(chunkId) {
	if(hotAvailableFilesMap[chunkId])
		hotRequestedFilesMap[chunkId] = true;
	else
		hotWaitingFilesMap[chunkId] = true;

	if(hotAvailableFilesMap[chunkId]) {
		hotWaitingFiles++;
		hotDownloadUpdateChunk(chunkId);
	}
}

function hotUpdateDownloaded() {
	hotSetStatus("ready");
	var deferred = hotDeferred;
	hotDeferred = null;

	if(!deferred) return;

	if(hotApplyOnUpdate)
		hotApply(hotApplyOnUpdate).then(deferred.resolve, deferred.reject);
	else {
		var outdatedModules = [];
		for(var id in hotUpdate) {
			if(Object.prototype.hasOwnProperty.call(hotUpdate, id))
				outdatedModules.push(toModuleId(id));
		}
		deferred.resolve(outdatedModules);
	}
}

function getAffectedStuff(updateModuleId) {
	var outdatedModules = [updateModuleId];
	var outdatedDependencies = {};

	var queue = outdatedModules.slice().map(function(id) {
		return { chain: [id], id: id };
	});

	while(queue.length > 0) {
		var queueItem = queue.pop();
		var moduleId = queueItem.id;
		var chain = queueItem.chain;
		var module = installedModules[moduleId];

		if(!module || module.hot.selfAccepted)
			continue;

		if(module.hot.selfDeclined)
			return { type: "self-declined", chain: chain, moduleId: moduleId };

		if(module.hot.main)
			return { type: "unaccepted", chain: chain, moduleId: moduleId };

		for(var i = 0; i < module.parents.length; i++) {
			var parentId = module.parents[i];
			var parent = installedModules[parentId];

			if(!parent) continue;

			if(parent.hot.declinedDependencies[moduleId])
				return {
					type: "declined",
					chain: chain.concat([parentId]),
					moduleId: moduleId,
					parentId: parentId
				};

			if(outdatedModules.indexOf(parentId) >= 0) continue;

			if(parent.hot.acceptedDependencies[moduleId]) {
				if(!outdatedDependencies[parentId])
					outdatedDependencies[parentId] = [];
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
		outdatedModules: outdatedModules,
		outdatedDependencies: outdatedDependencies
	};
}

function addAllToSet(a, b) {
	for(var i = 0; i < b.length; i++) {
		var item = b[i];
		if(a.indexOf(item) < 0)
			a.push(item);
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

	var warnUnexpectedRequire = function warnUnexpectedRequire() {
		console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
	};

	function handleResult(result, id) {
		var abortError = false;
		var doApply = false;
		var doDispose = false;
		var chainInfo = result.chain ? "\nUpdate propagation: " + result.chain.join(" -> ") : "";

		switch(result.type) {
			case "self-declined":
				if(options.onDeclined) options.onDeclined(result);
				if(!options.ignoreDeclined) abortError = new Error("Aborted because of self decline: " + result.moduleId + chainInfo);
				break;
			case "declined":
				if(options.onDeclined) options.onDeclined(result);
				if(!options.ignoreDeclined) abortError = new Error("Aborted because of declined dependency: " + result.moduleId + " in " + result.parentId + chainInfo);
				break;
			case "unaccepted":
				if(options.onUnaccepted) options.onUnaccepted(result);
				if(!options.ignoreUnaccepted) abortError = new Error("Aborted because " + moduleId + " is not accepted" + chainInfo);
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
			hotSetStatus("abort");
			return { abortError: abortError };
		}

		if(doApply) {
			appliedUpdate[moduleId] = hotUpdate[moduleId];
			addAllToSet(outdatedModules, result.outdatedModules);
			for(moduleId in result.outdatedDependencies) {
				if(Object.prototype.hasOwnProperty.call(result.outdatedDependencies, moduleId)) {
					if(!outdatedDependencies[moduleId]) outdatedDependencies[moduleId] = [];
					addAllToSet(outdatedDependencies[moduleId], result.outdatedDependencies[moduleId]);
				}
			}
		}

		if(doDispose) {
			addAllToSet(outdatedModules, [result.moduleId]);
			appliedUpdate[moduleId] = warnUnexpectedRequire;
		}

		return null;
	}

	for(var id in hotUpdate) {
		if(!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;

		moduleId = toModuleId(id);
		var result;

		if(hotUpdate[id])
			result = getAffectedStuff(moduleId);
		else
			result = { type: "disposed", moduleId: id };

		var abortResult = handleResult(result, id);
		if(abortResult && abortResult.abortError)
			return Promise.reject(abortResult.abortError);
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
		if(hotAvailableFilesMap[chunkId] === false)
			hotDisposeChunk(chunkId);
	});

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
			var idx = child.parents.indexOf(moduleId);
			if(idx >= 0) child.parents.splice(idx, 1);
		}
	}

	for(moduleId in outdatedDependencies) {
		if(!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;

		module = installedModules[moduleId];
		if(!module) continue;

		var moduleOutdatedDependencies = outdatedDependencies[moduleId];
		for(j = 0; j < moduleOutdatedDependencies.length; j++) {
			var dependency = moduleOutdatedDependencies[j];
			var idx = module.children.indexOf(dependency);
			if(idx >= 0) module.children.splice(idx, 1);
		}
	}

	hotSetStatus("apply");

	hotCurrentHash = hotUpdateNewHash;

	for(moduleId in appliedUpdate) {
		if(!Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) continue;
		modules[moduleId] = appliedUpdate[moduleId];
	}

	var error = null;

	for(moduleId in outdatedDependencies) {
		if(!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;

		module = installedModules[moduleId];
		var moduleOutdatedDependencies = outdatedDependencies[moduleId];
		var callbacks = [];

		for(i = 0; i < moduleOutdatedDependencies.length; i++) {
			var dependency = moduleOutdatedDependencies[i];
			cb = module.hot.acceptedDependencies[dependency];
			if(callbacks.indexOf(cb) < 0) callbacks.push(cb);
		}

		for(i = 0; i < callbacks.length; i++) {
			cb = callbacks[i];
			try { cb(moduleOutdatedDependencies); }
			catch(err) {
				handleApplyError(err, moduleId, moduleOutdatedDependencies[i], "accept-errored");
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
				try { item.errorHandler(err); }
				catch(err2) {
					handleApplyError(err2, moduleId, null, "self-accept-error-handler-errored", err);
				}
			} else {
				handleApplyError(err, moduleId, null, "self-accept-errored");
			}
		}
	}

	if(error) {
		hotSetStatus("fail");
		return Promise.reject(error);
	}

	hotSetStatus("idle");
	return new Promise(function(resolve) { resolve(outdatedModules); });
}

function handleApplyError(err, moduleId, dependencyId, type, originalError) {
	if(options.onErrored) {
		options.onErrored({
			type: type,
			moduleId: moduleId,
			dependencyId: dependencyId,
			error: err,
			orginalError: originalError
		});
	}
	if(!options.ignoreErrored) {
		if(!error) error = err;
	}
}