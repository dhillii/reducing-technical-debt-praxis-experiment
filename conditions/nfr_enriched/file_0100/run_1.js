```javascript
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

var CONSTANTS = {
    FOLDER_DB_TYPE: 'folders',
    SYNC_TYPES: {
        NEW: 'new',
        DELETED: 'deleted',
        MESSAGES: 'messages'
    },
    FOLDER_TYPES: {
        INBOX: 'Inbox',
        SENT: 'Sent',
        DRAFTS: 'Drafts',
        TRASH: 'Trash',
        FLAGGED: 'Flagged'
    },
    MESSAGE_ATTRIBUTES: {
        UID: 'uid',
        MODSEQ: 'modseq'
    },
    MESSAGE_PART_ATTRIBUTES: {
        CONTENT: 'content'
    },
    MESSAGE_PART_TYPES: {
        ATTACHMENT: 'attachment',
        ENCRYPTED: 'encrypted',
        SIGNED: 'signed',
        TEXT: 'text',
        HTML: 'html'
    }
};

/**
 * High-level data access object that orchestrates everything around the handling of encrypted mails:
 * PGP de-/encryption, receiving via IMAP, sending via SMTP, MIME parsing, local db persistence
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
 * Initializes the email dao
 */
Email.prototype.init = function(options) {
    var self = this;
    self._account = options.account;
    self._account.busy = 0;
    self._account.online = false;
    self._account.loggingIn = false;

    return self._devicestorage.listItems(CONSTANTS.FOLDER_DB_TYPE, true).then(function(stored) {
        self._account.folders = stored[0] || [];
        return self._initFolders();
    });
};

/**
 * Unlocks the keychain by either decrypting an existing private key or generating a new keypair
 */
Email.prototype.unlock = function(options) {
    var self = this;

    if (options.keypair) {
        return handleExistingKeypair(options.keypair);
    }

    var generatedKeypair;
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

            validateKeyIds(keypair, privKeyParams, pubKeyParams);
            validateUserIds(keypair, privKeyParams, pubKeyParams);

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

    function validateKeyIds(keypair, privKeyParams, pubKeyParams) {
        if (!keypair.privateKey._id || keypair.privateKey._id !== keypair.publicKey._id ||
            keypair.privateKey._id !== privKeyParams._id || keypair.publicKey._id !== pubKeyParams._id) {
            throw new Error('Key IDs dont match!');
        }
    }

    function validateUserIds(keypair, privKeyParams, pubKeyParams) {
        var matchingPrivUserId = _.findWhere(privKeyParams.userIds, {
            emailAddress: self._account.emailAddress
        });
        var matchingPubUserId = _.findWhere(pubKeyParams.userIds, {
            emailAddress: self._account.emailAddress
        });

        if (!matchingPrivUserId || !matchingPubUserId ||
            keypair.privateKey.userId !== self._account.emailAddress ||
            keypair.publicKey.userId !== self._account.emailAddress) {
            throw new Error('User IDs dont match!');
        }
    }

    function setPrivateKey(keypair) {
        self._pgpbuilder._privateKey = self._pgp._privateKey;
        return keypair;
    }
};

/**
 * Opens a folder in IMAP
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
 * Delete a message from IMAP, disk and folder.messages
 */
Email.prototype.deleteMessage = function(options) {
    var self = this;
    var folder = options.folder;
    var message = options.message;

    self.busy();
    folder.messages.splice(folder.messages.indexOf(message), 1);

    if (options.localOnly || folder.path === config.outboxMailboxPath) {
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
 * Updates a message's flags
 */
Email.prototype.setFlags = function(options) {
    var self = this;
    var folder = options.folder;
    var message = options.message;

    if (folder.messages.indexOf(message) < 0) {
        return Promise.resolve();
    }

    self.busy();

    if (options.localOnly || folder.path === config.outboxMailboxPath) {
        return markStorage().then(done).catch(done);
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
    }).then(markStorage).then(done).catch(done);

    function markStorage() {
        return self._localListMessages({
            folder: folder,
            uid: message.uid
        }).then(function(storedMessages) {
            var storedMessage = storedMessages[0];

            if (!storedMessage) {
                return;
            }

            storedMessage.unread = message.unread;
            storedMessage.flagged = message.flagged;
            storedMessage.answered = message.answered;
            storedMessage.modseq = message.modseq || storedMessage.modseq;

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
 */
Email.prototype.moveMessage = function(options) {
    var self = this;
    var folder = options.folder;
    var destination = options.destination;
    var message = options.message;

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
 */
Email.prototype.getBody = function(options) {
    var self = this;
    var messages = options.messages.filter(function(message) {
        return !(message.loadingBody || typeof message.body !== 'undefined');
    });

    if (!messages.length) {
        return Promise.resolve();
    }

    messages.forEach(function(message) {
        message.loadingBody = true;
    });

    self.busy();

    var loadedMessages;

    return self._localListMessages({
        folder: options.folder,
        uid: _.pluck(messages, CONSTANTS.MESSAGE_ATTRIBUTES.UID)
    }).then(function(localMessages) {
        loadedMessages = localMessages;

        var localUids = _.pluck(localMessages, CONSTANTS.MESSAGE_ATTRIBUTES.UID);
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
            folder: options.folder
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
        var jobs = messages.map(function(message) {
            return self._extractBody(message).catch(function(err) {
                axe.error('Can extract body for message uid ' + message.uid + ' . Reason: ' + err.message + (err.stack ? ('\n' + err.stack) : ''));
            });
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

/**
 * Check message signatures
 */
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
 */
Email.prototype.getAttachment = function(options) {
    var self = this;
    var attachment = options.attachment;

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
 */
Email.prototype.decryptBody = function(options) {
    var self = this;
    var message = options.message;

    if (!message.bodyParts || message.decryptingBody || !message.body || !message.encrypted || message.decrypted) {
        return Promise.resolve(message);
    }

    message.decryptingBody = true;
    self.busy();

    var encryptedNode;

    return self._keychain.getReceiverPublicKey(message.from[0].address).then(function(senderPublicKey) {
        encryptedNode = filterBodyParts(message.bodyParts, CONSTANTS.MESSAGE_PART_TYPES.ENCRYPTED)[0];
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
        message.