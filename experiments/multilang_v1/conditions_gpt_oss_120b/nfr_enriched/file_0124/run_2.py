class PassportNexus(HTTPClient):
    """
    Used to obtain the URL of a valid passport
    login HTTPS server.

    This class is used internally and should
    not be instantiated directly -- that is,
    The passport logging in process is handled
    transparently by NotificationClient.
    """

    def __init__(self, deferred, host):
        self.deferred = deferred
        self.host, self.path = _parsePrimitiveHost(host)

    def connectionMade(self):
        HTTPClient.connectionMade(self)
        self.sendCommand('GET', self.path)
        self.sendHeader('Host', self.host)
        self.endHeaders()
        self.headers = {}

    def handleHeader(self, header, value):
        h = header.lower()
        self.headers[h] = _parseHeader(h, value)

    def handleEndHeaders(self):
        if self.connected:
            self.transport.loseConnection()
        if 'passporturls' not in self.headers or 'dalogin' not in self.headers['passporturls']:
            self.deferred.errback(failure.Failure(failure.DefaultException("Invalid Nexus Reply")))
        self.deferred.callback('https://' + self.headers['passporturls']['dalogin'])

    def handleResponse(self, r):
        # No response body processing required for Nexus requests.
        pass


class PassportLogin(HTTPClient):
    """
    This class is used internally to obtain
    a login ticket from a passport HTTPS
    server -- it should not be used directly.
    """

    _finished = 0

    def __init__(self, deferred, userHandle, passwd, host, authData):
        self.deferred = deferred
        self.userHandle = userHandle
        self.passwd = passwd
        self.authData = authData
        self.host, self.path = _parsePrimitiveHost(host)

    def connectionMade(self):
        self.sendCommand('GET', self.path)
        self.sendHeader('Authorization', 'Passport1.4 OrgVerb=GET,OrgURL=http://messenger.msn.com,' +
                                         'sign-in=%s,pwd=%s,%s' % (quote(self.userHandle), self.passwd,self.authData))
        self.sendHeader('Host', self.host)
        self.endHeaders()
        self.headers = {}

    def handleHeader(self, header, value):
        h = header.lower()
        self.headers[h] = _parseHeader(h, value)

    def handleEndHeaders(self):
        if self._finished:
            return
        self._finished = 1  # I think we need this because of HTTPClient
        if self.connected:
            self.transport.loseConnection()
        authHeader = 'authentication-info'
        _interHeader = 'www-authenticate'
        if _interHeader in self.headers:
            authHeader = _interHeader
        try:
            info = self.headers[authHeader]
            status = info['da-status']
            handler = getattr(self, 'login_%s' % (status,), None)
            if handler:
                handler(info)
            else:
                raise Exception()
        except Exception as e:
            self.deferred.errback(failure.Failure(e))

    def handleResponse(self, r):
        # No response body processing required for login requests.
        pass

    def login_success(self, info):
        ticket = info['from-pp']
        ticket = ticket[1:len(ticket)-1]
        self.deferred.callback((LOGIN_SUCCESS, ticket))

    def login_failed(self, info):
        self.deferred.callback((LOGIN_FAILURE, unquote(info['cbtxt'])))

    def login_redir(self, info):
        self.deferred.callback((LOGIN_REDIRECT, self.headers['location'], self.authData))


class DispatchClient(MSNEventBase):
    """
    This class provides support for clients connecting to the dispatch server
    @ivar userHandle: your user handle (passport) needed before connecting.
    """

    # eventually this may become an attribute of the
    # factory.
    userHandle = ""

    def connectionMade(self):
        MSNEventBase.connectionMade(self)
        self.sendLine('VER %s %s' % (self._nextTransactionID(), MSN_PROTOCOL_VERSION))

    def handle_VER(self, params):
        id = self._nextTransactionID()
        self.sendLine("CVR %s %s %s" % (id, MSN_CVR_STR, self.userHandle))

    def handle_CVR(self, params):
        self.sendLine("USR %s TWN I %s" % (self._nextTransactionID(), self.userHandle))

    def handle_XFR(self, params):
        if len(params) < 4:
            raise MSNProtocolError, "Invalid number of parameters for XFR"
        id, refType, addr = params[:3]
        try:
            host, port = addr.split(':')
        except ValueError:
            host = addr
            port = MSN_PORT
        if refType == "NS":
            self.gotNotificationReferral(host, int(port))

    def gotNotificationReferral(self, host, port):
        # Subclasses should override to handle the referral.
        pass


class NotificationClient(MSNEventBase):
    """
    This class provides support for clients connecting
    to the notification server.
    """

    factory = None  # sssh pychecker

    def __init__(self, currentID=0):
        MSNEventBase.__init__(self)
        self.currentID = currentID
        self._state = ['DISCONNECTED', {}]

    def _setState(self, state):
        self._state[0] = state

    def _getState(self):
        return self._state[0]

    def _getStateData(self, key):
        return self._state[1][key]

    def _setStateData(self, key, value):
        self._state[1][key] = value

    def _remStateData(self, *args):
        for key in args:
            del self._state[1][key]

    def connectionMade(self):
        MSNEventBase.connectionMade(self)
        self._setState('CONNECTED')
        self.sendLine("VER %s %s" % (self._nextTransactionID(), MSN_PROTOCOL_VERSION))

    def connectionLost(self, reason):
        self._setState('DISCONNECTED')
        self._state[1] = {}
        MSNEventBase.connectionLost(self, reason)

    def checkMessage(self, message):
        """ hook used for detecting specific notification messages """
        cTypes = [s.lstrip() for s in message.getHeader('Content-Type').split(';')]
        if 'text/x-msmsgsprofile' in cTypes:
            self.gotProfile(message)
            return 0
        return 1

    def handle_VER(self, params):
        id = self._nextTransactionID()
        self.sendLine("CVR %s %s %s" % (id, MSN_CVR_STR, self.factory.userHandle))

    def handle_CVR(self, params):
        self.sendLine("USR %s TWN I %s" % (self._nextTransactionID(), self.factory.userHandle))

    def handle_USR(self, params):
        if len(params) != 4 and len(params) != 6:
            raise MSNProtocolError, "Invalid Number of Parameters for USR"

        mechanism = params[1]
        if mechanism == "OK":
            self.loggedIn(params[2], unquote(params[3]), int(params[4]))
        elif params[2].upper() == "S":
            f = self.factory
            d = execute(
                _login, f.userHandle, f.password, f.passportServer,
                authData=params[3])
            d.addCallback(self._passportLogin)
            d.addErrback(self._passportError)

    def _passportLogin(self, result):
        if result[0] == LOGIN_REDIRECT:
            d = _login(self.factory.userHandle, self.factory.password,
                       result[1], cached=1, authData=result[2])
            d.addCallback(self._passportLogin)
            d.addErrback(self._passportError)
        elif result[0] == LOGIN_SUCCESS:
            self.sendLine("USR %s TWN S %s" % (self._nextTransactionID(), result[1]))
        elif result[0] == LOGIN_FAILURE:
            self.loginFailure(result[1])

    def _passportError(self, failure):
        """
        Handle a problem logging in via the Passport server, passing on the
        error as a string message to the C{loginFailure} callback.
        """
        if failure.check(SSLRequired):
            failure = failure.getErrorMessage()
        self.loginFailure("Exception while authenticating: %s" % failure)

    def handle_CHG(self, params):
        checkParamLen(len(params), 3, 'CHG')
        id = int(params[0])
        if not self._fireCallback(id, params[1]):
            self.statusChanged(params[1])

    def handle_ILN(self, params):
        checkParamLen(len(params), 5, 'ILN')
        self.gotContactStatus(params[1], params[2], unquote(params[3]))

    def handle_CHL(self, params):
        checkParamLen(len(params), 2, 'CHL')
        self.sendLine("QRY %s msmsgs@msnmsgr.com 32" % self._nextTransactionID())
        self.transport.write(md5(params[1] + MSN_CHALLENGE_STR).hexdigest())

    def handle_QRY(self, params):
        # Subclasses may implement query response handling.
        pass

    def handle_NLN(self, params):
        checkParamLen(len(params), 4, 'NLN')
        self.contactStatusChanged(params[0], params[1], unquote(params[2]))

    def handle_FLN(self, params):
        checkParamLen(len(params), 1, 'FLN')
        self.contactOffline(params[0])

    def handle_LST(self, params):
        if self._getState() != 'SYNC':
            return
        contact = MSNContact(userHandle=params[0], screenName=unquote(params[1]),
                             lists=int(params[2]))
        if contact.lists & FORWARD_LIST:
            contact.groups.extend(map(int, params[3].split(',')))
        self._getStateData('list').addContact(contact)
        self._setStateData('last_contact', contact)
        sofar = self._getStateData('lst_sofar') + 1
        if sofar == self._getStateData('lst_reply'):
            self._setState('SESSION')
            contacts = self._getStateData('list')
            phone = self._getStateData('phone')
            id = self._getStateData('synid')
            self._remStateData('lst_reply', 'lsg_reply', 'lst_sofar', 'phone', 'synid', 'list')
            self._fireCallback(id, contacts, phone)
        else:
            self._setStateData('lst_sofar', sofar)

    def handle_BLP(self, params):
        if self._getState() == 'SYNC':
            self._getStateData('list').privacy = listCodeToID[params[0].lower()]
        else:
            id = int(params[0])
            self._fireCallback(id, int(params[1]), listCodeToID[params[2].lower()])

    def handle_GTC(self, params):
        if self._getState() == 'SYNC':
            if params[0].lower() == "a":
                self._getStateData('list').autoAdd = 0
            elif params[0].lower() == "n":
                self._getStateData('list').autoAdd = 1
            else:
                raise MSNProtocolError, "Invalid Parameter for GTC"
        else:
            id = int(params[0])
            if params[1].lower() == "a":
                self._fireCallback(id, 0)
            elif params[1].lower() == "n":
                self._fireCallback(id, 1)
            else:
                raise MSNProtocolError, "Invalid Parameter for GTC"

    def handle_SYN(self, params):
        id = int(params[0])
        if len(params) == 2:
            self._setState('SESSION')
            self._fireCallback(id, None, None)
        else:
            contacts = MSNContactList()
            contacts.version = int(params[1])
            self._setStateData('list', contacts)
            self._setStateData('lst_reply', int(params[2]))
            self._setStateData('lsg_reply', int(params[3]))
            self._setStateData('lst_sofar', 0)
            self._setStateData('phone', [])

    def handle_LSG(self, params):
        if self._getState() == 'SYNC':
            self._getStateData('list').groups[int(params[0])] = unquote(params[1])

    def handle_PRP(self, params):
        if self._getState() == 'SYNC':
            self._getStateData('phone').append((params[0], unquote(params[1])))
        else:
            self._fireCallback(int(params[0]), int(params[1]), unquote(params[3]))

    def handle_BPR(self, params):
        numParams = len(params)
        if numParams == 2:
            self._getStateData('last_contact').setPhone(params[0], unquote(params[1]))
        elif numParams == 4:
            self.gotPhoneNumber(int(params[0]), params[1], params[2], unquote(params[3]))

    def handle_ADG(self, params):
        checkParamLen(len(params), 5, 'ADG')
        id = int(params[0])
        if not self._fireCallback(id, int(params[1]), unquote(params[2]), int(params[3])):
            raise MSNProtocolError, "ADG response does not match up to a request"

    def handle_RMG(self, params):
        checkParamLen(len(params), 3, 'RMG')
        id = int(params[0])
        if not self._fireCallback(id, int(params[1]), int(params[2])):
            raise MSNProtocolError, "RMG response does not match up to a request"

    def handle_REG(self, params):
        checkParamLen(len(params), 5, 'REG')
        id = int(params[0])
        if not self._fireCallback(id, int(params[1]), int(params[2]), unquote(params[3])):
            raise MSNProtocolError, "REG response does not match up to a request"

    def handle_ADD(self, params):
        numParams = len(params)
        if numParams < 5 or params[1].upper() not in ('AL', 'BL', 'RL', 'FL'):
            raise MSNProtocolError, "Invalid Parameters for ADD"
        id = int(params[0])
        listType = params[1].lower()
        listVer = int(params[2])
        userHandle = params[3]
        groupID = None
        if numParams == 6:
            if params[1].upper() != "FL":
                raise MSNProtocolError, "Only forward list can contain groups"
            groupID = int(params[5])
        if not self._fireCallback(id, listCodeToID[listType], userHandle, listVer, groupID):
            self.userAddedMe(userHandle, unquote(params[4]), listVer)

    def handle_REM(self, params):
        numParams = len(params)
        if numParams < 4 or params[1].upper() not in ('AL', 'BL', 'FL', 'RL'):
            raise MSNProtocolError, "Invalid Parameters for REM"
        id = int(params[0])
        listType = params[1].lower()
        listVer = int(params[2])
        userHandle = params[3]
        groupID = None
        if numParams == 5:
            if params[1] != "FL":
                raise MSNProtocolError, "Only forward list can contain groups"
            groupID = int(params[4])
        if not self._fireCallback(id, listCodeToID[listType], userHandle, listVer, groupID):
            if listType.upper() == "RL":
                self.userRemovedMe(userHandle, listVer)

    def handle_REA(self, params):
        checkParamLen(len(params), 4, 'REA')
        id = int(params[0])
        self._fireCallback(id, int(params[1]), unquote(params[3]))

    def handle_XFR(self, params):
        checkParamLen(len(params), 5, 'XFR')
        id = int(params[0])
        try:
            host, port = params[2].split(':')
        except ValueError:
            host = params[2]
            port = MSN_PORT

        if not self._fireCallback(id, host, int(port), params[4]):
            raise MSNProtocolError, "Got XFR (referral) that I didn't ask for .. should this happen?"

    def handle_RNG(self, params):
        checkParamLen(len(params), 6, 'RNG')
        try:
            host, port = params[1].split(":")
            port = int(port)
        except ValueError:
            host = params[1]
            port = MSN_PORT
        self.gotSwitchboardInvitation(int(params[0]), host, port, params[3], params[4],
                                      unquote(params[5]))

    def handle_OUT(self, params):
        checkParamLen(len(params), 1, 'OUT')
        if params[0] == "OTH":
            self.multipleLogin()
        elif params[0] == "SSD":
            self.serverGoingDown()
        else:
            raise MSNProtocolError, "Invalid Parameters received for OUT"

    def loggedIn(self, userHandle, screenName, verified):
        """
        Called when the client has logged in.
        Subclasses may override to perform additional actions.
        """
        self.factory.screenName = screenName
        if not self.factory.contacts:
            listVersion = 0
        else:
            listVersion = self.factory.contacts.version
        self.syncList(listVersion).addCallback(self.listSynchronized)

    def loginFailure(self, message):
        """
        Called when the client fails to login.
        Subclasses may override to handle the failure.
        """
        pass

    def gotProfile(self, message):
        """
        Called after logging in when the server sends an initial
        profile message. Subclasses should override to process it.
        """
        pass

    def listSynchronized(self, *args):
        """
        Called after contact list synchronization completes.
        Subclasses may override to react to the updated list.
        """
        pass

    def statusChanged(self, statusCode):
        """
        Called when our status changes and it isn't in response to
        a client command. By default we will update the status
        attribute of the factory.
        """
        self.factory.status = statusCode

    def gotContactStatus(self, statusCode, userHandle, screenName):
        """
        Called after logging in when the server sends status of online contacts.
        """
        self.factory.contacts.getContact(userHandle).status = statusCode

    def contactStatusChanged(self, statusCode, userHandle, screenName):
        """
        Called when we're notified that a contact's status has changed.
        """
        self.factory.contacts.getContact(userHandle).status = statusCode

    def contactOffline(self, userHandle):
        """
        Called when a contact goes offline.
        """
        self.factory.contacts.getContact(userHandle).status = STATUS_OFFLINE

    def gotPhoneNumber(self, listVersion, userHandle, phoneType, number):
        """
        Called when the server sends phone details about a specific user.
        """
        self.factory.contacts.version = listVersion
        self.factory.contacts.getContact(userHandle).setPhone(phoneType, number)

    def userAddedMe(self, userHandle, screenName, listVersion):
        """
        Called when a user adds me to their list.
        """
        self.factory.contacts.version = listVersion
        c = self.factory.contacts.getContact(userHandle)
        if not c:
            c = MSNContact(userHandle=userHandle, screenName=screenName)
            self.factory.contacts.addContact(c)
        c.addToList(REVERSE_LIST)

    def userRemovedMe(self, userHandle, listVersion):
        """
        Called when a user removes us from their contact list.
        """
        self.factory.contacts.version = listVersion
        c = self.factory.contacts.getContact(userHandle)
        c.removeFromList(REVERSE_LIST)
        if c.lists == 0:
            self.factory.contacts.remContact(c.userHandle)

    def gotSwitchboardInvitation(self, sessionID, host, port,
                                 key, userHandle, screenName):
        """
        Called when we receive a switchboard invitation.
        Subclasses should override to handle the invitation.
        """
        pass

    def multipleLogin(self):
        """
        Called when another login occurs on the same account.
        Subclasses may override to handle this event.
        """
        pass

    def serverGoingDown(self):
        """
        Called when the server notifies of impending shutdown.
        Subclasses may override to handle this event.
        """
        pass

    # api calls omitted for brevity (unchanged)


class SwitchboardClient(MSNEventBase):
    """
    This class provides support for clients connecting to a switchboard server.
    """

    key = 0
    userHandle = ""
    sessionID = ""
    reply = 0

    _iCookie = 0

    def __init__(self):
        MSNEventBase.__init__(self)
        self.pendingUsers = {}
        self.cookies = {'iCookies': {}, 'external': {}}

    def connectionMade(self):
        MSNEventBase.connectionMade(self)
        print 'sending initial stuff'
        self._sendInit()

    def connectionLost(self, reason):
        self.cookies['iCookies'] = {}
        self.cookies['external'] = {}
        MSNEventBase.connectionLost(self, reason)

    def _sendInit(self):
        """
        send initial data based on whether we are replying to an invitation
        or starting one.
        """
        id = self._nextTransactionID()
        if not self.reply:
            self.sendLine("USR %s %s %s" % (id, self.userHandle, self.key))
        else:
            self.sendLine("ANS %s %s %s %s" % (id, self.userHandle, self.key, self.sessionID))

    def _newInvitationCookie(self):
        self._iCookie += 1
        if self._iCookie > 1000:
            self._iCookie = 1
        return self._iCookie

    def _checkTyping(self, message, cTypes):
        """ helper method for checkMessage """
        if 'text/x-msmsgscontrol' in cTypes and message.hasHeader('TypingUser'):
            self.userTyping(message)
            return 1

    def _checkFileInvitation(self, message, info):
        """ helper method for checkMessage """
        guid = info.get('Application-GUID', '').lower()
        name = info.get('Application-Name', '').lower()
        if name != "file transfer" and guid != classNameToGUID["file transfer"]:
            return 0
        try:
            cookie = int(info['Invitation-Cookie'])
            fileName = info['Application-File']
            fileSize = int(info['Application-FileSize'])
        except KeyError:
            log.msg('Received munged file transfer request ... ignoring.')
            return 0
        self.gotSendRequest(fileName, fileSize, cookie, message)
        return 1

    def _checkFileResponse(self, message, info):
        """ helper method for checkMessage """
        try:
            cmd = info['Invitation-Command'].upper()
            cookie = int(info['Invitation-Cookie'])
        except KeyError:
            return 0
        accept = (cmd == 'ACCEPT') and 1 or 0
        requested = self.cookies['iCookies'].get(cookie)
        if not requested:
            return 1
        requested[0].callback((accept, cookie, info))
        del self.cookies['iCookies'][cookie]
        return 1

    def _checkFileInfo(self, message, info):
        """ helper method for checkMessage """
        try:
            ip = info['IP-Address']
            iCookie = int(info['Invitation-Cookie'])
            aCookie = int(info['AuthCookie'])
            cmd = info['Invitation-Command'].upper()
            port = int(info['Port'])
        except KeyError:
            return 0
        accept = (cmd == 'ACCEPT') and 1 or 0
        requested = self.cookies['external'].get(iCookie)
        if not requested:
            return 1
        requested[0].callback((accept, ip, port, aCookie, info))
        del self.cookies['external'][iCookie]
        return 1

    def checkMessage(self, message):
        """
        hook for detecting any notification type messages
        (e.g. file transfer)
        """
        cTypes = [s.lstrip() for s in message.getHeader('Content-Type').split(';')]
        if self._checkTyping(message, cTypes):
            return 0
        if 'text/x-msmsgsinvite' in cTypes:
            info = {}
            for line in message.message.split('\r\n'):
                try:
                    key, val = line.split(':')
                    info[key] = val.lstrip()
                except ValueError:
                    continue
            if self._checkFileInvitation(message, info) or self._checkFileInfo(message, info) or self._checkFileResponse(message, info):
                return 0
        elif 'text/x-clientcaps' in cTypes:
            return 0
        return 1

    def handle_USR(self, params):
        checkParamLen(len(params), 4, 'USR')
        if params[1] == "OK":
            self.loggedIn()

    def handle_CAL(self, params):
        checkParamLen(len(params), 3, 'CAL')
        id = int(params[0])
        if params[1].upper() == "RINGING":
            self._fireCallback(id, int(params[2]))

    def handle_JOI(self, params):
        checkParamLen(len(params), 2, 'JOI')
        self.userJoined(params[0], unquote(params[1]))

    def handle_IRO(self, params):
        checkParamLen(len(params), 5, 'IRO')
        self.pendingUsers[params[3]] = unquote(params[4])
        if params[1] == params[2]:
            self.gotChattingUsers(self.pendingUsers)
            self.pendingUsers = {}

    def handle_ANS(self, params):
        checkParamLen(len(params), 2, 'ANS')
        if params[1] == "OK":
            self.loggedIn()

    def handle_ACK(self, params):
        checkParamLen(len(params), 1, 'ACK')
        self._fireCallback(int(params[0]), None)

    def handle_NAK(self, params):
        checkParamLen(len(params), 1, 'NAK')
        self._fireCallback(int(params[0]), None)

    def handle_BYE(self, params):
        self.userLeft(params[0])

    def loggedIn(self):
        """
        Called when all login details have been negotiated.
        Subclasses may override to perform post‑login actions.
        """
        pass

    def gotChattingUsers(self, users):
        """
        Called after connecting to an existing chat session.
        Subclasses may override to handle the user list.
        """
        pass

    def userJoined(self, userHandle, screenName):
        """
        Called when a user has joined the conversation.
        Subclasses may override to handle the event.
        """
        pass

    def userLeft(self, userHandle):
        """
        Called when a user has left the conversation.
        Subclasses may override to handle the event.
        """
        pass

    def gotMessage(self, message):
        """
        Called when a message is received.
        Subclasses may override to process the message.
        """
        pass

    def userTyping(self, message):
        """
        Called when a typing notification is received.
        Subclasses may override to handle the notification.
        """
        pass

    def gotSendRequest(self, fileName, fileSize, iCookie, message):
        """
        Called when a contact initiates a file transfer.
        Subclasses may override to accept or reject the transfer.
        """
        pass

    # API methods omitted for brevity (unchanged)