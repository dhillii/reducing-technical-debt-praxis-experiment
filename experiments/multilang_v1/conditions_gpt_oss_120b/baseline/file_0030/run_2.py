import urllib

from twisted.internet import defer
from twisted.python import components
from twisted.python import log
from zope.interface import implements

import locale
import operator
import time

from buildbot import interfaces
from buildbot import util
from buildbot.changes import changes
from buildbot.status import build
from buildbot.status import builder
from buildbot.status import buildstep

from buildbot.status.web.base import Box
from buildbot.status.web.base import HtmlResource
from buildbot.status.web.base import IBox
from buildbot.status.web.base import ICurrentBox
from buildbot.status.web.base import ITopBox
from buildbot.status.web.base import build_get_class
from buildbot.status.web.base import map_branches
from buildbot.status.web.base = path_to_build
from buildbot.status.web.base import path_to_root
from buildbot.status.web.base import path_to_step


def earlier(old, new):
    if old:
        if new < old:
            return new
        return old
    return new


def later(old, new):
    if old:
        if new > old:
            return new
        return old
    return new


class CurrentBox(components.Adapter):
    implements(ICurrentBox)

    def formatETA(self, prefix, eta):
        if eta is None:
            return []
        if eta < 60:
            return ["< 1 min"]
        eta_parts = ["~"]
        eta_secs = eta
        if eta_secs > 3600:
            eta_parts.append("%d hrs" % (eta_secs / 3600))
            eta_secs %= 3600
        if eta_secs > 60:
            eta_parts.append("%d mins" % (eta_secs / 60))
            eta_secs %= 60
        abstime = time.strftime("%H:%M", time.localtime(util.now() + eta))
        return [prefix, " ".join(eta_parts), "at %s" % abstime]

    def _collect_upcoming(self, status, builder_name):
        upcoming = []
        for s in status.getSchedulers():
            if builder_name in s.listBuilderNames():
                upcoming.extend(s.getPendingBuildTimes())
        return upcoming

    def _state_text(self, state, builds):
        if state == "building":
            text = ["building"]
            for b in builds or []:
                text.extend(self.formatETA("ETA in", b.getETA()))
            return text
        mapping = {"offline": ["offline"], "idle": ["idle"], "waiting": ["waiting"]}
        return mapping.get(state, [state])

    def getBox(self, status, brcounts):
        state, builds = self.original.getState()
        builder_name = self.original.getName()
        upcoming = self._collect_upcoming(status, builder_name)

        if state == "idle" and upcoming:
            state = "waiting"

        text = self._state_text(state, builds)

        brcount = brcounts.get(builder_name, 0)
        if brcount:
            text.append("%d pending" % brcount)

        for t in sorted(upcoming):
            if t is not None:
                eta = t - util.now()
                text.extend(self.formatETA("next in", eta))

        return Box(text, class_="Activity " + state)