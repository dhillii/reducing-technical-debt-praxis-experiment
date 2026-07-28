# This file is part of Buildbot.  Buildbot is free software: you can
# redistribute it and/or modify it under the terms of the GNU General Public
# License as published by the Free Software Foundation, version 2.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
# FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
# more details.
#
# You should have received a copy of the GNU General Public License along
# with this program; if not, write to the Free Software Foundation, Inc., 51
# Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
#
# Copyright Buildbot Team Members

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


class MasterConfig(object):
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
    def loadConfig(cls, basedir, filename):
        cls._ensure_basedir(basedir)
        full_path = cls._ensure_file_exists(basedir, filename)
        local_dict = cls._prepare_local_dict(basedir, full_path)
        errors = ConfigErrors()
        global _errors
        _errors = errors
        old_sys_path = sys.path[:]
        sys.path.append(basedir)
        try:
            cls._execute_config_file(full_path, local_dict)
        except ConfigErrors as e:
            for err in e.errors:
                error(err)
            raise errors
        except Exception:
            log.err(failure.Failure(), 'error while parsing config file:')
            error("error while parsing config file: %s (traceback in logfile)" %
                  (sys.exc_info()[1],))
            raise errors
        finally:
            sys.path[:] = old_sys_path
            _errors = None

        if 'BuildmasterConfig' not in local_dict:
            error("Configuration file %r does not define 'BuildmasterConfig'" % (full_path,))
        config_dict = local_dict['BuildmasterConfig']
        cls._check_unknown_keys(config_dict)
        config = cls()
        _errors = errors
        try:
            config.load_global(full_path, config_dict)
            config.load_validation(full_path, config_dict)
            config.load_db(full_path, config_dict)
            config.load_metrics(full_path, config_dict)
            config.load_caches(full_path, config_dict)
            config.load_schedulers(full_path, config_dict)
            config.load_builders(full_path, config_dict)
            config.load_slaves(full_path, config_dict)
            config.load_change_sources(full_path, config_dict)
            config.load_status(full_path, config_dict)
            config.load_user_managers(full_path, config_dict)
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

    @staticmethod
    def _ensure_basedir(basedir):
        if not os.path.isdir(basedir):
            raise ConfigErrors(["basedir '%s' does not exist" % basedir])

    @staticmethod
    def _ensure_file_exists(basedir, filename):
        path = os.path.join(basedir, filename)
        if not os.path.exists(path):
            raise ConfigErrors(["configuration file '%s' does not exist" % path])
        return path

    @staticmethod
    def _prepare_local_dict(basedir, filename):
        return {
            'basedir': os.path.expanduser(basedir),
            '__file__': os.path.abspath(filename),
        }

    @staticmethod
    def _execute_config_file(filename, local_dict):
        execfile(filename, local_dict)

    @staticmethod
    def _check_unknown_keys(config_dict):
        unknown = set(config_dict.keys()) - MasterConfig._known_config_keys
        if unknown:
            if len(unknown) == 1:
                error('Unknown BuildmasterConfig key %s' % unknown.pop())
            else:
                error('Unknown BuildmasterConfig keys %s' % ', '.join(sorted(unknown)))

    def load_global(self, filename, config_dict):
        self._copy_global_params(config_dict)
        self._validate_log_compression_method(config_dict)
        self._update_properties(config_dict, filename)
        self._validate_merge_requests(config_dict)
        self._validate_codebase_generator(config_dict)
        self._validate_prioritize_builders(config_dict)
        self._process_protocols(config_dict)
        self._apply_slave_portnum(config_dict)
        self._set_multi_master(config_dict)
        self._set_debug_password(config_dict)
        self._set_manhole(config_dict)
        self._set_revlink(config_dict)

    def _copy_global_params(self, config_dict):
        def copy_param(name, alt_key=None, check_type=None, type_name=None):
            if name in config_dict:
                v = config_dict[name]
            elif alt_key and alt_key in config_dict:
                v = config_dict[alt_key]
            else:
                return
            if v is not None and check_type and not isinstance(v, check_type):
                error("c['%s'] must be %s" % (name, type_name))
            else:
                setattr(self, name, v)

        def copy_int(name, alt_key=None):
            copy_param(name, alt_key, int, 'an int')

        def copy_str(name, alt_key=None):
            copy_param(name, alt_key, basestring, 'a string')

        copy_str('title', alt_key='projectName')
        copy_str('titleURL', alt_key='projectURL')
        copy_str('buildbotURL')
        copy_int('changeHorizon')
        copy_int('eventHorizon')
        copy_int('logHorizon')
        copy_int('buildHorizon')
        copy_int('logCompressionLimit')
        copy_int('logMaxSize')
        copy_int('logMaxTailSize')
        copy_str('debugPassword')

    def _validate_log_compression_method(self, config_dict):
        if 'logCompressionMethod' in config_dict:
            method = config_dict.get('logCompressionMethod')
            if method not in ('bz2', 'gz'):
                error("c['logCompressionMethod'] must be 'bz2' or 'gz'")
            self.logCompressionMethod = method

    def _update_properties(self, config_dict, filename):
        props = config_dict.get('properties', {})
        if not isinstance(props, dict):
            error("c['properties'] must be a dictionary")
        else:
            self.properties.update(props, filename)

    def _validate_merge_requests(self, config_dict):
        mr = config_dict.get('mergeRequests')
        if mr not in (None, True, False) and not callable(mr):
            error("mergeRequests must be a callable, True, or False")
        else:
            self.mergeRequests = mr

    def _validate_codebase_generator(self, config_dict):
        cg = config_dict.get('codebaseGenerator')
        if cg is not None and not callable(cg):
            error("codebaseGenerator must be a callable accepting a dict and returning a str")
        else:
            self.codebaseGenerator = cg

    def _validate_prioritize_builders(self, config_dict):
        pb = config_dict.get('prioritizeBuilders')
        if pb is not None and not callable(pb):
            error("prioritizeBuilders must be a callable")
        else:
            self.prioritizeBuilders = pb

    def _process_protocols(self, config_dict):
        protocols = config_dict.get('protocols', {})
        if not isinstance(protocols, dict):
            error("c['protocols'] must be dict")
            return
        for proto, options in protocols.iteritems():
            if not isinstance(proto, str):
                error("c['protocols'] keys must be strings")
            if not isinstance(options, dict):
                error("c['protocols']['%s'] must be a dict" % proto)
                return
            if (proto == "pb" and options.get("port") and
                    'slavePortnum' in config_dict):
                error("Both c['slavePortnum'] and c['protocols']['pb']['port']"
                      " defined, recommended to remove slavePortnum and leave"
                      " only c['protocols']['pb']['port']")
        self.protocols = protocols

    def _apply_slave_portnum(self, config_dict):
        if 'slavePortnum' in config_dict:
            sp = config_dict.get('slavePortnum')
            if isinstance(sp, int):
                sp = "tcp:%d" % sp
            pb_opts = self.protocols.get('pb', {})
            pb_opts['port'] = sp
            self.protocols['pb'] = pb_opts

    def _set_multi_master(self, config_dict):
        if 'multiMaster' in config_dict:
            self.multiMaster = config_dict["multiMaster"]

    def _set_manhole(self, config_dict):
        if 'manhole' in config_dict:
            self.manhole = config_dict['manhole']

    def _set_revlink(self, config_dict):
        if 'revlink' in config_dict:
            rev = config_dict['revlink']
            if not callable(rev):
                error("revlink must be a callable")
            else:
                self.revlink = rev

    def load_validation(self, filename, config_dict):
        validation = config_dict.get("validation", {})
        if not isinstance(validation, dict):
            error("c['validation'] must be a dictionary")
        else:
            unknown = set(validation.keys()) - set(self.validation.keys())
            if unknown:
                error("unrecognized validation key(s): %s" % ", ".join(unknown))
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
        interval = self.db['db_poll_interval']
        if interval is not None and not isinstance(interval, int):
            error("c['db_poll_interval'] must be an int")
        else:
            self.db['db_poll_interval'] = interval

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
                        error("value for cache size '%s' must be an integer" % name)
                    if value < 1:
                        error("'%s' cache size must be at least 1, got '%s'" % (name, value))
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
        if not isinstance(schedulers, (list, tuple)):
            error("c['schedulers'] must be a list of Scheduler instances")
            return
        for s in schedulers:
            if not interfaces.IScheduler.providedBy(s):
                error("c['schedulers'] must be a list of Scheduler instances")
                return
        seen = set()
        for s in schedulers:
            if s.name in seen:
                error("scheduler name '%s' used multiple times" % s.name)
            seen.add(s.name)
        self.schedulers = {s.name: s for s in schedulers}

    def load_builders(self, filename, config_dict):
        if 'builders' not in config_dict:
            return
        builders = config_dict['builders']
        if not isinstance(builders, (list, tuple)):
            error("c['builders'] must be a list")
            return

        def to_builder_cfg(b):
            if isinstance(b, BuilderConfig):
                return b
            if isinstance(b, dict):
                return BuilderConfig(**b)
            error("%r is not a builder config (in c['builders']" % b)
            return None

        builders = [to_builder_cfg(b) for b in builders]
        for b in builders:
            if b and os.path.isabs(b.builddir):
                warnings.warn("Absolute path '%s' for builder may cause "
                              "mayhem.  Perhaps you meant to specify slavebuilddir "
                              "instead." % b.builddir)
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
                error("slave name '%s' is reserved" % sl.slavename)
                return
        self.slaves = slaves

    def load_change_sources(self, filename, config_dict):
        src = config_dict.get('change_source', [])
        if isinstance(src, (list, tuple)):
            sources = src
        else:
            sources = [src]
        for s in sources:
            if not interfaces.IChangeSource.providedBy(s):
                error("c['change_source'] must be a list of change sources")
                return
        self.change_sources = sources

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
        managers = config_dict['user_managers']
        if not isinstance(managers, (list, tuple)):
            error("c['user_managers'] must be a list of user managers")
            return
        self.user_managers = managers

    def check_single_master(self):
        if self.multiMaster:
            return
        if not self.slaves:
            error("no slaves are configured")
        if not self.builders:
            error("no builders are configured")
        unscheduled = set(b.name for b in self.builders)
        for s in self.schedulers.itervalues():
            for n in s.listBuilderNames():
                unscheduled.discard(n)
        if unscheduled:
            error("builder(s) %s have no schedulers to drive them" % ', '.join(unscheduled))

    def check_schedulers(self):
        if self.multiMaster:
            return
        all_names = set(b.name for b in self.builders)
        for s in self.schedulers.itervalues():
            for n in s.listBuilderNames():
                if n not in all_names:
                    error("Unknown builder '%s' in scheduler '%s'" % (n, s.name))

    def check_locks(self):
        lock_dict = {}

        def check_lock(l):
            if isinstance(l, locks.LockAccess):
                l = l.lockid
            if l.name in lock_dict and lock_dict[l.name] is not l:
                error("Two locks share the same name, '%s'" % l.name)
            else:
                lock_dict[l.name] = l

        for b in self.builders:
            if b.locks:
                for l in b.locks:
                    check_lock(l)

    def check_builders(self):
        slavenames = set(s.slavename for s in self.slaves)
        seen_names = set()
        seen_dirs = set()
        for b in self.builders:
            unknown = set(b.slavenames) - slavenames
            if unknown:
                error("builder '%s' uses unknown slaves %s" % (b.name, ", ".join(repr(u) for u in unknown)))
            if b.name in seen_names:
                error("duplicate builder name '%s'" % b.name)
            seen_names.add(b.name)
            if b.builddir in seen_dirs:
                error("duplicate builder builddir '%s'" % b.builddir)
            seen_dirs.add(b.builddir)

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
        if not name or type(name) not in (str, unicode):
            error("builder's name is required")
            name = '<unknown>'
        elif name[0] == '_':
            error("builder names must not start with an underscore: '%s'" % name)
        self.name = name
        if factory is None:
            error("builder '%s' has no factory" % name)
        from buildbot.process.factory import BuildFactory
        if factory is not None and not isinstance(factory, BuildFactory):
            error("builder '%s's factory is not a BuildFactory instance" % name)
        self.factory = factory
        if isinstance(slavenames, str):
            slavenames = [slavenames]
        if slavenames:
            if not isinstance(slavenames, list):
                error("builder '%s': slavenames must be a list or a string" % name)
        else:
            slavenames = []
        if slavename:
            if not isinstance(slavename, str):
                error("builder '%s': slavename must be a string" % name)
            slavenames = slavenames + [slavename]
        if not slavenames:
            error("builder '%s': at least one slavename is required" % name)
        self.slavenames = slavenames
        if builddir is None:
            builddir = safeTranslate(name)
        self.builddir = builddir
        if slavebuilddir is None:
            slavebuilddir = builddir
        self.slavebuilddir = slavebuilddir
        if category and tags:
            error("builder '%s': category is being replaced by tags; you should only specify tags" % name)
        if category:
            if not isinstance(category, str):
                error("builder '%s': category must be a string" % name)
            tags = [category]
            self.category = category
        if tags:
            if not isinstance(tags, list):
                error("builder '%s': tags must be a list" % name)
            if any(not isinstance(tag, str) for tag in tags):
                error("builder '%s': tags list contains something that is not a string" % name)
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
    reconfig_priority = 128

    @defer.inlineCallbacks
    def reconfigService(self, new_config):
        if not service.IServiceCollection.providedBy(self):
            return
        reconfigurable_services = [svc for svc in self
                                   if isinstance(svc, ReconfigurableServiceMixin)]
        reconfigurable_services.sort(key=lambda svc: -svc.reconfig_priority)
        for svc in reconfigurable_services:
            yield svc.reconfigService(new_config)