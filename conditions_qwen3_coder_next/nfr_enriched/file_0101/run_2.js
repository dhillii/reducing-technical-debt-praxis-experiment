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

    return this.getReceiverPublicKey(userId)
        .then(localKey => this._buildPublicKeyCheck(localKey, userId, overridePermission));
};

Keychain.prototype._buildPublicKeyCheck = function(localKey, userId, overridePermission) {
    if (!localKey || !localKey._id) {
        return;
    }
    if (localKey.imported) {
        return localKey;
    }

    return this._checkKeyExists(localKey, userId)
        .then(cloudKey => this._handleKeyUpdate(localKey, cloudKey, overridePermission));
};

Keychain.prototype._checkKeyExists = function(localKey, userId) {
    return this._publicKeyDao.getByUserId(userId)
        .then(cloudKey => this._determineKeyMatch(localKey, cloudKey))
        .catch(err => this._handleKeyCheckError(err, localKey));
};

Keychain.prototype._determineKeyMatch = function(localKey, cloudKey) {
    if (cloudKey && cloudKey._id === localKey._id) {
        return localKey;
    }
    return {
        localKey,
        cloudKey
    };
};

Keychain.prototype._handleKeyUpdate = function(localKey, result, overridePermission) {
    if (result === localKey) {
        return localKey;
    }

    const { localKey: updatedLocalKey, cloudKey } = result;
    if (overridePermission) {
        return this._processPermissionGranted(updatedLocalKey, cloudKey);
    }
    return this._requestUserPermission(updatedLocalKey, cloudKey);
};

Keychain.prototype._requestUserPermission = function(localKey, newKey) {
    return new Promise((resolve, reject) => {
        this.requestPermissionForKeyUpdate({
            userId: localKey.userId,
            newKey: newKey
        }, granted => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            this._processPermissionGranted(localKey, newKey)
                .then(resolve)
                .catch(reject);
        });
    });
};

Keychain.prototype._processPermissionGranted = function(localKey, newKey) {
    return this.removeLocalPublicKey(localKey._id)
        .then(() => {
            if (!newKey) {
                return;
            }
            return this.saveLocalPublicKey(newKey).then(() => newKey);
        });
};

Keychain.prototype._handleKeyCheckError = function(err, localKey) {
    if (err && err.code === 42) {
        return localKey;
    }
    throw err;
};

/**
 * Look up a receiver's public key by user id
 * @param userId [String] the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function(userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => this._searchLocalPubkeys(allPubkeys, userId))
        .then(localKey => localKey ? Promise.resolve(localKey) : this._fetchPublicKeyFromCloud(userId));
};

Keychain.prototype._searchLocalPubkeys = function(allPubkeys, userId) {
    const directMatch = _.findWhere(allPubkeys, { userId });
    if (directMatch) {
        return directMatch;
    }

    return this._findMatchByUserIdInKeyParams(allPubkeys, userId);
};

Keychain.prototype._findMatchByUserIdInKeyParams = function(allPubkeys, userId) {
    for (const key of allPubkeys) {
        const userIds = this._pgp.getKeyParams(key.publicKey).userIds;
        const match = _.findWhere(userIds, { emailAddress: userId });
        if (match) {
            return key;
        }
    }
    return null;
};

Keychain.prototype._fetchPublicKeyFromCloud = function(userId) {
    return this._publicKeyDao.getByUserId(userId)
        .then(cloudPubkey => this._handleCloudPublicKey(cloudPubkey))
        .catch(err => this._handlePublicKeyFetchError(err));
};

Keychain.prototype._handleCloudPublicKey = function(cloudPubkey) {
    if (!cloudPubkey) {
        return;
    }
    return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
};

Keychain.prototype._handlePublicKeyFetchError = function(err) {
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
    return this._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => this._findLocalPublicKey(allPubkeys, userId))
        .then(localPubkey => this._determineKeypairOperation(localPubkey, userId));
};

Keychain.prototype._findLocalPublicKey = function(allPubkeys, userId) {
    return _.findWhere(allPubkeys, { userId }) || null;
};

Keychain.prototype._determineKeypairOperation = function(localPubkey, userId) {
    if (localPubkey && localPubkey._id && !localPubkey.source) {
        return this._syncKeypair(localPubkey._id);
    }

    return this._publicKeyDao.getByUserId(userId)
        .then(cloudPubkey => {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return this._syncKeypair(cloudPubkey._id);
            }
        });
};

Keychain.prototype._syncKeypair = function(keypairId) {
    let savedPubkey;
    let savedPrivkey;

    return Promise.resolve()
        .then(() => this.lookupPublicKey(keypairId))
        .then(pub => {
            savedPubkey = pub;
            return this.lookupPrivateKey(keypairId);
        })
        .then(priv => {
            savedPrivkey = priv;
            return this._buildKeypairObject(savedPubkey, savedPrivkey);
        });
};

Keychain.prototype._buildKeypairObject = function(pubkey, privkey) {
    const keys = {};
    if (pubkey && pubkey.publicKey) {
        keys.publicKey = pubkey;
    }
    if (privkey && privkey.encryptedKey) {
        keys.privateKey = privkey;
    }
    return keys;
};

/**
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist arccordingly
 * @param [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function(keypair) {
    if (!this._isValidKeypair(keypair)) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }

    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey)
        .then(() => this._publicKeyDao.put(keypair.publicKey))
        .then(() => this.saveLocalPrivateKey(keypair.privateKey));
};

Keychain.prototype._isValidKeypair = function(keypair) {
    if (!keypair || !keypair.publicKey || !keypair.privateKey) {
        return false;
    }
    if (!keypair.publicKey.userId || !keypair.privateKey.userId) {
        return false;
    }
    return keypair.publicKey.userId === keypair.privateKey.userId;
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function(publicKey) {
    if (!this._isValidPublicKeyInput(publicKey)) {
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }

    return this._publicKeyDao.put(publicKey);
};

Keychain.prototype._isValidPublicKeyInput = function(publicKey) {
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return false;
    }
    return true;
};

//
// Helper functions
//

Keychain.prototype.lookupPublicKey = function(id) {
    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }

    const cacheKey = DB_PUBLICKEY + '_' + id;
    return this._lawnchairDAO.read(cacheKey)
        .then(pubkey => this._resolvePublicKey(pubkey, id));
};

Keychain.prototype._resolvePublicKey = function(pubkey, id) {
    if (pubkey) {
        return pubkey;
    }

    return this._publicKeyDao.get(id)
        .then(cloudPubkey => this._cacheAndReturnCloudPublicKey(cloudPubkey));
};

Keychain.prototype._cacheAndReturnCloudPublicKey = function(cloudPubkey) {
    return this.saveLocalPublicKey(cloudPubkey)
        .then(() => cloudPubkey);
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