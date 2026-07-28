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
    def __init__(self, title=None, titleURL=None, buildbotURL=None, changeHorizon=None, eventHorizon=None, logHorizon=None,
                 buildHorizon=None, logCompressionLimit=None, logCompressionMethod=None, logMaxTailSize=None, logMaxSize=None,
                 properties=None, mergeRequests=None, codebaseGenerator=None, prioritizeBuilders=None, slavePortnum=None,
                 multiMaster=None, debugPassword=None, manhole=None, revlink=None, protocols=None):
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
        validation = config_dict.get("validation", {})
        if not isinstance(validation, dict):
            error("c['validation'] must be a dictionary")
        else:
            unknown_keys = (
                set(validation.keys()) - set(self.validation.keys()))
            if unknown_keys:
                error("unrecognized validation key(s): %s" %
                      (", ".join(unknown_keys)))
            else:
                self.validation.update(validation)

    def load_db(self, config_dict):
        if 'db' in config_dict:
            db = config_dict['db']
            if set(db.keys()) > set(['db_url', 'db_poll_interval']):
                error("unrecognized keys in c['db']")
            self.db.update(db)
        if 'db_url' in config_dict:
            self.db['db_url'] = config_dict['db_url']
        if 'db_poll_interval' in config_dict:
            self.db['db_poll_interval'] = config_dict["db_poll_interval"]

        db_poll_interval = self.db['db_poll_interval']
        if db_poll_interval is not None and \
                not isinstance(db_poll_interval, int):
            error("c['db_poll_interval'] must be an int")
        else:
            self.db['db_poll_interval'] = db_poll_interval

    def load_metrics(self, config_dict):
        if 'metrics' in config_dict:
            metrics = config_dict["metrics"]
            if not isinstance(metrics, dict):
                error("c['metrics'] must be a dictionary")
            else:
                self.metrics = metrics

    def load_caches(self, config_dict):
        explicit = False
        if 'caches' in config_dict:
            explicit = True
            caches = config_dict['caches']
            if not isinstance(caches, dict):
                error("c['caches'] must be a dictionary")
            else:
                valPairs = caches.items()
                for (name, value) in valPairs:
                    if not isinstance(value, int):
                        error("value for cache size '%s' must be an integer"
                              % name)
                    if value < 1:
                        error("'%s' cache size must be at least 1, got '%s'"
                              % (name, value))
                self.caches.update(caches)

        if 'buildCacheSize' in config_dict:
            if explicit:
                msg = "cannot specify c['caches'] and c['buildCacheSize']"
                error(msg)
            self.caches['Builds'] = config_dict['buildCacheSize']
        if 'changeCacheSize' in config_dict:
            if explicit:
                msg = "cannot specify c['caches'] and c['changeCacheSize']"
                error(msg)
            self.caches['Changes'] = config_dict['changeCacheSize']

    def load_schedulers(self, config_dict):
        if 'schedulers' not in config_dict:
            return
        schedulers = config_dict['schedulers']

        ok = True
        if not isinstance(schedulers, (list, tuple)):
            ok = False
        else:
            for s in schedulers:
                if not interfaces.IScheduler.providedBy(s):
                    ok = False
        if not ok:
            msg = "c['schedulers'] must be a list of Scheduler instances"
            error(msg)

        seen_names = set()
        for s in schedulers:
            if s.name in seen_names:
                error("scheduler name '%s' used multiple times" %
                      s.name)
            seen_names.add(s.name)

        self.schedulers = dict((s.name, s) for s in schedulers)

    def load_builders(self, config_dict):
        if 'builders' not in config_dict:
            return
        builders = config_dict['builders']

        if not isinstance(builders, (list, tuple)):
            error("c['builders'] must be a list")
            return

        def mapper(b):
            if isinstance(b, BuilderConfig):
                return b
            elif isinstance(b, dict):
                return BuilderConfig(**b)
            else:
                error("%r is not a builder config (in c['builders']" % (b,))
        builders = [mapper(b) for b in builders]

        for builder in builders:
            if builder and os.path.isabs(builder.builddir):
                warnings.warn("Absolute path '%s' for builder may cause "
                              "mayhem.  Perhaps you meant to specify slavebuilddir "
                              "instead.")

        self.builders = builders

    def load_slaves(self, config_dict):
        if 'slaves' not in config_dict:
            return
        slaves = config_dict['slaves']

        if not isinstance(slaves, (list, tuple)):
            error("c['slaves'] must be a list")
            return

        for sl in slaves:
            if not interfaces.IBuildSlave.providedBy(sl):
                msg = "c['slaves'] must be a list of BuildSlave instances"
                error(msg)
                return

            if sl.slavename in ("debug", "change", "status"):
                msg = "slave name '%s' is reserved" % sl.slavename
                error(msg)

        self.slaves = config_dict['slaves']

    def load_change_sources(self, config_dict):
        change_source = config_dict.get('change_source', [])
        if isinstance(change_source, (list, tuple)):
            change_sources = change_source
        else:
            change_sources = [change_source]

        for s in change_sources:
            if not interfaces.IChangeSource.providedBy(s):
                msg = "c['change_source'] must be a list of change sources"
                error(msg)
                return

        self.change_sources = change_sources

    def load_status(self, config_dict):
        if 'status' not in config_dict:
            return
        status = config_dict.get('status', [])

        msg = "c['status'] must be a list of status receivers"
        if not isinstance(status, (list, tuple)):
            error(msg)
            return

        for s in status:
            if not interfaces.IStatusReceiver.providedBy(s):
                error(msg)
                return

        self.status = status

    def load_user_managers(self, config_dict):
        if 'user_managers' not in config_dict:
            return
        user_managers = config_dict['user_managers']

        msg = "c['user_managers'] must be a list of user managers"
        if not isinstance(user_managers, (list, tuple)):
            error(msg)
            return

        self.user_managers = user_managers

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
        self.slavename = slavename
        self.slavenames = slavenames
        self.builddir = builddir
        self.slavebuilddir = slavebuilddir
        self.factory = factory
        self.category = category
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

        if self.slavename:
            if not isinstance(self.slavename, str):
                error("builder '%s': slavename must be a string" % (self.name,))
            self.slavenames = self.slavenames + [self.slavename]
        if not self.slavenames:
            error("builder '%s': at least one slavename is required" % (self.name,))

        if self.builddir is None:
            self.builddir = safeTranslate(self.name)

        if self.slavebuilddir is None:
            self.slavebuilddir = self.builddir

        if self.category and self.tags:
            error("builder '%s': category is being replaced by tags; you should only specify tags" % (self.name,))

        if self.category:
            if not isinstance(self.category, str):
                error("builder '%s': category must be a string" % (self.name,))
            self.tags = [self.category]

            self.category = self.category  # Set this for legacy reasons

        if self.tags:
            if not isinstance(self.tags, list):
                error("builder '%s': tags must be a list" % (self.name,))
            bad_tags = any((tag for tag in self.tags if not isinstance(tag, str)))
            if bad_tags:
                error("builder '%s': tags list contains something that is not a string" % (self.name,))

        if self.nextSlave and not callable(self.nextSlave):
            error('nextSlave must be a callable')
        if self.nextBuild and not callable(self.nextBuild):
            error('nextBuild must be a callable')
        if self.canStartBuild and not callable(self.canStartBuild):
            error('canStartBuild must be a callable')

        self.locks = self.locks or []
        self.env = self.env or {}
        if not isinstance(self.env, dict):
            error("builder's env must be a dictionary")
        self.properties = self.properties or {}
        self.mergeRequests = self.mergeRequests

        self.description = self.description

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