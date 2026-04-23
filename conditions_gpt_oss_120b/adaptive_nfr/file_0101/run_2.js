'use strict';

var ngModule = angular.module('woServices');
ngModule.service('keychain', Keychain);
module.exports = Keychain;

const DB_PUBLICKEY = 'publickey';
const DB_PRIVATEKEY = 'privatekey';

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
 * Display confirmation dialog to request a public key update
 * @param {Object} params.newKey   The user's updated public key object
 * @param {String} params.userId   The user's email address
 */
Keychain.prototype.requestPermissionForKeyUpdate = function (params, callback) {
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
Keychain.prototype.verifyPublicKey = function (uuid) {
    return this._publicKeyDao.verify(uuid);
};

/**
 * Checks for public key updates of a given user id
 * @param {Object} options.userId The user id (email address) for which to check the key
 * @param {String} [options.overridePermission] (optional) Indicates if the update should happen automatically (true) or with the user being queried (false). Defaults to false
 */
Keychain.prototype.refreshKeyForUserId = function (options) {
    const { userId, overridePermission = false } = options;
    const self = this;

    return self.getReceiverPublicKey(userId).then(localKey => {
        if (!hasValidLocalKey(localKey)) {
            return;
        }
        if (localKey.imported) {
            return localKey;
        }
        return self._checkKeyExists(userId, localKey, overridePermission);
    });
};

/**
 * Look up a receiver's public key by user id
 * @param {String} userId the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function (userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const primaryMatch = _.findWhere(allPubkeys, { userId: userId });
        if (primaryMatch) {
            return primaryMatch;
        }

        const secondaryMatch = allPubkeys.find(pub => {
            const userIds = self._pgp.getKeyParams(pub.publicKey).userIds;
            return userIds.some(uid => uid.emailAddress === userId);
        });

        if (secondaryMatch && secondaryMatch._id) {
            return secondaryMatch;
        }

        return self._publicKeyDao.getByUserId(userId).then(onKeyReceived).catch(onError);
    });

    function onKeyReceived(cloudPubkey) {
        if (!cloudPubkey) {
            return;
        }
        return self.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
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
 * @param {String} userId The user's id (email address)
 * @returns {Promise<Object>} The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function (userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = _.findWhere(allPubkeys, { userId: userId });

        if (isSyncablePubkey(pubkey)) {
            return syncKeypair(pubkey._id);
        }

        return self._publicKeyDao.getByUserId(userId).then(cloudPubkey => {
            if (isSyncablePubkey(cloudPubkey)) {
                return syncKeypair(cloudPubkey._id);
            }
        });
    });

    function syncKeypair(keypairId) {
        let savedPubkey, savedPrivkey;
        return self.lookupPublicKey(keypairId).then(pub => {
            savedPubkey = pub;
            return self.lookupPrivateKey(keypairId);
        }).then(priv => {
            savedPrivkey = priv;
        }).then(() => {
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
Keychain.prototype.putUserKeyPair = function (keypair) {
    const self = this;

    if (!isValidKeypair(keypair)) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }

    keypair.publicKey.imported = true;

    return self.saveLocalPublicKey(keypair.publicKey)
        .then(() => self._publicKeyDao.put(keypair.publicKey))
        .then(() => self.saveLocalPrivateKey(keypair.privateKey));
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @returns {Promise}
 */
Keychain.prototype.uploadPublicKey = function (publicKey) {
    const self = this;

    if (!isValidPublicKey(publicKey)) {
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }

    return self._publicKeyDao.put(publicKey);
};

/**
 * Lookup a public key by id, caching it locally if needed
 * @param {String} id The key identifier
 * @returns {Promise<Object>}
 */
Keychain.prototype.lookupPublicKey = function (id) {
    const self = this;

    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }

    return self._lawnchairDAO.read(`${DB_PUBLICKEY}_${id}`).then(pubkey => {
        if (pubkey) {
            return pubkey;
        }
        return self._publicKeyDao.get(id).then(cloudPubkey => {
            return self.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
        });
    });
};

/**
 * List all the locally stored public keys
 * @returns {Promise<Array>}
 */
Keychain.prototype.listLocalPublicKeys = function () {
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

Keychain.prototype.removeLocalPublicKey = function (id) {
    return this._lawnchairDAO.remove(`${DB_PUBLICKEY}_${id}`);
};

Keychain.prototype.lookupPrivateKey = function (id) {
    return this._lawnchairDAO.read(`${DB_PRIVATEKEY}_${id}`);
};

Keychain.prototype.saveLocalPublicKey = function (pubkey) {
    const pkLookupKey = `${DB_PUBLICKEY}_${pubkey._id}`;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function (privkey) {
    const prkLookupKey = `${DB_PRIVATEKEY}_${privkey._id}`;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};

/**
 * Internal: Checks if a local key is valid for refresh
 * @param {Object} key
 * @returns {boolean}
 */
function hasValidLocalKey(key) {
    return key && key._id;
}

/**
 * Internal: Determines if a key should be synced
 * @param {Object} key
 * @returns {boolean}
 */
function isSyncablePubkey(key) {
    return key && key._id && !key.source;
}

/**
 * Internal: Determines if an error indicates offline status
 * @param {Object} err
 * @returns {boolean}
 */
function isOfflineError(err) {
    return err && err.code === 42;
}

/**
 * Internal: Validates a keypair object
 * @param {Object} kp
 * @returns {boolean}
 */
function isValidKeypair(kp) {
    return kp &&
        kp.publicKey &&
        kp.privateKey &&
        kp.publicKey.userId &&
        kp.publicKey.userId === kp.privateKey.userId;
}

/**
 * Internal: Validates a public key object
 * @param {Object} pk
 * @returns {boolean}
 */
function isValidPublicKey(pk) {
    return pk && pk.userId && pk.publicKey;
}

/**
 * Internal: Handles key existence verification and update flow
 * @param {String} userId
 * @param {Object} localKey
 * @param {boolean} overridePermission
 * @returns {Promise<Object>}
 */
Keychain.prototype._checkKeyExists = function (userId, localKey, overridePermission) {
    const self = this;

    return self._publicKeyDao.getByUserId(userId).then(cloudKey => {
        if (cloudKey && cloudKey._id === localKey._id) {
            return localKey;
        }
        return self._updateKey(localKey, cloudKey, userId, overridePermission);
    }).catch(err => {
        if (isOfflineError(err)) {
            return localKey;
        }
        throw err;
    });
};

/**
 * Internal: Updates the key based on permission strategy
 * @param {Object} localKey
 * @param {Object} newKey
 * @param {String} userId
 * @param {boolean} overridePermission
 * @returns {Promise<Object>}
 */
Keychain.prototype._updateKey = function (localKey, newKey, userId, overridePermission) {
    const self = this;
    const strategy = overridePermission ? self._permissionGranted.bind(self) : self._requestPermission.bind(self);
    return strategy(localKey, newKey, userId);
};

/**
 * Internal: Requests user permission before updating the key
 * @param {Object} localKey
 * @param {Object} newKey
 * @param {String} userId
 * @returns {Promise<Object>}
 */
Keychain.prototype._requestPermission = function (localKey, newKey, userId) {
    const self = this;
    return new Promise((resolve, reject) => {
        self.requestPermissionForKeyUpdate({ userId, newKey }, granted => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            self._permissionGranted(localKey, newKey, userId).then(resolve).catch(reject);
        });
    });
};

/**
 * Internal: Performs the key update after permission is granted
 * @param {Object} localKey
 * @param {Object} newKey
 * @param {String} userId
 * @returns {Promise<Object>}
 */
Keychain.prototype._permissionGranted = function (localKey, newKey, userId) {
    const self = this;
    return self.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) {
            return;
        }
        return self.saveLocalPublicKey(newKey).then(() => newKey);
    });
};