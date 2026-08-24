if (!message.bodyParts || message.decryptingBody || !message.body || !message.encrypted || message.decrypted) {
        return { message: message };
    }

    message.decryptingBody = true;
    self.busy();

    return self._keychain.getReceiverPublicKey(message.from[0].address).then(function(senderPublicKey) {
        var encryptedNode = filterBodyParts(message.bodyParts, MSG_PART_TYPE_ENCRYPTED)[0];
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
            return { message: message };
        }

        encryptedNode.raw = pt.decrypted;
        return self._parse({ bodyParts: [encryptedNode] }).then(function(root) {
            return handleRaw(root, message);
        });
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

    function handleRaw(root, message) {
        if (message.signed) {
            return setBody(root, message);
        }

        var signedRoot = filterBodyParts(root, MSG_PART_TYPE_SIGNED)[0];
        if (!signedRoot) {
            return setBody(root, message);
        }

        message.signedMessage = signedRoot.signedMessage;
        message.signature = signedRoot.signature;
        root = signedRoot.content;

        return self._checkSignatures(message).then(function(signaturesValid) {
            message.signed = typeof signaturesValid !== 'undefined';
            message.signaturesValid = signaturesValid;
            return setBody(root, message);
        });
    }
};

/**
 * Extracts the message body from the parsed MIME structure.
 * @param {Object} message The message object to process
 * @returns {Promise} Resolves with the processed message
 */
Email.prototype._extractBody = function(message) {
    var self = this;

    if (message.encrypted) {
        message.body = filterBodyParts(message.bodyParts, MSG_PART_TYPE_ENCRYPTED)[0].content;
        return { message: message };
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
        return { message: message };
    }

    var clearSignedMatch = /^-{5}BEGIN PGP SIGNED MESSAGE-{5}\nHash:[ ][^\n]+\n(?:[A-Za-z]+:[ ][^\n]+\n)*\n([\s\S]*?)\n-{5}BEGIN PGP SIGNATURE-{5}[\S\s]*-{5}END PGP SIGNATURE-{5}$/im.exec(body);
    if (clearSignedMatch) {
        message.signed = true;
        message.clearSignedMessage = clearSignedMatch[0];
        body = (clearSignedMatch[1] || '').replace(/^- /gm, '');
    }

    if (!message.signed) {
        return setBody(body, root, message);
    }

    return self._checkSignatures(message).then(function(signaturesValid) {
        message.signed = typeof signaturesValid !== 'undefined';
        message.signaturesValid = signaturesValid;
        return setBody(body, root, message);
    });

    function setBody(body, root, message) {
        message.body = body;
        if (!message.clearSignedMessage) {
            message.attachments = filterBodyParts(root, MSG_PART_TYPE_ATTACHMENT);
            message.html = _.pluck(filterBodyParts(root, MSG_PART_TYPE_HTML), MSG_PART_ATTR_CONTENT).join('\n');
            inlineExternalImages(message);
        }
        return { message: message };
    }
};