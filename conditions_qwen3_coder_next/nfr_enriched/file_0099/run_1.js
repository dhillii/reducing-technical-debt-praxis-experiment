'use strict';

var util = require('crypto-lib').util;

//
// Controller
//

var WriteCtrl = function($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {

    var str = appConfig.string;
    var cfg = appConfig.config;

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

            // fill fields depending on replyTo
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
        const dump = collectSysLogDump();
        $scope.to = [{
            address: str.supportAddress
        }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody
            .replace('{0}', navigator.userAgent)
            .replace('{1}', cfg.appVersion) + dump;
    }

    /**
     * Collects application logs into a formatted string dump
     */
    function collectSysLogDump() {
        let dump = '';
        const appender = {
            log: function(level, date, component, log) {
                dump += '[' + levelLabel(level) + ']';
                dump += '[' + date.toISOString() + ']';
                if (component) dump += '[' + component + ']';
                dump += ' ' + String(log || '');
                if (log && log.stack) dump += ' . Stack: ' + log.stack;
                dump += '\n';
            }
        };
        axe.dump(appender);
        return dump;
    }

    /**
     * Returns log level label string based on axe level constant
     */
    function levelLabel(level) {
        if (level === axe.DEBUG) return 'DEBUG';
        if (level === axe.INFO) return 'INFO';
        if (level === axe.WARN) return 'WARN';
        if (level === axe.ERROR) return 'ERROR';
        return 'UNKNOWN';
    }

    function fillFields(re, replyAll, forward) {
        if (!re) return;

        $scope.writerTitle = forward ? 'Forward' : 'Reply';
        const replyTo = getFirstValidReplyToAddress(re);

        if (!forward) {
            handleReplyToFields(re, replyTo);
        }

        if (replyAll) {
            handleReplyAll(re, replyTo);
        }

        if (forward) {
            handleForwardFields(re);
        }

        handleSubject(forward, re.subject);
        handleBody(forward, re, replyTo);
    }

    /**
     * Returns the reply-to address to use based on message headers
     */
    function getFirstValidReplyToAddress(re) {
        return re.replyTo?.[0]?.address || re.from[0]?.address;
    }

    /**
     * Handles recipient and message reference fields for reply
     */
    function handleReplyToFields(re, replyTo) {
        $scope.to.unshift({ address: replyTo });
        $scope.to.forEach($scope.verify);

        $scope.references = [...(re.references || [])];
        if (re.id && !$scope.references.includes(re.id)) {
            $scope.references.push(re.id);
        }
        if (re.id) {
            $scope.inReplyTo = re.id;
        }
    }

    /**
     * Handles CC recipients for reply-all
     */
    function handleReplyAll(re, replyTo) {
        const me = auth.emailAddress;
        const recipients = [...re.to, ...re.cc];
        recipients.forEach(recipient => {
            if (recipient.address === me && recipient.address !== replyTo) return;
            $scope.cc.unshift({ address: recipient.address });
        });

        $scope.cc = _.uniq($scope.cc, r => r.address);
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    /**
     * Handles attachments and references for forwarding
     */
    function handleForwardFields(re) {
        $scope.attachments = [...re.attachments];
        if (re.id) {
            $scope.references = [re.id];
        }
    }

    /**
     * Populates subject line based on operation type and original subject
     */
    function handleSubject(forward, subject) {
        if (forward) {
            $scope.subject = 'Fwd: ' + subject;
        } else {
            $scope.subject = subject ? 'Re: ' + subject.replace(/^Re:\s*/i, '') : '';
        }
    }

    /**
     * Constructs body text based on operation type (reply/forward)
     */
    function handleBody(forward, re, replyTo) {
        const fromName = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const createString = (array) => array.map(to =>
            to.name ? `${to.name} <${to.address}>` : `<${to.address}>`
        ).join(', ');

        let body = '\n\n';
        if (forward) {
            body += '---------- Forwarded message ----------\n' +
                'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + re.subject + '\n' +
                'To: ' + createString(re.to) + '\n' +
                (re.cc && re.cc.length ? 'Cc: ' + createString(re.cc) + '\n' : '') + '\n\n';
        } else {
            body += sentDate + ' ' + fromName + ' wrote:\n> ';
        }

        if (re.body) {
            body += re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
            $scope.body = body;
        }
    }

    //
    // Editing headers
    //

    /**
     * Warn users when using BCC due to encryption incompatibility
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
        if (!recipient) return;

        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }

        recipient.key = undefined;
        recipient.secure = false;
        $scope.checkSendStatus();

        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        $q.resolve()
            .then(() => keychain.refreshKeyForUserId({ userId: recipient.address }))
            .then(key => {
                if (!key) {
                    $scope.showInvite = true;
                    $scope.checkSendStatus();
                    return;
                }

                const userIds = pgp.getKeyParams(key.publicKey).userIds;
                const matchingUserId = userIds.find(u => u.emailAddress === recipient.address);
                if (matchingUserId) {
                    recipient.key = key;
                    recipient.secure = true;
                } else {
                    $scope.showInvite = true;
                }
                $scope.checkSendStatus();
            })
            .catch(dialog.error);
    };

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        let allSecure = true;
        let numReceivers = 0;

        [$scope.to, $scope.cc, $scope.bcc].forEach(recipients => {
            recipients.forEach(recipient => {
                if (!util.validateEmailAddress(recipient.address)) {
                    dialog.info({
                        title: 'Warning',
                        message: 'Invalid recipient address!'
                    });
                    return;
                }
                numReceivers++;
                if (!recipient.secure) allSecure = false;
            });
        });

        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            allSecure = false;
        }

        if (allSecure) {
            $scope.okToSend = true;
            $scope.sendBtnText = str.sendBtnSecure;
            $scope.sendBtnSecure = true;
            $scope.showInvite = false;
        } else {
            $scope.okToSend = true;
            $scope.sendBtnText = str.sendBtnClear;
            $scope.sendBtnSecure = false;
        }
    };

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
        const sendJobs = [];
        const invitees = [];

        $scope.showInvite = false;

        [$scope.to, $scope.cc, $scope.bcc].forEach(recipients => {
            recipients.forEach(recipient => {
                if (util.validateEmailAddress(recipient.address) &&
                    !recipient.secure &&
                    $scope.invited.indexOf(recipient.address) === -1) {
                    invitees.push(recipient.address);
                }
            });
        });

        if (invitees.length === 0) return $q.resolve();

        return $q.resolve()
            .then(() =>
                Promise.all(invitees.map(recipientAddress => {
                    const invitationMail = invitation.createMail({
                        sender,
                        recipient: recipientAddress
                    });
                    return outbox.put(invitationMail)
                        .then(() => invitation.invite({
                            recipient: recipientAddress,
                            sender
                        }))
                        .then(() => $scope.invited.push(recipientAddress));
                }))
            )
            .catch(err => {
                $scope.showInvite = true;
                return dialog.error(err);
            });
    };

    //
    // Editing email body
    //

    $scope.sendToOutbox = function() {
        const message = buildOutgoingMessage();

        // close the writer
        $scope.state.writer.close();

        // close read mode after reply
        if ($scope.replyTo) {
            status.setReading(false);
        }

        return $q.resolve()
            .then(() => outbox.put(message))
            .then(() => {
                if (!$scope.replyTo || $scope.replyTo.answered) return;

                $scope.replyTo.answered = true;
                return email.setFlags({
                    folder: currentFolder(),
                    message: $scope.replyTo
                });
            })
            .catch(err => {
                if (err.code !== 42) {
                    dialog.error(err);
                }
            });
    };

    /**
     * Builds the email model object for sending via SMTP/client
     */
    function buildOutgoingMessage() {
        const headers = {};

        if ($scope.inReplyTo) {
            headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
        }

        if ($scope.references && $scope.references.length) {
            headers.references = $scope.references
                .map(ref => '<' + ref + '>')
                .join(' ');
        }

        return {
            from: [{ name: auth.realname, address: auth.emailAddress }],
            to: $scope.to.filter(filterEmptyAddresses),
            cc: $scope.cc.filter(filterEmptyAddresses),
            bcc: $scope.bcc.filter(filterEmptyAddresses),
            subject: $scope.subject.trim() || str.fallbackSubject,
            body: $scope.body.trim(),
            attachments: $scope.attachments,
            sentDate: new Date(),
            headers
        };
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
            .then(() => {
                if (!$scope.addressBookCache) {
                    return keychain.listLocalPublicKeys().then(keys => {
                        $scope.addressBookCache = keys.map(key => {
                            const name = pgp.getKeyParams(key.publicKey).userIds[0]?.name || '';
                            return {
                                address: key.userId,
                                displayId: `${name} - ${key.userId}`
                            };
                        });
                    });
                }
            })
            .then(() => {
                if (!$scope.addressBookCache) return [];
                return $scope.addressBookCache.filter(i =>
                    i.displayId.toLowerCase().includes(query.toLowerCase())
                );
            })
            .catch(dialog.error);
    };

    //
    // Helpers
    //

    function currentFolder() {
        return $scope.state.nav.currentFolder;
    }

    /**
     * Visitor to filter out objects without an address property, i.e. empty addresses
     */
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;