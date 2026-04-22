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
            populateWriteFields(replyTo, replyAll, forward);
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

    /** Prepare a bug‑report email */
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

    /** Populate fields for write/reply/forward actions */
    function populateWriteFields(replyToMsg, replyAll, forward) {
        if (!replyToMsg) {
            return;
        }
        setWriterTitle(forward);
        const replyTo = determineReplyTo(replyToMsg);
        if (!forward) {
            addPrimaryRecipient(replyTo);
            copyReferences(replyToMsg);
        }
        if (replyAll) {
            addAllRecipients(replyToMsg, replyTo);
        }
        if (forward) {
            copyAttachments(replyToMsg);
        }
        setSubject(replyToMsg, forward);
        composeBody(replyToMsg, forward, replyTo);
    }

    /** Set writer title based on action */
    function setWriterTitle(isForward) {
        $scope.writerTitle = isForward ? 'Forward' : 'Reply';
    }

    /** Determine the address to reply to */
    function determineReplyTo(msg) {
        return (msg.replyTo && msg.replyTo[0] && msg.replyTo[0].address) || msg.from[0].address;
    }

    /** Add the primary recipient for a reply */
    function addPrimaryRecipient(address) {
        $scope.to.unshift({ address });
        $scope.to.forEach($scope.verify);
    }

    /** Copy references and in‑reply‑to from the original message */
    function copyReferences(msg) {
        $scope.references = msg.references ? [...msg.references] : [];
        if (msg.id && $scope.references.indexOf(msg.id) < 0) {
            $scope.references.push(msg.id);
        }
        if (msg.id) {
            $scope.inReplyTo = msg.id;
        }
    }

    /** Add all recipients for a reply‑all action */
    function addAllRecipients(msg, originalReplyTo) {
        const me = auth.emailAddress;
        const all = [...msg.to, ...msg.cc];
        all.forEach(recipient => {
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
    function copyAttachments(msg) {
        $scope.attachments = [...msg.attachments];
        if (msg.id) {
            $scope.references = [msg.id];
        }
    }

    /** Set email subject based on action */
    function setSubject(msg, isForward) {
        if (isForward) {
            $scope.subject = `Fwd: ${msg.subject}`;
        } else {
            $scope.subject = msg.subject ? `Re: ${msg.subject.replace('Re: ', '')}` : '';
        }
    }

    /** Compose the email body for reply or forward */
    function composeBody(msg, isForward, replyTo) {
        const fromName = msg.from[0].name || replyTo;
        const sentDate = $filter('date')(msg.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const addressListString = list => {
            return list
                .map(to => `${to.name || to.address} <${to.address}>`)
                .join(', ');
        };

        let bodyPrefix;
        if (isForward) {
            bodyPrefix = [
                '',
                '',
                '---------- Forwarded message ----------',
                `From: ${msg.from[0].name} <${msg.from[0].address}>`,
                `Date: ${sentDate}`,
                `Subject: ${msg.subject}`,
                `To: ${addressListString(msg.to)}`,
                msg.cc && msg.cc.length ? `Cc: ${addressListString(msg.cc)}` : '',
                '',
                ''
            ].join('\n');
        } else {
            bodyPrefix = `\n\n${sentDate} ${fromName} wrote:\n> `;
        }

        if (msg.body) {
            const quotedBody = msg.body
                .trim()
                .split('\n')
                .join('\n> ')
                .replace(/ >/g, '>');
            $scope.body = bodyPrefix + quotedBody;
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
            .then(key => handleKeyResult(key, recipient))
            .catch(dialog.error);
    };

    /** Process key lookup result for a recipient */
    function handleKeyResult(key, recipient) {
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
        const { allSecure, numReceivers } = evaluateRecipientsSecurity();
        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        const bccPresent = $scope.bcc.filter(filterEmptyAddresses).length > 0;
        const secure = allSecure && !bccPresent;

        updateSendButton(secure);
    };

    /** Evaluate security of all recipients */
    function evaluateRecipientsSecurity() {
        let allSecure = true;
        let numReceivers = 0;

        const check = recipient => {
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

    /** Update UI elements based on security status */
    function updateSendButton(isSecure) {
        $scope.okToSend = true;
        $scope.sendBtnText = isSecure ? str.sendBtnSecure : str.sendBtnClear;
        $scope.sendBtnSecure = isSecure;
        $scope.showInvite = !isSecure;
    }

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
        const invitees = collectInvitees();

        $scope.showInvite = false;

        return $q.resolve()
            .then(() => sendInvitations(sender, invitees))
            .catch(err => {
                $scope.showInvite = true;
                return dialog.error(err);
            });
    };

    /** Collect addresses that need an invitation */
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

    /** Send invitation emails to the given addresses */
    function sendInvitations(sender, invitees) {
        const sendJobs = [];

        invitees.forEach(recipientAddress => {
            const invitationMail = invitation.createMail({
                sender,
                recipient: recipientAddress
            });
            const job = outbox
                .put(invitationMail)
                .then(() => invitation.invite({ recipient: recipientAddress, sender }));
            sendJobs.push(job);
            $scope.invited.push(recipientAddress);
        });

        return Promise.all(sendJobs);
    }

    //
    // Editing email body
    //
    $scope.sendToOutbox = function () {
        const message = buildMessageModel();

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

    /** Build the email model for outbox persistence */
    function buildMessageModel() {
        const clean = arr => arr.filter(filterEmptyAddresses);
        return {
            from: [{ name: auth.realname, address: auth.emailAddress }],
            to: clean($scope.to),
            cc: clean($scope.cc),
            bcc: clean($scope.bcc),
            subject: $scope.subject.trim() || str.fallbackSubject,
            body: $scope.body.trim(),
            attachments: $scope.attachments,
            sentDate: new Date(),
            headers: buildHeaders()
        };
    }

    /** Construct email headers based on reply information */
    function buildHeaders() {
        const hdr = {};
        if ($scope.inReplyTo) {
            hdr['in-reply-to'] = `<${$scope.inReplyTo}>`;
        }
        if ($scope.references && $scope.references.length) {
            hdr.references = $scope.references
                .map(ref => `<${ref}>`)
                .join(' ');
        }
        return hdr;
    }

    /** Update reply flag on the original message if needed */
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

    /** Filter cached address book entries by query */
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