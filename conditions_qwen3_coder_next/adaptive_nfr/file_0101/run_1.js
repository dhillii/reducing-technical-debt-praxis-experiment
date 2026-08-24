'use strict';

var ngModule = angular.module('woServices');
ngModule.service('keychain', Keychain);
module.exports = Keychain;

var DB_PUBLICKEY = 'publickey',
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

//
// Public key functions
//

/**
 * Display confirmation dialog to request a public key update
 * @param  {Object}   params.newKey   The user's updated public key object
 * @param  {String}   params.userId   The user's email address
 */
Keychain.prototype.requestPermissionForKeyUpdate = function(params, callback) {
    var str = this._appConfig.string;
    var message = params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
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
 * Verifies the public key of a user o nthe public key store
 * @param {String} uuid The uuid to verify the key
 */
Keychain.prototype.verifyPublicKey = function(uuid) {
    return this._publicKeyDao.verify(uuid);
};

/**
 * Checks for public key updates of a given user id
 * @param {String} options.userId The user id (email address) for which to check the key
 * @param {String} options.overridePermission (optional) Indicates if the update should happen automatically (true) or with the user being queried (false). Defaults to false
 */
Keychain.prototype.refreshKeyForUserId = function(options) {
    const userId = options.userId;
    const overridePermission = options.overridePermission;

    return this.getReceiverPublicKey(userId).then((localKey) => {
        if (!localKey || !localKey._id) {
            return;
        }
        if (localKey.imported) {
            return localKey;
        }
        return this._checkKeyExists(localKey, userId);
    }).then((result) => {
        if (result && result.shouldUpdate) {
            return this._updateKey(result.localKey, result.cloudKey, overridePermission);
        }
        return result ? result.localKey : null;
    });
};

/**
 * Checks if the user's key has been revoked by looking up the key id
 * @param {Object} localKey - The local public key
 * @param {String} userId - The user's email address
 * @return {Promise<Object|null>}
 */
Keychain.prototype._checkKeyExists = function(localKey, userId) {
    return this._publicKeyDao.getByUserId(userId).then((cloudKey) => {
        if (cloudKey && cloudKey._id === localKey._id) {
            return { localKey, cloudKey, shouldUpdate: false };
        }
        return { localKey, cloudKey, shouldUpdate: true };
    }).catch((err) => {
        if (err && err.code === 42) {
            return { localKey, shouldUpdate: false };
        }
        throw err;
    });
};

/**
 * Updates the key based on overridePermission setting
 * @param {Object} localKey - The local public key
 * @param {Object|null} cloudKey - The cloud public key
 * @param {Boolean} overridePermission - Whether to skip user prompt
 * @return {Promise<Object>}
 */
Keychain.prototype._updateKey = function(localKey, cloudKey, overridePermission) {
    if (overridePermission) {
        return this._permissionGranted(localKey, cloudKey);
    }
    return this._requestPermission(localKey, cloudKey);
};

/**
 * Requests user permission to update the key
 * @param {Object} localKey - The local public key
 * @param {Object|null} cloudKey - The cloud public key
 * @return {Promise<Object>}
 */
Keychain.prototype._requestPermission = function(localKey, cloudKey) {
    return new Promise((resolve, reject) => {
        this.requestPermissionForKeyUpdate({
            userId: localKey.userId,
            newKey: cloudKey
        }, (granted) => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            this._permissionGranted(localKey, cloudKey)
                .then(resolve)
                .catch(reject);
        });
    });
};

/**
 * Persists the new key after permission is granted
 * @param {Object} localKey - The local public key to remove
 * @param {Object|null} newKey - The new public key to save
 * @return {Promise<Object|null>}
 */
Keychain.prototype._permissionGranted = function(localKey, newKey) {
    return this.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) {
            return;
        }
        return this.saveLocalPublicKey(newKey).then(() => newKey);
    });
};

/**
 * Look up a reveiver's public key by user id
 * @param userId [String] the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function(userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then((allPubkeys) => {
        const pubkey = _.findWhere(allPubkeys, { userId });
        if (pubkey && pubkey._id) {
            return pubkey;
        }

        const match = self._findPublicKeyByUserIds(allPubkeys, userId);
        if (match) {
            return match;
        }

        return self._publicKeyDao.getByUserId(userId).then(self._onKeyReceived.bind(self))
            .catch(self._onError.bind(self));
    });
};

/**
 * Searches for a public key matching the given userId among multiple user IDs
 * @param {Array} allPubkeys - Array of all local public keys
 * @param {String} userId - The email address to match
 * @return {Object|null}
 */
Keychain.prototype._findPublicKeyByUserIds = function(allPubkeys, userId) {
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
 * Handles successful retrieval of a public key from cloud storage
 * @param {Object} cloudPubkey - The retrieved cloud public key
 * @return {Promise<Object>}
 */
Keychain.prototype._onKeyReceived = function(cloudPubkey) {
    if (!cloudPubkey) {
        return;
    }
    return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
};

/**
 * Handles errors during public key retrieval
 * @param {Error} err - The error object
 * @return {Promise<void>}
 */
Keychain.prototype._onError = function(err) {
    if (err && err.code === 42) {
        return;
    }
    throw err;
};

//
// Keypair functions
//

/**
 * Gets the local user's key either from local storage
 * or fetches it from the cloud. The private key is encrypted.
 * If no key pair exists, null is returned.
 * return [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function(userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then((allPubkeys) => {
        const pubkey = _.findWhere(allPubkeys, { userId });
        if (pubkey && pubkey._id && !pubkey.source) {
            return self._syncKeypair(pubkey._id);
        }

        return self._publicKeyDao.getByUserId(userId).then((cloudPubkey) => {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return self._syncKeypair(cloudPubkey._id);
            }
        });
    });
};

/**
 * Synchronizes a keypair between local and cloud storage
 * @param {String} keypairId - The ID of the keypair
 * @return {Promise<Object>}
 */
Keychain.prototype._syncKeypair = function(keypairId) {
    let savedPubkey, savedPrivkey;

    return this.lookupPublicKey(keypairId).then((pub) => {
        savedPubkey = pub;
        return this.lookupPrivateKey(keypairId);
    }).then((priv) => {
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
 * locally and in the cloud and persist arccordingly
 * @param [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function(keypair) {
    if (!keypair || !keypair.publicKey || !keypair.privateKey ||
        !keypair.publicKey.userId || keypair.publicKey.userId !== keypair.privateKey.userId) {
        return new Promise(() => {
            throw new Error('Cannot put user key pair: Incorrect input!');
        });
    }

    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey).then(() => {
        return this._publicKeyDao.put(keypair.publicKey);
    }).then(() => {
        return this.saveLocalPrivateKey(keypair.privateKey);
    });
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function(publicKey) {
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return new Promise(() => {
            throw new Error('Cannot upload user key pair: Incorrect input!');
        });
    }

    return this._publicKeyDao.put(publicKey);
};

//
// Helper functions
//

Keychain.prototype.lookupPublicKey = function(id) {
    if (!id) {
        return new Promise(() => {
            throw new Error('ID must be set for public key query!');
        });
    }

    return this._lawnchairDAO.read(DB_PUBLICKEY + '_' + id).then((pubkey) => {
        if (pubkey) {
            return pubkey;
        }

        return this._publicKeyDao.get(id).then((pub) => {
            this.saveLocalPublicKey(pub);
            return pub;
        });
    });
};

/**
 * List all the locally stored public keys
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