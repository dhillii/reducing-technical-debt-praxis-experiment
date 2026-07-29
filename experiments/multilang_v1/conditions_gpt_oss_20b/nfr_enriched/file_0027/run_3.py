from __future__ import with_statement

import os
import re
import sys
import warnings
import importlib.util

from buildbot import interfaces
from buildbot import locks
from buildbot.revlinks import default_revlink_matcher
from buildbot.util import safeTranslate
from twisted.application import service
from twisted.internet import defer
from twisted.python import failure
from twisted.python import log


class ConfigErrors(Exception):
    """Container for configuration errors."""

    def __init__(self, errors=None):
        self.errors = list(errors or [])

    def __str__(self):
        return "\n".join(self.errors)

    def addError(self, msg):
        self.errors.append(msg)

    def __nonzero__(self):
        return bool(self.errors)


_errors = None


def error(error_msg):
    """Record or raise a configuration error."""
    if _errors is not None:
        _errors.addError(error_msg)
    else:
        raise ConfigErrors([error_msg])


class MasterConfig(object):
    """Container for master configuration."""

    def __init__(self):
        from buildbot.process import properties

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
    def _validate_paths(cls, basedir, filename):
        if not os.path.isdir(basedir):
            raise ConfigErrors([f"basedir '{basedir}' does not exist"])
        if not os.path.exists(filename):
            raise ConfigErrors([f"configuration file '{filename}' does not exist"])

    @classmethod
    def _load_module(cls, basedir, filename):
        """Load the configuration file as a module."""
        spec = importlib.util.spec_from_file_location('buildbot_config', filename)
        module = importlib.util.module_from_spec(spec)
        module.__dict__.update({
            'basedir': os.path.expanduser(basedir),
            '__file__': os.path.abspath(filename),
        })
        try:
            spec.loader.exec_module(module)
        except ConfigErrors as e:
            raise e
        except Exception:
            log.err(failure.Failure(), 'error while parsing config file:')
            raise ConfigErrors([f"error while parsing config file: {sys.exc_info()[1]} (traceback in logfile)"])
        return module

    @classmethod
    def _check_buildmaster_config(cls, module, filename):
        if not hasattr(module, 'BuildmasterConfig'):
            raise ConfigErrors([f"Configuration file {filename!r} does not define 'BuildmasterConfig'"])

    @classmethod
    def _validate_config_dict(cls, config_dict, filename):
        unknown_keys = set(config_dict.keys()) - cls._known_config_keys
        if unknown_keys:
            if len(unknown_keys) == 1:
                raise ConfigErrors([f"Unknown BuildmasterConfig key {unknown_keys.pop()}"])
            else:
                raise ConfigErrors([f"Unknown BuildmasterConfig keys {', '.join(sorted(unknown_keys))}"])

    @classmethod
    def loadConfig(cls, basedir, filename):
        """Load a configuration file and return a MasterConfig instance."""
        cls._validate_paths(basedir, filename)
        module = cls._load_module(basedir, filename)
        cls._check_buildmaster_config(module, filename)
        config_dict = module.BuildmasterConfig
        cls._validate_config_dict(config_dict, filename)

        config = cls()
        global _errors
        _errors = errors = ConfigErrors()
        try:
            config.load_global(filename, config_dict)
            config.load_validation(filename, config_dict)
            config.load_db(filename, config_dict)
            config.load_metrics(filename, config_dict)
            config.load_caches(filename, config_dict)
            config.load_schedulers(filename, config_dict)
            config.load_builders(filename, config_dict)
            config.load_slaves(filename, config_dict)
            config.load_change_sources(filename, config_dict)
            config.load_status(filename, config_dict)
            config.load_user_managers(filename, config_dict)

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

    def load_global(self, filename, config_dict):
        def copy_param(name, alt_key=None, check_type=None, check_type_name=None):
            if name in config_dict:
                v = config_dict[name]
            elif alt_key and alt_key in config_dict:
                v = config_dict[alt_key]
            else:
                return
            if v is not None and check_type and not isinstance(v, check_type):
                error(f"c['{name}'] must be {check_type_name}")
            else:
                setattr(self, name, v)

        def copy_int_param(name, alt_key=None):
            copy_param(name, alt_key=alt_key, check_type=int, check_type_name='an int')

        def copy_str_param(name, alt_key=None):
            copy_param(name, alt_key=alt_key, check_type=basestring, check_type_name='a string')

        copy_str_param('title', alt_key='projectName')
        copy_str_param('titleURL', alt_key='projectURL')
        copy_str_param('buildbotURL')

        copy_int_param('changeHorizon')
        copy_int_param('eventHorizon')
        copy_int_param('logHorizon')
        copy_int_param('buildHorizon')

        copy_int_param('logCompressionLimit')

        if 'logCompressionMethod' in config_dict:
            logCompressionMethod = config_dict.get('logCompressionMethod')
            if logCompressionMethod not in ('bz2', 'gz'):
                error("c['logCompressionMethod'] must be 'bz2' or 'gz'")
            self.logCompressionMethod = logCompressionMethod

        copy_int_param('logMaxSize')
        copy_int_param('logMaxTailSize')

        properties = config_dict.get('properties', {})
        if not isinstance(properties, dict):
            error("c['properties'] must be a dictionary")
        else:
            self.properties.update(properties, filename)

        mergeRequests = config_dict.get('mergeRequests')
        if mergeRequests not in (None, True, False) and not callable(mergeRequests):
            error("mergeRequests must be a callable, True, or False")
        else:
            self.mergeRequests = mergeRequests

        codebaseGenerator = config_dict.get('codebaseGenerator')
        if codebaseGenerator is not None and not callable(codebaseGenerator):
            error("codebaseGenerator must be a callable accepting a dict and returning a str")
        else:
            self.codebaseGenerator = codebaseGenerator

        prioritizeBuilders = config_dict.get('prioritizeBuilders')
        if prioritizeBuilders is not None and not callable(prioritizeBuilders):
            error("prioritizeBuilders must be a callable")
        else:
            self.prioritizeBuilders = prioritizeBuilders

        protocols = config_dict.get('protocols', {})
        if isinstance(protocols, dict):
            for proto, options in protocols.iteritems():
                if not isinstance(proto, str):
                    error("c['protocols'] keys must be strings")
                if not isinstance(options, dict):
                    error(f"c['protocols']['{proto}'] must be a dict")
                    return
                if (proto == "pb" and options.get("port") and
                        'slavePortnum' in config_dict):
                    error("Both c['slavePortnum'] and c['protocols']['pb']['port'] defined, recommended to remove slavePortnum and leave only c['protocols']['pb']['port']")
        else:
            error("c['protocols'] must be dict")
            return
        self.protocols = protocols

        if 'slavePortnum' in config_dict:
            slavePortnum = config_dict.get('slavePortnum')
            if isinstance(slavePortnum, int):
                slavePortnum = f"tcp:{slavePortnum}"
            pb_options = self.protocols.get('pb', {})
            pb_options['port'] = slavePortnum
            self.protocols['pb'] = pb_options

        if 'multiMaster' in config_dict:
            self.multiMaster = config_dict["multiMaster"]

        copy_str_param('debugPassword')

        if 'manhole' in config_dict:
            self.manhole = config_dict['manhole']

        if 'revlink' in config_dict:
            revlink = config_dict['revlink']
            if not callable(revlink):
                error("revlink must be a callable")
            else:
                self.revlink = revlink

    def load_validation(self, filename, config_dict):
        validation = config_dict.get("validation", {})
        if not isinstance(validation, dict):
            error("c['validation'] must be a dictionary")
        else:
            unknown_keys = set(validation.keys()) - set(self.validation.keys())
            if unknown_keys:
                error(f"unrecognized validation key(s): {', '.join(unknown_keys)}")
            else:
                self.validation.update(validation)

    def load_db(self, filename, config_dict):
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
        if db_poll_interval is not None and not isinstance(db_poll_interval, int):
            error("c['db_poll_interval'] must be an int")
        else:
            self.db['db_poll_interval'] = db_poll_interval

    def load_metrics(self, filename, config_dict):
        if 'metrics' in config_dict:
            metrics = config_dict["metrics"]
            if not isinstance(metrics, dict):
                error("c['metrics'] must be a dictionary")
            else:
                self.metrics = metrics

    def load_caches(self, filename, config_dict):
        explicit = False
        if 'caches' in config_dict:
            explicit = True
            caches = config_dict['caches']
            if not isinstance(caches, dict):
                error("c['caches'] must be a dictionary")
            else:
                for name, value in caches.items():
                    if not isinstance(value, int):
                        error(f"value for cache size '{name}' must be an integer")
                    if value < 1:
                        error(f"'{name}' cache size must be at least 1, got '{value}'")
                self.caches.update(caches)

        if 'buildCacheSize' in config_dict:
            if explicit:
                error("cannot specify c['caches'] and c['buildCacheSize']")
            self.caches['Builds'] = config_dict['buildCacheSize']
        if 'changeCacheSize' in config_dict:
            if explicit:
                error("cannot specify c['caches'] and c['changeCacheSize']")
            self.caches['Changes'] = config_dict['changeCacheSize']

    def load_schedulers(self, filename, config_dict):
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
            error("c['schedulers'] must be a list of Scheduler instances")

        seen_names = set()
        for s in schedulers:
            if s.name in seen_names:
                error(f"scheduler name '{s.name}' used multiple times")
            seen_names.add(s.name)

        self.schedulers = {s.name: s for s in schedulers}

    def load_builders(self, filename, config_dict):
        if 'builders' not in config_dict:
            return
        builders = config_dict['builders']

        if not isinstance(builders, (list, tuple)):
            error("c['builders'] must be a list")
            return

        def mapper(b):
            if isinstance(b, BuilderConfig):
                return b
            if isinstance(b, dict):
                return BuilderConfig(**b)
            error(f"{b!r} is not a builder config (in c['builders']")
            return None

        builders = [mapper(b) for b in builders]

        for builder in builders:
            if builder and os.path.isabs(builder.builddir):
                warnings.warn(
                    f"Absolute path '{builder.builddir}' for builder may cause mayhem. "
                    "Perhaps you meant to specify slavebuilddir instead."
                )

        self.builders = builders

    def load_slaves(self, filename, config_dict):
        if 'slaves' not in config_dict:
            return
        slaves = config_dict['slaves']

        if not isinstance(slaves, (list, tuple)):
            error("c['slaves'] must be a list")
            return

        for sl in slaves:
            if not interfaces.IBuildSlave.providedBy(sl):
                error("c['slaves'] must be a list of BuildSlave instances")
                return
            if sl.slavename in ("debug", "change", "status"):
                error(f"slave name '{sl.slavename}' is reserved")

        self.slaves = config_dict['slaves']

    def load_change_sources(self, filename, config_dict):
        change_source = config_dict.get('change_source', [])
        change_sources = change_source if isinstance(change_source, (list, tuple)) else [change_source]

        for s in change_sources:
            if not interfaces.IChangeSource.providedBy(s):
                error("c['change_source'] must be a list of change sources")
                return

        self.change_sources = change_sources

    def load_status(self, filename, config_dict):
        if 'status' not in config_dict:
            return
        status = config_dict.get('status', [])

        if not isinstance(status, (list, tuple)):
            error("c['status'] must be a list of status receivers")
            return

        for s in status:
            if not interfaces.IStatusReceiver.providedBy(s):
                error("c['status'] must be a list of status receivers")
                return

        self.status = status

    def load_user_managers(self, filename, config_dict):
        if 'user_managers' not in config_dict:
            return
        user_managers = config_dict['user_managers']

        if not isinstance(user_managers, (list, tuple)):
            error("c['user_managers'] must be a list of user managers")
            return

        self.user_managers = user_managers

    def check_single_master(self):
        if self.multiMaster:
            return
        if not self.slaves:
            error("no slaves are configured")
        if not self.builders:
            error("no builders are configured")

        unscheduled_buildernames = {b.name for b in self.builders}
        for s in self.schedulers.itervalues():
            for n in s.listBuilderNames():
                unscheduled_buildernames.discard(n)
        if unscheduled_buildernames:
            error(f"builder(s) {', '.join(unscheduled_buildernames)} have no schedulers to drive them")

    def check_schedulers(self):
        if self.multiMaster:
            return
        all_buildernames = {b.name for b in self.builders}
        for s in self.schedulers.itervalues():
            for n in s.listBuilderNames():
                if n not in all_buildernames:
                    error(f"Unknown builder '{n}' in scheduler '{s.name}'")

    def check_locks(self):
        lock_dict = {}

        def check_lock(l):
            if isinstance(l, locks.LockAccess):
                l = l.lockid
            if l.name in lock_dict:
                if lock_dict[l.name] is not l:
                    error(f"Two locks share the same name, '{l.name}'")
            else:
                lock_dict[l.name] = l

        for b in self.builders:
            if b.locks:
                for l in b.locks:
                    check_lock(l)

    def check_builders(self):
        slavenames = {s.slavename for s in self.slaves}
        seen_names = set()
        seen_builddirs = set()

        for b in self.builders:
            unknowns = set(b.slavenames) - slavenames
            if unknowns:
                error(f"builder '{b.name}' uses unknown slaves {', '.join(repr(u) for u in unknowns)}")
            if b.name in seen_names:
                error(f"duplicate builder name '{b.name}'")
            seen_names.add(b.name)

            if b.builddir in seen_builddirs:
                error(f"duplicate builder builddir '{b.builddir}'")
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
                    port = f"tcp:{port}"
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
    """Configuration for a single builder."""

    def __init__(self, name=None, slavename=None, slavenames=None,
                 builddir=None, slavebuilddir=None, factory=None,
                 category=None, tags=None,
                 nextSlave=None, nextBuild=None, locks=None, env=None,
                 properties=None, mergeRequests=None, description=None,
                 canStartBuild=None):

        if not name or type(name) not in (str, unicode):
            error("builder's name is required")
            name = '<unknown>'
        elif name[0] == '_':
            error(f"builder names must not start with an underscore: '{name}'")
        self.name = name

        if factory is None:
            error(f"builder '{name}' has no factory")
        from buildbot.process.factory import BuildFactory
        if factory is not None and not isinstance(factory, BuildFactory):
            error(f"builder '{name}'s factory is not a BuildFactory instance")
        self.factory = factory

        if isinstance(slavenames, str):
            slavenames = [slavenames]
        if slavenames:
            if not isinstance(slavenames, list):
                error(f"builder '{name}': slavenames must be a list or a string")
        else:
            slavenames = []

        if slavename:
            if not isinstance(slavename, str):
                error(f"builder '{name}': slavename must be a string")
            slavenames = slavenames + [slavename]
        if not slavenames:
            error(f"builder '{name}': at least one slavename is required")

        self.slavenames = slavenames

        if builddir is None:
            builddir = safeTranslate(name)
        self.builddir = builddir

        if slavebuilddir is None:
            slavebuilddir = builddir
        self.slavebuilddir = slavebuilddir

        if category and tags:
            error(f"builder '{name}': category is being replaced by tags; you should only specify tags")
        if category:
            if not isinstance(category, str):
                error(f"builder '{name}': category must be a string")
            tags = [category]
            self.category = category

        if tags:
            if not isinstance(tags, list):
                error(f"builder '{name}': tags must be a list")
            if any(not isinstance(tag, str) for tag in tags):
                error(f"builder '{name}': tags list contains something that is not a string")

        self.tags = tags

        self.nextSlave = nextSlave
        if nextSlave and not callable(nextSlave):
            error('nextSlave must be a callable')
        self.nextBuild = nextBuild
        if nextBuild and not callable(nextBuild):
            error('nextBuild must be a callable')
        self.canStartBuild = canStartBuild
        if canStartBuild and not callable(canStartBuild):
            error('canStartBuild must be a callable')

        self.locks = locks or []
        self.env = env or {}
        if not isinstance(self.env, dict):
            error("builder's env must be a dictionary")
        self.properties = properties or {}
        self.mergeRequests = mergeRequests
        self.description = description

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
    """Mixin to allow services to be reconfigured."""

    reconfig_priority = 128

    @defer.inlineCallbacks
    def reconfigService(self, new_config):
        if not service.IServiceCollection.providedBy(self):
            return

        reconfigurable_services = [
            svc for svc in self
            if isinstance(svc, ReconfigurableServiceMixin)
        ]

        reconfigurable_services.sort(key=lambda svc: -svc.reconfig_priority)

        for svc in reconfigurable_services:
            yield svc.reconfigService(new_config)