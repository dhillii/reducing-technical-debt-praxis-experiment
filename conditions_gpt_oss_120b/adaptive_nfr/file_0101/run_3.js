'use strict';

var ngModule = angular.module('woServices');
ngModule.service('keychain', Keychain);
module.exports = Keychain;

const DB_PUBLICKEY = 'publickey',
    DB_PRIVATEKEY = 'privatekey';

/**
 * A high-level Data-Access Api for handling Keypair synchronization
 * between the cloud service and the device's local storage
 */
function Keychain(accountLawnchair, publicKey, privateKey, crypto, pgp, dialog, appConfig) {
    this._lawnchairDAO = accountLawnchair;
    this._publicKeyDao = publicKey;
    this._privateKeyDao = privateKey;
    this._crypto = crypto;
    this._pgp = pgp;
    this._dialog = dialog;
    this._appConfig = appConfig;
}

/**
 * Checks if a keypair object is valid.
 * @param {Object} keypair
 * @returns {boolean}
 */
function isValidKeypair(keypair) {
    return keypair &&
        keypair.publicKey &&
        keypair.privateKey &&
        keypair.publicKey.userId &&
        keypair.publicKey.userId === keypair.privateKey.userId;
}

/**
 * Determines if an error represents an offline condition.
 * @param {Object} err
 * @returns {boolean}
 */
function isOfflineError(err) {
    return err && err.code === 42;
}

/**
 * Determines if the cloud key matches the local key.
 * @param {Object} localKey
 * @param {Object} cloudKey
 * @returns {boolean}
 */
function isKeyUnchanged(localKey, cloudKey) {
    return cloudKey && cloudKey._id === localKey._id;
}

/**
 * Determines if a key has been imported.
 * @param {Object} key
 * @returns {boolean}
 */
function isImported(key) {
    return key && key.imported;
}

/**
 * Determines if an object has a valid identifier.
 * @param {Object} obj
 * @returns {boolean}
 */
function hasId(obj) {
    return obj && obj._id;
}

/**
 * Display confirmation dialog to request a public key update
 * @param  {Object}   params.newKey   The user's updated public key object
 * @param  {String}   params.userId   The user's email address
 */
Keychain.prototype.requestPermissionForKeyUpdate = function(params, callback) {
    const str = this._appConfig.string;
    let message = params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
    message = message.replace('{0}', params.userId);

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
 * Verifies the public key of a user on the public key store
 * @param {String} uuid The uuid to verify the key
 */
Keychain.prototype.verifyPublicKey = function(uuid) {
    return this._publicKeyDao.verify(uuid);
};

/**
 * Checks for public key updates of a given user id
 * @param {Object} options
 * @param {String} options.userId The user id (email address) for which to check the key
 * @param {String} [options.overridePermission] (optional) Indicates if the update should happen automatically (true) or with the user being queried (false). Defaults to false
 */
Keychain.prototype.refreshKeyForUserId = function(options) {
    const self = this,
        userId = options.userId,
        overridePermission = options.overridePermission;

    return self.getReceiverPublicKey(userId).then(function(localKey) {
        if (!hasId(localKey)) {
            return;
        }
        if (isImported(localKey)) {
            return localKey;
        }
        return checkKeyExists(localKey);
    });

    function checkKeyExists(localKey) {
        return self._publicKeyDao.getByUserId(userId).then(function(cloudKey) {
            if (isKeyUnchanged(localKey, cloudKey)) {
                return localKey;
            }
            return updateKey(localKey, cloudKey);
        }).catch(function(err) {
            if (isOfflineError(err)) {
                return localKey;
            }
            throw err;
        });
    }

    function updateKey(localKey, newKey) {
        if (overridePermission) {
            return permissionGranted(localKey, newKey);
        }
        return requestPermission(localKey, newKey);
    }

    function requestPermission(localKey, newKey) {
        return new Promise(function(resolve, reject) {
            self.requestPermissionForKeyUpdate({
                userId: userId,
                newKey: newKey
            }, function(granted) {
                if (!granted) {
                    resolve(localKey);
                    return;
                }
                permissionGranted(localKey, newKey).then(resolve).catch(reject);
            });
        });
    }

    function permissionGranted(localKey, newKey) {
        return self.removeLocalPublicKey(localKey._id).then(function() {
            if (!newKey) {
                return;
            }
            return self.saveLocalPublicKey(newKey).then(function() {
                return newKey;
            });
        });
    }
};

/**
 * Look up a receiver's public key by user id
 * @param {String} userId the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function(userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        let pubkey = _.findWhere(allPubkeys, { userId: userId });
        if (!pubkey) {
            for (let i = 0, match; i < allPubkeys.length; i++) {
                const userIds = self._pgp.getKeyParams(allPubkeys[i].publicKey).userIds;
                match = _.findWhere(userIds, { emailAddress: userId });
                if (match) {
                    pubkey = allPubkeys[i];
                    break;
                }
            }
        }
        if (hasId(pubkey)) {
            return pubkey;
        }
        return self._publicKeyDao.getByUserId(userId).then(onKeyReceived).catch(onError);
    });

    function onKeyReceived(cloudPubkey) {
        if (!cloudPubkey) {
            return;
        }
        return self.saveLocalPublicKey(cloudPubkey).then(function() {
            return cloudPubkey;
        });
    }

    function onError(err) {
        if (isOfflineError(err)) {
            return;
        }
        throw err;
    }
};

/**
 * Gets the local user's key either from local storage
 * or fetches it from the cloud. The private key is encrypted.
 * If no key pair exists, null is returned.
 * @param {String} userId
 * @returns {Promise<Object>} The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function(userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        const pubkey = _.findWhere(allPubkeys, { userId: userId });

        if (hasId(pubkey) && !pubkey.source) {
            return syncKeypair(pubkey._id);
        }

        return self._publicKeyDao.getByUserId(userId).then(function(cloudPubkey) {
            if (hasId(cloudPubkey) && !cloudPubkey.source) {
                return syncKeypair(cloudPubkey._id);
            }
        });
    });

    function syncKeypair(keypairId) {
        let savedPubkey, savedPrivkey;
        return self.lookupPublicKey(keypairId).then(function(pub) {
            savedPubkey = pub;
            return self.lookupPrivateKey(keypairId);
        }).then(function(priv) {
            savedPrivkey = priv;
        }).then(function() {
            const keys = {};
            if (savedPubkey && savedPubkey.publicKey) {
                keys.publicKey = savedPubkey;
            }
            if (savedPrivkey && savedPrivkey.encryptedKey) {
                keys.privateKey = savedPrivkey;
            }
            return keys;
        });
    }
};

/**
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist accordingly
 * @param {Object} keypair The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function(keypair) {
    const self = this;

    if (!isValidKeypair(keypair)) {
        return new Promise(function() {
            throw new Error('Cannot put user key pair: Incorrect input!');
        });
    }

    keypair.publicKey.imported = true;

    return self.saveLocalPublicKey(keypair.publicKey).then(function() {
        return self._publicKeyDao.put(keypair.publicKey);
    }).then(function() {
        return self.saveLocalPrivateKey(keypair.privateKey);
    });
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function(publicKey) {
    const self = this;

    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return new Promise(function() {
            throw new Error('Cannot upload user key pair: Incorrect input!');
        });
    }

    return self._publicKeyDao.put(publicKey);
};

/**
 * Lookup a public key by its identifier.
 * @param {String} id
 * @returns {Promise<Object>}
 */
Keychain.prototype.lookupPublicKey = function(id) {
    const self = this,
        cloudPubkey = null;

    if (!id) {
        return new Promise(function() {
            throw new Error('ID must be set for public key query!');
        });
    }

    return self._lawnchairDAO.read(DB_PUBLICKEY + '_' + id).then(function(pubkey) {
        if (pubkey) {
            return pubkey;
        }
        return self._publicKeyDao.get(id).then(function(pub) {
            const fetched = pub;
            return self.saveLocalPublicKey(fetched).then(function() {
                return fetched;
            });
        });
    });
};

/**
 * List all the locally stored public keys
 * @returns {Promise<Array>}
 */
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
    const pkLookupKey = DB_PUBLICKEY + '_' + pubkey._id;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function(privkey) {
    const prkLookupKey = DB_PRIVATEKEY + '_' + privkey._id;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};