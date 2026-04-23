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
        write: (replyTo, replyAll, forward) => {
            $scope.state.lightbox = 'write';
            $scope.replyTo = replyTo;
            resetFields();
            populateWriteFields(replyTo, replyAll, forward);
            $scope.verify($scope.to[0]);
        },
        reportBug: () => {
            $scope.state.lightbox = 'write';
            resetFields();
            generateBugReport();
            $scope.verify($scope.to[0]);
        },
        close: () => {
            $scope.state.lightbox = undefined;
        }
    };

    /** Reset all writer fields to defaults */
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

    /** Generate a bug report email */
    function generateBugReport() {
        let dump = '';
        const appender = {
            log: (level, date, component, log) => {
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
        $scope.body = str.bugReportBody
            .replace('{0}', navigator.userAgent)
            .replace('{1}', cfg.appVersion) + dump;
    }

    /** Populate fields for write/reply/forward actions */
    function populateWriteFields(re, replyAll, forward) {
        if (!re) {
            return;
        }
        setWriterTitle(forward);
        const replyTo = determineReplyTo(re);
        if (!forward) {
            addPrimaryRecipient(replyTo);
            setReferencesAndInReplyTo(re);
        }
        if (replyAll) {
            addCcRecipients(re, replyTo);
        }
        if (forward) {
            copyAttachments(re);
            setForwardReferences(re);
        }
        setSubject(re, forward);
        composeBody(re, forward, replyTo);
    }

    /** Set writer title based on action */
    function setWriterTitle(isForward) {
        $scope.writerTitle = isForward ? 'Forward' : 'Reply';
    }

    /** Determine the address to reply to */
    function determineReplyTo(re) {
        return (re.replyTo && re.replyTo[0] && re.replyTo[0].address) || re.from[0].address;
    }

    /** Add the primary recipient for a reply */
    function addPrimaryRecipient(address) {
        $scope.to.unshift({ address });
        $scope.to.forEach($scope.verify);
    }

    /** Set references and In-Reply-To header for a reply */
    function setReferencesAndInReplyTo(re) {
        $scope.references = (re.references || []).slice();
        if (re.id && $scope.references.indexOf(re.id) < 0) {
            $scope.references = $scope.references.concat(re.id);
        }
        if (re.id) {
            $scope.inReplyTo = re.id;
        }
    }

    /** Add CC recipients for reply‑all */
    function addCcRecipients(re, originalReplyTo) {
        const me = auth.emailAddress;
        re.to.concat(re.cc).forEach(recipient => {
            if (recipient.address === me && originalReplyTo !== me) {
                return;
            }
            $scope.cc.unshift({ address: recipient.address });
        });
        $scope.cc = _.uniq($scope.cc, r => r.address);
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    /** Copy attachments when forwarding */
    function copyAttachments(re) {
        $scope.attachments = [].concat(re.attachments);
    }

    /** Set references for a forwarded message */
    function setForwardReferences(re) {
        if (re.id) {
            $scope.references = [re.id];
        }
    }

    /** Set email subject based on action */
    function setSubject(re, isForward) {
        if (isForward) {
            $scope.subject = 'Fwd: ' + re.subject;
        } else {
            $scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
        }
    }

    /** Compose the email body for reply or forward */
    function composeBody(re, isForward, replyTo) {
        const fromName = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const addressListToString = list => {
            return list.map(to => `${to.name ? to.name : to.address} <${to.address}>`).join(', ');
        };

        let bodyHeader;
        if (isForward) {
            bodyHeader = '\n\n---------- Forwarded message ----------\n' +
                `From: ${re.from[0].name} <${re.from[0].address}>\n` +
                `Date: ${sentDate}\n` +
                `Subject: ${re.subject}\n` +
                `To: ${addressListToString(re.to)}\n` +
                (re.cc && re.cc.length > 0 ? `Cc: ${addressListToString(re.cc)}\n` : '') +
                '\n\n';
        } else {
            bodyHeader = `\n\n${sentDate} ${fromName} wrote:\n> `;
        }

        if (re.body) {
            const formattedBody = re.body.trim()
                .split('\n')
                .join('\n> ')
                .replace(/ >/g, '>');
            $scope.body = bodyHeader + formattedBody;
        }
    }

    //
    // Editing headers
    //

    /** Warn users when using BCC */
    $scope.toggleShowBCC = () => {
        $scope.showBCC = true;
        return dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    };

    /** Verify email address and fetch its public key */
    $scope.verify = recipient => {
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
    $scope.checkSendStatus = () => {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        let allSecure = true;
        let numReceivers = 0;

        const validateRecipient = recipient => {
            if (!util.validateEmailAddress(recipient.address)) {
                return dialog.info({
                    title: 'Warning',
                    message: 'Invalid recipient address!'
                });
            }
            numReceivers++;
            if (!recipient.secure) {
                allSecure = false;
            }
        };

        $scope.to.forEach(validateRecipient);
        $scope.cc.forEach(validateRecipient);
        $scope.bcc.forEach(validateRecipient);

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
    $scope.remove = attachment => {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    /** Invite all users without a public key */
    $scope.invite = () => {
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
                    const invitationMail = invitation.createMail({
                        sender,
                        recipient: recipientAddress
                    });
                    const promise = outbox.put(invitationMail)
                        .then(() => invitation.invite({
                            recipient: recipientAddress,
                            sender
                        }));
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
    $scope.sendToOutbox = () => {
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
            message.headers.references = $scope.references
                .map(ref => `<${ref}>`)
                .join(' ');
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

    //
    // Tag input & Autocomplete
    //
    $scope.tagStyle = recipient => {
        const classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    };

    $scope.lookupAddressBook = query => {
        return $q.resolve()
            .then(() => {
                if ($scope.addressBookCache) {
                    return;
                }
                return keychain.listLocalPublicKeys()
                    .then(keys => {
                        $scope.addressBookCache = keys.map(key => {
                            const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                            return {
                                address: key.userId,
                                displayId: `${name} - ${key.userId}`
                            };
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