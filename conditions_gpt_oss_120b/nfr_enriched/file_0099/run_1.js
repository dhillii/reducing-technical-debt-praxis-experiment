'use strict';

const util = require('crypto-lib').util;

//
// Controller
//
const WriteCtrl = function ($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {

    const str = appConfig.string;
    const cfg = appConfig.config;

    // set default value so that the popover height is correct on init
    $scope.keyId = 'XXXXXXXX';

    //
    // Init
    //
    $scope.state.writer = {
        write: function (replyTo, replyAll, forward) {
            $scope.state.lightbox = 'write';
            $scope.replyTo = replyTo;

            resetFields();
            fillFields(replyTo, replyAll, forward);
            $scope.verify($scope.to[0]);
        },
        reportBug: function () {
            $scope.state.lightbox = 'write';
            resetFields();
            prepareBugReport();
            $scope.verify($scope.to[0]);
        },
        close: function () {
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

    /** Prepare bug report email */
    function prepareBugReport() {
        let dump = '';
        const appender = {
            log: function (level, date, component, log) {
                const levelTag = {
                    [axe.DEBUG]: '[DEBUG]',
                    [axe.INFO]: '[INFO]',
                    [axe.WARN]: '[WARN]',
                    [axe.ERROR]: '[ERROR]'
                }[level] || '';
                dump += levelTag;
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

    /** Orchestrate field population for reply/forward */
    function fillFields(replyToMessage, replyAll, forward) {
        if (!replyToMessage) {
            return;
        }

        setWriterTitle(forward);
        const replyAddress = determineReplyAddress(replyToMessage);
        if (!forward) {
            populateToField(replyAddress);
            populateReferences(replyToMessage);
        }
        if (replyAll) {
            populateCcField(replyToMessage, replyAddress);
        }
        if (forward) {
            populateForwardAttachments(replyToMessage);
        }
        setSubject(replyToMessage, forward);
        buildBody(replyToMessage, forward);
    }

    /** Set writer title based on forward flag */
    function setWriterTitle(isForward) {
        $scope.writerTitle = isForward ? 'Forward' : 'Reply';
    }

    /** Determine the address to reply to */
    function determineReplyAddress(message) {
        return (message.replyTo && message.replyTo[0] && message.replyTo[0].address) || message.from[0].address;
    }

    /** Populate the primary recipient field */
    function populateToField(address) {
        $scope.to.unshift({ address });
        $scope.to.forEach($scope.verify);
    }

    /** Populate references and in-reply-to headers */
    function populateReferences(message) {
        $scope.references = (message.references || []).slice();
        if (message.id && $scope.references.indexOf(message.id) < 0) {
            $scope.references.push(message.id);
        }
        if (message.id) {
            $scope.inReplyTo = message.id;
        }
    }

    /** Populate CC field when replying to all */
    function populateCcField(message, originalReplyTo) {
        const me = auth.emailAddress;
        const ccCandidates = message.to.concat(message.cc);
        ccCandidates.forEach(recipient => {
            if (recipient.address === me && originalReplyTo !== me) {
                return;
            }
            $scope.cc.unshift({ address: recipient.address });
        });
        $scope.cc = _.uniq($scope.cc, r => r.address);
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    /** Copy attachments for a forwarded message */
    function populateForwardAttachments(message) {
        $scope.attachments = (message.attachments || []).slice();
        if (message.id) {
            $scope.references = [message.id];
        }
    }

    /** Set email subject based on forward/reply */
    function setSubject(message, isForward) {
        if (isForward) {
            $scope.subject = 'Fwd: ' + message.subject;
        } else {
            $scope.subject = message.subject ? 'Re: ' + message.subject.replace('Re: ', '') : '';
        }
    }

    /** Build email body for forward or reply */
    function buildBody(message, isForward) {
        const fromName = message.from[0].name || determineReplyAddress(message);
        const sentDate = $filter('date')(message.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const formatAddressList = list => list.map(to => `${to.name || to.address} <${to.address}>`).join(', ');

        let bodyHeader;
        if (isForward) {
            bodyHeader = '\n\n---------- Forwarded message ----------\n' +
                `From: ${message.from[0].name} <${message.from[0].address}>\n` +
                `Date: ${sentDate}\n` +
                `Subject: ${message.subject}\n` +
                `To: ${formatAddressList(message.to)}\n` +
                (message.cc && message.cc.length ? `Cc: ${formatAddressList(message.cc)}\n` : '') +
                '\n\n';
        } else {
            bodyHeader = `\n\n${sentDate} ${fromName} wrote:\n> `;
        }

        if (message.body) {
            const quotedBody = message.body.trim().split('\n').map(line => line.replace(/^ >/, '>')).join('\n> ');
            $scope.body = bodyHeader + quotedBody;
        } else {
            $scope.body = bodyHeader;
        }
    }

    //
    // Editing headers
    //

    /** Warn users when using BCC */
    $scope.toggleShowBCC = function () {
        $scope.showBCC = true;
        return dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    };

    /** Verify email address and fetch its public key */
    $scope.verify = function (recipient) {
        if (!recipient) {
            return;
        }

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

        return $q.resolve()
            .then(() => keychain.refreshKeyForUserId({ userId: recipient.address }))
            .then(key => {
                if (key) {
                    const userIds = pgp.getKeyParams(key.publicKey).userIds;
                    const matching = _.findWhere(userIds, { emailAddress: recipient.address });
                    if (matching) {
                        recipient.key = key;
                        recipient.secure = true;
                    }
                } else {
                    $scope.showInvite = true;
                }
                $scope.checkSendStatus();
            })
            .catch(dialog.error);
    };

    /** Check if it is ok to send an email depending on the invitation state of the addresses */
    $scope.checkSendStatus = function () {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        let allSecure = true;
        let receiverCount = 0;

        const validateRecipient = recipient => {
            if (!util.validateEmailAddress(recipient.address)) {
                dialog.info({ title: 'Warning', message: 'Invalid recipient address!' });
                return;
            }
            receiverCount++;
            if (!recipient.secure) {
                allSecure = false;
            }
        };

        $scope.to.forEach(validateRecipient);
        $scope.cc.forEach(validateRecipient);
        $scope.bcc.forEach(validateRecipient);

        if (receiverCount < 1) {
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
    $scope.remove = function (attachment) {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    /** Invite all users without a public key */
    $scope.invite = function () {
        const sender = auth.emailAddress;
        const sendJobs = [];
        const invitees = [];

        $scope.showInvite = false;

        const collectInvitees = recipient => {
            if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        };

        $scope.to.forEach(collectInvitees);
        $scope.cc.forEach(collectInvitees);
        $scope.bcc.forEach(collectInvitees);

        return $q.resolve()
            .then(() => {
                invitees.forEach(recipientAddress => {
                    const invitationMail = invitation.createMail({ sender, recipient: recipientAddress });
                    const promise = outbox.put(invitationMail)
                        .then(() => invitation.invite({ recipient: recipientAddress, sender }));
                    sendJobs.push(promise);
                    $scope.invited.push(recipientAddress);
                });
                return Promise.all(sendJobs);
            })
            .catch(err => {
                $scope.showInvite = true;
                return dialog.error(err);
            });
    };

    //
    // Editing email body
    //
    $scope.sendToOutbox = function () {
        const message = {
            from: [{ name: auth.realname, address: auth.emailAddress }],
            to: $scope.to.filter(filterEmptyAddresses),
            cc: $scope.cc.filter(filterEmptyAddresses),
            bcc: $scope.bcc.filter(filterEmptyAddresses),
            subject: $scope.subject.trim() || str.fallbackSubject,
            body: $scope.body.trim(),
            attachments: $scope.attachments,
            sentDate: new Date(),
            headers: {}
        };

        if ($scope.inReplyTo) {
            message.headers['in-reply-to'] = `<${$scope.inReplyTo}>`;
        }

        if ($scope.references && $scope.references.length) {
            message.headers.references = $scope.references.map(ref => `<${ref}>`).join(' ');
        }

        $scope.state.writer.close();
        if ($scope.replyTo) {
            status.setReading(false);
        }

        return $q.resolve()
            .then(() => outbox.put(message))
            .then(() => {
                if (!$scope.replyTo || $scope.replyTo.answered) {
                    return;
                }
                $scope.replyTo.answered = true;
                return email.setFlags({ folder: currentFolder(), message: $scope.replyTo });
            })
            .catch(err => {
                if (err.code !== 42) {
                    dialog.error(err);
                }
            });
    };

    //
    // Tag input & Autocomplete
    //
    $scope.tagStyle = function (recipient) {
        const classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    };

    $scope.lookupAddressBook = function (query) {
        return $q.resolve()
            .then(() => {
                if ($scope.addressBookCache) {
                    return;
                }
                return keychain.listLocalPublicKeys()
                    .then(keys => {
                        $scope.addressBookCache = keys.map(key => {
                            const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                            return { address: key.userId, displayId: `${name} - ${key.userId}` };
                        });
                    });
            })
            .then(() => $scope.addressBookCache.filter(i => i.displayId.toLowerCase().includes(query.toLowerCase())))
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