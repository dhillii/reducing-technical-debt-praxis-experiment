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

// Public key functions

/**
 * Display confirmation dialog to request a public key update
 * @param  {Object}   params.newKey   The user's updated public key object
 * @param  {String}   params.userId   The user's email address
 */
Keychain.prototype.requestPermissionForKeyUpdate = function(params, callback) {
    const str = this._appConfig.string;
    const message = params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
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

    return self.getReceiverPublicKey(userId)
        .then(localKey => self.checkKeyExists(localKey, overridePermission));
};

Keychain.prototype.checkKeyExists = function(localKey, overridePermission) {
    if (!localKey || !localKey._id) {
        return;
    }
    if (localKey.imported) {
        return localKey;
    }
    return this._publicKeyDao.getByUserId(localKey.userId)
        .then(cloudKey => self.updateKey(localKey, cloudKey, overridePermission));
};

Keychain.prototype.updateKey = function(localKey, cloudKey, overridePermission) {
    if (cloudKey && cloudKey._id === localKey._id) {
        return localKey;
    }
    return overridePermission ? this.permissionGranted(localKey, cloudKey) : this.requestPermission(localKey, cloudKey);
};

Keychain.prototype.requestPermission = function(localKey, newKey) {
    return new Promise((resolve, reject) => {
        this.requestPermissionForKeyUpdate({
            userId: localKey.userId,
            newKey: newKey
        }, granted => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            this.permissionGranted(localKey, newKey).then(resolve).catch(reject);
        });
    });
};

Keychain.prototype.permissionGranted = function(localKey, newKey) {
    return this.removeLocalPublicKey(localKey._id)
        .then(() => {
            if (!newKey) {
                return;
            }
            return this.saveLocalPublicKey(newKey).then(() => newKey);
        });
};

/**
 * Look up a receiver's public key by user id
 * @param userId [String] the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function(userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => self.findLocalPublicKey(allPubkeys, userId))
        .then(pubkey => pubkey ? pubkey : self.getCloudPublicKey(userId));
};

Keychain.prototype.findLocalPublicKey = function(allPubkeys, userId) {
    const pubkey = _.findWhere(allPubkeys, { userId: userId });
    if (pubkey) {
        return pubkey;
    }
    for (const key of allPubkeys) {
        const userIds = this._pgp.getKeyParams(key.publicKey).userIds;
        const match = _.findWhere(userIds, { emailAddress: userId });
        if (match) {
            return key;
        }
    }
    return null;
};

Keychain.prototype.getCloudPublicKey = function(userId) {
    return this._publicKeyDao.getByUserId(userId)
        .then(cloudPubkey => cloudPubkey ? this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey) : null)
        .catch(err => {
            if (err && err.code === 42) {
                return null;
            }
            throw err;
        });
};

// Keypair functions

/**
 * Gets the local user's key either from local storage
 * or fetches it from the cloud. The private key is encrypted.
 * If no key pair exists, null is returned.
 * return [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function(userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => self.findLocalPublicKey(allPubkeys, userId))
        .then(pubkey => pubkey ? self.syncKeypair(pubkey._id) : self.getCloudPublicKey(userId))
        .then(cloudPubkey => cloudPubkey ? self.syncKeypair(cloudPubkey._id) : null);
};

Keychain.prototype.syncKeypair = function(keypairId) {
    return this.lookupPublicKey(keypairId)
        .then(pub => this.lookupPrivateKey(keypairId).then(priv => ({ publicKey: pub, privateKey: priv })));
};

// Helper functions

Keychain.prototype.lookupPublicKey = function(id) {
    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }

    return this._lawnchairDAO.read(DB_PUBLICKEY + '_' + id)
        .then(pubkey => pubkey ? pubkey : this._publicKeyDao.get(id).then(cloudPubkey => this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey)));
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

Keychain.prototype.putUserKeyPair = function(keypair) {
    if (!keypair || !keypair.publicKey || !keypair.privateKey || !keypair.publicKey.userId || keypair.publicKey.userId !== keypair.privateKey.userId) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }

    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey)
        .then(() => this._publicKeyDao.put(keypair.publicKey))
        .then(() => this.saveLocalPrivateKey(keypair.privateKey));
};

Keychain.prototype.uploadPublicKey = function(publicKey) {
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }

    return this._publicKeyDao.put(publicKey);
};