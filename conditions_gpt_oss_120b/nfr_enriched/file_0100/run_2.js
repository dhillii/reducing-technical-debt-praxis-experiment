'use strict';

var ngModule = angular.module('woEmail');
ngModule.service('email', Email);
module.exports = Email;

var config = require('../app-config').config,
    str = require('../app-config').string,
    axe = require('axe-logger'),
    PgpMailer = require('pgpmailer'),
    ImapClient = require('imap-client');

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

/**
 * High-level data access object that orchestrates everything around the handling of encrypted mails:
 * PGP de-/encryption, receiving via IMAP, sending via SMTP, MIME parsing, local db persistence
 *
 * @param {Object} keychain The keychain DAO handles keys transparently
 * @param {Object} pgp Orchestrates decryption
 * @param {Object} devicestorage Handles persistence to the local indexed db
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

    return self._devicestorage.listItems(FOLDER_DB_TYPE, true).then(function (stored) {
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
        return handleExistingKeypair(options.keypair);
    }

    return self._pgp.generateKeys({
        emailAddress: self._account.emailAddress,
        realname: options.realname,
        keySize: self._account.asymKeySize,
        passphrase: options.passphrase
    }).then(function (keypair) {
        generatedKeypair = keypair;
        return self._pgp.importKeys({
            passphrase: options.passphrase,
            privateKeyArmored: generatedKeypair.privateKeyArmored,
            publicKeyArmored: generatedKeypair.publicKeyArmored
        });
    }).then(function () {
        return {
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
        };
    }).then(setPrivateKey);

    function handleExistingKeypair(keypair) {
        return new Promise(function (resolve) {
            const privKeyParams = self._pgp.getKeyParams(keypair.privateKey.encryptedKey);
            const pubKeyParams = self._pgp.getKeyParams(keypair.publicKey.publicKey);

            if (!keypair.privateKey._id ||
                keypair.privateKey._id !== keypair.publicKey._id ||
                keypair.privateKey._id !== privKeyParams._id ||
                keypair.publicKey._id !== pubKeyParams._id) {
                throw new Error('Key IDs dont match!');
            }

            const matchingPrivUserId = _.findWhere(privKeyParams.userIds, {
                emailAddress: self._account.emailAddress
            });
            const matchingPubUserId = _.findWhere(pubKeyParams.userIds, {
                emailAddress: self._account.emailAddress
            });

            if (!matchingPrivUserId ||
                !matchingPubUserId ||
                keypair.privateKey.userId !== self._account.emailAddress ||
                keypair.publicKey.userId !== self._account.emailAddress) {
                throw new Error('User IDs dont match!');
            }

            resolve();
        }).then(function () {
            return self._pgp.importKeys({
                passphrase: options.passphrase,
                privateKeyArmored: keypair.privateKey.encryptedKey,
                publicKeyArmored: keypair.publicKey.publicKey
            }).then(function () {
                return keypair;
            });
        }).then(setPrivateKey);
    }

    function setPrivateKey(keypair) {
        self._pgpbuilder._privateKey = self._pgp._privateKey;
        return keypair;
    }
};

/**
 * Opens a folder in IMAP so that we can receive updates for it.
 * No-op for outbox.
 *
 * @param {Object} options.folder The folder to be opened
 */
Email.prototype.openFolder = function (options) {
    const self = this;
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        if (options.folder.path !== config.outboxMailboxPath) {
            return self._imapClient.selectMailbox({
                path: options.folder.path
            });
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
    const folder = options.folder;
    const message = options.message;

    self.busy();
    folder.messages.splice(folder.messages.indexOf(message), 1);

    if (options.localOnly || options.folder.path === config.outboxMailboxPath) {
        return deleteLocal().then(done).catch(done);
    }

    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        return self._imapDeleteMessage({
            folder: folder,
            uid: message.uid
        });
    }).then(deleteLocal).then(done).catch(done);

    function deleteLocal() {
        return self._localDeleteMessage({
            folder: folder,
            uid: message.uid
        });
    }

    function done(err) {
        self.done();
        updateUnreadCount(folder);
        if (err) {
            folder.messages.unshift(message);
            throw err;
        }
    }
};

/**
 * Updates a message's 'unread' and 'answered' flags.
 *
 * @param {Object} options.folder The origin folder
 * @param {Object} options.message The message that should change flags
 * @return {Promise}
 */
Email.prototype.setFlags = function (options) {
    const self = this;
    const folder = options.folder;
    const message = options.message;

    if (folder.messages.indexOf(message) < 0) {
        return Promise.resolve();
    }

    self.busy();

    if (options.localOnly || options.folder.path === config.outboxMailboxPath) {
        return markStorage().then(done).catch(done);
    }

    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        return self._imapMark({
            folder: folder,
            uid: options.message.uid,
            unread: options.message.unread,
            answered: options.message.answered,
            flagged: options.message.flagged
        });
    }).then(markStorage).then(done).catch(done);

    function markStorage() {
        return self._localListMessages({
            folder: folder,
            uid: options.message.uid,
        }).then(function (storedMessages) {
            const storedMessage = storedMessages[0];
            if (!storedMessage) {
                return;
            }
            storedMessage.unread = options.message.unread;
            storedMessage.flagged = options.message.flagged;
            storedMessage.answered = options.message.answered;
            storedMessage.modseq = options.message.modseq || storedMessage.modseq;
            return self._localStoreMessages({
                folder: folder,
                emails: [storedMessage]
            });
        });
    }

    function done(err) {
        self.done();
        updateUnreadCount(folder);
        if (err) {
            throw err;
        }
    }
};

/**
 * Moves a message to another folder.
 *
 * @param {Object} options.folder The origin folder
 * @param {Object} options.destination The destination folder
 * @param {Object} options.message The message that should be moved
 * @return {Promise}
 */
Email.prototype.moveMessage = function (options) {
    const self = this;
    const folder = options.folder;
    const destination = options.destination;
    const message = options.message;

    self.busy();
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        folder.messages.splice(folder.messages.indexOf(message), 1);
        return self._imapMoveMessage({
            folder: folder,
            destination: destination,
            uid: message.uid
        }).catch(function (err) {
            folder.messages.unshift(message);
            done(err);
        });
    }).then(function () {
        return self._localDeleteMessage({
            folder: folder,
            uid: message.uid
        });
    }).then(done).catch(done);

    function done(err) {
        self.done();
        updateUnreadCount(folder);
        if (err) {
            throw err;
        }
    }
};

/**
 * Streams message content.
 *
 * @param {Object} options.messages The messages to retrieve bodies for
 * @param {Object} options.folder The IMAP folder
 * @return {Promise}
 */
Email.prototype.getBody = function (options) {
    const self = this;
    let messages = options.messages;
    const folder = options.folder;

    messages = filterMessagesNeedingBody(messages);
    if (!messages.length) {
        return Promise.resolve();
    }

    markMessagesLoading(messages);
    self.busy();

    let loadedMessages;

    return self._localListMessages({
        folder: folder,
        uid: _.pluck(messages, MSG_ATTR_UID)
    }).then(function (localMessages) {
        loadedMessages = localMessages;
        const localUids = _.pluck(localMessages, MSG_ATTR_UID);
        return messages.filter(msg => !_.contains(localUids, msg.uid));
    }).then(function (needsImapFetch) {
        if (!needsImapFetch.length) {
            return loadedMessages;
        }
        return self._fetchMessages({
            messages: needsImapFetch,
            folder: folder
        }).then(function (imapMessages) {
            loadedMessages = loadedMessages.concat(imapMessages);
        }).catch(function (err) {
            axe.error('Can not fetch messages from IMAP. Reason: ' + err.message + (err.stack ? ('\n' + err.stack) : ''));
            needsImapFetch.forEach(msg => {
                msg.loadingBody = false;
            });
            messages = _.difference(messages, needsImapFetch);
        });
    }).then(function () {
        enhanceMessagesWithLocal(messages, loadedMessages);
    }).then(function () {
        return extractBodiesForMessages(messages);
    }).then(function () {
        finalize(messages, options);
        return messages;
    }).catch(function (err) {
        finalize(messages);
        throw err;
    });

    function filterMessagesNeedingBody(msgs) {
        return msgs.filter(msg => !(msg.loadingBody || typeof msg.body !== 'undefined'));
    }

    function markMessagesLoading(msgs) {
        msgs.forEach(msg => {
            msg.loadingBody = true;
        });
    }

    function enhanceMessagesWithLocal(msgs, localMsgs) {
        msgs.forEach(msg => {
            const loaded = _.findWhere(localMsgs, { uid: msg.uid });
            _.extend(msg, loaded);
        });
    }

    function extractBodiesForMessages(msgs) {
        const jobs = msgs.map(msg => self._extractBody(msg).catch(err => {
            axe.error('Can extract body for message uid ' + msg.uid + ' . Reason: ' + err.message + (err.stack ? ('\n' + err.stack) : ''));
        }));
        return Promise.all(jobs);
    }

    function finalize(msgs, opts) {
        msgs.forEach(m => {
            m.loadingBody = false;
        });
        self.done();
        if (opts && opts.notifyNew && msgs.length) {
            self.onIncomingMessage(msgs);
        }
    }
};

Email.prototype._checkSignatures = function (message) {
    const self = this;
    return self._keychain.getReceiverPublicKey(message.from[0].address).then(function (senderPublicKey) {
        const senderKey = senderPublicKey ? senderPublicKey.publicKey : undefined;
        if (message.clearSignedMessage) {
            return self._pgp.verifyClearSignedMessage(message.clearSignedMessage, senderKey);
        } else if (message.signedMessage && message.signature) {
            return self._pgp.verifySignedMessage(message.signedMessage, message.signature, senderKey);
        }
    });
};

/**
 * Decrypts a message and replaces sets the decrypted plaintext as the message's body, html, or attachment.
 *
 * @param {Object} options.message The message
 * @return {Promise}
 */
Email.prototype.decryptBody = function (options) {
    const self = this;
    const message = options.message;
    let encryptedNode;

    if (!message.bodyParts ||
        message.decryptingBody ||
        !message.body ||
        !message.encrypted ||
        message.decrypted) {
        return Promise.resolve(message);
    }

    message.decryptingBody = true;
    self.busy();

    return self._keychain.getReceiverPublicKey(message.from[0].address).then(function (senderPublicKey) {
        encryptedNode = filterBodyParts(message.bodyParts, MSG_PART_TYPE_ENCRYPTED)[0];
        const senderKey = senderPublicKey ? senderPublicKey.publicKey : undefined;
        return self._pgp.decrypt(encryptedNode.content, senderKey);
    }).then(function (pt) {
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
        return self._parse({ bodyParts: [encryptedNode] }).then(handleParsedRoot);
    }).then(function () {
        self.done();
        message.decryptingBody = false;
        return message;
    }).catch(function (err) {
        self.done();
        message.decryptingBody = false;
        message.body = err.message;
        message.decrypted = true;
        return message;
    });

    function handleParsedRoot(root) {
        if (message.signed) {
            return setDecryptedBody(root);
        }

        const signedRoot = filterBodyParts(root, MSG_PART_TYPE_SIGNED)[0];
        if (!signedRoot) {
            return setDecryptedBody(root);
        }

        message.signedMessage = signedRoot.signedMessage;
        message.signature = signedRoot.signature;
        return self._checkSignatures(message).then(function (signaturesValid) {
            message.signed = typeof signaturesValid !== 'undefined';
            message.signaturesValid = signaturesValid;
            setDecryptedBody(signedRoot.content);
        });
    }

    function setDecryptedBody(root) {
        message.body = _.pluck(filterBodyParts(root, MSG_PART_TYPE_TEXT), MSG_PART_ATTR_CONTENT).join('\n');
        message.html = _.pluck(filterBodyParts(root, MSG_PART_TYPE_HTML), MSG_PART_ATTR_CONTENT).join('\n');
        message.attachments = _.reject(filterBodyParts(root, MSG_PART_TYPE_ATTACHMENT), att => att.mimeType === "application/pgp-signature");
        inlineExternalImages(message);
        message.decrypted = true;
    }
};

/**
 * Encrypted (if necessary) and sends a message with a predefined clear text greeting.
 *
 * @param {Object} options.email The message to be sent
 * @param {Object} mailer an instance of the pgpmailer to be used for testing purposes only
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
 * Sends a signed message in the plain.
 *
 * @param {Object} options.email The message to be sent
 * @param {Object} mailer an instance of the pgpmailer to be used for testing purposes only
 */
Email.prototype.sendPlaintext = function (options, mailer) {
    options.email.body += str.signature + config.keyServerUrl + '/' + this._account.emailAddress;
    return this._sendGeneric({
        smtpclient: options.smtpclient,
        mail: options.email
    }, mailer);
};

/**
 * Generic send wrapper handling SMTP credentials, pgpMailer creation and optional Sent folder upload.
 *
 * @param {Object} options.email The message to be sent
 * @param {Object} mailer Optional pgpmailer instance for testing
 */
Email.prototype._sendGeneric = function (options, mailer) {
    const self = this;
    self.busy();

    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        return self._auth.getCredentials();
    }).then(function (credentials) {
        self.ignoreUploadOnSent = self.checkIgnoreUploadOnSent(credentials.smtp.host);
        credentials.smtp.tlsWorkerPath = config.workerPath + '/tcp-socket-tls-worker.min.js';
        self._pgpMailer = (mailer || new PgpMailer(credentials.smtp, self._pgpbuilder));
        self._pgpMailer.onCert = self._auth.handleCertificateUpdate.bind(self._auth, 'smtp', self._sendGeneric.bind(self, options), self._dialog.error);
    }).then(function () {
        return self._pgpMailer.send(options);
    }).then(function (rfcText) {
        return self._uploadToSent({ message: rfcText }).catch(() => { });
    }).then(done).catch(done);

    function done(err) {
        self.done();
        if (err) {
            throw err;
        }
    }
};

/**
 * Signs and encrypts a message.
 *
 * @param {Object} options.email The message to be encrypted
 * @return {Promise}
 */
Email.prototype.encrypt = function (options) {
    const self = this;
    self.busy();
    return self._pgpbuilder.encrypt(options).then(function (message) {
        self.done();
        return message;
    });
};

/**
 * Synchronizes the outbox's contents from disk to memory.
 *
 * @return {Promise}
 */
Email.prototype.refreshOutbox = function () {
    const outbox = _.findWhere(this._account.folders, {
        type: config.outboxMailboxType
    });

    return this._localListMessages({
        folder: outbox,
        exactmatch: false
    }).then(function (storedMessages) {
        const storedUids = _.pluck(storedMessages, MSG_ATTR_UID);
        const memoryUids = _.pluck(outbox.messages, MSG_ATTR_UID);
        const newUids = _.difference(storedUids, memoryUids);
        const removedUids = _.difference(memoryUids, storedUids);

        storedMessages.filter(msg => _.contains(newUids, msg.uid))
            .forEach(newMessage => outbox.messages.push(newMessage));

        outbox.messages.filter(msg => _.contains(removedUids, msg.uid))
            .forEach(removedMessage => {
                const idx = outbox.messages.indexOf(removedMessage);
                outbox.messages.splice(idx, 1);
            });

        updateUnreadCount(outbox, true);
    });
};

/**
 * Handles online connection, initializes IMAP client and folders.
 *
 * @param {Object} imap Optional imap-client instance for testing
 */
Email.prototype.onConnect = function (imap) {
    const self = this;

    if (!self.isOnline()) {
        return Promise.resolve();
    }

    self._account.loggingIn = true;

    return self._auth.getCredentials().then(function (credentials) {
        credentials.imap.maxUpdateSize = config.imapUpdateBatchSize;
        credentials.imap.tlsWorkerPath = config.workerPath + '/tcp-socket-tls-worker.min.js';
        credentials.imap.compressionWorkerPath = config.workerPath + '/browserbox-compression-worker.min.js';
        self._imapClient = (imap || new ImapClient(credentials.imap));
        self._imapClient.onError = onConnectionError;
        self._imapClient.onCert = self._auth.handleCertificateUpdate.bind(self._auth, 'imap', self.onConnect.bind(self), self._dialog.error);
        self._imapClient.onSyncUpdate = self._onSyncUpdate.bind(self);
    }).then(() => self._imapClient.login())
        .then(() => {
            self._account.loggingIn = false;
            return self._updateFolders();
        })
        .then(() => {
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
        })
        .then(() => {
            const inbox = _.findWhere(self._account.folders, { type: FOLDER_TYPE_INBOX });
            if (!inbox) {
                return;
            }
            return self.openFolder({ folder: inbox }).then(() => {
                self._imapClient.listenForChanges({ path: inbox.path }, function () { });
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
 * Handles offline state, stops IMAP listening and clears clients.
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
 * Processes IMAP sync updates.
 *
 * @param {Object} options.type The type of the update
 * @param {Object} options.path The mailbox path
 * @param {Array} options.list The update list
 */
Email.prototype._onSyncUpdate = function (options) {
    const self = this;
    const folder = _.findWhere(self._account.folders, { path: options.path });
    if (!folder) {
        return;
    }

    if (options.type === SYNC_TYPE_NEW) {
        handleNewMessages(folder, options.list);
    } else if (options.type === SYNC_TYPE_DELETED) {
        handleDeletedMessages(folder, options.list);
    } else if (options.type === SYNC_TYPE_MSGS) {
        handleFlagUpdates(folder, options.list);
    }

    function handleNewMessages(folder, uids) {
        const newUids = _.difference(uids, folder.uids);
        const maxUid = folder.uids.length ? Math.max.apply(null, folder.uids) : 0;
        Array.prototype.push.apply(folder.uids, newUids);
        self._localStoreFolders();
        Array.prototype.push.apply(folder.messages, newUids.map(uid => ({ uid })));
        if (maxUid) {
            const fetch = _.filter(folder.messages, msg => msg.uid > maxUid)
                .sort((a, b) => a.uid - b.uid)
                .slice(-20);
            self.getBody({
                folder: folder,
                messages: fetch,
                notifyNew: folder.type === FOLDER_TYPE_INBOX
            }).catch(self._dialog.error);
        }
    }

    function handleDeletedMessages(folder, uids) {
        folder.uids = _.difference(folder.uids, uids);
        uids.forEach(uid => {
            const message = _.findWhere(folder.messages, { uid });
            if (!message) {
                return;
            }
            self.deleteMessage({
                folder: folder,
                message: message,
                localOnly: true
            }).catch(self._dialog.error);
        });
    }

    function handleFlagUpdates(folder, changedMsgs) {
        changedMsgs.forEach(changedMsg => {
            if (!changedMsg.uid || !changedMsg.flags) {
                return;
            }
            const message = _.findWhere(folder.messages, { uid: changedMsg.uid });
            if (!message || !message.bodyParts) {
                return;
            }
            message.answered = changedMsg.flags.indexOf('\\Answered') > -1;
            message.unread = changedMsg.flags.indexOf('\\Seen') === -1;
            message.modseq = changedMsg.modseq;
            self.setFlags({
                folder: folder,
                message: message,
                localOnly: true
            }).then(() => {
                const modseq = parseInt(changedMsg.modseq, 10);
                if (modseq > folder.modseq) {
                    folder.modseq = modseq;
                    return self._localStoreFolders();
                }
            }).catch(self._dialog.error);
        });
    }
};

/**
 * Updates the folder information from IMAP and persists changes.
 *
 * @return {Promise}
 */
Email.prototype._updateFolders = function () {
    const self = this;
    self.busy();

    return self._imapClient.listWellKnownFolders().then(function (wellKnownFolders) {
        let foldersChanged = false;
        const imapFolders = [];

        self._account.folders = self._account.folders || [];

        wellKnownFolders[config.outboxMailboxType] = [{
            name: config.outboxMailboxName,
            type: config.outboxMailboxType,
            path: config.outboxMailboxPath
        }];

        for (const folderType in wellKnownFolders) {
            if (wellKnownFolders.hasOwnProperty(folderType) && Array.isArray(wellKnownFolders[folderType])) {
                imapFolders.push(...wellKnownFolders[folderType]);
            }
        }

        const imapFolderPaths = _.pluck(imapFolders, 'path');
        const localFolderPaths = _.pluck(self._account.folders, 'path');
        const newFolderPaths = _.difference(imapFolderPaths, localFolderPaths);
        const removedFolderPaths = _.difference(localFolderPaths, imapFolderPaths);
        foldersChanged = !!newFolderPaths.length || !!removedFolderPaths.length;

        removedFolderPaths.forEach(removedPath => {
            const idx = self._account.folders.indexOf(_.findWhere(self._account.folders, { path: removedPath }));
            if (idx > -1) {
                self._account.folders.splice(idx, 1);
            }
        });

        newFolderPaths.forEach(newPath => {
            self._account.folders.push(_.findWhere(imapFolders, { path: newPath }));
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
        return self.getBody({
            folder: inbox,
            messages: inbox.messages.slice(-30)
        }).catch(self._dialog.error);
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
 * Mark messages as un-/read or un-/answered on IMAP.
 *
 * @param {Object} options.folder The folder where to find the message
 * @param {Number} options.uid The uid for which to change the flags
 * @param {Number} options.unread Un-/Read flag
 * @param {Number} options.answered Un-/Answered flag
 */
Email.prototype._imapMark = function (options) {
    const self = this;
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        options.path = options.folder.path;
        return self._imapClient.updateFlags(options);
    });
};

/**
 * Delete or move a message to trash depending on folder configuration.
 *
 * @param {Object} options.folder The folder where to find the message
 * @param {Number} options.uid The uid of the message
 * @return {Promise}
 */
Email.prototype._imapDeleteMessage = function (options) {
    const self = this;
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        const trash = _.findWhere(self._account.folders, { type: FOLDER_TYPE_TRASH });
        if (!trash || options.folder === trash) {
            return self._imapClient.deleteMessage({
                path: options.folder.path,
                uid: options.uid
            });
        }
        return self._imapMoveMessage({
            folder: options.folder,
            destination: trash,
            uid: options.uid
        });
    });
};

/**
 * Move a message on the server.
 *
 * @param {Object} options.folder The source folder
 * @param {Object} options.destination The destination folder
 * @param {Number} options.uid The message uid
 * @return {Promise}
 */
Email.prototype._imapMoveMessage = function (options) {
    const self = this;
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        return self._imapClient.moveMessage({
            path: options.folder.path,
            destination: options.destination.path,
            uid: options.uid
        });
    });
};

/**
 * Upload a built message to a folder.
 *
 * @param {Object} options.folder The folder where to find the message
 * @param {String} options.message The RFC2822 raw message
 */
Email.prototype._imapUploadMessage = function (options) {
    const self = this;
    return self._imapClient.uploadMessage({
        path: options.folder.path,
        message: options.message
    });
};

/**
 * Fetch messages from IMAP.
 *
 * @param {Object} options.messages Messages to fetch
 * @param {Object} options.folder Folder context
 * @return {Promise}
 */
Email.prototype._fetchMessages = function (options) {
    const self = this;
    const messages = options.messages;
    const folder = options.folder;

    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        return self._imapClient.listMessages({
            path: folder.path,
            uids: _.pluck(messages, MSG_ATTR_UID)
        });
    }).then(function (msgs) {
        msgs.forEach(msg => {
            msg.attachments = msg.bodyParts.filter(bp => bp.type === MSG_PART_TYPE_ATTACHMENT);
        });

        const jobs = msgs.map(message => {
            const contentParts = message.bodyParts.filter(bp => bp.type !== MSG_PART_TYPE_ATTACHMENT || (bp.type === MSG_PART_TYPE_ATTACHMENT && bp.id));
            const attachmentParts = message.bodyParts.filter(bp => bp.type === MSG_PART_TYPE_ATTACHMENT && !bp.id);
            if (!contentParts.length) {
                return Promise.resolve();
            }
            return self._getBodyParts({
                folder: folder,
                uid: message.uid,
                bodyParts: contentParts
            }).then(parsedBodyParts => {
                message.bodyParts = parsedBodyParts.concat(attachmentParts);
                return self._localStoreMessages({
                    folder: folder,
                    emails: [message]
                });
            }).catch(err => {
                if (err.hide) {
                    return;
                }
                throw err;
            });
        });

        return Promise.all(jobs);
    }).then(function () {
        const highestModseq = Math.max.apply(null, _.pluck(messages, MSG_ATTR_MODSEQ).map(modseq => parseInt(modseq, 10)));
        if (highestModseq > folder.modseq) {
            folder.modseq = highestModseq;
            return self._localStoreFolders();
        }
    }).then(function () {
        updateUnreadCount(folder);
        return messages;
    });
};

/**
 * Retrieve body parts for a message.
 *
 * @param {Object} options.folder Folder context
 * @param {Number} options.uid Message uid
 * @param {Array} options.bodyParts Body parts to retrieve
 * @return {Promise}
 */
Email.prototype._getBodyParts = function (options) {
    const self = this;
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        options.path = options.folder.path;
        return self._imapClient.getBodyParts(options);
    }).then(function () {
        if (options.bodyParts.filter(bp => !(bp.raw || bp.content)).length) {
            const error = new Error('Can not get the contents of this message. It has already been deleted!');
            error.hide = true;
            throw error;
        }
        return self._parse(options);
    });
};

/**
 * Parse an email using the mail reader.
 *
 * @param {Object} options Options for mailreader
 * @return {Promise}
 */
Email.prototype._parse = function (options) {
    const self = this;
    return new Promise(function (resolve, reject) {
        self._mailreader.parse(options, function (err, root) {
            if (err) {
                reject(err);
            } else {
                resolve(root);
            }
        });
    });
};

/**
 * Upload a message to the Sent folder if required.
 *
 * @param {Object} options.message The RFC2822 message
 */
Email.prototype._uploadToSent = function (options) {
    const self = this;
    self.busy();
    return Promise.resolve().then(function () {
        const sentFolder = _.findWhere(self._account.folders, { type: FOLDER_TYPE_SENT });
        if (self.ignoreUploadOnSent || !sentFolder || !options.message) {
            return;
        }
        return self._imapUploadMessage({
            folder: sentFolder,
            message: options.message
        });
    }).then(function () {
        self.done();
    }).catch(function (err) {
        self.done();
        throw err;
    });
};

/**
 * Verify client is online.
 */
Email.prototype.checkOnline = function () {
    if (!this._account.online) {
        const err = new Error('Client is currently offline!');
        err.code = 42;
        throw err;
    }
};

/**
 * Determines if Sent folder upload can be ignored based on hostname.
 *
 * @param {String} hostname The hostname to check
 * @return {Boolean}
 */
Email.prototype.checkIgnoreUploadOnSent = function (hostname) {
    for (let i = 0; i < config.ignoreUploadOnSentDomains.length; i++) {
        if (config.ignoreUploadOnSentDomains[i].test(hostname)) {
            return true;
        }
    }
    return false;
};

/**
 * Returns online status.
 */
Email.prototype.isOnline = function () {
    return navigator.onLine;
};

/**
 * Extracts a message body from its parts.
 *
 * @param {Object} message DTO
 * @return {Promise}
 */
Email.prototype._extractBody = function (message) {
    const self = this;
    return Promise.resolve().then(function () {
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

        const body = _.pluck(filterBodyParts(root, MSG_PART_TYPE_TEXT), MSG_ATTR_CONTENT).join('\n');
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
            const cleanedBody = (clearSignedMatch[1] || '').replace(/^- /gm, '');
            return finalizeBody(cleanedBody, root);
        }

        if (!message.signed) {
            return finalizeBody(body, root);
        }

        return self._checkSignatures(message).then(function (signaturesValid) {
            message.signed = typeof signaturesValid !== 'undefined';
            message.signaturesValid = signaturesValid;
            finalizeBody(body, root);
        });
    });

    function finalizeBody(bodyContent, root) {
        message.body = bodyContent;
        if (!message.clearSignedMessage) {
            message.attachments = filterBodyParts(root, MSG_PART_TYPE_ATTACHMENT);
            message.html = _.pluck(filterBodyParts(root, MSG_PART_TYPE_HTML), MSG_ATTR_CONTENT).join('\n');
            inlineExternalImages(message);
        }
    }
};

/**
 * Updates a folder's unread count.
 *
 * @param {Object} folder Folder object
 * @param {Boolean} countAllMessages If true, count all messages (outbox)
 */
function updateUnreadCount(folder, countAllMessages) {
    folder.count = countAllMessages ? folder.messages.length : _.filter(folder.messages, msg => msg.unread).length;
}

/**
 * Recursively filters body parts by type.
 *
 * @param {Array} bodyParts Body parts array
 * @param {String} type Desired type
 * @param {Array} [result] Accumulator for recursion
 * @return {Array}
 */
function filterBodyParts(bodyParts, type, result) {
    const res = result || [];
    bodyParts.forEach(part => {
        if (part.type === type) {
            res.push(part);
        } else if (Array.isArray(part.content)) {
            filterBodyParts(part.content, type, res);
        }
    });
    return res;
}

/**
 * Inlines external images referenced by CID in HTML.
 *
 * @param {Object} message DTO
 */
function inlineExternalImages(message) {
    message.html = message.html.replace(/(<img[^>]+\bsrc=['"])cid:([^'">]+)(['"])/ig, function (match, prefix, src, suffix) {
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