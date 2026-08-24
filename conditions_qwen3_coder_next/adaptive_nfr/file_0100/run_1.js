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
 * Initializes the email dao:
 * - assigns _account
 * - initializes _account.folders with the content from memory
 *
 * @param {Object} options.account The user's account
 * @return {Promise}
 * @resolve {Object} keypair
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
 * Unlocks the keychain by either decrypting an existing private key or generating a new keypair
 * @param {Object} options.passphrase The passphrase to decrypt the private key
 * @param {Object} [options.keypair] Existing keypair to import
 * @param {String} [options.realname] Real name for key generation
 */
Email.prototype.unlock = function(options) {
    var self = this,
        generatedKeypair;

    if (options.keypair) {
        return self._handleExistingKeypair(options.keypair, options.passphrase);
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
    }).then(self._setPrivateKey.bind(self));

    function setPrivateKey(keypair) {
        self._pgpbuilder._privateKey = self._pgp._privateKey;
        return keypair;
    }
};

/**
 * Opens a folder in IMAP so that we can receive updates for it.
 * @param {Object} options.folder The folder to be opened
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
 * Delete a message from IMAP, disk and folder.messages.
 * @param {Object} options.folder The folder from which to delete the messages
 * @param {Object} options.message The message that should be deleted
 * @param {Boolean} options.localOnly Indicates if the message should not be removed from IMAP
 */
Email.prototype.deleteMessage = function(options) {
    var self = this,
        folder = options.folder,
        message = options.message;

    self.busy();
    folder.messages.splice(folder.messages.indexOf(message), 1);

    if (options.localOnly || options.folder.path === config.outboxMailboxPath) {
        return self._deleteLocal({
            folder: folder,
            uid: message.uid
        }).then(self._doneDelete.bind(self, folder, message)).catch(self._doneDelete.bind(self, folder, message));
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
        return self._deleteLocal({
            folder: folder,
            uid: message.uid
        });
    }).then(self._doneDelete.bind(self, folder, message)).catch(self._doneDelete.bind(self, folder, message));
};

/**
 * Updates a message's 'unread' and 'answered' flags
 * @param {Object} options.folder The origin folder
 * @param {Object} options.message The message that should change flags
 * @param {Boolean} [options.localOnly] Not synchronized with IMAP if true
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
        return self._markStorage({
            folder: folder,
            message: message
        }).then(self._doneFlags.bind(self, folder)).catch(self._doneFlags.bind(self, folder));
    }

    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        return self._imapMark({
            folder: folder,
            uid: message.uid,
            unread: message.unread,
            answered: message.answered,
            flagged: message.flagged
        });
    }).then(function() {
        return self._markStorage({
            folder: folder,
            message: message
        });
    }).then(self._doneFlags.bind(self, folder)).catch(self._doneFlags.bind(self, folder));
};

/**
 * Moves a message to another folder
 * @param {Object} options.folder The origin folder
 * @param {Object} options.destination The destination folder
 * @param {Object} options.message The message that should be moved
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
            throw err;
        });
    }).then(function() {
        return self._deleteLocal({
            folder: folder,
            uid: message.uid
        });
    }).then(self._doneMove.bind(self, folder)).catch(self._doneMove.bind(self, folder));
};

/**
 * Streams message content
 * @param {Object} options.messages The messages for which to retrieve the body
 * @param {Object} options.folder The IMAP folder
 * @param {Boolean} [options.notifyNew] Whether to notify on incoming messages
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

    return self._localListMessages({
        folder: folder,
        uid: messages.map(function(m) { return m.uid; })
    }).then(function(localMessages) {
        var localUids = localMessages.map(function(m) { return m.uid; });
        var needsImapFetch = messages.filter(function(msg) {
            return localUids.indexOf(msg.uid) === -1;
        });

        if (!needsImapFetch.length) {
            return self._processFetchedMessages(messages, localMessages, folder, options);
        }

        return self._fetchMessages({
            messages: needsImapFetch,
            folder: folder
        }).then(function(imapMessages) {
            localMessages = localMessages.concat(imapMessages);
            return self._processFetchedMessages(messages, localMessages, folder, options);
        }).catch(function(err) {
            axe.error('Can not fetch messages from IMAP. Reason: ' + err.message);

            needsImapFetch.forEach(function(message) {
                message.loadingBody = false;
            });

            return self._processFetchedMessages(messages, localMessages, folder, options);
        });
    });
};

Email.prototype._processFetchedMessages = function(messages, loadedMessages, folder, options) {
    messages.forEach(function(message) {
        var loadedMessage = loadedMessages.find(function(m) { return m.uid === message.uid; });

        if (loadedMessage) {
            Object.assign(message, loadedMessage);
        }
    });

    return Promise.all(messages.map(function(message) {
        return this._extractBody(message).catch(function(err) {
            axe.error('Can extract body for message uid ' + message.uid + ' . Reason: ' + err.message);
        });
    }, this)).then(function() {
        if (options.notifyNew && messages.length) {
            this.onIncomingMessage(messages);
        }
        return messages;
    }).finally(function() {
        messages.forEach(function(m) {
            m.loadingBody = false;
        });
        this.done();
    });
};

Email.prototype._doneDelete = function(folder, message, err) {
    this.done();
    updateUnreadCount(folder);

    if (err) {
        folder.messages.unshift(message);
        throw err;
    }
};

Email.prototype._doneFlags = function(folder, err) {
    this.done();
    updateUnreadCount(folder);
    if (err) {
        throw err;
    }
};

Email.prototype._doneMove = function(folder, err) {
    this.done();
    updateUnreadCount(folder);

    if (err) {
        throw err;
    }
};

Email.prototype._checkSignatures = function(message) {
    return this._keychain.getReceiverPublicKey(message.from[0].address).then(function(senderPublicKey) {
        var senderKey = senderPublicKey ? senderPublicKey.publicKey : undefined;

        if (message.clearSignedMessage) {
            return this._pgp.verifyClearSignedMessage(message.clearSignedMessage, senderKey);
        } else if (message.signedMessage && message.signature) {
            return this._pgp.verifySignedMessage(message.signedMessage, message.signature, senderKey);
        }
    }.bind(this));
};

/**
 * Retrieves an attachment matching a body part for a given uid and a folder
 * @param {Object} options.folder The folder where to find the attachment
 * @param {Number} options.uid The uid for the message the attachment body part belongs to
 * @param {Object} options.attachment The attachment body part to fetch and parse from IMAP
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
 * Decrypts a message and replaces sets the decrypted plaintext as the message's body, html, or attachment, respectively.
 * @param {Object} options.message The message
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
        }).then(self._handleDecryptedRaw.bind(self, message));
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
};

Email.prototype._handleDecryptedRaw = function(message, root) {
    if (message.signed) {
        return this._setBody(root, message);
    }

    var signedRoot = filterBodyParts(root, MSG_PART_TYPE_SIGNED)[0];
    if (!signedRoot) {
        return this._setBody(root, message);
    }

    message.signedMessage = signedRoot.signedMessage;
    message.signature = signedRoot.signature;
    root = signedRoot.content;

    return this._checkSignatures(message).then(function(signaturesValid) {
        message.signed = typeof signaturesValid !== 'undefined';
        message.signaturesValid = signaturesValid;
        return this._setBody(root, message);
    }.bind(this));
};

Email.prototype._setBody = function(root, message) {
    message.body = filterBodyParts(root, MSG_PART_TYPE_TEXT).map(function(p) { return p.content; }).join('\n');
    message.html = filterBodyParts(root, MSG_PART_TYPE_HTML).map(function(p) { return p.content; }).join('\n');
    message.attachments = filterBodyParts(root, MSG_PART_TYPE_ATTACHMENT).filter(function(attmt) {
        return attmt.mimeType !== "application/pgp-signature";
    });
    inlineExternalImages(message);
    message.decrypted = true;
    return message;
};

/**
 * Encrypted (if necessary) and sends a message with a predefined clear text greeting.
 * @param {Object} options.email The message to be sent
 * @param {Object} mailer an instance of the pgpmailer to be used for testing purposes only
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
 * Sends a signed message in the plain
 * @param {Object} options.email The message to be sent
 * @param {Object} mailer an instance of the pgpmailer to be used for testing purposes only
 */
Email.prototype.sendPlaintext = function(options, mailer) {
    options.email.body += str.signature + config.keyServerUrl + '/' + this._account.emailAddress;
    return this._sendGeneric({
        smtpclient: options.smtpclient,
        mail: options.email
    }, mailer);
};

/**
 * This funtion wraps error handling for sending via pgpMailer and uploading to imap.
 * @param {Object} options.email The message to be sent
 * @param {Object} mailer an instance of the pgpmailer to be used for testing purposes only
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
    }).then(function() {
        self.done();
    }).catch(function(err) {
        self.done();
        throw err;
    });
};

/**
 * Signs and encrypts a message
 * @param {Object} options.email The message to be encrypted
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
 * Synchronizes the outbox's contents from disk to memory.
 * @param {Object} options.folder The folder to synchronize
 */
Email.prototype.refreshOutbox = function() {
    var outbox = this._account.folders.find(function(f) {
        return f.type === config.outboxMailboxType;
    });

    return this._localListMessages({
        folder: outbox,
        exactmatch: false
    }).then(function(storedMessages) {
        var storedUids = storedMessages.map(function(m) { return m.uid; });
        var memoryUids = outbox.messages.map(function(m) { return m.uid; });
        var newUids = storedUids.filter(function(uid) { return memoryUids.indexOf(uid) === -1; });
        var removedUids = memoryUids.filter(function(uid) { return storedUids.indexOf(uid) === -1; });

        storedMessages.filter(function(msg) { return newUids.indexOf(msg.uid) !== -1; }).forEach(function(newMessage) {
            outbox.messages.push(newMessage);
        });

        outbox.messages.filter(function(msg) { return removedUids.indexOf(msg.uid) !== -1; }).forEach(function(removedMessage) {
            var index = outbox.messages.indexOf(removedMessage);
            outbox.messages.splice(index, 1);
        });

        updateUnreadCount(outbox, true);
    });
};

/**
 * This handler should be invoked when navigator.onLine === true.
 * @param {Object} imap an instance of the imap-client to be used for testing purposes only
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
        self._imapClient.onError = self._onConnectError.bind(self);
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
            var uids = folder.uids.slice().sort(function(a, b) { return a - b; });
            var lastUid = uids.length ? uids[uids.length - 1] : 0;

            mailboxCache[folder.path] = {
                exists: lastUid,
                uidNext: lastUid + 1,
                uidlist: uids,
                highestModseq: String(folder.modseq)
            };
        });
        self._imapClient.mailboxCache = mailboxCache;
        self._account.online = true;
    }).then(function() {
        var inbox = self._account.folders.find(function(f) { return f.type === FOLDER_TYPE_INBOX; });
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
};

Email.prototype._onConnectError = function(error) {
    axe.debug('IMAP connection error, disconnected. Reason: ' + error.message);

    if (!this.isOnline()) {
        return;
    }

    axe.debug('Attempting reconnect in ' + config.reconnectInterval / 1000 + ' seconds.');
    setTimeout(function() {
        this.onConnect().catch(this._dialog.error);
    }.bind(this), config.reconnectInterval);
};

/**
 * This handler should be invoked when navigator.onLine === false.
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

Email.prototype._onSyncUpdate = function(options) {
    var self = this,
        uids = options.list;

    var folder = self._account.folders.find(function(f) {
        return f.path === options.path;
    });

    if (!folder) {
        return;
    }

    if (options.type === SYNC_TYPE_NEW) {
        uids = uids.filter(function(uid) { return folder.uids.indexOf(uid) === -1; });
        var maxUid = folder.uids.length ? Math.max.apply(null, folder.uids) : 0;

        folder.uids.push.apply(folder.uids, uids);
        self._localStoreFolders();

        uids.forEach(function(uid) {
            folder.messages.push({ uid: uid });
        });

        if (maxUid) {
            var fetch = folder.messages.filter(function(msg) {
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
        folder.uids = folder.uids.filter(function(uid) { return uids.indexOf(uid) === -1; });
        uids.forEach(function(uid) {
            var message = folder.messages.find(function(m) { return m.uid === uid; });
            if (message) {
                self.deleteMessage({
                    folder: folder,
                    message: message,
                    localOnly: true
                }).catch(self._dialog.error);
            }
        });
    } else if (options.type === SYNC_TYPE_MSGS) {
        uids.forEach(function(changedMsg) {
            if (!changedMsg.uid || !changedMsg.flags) {
                return;
            }

            var message = folder.messages.find(function(m) { return m.uid === changedMsg.uid; });
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

/**
 * Updates the folder information from imap (if we're online).
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

        var imapFolderPaths = imapFolders.map(function(f) { return f.path; });
        var localFolderPaths = self._account.folders.map(function(f) { return f.path; });
        var newFolderPaths = localFolderPaths.filter(function(path) { return imapFolderPaths.indexOf(path) === -1; });
        var removedFolderPaths = imapFolderPaths.filter(function(path) { return localFolderPaths.indexOf(path) === -1; });

        foldersChanged = newFolderPaths.length > 0 || removedFolderPaths.length > 0;

        removedFolderPaths.forEach(function(removedPath) {
            var folder = self._account.folders.find(function(f) { return f.path === removedPath; });
            if (folder) {
                self._account.folders.splice(self._account.folders.indexOf(folder), 1);
            }
        });

        newFolderPaths.forEach(function(newPath) {
            var folder = imapFolders.find(function(f) { return f.path === newPath; });
            if (folder) {
                self._account.folders.push(folder);
            }
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
            var wellknownFolder = self._account.folders.find(function(f) {
                return f.type === mbxType && f.wellknown;
            });

            if (wellknownFolder) {
                return;
            }

            wellknownFolder = self._account.folders.find(function(f) { return f.type === mbxType; });

            if (wellknownFolder) {
                wellknownFolder.wellknown = true;
                foldersChanged = true;
            }
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
        folder.uids.sort(function(a, b) { return a - b; });
        folder.messages = folder.messages || folder.uids.map(function(uid) {
            return { uid: uid };
        });
    });

    var inbox = self._account.folders.find(function(f) { return f.type === FOLDER_TYPE_INBOX; });
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

Email.prototype._handleExistingKeypair = function(keypair, passphrase) {
    return new Promise(function(resolve) {
        var privKeyParams = this._pgp.getKeyParams(keypair.privateKey.encryptedKey);
        var pubKeyParams = this._pgp.getKeyParams(keypair.publicKey.publicKey);

        if (!keypair.privateKey._id || keypair.privateKey._id !== keypair.publicKey._id ||
            keypair.privateKey._id !== privKeyParams._id || keypair.publicKey._id !== pubKeyParams._id) {
            throw new Error('Key IDs dont match!');
        }

        var matchingPrivUserId = privKeyParams.userIds.find(function(uid) {
            return uid.emailAddress === this._account.emailAddress;
        }.bind(this));
        var matchingPubUserId = pubKeyParams.userIds.find(function(uid) {
            return uid.emailAddress === this._account.emailAddress;
        }.bind(this));

        if (!matchingPrivUserId || !matchingPubUserId ||
            keypair.privateKey.userId !== this._account.emailAddress ||
            keypair.publicKey.userId !== this._account.emailAddress) {
            throw new Error('User IDs dont match!');
        }

        resolve();
    }.bind(this)).then(function() {
        return this._pgp.importKeys({
            passphrase: passphrase,
            privateKeyArmored: keypair.privateKey.encryptedKey,
            publicKeyArmored: keypair.publicKey.publicKey
        }).then(function() {
            return keypair;
        });
    }.bind(this)).then(this._setPrivateKey.bind(this));
};

Email.prototype._setPrivateKey = function(keypair) {
    this._pgpbuilder._privateKey = this._pgp._privateKey;
    return keypair;
};

Email.prototype._deleteLocal = function(options) {
    return this._localDeleteMessage({
        folder: options.folder,
        uid: options.uid
    });
};

Email.prototype._markStorage = function(options) {
    return this._localListMessages({
        folder: options.folder,
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

        return this._localStoreMessages({
            folder: options.folder,
            emails: [storedMessage]
        });
    }.bind(this));
};

Email.prototype._setFlagsDone = function(folder, err) {
    this.done();
    updateUnreadCount(folder);
    if (err) {
        throw err;
    }
};

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

Email.prototype._imapDeleteMessage = function(options) {
    var self = this;
    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();
    }).then(function() {
        var trash = self._account.folders.find(function(f) { return f.type === FOLDER_TYPE_TRASH; });

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

Email.prototype._imapUploadMessage = function(options) {
    var self = this;
    return self._imapClient.uploadMessage({
        path: options.folder.path,
        message: options.message
    });
};

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
            uids: messages.map(function(m) { return m.uid; })
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
        var highestModseq = Math.max.apply(null, messages.map(function(m) { return parseInt(m.modseq, 10); }));
        if (highestModseq > folder.modseq) {
            folder.modseq = highestModseq;
            return self._localStoreFolders();
        }
    }).then(function() {
        updateUnreadCount(folder);
        return messages;
    });
};

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

Email.prototype._localStoreMessages = function(options) {
    var dbType = 'email_' + options.folder.path;
    return this._devicestorage.storeList(options.emails, dbType);
};

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

        var body = filterBodyParts(root, MSG_PART_TYPE_TEXT).map(function(p) { return p.content; }).join('\n');

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
            self._setBody(message, body, root);
            return;
        }

        return self._checkSignatures(message).then(function(signaturesValid) {
            message.signed = typeof signaturesValid !== 'undefined';
            message.signaturesValid = signaturesValid;
            self._setBody(message, body, root);
        });
    });
};

Email.prototype._setBody = function(message, body, root) {
    message.body = body;
    if (!message.clearSignedMessage) {
        message.attachments = filterBodyParts(root, MSG_PART_TYPE_ATTACHMENT);
        message.html = filterBodyParts(root, MSG_PART_TYPE_HTML).map(function(p) { return p.content; }).join('\n');
        inlineExternalImages(message);
    }
};

/**
 * Parse an email using the mail reader
 * @param  {Object} options The option to be passed to the mailreader
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

Email.prototype._uploadToSent = function(options) {
    var self = this;
    self.busy();
    return new Promise(function(resolve) {
        resolve();
    }).then(function() {
        var sentFolder = self._account.folders.find(function(f) { return f.type === FOLDER_TYPE_SENT; });

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

Email.prototype.checkOnline = function() {
    if (!this._account.online) {
        var err = new Error('Client is currently offline!');
        err.code = 42;
        throw err;
    }
};

Email.prototype.checkIgnoreUploadOnSent = function(hostname) {
    for (var i = 0; i < config.ignoreUploadOnSentDomains.length; i++) {
        if (config.ignoreUploadOnSentDomains[i].test(hostname)) {
            return true;
        }
    }
    return false;
};

Email.prototype.isOnline = function() {
    return navigator.onLine;
};

function updateUnreadCount(folder, countAllMessages) {
    folder.count = countAllMessages ? folder.messages.length : folder.messages.filter(function(msg) {
        return msg.unread;
    }).length;
}

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

function inlineExternalImages(message) {
    message.html = message.html.replace(/(<img[^>]+\bsrc=['"])cid:([^'">]+)(['"])/ig, function(match, prefix, src, suffix) {
        var localSource = '',
            payload = '',
            internalReference = message.attachments.find(function(att) { return att.id === src; });

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