'use strict';

const util = require('crypto-lib').util;

//
// Controller
//
const WriteCtrl = function (
    $scope,
    $window,
    $filter,
    $q,
    appConfig,
    auth,
    keychain,
    pgp,
    email,
    outbox,
    dialog,
    axe,
    status,
    invitation
) {
    const str = appConfig.string;
    const cfg = appConfig.config;

    // set default value so that the popover height is correct on init
    $scope.keyId = 'XXXXXXXX';

    //
    // Init
    //
    $scope.state.writer = {
        write(replyTo, replyAll, forward) {
            $scope.state.lightbox = 'write';
            $scope.replyTo = replyTo;

            resetFields();
            populateFields(replyTo, replyAll, forward);
            $scope.verify($scope.to[0]);
        },

        reportBug() {
            $scope.state.lightbox = 'write';
            resetFields();
            prepareBugReport();
            $scope.verify($scope.to[0]);
        },

        close() {
            $scope.state.lightbox = undefined;
        }
    };

    /** Reset all writer fields to their default state */
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

    /** Prepare a bug‑report email with a dump of the log */
    function prepareBugReport() {
        let dump = '';
        const appender = {
            log(level, date, component, log) {
                const levelTag = {
                    [axe.DEBUG]: '[DEBUG]',
                    [axe.INFO]: '[INFO]',
                    [axe.WARN]: '[WARN]',
                    [axe.ERROR]: '[ERROR]'
                }[level] || '';
                dump += `${levelTag}[${date.toISOString()}]`;
                if (component) {
                    dump += `[${component}]`;
                }
                dump += ` ${String(log || '')}`;
                if (log && log.stack) {
                    dump += ` . Stack: ${log.stack}`;
                }
                dump += '\n';
            }
        };
        axe.dump(appender);

        $scope.to = [{ address: str.supportAddress }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body =
            str.bugReportBody
                .replace('{0}', navigator.userAgent)
                .replace('{1}', cfg.appVersion) + dump;
    }

    /** Populate fields for reply, reply‑all or forward actions */
    function populateFields(re, replyAll, forward) {
        if (!re) {
            return;
        }

        $scope.writerTitle = forward ? 'Forward' : 'Reply';
        const replyTo = (re.replyTo && re.replyTo[0] && re.replyTo[0].address) || re.from[0].address;

        if (!forward) {
            addRecipient($scope.to, replyTo);
            $scope.to.forEach($scope.verify);
            setReferences(re);
        }

        if (replyAll) {
            addReplyAllRecipients(re, replyTo);
        }

        if (forward) {
            copyAttachments(re);
            setForwardReferences(re);
        }

        setSubject(re, forward);
        composeBody(re, forward, replyTo);
    }

    /** Add a single recipient to a list, ensuring uniqueness */
    function addRecipient(list, address) {
        list.unshift({ address });
    }

    /** Set reference and in‑reply‑to fields for a normal reply */
    function setReferences(re) {
        $scope.references = re.references ? re.references.slice() : [];
        if (re.id && $scope.references.indexOf(re.id) < 0) {
            $scope.references = $scope.references.concat(re.id);
        }
        if (re.id) {
            $scope.inReplyTo = re.id;
        }
    }

    /** Add CC recipients for a reply‑all action */
    function addReplyAllRecipients(re, originalReplyTo) {
        const me = auth.emailAddress;
        re.to.concat(re.cc).forEach(recipient => {
            if (recipient.address === me && originalReplyTo !== me) {
                return; // skip self
            }
            addRecipient($scope.cc, recipient.address);
        });
        $scope.cc = _.uniq($scope.cc, r => r.address);
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    /** Copy attachments when forwarding */
    function copyAttachments(re) {
        $scope.attachments = (re.attachments || []).slice();
    }

    /** Set reference list when forwarding */
    function setForwardReferences(re) {
        if (re.id) {
            $scope.references = [re.id];
        }
    }

    /** Determine the subject line based on action */
    function setSubject(re, forward) {
        if (forward) {
            $scope.subject = `Fwd: ${re.subject}`;
        } else {
            $scope.subject = re.subject ? `Re: ${re.subject.replace('Re: ', '')}` : '';
        }
    }

    /** Compose the email body for reply or forward */
    function composeBody(re, forward, replyTo) {
        const fromName = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const addressString = arr =>
            arr
                .map(to => `${to.name || to.address} <${to.address}>`)
                .join(', ');

        let bodyHeader;
        if (forward) {
            bodyHeader = [
                '',
                '',
                '---------- Forwarded message ----------',
                `From: ${re.from[0].name} <${re.from[0].address}>`,
                `Date: ${sentDate}`,
                `Subject: ${re.subject}`,
                `To: ${addressString(re.to)}`,
                re.cc && re.cc.length ? `Cc: ${addressString(re.cc)}` : '',
                '',
                ''
            ].join('\n');
        } else {
            bodyHeader = `\n\n${sentDate} ${fromName} wrote:\n> `;
        }

        if (re.body) {
            const quotedBody = re.body
                .trim()
                .split('\n')
                .join('\n> ')
                .replace(/ >/g, '>');
            $scope.body = bodyHeader + quotedBody;
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
            .then(key => handleKeyResult(recipient, key))
            .catch(dialog.error);
    };

    /** Ensure recipient object has address and displayId fields */
    function normalizeRecipient(recipient) {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    }

    /** Process the result of a key lookup */
    function handleKeyResult(recipient, key) {
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
    }

    /** Check if it is ok to send an email depending on the invitation state of the addresses */
    $scope.checkSendStatus = function () {
        const status = computeSendStatus($scope.to, $scope.cc, $scope.bcc);
        $scope.okToSend = status.canSend;
        $scope.sendBtnText = status.buttonText;
        $scope.sendBtnSecure = status.isSecure;
        $scope.showInvite = status.showInvite;
    };

    /**
     * Compute send status based on recipient lists.
     * Returns an object with flags for UI.
     */
    function computeSendStatus(toList, ccList, bccList) {
        let allSecure = true;
        let receiverCount = 0;
        let showInvite = false;

        const validate = recipient => {
            if (!util.validateEmailAddress(recipient.address)) {
                dialog.info({
                    title: 'Warning',
                    message: 'Invalid recipient address!'
                });
                return;
            }
            receiverCount++;
            if (!recipient.secure) {
                allSecure = false;
            }
        };

        toList.forEach(validate);
        ccList.forEach(validate);
        bccList.forEach(validate);

        if (receiverCount < 1) {
            return { canSend: false, buttonText: undefined, isSecure: undefined, showInvite: false };
        }

        if (bccList.filter(filterEmptyAddresses).length > 0) {
            allSecure = false;
        }

        if (allSecure) {
            return {
                canSend: true,
                buttonText: str.sendBtnSecure,
                isSecure: true,
                showInvite: false
            };
        }

        return {
            canSend: true,
            buttonText: str.sendBtnClear,
            isSecure: false,
            showInvite
        };
    }

    //
    // Editing attachments
    //
    $scope.remove = function (attachment) {
        const idx = $scope.attachments.indexOf(attachment);
        if (idx > -1) {
            $scope.attachments.splice(idx, 1);
        }
    };

    /**
     * Invite all users without a public key
     */
    $scope.invite = function () {
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

    /** Gather addresses that need an invitation */
    function collectInvitees() {
        const list = [];

        const check = recipient => {
            if (
                util.validateEmailAddress(recipient.address) &&
                !recipient.secure &&
                $scope.invited.indexOf(recipient.address) === -1
            ) {
                list.push(recipient.address);
            }
        };

        $scope.to.forEach(check);
        $scope.cc.forEach(check);
        $scope.bcc.forEach(check);
        return list;
    }

    /** Send invitation mails and record invited addresses */
    function sendInvitations(sender, invitees) {
        const sendJobs = [];

        invitees.forEach(recipientAddress => {
            const invitationMail = invitation.createMail({
                sender,
                recipient: recipientAddress
            });

            const job = outbox
                .put(invitationMail)
                .then(() => invitation.invite({ recipient: recipientAddress, sender }))
                .then(() => {
                    $scope.invited.push(recipientAddress);
                });

            sendJobs.push(job);
        });

        return Promise.all(sendJobs);
    }

    //
    // Editing email body
    //
    $scope.sendToOutbox = function () {
        const message = buildMessage();

        // close the writer UI
        $scope.state.writer.close();

        // close read mode after reply
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

    /** Build the email model for the outbox */
    function buildMessage() {
        const msg = {
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
            msg.headers['in-reply-to'] = `<${$scope.inReplyTo}>`;
        }

        if ($scope.references && $scope.references.length) {
            msg.headers.references = $scope.references
                .map(ref => `<${ref}>`)
                .join(' ');
        }

        return msg;
    }

    /** Synchronize the answered flag for a replied message */
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
    $scope.tagStyle = function (recipient) {
        const classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    };

    $scope.lookupAddressBook = function (query) {
        return $q.resolve()
            .then(() => ensureAddressBookCache())
            .then(() => filterAddressBook(query))
            .catch(dialog.error);
    };

    /** Populate address book cache if not already loaded */
    function ensureAddressBookCache() {
        if ($scope.addressBookCache) {
            return;
        }
        return keychain.listLocalPublicKeys().then(keys => {
            $scope.addressBookCache = keys.map(key => {
                const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                return {
                    address: key.userId,
                    displayId: `${name} - ${key.userId}`
                };
            });
        });
    }

    /** Filter cached address book entries based on the query */
    function filterAddressBook(query) {
        const lower = query.toLowerCase();
        return $scope.addressBookCache.filter(entry =>
            entry.displayId.toLowerCase().includes(lower)
        );
    }

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