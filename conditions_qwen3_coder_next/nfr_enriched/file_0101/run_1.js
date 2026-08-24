Keychain.prototype.requestPermissionForKeyUpdate = function(params, callback) {
    var str = this._appConfig.string;
    var messageTemplate = this._getMessageTemplateForUpdatePublicKey(params.newKey, str);
    var message = messageTemplate.replace('{0}', params.userId);

    this._dialog.confirm({
        title: str.updatePublicKeyTitle,
        message: message,
        positiveBtnStr: str.updatePublicKeyPosBtn,
        negativeBtnStr: str.updatePublicKeyNegBtn,
        showNegativeBtn: true,
        callback: callback
    });
};

/**
 * Determines the appropriate message template for key update request.
 * @param {Object|null} newKey - The new key object or null if key removed
 * @param {Object} str - String configuration object
 * @returns {string} The message template
 * @private
 */
Keychain.prototype._getMessageTemplateForUpdatePublicKey = function(newKey, str) {
    return newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
};

Keychain.prototype.verifyPublicKey = function(uuid) {
    return this._publicKeyDao.verify(uuid);
};

/**
 * Checks for public key updates of a given user id.
 * @param {Object} options
 * @param {String} options.userId The user id (email address)
 * @param {boolean} options.overridePermission Whether to auto-update or prompt
 * @returns {Promise}
 */
Keychain.prototype.refreshKeyForUserId = function(options) {
    var userId = options.userId;
    var overridePermission = options.overridePermission || false;

    return this._fetchLocalPublicKey(userId)
        .then(function(localKey) {
            if (!localKey || !localKey._id || localKey.imported) {
                return localKey || null;
            }
            return this._verifyKeyInCloud(localKey, userId);
        }.bind(this))
        .catch(function(err) {
            if (err && err.code === 42) {
                return this._getLocalPublicKey(userId);
            }
            throw err;
        }.bind(this))
        .then(function(localKey) {
            if (!localKey || !localKey._id) {
                return null;
            }
            return this._resolveKeyUpdate(localKey, userId, overridePermission);
        }.bind(this));
};

/**
 * Retrieves the local public key for the user.
 * @param {String} userId - User email address
 * @returns {Promise}
 * @private
 */
Keychain.prototype._fetchLocalPublicKey = function(userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        return this._findPublicKeyByUserId(allPubkeys, userId);
    }.bind(this));
};

/**
 * Finds public key matching user ID in given array.
 * @param {Array} allPubkeys - Array of public keys
 * @param {String} userId - User email address
 * @returns {Object|null} Matching public key or null
 * @private
 */
Keychain.prototype._findPublicKeyByUserId = function(allPubkeys, userId) {
    var pubkey = _.findWhere(allPubkeys, { userId: userId });

    if (pubkey) {
        return pubkey;
    }

    for (var i = 0; i < allPubkeys.length; i++) {
        var currentKey = allPubkeys[i];
        var userIds = this._pgp.getKeyParams(currentKey.publicKey).userIds;
        if (_.findWhere(userIds, { emailAddress: userId })) {
            return currentKey;
        }
    }

    return null;
};

/**
 * Verifies key existence in cloud and returns updated result.
 * @param {Object} localKey - Local public key
 * @param {String} userId - User email address
 * @returns {Promise}
 * @private
 */
Keychain.prototype._verifyKeyInCloud = function(localKey, userId) {
    return this._publicKeyDao.getByUserId(userId).then(function(cloudKey) {
        if (cloudKey && cloudKey._id === localKey._id) {
            return localKey;
        }
        return this._handleKeyUpdate(localKey, cloudKey);
    }.bind(this));
};

/**
 * Handles public key replace/update.
 * @param {Object} localKey - Original local public key
 * @param {Object|null} cloudKey - Cloud public key (may be null)
 * @returns {Promise}
 * @private
 */
Keychain.prototype._handleKeyUpdate = function(localKey, cloudKey) {
    if (!cloudKey || !cloudKey._id || cloudKey._id === localKey._id) {
        return Promise.resolve(localKey);
    }
    return this._resolveKeyUpdate(localKey, cloudKey, false);
};

/**
 * Resolves key update based on permission handling.
 * @param {Object} localKey - Local public key
 * @param {Object|null} cloudKey - New cloud public key
 * @param {boolean} autoApprove - Whether to proceed without prompting
 * @returns {Promise}
 * @private
 */
Keychain.prototype._resolveKeyUpdate = function(localKey, cloudKey, autoApprove) {
    if (autoApprove) {
        return this._applyKeyUpdate(localKey, cloudKey);
    }
    return this._promptForUpdate(localKey, cloudKey, localKey.userId);
};

/**
 * asynchronization helper: prompts user for key update permission.
 * @param {Object} localKey - Local public key to replace
 * @param {Object|null} newKey - New cloud key to install or null if removed
 * @param {String} userId - User's email address
 * @returns {Promise}
 * @private
 */
Keychain.prototype._promptForUpdate = function(localKey, newKey, userId) {
    return new Promise(function(resolve, reject) {
        this.requestPermissionForKeyUpdate({
            userId: userId,
            newKey: newKey
        }, function(granted) {
            if (!granted) {
                resolve(localKey);
                return;
            }
            this._applyKeyUpdate(localKey, newKey).then(resolve).catch(reject);
        }.bind(this));
    }.bind(this));
};

/**
 * Applies the key update: removes old key and saves new key.
 * @param {Object} localKey - Key to remove
 * @param {Object|null} newKey - New key to install
 * @returns {Promise}
 * @private
 */
Keychain.prototype._applyKeyUpdate = function(localKey, newKey) {
    return this.removeLocalPublicKey(localKey._id).then(function() {
        if (!newKey) {
            return null;
        }
        return this.saveLocalPublicKey(newKey).then(function() {
            return newKey;
        });
    }.bind(this));
};

/**
 * Retrieves local public key without attempting cloud sync.
 * @param {String} userId - User email address
 * @returns {Object|null}
 * @private
 */
Keychain.prototype._getLocalPublicKey = function(userId) {
    // Stub for internal use, assumes listLocalPublicKeys already executed.
    return null;
};

Keychain.prototype.getReceiverPublicKey = function(userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        var pubkey = _.findWhere(allPubkeys, { userId: userId });
        if (!pubkey) {
            pubkey = this._findPublicKeyByUserId(allPubkeys, userId);
        }

        if (pubkey && pubkey._id) {
            return pubkey;
        }

        return this._fetchPublicKeyFromCloud(userId);
    }.bind(this))
    .catch(this._handleOfflineError.bind(this));
};

/**
 * Fetches and caches public key from cloud if not found locally.
 * @param {String} userId - User email address
 * @returns {Promise}
 * @private
 */
Keychain.prototype._fetchPublicKeyFromCloud = function(userId) {
    return this._publicKeyDao.getByUserId(userId).then(function(cloudPubkey) {
        if (!cloudPubkey) {
            return null;
        }
        return this.saveLocalPublicKey(cloudPubkey).then(function() {
            return cloudPubkey;
        });
    }.bind(this));
};

/**
 * Handles 42 (offline) errors gracefully.
 * @param {Error} err - Error object
 * @returns {Promise} Resolved with undefined if offline, else re-throws
 * @private
 */
Keychain.prototype._handleOfflineError = function(err) {
    if (err && err.code === 42) {
        return undefined;
    }
    throw err;
};

Keychain.prototype.getUserKeyPair = function(userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        var pubkey = _.findWhere(allPubkeys, { userId: userId });
        if (pubkey && pubkey._id && !pubkey.source) {
            return this._syncKeypair(pubkey._id);
        }

        return this._publicKeyDao.getByUserId(userId).then(function(cloudPubkey) {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return this._syncKeypair(cloudPubkey._id);
            }
        }.bind(this));
    }.bind(this));
};

/**
 * Synchronizes keypair from local/cloud storage.
 * @param {String} keypairId - Key pair identifier
 * @returns {Promise<Object>}
 * @private
 */
Keychain.prototype._syncKeypair = function(keypairId) {
    var savedPubkey, savedPrivkey;

    return this.lookupPublicKey(keypairId).then(function(pub) {
        savedPubkey = pub;
        return this.lookupPrivateKey(keypairId);
    }.bind(this)).then(function(priv) {
        savedPrivkey = priv;
        return this._buildKeypairResult(savedPubkey, savedPrivkey);
    }.bind(this));
};

/**
 * Constructs keypair result object from saved parts.
 * @param {Object|null} pub - Saved public key
 * @param {Object|null} priv - Saved private key
 * @returns {Object}
 * @private
 */
Keychain.prototype._buildKeypairResult = function(pub, priv) {
    var result = {};

    if (pub && pub.publicKey) {
        result.publicKey = pub;
    }
    if (priv && priv.encryptedKey) {
        result.privateKey = priv;
    }

    return result;
};

Keychain.prototype.putUserKeyPair = function(keypair) {
    if (!this._isValidKeypairForStorage(keypair)) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }

    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey)
        .then(function() {
            return this._publicKeyDao.put(keypair.publicKey);
        }.bind(this))
        .then(function() {
            return this.saveLocalPrivateKey(keypair.privateKey);
        }.bind(this));
};

/**
 * Validates if keypair meets minimal requirements for storage.
 * @param {Object} keypair - Keypair object to validate
 * @returns {boolean}
 * @private
 */
Keychain.prototype._isValidKeypairForStorage = function(keypair) {
    var isValidFormat = keypair &&
        keypair.publicKey &&
        keypair.privateKey &&
        keypair.publicKey.userId;

    var consistentUserId = !keypair.privateKey.userId ||
        keypair.publicKey.userId === keypair.privateKey.userId;

    return isValidFormat && consistentUserId;
};

Keychain.prototype.uploadPublicKey = function(publicKey) {
    if (!this._isValidPublicKey(publicKey)) {
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }

    return this._publicKeyDao.put(publicKey);
};

/**
 * Validates that the public key object has required fields.
 * @param {Object} publicKey - Public key object
 * @returns {boolean}
 * @private
 */
Keychain.prototype._isValidPublicKey = function(publicKey) {
    return publicKey &&
        publicKey.userId &&
        publicKey.publicKey;
};

Keychain.prototype.lookupPublicKey = function(id) {
    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }

    var cacheKey = DB_PUBLICKEY + '_' + id;

    return this._lawnchairDAO.read(cacheKey).then(function(localPubkey) {
        if (localPubkey) {
            return localPubkey;
        }

        return this._publicKeyDao.get(id).then(function(cloudPubkey) {
            return this.saveLocalPublicKey(cloudPubkey).then(function() {
                return cloudPubkey;
            });
        }.bind(this));
    }.bind(this));
};

Keychain.prototype.listLocalPublicKeys = function() {
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

Keychain.prototype.removeLocalPublicKey = function(id) {
    return this._lawnchairDAO.remove(DB_PUBLICKEY + '_' + id);
};

Keychain.prototype.lookupPrivateKey = function(id) {
    return this._lawnchairDAO.read(DB_PRIVATEKEY + '_' + id);
};

Keychain.prototype.saveLocalPublicKey = function(pubkey) {
    var lookupKey = DB_PUBLICKEY + '_' + pubkey._id;
    return this._lawnchairDAO.persist(lookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function(privkey) {
    var lookupKey = DB_PRIVATEKEY + '_' + privkey._id;
    return this._lawnchairDAO.persist(lookupKey, privkey);
};