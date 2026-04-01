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
    const message = params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
    const finalMessage = message.replace('{0}', params.userId);

    this._dialog.confirm({
        title: str.updatePublicKeyTitle,
        message: finalMessage,
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

    // get the public key corresponding to the userId
    return self.getReceiverPublicKey(userId).then(function(localKey) {
        if (!isValidLocalKey(localKey)) {
            return;
        }
        if (isImportedKey(localKey)) {
            return localKey;
        }
        return checkKeyExists(localKey);
    });

    /**
     * Checks if local key is valid for refresh
     * @param {Object} localKey The local key to validate
     * @returns {boolean}
     */
    function isValidLocalKey(localKey) {
        return localKey && localKey._id;
    }

    /**
     * Checks if key was manually imported
     * @param {Object} localKey The local key to check
     * @returns {boolean}
     */
    function isImportedKey(localKey) {
        return localKey.imported;
    }

    /**
     * Checks if the user's key has been revoked by looking up the key id
     * @param {Object} localKey The local key to check
     * @returns {Promise}
     */
    function checkKeyExists(localKey) {
        return self._publicKeyDao.getByUserId(userId).then(function(cloudKey) {
            if (isKeyUnchanged(cloudKey, localKey)) {
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

    /**
     * Checks if cloud key matches local key
     * @param {Object} cloudKey The cloud key
     * @param {Object} localKey The local key
     * @returns {boolean}
     */
    function isKeyUnchanged(cloudKey, localKey) {
        return cloudKey && cloudKey._id === localKey._id;
    }

    /**
     * Checks if error is offline error
     * @param {Object} err The error object
     * @returns {boolean}
     */
    function isOfflineError(err) {
        return err && err.code === 42;
    }

    /**
     * Updates key based on permission override setting
     * @param {Object} localKey The local key
     * @param {Object} newKey The new key from cloud
     * @returns {Promise}
     */
    function updateKey(localKey, newKey) {
        if (overridePermission) {
            return permissionGranted(localKey, newKey);
        }
        return requestPermission(localKey, newKey);
    }

    /**
     * Requests user permission to update key
     * @param {Object} localKey The local key
     * @param {Object} newKey The new key from cloud
     * @returns {Promise}
     */
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

    /**
     * Persists new key after permission granted
     * @param {Object} localKey The local key
     * @param {Object} newKey The new key from cloud
     * @returns {Promise}
     */
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
 * @param userId [String] the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function(userId) {
    const self = this;

    // search local keyring for public key
    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        const pubkey = findPublicKeyByUserId(allPubkeys, userId);
        
        if (pubkey && pubkey._id) {
            return pubkey;
        }
        
        // no public key by that user id in storage
        // find from cloud by email address
        return self._publicKeyDao.getByUserId(userId).then(onKeyReceived).catch(onError);
    });

    /**
     * Finds public key by user id in local keys
     * @param {Array} allPubkeys All public keys
     * @param {String} userId The user id to search for
     * @returns {Object|undefined}
     */
    function findPublicKeyByUserId(allPubkeys, userId) {
        // query primary email address
        let pubkey = _.findWhere(allPubkeys, {
            userId: userId
        });
        
        // query multiple userIds
        if (!pubkey) {
            for (let i = 0; i < allPubkeys.length; i++) {
                const userIds = self._pgp.getKeyParams(allPubkeys[i].publicKey).userIds;
                const match = _.findWhere(userIds, {
                    emailAddress: userId
                });
                if (match) {
                    pubkey = allPubkeys[i];
                    break;
                }
            }
        }
        
        return pubkey;
    }

    /**
     * Handles successful key retrieval from cloud
     * @param {Object} cloudPubkey The public key from cloud
     * @returns {Promise}
     */
    function onKeyReceived(cloudPubkey) {
        if (!cloudPubkey) {
            return;
        }
        // persist and return cloud key
        return self.saveLocalPublicKey(cloudPubkey).then(function() {
            return cloudPubkey;
        });
    }

    /**
     * Handles error during key retrieval
     * @param {Object} err The error object
     * @returns {Promise}
     */
    function onError(err) {
        if (err && err.code === 42) {
            // offline
            return;
        }
        throw err;
    }
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

    // search for user's public key locally
    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        const pubkey = _.findWhere(allPubkeys, {
            userId: userId
        });

        if (isLocalKeypairAvailable(pubkey)) {
            // that user's public key is already in local storage...
            // sync keypair to the cloud
            return syncKeypair(pubkey._id);
        }

        // no public key by that user id in storage
        // find from cloud by email address
        return self._publicKeyDao.getByUserId(userId).then(function(cloudPubkey) {
            if (isCloudKeypairAvailable(cloudPubkey)) {
                // there is a public key for that user already in the cloud...
                // sync keypair to local storage
                return syncKeypair(cloudPubkey._id);
            }

            // continue without keypair... generate or import new keypair
        });
    });

    /**
     * Checks if local keypair is available
     * @param {Object} pubkey The public key
     * @returns {boolean}
     */
    function isLocalKeypairAvailable(pubkey) {
        return pubkey && pubkey._id && !pubkey.source;
    }

    /**
     * Checks if cloud keypair is available
     * @param {Object} cloudPubkey The cloud public key
     * @returns {boolean}
     */
    function isCloudKeypairAvailable(cloudPubkey) {
        return cloudPubkey && cloudPubkey._id && !cloudPubkey.source;
    }

    /**
     * Synchronizes keypair between local and cloud storage
     * @param {String} keypairId The keypair id
     * @returns {Promise}
     */
    function syncKeypair(keypairId) {
        let savedPubkey;
        let savedPrivkey;
        
        // persist key pair in local storage
        return self.lookupPublicKey(keypairId).then(function(pub) {
            savedPubkey = pub;

            // persist private key in local storage
            return self.lookupPrivateKey(keypairId);

        }).then(function(priv) {
            savedPrivkey = priv;

        }).then(function() {
            return buildKeypairObject(savedPubkey, savedPrivkey);
        });
    }

    /**
     * Builds keypair object from public and private keys
     * @param {Object} savedPubkey The saved public key
     * @param {Object} savedPrivkey The saved private key
     * @returns {Object}
     */
    function buildKeypairObject(savedPubkey, savedPrivkey) {
        const keys = {};

        if (savedPubkey && savedPubkey.publicKey) {
            keys.publicKey = savedPubkey;
        }
        if (savedPrivkey && savedPrivkey.encryptedKey) {
            keys.privateKey = savedPrivkey;
        }

        return keys;
    }
};

/**
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist accordingly
 * @param [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function(keypair) {
    const self = this;

    // validate input
    if (!isValidKeypair(keypair)) {
        return new Promise(function() {
            throw new Error('Cannot put user key pair: Incorrect input!');
        });
    }

    // don't check the user's own public key for deletion in refreshKeyForUserId
    keypair.publicKey.imported = true;

    // store public key locally
    return self.saveLocalPublicKey(keypair.publicKey).then(function() {
        // persist public key in cloud storage
        return self._publicKeyDao.put(keypair.publicKey);
    }).then(function() {
        // store private key locally
        return self.saveLocalPrivateKey(keypair.privateKey);
    });

    /**
     * Validates keypair structure
     * @param {Object} keypair The keypair to validate
     * @returns {boolean}
     */
    function isValidKeypair(keypair) {
        return keypair && 
               keypair.publicKey && 
               keypair.privateKey && 
               keypair.publicKey.userId && 
               keypair.publicKey.userId === keypair.privateKey.userId;
    }
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function(publicKey) {
    const self = this;

    // validate input
    if (!isValidPublicKey(publicKey)) {
        return new Promise(function() {
            throw new Error('Cannot upload user key pair: Incorrect input!');
        });
    }

    return self._publicKeyDao.put(publicKey);

    /**
     * Validates public key structure
     * @param {Object} publicKey The public key to validate
     * @returns {boolean}
     */
    function isValidPublicKey(publicKey) {
        return publicKey && publicKey.userId && publicKey.publicKey;
    }
};

//
// Helper functions
//

Keychain.prototype.lookupPublicKey = function(id) {
    const self = this;
    let cloudPubkey;

    if (!id) {
        return new Promise(function() {
            throw new Error('ID must be set for public key query!');
        });
    }

    // lookup in local storage
    return self._lawnchairDAO.read(DB_PUBLICKEY + '_' + id).then(function(pubkey) {
        if (pubkey) {
            return pubkey;
        }

        // fetch from cloud storage
        return self._publicKeyDao.get(id).then(function(pub) {
            cloudPubkey = pub;
            // cache public key in cache
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
    // search local keyring for public key
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

Keychain.prototype.removeLocalPublicKey = function(id) {
    return this._lawnchairDAO.remove(DB_PUBLICKEY + '_' + id);
};

Keychain.prototype.lookupPrivateKey = function(id) {
    // lookup in local storage
    return this._lawnchairDAO.read(DB_PRIVATEKEY + '_' + id);
};

Keychain.prototype.saveLocalPublicKey = function(pubkey) {
    // persist public key (email, _id)
    const pkLookupKey = DB_PUBLICKEY + '_' + pubkey._id;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function(privkey) {
    // persist private key (email, _id)
    const prkLookupKey = DB_PRIVATEKEY + '_' + privkey._id;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};
```