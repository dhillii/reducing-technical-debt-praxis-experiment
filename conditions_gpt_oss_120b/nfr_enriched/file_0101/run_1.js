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

//
// Public key functions
//

/**
 * Display confirmation dialog to request a public key update
 * @param  {Object}   params.newKey   The user's updated public key object
 * @param  {String}   params.userId   The user's email address
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
 * @param {Boolean} [options.overridePermission] If true, update without prompting the user
 */
Keychain.prototype.refreshKeyForUserId = function (options) {
    const self = this;
    const userId = options.userId;
    const overridePermission = options.overridePermission;

    return self.getReceiverPublicKey(userId).then(function (localKey) {
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
 * Checks if the user's key exists on the server and updates if necessary.
 * @private
 */
Keychain.prototype._checkKeyExists = function (userId, localKey, overridePermission) {
    const self = this;
    return self._publicKeyDao.getByUserId(userId).then(function (cloudKey) {
        if (cloudKey && cloudKey._id === localKey._id) {
            return localKey;
        }
        return self._updateKey(localKey, cloudKey, overridePermission);
    }).catch(function (err) {
        if (err && err.code === 42) {
            return localKey;
        }
        throw err;
    });
};

/**
 * Determines whether to update the key directly or request user permission.
 * @private
 */
Keychain.prototype._updateKey = function (localKey, newKey, overridePermission) {
    if (overridePermission) {
        return this._permissionGranted(localKey, newKey);
    }
    return this._requestPermission(localKey, newKey);
};

/**
 * Prompts the user for permission to update the public key.
 * @private
 */
Keychain.prototype._requestPermission = function (localKey, newKey) {
    const self = this;
    return new Promise(function (resolve, reject) {
        self.requestPermissionForKeyUpdate({
            userId: newKey ? newKey.userId : '',
            newKey: newKey
        }, function (granted) {
            if (!granted) {
                resolve(localKey);
                return;
            }
            self._permissionGranted(localKey, newKey).then(resolve).catch(reject);
        });
    });
};

/**
 * Performs the actual key replacement after permission is granted.
 * @private
 */
Keychain.prototype._permissionGranted = function (localKey, newKey) {
    const self = this;
    return self.removeLocalPublicKey(localKey._id).then(function () {
        if (!newKey) {
            return;
        }
        return self.saveLocalPublicKey(newKey).then(function () {
            return newKey;
        });
    });
};

/**
 * Look up a receiver's public key by user id
 * @param {String} userId the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function (userId) {
    const self = this;
    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function (allPubkeys) {
        const pubkey = self._findLocalPublicKey(allPubkeys, userId);
        if (pubkey && pubkey._id) {
            return pubkey;
        }
        return self._publicKeyDao.getByUserId(userId).then(self._onKeyReceived.bind(self)).catch(self._onKeyError.bind(self));
    });
};

/**
 * Finds a public key in local storage matching the userId or its associated email addresses.
 * @private
 */
Keychain.prototype._findLocalPublicKey = function (allPubkeys, userId) {
    const directMatch = _.findWhere(allPubkeys, { userId: userId });
    if (directMatch) {
        return directMatch;
    }
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
 * Handles a cloud public key response.
 * @private
 */
Keychain.prototype._onKeyReceived = function (cloudPubkey) {
    if (!cloudPubkey) {
        return;
    }
    return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
};

/**
 * Handles errors when fetching a cloud public key.
 * @private
 */
Keychain.prototype._onKeyError = function (err) {
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
 * @param {String} userId The user's email address
 * @return {Promise<Object>} The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function (userId) {
    const self = this;
    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function (allPubkeys) {
        const pubkey = _.findWhere(allPubkeys, { userId: userId });
        if (pubkey && pubkey._id && !pubkey.source) {
            return self._syncKeypair(pubkey._id);
        }
        return self._publicKeyDao.getByUserId(userId).then(function (cloudPubkey) {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return self._syncKeypair(cloudPubkey._id);
            }
        });
    });
};

/**
 * Synchronizes a keypair by loading both public and private components.
 * @private
 */
Keychain.prototype._syncKeypair = function (keypairId) {
    const self = this;
    let savedPubkey, savedPrivkey;
    return self.lookupPublicKey(keypairId).then(function (pub) {
        savedPubkey = pub;
        return self.lookupPrivateKey(keypairId);
    }).then(function (priv) {
        savedPrivkey = priv;
    }).then(function () {
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
 * @return {Promise}
 */
Keychain.prototype.putUserKeyPair = function (keypair) {
    const self = this;
    if (!keypair || !keypair.publicKey || !keypair.privateKey || !keypair.publicKey.userId || keypair.publicKey.userId !== keypair.privateKey.userId) {
        return new Promise(function () {
            throw new Error('Cannot put user key pair: Incorrect input!');
        });
    }
    keypair.publicKey.imported = true;
    return self.saveLocalPublicKey(keypair.publicKey).then(function () {
        return self._publicKeyDao.put(keypair.publicKey);
    }).then(function () {
        return self.saveLocalPrivateKey(keypair.privateKey);
    });
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function (publicKey) {
    const self = this;
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return new Promise(function () {
            throw new Error('Cannot upload user key pair: Incorrect input!');
        });
    }
    return self._publicKeyDao.put(publicKey);
};

//
// Helper functions
//

Keychain.prototype.lookupPublicKey = function (id) {
    const self = this;
    if (!id) {
        return new Promise(function () {
            throw new Error('ID must be set for public key query!');
        });
    }
    return self._lawnchairDAO.read(DB_PUBLICKEY + '_' + id).then(function (pubkey) {
        if (pubkey) {
            return pubkey;
        }
        return self._publicKeyDao.get(id).then(function (pub) {
            return self.saveLocalPublicKey(pub).then(() => pub);
        });
    });
};

/**
 * List all the locally stored public keys
 */
Keychain.prototype.listLocalPublicKeys = function () {
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

Keychain.prototype.removeLocalPublicKey = function (id) {
    return this._lawnchairDAO.remove(DB_PUBLICKEY + '_' + id);
};

Keychain.prototype.lookupPrivateKey = function (id) {
    return this._lawnchairDAO.read(DB_PRIVATEKEY + '_' + id);
};

Keychain.prototype.saveLocalPublicKey = function (pubkey) {
    const pkLookupKey = DB_PUBLICKEY + '_' + pubkey._id;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function (privkey) {
    const prkLookupKey = DB_PRIVATEKEY + '_' + privkey._id;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};