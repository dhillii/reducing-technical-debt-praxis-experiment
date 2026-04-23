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
    const message = params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
    const formattedMessage = message.replace('{0}', params.userId);

    this._dialog.confirm({
        title: str.updatePublicKeyTitle,
        message: formattedMessage,
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
 * @param {Object} options
 * @param {String} options.userId The user id (email address) for which to check the key
 * @param {Boolean} [options.overridePermission=false] Indicates if the update should happen automatically (true) or with the user being queried (false)
 */
Keychain.prototype.refreshKeyForUserId = function (options) {
    const userId = options.userId;
    const overridePermission = options.overridePermission;
    const self = this;

    return self.getReceiverPublicKey(userId).then(localKey => {
        if (!localKey || !localKey._id) {
            return;
        }
        if (localKey.imported) {
            return localKey;
        }
        return self._publicKeyDao.getByUserId(userId).then(cloudKey => {
            if (cloudKey && cloudKey._id === localKey._id) {
                return localKey;
            }
            return self._handleKeyUpdate(localKey, cloudKey, overridePermission, userId);
        }).catch(err => {
            if (err && err.code === 42) {
                return localKey;
            }
            throw err;
        });
    });
};

/**
 * Handles key update logic based on permission and override flag
 * @private
 */
Keychain.prototype._handleKeyUpdate = function (localKey, cloudKey, overridePermission, userId) {
    const self = this;
    if (overridePermission) {
        return self._permissionGranted(localKey, cloudKey);
    }
    return self._requestPermission(localKey, cloudKey, userId);
};

/**
 * Requests user permission to update the key
 * @private
 */
Keychain.prototype._requestPermission = function (localKey, newKey, userId) {
    const self = this;
    return new Promise((resolve, reject) => {
        self.requestPermissionForKeyUpdate({
            userId: userId,
            newKey: newKey
        }, granted => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            self._permissionGranted(localKey, newKey).then(resolve).catch(reject);
        });
    });
};

/**
 * Performs the key update after permission is granted
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
        const localKey = self._findLocalKey(allPubkeys, userId);
        if (localKey && localKey._id) {
            return localKey;
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
 * Finds a public key in the local list that matches the given userId
 * @private
 */
Keychain.prototype._findLocalKey = function (allPubkeys, userId) {
    const self = this;
    let pubkey = _.findWhere(allPubkeys, { userId: userId });
    if (!pubkey) {
        for (let i = 0; i < allPubkeys.length; i++) {
            const userIds = self._pgp.getKeyParams(allPubkeys[i].publicKey).userIds;
            const match = _.findWhere(userIds, { emailAddress: userId });
            if (match) {
                pubkey = allPubkeys[i];
                break;
            }
        }
    }
    return pubkey;
};

//
// Keypair functions
//

/**
 * Gets the local user's key either from local storage
 * or fetches it from the cloud. The private key is encrypted.
 * If no key pair exists, null is returned.
 * @return {Object} The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function (userId) {
    const self = this;
    return self._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const localPubkey = _.findWhere(allPubkeys, { userId: userId });
        if (localPubkey && localPubkey._id && !localPubkey.source) {
            return self._syncKeypair(localPubkey._id);
        }
        return self._publicKeyDao.getByUserId(userId).then(cloudPubkey => {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return self._syncKeypair(cloudPubkey._id);
            }
            // continue without keypair
        });
    });
};

/**
 * Synchronizes a keypair from the cloud to local storage
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
    if (!keypair || !keypair.publicKey || !keypair.privateKey || !keypair.publicKey.userId || keypair.publicKey.userId !== keypair.privateKey.userId) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }
    keypair.publicKey.imported = true;
    return self.saveLocalPublicKey(keypair.publicKey).then(() => {
        return self._publicKeyDao.put(keypair.publicKey);
    }).then(() => {
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
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }
    return self._publicKeyDao.put(publicKey);
};

//
// Helper functions
//

Keychain.prototype.lookupPublicKey = function (id) {
    const self = this;
    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }
    return self._lawnchairDAO.read(DB_PUBLICKEY + '_' + id).then(pubkey => {
        if (pubkey) {
            return pubkey;
        }
        return self._publicKeyDao.get(id).then(pub => {
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