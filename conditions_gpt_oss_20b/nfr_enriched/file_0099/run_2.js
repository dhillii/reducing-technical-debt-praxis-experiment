'use strict';

const util = require('crypto-lib').util;

const WriteCtrl = function ($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {
    const str = appConfig.string;
    const cfg = appConfig.config;

    // set default value so that the popover height is correct on init
    $scope.keyId = 'XXXXXXXX';

    // --------------------------------------------------------------------
    // Init
    // --------------------------------------------------------------------
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
            reportBug();
            $scope.verify($scope.to[0]);
        },
        close: function () {
            $scope.state.lightbox = undefined;
        }
    };

    const resetFields = function () {
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

    const reportBug = function () {
        let dump = '';
        const appender = {
            log: function (level, date, component, log) {
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

    const fillFields = function (re, replyAll, forward) {
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
            re.to.concat(re.cc).forEach(function (recipient) {
                const me = auth.emailAddress;
                if (recipient.address === me && replyTo !== me) {
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

        if (forward) {
            $scope.attachments = [].concat(re.attachments);
            if (re.id) {
                $scope.references = [re.id];
            }
        }

        $scope.subject = buildSubject(re, forward);

        const body = buildBody(re, forward, replyTo);
        if (re.body) {
            $scope.body = body + re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        }
    };

    const buildSubject = function (re, forward) {
        if (forward) {
            return 'Fwd: ' + re.subject;
        }
        return re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
    };

    const buildBody = function (re, forward, replyTo) {
        const from = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const createString = function (array) {
            let str = '';
            array.forEach(function (to) {
                str += (str) ? ', ' : '';
                str += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
            });
            return str;
        };

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
    };

    // --------------------------------------------------------------------
    // Editing headers
    // --------------------------------------------------------------------
    $scope.toggleShowBCC = function () {
        $scope.showBCC = true;
        return dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    };

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

        $q(function (resolve) {
            resolve();
        }).then(function () {
            return keychain.refreshKeyForUserId({
                userId: recipient.address
            });
        }).then(function (key) {
            if (key) {
                const userIds = pgp.getKeyParams(key.publicKey).userIds;
                const matchingUserId = _.findWhere(userIds, {
                    emailAddress: recipient.address
                });
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

    $scope.checkSendStatus = function () {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        let allSecure = true;
        let numReceivers = 0;

        const validateAndCount = function (recipient) {
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

        $scope.to.forEach(validateAndCount);
        $scope.cc.forEach(validateAndCount);
        $scope.bcc.forEach(validateAndCount);

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

    // --------------------------------------------------------------------
    // Editing attachments
    // --------------------------------------------------------------------
    $scope.remove = function (attachment) {
        const index = $scope.attachments.indexOf(attachment);
        if (index !== -1) {
            $scope.attachments.splice(index, 1);
        }
    };

    $scope.invite = function () {
        const sender = auth.emailAddress;
        const sendJobs = [];
        const invitees = [];

        $scope.showInvite = false;

        const collectInvitees = function (recipient) {
            if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        };

        $scope.to.forEach(collectInvitees);
        $scope.cc.forEach(collectInvitees);
        $scope.bcc.forEach(collectInvitees);

        return $q(function (resolve) {
            resolve();
        }).then(function () {
            invitees.forEach(function (recipientAddress) {
                const invitationMail = invitation.createMail({
                    sender: sender,
                    recipient: recipientAddress
                });
                const promise = outbox.put(invitationMail).then(function () {
                    return invitation.invite({
                        recipient: recipientAddress,
                        sender: sender
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

    // --------------------------------------------------------------------
    // Editing email body
    // --------------------------------------------------------------------
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

    const buildMessage = function () {
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
    };

    // --------------------------------------------------------------------
    // Tag input & Autocomplete
    // --------------------------------------------------------------------
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

    // --------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------
    const currentFolder = function () {
        return $scope.state.nav.currentFolder;
    };

    const filterEmptyAddresses = function (addr) {
        return !!addr.address;
    };
};

module.exports = WriteCtrl;