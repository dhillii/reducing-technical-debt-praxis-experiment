'use strict';

const util = require('crypto-lib').util;

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

    const resetFields = () => {
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
    };

    const reportBug = () => {
        let dump = '';
        const appender = {
            log: (level, date, component, log) => {
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
    };

    const createString = (array) => {
        let result = '';
        array.forEach((to) => {
            result += result ? ', ' : '';
            result += (to.name ? to.name : to.address) + ' <' + to.address + '>';
        });
        return result;
    };

    const fillFields = (re, replyAll, forward) => {
        if (!re) {
            return;
        }

        $scope.writerTitle = forward ? 'Forward' : 'Reply';

        const replyTo = re.replyTo && re.replyTo[0] && re.replyTo[0].address || re.from[0].address;

        if (!forward) {
            $scope.to.unshift({ address: replyTo });
            $scope.to.forEach($scope.verify);

            $scope.references = (re.references || []);
            if (re.id && $scope.references.indexOf(re.id) < 0) {
                $scope.references = $scope.references.concat(re.id);
            }
            if (re.id) {
                $scope.inReplyTo = re.id;
            }
        }

        if (replyAll) {
            re.to.concat(re.cc).forEach((recipient) => {
                const me = auth.emailAddress;
                if (recipient.address === me && replyTo !== me) {
                    return;
                }
                $scope.cc.unshift({ address: recipient.address });
            });

            $scope.cc = _.uniq($scope.cc, (recipient) => recipient.address);
            $scope.showCC = true;
            $scope.cc.forEach($scope.verify);
        }

        if (forward) {
            $scope.attachments = [].concat(re.attachments);
            if (re.id) {
                $scope.references = [re.id];
            }
        }

        setSubject(re, forward);
        setBody(re, forward, replyTo);
    };

    const setSubject = (re, forward) => {
        if (forward) {
            $scope.subject = 'Fwd: ' + re.subject;
        } else {
            $scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
        }
    };

    const setBody = (re, forward, replyTo) => {
        const from = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');
        let body = '';

        if (forward) {
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + re.subject + '\n' +
                'To: ' + createString(re.to) + '\n' +
                (re.cc && re.cc.length > 0 ? 'Cc: ' + createString(re.cc) + '\n' : '') +
                '\n\n';
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (re.body) {
            body += re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
            $scope.body = body;
        }
    };

    //
    // Editing headers
    //

    $scope.toggleShowBCC = () => {
        $scope.showBCC = true;
        return dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    };

    $scope.verify = (recipient) => {
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

        return $q(() => {}).then(() => {
            return keychain.refreshKeyForUserId({ userId: recipient.address });
        }).then((key) => {
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
        }).catch(dialog.error);
    };

    $scope.checkSendStatus = () => {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        let allSecure = true;
        let numReceivers = 0;

        const check = (recipient) => {
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

    $scope.remove = (attachment) => {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    $scope.invite = () => {
        const sender = auth.emailAddress;
        const sendJobs = [];
        const invitees = [];

        $scope.showInvite = false;

        const check = (recipient) => {
            if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        };

        $scope.to.forEach(check);
        $scope.cc.forEach(check);
        $scope.bcc.forEach(check);

        return $q(() => {}).then(() => {
            invitees.forEach((recipientAddress) => {
                const invitationMail = invitation.createMail({
                    sender,
                    recipient: recipientAddress
                });
                const promise = outbox.put(invitationMail).then(() => {
                    return invitation.invite({
                        recipient: recipientAddress,
                        sender
                    });
                });
                sendJobs.push(promise);
                $scope.invited.push(recipientAddress);
            });

            return Promise.all(sendJobs);
        }).catch((err) => {
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
            message.headers.references = $scope.references.map((reference) => '<' + reference + '>').join(' ');
        }

        $scope.state.writer.close();
        if ($scope.replyTo) {
            status.setReading(false);
        }

        return $q(() => {}).then(() => {
            return outbox.put(message);
        }).then(() => {
            if (!$scope.replyTo || $scope.replyTo.answered) {
                return;
            }
            $scope.replyTo.answered = true;
            return email.setFlags({
                folder: currentFolder(),
                message: $scope.replyTo
            });
        }).catch((err) => {
            if (err.code !== 42) {
                dialog.error(err);
            }
        });
    };

    //
    // Tag input & Autocomplete
    //

    $scope.tagStyle = (recipient) => {
        const classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    };

    $scope.lookupAddressBook = (query) => {
        return $q(() => {}).then(() => {
            if ($scope.addressBookCache) {
                return;
            }
            return keychain.listLocalPublicKeys().then((keys) => {
                $scope.addressBookCache = keys.map((key) => {
                    const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                    return {
                        address: key.userId,
                        displayId: name + ' - ' + key.userId
                    };
                });
            });
        }).then(() => {
            return $scope.addressBookCache.filter((i) => i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1);
        }).catch(dialog.error);
    };

    //
    // Helpers
    //

    const currentFolder = () => $scope.state.nav.currentFolder;

    const filterEmptyAddresses = (addr) => !!addr.address;
};

module.exports = WriteCtrl;