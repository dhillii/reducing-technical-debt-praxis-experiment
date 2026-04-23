'use strict';

var util = require('crypto-lib').util;

//
// Controller
//

var WriteCtrl = function ($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {
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

            // fill fields depending on replyTo
            fillFields(replyTo, replyAll, forward);

            $scope.verify($scope.to[0]);
        },
        reportBug: function () {
            $scope.state.lightbox = 'write';
            resetFields();
            reportBug();
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

    function reportBug() {
        const dump = buildBugDump();
        $scope.to = [{ address: str.supportAddress }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + dump;
    }

    function buildBugDump() {
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
                if (log.stack) {
                    dump += ' . Stack: ' + log.stack;
                }
                dump += '\n';
            }
        };
        axe.dump(appender);
        return dump;
    }

    function fillFields(re, replyAll, forward) {
        if (!re) {
            return;
        }

        setWriterTitle(forward);
        const replyTo = determineReplyTo(re);
        if (!forward) {
            addRecipient(replyTo);
            $scope.references = (re.references || []).slice();
            addReferenceIfMissing(re.id);
            setInReplyTo(re.id);
        }
        if (replyAll) {
            addReplyAllRecipients(re);
        }
        if (forward) {
            copyAttachments(re);
            setReferencesForForward(re.id);
        }
        setSubject(re, forward);
        setBody(re, replyTo, forward);
    }

    function setWriterTitle(forward) {
        $scope.writerTitle = forward ? 'Forward' : 'Reply';
    }

    function determineReplyTo(re) {
        return (re.replyTo && re.replyTo[0] && re.replyTo[0].address) || re.from[0].address;
    }

    function addRecipient(address) {
        $scope.to.unshift({ address });
        $scope.to.forEach($scope.verify);
    }

    function addReferenceIfMissing(id) {
        if (id && $scope.references.indexOf(id) < 0) {
            $scope.references = $scope.references.concat(id);
        }
    }

    function setInReplyTo(id) {
        if (id) {
            $scope.inReplyTo = id;
        }
    }

    function addReplyAllRecipients(re) {
        const me = auth.emailAddress;
        re.to.concat(re.cc).forEach(function (recipient) {
            if (recipient.address === me) {
                return;
            }
            $scope.cc.unshift({ address: recipient.address });
        });
        $scope.cc = _.uniq($scope.cc, function (recipient) {
            return recipient.address;
        });
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    function copyAttachments(re) {
        $scope.attachments = [].concat(re.attachments);
    }

    function setReferencesForForward(id) {
        if (id) {
            $scope.references = [id];
        }
    }

    function setSubject(re, forward) {
        if (forward) {
            $scope.subject = 'Fwd: ' + re.subject;
        } else {
            $scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
        }
    }

    function setBody(re, replyTo, forward) {
        const from = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');
        const body = buildBody(re, from, sentDate, forward);
        if (re.body) {
            $scope.body = body + re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        }
    }

    function buildBody(re, from, sentDate, forward) {
        if (forward) {
            return '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + re.subject + '\n' +
                'To: ' + createString(re.to) + '\n' +
                ((re.cc && re.cc.length > 0) ? 'Cc: ' + createString(re.cc) + '\n' : '') +
                '\n\n';
        }
        return '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
    }

    function createString(array) {
        let str = '';
        array.forEach(function (to) {
            str += (str) ? ', ' : '';
            str += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
        });
        return str;
    }

    //
    // Editing headers
    //

    /**
     * Warn users when using BCC
     */
    $scope.toggleShowBCC = function () {
        $scope.showBCC = true;
        return dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    };

    /**
     * Verify email address and fetch its public key
     */
    $scope.verify = function (recipient) {
        if (!recipient) {
            return;
        }

        normalizeRecipient(recipient);
        setRecipientFetchingState(recipient);
        $scope.checkSendStatus();

        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        return $q(function (resolve) {
            resolve();
        }).then(function () {
            return keychain.refreshKeyForUserId({
                userId: recipient.address
            });
        }).then(function (key) {
            handleKeyResult(recipient, key);
            $scope.checkSendStatus();
        }).catch(dialog.error);
    };

    function normalizeRecipient(recipient) {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    }

    function setRecipientFetchingState(recipient) {
        recipient.key = undefined;
        recipient.secure = false;
    }

    function handleKeyResult(recipient, key) {
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
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function () {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        let allSecure = true;
        let numReceivers = 0;

        $scope.to.forEach(checkRecipient);
        $scope.cc.forEach(checkRecipient);
        $scope.bcc.forEach(checkRecipient);

        function checkRecipient(recipient) {
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
        }

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

    $scope.remove = function (attachment) {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    /**
     * Invite all users without a public key
     */
    $scope.invite = function () {
        const sender = auth.emailAddress;
        const sendJobs = [];
        const invitees = [];

        $scope.showInvite = false;

        gatherInvitees($scope.to, invitees);
        gatherInvitees($scope.cc, invitees);
        gatherInvitees($scope.bcc, invitees);

        function gatherInvitees(list, invitees) {
            list.forEach(function (recipient) {
                if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
                    invitees.push(recipient.address);
                }
            });
        }

        return $q(function (resolve) {
            resolve();
        }).then(function () {
            invitees.forEach(function (recipientAddress) {
                const invitationMail = invitation.createMail({
                    sender,
                    recipient: recipientAddress
                });
                const promise = outbox.put(invitationMail).then(function () {
                    return invitation.invite({
                        recipient: recipientAddress,
                        sender
                    });
                });
                sendJobs.push(promise);
                $scope.invited.push(recipientAddress);
            });
            return Promise.all(sendJobs);
        }).catch(function (err) {
            $scope.showInvite = true;
            return dialog.error(err);
        });
    };

    //
    // Editing email body
    //

    $scope.sendToOutbox = function () {
        const message = buildMessage();

        $scope.state.writer.close();
        if ($scope.replyTo) {
            status.setReading(false);
        }

        return $q(function (resolve) {
            resolve();
        }).then(function () {
            return outbox.put(message);
        }).then(function () {
            if (!$scope.replyTo || $scope.replyTo.answered) {
                return;
            }
            $scope.replyTo.answered = true;
            return email.setFlags({
                folder: currentFolder(),
                message: $scope.replyTo
            });
        }).catch(function (err) {
            if (err.code !== 42) {
                dialog.error(err);
            }
        });
    };

    function buildMessage() {
        const message = {
            from: [{
                name: auth.realname,
                address: auth.emailAddress
            }],
            to: $scope.to.filter(filterEmptyAddresses),
            cc: $scope.cc.filter(filterEmptyAddresses),
            bcc: $scope.bcc.filter(filterEmptyAddresses),
            subject: $scope.subject.trim() ? $scope.subject.trim() : str.fallbackSubject,
            body: $scope.body.trim(),
            attachments: $scope.attachments,
            sentDate: new Date(),
            headers: {}
        };

        if ($scope.inReplyTo) {
            message.headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
        }

        if ($scope.references && $scope.references.length) {
            message.headers.references = $scope.references.map(function (reference) {
                return '<' + reference + '>';
            }).join(' ');
        }

        return message;
    }

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
        return $q(function (resolve) {
            resolve();
        }).then(function () {
            if ($scope.addressBookCache) {
                return;
            }
            return keychain.listLocalPublicKeys().then(function (keys) {
                $scope.addressBookCache = keys.map(function (key) {
                    const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                    return {
                        address: key.userId,
                        displayId: name + ' - ' + key.userId
                    };
                });
            });
        }).then(function () {
            return $scope.addressBookCache.filter(function (i) {
                return i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
            });
        }).catch(dialog.error);
    };

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