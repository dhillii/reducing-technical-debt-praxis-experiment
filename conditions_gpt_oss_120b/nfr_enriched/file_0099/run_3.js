'use strict';

const util = require('crypto-lib').util;

//
// Controller
//
const WriteCtrl = function($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {

    const str = appConfig.string;
    const cfg = appConfig.config;

    // set default value so that the popover height is correct on init
    $scope.keyId = 'XXXXXXXX';

    //
    // Init
    //
    $scope.state.writer = {
        write: function(replyTo, replyAll, forward) {
            $scope.state.lightbox = 'write';
            $scope.replyTo = replyTo;

            resetFields();
            fillFields(replyTo, replyAll, forward);
            $scope.verify($scope.to[0]);
        },
        reportBug: function() {
            $scope.state.lightbox = 'write';
            resetFields();
            reportBug();
            $scope.verify($scope.to[0]);
        },
        close: function() {
            $scope.state.lightbox = undefined;
        }
    };

    function resetFields() {
        $scope.writerTitle = 'New email';
        $scope.to = [];
        $scope.showCC = false;
        $scope.cc = [];
        $scope.showBCC = false;
        $scope.bcc = [];
        $scope.subject = '';
        $scope.body = '';
        $scope.attachments = [];
        $scope.addressBookCache = undefined;
        $scope.showInvite = undefined;
        $scope.invited = [];
    }

    function reportBug() {
        let dump = '';
        const appender = {
            log: function(level, date, component, log) {
                if (level === axe.DEBUG) {
                    dump += '[DEBUG]';
                } else if (level === axe.INFO) {
                    dump += '[INFO]';
                } else if (level === axe.WARN) {
                    dump += '[WARN]';
                } else if (level === axe.ERROR) {
                    dump += '[ERROR]';
                }

                dump += '[' + date.toISOString() + ']';

                if (component) {
                    dump += '[' + component + ']';
                }

                dump += ' ' + (log || '').toString();

                if (log.stack) {
                    dump += ' . Stack: ' + log.stack;
                }

                dump += '\n';
            }
        };
        axe.dump(appender);

        $scope.to = [{ address: str.supportAddress }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + dump;
    }

    // Fill fields based on reply/forward context
    function fillFields(re, replyAll, forward) {
        if (!re) {
            return;
        }

        setWriterTitle(forward);
        const replyTo = determineReplyTo(re);
        if (!forward) {
            populateTo(replyTo);
            populateReferences(re);
        }
        if (replyAll) {
            populateCC(re, replyTo);
        }
        if (forward) {
            populateForwardAttachments(re);
        }
        setSubject(forward, re);
        setBody(forward, re, replyTo);
    }

    // Set writer title based on forward flag
    function setWriterTitle(isForward) {
        $scope.writerTitle = isForward ? 'Forward' : 'Reply';
    }

    // Determine the address to reply to
    function determineReplyTo(re) {
        return (re.replyTo && re.replyTo[0] && re.replyTo[0].address) || re.from[0].address;
    }

    // Populate the primary recipient list
    function populateTo(replyTo) {
        $scope.to.unshift({ address: replyTo });
        $scope.to.forEach($scope.verify);
    }

    // Populate references and in-reply-to header
    function populateReferences(re) {
        $scope.references = (re.references || []);
        if (re.id && $scope.references.indexOf(re.id) < 0) {
            $scope.references = $scope.references.concat(re.id);
        }
        if (re.id) {
            $scope.inReplyTo = re.id;
        }
    }

    // Populate CC list for reply-all
    function populateCC(re, replyTo) {
        const me = auth.emailAddress;
        re.to.concat(re.cc).forEach(function(recipient) {
            if (recipient.address === me && replyTo !== me) {
                return;
            }
            $scope.cc.unshift({ address: recipient.address });
        });
        $scope.cc = _.uniq($scope.cc, function(recipient) {
            return recipient.address;
        });
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    // Populate attachments for forwarded messages
    function populateForwardAttachments(re) {
        $scope.attachments = [].concat(re.attachments);
        if (re.id) {
            $scope.references = [re.id];
        }
    }

    // Set email subject based on forward/reply
    function setSubject(isForward, re) {
        if (isForward) {
            $scope.subject = 'Fwd: ' + re.subject;
        } else {
            $scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
        }
    }

    // Compose email body for forward or reply
    function setBody(isForward, re, replyTo) {
        const fromName = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const createString = function(array) {
            let str = '';
            array.forEach(function(to) {
                str += (str) ? ', ' : '';
                str += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
            });
            return str;
        };

        let body = '';
        if (isForward) {
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + re.subject + '\n' +
                'To: ' + createString(re.to) + '\n' +
                ((re.cc && re.cc.length > 0) ? 'Cc: ' + createString(re.cc) + '\n' : '') +
                '\n\n';
        } else {
            body = '\n\n' + sentDate + ' ' + fromName + ' wrote:\n> ';
        }

        if (re.body) {
            body += re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        }
        $scope.body = body;
    }

    //
    // Editing headers
    //

    /**
     * Warn users when using BCC
     */
    $scope.toggleShowBCC = function() {
        $scope.showBCC = true;
        return dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    };

    /**
     * Verify email address and fetch its public key
     */
    $scope.verify = function(recipient) {
        if (!recipient) {
            return;
        }

        normalizeRecipient(recipient);
        recipient.key = undefined;
        recipient.secure = false;
        $scope.checkSendStatus();

        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        return $q.resolve()
            .then(() => keychain.refreshKeyForUserId({ userId: recipient.address }))
            .then(key => handleKeyResult(key, recipient))
            .catch(dialog.error);
    };

    // Normalize recipient fields for display and address
    function normalizeRecipient(recipient) {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    }

    // Process key lookup result
    function handleKeyResult(key, recipient) {
        if (key) {
            const userIds = pgp.getKeyParams(key.publicKey).userIds;
            const matchingUserId = _.findWhere(userIds, { emailAddress: recipient.address });
            if (matchingUserId) {
                recipient.key = key;
                recipient.secure = true;
            }
        } else {
            $scope.showInvite = true;
        }
        $scope.checkSendStatus();
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        const allSecure = evaluateSecurity();
        const numReceivers = countValidRecipients();

        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        if (hasBccRecipients()) {
            $scope.okToSend = true;
            $scope.sendBtnText = str.sendBtnClear;
            $scope.sendBtnSecure = false;
            return;
        }

        updateSendButton(allSecure);
    };

    // Count valid recipients and validate addresses
    function countValidRecipients() {
        let count = 0;
        $scope.to.concat($scope.cc, $scope.bcc).forEach(recipient => {
            if (!util.validateEmailAddress(recipient.address)) {
                dialog.info({ title: 'Warning', message: 'Invalid recipient address!' });
                return;
            }
            count++;
        });
        return count;
    }

    // Determine if all recipients have secure keys
    function evaluateSecurity() {
        let allSecure = true;
        $scope.to.concat($scope.cc, $scope.bcc).forEach(recipient => {
            if (!recipient.secure) {
                allSecure = false;
            }
        });
        return allSecure;
    }

    // Check for any non‑empty BCC entries
    function hasBccRecipients() {
        return $scope.bcc.filter(filterEmptyAddresses).length > 0;
    }

    // Update send button based on security status
    function updateSendButton(allSecure) {
        $scope.okToSend = true;
        if (allSecure) {
            $scope.sendBtnText = str.sendBtnSecure;
            $scope.sendBtnSecure = true;
            $scope.showInvite = false;
        } else {
            $scope.sendBtnText = str.sendBtnClear;
            $scope.sendBtnSecure = false;
        }
    }

    //
    // Editing attachments
    //
    $scope.remove = function(attachment) {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    /**
     * Invite all users without a public key
     */
    $scope.invite = function() {
        const sender = auth.emailAddress;
        const invitees = collectInvitees();

        $scope.showInvite = false;

        return $q.resolve()
            .then(() => sendInvitations(sender, invitees))
            .catch(err => {
                $scope.showInvite = true;
                return dialog.error(err);
            });
    };

    // Gather addresses that need an invitation
    function collectInvitees() {
        const list = [];
        $scope.to.concat($scope.cc, $scope.bcc).forEach(recipient => {
            if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
                list.push(recipient.address);
            }
        });
        return list;
    }

    // Send invitation emails and track invited addresses
    function sendInvitations(sender, invitees) {
        const sendJobs = [];
        invitees.forEach(recipientAddress => {
            const invitationMail = invitation.createMail({ sender, recipient: recipientAddress });
            const promise = outbox.put(invitationMail).then(() => invitation.invite({ recipient: recipientAddress, sender }));
            sendJobs.push(promise);
            $scope.invited.push(recipientAddress);
        });
        return Promise.all(sendJobs);
    }

    //
    // Editing email body
    //
    $scope.sendToOutbox = function() {
        const message = buildMessage();

        $scope.state.writer.close();
        if ($scope.replyTo) {
            status.setReading(false);
        }

        return $q.resolve()
            .then(() => outbox.put(message))
            .then(() => handleReplyFlag())
            .catch(err => {
                if (err.code !== 42) {
                    dialog.error(err);
                }
            });
    };

    // Construct the email model for outbox
    function buildMessage() {
        return {
            from: [{ name: auth.realname, address: auth.emailAddress }],
            to: $scope.to.filter(filterEmptyAddresses),
            cc: $scope.cc.filter(filterEmptyAddresses),
            bcc: $scope.bcc.filter(filterEmptyAddresses),
            subject: $scope.subject.trim() || str.fallbackSubject,
            body: $scope.body.trim(),
            attachments: $scope.attachments,
            sentDate: new Date(),
            headers: buildHeaders()
        };
    }

    // Build email headers for reply handling
    function buildHeaders() {
        const headers = {};
        if ($scope.inReplyTo) {
            headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
        }
        if ($scope.references && $scope.references.length) {
            headers.references = $scope.references.map(ref => '<' + ref + '>').join(' ');
        }
        return headers;
    }

    // Update reply flag on original message if needed
    function handleReplyFlag() {
        if (!$scope.replyTo || $scope.replyTo.answered) {
            return;
        }
        $scope.replyTo.answered = true;
        return email.setFlags({
            folder: currentFolder(),
            message: $scope.replyTo
        });
    }

    //
    // Tag input & Autocomplete
    //
    $scope.tagStyle = function(recipient) {
        const classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    };

    $scope.lookupAddressBook = function(query) {
        return $q.resolve()
            .then(() => ensureAddressBookCache())
            .then(() => filterAddressBook(query))
            .catch(dialog.error);
    };

    // Populate address book cache if not already loaded
    function ensureAddressBookCache() {
        if ($scope.addressBookCache) {
            return;
        }
        return keychain.listLocalPublicKeys().then(keys => {
            $scope.addressBookCache = keys.map(key => {
                const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                return { address: key.userId, displayId: name + ' - ' + key.userId };
            });
        });
    }

    // Filter cached address book entries based on query
    function filterAddressBook(query) {
        return $scope.addressBookCache.filter(entry =>
            entry.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1
        );
    }

    //
    // Helpers
    //
    function currentFolder() {
        return $scope.state.nav.currentFolder;
    }

    /*
     * Visitor to filter out objects without an address property, i.e. empty addresses
     */
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;