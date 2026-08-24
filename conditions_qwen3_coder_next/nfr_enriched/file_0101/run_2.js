Keychain.prototype.requestPermissionForKeyUpdate = function(params, callback) {
    /**
     * Displays a confirmation dialog to request permission for public key update.
     * @param {Object} params - Contains newKey and userId
     * @param {Function} callback - Function to invoke with user's decision
     */
    var str = this._appConfig.string;
    var messageTemplate = params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
    var message = messageTemplate.replace('{0}', params.userId);

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
    /**
     * Verifies the presence and validity of a public key in the cloud by UUID.
     * @param {String} uuid - UUID of the key to verify
     * @returns {Promise} Resolves with verification result
     */
    return this._publicKeyDao.verify(uuid);
};

Keychain.prototype.refreshKeyForUserId = function(options) {
    /**
     * Checks for and updates a user's public key if necessary.
     * @param {Object} options - Contains userId and optionally overridePermission
     * @returns {Promise} Resolves with updated local public key or original key
     */
    const userId = options.userId;
    const overridePermission = options.overridePermission || false;

    return this.getReceiverPublicKey(userId).then((localKey) => {
        if (!localKey || !localKey._id || localKey.imported) {
            return localKey || null;
        }
        return this._refreshKeyWithCloudCheck(localKey, userId, overridePermission);
    });
};

Keychain.prototype._refreshKeyWithCloudCheck = function(localKey, userId, overridePermission) {
    /**
     * Internal method to fetch cloud key and decide whether to update local key.
     * @param {Object} localKey - Current local public key
     * @param {String} userId - User email address
     * @param {Boolean} overridePermission - Whether to auto-update or prompt user
     * @returns {Promise} Resolves with updated key or original key
     */
    return this._publicKeyDao.getByUserId(userId).then((cloudKey) => {
        if (!this._keyDiffers(cloudKey, localKey)) {
            return localKey;
        }
        return this._decideKeyUpdate(cloudKey, localKey, userId, overridePermission);
    }).catch((err) => {
        if (err && err.code === 42) return localKey; // offline
        throw err;
    });
};

Keychain.prototype._keyDiffers = function(cloudKey, localKey) {
    /**
     * Determines whether two public keys differ based on their IDs.
     * @param {Object|null} cloudKey - Cloud key
     * @param {Object} localKey - Local key
     * @returns {Boolean} True if keys differ or cloud key missing
     */
    return !cloudKey || cloudKey._id !== localKey._id;
};

Keychain.prototype._decideKeyUpdate = function(newKey, localKey, userId, overridePermission) {
    /**
     * Either auto-updates or prompts to update the public key.
     * @param {Object} newKey - New cloud key
     * @param {Object} localKey - Existing local key
     * @param {String} userId - User email address
     * @param {Boolean} overridePermission - Auto-update flag
     * @returns {Promise} Resolves with updated key
     */
    if (overridePermission) {
        return this._applyKeyUpdate(localKey, newKey);
    }
    return this._promptForKeyUpdate(localKey, newKey, userId);
};

Keychain.prototype._promptForKeyUpdate = function(localKey, newKey, userId) {
    /**
     * Prompts the user for permission to update the public key.
     * @param {Object} localKey - Existing local key
     * @param {Object} newKey - New cloud key
     * @param {String} userId - User email address
     * @returns {Promise} Resolves with either updated key or original key
     */
    const params = {
        userId: userId,
        newKey: newKey
    };

    return new Promise((resolve, reject) => {
        this.requestPermissionForKeyUpdate(params, (granted) => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            this._applyKeyUpdate(localKey, newKey)
                .then(resolve)
                .catch(reject);
        });
    });
};

Keychain.prototype._applyKeyUpdate = function(localKey, newKey) {
    /**
     * Replaces local public key with new key.
     * @param {Object} localKey - Key to remove
     * @param {Object|null} newKey - New key to store
     * @returns {Promise} Resolves with new key or undefined if removed
     */
    if (!newKey) {
        return Promise.resolve();
    }
    return this.removeLocalPublicKey(localKey._id)
        .then(() => this.saveLocalPublicKey(newKey))
        .then(() => newKey);
};

Keychain.prototype.getReceiverPublicKey = function(userId) {
    /**
     * Retrieves a receiver’s public key for given userId from local store or cloud.
     * @param {String} userId - Email address of the user
     * @returns {Promise} Resolves with public key object or undefined
     */
    return this._lawnchairDAO.list(DB_PUBLICKEY)
        .then((allPubkeys) => {
            const pubkey = this._findExactMatch(allPubkeys, userId);
            if (pubkey) {
                return pubkey._id ? pubkey : null;
            }

            return this._searchByParsedUserIds(allPubkeys, userId);
        })
        .catch((err) => {
            if (err && err.code === 42) {
                // offline: return early
                return null;
            }
            throw err;
        });
};

Keychain.prototype._findExactMatch = function(pubkeys, userId) {
    /**
     * Locates a public key with exact userId match.
     * @param {Array} pubkeys - Array of local public key objects
     * @param {String} userId - Email to match
     * @returns {Object|null} First matching key object
     */
    return _.findWhere(pubkeys, { userId: userId }) || null;
};

Keychain.prototype._searchByParsedUserIds = function(pubkeys, userId) {
    /**
     * Parses each key’s embedded userIds and looks up match.
     * @param {Array} pubkeys - Array of local public key objects
     * @param {String} userId - Email to match
     * @returns {Promise} Resolves with matched key or cloud fallback
     */
    for (const pubkey of pubkeys) {
        const userIds = this._pgp.getKeyParams(pubkey.publicKey).userIds;
        if (userIds && _.findWhere(userIds, { emailAddress: userId })) {
            return Promise.resolve(pubkey._id ? pubkey : null);
        }
    }

    return this._publicKeyDao.getByUserId(userId)
        .then((cloudPubkey) => cloudPubkey && this._saveAndReturnCloudPublicKey(cloudPubkey));
};

Keychain.prototype._saveAndReturnCloudPublicKey = function(cloudPubkey) {
    /**
     * Saves a received cloud public key locally and returns it.
     * @param {Object} cloudPubkey - Public key from cloud
     * @returns {Promise} Resolves with saved key
     */
    return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
};

Keychain.prototype.getUserKeyPair = function(userId) {
    /**
     * Retrieves local user's keypair, checking both local and cloud storage.
     * @param {String} userId - Email address of user
     * @returns {Promise} Resolves with keypair {publicKey, privateKey} or null
     */
    return this._lawnchairDAO.list(DB_PUBLICKEY)
        .then((allPubkeys) => {
            const pubkey = _.findWhere(allPubkeys, { userId });
            return pubkey && pubkey._id && !pubkey.source
                ? this._syncKeypair(pubkey._id)
                : this._fetchKeypairFromCloud(userId);
        });
};

Keychain.prototype._syncKeypair = function(keypairId) {
    /**
     * Syncs a keypair from local storage using ID.
     * @param {String} keypairId - Key ID
     * @returns {Promise} Resolves with {publicKey, privateKey}
     */
    let savedPubkey, savedPrivkey;

    return this.lookupPublicKey(keypairId)
        .then((pub) => {
            savedPubkey = pub;
            return this.lookupPrivateKey(keypairId);
        })
        .then((priv) => {
            savedPrivkey = priv;

            const keys = {};

            if (savedPubkey?.publicKey) keys.publicKey = savedPubkey;
            if (savedPrivkey?.encryptedKey) keys.privateKey = savedPrivkey;

            return keys;
        });
};

Keychain.prototype._fetchKeypairFromCloud = function(userId) {
    /**
     * Tries to load keypair from cloud storage by userId.
     * @param {String} userId - Email address
     * @returns {Promise|null} Resolves with keypair sync result or undefined
     */
    return this._publicKeyDao.getByUserId(userId)
        .then((cloudPubkey) => {
            if (!cloudPubkey || !cloudPubkey._id || cloudPubkey.source) return;

            return this._syncKeypair(cloudPubkey._id);
        });
};

Keychain.prototype.putUserKeyPair = function(keypair) {
    /**
     * Stores user’s keypair both locally and in cloud.
     * @param {Object} keypair - Contains publicKey and privateKey
     * @returns {Promise} Resolves after storage completes
     */
    if (!keypair?.publicKey?.userId || !keypair?.privateKey?.userId ||
        keypair.publicKey.userId !== keypair.privateKey.userId) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }

    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey)
        .then(() => this._publicKeyDao.put(keypair.publicKey))
        .then(() => this.saveLocalPrivateKey(keypair.privateKey));
};

Keychain.prototype.uploadPublicKey = function(publicKey) {
    /**
     * Uploads a validated public key to cloud storage.
     * @param {Object} publicKey - Public key object with userId and publicKey
     * @returns {Promise} Resolves after upload completes
     */
    if (!publicKey?.userId || !publicKey.publicKey) {
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }

    return this._publicKeyDao.put(publicKey);
};

Keychain.prototype.lookupPublicKey = function(id) {
    /**
     * Retrieves public key from local cache or cloud.
     * @param {String} id - Key ID
     * @returns {Promise} Resolves with public key object
     */
    if (!id) {
        return Promise.reject(new Error('ID must be set for public key query!'));
    }

    const cacheKey = DB_PUBLICKEY + '_' + id;

    return this._lawnchairDAO.read(cacheKey)
        .then((localPubkey) => localPubkey || this._fetchAndCachePublicKey(id, cacheKey));
};

Keychain.prototype._fetchAndCachePublicKey = function(id, cacheKey) {
    /**
     * Fetches public key from cloud and caches locally.
     * @param {String} id - Key ID
     * @param {String} cacheKey - Local storage key
     * @returns {Promise} Resolves with fetched key
     */
    return this._publicKeyDao.get(id)
        .then((cloudPubkey) => {
            return this.saveLocalPublicKey(cloudPubkey)
                .then(() => cloudPubkey);
        });
};

Keychain.prototype.listLocalPublicKeys = function() {
    /**
     * Returns all locally saved public keys.
     * @returns {Promise} Resolves with array of public key objects
     */
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

Keychain.prototype.removeLocalPublicKey = function(id) {
    /**
     * Removes a public key from local storage by ID.
     * @param {String} id - Key ID
     * @returns {Promise} Resolves on successful deletion
     */
    return this._lawnchairDAO.remove(DB_PUBLICKEY + '_' + id);
};

Keychain.prototype.lookupPrivateKey = function(id) {
    /**
     * Retrieves a private key from local storage.
     * @param {String} id - Key ID
     * @returns {Promise} Resolves with private key object
     */
    return this._lawnchairDAO.read(DB_PRIVATEKEY + '_' + id);
};

Keychain.prototype.saveLocalPublicKey = function(pubkey) {
    /**
     * Persists a public key to local storage.
     * @param {Object} pubkey - Public key with _id field
     * @returns {Promise} Resolves after persistence
     */
    const lookupKey = DB_PUBLICKEY + '_' + pubkey._id;
    return this._lawnchairDAO.persist(lookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function(privkey) {
    /**
     * Persists an encrypted private key to local storage.
     * @param {Object} privkey - Encrypted key with _id field
     * @returns {Promise} Resolves after persistence
     */
    const lookupKey = DB_PRIVATEKEY + '_' + privkey._id;
    return this._lawnchairDAO.persist(lookupKey, privkey);
};