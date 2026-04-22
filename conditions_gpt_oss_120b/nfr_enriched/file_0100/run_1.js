'use strict';

const ngModule = angular.module('woEmail');
ngModule.service('email', Email);
module.exports = Email;

const { config, string: str } = require('../app-config');
const axe = require('axe-logger');
const PgpMailer = require('pgpmailer');
const ImapClient = require('imap-client');

//
// Constants
//
const FOLDER_DB_TYPE = 'folders';

const SYNC_TYPE_NEW = 'new';
const SYNC_TYPE_DELETED = 'deleted';
const SYNC_TYPE_MSGS = 'messages';

// well known folders
const FOLDER_TYPE_INBOX = 'Inbox';
const FOLDER_TYPE_SENT = 'Sent';
const FOLDER_TYPE_DRAFTS = 'Drafts';
const FOLDER_TYPE_TRASH = 'Trash';
const FOLDER_TYPE_FLAGGED = 'Flagged';

const MSG_ATTR_UID = 'uid';
const MSG_ATTR_MODSEQ = 'modseq';
const MSG_PART_ATTR_CONTENT = 'content';
const MSG_PART_TYPE_ATTACHMENT = 'attachment';
const MSG_PART_TYPE_ENCRYPTED = 'encrypted';
const MSG_PART_TYPE_SIGNED = 'signed';
const MSG_PART_TYPE_TEXT = 'text';
const MSG_PART_TYPE_HTML = 'html';

//
// Email Service
//
/**
 * High-level data access object that orchestrates everything around the handling of encrypted mails:
 * PGP de-/encryption, receiving via IMAP, sending via SMTP, MIME parsing, local db persistence
 *
 * @param {Object} keychain The keychain DAO handles keys transparently
 * @param {Object} pgp Orchestrates decryption
 * @param {Object} accountStore Handles persistence to the local indexed db
 * @param {Object} pgpbuilder Generates and encrypts MIME and SMTP messages
 * @param {Object} mailreader Parses MIME messages received from IMAP
 */
function Email(keychain, pgp, accountStore, pgpbuilder, mailreader, dialog, appConfig, auth) {
    this._keychain = keychain;
    this._pgp = pgp;
    this._devicestorage = accountStore;
    this._pgpbuilder = pgpbuilder;
    this._mailreader = mailreader;
    this._dialog = dialog;
    this._appConfig = appConfig;
    this._auth = auth;
}

/**
 * Initializes the email dao:
 * - assigns _account
 * - initializes _account.folders with the content from memory
 *
 * @param {Object} options.account.emailAddress The user's id
 * @param {Object} options.account.realname The user's id
 * @return {Promise}
 * @resolve {Object} keypair
 */
Email.prototype.init = function (options) {
    const self = this;

    self._account = options.account;
    self._account.busy = 0;
    self._account.online = false;
    self._account.loggingIn = false;

    return self._devicestorage.listItems(FOLDER_DB_TYPE, true).then(stored => {
        self._account.folders = stored[0] || [];
        return self._initFolders();
    });
};

/**
 * Unlocks the keychain by either decrypting an existing private key or generating a new keypair
 * @param {Object} options.passphrase The passphrase to decrypt the private key
 */
Email.prototype.unlock = function (options) {
    const self = this;
    let generatedKeypair;

    if (options.keypair) {
        return this._handleExistingKeypair(options.keypair, options.passphrase);
    }

    return self._pgp.generateKeys({
        emailAddress: self._account.emailAddress,
        realname: options.realname,
        keySize: self._account.asymKeySize,
        passphrase: options.passphrase
    }).then(keypair => {
        generatedKeypair = keypair;
        return self._pgp.importKeys({
            passphrase: options.passphrase,
            privateKeyArmored: generatedKeypair.privateKeyArmored,
            publicKeyArmored: generatedKeypair.publicKeyArmored
        });
    }).then(() => ({
        publicKey: {
            _id: generatedKeypair.keyId,
            userId: self._account.emailAddress,
            publicKey: generatedKeypair.publicKeyArmored
        },
        privateKey: {
            _id: generatedKeypair.keyId,
            userId: self._account.emailAddress,
            encryptedKey: generatedKeypair.privateKeyArmored
        }
    })).then(keypair => this._setPrivateKey(keypair));
};

Email.prototype._handleExistingKeypair = function (keypair, passphrase) {
    const self = this;
    return new Promise(resolve => {
        const privKeyParams = self._pgp.getKeyParams(keypair.privateKey.encryptedKey);
        const pubKeyParams = self._pgp.getKeyParams(keypair.publicKey.publicKey);

        if (!keypair.privateKey._id ||
            keypair.privateKey._id !== keypair.publicKey._id ||
            keypair.privateKey._id !== privKeyParams._id ||
            keypair.publicKey._id !== pubKeyParams._id) {
            throw new Error('Key IDs dont match!');
        }

        const matchingPrivUserId = _.findWhere(privKeyParams.userIds, { emailAddress: self._account.emailAddress });
        const matchingPubUserId = _.findWhere(pubKeyParams.userIds, { emailAddress: self._account.emailAddress });

        if (!matchingPrivUserId ||
            !matchingPubUserId ||
            keypair.privateKey.userId !== self._account.emailAddress ||
            keypair.publicKey.userId !== self._account.emailAddress) {
            throw new Error('User IDs dont match!');
        }

        resolve();
    }).then(() => self._pgp.importKeys({
        passphrase,
        privateKeyArmored: keypair.privateKey.encryptedKey,
        publicKeyArmored: keypair.publicKey.publicKey
    }).then(() => keypair)).then(keypair => this._setPrivateKey(keypair));
};

Email.prototype._setPrivateKey = function (keypair) {
    this._pgpbuilder._privateKey = this._pgp._privateKey;
    return keypair;
};

/**
 * Opens a folder in IMAP so that we can receive updates for it.
 * No-op for outbox.
 *
 * @param {Object} options.folder The folder to be opened
 */
Email.prototype.openFolder = function (options) {
    const self = this;
    return Promise.resolve().then(() => {
        self.checkOnline();
    }).then(() => {
        if (options.folder.path !== config.outboxMailboxPath) {
            return self._imapClient.selectMailbox({ path: options.folder.path });
        }
    });
};

/**
 * Delete a message from IMAP, disk and folder.messages.
 *
 * @param {Object} options.folder The folder from which to delete the messages
 * @param {Object} options.message The message that should be deleted
 * @param {Boolean} options.localOnly Indicated if the message should not be removed from IMAP
 * @return {Promise}
 */
Email.prototype.deleteMessage = function (options) {
    const self = this;
    const { folder, message } = options;

    self.busy();
    this._removeMessageFromFolder(folder, message);

    if (options.localOnly || folder.path === config.outboxMailboxPath) {
        return this._deleteLocalAndFinalize(folder, message);
    }

    return Promise.resolve().then(() => {
        self.checkOnline();
    }).then(() => self._imapDeleteMessage({ folder, uid: message.uid }))
        .then(() => this._deleteLocalAndFinalize(folder, message));
};

Email.prototype._removeMessageFromFolder = function (folder, message) {
    const index = folder.messages.indexOf(message);
    if (index > -1) {
        folder.messages.splice(index, 1);
    }
};

Email.prototype._deleteLocalAndFinalize = function (folder, message) {
    return this._localDeleteMessage({ folder, uid: message.uid })
        .then(() => this._finalizeDelete(folder, message))
        .catch(() => this._finalizeDelete(folder, message));
};

Email.prototype._finalizeDelete = function (folder, message) {
    this.done();
    updateUnreadCount(folder);
    if (folder) {
        folder.messages.unshift(message);
    }
};

/**
 * Updates a message's 'unread' and 'answered' flags
 *
 * @param {Object} options.folder The origin folder
 * @param {Object} options.message The message that should change flags
 * @return {Promise}
 */
Email.prototype.setFlags = function (options) {
    const self = this;
    const { folder, message } = options;

    if (folder.messages.indexOf(message) < 0) {
        return Promise.resolve();
    }

    self.busy();

    if (options.localOnly || folder.path === config.outboxMailboxPath) {
        return this._markStorage(folder, message).then(() => this._finalizeSetFlags(folder));
    }

    return Promise.resolve().then(() => {
        self.checkOnline();
    }).then(() => self._imapMark({
        folder,
        uid: message.uid,
        unread: message.unread,
        answered: message.answered,
        flagged: message.flagged
    })).then(() => this._markStorage(folder, message))
        .then(() => this._finalizeSetFlags(folder));
};

Email.prototype._markStorage = function (folder, message) {
    const self = this;
    return self._localListMessages({ folder, uid: message.uid }).then(storedMessages => {
        const storedMessage = storedMessages[0];
        if (!storedMessage) {
            return;
        }
        storedMessage.unread = message.unread;
        storedMessage.flagged = message.flagged;
        storedMessage.answered = message.answered;
        storedMessage.modseq = message.modseq || storedMessage.modseq;
        return self._localStoreMessages({ folder, emails: [storedMessage] });
    });
};

Email.prototype._finalizeSetFlags = function (folder) {
    this.done();
    updateUnreadCount(folder);
};

/**
 * Moves a message to another folder
 *
 * @param {Object} options.folder The origin folder
 * @param {Object} options.destination The destination folder
 * @param {Object} options.message The message that should be moved
 * @return {Promise}
 */
Email.prototype.moveMessage = function (options) {
    const self = this;
    const { folder, destination, message } = options;

    self.busy();

    return Promise.resolve().then(() => {
        self.checkOnline();
    }).then(() => {
        this._removeMessageFromFolder(folder, message);
        return self._imapMoveMessage({ folder, destination, uid: message.uid })
            .catch(err => {
                folder.messages.unshift(message);
                throw err;
            });
    }).then(() => self._localDeleteMessage({ folder, uid: message.uid }))
        .then(() => this._finalizeMove(folder));
};

Email.prototype._finalizeMove = function (folder) {
    this.done();
    updateUnreadCount(folder);
};

/**
 * Streams message content
 * @param {Object} options.messages The messages to retrieve
 * @param {Object} options.folder The IMAP folder
 * @return {Promise}
 */
Email.prototype.getBody = function (options) {
    const self = this;
    const { messages: rawMessages, folder } = options;

    const messages = this._filterLoadableMessages(rawMessages);
    if (!messages.length) {
        return Promise.resolve();
    }

    messages.forEach(m => m.loadingBody = true);
    self.busy();

    let loadedMessages = [];

    return self._localListMessages({
        folder,
        uid: _.pluck(messages, MSG_ATTR_UID)
    }).then(localMessages => {
        loadedMessages = localMessages;
        const localUids = _.pluck(localMessages, MSG_ATTR_UID);
        return messages.filter(m => !_.contains(localUids, m.uid));
    }).then(missing => this._fetchMissingMessages(missing, folder, loadedMessages, messages))
        .then(() => this._enhanceMessages(messages, loadedMessages))
        .then(() => this._extractBodies(messages))
        .then(() => {
            this._finalizeGetBody(messages, options);
            return messages;
        })
        .catch(err => {
            this._finalizeGetBody(messages);
            throw err;
        });
};

Email.prototype._filterLoadableMessages = function (messages) {
    return messages.filter(m => !(m.loadingBody || typeof m.body !== 'undefined'));
};

Email.prototype._fetchMissingMessages = function (missing, folder, loadedMessages, allMessages) {
    const self = this;
    if (!missing.length) {
        return Promise.resolve(loadedMessages);
    }

    return self._fetchMessages({ messages: missing, folder }).then(imapMessages => {
        loadedMessages = loadedMessages.concat(imapMessages);
    }).catch(err => {
        axe.error('Can not fetch messages from IMAP. Reason: ' + err.message + (err.stack ? ('\n' + err.stack) : ''));
        missing.forEach(m => m.loadingBody = false);
        const remaining = _.difference(allMessages, missing);
                allMessages.length = 0;
                Array.prototype.push.apply(allMessages, remaining);
    });
};

Email.prototype._enhanceMessages = function (messages, loadedMessages) {
    messages.forEach(message => {
        const loaded = _.findWhere(loadedMessages, { uid: message.uid });
        _.extend(message, loaded);
    });
};

Email.prototype._extractBodies = function (messages) {
    const self = this;
    const jobs = messages.map(message => self._extractBody(message).catch(err => {
        axe.error('Can extract body for message uid ' + message.uid + ' . Reason: ' + err.message + (err.stack ? ('\n' + err.stack) : ''));
    }));
    return Promise.all(jobs);
};

Email.prototype._finalizeGetBody = function (messages, options) {
    messages.forEach(m => m.loadingBody = false);
    this.done();
    if (options && options.notifyNew && messages.length) {
        this.onIncomingMessage(messages);
    }
};

/**
 * Checks signatures of a message.
 */
Email.prototype._checkSignatures = function (message) {
    return this._keychain.getReceiverPublicKey(message.from[0].address).then(senderPublicKey => {
        const senderKey = senderPublicKey ? senderPublicKey.publicKey : undefined;
        if (message.clearSignedMessage) {
            return this._pgp.verifyClearSignedMessage(message.clearSignedMessage, senderKey);
        }
        if (message.signedMessage && message.signature) {
            return this._pgp.verifySignedMessage(message.signedMessage, message.signature, senderKey);
        }
    });
};

/**
 * Decrypts a message and updates its body.
 */
Email.prototype.decryptBody = function (options) {
    const self = this;
    const { message } = options;

    if (!message.bodyParts || message.decryptingBody || !message.body || !message.encrypted || message.decrypted) {
        return Promise.resolve(message);
    }

    message.decryptingBody = true;
    self.busy();

    return self._keychain.getReceiverPublicKey(message.from[0].address).then(senderPublicKey => {
        const encryptedNode = filterBodyParts(message.bodyParts, MSG_PART_TYPE_ENCRYPTED)[0];
        const senderKey = senderPublicKey ? senderPublicKey.publicKey : undefined;
        return self._pgp.decrypt(encryptedNode.content, senderKey).then(pt => ({ pt, encryptedNode }));
    }).then(({ pt, encryptedNode }) => {
        if (!pt.decrypted) {
            throw new Error('Error decrypting message.');
        }
        message.signed = typeof pt.signaturesValid !== 'undefined';
        message.signaturesValid = pt.signaturesValid;

        if (encryptedNode._isPgpInline) {
            message.body = pt.decrypted;
            message.decrypted = true;
            return;
        }

        encryptedNode.raw = pt.decrypted;
        return self._parse({ bodyParts: [encryptedNode] }).then(root => this._handleDecryptedRoot(message, root));
    }).then(() => {
        self.done();
        message.decryptingBody = false;
        return message;
    }).catch(err => {
        self.done();
        message.decryptingBody = false;
        message.body = err.message;
        message.decrypted = true;
        return message;
    });
};

Email.prototype._handleDecryptedRoot = function (message, root) {
    if (message.signed) {
        return this._setBodyFromRoot(message, root);
    }

    const signedRoot = filterBodyParts(root, MSG_PART_TYPE_SIGNED)[0];
    if (!signedRoot) {
        return this._setBodyFromRoot(message, root);
    }

    message.signedMessage = signedRoot.signedMessage;
    message.signature = signedRoot.signature;
    return this._checkSignatures(message).then(signaturesValid => {
        message.signed = typeof signaturesValid !== 'undefined';
        message.signaturesValid = signaturesValid;
        return this._setBodyFromRoot(message, signedRoot.content);
    });
};

Email.prototype._setBodyFromRoot = function (message, root) {
    message.body = _.pluck(filterBodyParts(root, MSG_PART_TYPE_TEXT), MSG_PART_ATTR_CONTENT).join('\n');
    message.html = _.pluck(filterBodyParts(root, MSG_PART_TYPE_HTML), MSG_PART_ATTR_CONTENT).join('\n');
    message.attachments = _.reject(filterBodyParts(root, MSG_PART_TYPE_ATTACHMENT), att => att.mimeType === "application/pgp-signature");
    inlineExternalImages(message);
    message.decrypted = true;
    return message;
};

/**
 * Sends an encrypted message.
 */
Email.prototype.sendEncrypted = function (options, mailer) {
    return this._sendGeneric({
        encrypt: true,
        smtpclient: options.smtpclient,
        mail: options.email,
        publicKeysArmored: options.email.publicKeysArmored
    }, mailer);
};

/**
 * Sends a plaintext message.
 */
Email.prototype.sendPlaintext = function (options, mailer) {
    options.email.body += str.signature + config.keyServerUrl + '/' + this._account.emailAddress;
    return this._sendGeneric({
        smtpclient: options.smtpclient,
        mail: options.email
    }, mailer);
};

/**
 * Generic send wrapper handling SMTP and optional Sent folder upload.
 */
Email.prototype._sendGeneric = function (options, mailer) {
    const self = this;
    self.busy();

    return Promise.resolve().then(() => {
        self.checkOnline();
    }).then(() => self._auth.getCredentials())
        .then(credentials => {
            self.ignoreUploadOnSent = self.checkIgnoreUploadOnSent(credentials.smtp.host);
            credentials.smtp.tlsWorkerPath = config.workerPath + '/tcp-socket-tls-worker.min.js';
            self._pgpMailer = mailer || new PgpMailer(credentials.smtp, self._pgpbuilder);
            self._pgpMailer.onCert = self._auth.handleCertificateUpdate.bind(self._auth, 'smtp', () => self._sendGeneric(options, mailer), self._dialog.error);
        }).then(() => self._pgpMailer.send(options))
        .then(rfcText => self._uploadToSent({ message: rfcText }).catch(() => {}))
        .then(() => this._finalizeSend())
        .catch(err => this._finalizeSend(err));
};

Email.prototype._finalizeSend = function (err) {
    this.done();
    if (err) {
        throw err;
    }
};

/**
 * Encrypts a message.
 */
Email.prototype.encrypt = function (options) {
    this.busy();
    return this._pgpbuilder.encrypt(options).then(message => {
        this.done();
        return message;
    });
};

/**
 * Synchronizes the outbox's contents from disk to memory.
 */
Email.prototype.refreshOutbox = function () {
    const outbox = _.findWhere(this._account.folders, { type: config.outboxMailboxType });

    return this._localListMessages({ folder: outbox, exactmatch: false }).then(storedMessages => {
        const storedUids = _.pluck(storedMessages, MSG_ATTR_UID);
        const memoryUids = _.pluck(outbox.messages, MSG_ATTR_UID);
        const newUids = _.difference(storedUids, memoryUids);
        const removedUids = _.difference(memoryUids, storedUids);

        _.filter(storedMessages, msg => _.contains(newUids, msg.uid)).forEach(newMessage => outbox.messages.push(newMessage));
        _.filter(outbox.messages, msg => _.contains(removedUids, msg.uid)).forEach(removedMessage => {
            const idx = outbox.messages.indexOf(removedMessage);
            outbox.messages.splice(idx, 1);
        });

        updateUnreadCount(outbox, true);
    });
};

/**
 * Handles online connection.
 */
Email.prototype.onConnect = function (imap) {
    const self = this;

    if (!self.isOnline()) {
        return Promise.resolve();
    }

    self._account.loggingIn = true;

    return self._auth.getCredentials().then(credentials => {
        credentials.imap.maxUpdateSize = config.imapUpdateBatchSize;
        credentials.imap.tlsWorkerPath = config.workerPath + '/tcp-socket-tls-worker.min.js';
        credentials.imap.compressionWorkerPath = config.workerPath + '/browserbox-compression-worker.min.js';
        self._imapClient = imap || new ImapClient(credentials.imap);
        self._imapClient.onError = onConnectionError;
        self._imapClient.onCert = self._auth.handleCertificateUpdate.bind(self._auth, 'imap', self.onConnect.bind(self), self._dialog.error);
        self._imapClient.onSyncUpdate = self._onSyncUpdate.bind(self);
    }).then(() => self._imapClient.login())
        .then(() => {
            self._account.loggingIn = false;
            return self._updateFolders();
        }).then(() => {
            const mailboxCache = {};
            self._account.folders.forEach(folder => {
                const uids = folder.uids.sort((a, b) => a - b);
                const lastUid = uids[uids.length - 1];
                mailboxCache[folder.path] = {
                    exists: lastUid,
                    uidNext: lastUid + 1,
                    uidlist: uids,
                    highestModseq: '' + folder.modseq
                };
            });
            self._imapClient.mailboxCache = mailboxCache;
            self._account.online = true;
        }).then(() => {
            const inbox = _.findWhere(self._account.folders, { type: FOLDER_TYPE_INBOX });
            if (!inbox) {
                return;
            }
            return self.openFolder({ folder: inbox }).then(() => {
                self._imapClient.listenForChanges({ path: inbox.path }, () => { });
            });
        });

    function onConnectionError(error) {
        axe.debug('IMAP connection error, disconnected. Reason: ' + error.message + (error.stack ? ('\n' + error.stack) : ''));

        if (!self.isOnline()) {
            return;
        }

        axe.debug('Attempting reconnect in ' + config.reconnectInterval / 1000 + ' seconds.');
        setTimeout(() => {
            axe.debug('Reconnecting the IMAP stack');
            self.onConnect().catch(self._dialog.error);
        }, config.reconnectInterval);
    }
};

/**
 * Handles offline state.
 */
Email.prototype.onDisconnect = function () {
    if (this._imapClient) {
        this._imapClient.stopListeningForChanges(() => { });
        this._imapClient.logout(() => { });
    }
    this._account.online = false;
    this._imapClient = undefined;
    this._pgpMailer = undefined;
    return Promise.resolve();
};

/**
 * Handles IMAP sync updates.
 */
Email.prototype._onSyncUpdate = function (options) {
    const self = this;
    const folder = _.findWhere(self._account.folders, { path: options.path });
    if (!folder) {
        return;
    }

    if (options.type === SYNC_TYPE_NEW) {
        this._handleNewSync(folder, options.list);
    } else if (options.type === SYNC_TYPE_DELETED) {
        this._handleDeletedSync(folder, options.list);
    } else if (options.type === SYNC_TYPE_MSGS) {
        this._handleMsgSync(folder, options.list);
    }
};

Email.prototype._handleNewSync = function (folder, uids) {
    const self = this;
    uids = _.difference(uids, folder.uids);
    const maxUid = folder.uids.length ? Math.max(...folder.uids) : 0;
    folder.uids.push(...uids);
    this._localStoreFolders();

    folder.messages.push(...uids.map(uid => ({ uid })));

    if (maxUid) {
        const fetch = folder.messages.filter(msg => msg.uid > maxUid).sort((a, b) => a.uid - b.uid).slice(-20);
        this.getBody({ folder, messages: fetch, notifyNew: folder.type === FOLDER_TYPE_INBOX }).catch(this._dialog.error);
    }
};

Email.prototype._handleDeletedSync = function (folder, uids) {
    const self = this;
    folder.uids = _.difference(folder.uids, uids);
    uids.forEach(uid => {
        const message = _.findWhere(folder.messages, { uid });
        if (message) {
            self.deleteMessage({ folder, message, localOnly: true }).catch(self._dialog.error);
        }
    });
};

Email.prototype._handleMsgSync = function (folder, changedMsgs) {
    const self = this;
    changedMsgs.forEach(changedMsg => {
        if (!changedMsg.uid || !changedMsg.flags) {
            return;
        }
        const message = _.findWhere(folder.messages, { uid: changedMsg.uid });
        if (!message || !message.bodyParts) {
            return;
        }
        message.answered = changedMsg.flags.includes('\\Answered');
        message.unread = !changedMsg.flags.includes('\\Seen');
        message.modseq = changedMsg.modseq;

        self.setFlags({ folder, message, localOnly: true }).then(() => {
            const modseq = parseInt(changedMsg.modseq, 10);
            if (modseq > folder.modseq) {
                folder.modseq = modseq;
                return self._localStoreFolders();
            }
        }).catch(self._dialog.error);
    });
};

/**
 * Updates the folder information from imap.
 */
Email.prototype._updateFolders = function () {
    const self = this;
    self.busy();

    return self._imapClient.listWellKnownFolders().then(wellKnownFolders => {
        let foldersChanged = false;
        const imapFolders = [];

        self._account.folders = self._account.folders || [];

        wellKnownFolders[config.outboxMailboxType] = [{
            name: config.outboxMailboxName,
            type: config.outboxMailboxType,
            path: config.outboxMailboxPath
        }];

        Object.keys(wellKnownFolders).forEach(folderType => {
            if (Array.isArray(wellKnownFolders[folderType])) {
                imapFolders.push(...wellKnownFolders[folderType]);
            }
        });

        const imapFolderPaths = _.pluck(imapFolders, 'path');
        const localFolderPaths = _.pluck(self._account.folders, 'path');
        const newFolderPaths = _.difference(imapFolderPaths, localFolderPaths);
        const removedFolderPaths = _.difference(localFolderPaths, imapFolderPaths);

        foldersChanged = !!newFolderPaths.length || !!removedFolderPaths.length;

        removedFolderPaths.forEach(removedPath => {
            const idx = self._account.folders.findIndex(f => f.path === removedPath);
            if (idx > -1) {
                self._account.folders.splice(idx, 1);
            }
        });

        newFolderPaths.forEach(newPath => {
            const folder = _.findWhere(imapFolders, { path: newPath });
            if (folder) {
                self._account.folders.push(folder);
            }
        });

        const wellknownTypes = [
            FOLDER_TYPE_INBOX,
            FOLDER_TYPE_SENT,
            config.outboxMailboxType,
            FOLDER_TYPE_DRAFTS,
            FOLDER_TYPE_TRASH,
            FOLDER_TYPE_FLAGGED
        ];

        wellknownTypes.forEach(mbxType => {
            let wellknownFolder = _.findWhere(self._account.folders, { type: mbxType, wellknown: true });
            if (wellknownFolder) {
                return;
            }
            wellknownFolder = _.findWhere(self._account.folders, { type: mbxType });
            if (!wellknownFolder) {
                return;
            }
            wellknownFolder.wellknown = true;
            foldersChanged = true;
        });

        self._account.folders.sort((a, b) => {
            if (a.wellknown && b.wellknown) {
                return wellknownTypes.indexOf(a.type) - wellknownTypes.indexOf(b.type);
            }
            if (a.wellknown) return -1;
            if (b.wellknown) return 1;
            return a.path.toLowerCase().localeCompare(b.path.toLowerCase());
        });

        if (foldersChanged) {
            return self._localStoreFolders();
        }
    }).then(() => self._initFolders())
        .then(() => self.done())
        .catch(err => {
            self.done();
            throw err;
        });
};

Email.prototype._initFolders = function () {
    const self = this;
    self._account.folders.forEach(folder => {
        folder.modseq = folder.modseq || 0;
        folder.count = folder.count || 0;
        folder.uids = folder.uids || [];
        folder.uids.sort((a, b) => a - b);
        folder.messages = folder.messages || folder.uids.map(uid => ({ uid }));
    });

    const inbox = _.findWhere(self._account.folders, { type: FOLDER_TYPE_INBOX });
    if (inbox && inbox.messages.length) {
        return self.getBody({ folder: inbox, messages: inbox.messages.slice(-30) }).catch(self._dialog.error);
    }
};

Email.prototype.busy = function () {
    this._account.busy++;
};

Email.prototype.done = function () {
    if (this._account.busy > 0) {
        this._account.busy--;
    }
};

/**
 * Mark messages as un-/read or un-/answered on IMAP
 */
Email.prototype._imapMark = function (options) {
    const self = this;
    return Promise.resolve().then(() => {
        self.checkOnline();
    }).then(() => {
        options.path = options.folder.path;
        return self._imapClient.updateFlags(options);
    });
};

/**
 * Delete or move a message to trash.
 */
Email.prototype._imapDeleteMessage = function (options) {
    const self = this;
    return Promise.resolve().then(() => {
        self.checkOnline();
    }).then(() => {
        const trash = _.findWhere(self._account.folders, { type: FOLDER_TYPE_TRASH });
        if (!trash || options.folder === trash) {
            return self._imapClient.deleteMessage({ path: options.folder.path, uid: options.uid });
        }
        return self._imapMoveMessage({ folder: options.folder, destination: trash, uid: options.uid });
    });
};

/**
 * Move a message on the server.
 */
Email.prototype._imapMoveMessage = function (options) {
    const self = this;
    return Promise.resolve().then(() => {
        self.checkOnline();
    }).then(() => self._imapClient.moveMessage({
        path: options.folder.path,
        destination: options.destination.path,
        uid: options.uid
    }));
};

/**
 * Upload a message to a folder.
 */
Email.prototype._imapUploadMessage = function (options) {
    return this._imapClient.uploadMessage({
        path: options.folder.path,
        message: options.message
    });
};

/**
 * Fetch messages from imap.
 */
Email.prototype._fetchMessages = function (options) {
    const self = this;
    const { messages, folder } = options;

    return Promise.resolve().then(() => {
        self.checkOnline();
    }).then(() => self._imapClient.listMessages({
        path: folder.path,
        uids: _.pluck(messages, MSG_ATTR_UID)
    })).then(msgs => {
        messages.forEach(message => {
            message.attachments = message.bodyParts.filter(bp => bp.type === MSG_PART_TYPE_ATTACHMENT);
        });
        const jobs = messages.map(message => {
            const contentParts = message.bodyParts.filter(bp => bp.type !== MSG_PART_TYPE_ATTACHMENT || (bp.type === MSG_PART_TYPE_ATTACHMENT && bp.id));
            const attachmentParts = message.bodyParts.filter(bp => bp.type === MSG_PART_TYPE_ATTACHMENT && !bp.id);
            if (!contentParts.length) {
                return Promise.resolve();
            }
            return self._getBodyParts({ folder, uid: message.uid, bodyParts: contentParts }).then(parsedBodyParts => {
                message.bodyParts = parsedBodyParts.concat(attachmentParts);
                return self._localStoreMessages({ folder, emails: [message] });
            }).catch(err => {
                if (err.hide) {
                    return;
                }
                throw err;
            });
        });
        return Promise.all(jobs);
    }).then(() => {
        const highestModseq = Math.max(..._.pluck(messages, MSG_ATTR_MODSEQ).map(modseq => parseInt(modseq, 10)));
        if (highestModseq > folder.modseq) {
            folder.modseq = highestModseq;
            return self._localStoreFolders();
        }
    }).then(() => {
        updateUnreadCount(folder);
        return messages;
    });
};

/**
 * Stream an email message's body.
 */
Email.prototype._getBodyParts = function (options) {
    const self = this;
    return Promise.resolve().then(() => {
        self.checkOnline();
    }).then(() => {
        options.path = options.folder.path;
        return self._imapClient.getBodyParts(options);
    }).then(() => {
        if (options.bodyParts.filter(bp => !(bp.raw || bp.content)).length) {
            const error = new Error('Can not get the contents of this message. It has already been deleted!');
            error.hide = true;
            throw error;
        }
        return self._parse(options);
    });
};

/**
 * Persist encrypted list in device storage.
 */
Email.prototype._localStoreFolders = function () {
    const folders = this._account.folders.map(folder => ({
        name: folder.name,
        path: folder.path,
        type: folder.type,
        modseq: folder.modseq,
        wellknown: !!folder.wellknown,
        uids: folder.uids
    }));
    return this._devicestorage.storeList([folders], FOLDER_DB_TYPE);
};

/**
 * List locally available items.
 */
Email.prototype._localListMessages = function (options) {
    const needsExactMatch = typeof options.exactmatch === 'undefined' ? true : options.exactmatch;
    let query;
    if (Array.isArray(options.uid)) {
        query = options.uid.map(uid => `email_${options.folder.path}${uid ? '_' + uid : ''}`);
    } else {
        query = `email_${options.folder.path}${options.uid ? '_' + options.uid : ''}`;
    }
    return this._devicestorage.listItems(query, needsExactMatch);
};

/**
 * Store messages locally.
 */
Email.prototype._localStoreMessages = function (options) {
    const dbType = `email_${options.folder.path}`;
    return this._devicestorage.storeList(options.emails, dbType);
};

/**
 * Delete a local message.
 */
Email.prototype._localDeleteMessage = function (options) {
    const { path, uid, id } = options;
    if (!path || !(uid || id)) {
        return Promise.reject(new Error('Invalid options!'));
    }
    const dbType = `email_${path}_${uid || id}`;
    return this._devicestorage.removeList(dbType);
};

/**
 * Extract a message body from the body parts.
 */
Email.prototype._extractBody = function (message) {
    const self = this;
    return Promise.resolve().then(() => {
        if (message.encrypted) {
            message.body = filterBodyParts(message.bodyParts, MSG_PART_TYPE_ENCRYPTED)[0].content;
            return;
        }

        let root = message.bodyParts;

        if (message.signed) {
            const signedRoot = filterBodyParts(message.bodyParts, MSG_PART_TYPE_SIGNED)[0];
            message.signedMessage = signedRoot.signedMessage;
            message.signature = signedRoot.signature;
            root = signedRoot.content;
        }

        const body = _.pluck(filterBodyParts(root, MSG_PART_TYPE_TEXT), MSG_PART_ATTR_CONTENT).join('\n');
        const pgpInlineMatch = /^-{5}BEGIN PGP MESSAGE-{5}[\s\S]*-{5}END PGP MESSAGE-{5}$/im.exec(body);
        if (pgpInlineMatch) {
            message.body = pgpInlineMatch[0];
            message.encrypted = true;
            message.bodyParts = [{
                type: MSG_PART_TYPE_ENCRYPTED,
                content: pgpInlineMatch[0],
                _isPgpInline: true
            }];
            return;
        }

        const clearSignedMatch = /^-{5}BEGIN PGP SIGNED MESSAGE-{5}\nHash:[ ][^\n]+\n(?:[A-Za-z]+:[ ][^\n]+\n)*\n([\s\S]*?)\n-{5}BEGIN PGP SIGNATURE-{5}[\S\s]*-{5}END PGP SIGNATURE-{5}$/im.exec(body);
        if (clearSignedMatch) {
            message.signed = true;
            message.clearSignedMessage = clearSignedMatch[0];
            const cleaned = (clearSignedMatch[1] || '').replace(/^- /gm, '');
            return self._finalizeExtract(message, cleaned, root);
        }

        if (!message.signed) {
            return self._finalizeExtract(message, body, root);
        }

        return self._checkSignatures(message).then(signaturesValid => {
            message.signed = typeof signaturesValid !== 'undefined';
            message.signaturesValid = signaturesValid;
            return self._finalizeExtract(message, body, root);
        });
    });
};

Email.prototype._finalizeExtract = function (message, body, root) {
    message.body = body;
    if (!message.clearSignedMessage) {
        message.attachments = filterBodyParts(root, MSG_PART_TYPE_ATTACHMENT);
        message.html = _.pluck(filterBodyParts(root, MSG_PART_TYPE_HTML), MSG_PART_ATTR_CONTENT).join('\n');
        inlineExternalImages(message);
    }
};

/**
 * Parse an email using the mail reader.
 */
Email.prototype._parse = function (options) {
    const self = this;
    return new Promise((resolve, reject) => {
        self._mailreader.parse(options, (err, root) => {
            if (err) reject(err);
            else resolve(root);
        });
    });
};

/**
 * Upload a message to the sent folder if needed.
 */
Email.prototype._uploadToSent = function (options) {
    const self = this;
    self.busy();
    return Promise.resolve().then(() => {
        const sentFolder = _.findWhere(self._account.folders, { type: FOLDER_TYPE_SENT });
        if (self.ignoreUploadOnSent || !sentFolder || !options.message) {
            return;
        }
        return self._imapUploadMessage({ folder: sentFolder, message: options.message });
    }).then(() => {
        self.done();
    }).catch(err => {
        self.done();
        throw err;
    });
};

/**
 * Check if the client is online.
 */
Email.prototype.checkOnline = function () {
    if (!this._account.online) {
        const err = new Error('Client is currently offline!');
        err.code = 42;
        throw err;
    }
};

/**
 * Checks whether we need to upload to the sent folder after sending an email.
 */
Email.prototype.checkIgnoreUploadOnSent = function (hostname) {
    return config.ignoreUploadOnSentDomains.some(domain => domain.test(hostname));
};

/**
 * Check if the user agent is online.
 */
Email.prototype.isOnline = function () {
    return navigator.onLine;
};

/**
 * Updates a folder's unread count.
 */
function updateUnreadCount(folder, countAllMessages) {
    folder.count = countAllMessages ? folder.messages.length : _.filter(folder.messages, msg => msg.unread).length;
}

/**
 * Recursively filter body parts by type.
 */
function filterBodyParts(bodyParts, type, result = []) {
    bodyParts.forEach(part => {
        if (part.type === type) {
            result.push(part);
        } else if (Array.isArray(part.content)) {
            filterBodyParts(part.content, type, result);
        }
    });
    return result;
}

/**
 * Inline external images referenced by CID.
 */
function inlineExternalImages(message) {
    message.html = message.html.replace(/(<img[^>]+\bsrc=['"])cid:([^'">]+)(['"])/ig, (match, prefix, src, suffix) => {
        let localSource = '';
        const internalReference = _.findWhere(message.attachments, { id: src });
        if (internalReference) {
            let payload = '';
            for (let i = 0; i < internalReference.content.byteLength; i++) {
                payload += String.fromCharCode(internalReference.content[i]);
            }
            try {
                localSource = 'data:application/octet-stream;base64,' + btoa(payload);
            } catch (e) { }
        }
        return prefix + localSource + suffix;
    });
}