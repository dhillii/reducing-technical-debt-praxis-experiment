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
            generateBugReport();
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

    // Generates a bug report email with a dump of the log
    function generateBugReport() {
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

                if (log && log.stack) {
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

    function fillFields(re, replyAll, forward) {
        if (!re) {
            return;
        }

        $scope.writerTitle = forward ? 'Forward' : 'Reply';
        const replyTo = (re.replyTo && re.replyTo[0] && re.replyTo[0].address) || re.from[0].address;

        if (!forward) {
            prependRecipient($scope.to, replyTo);
            $scope.to.forEach($scope.verify);
            populateReferences(re);
        }

        if (replyAll) {
            addReplyAllRecipients(re, replyTo);
        }

        if (forward) {
            $scope.attachments = [].concat(re.attachments);
            if (re.id) {
                $scope.references = [re.id];
            }
        }

        setSubjectAndBody(re, forward, replyTo);
    }

    // Adds a recipient to the beginning of a list
    function prependRecipient(list, address) {
        list.unshift({ address });
    }

    // Populates reference fields for a reply
    function populateReferences(re) {
        $scope.references = (re.references || []);
        if (re.id && $scope.references.indexOf(re.id) < 0) {
            $scope.references = $scope.references.concat(re.id);
        }
        if (re.id) {
            $scope.inReplyTo = re.id;
        }
    }

    // Handles reply-all logic
    function addReplyAllRecipients(re, originalReplyTo) {
        const me = auth.emailAddress;
        re.to.concat(re.cc).forEach(function(recipient) {
            if (recipient.address === me && originalReplyTo !== me) {
                return;
            }
            prependRecipient($scope.cc, recipient.address);
        });

        $scope.cc = _.uniq($scope.cc, function(recipient) {
            return recipient.address;
        });
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    // Sets subject line and body content based on forward/reply
    function setSubjectAndBody(re, forward, replyTo) {
        $scope.subject = forward ? 'Fwd: ' + re.subject : (re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '');

        const fromName = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const body = forward ? buildForwardBody(re, sentDate) : buildReplyBody(re, sentDate, fromName);
        if (re.body) {
            $scope.body = body + formatOriginalBody(re.body);
        }
    }

    function buildForwardBody(re, sentDate) {
        const headerLines = [
            '---------- Forwarded message ----------',
            'From: ' + re.from[0].name + ' <' + re.from[0].address + '>',
            'Date: ' + sentDate,
            'Subject: ' + re.subject,
            'To: ' + addressListToString(re.to)
        ];
        if (re.cc && re.cc.length > 0) {
            headerLines.push('Cc: ' + addressListToString(re.cc));
        }
        return '\n\n' + headerLines.join('\n') + '\n\n';
    }

    function buildReplyBody(re, sentDate, from) {
        return '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
    }

    function formatOriginalBody(body) {
        return body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
    }

    function addressListToString(list) {
        let result = '';
        list.forEach(function(to) {
            result += (result ? ', ' : '');
            result += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
        });
        return result;
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

    // Normalizes recipient fields for display and address
    function normalizeRecipient(recipient) {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    }

    // Handles the result of a key lookup
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

        const { allSecure, numReceivers } = evaluateRecipients();

        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            // BCC disables secure sending
            setPlaintextSendState();
            return;
        }

        if (allSecure) {
            setSecureSendState();
        } else {
            setPlaintextSendState();
        }
    };

    // Evaluates all recipients for validity and security
    function evaluateRecipients() {
        let allSecure = true;
        let numReceivers = 0;

        const check = function(recipient) {
            if (!util.validateEmailAddress(recipient.address)) {
                dialog.info({
                    title: 'Warning',
                    message: 'Invalid recipient address!'
                });
                return;
            }
            numReceivers++;
            if (!recipient.secure) {
                allSecure = false;
            }
        };

        $scope.to.forEach(check);
        $scope.cc.forEach(check);
        $scope.bcc.forEach(check);

        return { allSecure, numReceivers };
    }

    function setSecureSendState() {
        $scope.okToSend = true;
        $scope.sendBtnText = str.sendBtnSecure;
        $scope.sendBtnSecure = true;
        $scope.showInvite = false;
    }

    function setPlaintextSendState() {
        $scope.okToSend = true;
        $scope.sendBtnText = str.sendBtnClear;
        $scope.sendBtnSecure = false;
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

    // Collects addresses that need an invitation
    function collectInvitees() {
        const invitees = [];

        const check = function(recipient) {
            if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        };

        $scope.to.forEach(check);
        $scope.cc.forEach(check);
        $scope.bcc.forEach(check);

        return invitees;
    }

    // Sends invitation emails and records invited addresses
    function sendInvitations(sender, invitees) {
        const sendJobs = [];

        invitees.forEach(function(recipientAddress) {
            const invitationMail = invitation.createMail({
                sender,
                recipient: recipientAddress
            });

            const promise = outbox.put(invitationMail).then(() => invitation.invite({
                recipient: recipientAddress,
                sender
            }));

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
            .then(() => syncReplyFlag())
            .catch(err => {
                if (err.code !== 42) {
                    dialog.error(err);
                }
            });
    };

    // Constructs the email model for outbox storage
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

    // Builds email headers for reply handling
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

    // Synchronizes the replied flag on the original message if needed
    function syncReplyFlag() {
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

    // Loads address book cache if not already loaded
    function ensureAddressBookCache() {
        if ($scope.addressBookCache) {
            return;
        }
        return keychain.listLocalPublicKeys().then(keys => {
            $scope.addressBookCache = keys.map(key => {
                const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                return {
                    address: key.userId,
                    displayId: name + ' - ' + key.userId
                };
            });
        });
    }

    // Filters cached address book entries based on query
    function filterAddressBook(query) {
        const lower = query.toLowerCase();
        return $scope.addressBookCache.filter(i => i.displayId.toLowerCase().indexOf(lower) !== -1);
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