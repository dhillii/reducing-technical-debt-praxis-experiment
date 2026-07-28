# This file is part of Buildbot.  Buildbot is free software: you can
# redistribute it and/or modify it under the terms of the GNU General Public
# License as published by the Free Software Foundation, version 2.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
# FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
# more details.
#
# You should have a copy of the GNU General Public License along with
# this program; if not, write to the Free Software Foundation, Inc., 51
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
    def __init__(self, errors=None):
        self.errors = list(errors or [])

    def __str__(self):
        return "\n".join(self.errors)

    def addError(self, msg):
        self.errors.append(msg)

    def __nonzero__(self):
        return bool(self.errors)


_errors = None


def error(msg):
    if _errors is not None:
        _errors.addError(msg)
    else:
        raise ConfigErrors([msg])


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
        self.caches = dict(Builds=15, Changes=10)
        self.schedulers = {}
        self.builders = []
        self.slaves = []
        self.change_sources = []
        self.status = []
        self.user_managers = []
        self.revlink = default_revlink_matcher

    _known_config_keys = {
        "buildbotURL", "buildCacheSize", "builders", "buildHorizon", "caches",
        "change_source", "codebaseGenerator", "changeCacheSize", "changeHorizon",
        'db', "db_poll_interval", "db_url", "debugPassword", "eventHorizon",
        "logCompressionLimit", "logCompressionMethod", "logHorizon",
        "logMaxSize", "logMaxTailSize", "manhole", "mergeRequests", "metrics",
        "multiMaster", "prioritizeBuilders", "projectName", "projectURL",
        "properties", "protocols", "revlink", "schedulers", "slavePortnum",
        "slaves", "status", "title", "titleURL", "user_managers", "validation"
    }

    @classmethod
    def loadConfig(cls, basedir, filename):
        cls._validate_paths(basedir, filename)
        local_dict = cls._execute_config_file(basedir, filename)
        config_dict = cls._extract_config_dict(filename, local_dict)
        cls._check_unknown_keys(filename, config_dict)
        config = cls()
        config._apply_config(filename, config_dict)
        return config

    @staticmethod
    def _validate_paths(basedir, filename):
        if not os.path.isdir(basedir):
            raise ConfigErrors(["basedir '%s' does not exist" % basedir])
        full_path = os.path.join(basedir, filename)
        if not os.path.exists(full_path):
            raise ConfigErrors(["configuration file '%s' does not exist" % full_path])

    @classmethod
    def _execute_config_file(cls, basedir, filename):
        full_path = os.path.join(basedir, filename)
        log.msg("Loading configuration from %r" % (full_path,))
        local_dict = {
            'basedir': os.path.expanduser(basedir),
            '__file__': os.path.abspath(full_path),
        }
        global _errors
        _errors = errors = ConfigErrors()
        old_sys_path = sys.path[:]
        sys.path.append(basedir)
        try:
            try:
                execfile(full_path, local_dict)
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
        return local_dict

    @staticmethod
    def _extract_config_dict(filename, local_dict):
        if 'BuildmasterConfig' not in local_dict:
            error("Configuration file %r does not define 'BuildmasterConfig'" % filename)
        return local_dict['BuildmasterConfig']

    @classmethod
    def _check_unknown_keys(cls, filename, config_dict):
        unknown = set(config_dict.keys()) - cls._known_config_keys
        if unknown:
            if len(unknown) == 1:
                error('Unknown BuildmasterConfig key %s' % unknown.pop())
            else:
                error('Unknown BuildmasterConfig keys %s' % ', '.join(sorted(unknown)))

    def _apply_config(self, filename, config_dict):
        global _errors
        _errors = ConfigErrors()
        try:
            self.load_global(filename, config_dict)
            self.load_validation(filename, config_dict)
            self.load_db(filename, config_dict)
            self.load_metrics(filename, config_dict)
            self.load_caches(filename, config_dict)
            self.load_schedulers(filename, config_dict)
            self.load_builders(filename, config_dict)
            self.load_slaves(filename, config_dict)
            self.load_change_sources(filename, config_dict)
            self.load_status(filename, config_dict)
            self.load_user_managers(filename, config_dict)

            self.check_single_master()
            self.check_schedulers()
            self.check_locks()
            self.check_builders()
            self.check_status()
            self.check_horizons()
            self.check_ports()
        finally:
            _errors = None
        if _errors.errors:
            raise ConfigErrors(_errors.errors)

    # Existing load_* and check_* methods remain unchanged


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
        if slavenames and not isinstance(slavenames, list):
            error("builder '%s': slavenames must be a list or a string" % name)
        slavenames = slavenames or []
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
        reconfigurable_services = [svc for svc in self if isinstance(svc, ReconfigurableServiceMixin)]
        reconfigurable_services.sort(key=lambda svc: -svc.reconfig_priority)
        for svc in reconfigurable_services:
            yield svc.reconfigService(new_config)