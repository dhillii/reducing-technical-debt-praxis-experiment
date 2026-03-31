```javascript
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

Keychain.prototype.verifyPublicKey = function(uuid) {
    return this._publicKeyDao.verify(uuid);
};

Keychain.prototype.refreshKeyForUserId = function(options) {
    var self = this,
        userId = options.userId,
        overridePermission = options.overridePermission;

    return self.getReceiverPublicKey(userId).then(function(localKey) {
        if (!localKey || !localKey._id || localKey.imported) {
            return localKey;
        }
        return self._checkKeyExists(localKey, userId, overridePermission);
    });
};

Keychain.prototype._checkKeyExists = function(localKey, userId, overridePermission) {
    var self = this;
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

Keychain.prototype._updateKey = function(localKey, newKey, userId, overridePermission) {
    var self = this;
    if (overridePermission) {
        return self._permissionGranted(localKey, newKey);
    }
    return self._requestPermission(localKey, newKey, userId);
};

Keychain.prototype._requestPermission = function(localKey, newKey, userId) {
    var self = this;
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

Keychain.prototype._permissionGranted = function(localKey, newKey) {
    var self = this;
    return self.removeLocalPublicKey(localKey._id).then(function() {
        if (!newKey) {
            return;
        }
        return self.saveLocalPublicKey(newKey).then(function() {
            return newKey;
        });
    });
};

Keychain.prototype.getReceiverPublicKey = function(userId) {
    var self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        var pubkey = self._findPublicKeyByUserId(allPubkeys, userId);
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

Keychain.prototype._findPublicKeyByUserId = function(allPubkeys, userId) {
    var pubkey = _.findWhere(allPubkeys, { userId: userId });
    if (pubkey) {
        return pubkey;
    }

    for (var i = 0; i < allPubkeys.length; i++) {
        var userIds = this._pgp.getKeyParams(allPubkeys[i].publicKey).userIds;
        var match = _.findWhere(userIds, { emailAddress: userId });
        if (match) {
            return allPubkeys[i];
        }
    }
    return null;
};

//
// Keypair functions
//

Keychain.prototype.getUserKeyPair = function(userId) {
    var self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        var pubkey = _.findWhere(allPubkeys, { userId: userId });

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

Keychain.prototype._syncKeypair = function(keypairId) {
    var self = this;
    var savedPubkey, savedPrivkey;

    return self.lookupPublicKey(keypairId).then(function(pub) {
        savedPubkey = pub;
        return self.lookupPrivateKey(keypairId);
    }).then(function(priv) {
        savedPrivkey = priv;
        return self._buildKeypairObject(savedPubkey, savedPrivkey);
    });
};

Keychain.prototype._buildKeypairObject = function(pubkey, privkey) {
    var keys = {};
    if (pubkey && pubkey.publicKey) {
        keys.publicKey = pubkey;
    }
    if (privkey && privkey.encryptedKey) {
        keys.privateKey = privkey;
    }
    return keys;
};

Keychain.prototype.putUserKeyPair = function(keypair) {
    var self = this;

    if (!this._isValidKeypair(keypair)) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }

    keypair.publicKey.imported = true;

    return self.saveLocalPublicKey(keypair.publicKey)
        .then(function() {
            return self._publicKeyDao.put(keypair.publicKey);
        })
        .then(function() {
            return self.saveLocalPrivateKey(keypair.privateKey);
        });
};

Keychain.prototype._isValidKeypair = function(keypair) {
    return keypair && keypair.publicKey && keypair.privateKey &&
           keypair.publicKey.userId && keypair.publicKey.userId === keypair.privateKey.userId;
};

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
    var self = this;

    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }

    return self._lawnchairDAO.read(DB_PUBLICKEY + '_' + id).then(function(pubkey) {
        if (pubkey) {
            return pubkey;
        }

        return self._publicKeyDao.get(id).then(function(pub) {
            return self.saveLocalPublicKey(pub).then(function() {
                return pub;
            });
        });
    });
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
    var pkLookupKey = DB_PUBLICKEY + '_' + pubkey._id;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function(privkey) {
    var prkLookupKey = DB_PRIVATEKEY + '_' + privkey._id;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};
```