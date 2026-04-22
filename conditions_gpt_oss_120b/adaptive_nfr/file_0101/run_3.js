'use strict';

const ngModule = angular.module('woServices');
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
        message,
        positiveBtnStr: str.updatePublicKeyPosBtn,
        negativeBtnStr: str.updatePublicKeyNegBtn,
        showNegativeBtn: true,
        callback
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
 * @param {Boolean} [options.overridePermission] If true, update occurs without prompting the user
 */
Keychain.prototype.refreshKeyForUserId = function (options) {
    const self = this;
    const { userId, overridePermission = false } = options;

    return self.getReceiverPublicKey(userId).then(localKey => {
        if (!localKey || !localKey._id) {
            return;
        }
        if (localKey.imported) {
            return localKey;
        }
        return self._checkKeyExists(userId, localKey, overridePermission);
    });
};

/**
 * Internal helper to verify if a key exists on the server and handle updates
 * @private
 */
Keychain.prototype._checkKeyExists = function (userId, localKey, overridePermission) {
    const self = this;
    return self._publicKeyDao.getByUserId(userId).then(cloudKey => {
        if (cloudKey && cloudKey._id === localKey._id) {
            return localKey;
        }
        return self._updateKey(localKey, cloudKey, userId, overridePermission);
    }).catch(err => {
        if (err && err.code === 42) {
            return localKey;
        }
        throw err;
    });
};

/**
 * Internal helper to decide update strategy based on permission flag
 * @private
 */
Keychain.prototype._updateKey = function (localKey, newKey, userId, overridePermission) {
    if (overridePermission) {
        return this._permissionGranted(localKey, newKey);
    }
    return this._requestPermission(localKey, newKey, userId);
};

/**
 * Internal helper to request user permission before updating a key
 * @private
 */
Keychain.prototype._requestPermission = function (localKey, newKey, userId) {
    const self = this;
    return new Promise((resolve, reject) => {
        self.requestPermissionForKeyUpdate({ userId, newKey }, granted => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            self._permissionGranted(localKey, newKey).then(resolve).catch(reject);
        });
    });
};

/**
 * Internal helper to replace a local key with a new one after permission is granted
 * @private
 */
Keychain.prototype._permissionGranted = function (localKey, newKey) {
    const self = this;
    return self.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) {
            return;
        }
        return self.saveLocalPublicKey(newKey).then(() => newKey);
    });
};

/**
 * Look up a receiver's public key by user id
 * @param {String} userId the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function (userId) {
    const self = this;
    return self._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = self._findLocalPublicKey(allPubkeys, userId);
        if (pubkey && pubkey._id) {
            return pubkey;
        }
        return self._publicKeyDao.getByUserId(userId).then(cloudPubkey => {
            if (!cloudPubkey) {
                return;
            }
            return self.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
        }).catch(err => {
            if (err && err.code === 42) {
                return;
            }
            throw err;
        });
    });
};

/**
 * Search local storage for a public key matching the given userId or its email aliases
 * @private
 */
Keychain.prototype._findLocalPublicKey = function (allPubkeys, userId) {
    // direct match
    let pubkey = _.findWhere(allPubkeys, { userId });
    if (pubkey) {
        return pubkey;
    }
    // alias match
    for (let i = 0; i < allPubkeys.length; i++) {
        const userIds = this._pgp.getKeyParams(allPubkeys[i].publicKey).userIds;
        const match = _.findWhere(userIds, { emailAddress: userId });
        if (match) {
            return allPubkeys[i];
        }
    }
    return null;
};

/**
 * Gets the local user's key either from local storage
 * or fetches it from the cloud. The private key is encrypted.
 * If no key pair exists, null is returned.
 * @param {String} userId The user's identifier
 * @returns {Promise<Object>} The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function (userId) {
    const self = this;
    return self._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = _.findWhere(allPubkeys, { userId });
        if (pubkey && pubkey._id && !pubkey.source) {
            return self._syncKeypair(pubkey._id);
        }
        return self._publicKeyDao.getByUserId(userId).then(cloudPubkey => {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return self._syncKeypair(cloudPubkey._id);
            }
        });
    });
};

/**
 * Internal helper to synchronize a keypair from cloud to local storage
 * @private
 */
Keychain.prototype._syncKeypair = function (keypairId) {
    const self = this;
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
};

/**
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist accordingly
 * @param {Object} keypair The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function (keypair) {
    const self = this;
    if (!this._isValidKeypair(keypair)) {
        return new Promise(() => {
            throw new Error('Cannot put user key pair: Incorrect input!');
        });
    }
    keypair.publicKey.imported = true;
    return self.saveLocalPublicKey(keypair.publicKey)
        .then(() => self._publicKeyDao.put(keypair.publicKey))
        .then(() => self.saveLocalPrivateKey(keypair.privateKey));
};

/**
 * Validates the structure of a keypair object
 * @private
 */
Keychain.prototype._isValidKeypair = function (keypair) {
    return keypair &&
        keypair.publicKey &&
        keypair.privateKey &&
        keypair.publicKey.userId &&
        keypair.publicKey.userId === keypair.privateKey.userId;
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @returns {Promise}
 */
Keychain.prototype.uploadPublicKey = function (publicKey) {
    const self = this;
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return new Promise(() => {
            throw new Error('Cannot upload user key pair: Incorrect input!');
        });
    }
    return self._publicKeyDao.put(publicKey);
};

/**
 * Lookup a public key by id, checking local storage first then cloud
 * @param {String} id Identifier of the key
 * @returns {Promise<Object>}
 */
Keychain.prototype.lookupPublicKey = function (id) {
    const self = this;
    if (!id) {
        return new Promise(() => {
            throw new Error('ID must be set for public key query!');
        });
    }
    let cloudPubkey;
    return self._lawnchairDAO.read(`${DB_PUBLICKEY}_${id}`).then(pubkey => {
        if (pubkey) {
            return pubkey;
        }
        return self._publicKeyDao.get(id).then(pub => {
            cloudPubkey = pub;
            return self.saveLocalPublicKey(cloudPubkey);
        }).then(() => cloudPubkey);
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