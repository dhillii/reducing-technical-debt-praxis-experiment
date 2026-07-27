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
	let hotCurrentParents = []; // eslint-disable-line no-unused-vars
	let hotCurrentParentsTemp = []; // eslint-disable-line no-unused-vars

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
					hotCurrentParents = [moduleId];
					hotCurrentChildModule = request;
				}
				if (me.children.indexOf(request) < 0) {
					me.children.push(request);
				}
			} else {
				console.warn("[HMR] unexpected require(" + request + ") from disposed module " + moduleId);
				hotCurrentParents = [];
			}
			return $require$(request);
		};
		const ObjectFactory = function(name) {
			return {
				configurable: true,
				enumerable: true,
				get() {
					return $require$[name];
				},
				set(value) {
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
			return $require$.e(chunkId).then(finishChunkLoading, err => {
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
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_disposeHandlers: [],
			_main: hotCurrentChildModule !== moduleId,
			active: true,
			accept(dep, callback) {
				if (typeof dep === "undefined") {
					hot._selfAccepted = true;
				} else if (typeof dep === "function") {
					hot._selfAccepted = dep;
				} else if (Array.isArray(dep)) {
					for (let i = 0; i < dep.length; i++) {
						hot._acceptedDependencies[dep[i]] = callback || (() => {});
					}
				} else {
					hot._acceptedDependencies[dep] = callback || (() => {});
				}
			},
			decline(dep) {
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
			dispose(callback) {
				hot._disposeHandlers.push(callback);
			},
			addDisposeHandler(callback) {
				hot._disposeHandlers.push(callback);
			},
			removeDisposeHandler(callback) {
				const idx = hot._disposeHandlers.indexOf(callback);
				if (idx >= 0) hot._disposeHandlers.splice(idx, 1);
			},
			check: hotCheck,
			apply: hotApply,
			status(l) {
				if (!l) return hotStatus;
				hotStatusHandlers.push(l);
			},
			addStatusHandler(l) {
				hotStatusHandlers.push(l);
			},
			removeStatusHandler(l) {
				const idx = hotStatusHandlers.indexOf(l);
				if (idx >= 0) hotStatusHandlers.splice(idx, 1);
			},
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

	let hotWaitingFiles = 0;
	let hotChunksLoading = 0;
	const hotWaitingFilesMap = {};
	const hotRequestedFilesMap = {};
	const hotAvailableFilesMap = {};
	let hotDeferred;

	let hotUpdate, hotUpdateNewHash;

	function toModuleId(id) {
		const isNumber = (+id) + "" === id;
		return isNumber ? +id : id;
	}

	function hotCheck(apply) {
		if (hotStatus !== "idle") throw new Error("check() is only allowed in idle status");
		hotApplyOnUpdate = apply;
		hotSetStatus("check");
		return hotDownloadManifest().then(update => {
			if (!update) {
				hotSetStatus("idle");
				return null;
			}
			hotRequestedFilesMap = {};
			hotWaitingFilesMap = {};
			hotAvailableFilesMap = update.c;
			hotUpdateNewHash = update.h;

			hotSetStatus("prepare");
			const promise = new Promise((resolve, reject) => {
				hotDeferred = { resolve, reject };
			});
			hotUpdate = {};
			/*foreachInstalledChunks*/
			{
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
			hotApply(hotApplyOnUpdate).then(
				result => deferred.resolve(result),
				err => deferred.reject(err)
			);
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

	// ---------- Helper Functions for hotApply ----------
	const getAffectedStuff = updateModuleId => {
		const outdatedModules = [updateModuleId];
		const outdatedDependencies = {};

		const queue = outdatedModules.slice().map(id => ({
			chain: [id],
			id
		}));

		while (queue.length > 0) {
			const { id: moduleId, chain } = queue.pop();
			const module = installedModules[moduleId];
			if (!module || module.hot._selfAccepted) continue;
			if (module.hot._selfDeclined) {
				return { type: "self-declined", chain, moduleId };
			}
			if (module.hot._main) {
				return { type: "unaccepted", chain, moduleId };
			}
			for (let i = 0; i < module.parents.length; i++) {
				const parentId = module.parents[i];
				const parent = installedModules[parentId];
				if (!parent) continue;
				if (parent.hot._declinedDependencies[moduleId]) {
					return {
						type: "declined",
						chain: chain.concat([parentId]),
						moduleId,
						parentId
					};
				}
				if (outdatedModules.includes(parentId)) continue;
				if (parent.hot._acceptedDependencies[moduleId]) {
					if (!outdatedDependencies[parentId]) outdatedDependencies[parentId] = [];
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
	};

	const addAllToSet = (a, b) => {
		for (let i = 0; i < b.length; i++) {
			const item = b[i];
			if (!a.includes(item)) a.push(item);
		}
	};

	const handleResult = (result, moduleId, options) => {
		let abortError = null;
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
				throw new Error("Unexpected type " + result.type);
		}
		return { abortError, doApply, doDispose, chainInfo };
	};

	const disposeModules = (outdatedModules, outdatedDependencies) => {
		hotSetStatus("dispose");
		Object.keys(hotAvailableFilesMap).forEach(chunkId => {
			if (hotAvailableFilesMap[chunkId] === false) hotDisposeChunk(chunkId);
		});

		const queue = outdatedModules.slice();
		while (queue.length > 0) {
			const moduleId = queue.pop();
			const module = installedModules[moduleId];
			if (!module) continue;

			const data = {};

			module.hot._disposeHandlers.forEach(cb => cb(data));
			hotCurrentModuleData[moduleId] = data;

			module.hot.active = false;
			delete installedModules[moduleId];

			module.children.forEach(childId => {
				const child = installedModules[childId];
				if (!child) return;
				const idx = child.parents.indexOf(moduleId);
				if (idx >= 0) child.parents.splice(idx, 1);
			});
		}

		// Remove outdated dependencies from children lists
		for (const moduleId in outdatedDependencies) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;
			const module = installedModules[moduleId];
			if (!module) continue;
			const deps = outdatedDependencies[moduleId];
			deps.forEach(dep => {
				const idx = module.children.indexOf(dep);
				if (idx >= 0) module.children.splice(idx, 1);
			});
		}
	};

	const applyUpdates = (appliedUpdate, outdatedModules, outdatedDependencies) => {
		hotSetStatus("apply");
		hotCurrentHash = hotUpdateNewHash;

		for (const moduleId in appliedUpdate) {
			if (Object.prototype.hasOwnProperty.call(appliedUpdate, moduleId)) {
				modules[moduleId] = appliedUpdate[moduleId];
			}
		}
	};

	const callAcceptHandlers = (outdatedDependencies, options) => {
		let error = null;
		for (const moduleId in outdatedDependencies) {
			if (!Object.prototype.hasOwnProperty.call(outdatedDependencies, moduleId)) continue;
			const module = installedModules[moduleId];
			const deps = outdatedDependencies[moduleId];
			const callbacks = [];
			deps.forEach(dep => {
				const cb = module.hot._acceptedDependencies[dep];
				if (!callbacks.includes(cb)) callbacks.push(cb);
			});
			callbacks.forEach(cb => {
				try {
					cb(deps);
				} catch (err) {
					if (options.onErrored) {
						options.onErrored({
							type: "accept-errored",
							moduleId,
							dependencyId: deps[callbacks.indexOf(cb)],
							error: err
						});
					}
					if (!options.ignoreErrored && !error) error = err;
				}
			});
		}
		return error;
	};

	const loadSelfAcceptedModules = (outdatedSelfAcceptedModules, options) => {
		let error = null;
		outdatedSelfAcceptedModules.forEach(item => {
			const { module: moduleId, errorHandler } = item;
			hotCurrentParents = [moduleId];
			try {
				$require$(moduleId);
			} catch (err) {
				if (typeof errorHandler === "function") {
					try {
						errorHandler(err);
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
		});
		return error;
	};

	function hotApply(options) {
		if (hotStatus !== "ready") throw new Error("apply() is only allowed in ready status");
		options = options || {};

		const appliedUpdate = {};
		const outdatedModules = [];
		const outdatedDependencies = {};
		const outdatedSelfAcceptedModules = [];

		const warnUnexpectedRequire = () => {
			console.warn("[HMR] unexpected require(" + result.moduleId + ") to disposed module");
		};

		for (const id in hotUpdate) {
			if (!Object.prototype.hasOwnProperty.call(hotUpdate, id)) continue;
			const moduleId = toModuleId(id);
			const result = hotUpdate[id] ? getAffectedStuff(moduleId) : { type: "disposed", moduleId: id };
			const { abortError, doApply, doDispose } = handleResult(result, moduleId, options);
			if (abortError) {
				hotSetStatus("abort");
				return Promise.reject(abortError);
			}
			if (doApply) {
				appliedUpdate[moduleId] = hotUpdate[moduleId];
				addAllToSet(outdatedModules, result.outdatedModules);
				for (const depModuleId in result.outdatedDependencies) {
					if (!Object.prototype.hasOwnProperty.call(result.outdatedDependencies, depModuleId)) continue;
					if (!outdatedDependencies[depModuleId]) outdatedDependencies[depModuleId] = [];
					addAllToSet(outdatedDependencies[depModuleId], result.outdatedDependencies[depModuleId]);
				}
			}
			if (doDispose) {
				addAllToSet(outdatedModules, [result.moduleId]);
				appliedUpdate[moduleId] = warnUnexpectedRequire;
			}
		}

		// Collect self‑accepted modules for later re‑execution
		outdatedModules.forEach(mId => {
			const mod = installedModules[mId];
			if (mod && mod.hot._selfAccepted) {
				outdatedSelfAcceptedModules.push({
					module: mId,
					errorHandler: mod.hot._selfAccepted
				});
			}
		});

		disposeModules(outdatedModules, outdatedDependencies);
		applyUpdates(appliedUpdate, outdatedModules, outdatedDependencies);

		const acceptError = callAcceptHandlers(outdatedDependencies, options);
		const selfAcceptError = loadSelfAcceptedModules(outdatedSelfAcceptedModules, options);
		const finalError = acceptError || selfAcceptError;

		if (finalError) {
			hotSetStatus("fail");
			return Promise.reject(finalError);
		}
		hotSetStatus("idle");
		return Promise.resolve(outdatedModules);
	}
};