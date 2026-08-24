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
//
// Constants
//
//

var FOLDER_DB_TYPE = 'folders';

var SYNC_TYPE_NEW = 'new';
var SYNC_TYPE_DELETED = 'deleted';
var SYNC_TYPE_MSGS = 'messages';

// well known folders
var FOLDER_TYPE_INBOX = 'Inbox';
var FOLDER_TYPE_SENT = 'Sent';
var FOLDER_TYPE_DRAFTS = 'Drafts';
var FOLDER_TYPE_TRASH = 'Trash';
var FOLDER_TYPE_FLAGGED = 'Flagged';

var MSG_ATTR_UID = 'uid';
var MSG_ATTR_MODSEQ = 'modseq';
var MSG_PART_ATTR_CONTENT = 'content';
var MSG_PART_TYPE_ATTACHMENT = 'attachment';
var MSG_PART_TYPE_ENCRYPTED = 'encrypted';
var MSG_PART_TYPE_SIGNED = 'signed';
var MSG_PART_TYPE_TEXT = 'text';
var MSG_PART_TYPE_HTML = 'html';

//
//
// Email Service
//
//

/**
 * High-level data access object that orchestrates everything around the handling of encrypted mails:
 * PGP de-/encryption, receiving via IMAP, sending via SMTP, MIME parsing, local db persistence
 *
 * @param {Object} keychain The keychain DAO handles keys transparently
 * @param {Object} pgp Orchestrates decryption
 * @param {Object} devicestorage Handles persistence to the local indexed db
 * @param {Object} pgpbuilder Generates and encrypts MIME and SMTP messages
 * @param {Object} mailreader Parses MIME messages received from IMAP
 * @param {Object} dialog Dialog service
 * @param {Object} appConfig Application configuration
 * @param {Object} auth Authentication service
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

//
//
// Public API
//
//

/**
 * Initializes the email dao
 * @param {Object} options
 * @param {Object} options.account Account configuration
 * @return {Promise}
 */
Email.prototype.init = function(options) {
    var self = this;

    self._account = options.account;
    self._account.busy = 0;
    self._account.online = false;
    self._account.loggingIn = false;

    return self._devicestorage.listItems(FOLDER_DB_TYPE, true).then(function(stored) {
        self._account.folders = stored[0] || [];
        return self._initFolders();
    });
};

/**
 * Unlocks the keychain
 * @param {Object} options
 * @param {Object} options.keypair Existing keypair if available
 * @param {String} options.passphrase Passphrase for key decryption
 * @param {String} options.realname User's real name
 * @return {Promise}
 */
Email.prototype.unlock = function(options) {
    var self = this,
        generatedKeypair;

    if (options.keypair) {
        return handleExistingKeypair(options.keypair);
    }

    return self._pgp.generateKeys({
        emailAddress: self._account.emailAddress,
        realname: options.realname,
        keySize: self._account.asymKeySize,
        passphrase: options.passphrase
    }).then(function(keypair) {
        generatedKeypair = keypair;
        return self._pgp.importKeys({
            passphrase: options.passphrase,
            privateKeyArmored: generatedKeypair.privateKeyArmored,
            publicKeyArmored: generatedKeypair.publicKeyArmored
        });
    }).then(function() {
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
        return new Promise(function(resolve) {
            var privKeyParams = self._pgp.getKeyParams(keypair.privateKey.encryptedKey);
            var pubKeyParams = self._pgp.getKeyParams(keypair.publicKey.publicKey);

            if (!keypair.privateKey._id || keypair.privateKey._id !== keypair.publicKey._id || keypair.privateKey._id !== privKeyParams._id || keypair.publicKey._id !== pubKeyParams._id) {
                throw new Error('Key IDs dont match!');
            }

            var matchingPrivUserId = _.findWhere(privKeyParams.userIds, {
                emailAddress: self._account.emailAddress
            });
            var matchingPubUserId = _.findWhere(pubKeyParams.userIds, {
                emailAddress: self._account.emailAddress
            });

            if (!matchingPrivUserId || !matchingPubUserId || keypair.privateKey.userId !== self._account.emailAddress || keypair.publicKey.userId !== self._account.emailAddress) {
                throw new Error('User IDs dont match!');
            }

            resolve();
        }).then(function() {
            return self._pgp.importKeys({
                passphrase: options.passphrase,
                privateKeyArmored: keypair.privateKey.encryptedKey,
                publicKeyArmored: keypair.publicKey.publicKey
            }).then(function() {
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
 * Opens a folder in IMAP
 * @param {Object} options
 * @param {Object} options.folder Folder to open
 * @return {Promise}
 */
Email.prototype.openFolder = function(options) {
    var self = this;
    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        if (options.folder.path !== config.outboxMailboxPath) {
            return self._imapClient.selectMailbox({
                path: options.folder.path
            });
        }
    });
};

/**
 * Delete a message
 * @param {Object} options
 * @param {Object} options.folder Folder containing message
 * @param {Object} options.message Message to delete
 * @param {Boolean} options.localOnly Only delete locally
 * @return {Promise}
 */
Email.prototype.deleteMessage = function(options) {
    var self = this,
        folder = options.folder,
        message = options.message;

    self.busy();
    folder.messages.splice(folder.messages.indexOf(message), 1);

    if (options.localOnly || options.folder.path === config.outboxMailboxPath) {
        return deleteLocal().then(done).catch(done);
    }

    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        return self._imapDeleteMessage({
            folder: folder,
            uid: message.uid
        });
    }).then(function() {
        return deleteLocal();
    }).then(done).catch(done);

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
 * Updates a message's flags
 * @param {Object} options
 * @param {Object} options.folder Folder containing message
 * @param {Object} options.message Message to update
 * @param {Boolean} options.localOnly Only update locally
 * @return {Promise}
 */
Email.prototype.setFlags = function(options) {
    var self = this,
        folder = options.folder,
        message = options.message;

    if (folder.messages.indexOf(message) < 0) {
        return new Promise(function(resolve) {
            resolve();
        });
    }

    self.busy();

    if (options.localOnly || options.folder.path === config.outboxMailboxPath) {
        return markStorage().then(done).catch(done);
    }

    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        return self._imapMark({
            folder: folder,
            uid: options.message.uid,
            unread: options.message.unread,
            answered: options.message.answered,
            flagged: options.message.flagged
        });
    }).then(function() {
        return markStorage();
    }).then(done).catch(done);

    function markStorage() {
        return self._localListMessages({
            folder: folder,
            uid: options.message.uid
        }).then(function(storedMessages) {
            var storedMessage = storedMessages[0];

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
 * Moves a message to another folder
 * @param {Object} options
 * @param {Object} options.folder Origin folder
 * @param {Object} options.destination Destination folder
 * @param {Object} options.message Message to move
 * @return {Promise}
 */
Email.prototype.moveMessage = function(options) {
    var self = this,
        folder = options.folder,
        destination = options.destination,
        message = options.message;

    self.busy();
    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        folder.messages.splice(folder.messages.indexOf(message), 1);

        return self._imapMoveMessage({
            folder: folder,
            destination: destination,
            uid: message.uid
        }).catch(function(err) {
            folder.messages.unshift(message);
            done(err);
        });
    }).then(function() {
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
 * Streams message content
 * @param {Object} options
 * @param {Array} options.messages Messages to fetch
 * @param {Object} options.folder IMAP folder
 * @param {Boolean} options.notifyNew Whether to notify for new messages
 * @return {Promise}
 */
Email.prototype.getBody = function(options) {
    var self = this,
        messages = options.messages,
        folder = options.folder;

    messages = messages.filter(function(message) {
        return !(message.loadingBody || typeof message.body !== 'undefined');
    });

    if (!messages.length) {
        return new Promise(function(resolve) {
            resolve();
        });
    }

    messages.forEach(function(message) {
        message.loadingBody = true;
    });

    self.busy();

    var loadedMessages;

    return self._localListMessages({
        folder: folder,
        uid: _.pluck(messages, MSG_ATTR_UID)
    }).then(function(localMessages) {
        loadedMessages = localMessages;

        var localUids = _.pluck(localMessages, MSG_ATTR_UID);
        var needsImapFetch = messages.filter(function(msg) {
            return !_.contains(localUids, msg.uid);
        });
        return needsImapFetch;

    }).then(function(needsImapFetch) {
        if (!needsImapFetch.length) {
            return loadedMessages;
        }

        return self._fetchMessages({
            messages: needsImapFetch,
            folder: folder
        }).then(function(imapMessages) {
            loadedMessages = loadedMessages.concat(imapMessages);
        }).catch(function(err) {
            axe.error('Can not fetch messages from IMAP. Reason: ' + err.message + (err.stack ? ('\n' + err.stack) : ''));

            needsImapFetch.forEach(function(message) {
                message.loadingBody = false;
            });

            messages = _.difference(messages, needsImapFetch);
        });
    }).then(function() {
        messages.forEach(function(message) {
            var loadedMessage = _.findWhere(loadedMessages, {
                uid: message.uid
            });
            _.extend(message, loadedMessage);
        });
    }).then(function() {
        var jobs = [];
        messages.forEach(function(message) {
            var job = self._extractBody(message).catch(function(err) {
                axe.error('Can extract body for message uid ' + message.uid + ' . Reason: ' + err.message + (err.stack ? ('\n' + err.stack) : ''));
            });
            jobs.push(job);
        });

        return Promise.all(jobs);
    }).then(function() {
        done();

        if (options.notifyNew && messages.length) {
            self.onIncomingMessage(messages);
        }

        return messages;
    }).catch(function(err) {
        done();
        throw err;
    });

    function done() {
        messages.forEach(function(message) {
            message.loadingBody = false;
        });
        self.done();
    }
};

Email.prototype._checkSignatures = function(message) {
    var self = this;
    return self._keychain.getReceiverPublicKey(message.from[0].address).then(function(senderPublicKey) {
        var senderKey = senderPublicKey ? senderPublicKey.publicKey : undefined;
        if (message.clearSignedMessage) {
            return self._pgp.verifyClearSignedMessage(message.clearSignedMessage, senderKey);
        } else if (message.signedMessage && message.signature) {
            return self._pgp.verifySignedMessage(message.signedMessage, message.signature, senderKey);
        }
    });
};

/**
 * Retrieves an attachment
 * @param {Object} options
 * @param {Object} options.folder Folder containing message
 * @param {Number} options.uid Message UID
 * @param {Object} options.attachment Attachment to fetch
 * @return {Promise}
 */
Email.prototype.getAttachment = function(options) {
    var self = this,
        attachment = options.attachment;

    attachment.busy = true;
    return self._getBodyParts({
        folder: options.folder,
        uid: options.uid,
        bodyParts: [attachment]
    }).then(function(parsedBodyParts) {
        attachment.busy = false;
        attachment.content = parsedBodyParts[0].content;
        return attachment;
    }).catch(function(err) {
        attachment.busy = false;
        throw err;
    });
};

/**
 * Decrypts a message
 * @param {Object} options
 * @param {Object} options.message Message to decrypt
 * @return {Promise}
 */
Email.prototype.decryptBody = function(options) {
    var self = this,
        message = options.message,
        encryptedNode;

    if (!message.bodyParts || message.decryptingBody || !message.body || !message.encrypted || message.decrypted) {
        return new Promise(function(resolve) {
            resolve(message);
        });
    }

    message.decryptingBody = true;
    self.busy();

    return self._keychain.getReceiverPublicKey(message.from[0].address).then(function(senderPublicKey) {
        encryptedNode = filterBodyParts(message.bodyParts, MSG_PART_TYPE_ENCRYPTED)[0];
        var senderKey = senderPublicKey ? senderPublicKey.publicKey : undefined;
        return self._pgp.decrypt(encryptedNode.content, senderKey);
    }).then(function(pt) {
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
        return self._parse({
            bodyParts: [encryptedNode]
        }).then(handleRaw);
    }).then(function() {
        self.done();
        message.decryptingBody = false;
        return message;
    }).catch(function(err) {
        self.done();
        message.decryptingBody = false;
        message.body = err.message;
        message.decrypted = true;
        return message;
    });

    function handleRaw(root) {
        if (message.signed) {
            return setBody(root);
        }

        var signedRoot = filterBodyParts(root, MSG_PART_TYPE_SIGNED)[0];
        if (!signedRoot) {
            return setBody(root);
        }

        message.signedMessage = signedRoot.signedMessage;
        message.signature = signedRoot.signature;
        root = signedRoot.content;

        return self._checkSignatures(message).then(function(signaturesValid) {
            message.signed = typeof signaturesValid !== 'undefined';
            message.signaturesValid = signaturesValid;
            return setBody(root);
        });
    }

    function setBody(root) {
        message.body = _.pluck(filterBodyParts(root, MSG_PART_TYPE_TEXT), MSG_PART_ATTR_CONTENT).join('\n');
        message.html = _.pluck(filterBodyParts(root, MSG_PART_TYPE_HTML), MSG_PART_ATTR_CONTENT).join('\n');
        message.attachments = _.reject(filterBodyParts(root, MSG_PART_TYPE_ATTACHMENT), function(attmt) {
            return attmt.mimeType === "application/pgp-signature";
        });
        inlineExternalImages(message);
        message.decrypted = true;
        return message;
    }
};

/**
 * Sends an encrypted message
 * @param {Object} options
 * @param {Object} options.email Message to send
 * @param {Object} options.smtpclient SMTP client (for testing)
 * @param {Array} options.email.publicKeysArmored Public keys for encryption
 * @param {Object} mailer Mailer instance (for testing)
 * @return {Promise}
 */
Email.prototype.sendEncrypted = function(options, mailer) {
    return this._sendGeneric({
        encrypt: true,
        smtpclient: options.smtpclient,
        mail: options.email,
        publicKeysArmored: options.email.publicKeysArmored
    }, mailer);
};

/**
 * Sends a plaintext message
 * @param {Object} options
 * @param {Object} options.email Message to send
 * @param {Object} options.smtpclient SMTP client (for testing)
 * @param {Object} mailer Mailer instance (for testing)
 * @return {Promise}
 */
Email.prototype.sendPlaintext = function(options, mailer) {
    options.email.body += str.signature + config.keyServerUrl + '/' + this._account.emailAddress;
    return this._sendGeneric({
        smtpclient: options.smtpclient,
        mail: options.email
    }, mailer);
};

/**
 * Generic send function
 * @param {Object} options
 * @param {Boolean} options.encrypt Whether to encrypt
 * @param {Object} options.smtpclient SMTP client
 * @param {Object} options.mail Message to send
 * @param {Array} options.publicKeysArmored Public keys for encryption
 * @param {Object} mailer Mailer instance
 * @return {Promise}
 */
Email.prototype._sendGeneric = function(options, mailer) {
    var self = this;
    self.busy();
    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        return self._auth.getCredentials();
    }).then(function(credentials) {
        self.ignoreUploadOnSent = self.checkIgnoreUploadOnSent(credentials.smtp.host);
        credentials.smtp.tlsWorkerPath = config.workerPath + '/tcp-socket-tls-worker.min.js';
        self._pgpMailer = (mailer || new PgpMailer(credentials.smtp, self._pgpbuilder));
        self._pgpMailer.onCert = self._auth.handleCertificateUpdate.bind(self._auth, 'smtp', self._sendGeneric.bind(self, options), self._dialog.error);
    }).then(function() {
        return self._pgpMailer.send(options);
    }).then(function(rfcText) {
        return self._uploadToSent({
            message: rfcText
        }).catch(function() {});
    }).then(done).catch(done);

    function done(err) {
        self.done();
        if (err) {
            throw err;
        }
    }
};

/**
 * Encrypts a message
 * @param {Object} options
 * @param {Object} options.email Message to encrypt
 * @return {Promise}
 */
Email.prototype.encrypt = function(options) {
    var self = this;
    self.busy();
    return self._pgpbuilder.encrypt(options).then(function(message) {
        self.done();
        return message;
    });
};

/**
 * Refreshes the outbox contents
 * @return {Promise}
 */
Email.prototype.refreshOutbox = function() {
    var outbox = _.findWhere(this._account.folders, {
        type: config.outboxMailboxType
    });

    return this._localListMessages({
        folder: outbox,
        exactmatch: false
    }).then(function(storedMessages) {
        var storedUids = _.pluck(storedMessages, MSG_ATTR_UID),
            memoryUids = _.pluck(outbox.messages, MSG_ATTR_UID),
            newUids = _.difference(storedUids, memoryUids),
            removedUids = _.difference(memoryUids, storedUids);

        _.filter(storedMessages, function(msg) {
            return _.contains(newUids, msg.uid);
        }).forEach(function(newMessage) {
            outbox.messages.push(newMessage);
        });

        _.filter(outbox.messages, function(msg) {
            return _.contains(removedUids, msg.uid);
        }).forEach(function(removedMessage) {
            var index = outbox.messages.indexOf(removedMessage);
            outbox.messages.splice(index, 1);
        });

        updateUnreadCount(outbox, true);
    });
};

//
//
// Event Handlers
//
//

/**
 * Handles connection events
 * @param {Object} imap IMAP client instance (for testing)
 * @return {Promise}
 */
Email.prototype.onConnect = function(imap) {
    var self = this;

    if (!self.isOnline()) {
        return new Promise(function(resolve) {
            resolve();
        });
    }

    self._account.loggingIn = true;

    return self._auth.getCredentials().then(function(credentials) {
        credentials.imap.maxUpdateSize = config.imapUpdateBatchSize;
        credentials.imap.tlsWorkerPath = config.workerPath + '/tcp-socket-tls-worker.min.js';
        credentials.imap.compressionWorkerPath = config.workerPath + '/browserbox-compression-worker.min.js';

        self._imapClient = (imap || new ImapClient(credentials.imap));

        self._imapClient.onError = onConnectionError;
        self._imapClient.onCert = self._auth.handleCertificateUpdate.bind(self._auth, 'imap', self.onConnect.bind(self), self._dialog.error);
        self._imapClient.onSyncUpdate = self._onSyncUpdate.bind(self);
    }).then(function() {
        return self._imapClient.login();
    }).then(function() {
        self._account.loggingIn = false;
        return self._updateFolders();
    }).then(function() {
        var mailboxCache = {};
        self._account.folders.forEach(function(folder) {
            var uids = folder.uids.sort(function(a, b) {
                return a - b;
            });
            var lastUid = uids[uids.length - 1];

            mailboxCache[folder.path] = {
                exists: lastUid,
                uidNext: lastUid + 1,
                uidlist: uids,
                highestModseq: '' + folder.modseq
            };
        });
        self._imapClient.mailboxCache = mailboxCache;
        self._account.online = true;
    }).then(function() {
        var inbox = _.findWhere(self._account.folders, {
            type: FOLDER_TYPE_INBOX
        });

        if (!inbox) {
            return;
        }

        return self.openFolder({
            folder: inbox
        }).then(function() {
            self._imapClient.listenForChanges({
                path: inbox.path
            }, function() {});
        });
    });

    function onConnectionError(error) {
        axe.debug('IMAP connection error, disconnected. Reason: ' + error.message + (error.stack ? ('\n' + error.stack) : ''));

        if (!self.isOnline()) {
            return;
        }

        axe.debug('Attempting reconnect in ' + config.reconnectInterval / 1000 + ' seconds.');

        setTimeout(function() {
            axe.debug('Reconnecting the IMAP stack');
            self.onConnect().catch(self._dialog.error);
        }, config.reconnectInterval);
    }
};

/**
 * Handles disconnection events
 * @return {Promise}
 */
Email.prototype.onDisconnect = function() {
    if (this._imapClient) {
        this._imapClient.stopListeningForChanges(function() {});
        this._imapClient.logout(function() {});
    }

    this._account.online = false;
    this._imapClient = undefined;
    this._pgpMailer = undefined;

    return new Promise(function(resolve) {
        resolve();
    });
};

/**
 * Handles IMAP sync updates
 * @param {Object} options
 * @param {String} options.type Update type
 * @param {String} options.path Mailbox path
 * @param {Array} options.list Update data
 * @return {Promise}
 */
Email.prototype._onSyncUpdate = function(options) {
    var self = this,
        uids = options.list;

    var folder = _.findWhere(self._account.folders, {
        path: options.path
    });

    if (!folder) {
        return;
    }

    if (options.type === SYNC_TYPE_NEW) {
        uids = _.difference(uids, folder.uids);
        var maxUid = folder.uids.length ? Math.max.apply(null, folder.uids) : 0;

        Array.prototype.push.apply(folder.uids, uids);
        self._localStoreFolders();

        Array.prototype.push.apply(folder.messages, uids.map(function(uid) {
            return {
                uid: uid
            };
        }));

        if (maxUid) {
            var fetch = _.filter(folder.messages, function(msg) {
                return msg.uid > maxUid;
            }).sort(function(a, b) {
                return a.uid - b.uid;
            }).slice(-20);

            self.getBody({
                folder: folder,
                messages: fetch,
                notifyNew: folder.type === FOLDER_TYPE_INBOX
            }).catch(self._dialog.error);
        }

    } else if (options.type === SYNC_TYPE_DELETED) {
        folder.uids = _.difference(folder.uids, uids);
        uids.forEach(function(uid) {
            var message = _.findWhere(folder.messages, {
                uid: uid
            });

            if (!message) {
                return;
            }

            self.deleteMessage({
                folder: folder,
                message: message,
                localOnly: true
            }).catch(self._dialog.error);
        });
    } else if (options.type === SYNC_TYPE_MSGS) {
        uids.forEach(function(changedMsg) {
            if (!changedMsg.uid || !changedMsg.flags) {
                return;
            }

            var message = _.findWhere(folder.messages, {
                uid: changedMsg.uid
            });

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
            }).then(function() {
                var modseq = parseInt(changedMsg.modseq, 10);
                if (modseq > folder.modseq) {
                    folder.modseq = modseq;
                    return self._localStoreFolders();
                }
            }).catch(self._dialog.error);
        });
    }
};

//
//
// Internal API
//
//

/**
 * Updates folder information from IMAP
 * @return {Promise}
 */
Email.prototype._updateFolders = function() {
    var self = this;

    self.busy();
    return self._imapClient.listWellKnownFolders().then(function(wellKnownFolders) {
        var foldersChanged = false,
            imapFolders = [];

        self._account.folders = self._account.folders || [];

        wellKnownFolders[config.outboxMailboxType] = [{
            name: config.outboxMailboxName,
            type: config.outboxMailboxType,
            path: config.outboxMailboxPath
        }];

        for (var folderType in wellKnownFolders) {
            if (wellKnownFolders.hasOwnProperty(folderType) && Array.isArray(wellKnownFolders[folderType])) {
                imapFolders = imapFolders.concat(wellKnownFolders[folderType]);
            }
        }

        var imapFolderPaths = _.pluck(imapFolders, 'path'),
            localFolderPaths = _.pluck(self._account.folders, 'path'),
            newFolderPaths = _.difference(imapFolderPaths, localFolderPaths),
            removedFolderPaths = _.difference(localFolderPaths, imapFolderPaths);

        foldersChanged = !!newFolderPaths.length || !!removedFolderPaths.length;

        removedFolderPaths.forEach(function(removedPath) {
            self._account.folders.splice(self._account.folders.indexOf(_.findWhere(self._account.folders, {
                path: removedPath
            })), 1);
        });

        newFolderPaths.forEach(function(newPath) {
            self._account.folders.push(_.findWhere(imapFolders, {
                path: newPath
            }));
        });

        var wellknownTypes = [
            FOLDER_TYPE_INBOX,
            FOLDER_TYPE_SENT,
            config.outboxMailboxType,
            FOLDER_TYPE_DRAFTS,
            FOLDER_TYPE_TRASH,
            FOLDER_TYPE_FLAGGED
        ];

        wellknownTypes.forEach(function(mbxType) {
            var wellknownFolder = _.findWhere(self._account.folders, {
                type: mbxType,
                wellknown: true
            });

            if (wellknownFolder) {
                return;
            }

            wellknownFolder = _.findWhere(self._account.folders, {
                type: mbxType
            });

            if (!wellknownFolder) {
                return;
            }

            wellknownFolder.wellknown = true;
            foldersChanged = true;
        });

        self._account.folders.sort(function(a, b) {
            if (a.wellknown && b.wellknown) {
                return wellknownTypes.indexOf(a.type) - wellknownTypes.indexOf(b.type);
            } else if (a.wellknown && !b.wellknown) {
                return -1;
            } else if (!a.wellknown && b.wellknown) {
                return 1;
            } else {
                return a.path.toLowerCase().localeCompare(b.path.toLowerCase());
            }
        });

        if (foldersChanged) {
            return self._localStoreFolders();
        }
    }).then(function() {
        return self._initFolders();
    }).then(function() {
        self.done();
    }).catch(function(err) {
        self.done();
        throw err;
    });
};

Email.prototype._initFolders = function() {
    var self = this;

    self._account.folders.forEach(function(folder) {
        folder.modseq = folder.modseq || 0;
        folder.count = folder.count || 0;
        folder.uids = folder.uids || [];
        folder.uids.sort(function(a, b) {
            return a - b;
        });
        folder.messages = folder.messages || folder.uids.map(function(uid) {
            return {
                uid: uid
            };
        });
    });

    var inbox = _.findWhere(self._account.folders, {
        type: FOLDER_TYPE_INBOX
    });
    if (inbox && inbox.messages.length) {
        return self.getBody({
            folder: inbox,
            messages: inbox.messages.slice(-30)
        }).catch(self._dialog.error);
    }
};

Email.prototype.busy = function() {
    this._account.busy++;
};

Email.prototype.done = function() {
    if (this._account.busy > 0) {
        this._account.busy--;
    }
};

//
//
// IMAP API
//
//

/**
 * Marks messages as un-/read or un-/answered on IMAP
 * @param {Object} options
 * @param {Object} options.folder Folder containing message
 * @param {Number} options.uid Message UID
 * @param {Boolean} options.unread Unread flag
 * @param {Boolean} options.answered Answered flag
 * @param {Boolean} options.flagged Flagged flag
 * @return {Promise}
 */
Email.prototype._imapMark = function(options) {
    var self = this;

    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        options.path = options.folder.path;
        return self._imapClient.updateFlags(options);
    });
};

/**
 * Deletes a message from IMAP
 * @param {Object} options
 * @param {Object} options.folder Folder containing message
 * @param {Number} options.uid Message UID
 * @return {Promise}
 */
Email.prototype._imapDeleteMessage = function(options) {
    var self = this;
    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        var trash = _.findWhere(self._account.folders, {
            type: FOLDER_TYPE_TRASH
        });

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
 * Moves a message on the server
 * @param {Object} options
 * @param {Object} options.folder Source folder
 * @param {Object} options.destination Destination folder
 * @param {Number} options.uid Message UID
 * @return {Promise}
 */
Email.prototype._imapMoveMessage = function(options) {
    var self = this;
    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        return self._imapClient.moveMessage({
            path: options.folder.path,
            destination: options.destination.path,
            uid: options.uid
        });
    });
};

/**
 * Uploads a built message to a folder
 * @param {Object} options
 * @param {Object} options.folder Target folder
 * @param {String} options.message RFC2822 message
 * @return {Promise}
 */
Email.prototype._imapUploadMessage = function(options) {
    var self = this;

    return self._imapClient.uploadMessage({
        path: options.folder.path,
        message: options.message
    });
};

/**
 * Fetches messages from IMAP
 * @param {Object} options
 * @param {Array} options.messages Messages to fetch
 * @param {Object} options.folder Source folder
 * @return {Promise}
 */
Email.prototype._fetchMessages = function(options) {
    var self = this,
        messages = options.messages,
        folder = options.folder;

    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        return self._imapClient.listMessages({
            path: folder.path,
            uids: _.pluck(messages, MSG_ATTR_UID)
        });
    }).then(function(msgs) {
        messages = msgs;
        messages.forEach(function(message) {
            message.attachments = message.bodyParts.filter(function(bodyPart) {
                return bodyPart.type === MSG_PART_TYPE_ATTACHMENT;
            });
        });

        var jobs = [];
        messages.forEach(function(message) {
            var contentParts = message.bodyParts.filter(function(bodyPart) {
                return bodyPart.type !== MSG_PART_TYPE_ATTACHMENT || (bodyPart.type === MSG_PART_TYPE_ATTACHMENT && bodyPart.id);
            });
            var attachmentParts = message.bodyParts.filter(function(bodyPart) {
                return bodyPart.type === MSG_PART_TYPE_ATTACHMENT && !bodyPart.id;
            });

            if (!contentParts.length) {
                return;
            }

            var job = self._getBodyParts({
                folder: folder,
                uid: message.uid,
                bodyParts: contentParts
            }).then(function(parsedBodyParts) {
                message.bodyParts = parsedBodyParts.concat(attachmentParts);
                return self._localStoreMessages({
                    folder: folder,
                    emails: [message]
                });
            }).catch(function(err) {
                if (err.hide) {
                    return;
                } else {
                    throw err;
                }
            });

            jobs.push(job);
        });

        return Promise.all(jobs);
    }).then(function() {
        var highestModseq = Math.max.apply(null, _.pluck(messages, MSG_ATTR_MODSEQ).map(function(modseq) {
            return parseInt(modseq, 10);
        }));
        if (highestModseq > folder.modseq) {
            folder.modseq = highestModseq;
            return self._localStoreFolders();
        }
    }).then(function() {
        updateUnreadCount(folder);
        return messages;
    });
};

/**
 * Streams an email message's body parts
 * @param {Object} options
 * @param {Object} options.folder Source folder
 * @param {Number} options.uid Message UID
 * @param {Array} options.bodyParts Body parts to fetch
 * @return {Promise}
 */
Email.prototype._getBodyParts = function(options) {
    var self = this;
    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        options.path = options.folder.path;
        return self._imapClient.getBodyParts(options);
    }).then(function() {
        if (options.bodyParts.filter(function(bodyPart) {
                return !(bodyPart.raw || bodyPart.content);
            }).length) {
            var error = new Error('Can not get the contents of this message. It has already been deleted!');
            error.hide = true;
            throw error;
        }

        return self._parse(options);
    });
};

//
//
// Local Storage API
//
//

/**
 * Persists folder information to device storage
 * @return {Promise}
 */
Email.prototype._localStoreFolders = function() {
    var folders = this._account.folders.map(function(folder) {
        return {
            name: folder.name,
            path: folder.path,
            type: folder.type,
            modseq: folder.modseq,
            wellknown: !!folder.wellknown,
            uids: folder.uids
        };
    });

    return this._devicestorage.storeList([folders], FOLDER_DB_TYPE);
};

/**
 * Lists messages from local storage
 * @param {Object} options
 * @param {Object} options.folder Folder to list
 * @param {Number|Array} options.uid Message UID(s)
 * @return {Promise}
 */
Email.prototype._localListMessages = function(options) {
    var query;

    var needsExactMatch = typeof options.exactmatch === 'undefined' ? true : options.exactmatch;

    if (Array.isArray(options.uid)) {
        query = options.uid.map(function(uid) {
            return 'email_' + options.folder.path + (uid ? '_' + uid : '');
        });
    } else {
        query = 'email_' + options.folder.path + (options.uid ? '_' + options.uid : '');
    }

    return this._devicestorage.listItems(query, needsExactMatch);
};

/**
 * Stores messages to local storage
 * @param {Object} options
 * @param {Object} options.folder Target folder
 * @param {Array} options.emails Messages to store
 * @return {Promise}
 */
Email.prototype._localStoreMessages = function(options) {
    var dbType = 'email_' + options.folder.path;
    return this._devicestorage.storeList(options.emails, dbType);
};

/**
 * Deletes messages from local storage
 * @param {Object} options
 * @param {Object} options.folder Source folder
 * @param {Number} options.uid Message UID
 * @param {String} options.id Message ID
 * @return {Promise}
 */
Email.prototype._localDeleteMessage = function(options) {
    var path = options.folder.path,
        uid = options.uid,
        id = options.id;

    if (!path || !(uid || id)) {
        return new Promise(function() {
            throw new Error('Invalid options!');
        });
    }

    var dbType = 'email_' + path + '_' + (uid || id);
    return this._devicestorage.removeList(dbType);
};

//
//
// Internal Helper Methods
//
//

/**
 * Extracts message body from body parts
 * @param {Object} message Message object
 * @return {Promise}
 */
Email.prototype._extractBody = function(message) {
    var self = this;

    return new Promise(function(resolve) {
        resolve();
    }).then(function() {
        if (message.encrypted) {
            message.body = filterBodyParts(message.bodyParts, MSG_PART_TYPE_ENCRYPTED)[0].content;
            return;
        }

        var root = message.bodyParts;

        if (message.signed) {
            var signedRoot = filterBodyParts(message.bodyParts, MSG_PART_TYPE_SIGNED)[0];
            message.signedMessage = signedRoot.signedMessage;
            message.signature = signedRoot.signature;
            root = signedRoot.content;
        }

        var body = _.pluck(filterBodyParts(root, MSG_PART_TYPE_TEXT), MSG_PART_ATTR_CONTENT).join('\n');

        var pgpInlineMatch = /^-{5}BEGIN PGP MESSAGE-{5}[\s\S]*-{5}END PGP MESSAGE-{5}$/im.exec(body);
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

        var clearSignedMatch = /^-{5}BEGIN PGP SIGNED MESSAGE-{5}\nHash:[ ][^\n]+\n(?:[A-Za-z]+:[ ][^\n]+\n)*\n([\s\S]*?)\n-{5}BEGIN PGP SIGNATURE-{5}[\S\s]*-{5}END PGP SIGNATURE-{5}$/im.exec(body);
        if (clearSignedMatch) {
            message.signed = true;
            message.clearSignedMessage = clearSignedMatch[0];
            body = (clearSignedMatch[1] || '').replace(/^- /gm, '');
        }

        if (!message.signed) {
            return setBody(body, root);
        }

        return self._checkSignatures(message).then(function(signaturesValid) {
            message.signed = typeof signaturesValid !== 'undefined';
            message.signaturesValid = signaturesValid;
            setBody(body, root);
        });
    });

    function setBody(body, root) {
        message.body = body;
        if (!message.clearSignedMessage) {
            message.attachments = filterBodyParts(root, MSG_PART_TYPE_ATTACHMENT);
            message.html = _.pluck(filterBodyParts(root, MSG_PART_TYPE_HTML), MSG_PART_ATTR_CONTENT).join('\n');
            inlineExternalImages(message);
        }
    }
};

/**
 * Parse an email using the mail reader
 * @param {Object} options
 * @param {Array} options.bodyParts Body parts to parse
 * @return {Promise}
 */
Email.prototype._parse = function(options) {
    var self = this;
    return new Promise(function(resolve, reject) {
        self._mailreader.parse(options, function(err, root) {
            if (err) {
                reject(err);
            } else {
                resolve(root);
            }
        });
    });
};

/**
 * Uploads a message to the sent folder
 * @param {Object} options
 * @param {String} options.message RFC2822 message
 * @return {Promise}
 */
Email.prototype._uploadToSent = function(options) {
    var self = this;
    self.busy();
    return new Promise(function(resolve) {
        resolve();
    }).then(function() {
        var sentFolder = _.findWhere(self._account.folders, {
            type: FOLDER_TYPE_SENT
        });

        if (self.ignoreUploadOnSent || !sentFolder || !options.message) {
            return;
        }

        return self._imapUploadMessage({
            folder: sentFolder,
            message: options.message
        });
    }).then(function() {
        self.done();
    }).catch(function(err) {
        self.done();
        throw err;
    });
};

/**
 * Checks if the client is online
 */
Email.prototype.checkOnline = function() {
    if (!this._account.online) {
        var err = new Error('Client is currently offline!');
        err.code = 42;
        throw err;
    }
};

/**
 * Checks whether we need to upload to the sent folder after sending
 * @param {String} hostname SMTP hostname
 * @return {Boolean}
 */
Email.prototype.checkIgnoreUploadOnSent = function(hostname) {
    for (var i = 0; i < config.ignoreUploadOnSentDomains.length; i++) {
        if (config.ignoreUploadOnSentDomains[i].test(hostname)) {
            return true;
        }
    }
    return false;
};

/**
 * Check if the user agent is online
 * @return {Boolean}
 */
Email.prototype.isOnline = function() {
    return navigator.onLine;
};

//
//
// Helper Functions
//
//

/**
 * Updates a folder's unread count
 * @param {Object} folder Folder object
 * @param {Boolean} countAllMessages Whether to count all messages
 */
function updateUnreadCount(folder, countAllMessages) {
    folder.count = countAllMessages ? folder.messages.length : _.filter(folder.messages, function(msg) {
        return msg.unread;
    }).length;
}

/**
 * Helper function that recursively traverses the body parts tree
 * @param {Array} bodyParts Body parts array
 * @param {String} type Type to look up
 * @param {Array} result Accumulator for results
 * @return {Array}
 */
function filterBodyParts(bodyParts, type, result) {
    result = result || [];
    bodyParts.forEach(function(part) {
        if (part.type === type) {
            result.push(part);
        } else if (Array.isArray(part.content)) {
            filterBodyParts(part.content, type, result);
        }
    });
    return result;
}

/**
 * Inlines external images in HTML content
 * @param {Object} message Message object
 */
function inlineExternalImages(message) {
    message.html = message.html.replace(/(<img[^>]+\bsrc=['"])cid:([^'">]+)(['"])/ig, function(match, prefix, src, suffix) {
        var localSource = '',
            payload = '';

        var internalReference = _.findWhere(message.attachments, {
            id: src
        });

        if (internalReference) {
            for (var i = 0; i < internalReference.content.byteLength; i++) {
                payload += String.fromCharCode(internalReference.content[i]);
            }

            try {
                localSource = 'data:application/octet-stream;base64,' + btoa(payload);
            } catch (e) {}
        }

        return prefix + localSource + suffix;
    });
}