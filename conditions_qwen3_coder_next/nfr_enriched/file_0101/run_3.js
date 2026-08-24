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
    const userId = options.userId;
    const overridePermission = options.overridePermission;

    return this.getReceiverPublicKey(userId).then(localKey => {
        if (!localKey || !localKey._id) {
            return;
        }
        if (localKey.imported) {
            return localKey;
        }
        return this._checkKeyExists(localKey, userId);
    }).then(result => {
        if (result && result.shouldUpdate) {
            return this._updateKey(result.localKey, result.cloudKey, overridePermission);
        }
        return result ? result.localKey : null;
    });
};

Keychain.prototype._checkKeyExists = function(localKey, userId) {
    return this._publicKeyDao.getByUserId(userId).then(cloudKey => {
        if (cloudKey && cloudKey._id === localKey._id) {
            return { localKey };
        }
        return { localKey, cloudKey, shouldUpdate: true };
    }).catch(err => {
        if (err && err.code === 42) {
            return { localKey };
        }
        throw err;
    });
};

Keychain.prototype._updateKey = function(localKey, cloudKey, overridePermission) {
    if (overridePermission) {
        return this._permissionGranted(localKey, cloudKey);
    }
    return this._requestPermission(localKey, cloudKey);
};

Keychain.prototype._requestPermission = function(localKey, cloudKey) {
    return new Promise((resolve, reject) => {
        this.requestPermissionForKeyUpdate({
            userId: cloudKey.userId,
            newKey: cloudKey
        }, granted => {
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

Keychain.prototype._permissionGranted = function(localKey, newKey) {
    return this.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) {
            return;
        }
        return this.saveLocalPublicKey(newKey).then(() => newKey);
    });
};

Keychain.prototype.getReceiverPublicKey = function(userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = this._findPublicKeyByUserId(allPubkeys, userId);
        if (pubkey && pubkey._id) {
            return pubkey;
        }
        return this._publicKeyDao.getByUserId(userId)
            .then(cloudPubkey => this._onKeyReceived(cloudPubkey))
            .catch(err => this._onError(err));
    });
};

Keychain.prototype._findPublicKeyByUserId = function(allPubkeys, userId) {
    let pubkey = _.findWhere(allPubkeys, { userId });
    if (pubkey) {
        return pubkey;
    }
    for (let i = 0; i < allPubkeys.length; i++) {
        const keyParams = this._pgp.getKeyParams(allPubkeys[i].publicKey);
        const userIds = keyParams.userIds;
        const match = _.findWhere(userIds, { emailAddress: userId });
        if (match) {
            return allPubkeys[i];
        }
    }
    return null;
};

Keychain.prototype._onKeyReceived = function(cloudPubkey) {
    if (!cloudPubkey) {
        return;
    }
    return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
};

Keychain.prototype._onError = function(err) {
    if (err && err.code === 42) {
        return;
    }
    throw err;
};

Keychain.prototype.getUserKeyPair = function(userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = _.findWhere(allPubkeys, { userId });
        if (pubkey && pubkey._id && !pubkey.source) {
            return this._syncKeypair(pubkey._id);
        }
        return this._publicKeyDao.getByUserId(userId).then(cloudPubkey => {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return this._syncKeypair(cloudPubkey._id);
            }
        });
    });
};

Keychain.prototype._syncKeypair = function(keypairId) {
    let savedPubkey, savedPrivkey;
    return this.lookupPublicKey(keypairId).then(pub => {
        savedPubkey = pub;
        return this.lookupPrivateKey(keypairId);
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

Keychain.prototype.putUserKeyPair = function(keypair) {
    if (!this._isValidKeyPair(keypair)) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }

    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey)
        .then(() => this._publicKeyDao.put(keypair.publicKey))
        .then(() => this.saveLocalPrivateKey(keypair.privateKey));
};

Keychain.prototype._isValidKeyPair = function(keypair) {
    return keypair &&
        keypair.publicKey &&
        keypair.privateKey &&
        keypair.publicKey.userId &&
        keypair.publicKey.userId === keypair.privateKey.userId;
};

Keychain.prototype.uploadPublicKey = function(publicKey) {
    if (!this._isValidPublicKey(publicKey)) {
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }

    return this._publicKeyDao.put(publicKey);
};

Keychain.prototype._isValidPublicKey = function(publicKey) {
    return publicKey &&
        publicKey.userId &&
        publicKey.publicKey;
};

Keychain.prototype.lookupPublicKey = function(id) {
    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }

    return this._lawnchairDAO.read(DB_PUBLICKEY + '_' + id).then(localPubkey => {
        if (localPubkey) {
            return localPubkey;
        }
        return this._publicKeyDao.get(id).then(cloudPubkey => {
            return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
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
    const pkLookupKey = DB_PUBLICKEY + '_' + pubkey._id;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function(privkey) {
    const prkLookupKey = DB_PRIVATEKEY + '_' + privkey._id;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};