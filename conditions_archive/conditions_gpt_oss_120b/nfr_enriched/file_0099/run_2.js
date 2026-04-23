```javascript
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
            composeBugReport();
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

    /** Compose a bug‑report email */
    function composeBugReport() {
        const dump = collectLogDump();
        $scope.to = [{ address: str.supportAddress }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body =
            str.bugReportBody
                .replace('{0}', navigator.userAgent)
                .replace('{1}', cfg.appVersion) + dump;
    }

    /** Gather log dump from axe */
    function collectLogDump() {
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
                if (component) dump += `[${component}]`;
                dump += ` ${String(log || '')}`;
                if (log && log.stack) dump += ` . Stack: ${log.stack}`;
                dump += '\n';
            }
        };
        axe.dump(appender);
        return dump;
    }

    /** Populate fields for write/reply/forward actions */
    function populateWriteFields(replyToMsg, replyAll, forward) {
        if (!replyToMsg) return;
        setWriterTitle(forward);
        const replyAddress = getReplyAddress(replyToMsg);
        if (!forward) {
            addRecipient($scope.to, replyAddress);
            $scope.references = buildReferences(replyToMsg);
            $scope.inReplyTo = replyToMsg.id || undefined;
        }
        if (replyAll) addAllRecipients(replyToMsg, replyAddress);
        if (forward) addForwardAttachments(replyToMsg);
        setSubject(replyToMsg, forward);
        setBody(replyToMsg, forward);
    }

    /** Set writer title based on action */
    function setWriterTitle(isForward) {
        $scope.writerTitle = isForward ? 'Forward' : 'Reply';
    }

    /** Determine the address to reply to */
    function getReplyAddress(msg) {
        return (msg.replyTo && msg.replyTo[0] && msg.replyTo[0].address) ||
            (msg.from && msg.from[0] && msg.from[0].address);
    }

    /** Add a single recipient to a list and verify it */
    function addRecipient(list, address) {
        list.unshift({ address });
        $scope.verify(list[0]);
    }

    /** Build reference list for a reply */
    function buildReferences(msg) {
        const refs = msg.references ? msg.references.slice() : [];
        if (msg.id && refs.indexOf(msg.id) < 0) refs.push(msg.id);
        return refs;
    }

    /** Add all recipients for a reply‑all */
    function addAllRecipients(msg, originalReply) {
        const me = auth.emailAddress;
        const all = msg.to.concat(msg.cc || []);
        all.forEach(recipient => {
            if (recipient.address === me && originalReply !== me) return;
            $scope.cc.unshift({ address: recipient.address });
        });
        $scope.cc = _.uniq($scope.cc, r => r.address);
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    /** Copy attachments for a forward */
    function addForwardAttachments(msg) {
        $scope.attachments = (msg.attachments || []).slice();
        if (msg.id) $scope.references = [msg.id];
    }

    /** Set email subject */
    function setSubject(msg, isForward) {
        if (isForward) {
            $scope.subject = `Fwd: ${msg.subject}`;
        } else {
            $scope.subject = msg.subject ? `Re: ${msg.subject.replace('Re: ', '')}` : '';
        }
    }

    /** Set email body */
    function setBody(msg, isForward) {
        const fromName = msg.from[0].name || getReplyAddress(msg);
        const sentDate = $filter('date')(msg.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const createString = arr => arr.map(to => `${to.name || to.address} <${to.address}>`).join(', ');

        let body = '';
        if (isForward) {
            body = [
                '',
                '',
                '---------- Forwarded message ----------',
                `From: ${msg.from[0].name} <${msg.from[0].address}>`,
                `Date: ${sentDate}`,
                `Subject: ${msg.subject}`,
                `To: ${createString(msg.to)}`,
                msg.cc && msg.cc.length ? `Cc: ${createString(msg.cc)}` : '',
                '',
                ''
            ].join('\n');
        } else {
            body = `\n\n${sentDate} ${fromName} wrote:\n> `;
        }

        if (msg.body) {
            const quoted = msg.body.trim().split('\n').map(l => l.replace(/^ >/, '>')).join('\n> ');
            $scope.body = body + quoted;
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
        if (!recipient) return;
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

    /** Ensure recipient has address/displayId set correctly */
    function normalizeRecipient(recipient) {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    }

    /** Process key lookup result */
    function handleKeyResult(key, recipient) {
        if (key) {
            const userIds = pgp.getKeyParams(key.publicKey).userIds;
            const match = _.findWhere(userIds, { emailAddress: recipient.address });
            if (match) {
                recipient.key = key;
                recipient.secure = true;
            }
        } else {
            $scope.showInvite = true;
        }
        $scope.checkSendStatus();
    }

    /** Check if it is ok to send an email depending on the invitation state of the addresses */
    $scope.checkSendStatus = () => {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        const counts = countRecipients();
        if (counts.total < 1) {
            $scope.showInvite = false;
            return;
        }

        if (hasBcc()) {
            counts.allSecure = false;
        }

        updateSendButton(counts.allSecure);
    };

    /** Count recipients and evaluate overall security */
    function countRecipients() {
        let total = 0;
        let allSecure = true;

        const evaluate = recipient => {
            if (!util.validateEmailAddress(recipient.address)) {
                dialog.info({
                    title: 'Warning',
                    message: 'Invalid recipient address!'
                });
                return;
            }
            total++;
            if (!recipient.secure) allSecure = false;
        };

        $scope.to.forEach(evaluate);
        $scope.cc.forEach(evaluate);
        $scope.bcc.forEach(evaluate);

        return { total, allSecure };
    }

    /** Determine if any BCC addresses are present */
    function hasBcc() {
        return $scope.bcc.filter(filterEmptyAddresses).length > 0;
    }

    /** Update UI based on security status */
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
    $scope.remove = attachment => {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    /**
     * Invite all users without a public key
     */
    $scope.invite = () => {
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

    /** Send invitation emails */
    function sendInvitations(sender, invitees) {
        const promises = invitees.map(recipientAddress => {
            const invitationMail = invitation.createMail({
                sender,
                recipient: recipientAddress
            });
            const sendPromise = outbox.put(invitationMail).then(() =>
                invitation.invite({
                    recipient: recipientAddress,
                    sender
                })
            );
            $scope.invited.push(recipientAddress);
            return sendPromise;
        });
        return Promise.all(promises);
    }

    //
    // Editing email body
    //
    $scope.sendToOutbox = () => {
        const message = buildMessageModel();

        $scope.state.writer.close();
        if ($scope.replyTo) status.setReading(false);

        return $q.resolve()
            .then(() => outbox.put(message))
            .then(() => syncReplyFlag())
            .catch(err => {
                if (err.code !== 42) dialog.error(err);
            });
    };

    /** Build the email model for outbox */
    function buildMessageModel() {
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

    /** Construct email headers */
    function buildHeaders() {
        const hdr = {};
        if ($scope.inReplyTo) hdr['in-reply-to'] = `<${$scope.inReplyTo}>`;
        if ($scope.references && $scope.references.length) {
            hdr.references = $scope.references
                .map(ref => `<${ref}>`)
                .join(' ');
        }
        return hdr;
    }

    /** Synchronize reply flag with IMAP if needed */
    function syncReplyFlag() {
        if (!$scope.replyTo || $scope.replyTo.answered) return;
        $scope.replyTo.answered = true;
        return email.setFlags({
            folder: currentFolder(),
            message: $scope.replyTo
        });
    }

    //
    // Tag input & Autocomplete
    //
    $scope.tagStyle = recipient => {
        const classes = ['label'];
        if (recipient.secure === false) classes.push('label--invalid');
        return classes;
    };

    $scope.lookupAddressBook = query => {
        return $q.resolve()
            .then(() => ensureAddressBookCache())
            .then(() => filterAddressBook(query))
            .catch(dialog.error);
    };

    /** Load address book cache if not already loaded */
    function ensureAddressBookCache() {
        if ($scope.addressBookCache) return;
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

    /** Filter cached address book entries */
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

    /** Visitor to filter out objects without an address property, i.e. empty addresses */
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;
```