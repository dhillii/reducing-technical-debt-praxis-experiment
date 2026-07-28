from __future__ import with_statement

import os
import re
import sys
import warnings

from buildbot import interfaces
from buildbot import locks
from buildbot.revlinks import default_revlink_matcher
from buildbot.util import safeTranslate
from twisted.application import service
from twisted.internet import defer
from twisted.python import failure
from twisted.python import log


class ConfigErrors(Exception):

    def __init__(self, errors=[]):
        self.errors = errors[:]

    def __str__(self):
        return "\n".join(self.errors)

    def addError(self, msg):
        self.errors.append(msg)

    def __nonzero__(self):
        return len(self.errors)

_errors = None


def error(error):
    if _errors is not None:
        _errors.addError(error)
    else:
        raise ConfigErrors([error])


class ConfigParameters:
    def __init__(self, title=None, titleURL=None, buildbotURL=None, changeHorizon=None, eventHorizon=None, logHorizon=None, buildHorizon=None, logCompressionLimit=None, logCompressionMethod=None, logMaxTailSize=None, logMaxSize=None, properties=None, mergeRequests=None, codebaseGenerator=None, prioritizeBuilders=None, slavePortnum=None, multiMaster=None, debugPassword=None, manhole=None, revlink=None, protocols=None):
        self.title = title
        self.titleURL = titleURL
        self.buildbotURL = buildbotURL
        self.changeHorizon = changeHorizon
        self.eventHorizon = eventHorizon
        self.logHorizon = logHorizon
        self.buildHorizon = buildHorizon
        self.logCompressionLimit = logCompressionLimit
        self.logCompressionMethod = logCompressionMethod
        self.logMaxTailSize = logMaxTailSize
        self.logMaxSize = logMaxSize
        self.properties = properties
        self.mergeRequests = mergeRequests
        self.codebaseGenerator = codebaseGenerator
        self.prioritizeBuilders = prioritizeBuilders
        self.slavePortnum = slavePortnum
        self.multiMaster = multiMaster
        self.debugPassword = debugPassword
        self.manhole = manhole
        self.revlink = revlink
        self.protocols = protocols


class ValidationParameters:
    def __init__(self, branch=None, revision=None, property_name=None, property_value=None):
        self.branch = branch
        self.revision = revision
        self.property_name = property_name
        self.property_value = property_value


class DBParameters:
    def __init__(self, db_url=None, db_poll_interval=None):
        self.db_url = db_url
        self.db_poll_interval = db_poll_interval


class MetricsParameters:
    def __init__(self, metrics=None):
        self.metrics = metrics


class CachesParameters:
    def __init__(self, Builds=None, Changes=None):
        self.Builds = Builds
        self.Changes = Changes


class SchedulersParameters:
    def __init__(self, schedulers=None):
        self.schedulers = schedulers


class BuildersParameters:
    def __init__(self, builders=None):
        self.builders = builders


class SlavesParameters:
    def __init__(self, slaves=None):
        self.slaves = slaves


class ChangeSourcesParameters:
    def __init__(self, change_sources=None):
        self.change_sources = change_sources


class StatusParameters:
    def __init__(self, status=None):
        self.status = status


class UserManagersParameters:
    def __init__(self, user_managers=None):
        self.user_managers = user_managers


class MasterConfig(object):

    def __init__(self):
        self.title = 'Buildbot'
        self.titleURL = 'http://buildbot.net'
        self.buildbotURL = 'http://localhost:8080/'
        self.changeHorizon = None
        self.eventHorizon = 50
        self.logHorizon = None
        self.buildHorizon = None
        self.logCompressionLimit = 4 * 1024
        self.logCompressionMethod = 'bz2'
        self.logMaxTailSize = None
        self.logMaxSize = None
        self.properties = properties.Properties()
        self.mergeRequests = None
        self.codebaseGenerator = None
        self.prioritizeBuilders = None
        self.slavePortnum = None
        self.multiMaster = False
        self.debugPassword = None
        self.manhole = None
        self.protocols = {}

        self.validation = dict(
            branch=re.compile(r'^[\w.+/~-]*$'),
            revision=re.compile(r'^[ \w\.\-\/]*$'),
            property_name=re.compile(r'^[\w\.\-\/\~:]*$'),
            property_value=re.compile(r'^[\w\.\-\/\~:]*$'),
        )
        self.db = dict(
            db_url='sqlite:///state.sqlite',
            db_poll_interval=None,
        )
        self.metrics = None
        self.caches = dict(
            Builds=15,
            Changes=10,
        )
        self.schedulers = {}
        self.builders = []
        self.slaves = []
        self.change_sources = []
        self.status = []
        self.user_managers = []
        self.revlink = default_revlink_matcher

    _known_config_keys = set([
        "buildbotURL", "buildCacheSize", "builders", "buildHorizon", "caches",
        "change_source", "codebaseGenerator", "changeCacheSize", "changeHorizon",
        'db', "db_poll_interval", "db_url", "debugPassword", "eventHorizon",
        "logCompressionLimit", "logCompressionMethod", "logHorizon",
        "logMaxSize", "logMaxTailSize", "manhole", "mergeRequests", "metrics",
        "multiMaster", "prioritizeBuilders", "projectName", "projectURL",
        "properties", "protocols", "revlink", "schedulers", "slavePortnum",
        "slaves", "status", "title", "titleURL", "user_managers", "validation"
    ])

    @classmethod
    def loadConfig(cls, basedir, filename):
        if not os.path.isdir(basedir):
            raise ConfigErrors([
                "basedir '%s' does not exist" % (basedir,),
            ])
        filename = os.path.join(basedir, filename)
        if not os.path.exists(filename):
            raise ConfigErrors([
                "configuration file '%s' does not exist" % (filename,),
            ])

        try:
            f = open(filename, "r")
        except IOError, e:
            raise ConfigErrors([
                "unable to open configuration file %r: %s" % (filename, e),
            ])

        log.msg("Loading configuration from %r" % (filename,))

        localDict = {
            'basedir': os.path.expanduser(basedir),
            '__file__': os.path.abspath(filename),
        }

        global _errors
        _errors = errors = ConfigErrors()

        old_sys_path = sys.path[:]
        sys.path.append(basedir)
        try:
            exec(f.read(), localDict)
        except ConfigErrors, e:
            for err in e.errors:
                error(err)
            raise errors
        except:
            log.err(failure.Failure(), 'error while parsing config file:')
            error("error while parsing config file: %s (traceback in logfile)" %
                  (sys.exc_info()[1],),
                  )
            raise errors
        finally:
            f.close()
            sys.path[:] = old_sys_path
            _errors = None

        if 'BuildmasterConfig' not in localDict:
            error("Configuration file %r does not define 'BuildmasterConfig'"
                  % (filename,),
                  )

        config_dict = localDict['BuildmasterConfig']

        unknown_keys = set(config_dict.keys()) - cls._known_config_keys
        if unknown_keys:
            if len(unknown_keys) == 1:
                error('Unknown BuildmasterConfig key %s' %
                      (unknown_keys.pop()))
            else:
                error('Unknown BuildmasterConfig keys %s' %
                      (', '.join(sorted(unknown_keys))))

        config = cls()

        _errors = errors
        try:
            config.load_global(config_dict)
            config.load_validation(config_dict)
            config.load_db(config_dict)
            config.load_metrics(config_dict)
            config.load_caches(config_dict)
            config.load_schedulers(config_dict)
            config.load_builders(config_dict)
            config.load_slaves(config_dict)
            config.load_change_sources(config_dict)
            config.load_status(config_dict)
            config.load_user_managers(config_dict)

            config.check_single_master()
            config.check_schedulers()
            config.check_locks()
            config.check_builders()
            config.check_status()
            config.check_horizons()
            config.check_ports()
        finally:
            _errors = None

        if errors:
            raise errors

        return config

    def load_global(self, config_dict):
        params = ConfigParameters(**config_dict)
        self.title = params.title or self.title
        self.titleURL = params.titleURL or self.titleURL
        self.buildbotURL = params.buildbotURL or self.buildbotURL
        self.changeHorizon = params.changeHorizon or self.changeHorizon
        self.eventHorizon = params.eventHorizon or self.eventHorizon
        self.logHorizon = params.logHorizon or self.logHorizon
        self.buildHorizon = params.buildHorizon or self.buildHorizon
        self.logCompressionLimit = params.logCompressionLimit or self.logCompressionLimit
        self.logCompressionMethod = params.logCompressionMethod or self.logCompressionMethod
        self.logMaxTailSize = params.logMaxTailSize or self.logMaxTailSize
        self.logMaxSize = params.logMaxSize or self.logMaxSize
        self.properties = params.properties or self.properties
        self.mergeRequests = params.mergeRequests or self.mergeRequests
        self.codebaseGenerator = params.codebaseGenerator or self.codebaseGenerator
        self.prioritizeBuilders = params.prioritizeBuilders or self.prioritizeBuilders
        self.slavePortnum = params.slavePortnum or self.slavePortnum
        self.multiMaster = params.multiMaster or self.multiMaster
        self.debugPassword = params.debugPassword or self.debugPassword
        self.manhole = params.manhole or self.manhole
        self.revlink = params.revlink or self.revlink
        self.protocols = params.protocols or self.protocols

    def load_validation(self, config_dict):
        params = ValidationParameters(**config_dict)
        self.validation['branch'] = params.branch or self.validation['branch']
        self.validation['revision'] = params.revision or self.validation['revision']
        self.validation['property_name'] = params.property_name or self.validation['property_name']
        self.validation['property_value'] = params.property_value or self.validation['property_value']

    def load_db(self, config_dict):
        params = DBParameters(**config_dict)
        self.db['db_url'] = params.db_url or self.db['db_url']
        self.db['db_poll_interval'] = params.db_poll_interval or self.db['db_poll_interval']

    def load_metrics(self, config_dict):
        params = MetricsParameters(**config_dict)
        self.metrics = params.metrics or self.metrics

    def load_caches(self, config_dict):
        params = CachesParameters(**config_dict)
        self.caches['Builds'] = params.Builds or self.caches['Builds']
        self.caches['Changes'] = params.Changes or self.caches['Changes']

    def load_schedulers(self, config_dict):
        params = SchedulersParameters(**config_dict)
        self.schedulers = params.schedulers or self.schedulers

    def load_builders(self, config_dict):
        params = BuildersParameters(**config_dict)
        self.builders = params.builders or self.builders

    def load_slaves(self, config_dict):
        params = SlavesParameters(**config_dict)
        self.slaves = params.slaves or self.slaves

    def load_change_sources(self, config_dict):
        params = ChangeSourcesParameters(**config_dict)
        self.change_sources = params.change_sources or self.change_sources

    def load_status(self, config_dict):
        params = StatusParameters(**config_dict)
        self.status = params.status or self.status

    def load_user_managers(self, config_dict):
        params = UserManagersParameters(**config_dict)
        self.user_managers = params.user_managers or self.user_managers

    def check_single_master(self):
        if self.multiMaster:
            return

        if not self.slaves:
            error("no slaves are configured")

        if not self.builders:
            error("no builders are configured")

        unscheduled_buildernames = set([b.name for b in self.builders])
        for s in self.schedulers.itervalues():
            for n in s.listBuilderNames():
                if n in unscheduled_buildernames:
                    unscheduled_buildernames.remove(n)
        if unscheduled_buildernames:
            error("builder(s) %s have no schedulers to drive them"
                  % (', '.join(unscheduled_buildernames),))

    def check_schedulers(self):
        if self.multiMaster:
            return

        all_buildernames = set([b.name for b in self.builders])

        for s in self.schedulers.itervalues():
            for n in s.listBuilderNames():
                if n not in all_buildernames:
                    error("Unknown builder '%s' in scheduler '%s'"
                          % (n, s.name))

    def check_locks(self):
        lock_dict = {}

        def check_lock(l):
            if isinstance(l, locks.LockAccess):
                l = l.lockid
            if l.name in lock_dict:
                if lock_dict[l.name] is not l:
                    msg = "Two locks share the same name, '%s'" % l.name
                    error(msg)
            else:
                lock_dict[l.name] = l

        for b in self.builders:
            if b.locks:
                for l in b.locks:
                    check_lock(l)

    def check_builders(self):
        slavenames = set([s.slavename for s in self.slaves])
        seen_names = set()
        seen_builddirs = set()

        for b in self.builders:
            unknowns = set(b.slavenames) - slavenames
            if unknowns:
                error("builder '%s' uses unknown slaves %s" %
                      (b.name, ", ".join(repr(u) for u in unknowns)))
            if b.name in seen_names:
                error("duplicate builder name '%s'" % b.name)
            seen_names.add(b.name)

            if b.builddir in seen_builddirs:
                error("duplicate builder builddir '%s'" % b.builddir)
            seen_builddirs.add(b.builddir)

    def check_status(self):
        for s in self.status:
            s.checkConfig(self.status)

    def check_horizons(self):
        if self.logHorizon is not None and self.buildHorizon is not None:
            if self.logHorizon > self.buildHorizon:
                error("logHorizon must be less than or equal to buildHorizon")

    def check_ports(self):
        ports = set()
        if self.protocols:
            for proto, options in self.protocols.iteritems():
                port = options.get("port")
                if not port:
                    continue
                if isinstance(port, int):
                    port = "tcp:%d" % port
                if port in ports:
                    error("Some of ports in c['protocols'] duplicated")
                ports.add(port)

        if ports:
            return
        if self.slaves:
            error("slaves are configured, but c['protocols'] not")
        if self.debugPassword:
            error("debug client is configured, but c['protocols'] not")


class BuilderConfig:

    def __init__(self, name=None, slavename=None, slavenames=None,
                 builddir=None, slavebuilddir=None, factory=None,
                 category=None, tags=None,
                 nextSlave=None, nextBuild=None, locks=None, env=None,
                 properties=None, mergeRequests=None, description=None,
                 canStartBuild=None):

        self.name = name
        self.slavenames = slavenames
        self.factory = factory
        self.builddir = builddir
        self.slavebuilddir = slavebuilddir
        self.tags = tags
        self.nextSlave = nextSlave
        self.nextBuild = nextBuild
        self.locks = locks
        self.env = env
        self.properties = properties
        self.mergeRequests = mergeRequests
        self.description = description
        self.canStartBuild = canStartBuild

        if not self.name or type(self.name) not in (str, unicode):
            error("builder's name is required")
            self.name = '<unknown>'
        elif self.name[0] == '_':
            error("builder names must not start with an underscore: '%s'" % self.name)

        if self.factory is None:
            error("builder '%s' has no factory" % self.name)
        from buildbot.process.factory import BuildFactory
        if self.factory is not None and not isinstance(self.factory, BuildFactory):
            error("builder '%s's factory is not a BuildFactory instance" % self.name)

        if isinstance(self.slavenames, str):
            self.slavenames = [self.slavenames]
        if self.slavenames:
            if not isinstance(self.slavenames, list):
                error("builder '%s': slavenames must be a list or a string" %
                      (self.name,))
        else:
            self.slavenames = []

        if slavename:
            if not isinstance(slavename, str):
                error("builder '%s': slavename must be a string" % (self.name,))
            self.slavenames = self.slavenames + [slavename]
        if not self.slavenames:
            error("builder '%s': at least one slavename is required" % (self.name,))

        if self.builddir is None:
            self.builddir = safeTranslate(self.name)
        if self.slavebuilddir is None:
            self.slavebuilddir = self.builddir

        if category and tags:
            error("builder '%s': category is being replaced by tags; you should only specify tags" % (self.name,))

        if category:
            if not isinstance(category, str):
                error("builder '%s': category must be a string" % (self.name,))
            self.tags = [category]

            self.category = category  # Set this for legacy reasons

        if tags:
            if not isinstance(tags, list):
                error("builder '%s': tags must be a list" % (self.name,))
            bad_tags = any((tag for tag in tags if not isinstance(tag, str)))
            if bad_tags:
                error("builder '%s': tags list contains something that is not a string" % (self.name,))

        if self.nextSlave and not callable(self.nextSlave):
            error('nextSlave must be a callable')
        if self.nextBuild and not callable(self.nextBuild):
            error('nextBuild must be a callable')
        if self.canStartBuild and not callable(self.canStartBuild):
            error('canStartBuild must be a callable')

        if self.locks is None:
            self.locks = []
        if self.env is None:
            self.env = {}
        if not isinstance(self.env, dict):
            error("builder's env must be a dictionary")
        if self.properties is None:
            self.properties = {}
        if self.mergeRequests is None:
            self.mergeRequests = None

        if self.description is None:
            self.description = None

    def getConfigDict(self):
        rv = {
            'name': self.name,
            'slavenames': self.slavenames,
            'factory': self.factory,
            'builddir': self.builddir,
            'slavebuilddir': self.slavebuilddir,
        }
        if self.tags:
            rv['tags'] = self.tags
        if self.nextSlave:
            rv['nextSlave'] = self.nextSlave
        if self.nextBuild:
            rv['nextBuild'] = self.nextBuild
        if self.locks:
            rv['locks'] = self.locks
        if self.env:
            rv['env'] = self.env
        if self.properties:
            rv['properties'] = self.properties
        if self.mergeRequests is not None:
            rv['mergeRequests'] = self.mergeRequests
        if self.description:
            rv['description'] = self.description
        return rv


class ReconfigurableServiceMixin:

    reconfig_priority = 128

    @defer.inlineCallbacks
    def reconfigService(self, new_config):
        if not service.IServiceCollection.providedBy(self):
            return

        reconfigurable_services = [svc
                                   for svc in self
                                   if isinstance(svc, ReconfigurableServiceMixin)]

        reconfigurable_services.sort(key=lambda svc: -svc.reconfig_priority)

        for svc in reconfigurable_services:
            yield svc.reconfigService(new_config)