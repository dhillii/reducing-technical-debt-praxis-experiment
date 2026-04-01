```javascript
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
Keychain.prototype.requestPermissionForKeyUpdate = function(params, callback) {
    const str = this._appConfig.string;
    const message = (params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey)
        .replace('{0}', params.userId);

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
 * @param {String} options.userId The user id (email address) for which to check the key
 * @param {String} options.overridePermission (optional) Indicates if the update should happen automatically (true) or with the user being queried (false). Defaults to false
 */
Keychain.prototype.refreshKeyForUserId = function(options) {
    const self = this;
    const userId = options.userId;
    const overridePermission = options.overridePermission;

    return self.getReceiverPublicKey(userId).then(function(localKey) {
        if (!localKey || !localKey._id) {
            return;
        }
        if (localKey.imported) {
            return localKey;
        }
        return self._checkKeyExists(localKey, userId, overridePermission);
    });
};

/**
 * Checks if the user's key exists on the key server
 * @private
 */
Keychain.prototype._checkKeyExists = function(localKey, userId, overridePermission) {
    const self = this;
    return self._publicKeyDao.getByUserId(userId).then(function(cloudKey) {
        if (cloudKey && cloudKey._id === localKey._id) {
            return localKey;
        }
        return self._updateKey(localKey, cloudKey, userId, overridePermission);
    }).catch(function(err) {
        if (err && err.code === 42) {
            return localKey;
        }
        throw err;
    });
};

/**
 * Updates the key based on permission settings
 * @private
 */
Keychain.prototype._updateKey = function(localKey, newKey, userId, overridePermission) {
    const self = this;
    if (overridePermission) {
        return self._permissionGranted(localKey, newKey);
    }
    return self._requestPermission(localKey, newKey, userId);
};

/**
 * Requests user permission to update the key
 * @private
 */
Keychain.prototype._requestPermission = function(localKey, newKey, userId) {
    const self = this;
    return new Promise(function(resolve, reject) {
        self.requestPermissionForKeyUpdate({
            userId: userId,
            newKey: newKey
        }, function(granted) {
            if (!granted) {
                resolve(localKey);
                return;
            }
            self._permissionGranted(localKey, newKey).then(resolve).catch(reject);
        });
    });
};

/**
 * Persists the new key after permission is granted
 * @private
 */
Keychain.prototype._permissionGranted = function(localKey, newKey) {
    const self = this;
    return self.removeLocalPublicKey(localKey._id).then(function() {
        if (!newKey) {
            return;
        }
        return self.saveLocalPublicKey(newKey).then(function() {
            return newKey;
        });
    });
};

/**
 * Look up a receiver's public key by user id
 * @param userId [String] the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function(userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        const pubkey = self._findPublicKeyByUserId(allPubkeys, userId);
        if (pubkey && pubkey._id) {
            return pubkey;
        }
        return self._publicKeyDao.getByUserId(userId).then(function(cloudPubkey) {
            if (!cloudPubkey) {
                return;
            }
            return self.saveLocalPublicKey(cloudPubkey).then(function() {
                return cloudPubkey;
            });
        }).catch(function(err) {
            if (err && err.code === 42) {
                return;
            }
            throw err;
        });
    });
};

/**
 * Finds a public key by user id in the local keyring
 * @private
 */
Keychain.prototype._findPublicKeyByUserId = function(allPubkeys, userId) {
    let pubkey = _.findWhere(allPubkeys, { userId: userId });
    
    if (!pubkey) {
        for (let i = 0; i < allPubkeys.length; i++) {
            const userIds = this._pgp.getKeyParams(allPubkeys[i].publicKey).userIds;
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
 * return [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function(userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        const pubkey = _.findWhere(allPubkeys, { userId: userId });

        if (pubkey && pubkey._id && !pubkey.source) {
            return self._syncKeypair(pubkey._id);
        }

        return self._publicKeyDao.getByUserId(userId).then(function(cloudPubkey) {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return self._syncKeypair(cloudPubkey._id);
            }
        });
    });
};

/**
 * Synchronizes keypair between local and cloud storage
 * @private
 */
Keychain.prototype._syncKeypair = function(keypairId) {
    const self = this;
    let savedPubkey;
    let savedPrivkey;

    return self.lookupPublicKey(keypairId).then(function(pub) {
        savedPubkey = pub;
        return self.lookupPrivateKey(keypairId);
    }).then(function(priv) {
        savedPrivkey = priv;
        return self._buildKeypairObject(savedPubkey, savedPrivkey);
    });
};

/**
 * Builds a keypair object from public and private key components
 * @private
 */
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
 * locally and in the cloud and persist accordingly
 * @param [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function(keypair) {
    const self = this;

    if (!self._isValidKeypair(keypair)) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }

    keypair.publicKey.imported = true;

    return self.saveLocalPublicKey(keypair.publicKey).then(function() {
        return self._publicKeyDao.put(keypair.publicKey);
    }).then(function() {
        return self.saveLocalPrivateKey(keypair.privateKey);
    });
};

/**
 * Validates keypair structure
 * @private
 */
Keychain.prototype._isValidKeypair = function(keypair) {
    return keypair && 
           keypair.publicKey && 
           keypair.privateKey && 
           keypair.publicKey.userId && 
           keypair.publicKey.userId === keypair.privateKey.userId;
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function(publicKey) {
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }

    return this._publicKeyDao.put(publicKey);
};

//
// Helper functions
//

Keychain.prototype.lookupPublicKey = function(id) {
    const self = this;
    let cloudPubkey;

    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }

    return self._lawnchairDAO.read(DB_PUBLICKEY + '_' + id).then(function(pubkey) {
        if (pubkey) {
            return pubkey;
        }

        return self._publicKeyDao.get(id).then(function(pub) {
            cloudPubkey = pub;
            return self.saveLocalPublicKey(cloudPubkey);
        }).then(function() {
            return cloudPubkey;
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
```