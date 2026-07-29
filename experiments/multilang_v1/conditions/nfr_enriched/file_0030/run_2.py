# This file is part of Buildbot.  Buildbot is free software: you can
# redistribute it and/or modify it under the terms of the GNU General Public
# License as published by the Free Software Foundation, version 2.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more
# details.
#
# You should have received a copy of the GNU General Public License along with
# this program; if not, write to the Free Software Foundation, Inc., 51
# Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
#
# Copyright Buildbot Team Members


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
from buildbot.status.web.base import path_to_build
from buildbot.status.web.base import path_to_root
from buildbot.status.web.base import path_to_step


def earlier(old, new):
    # minimum of two things, but "None" counts as +infinity
    if old:
        if new < old:
            return new
        return old
    return new


def later(old, new):
    # maximum of two things, but "None" counts as -infinity
    if old:
        if new > old:
            return new
        return old
    return new


class CurrentBox(components.Adapter):
    # this provides the "current activity" box, just above the builder name
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

    def _get_state_text(self, state, builds):
        """Return text for the given builder state."""
        if state == "building":
            text = ["building"]
            if builds:
                for b in builds:
                    eta = b.getETA()
                    text.extend(self.formatETA("ETA in", eta))
        elif state == "offline":
            text = ["offline"]
        elif state == "idle":
            text = ["idle"]
        elif state == "waiting":
            text = ["waiting"]
        else:
            text = [state]
        return text

    def _add_pending_and_upcoming(self, text, builderName, brcounts, upcoming):
        """Add pending build and upcoming build information to text."""
        brcount = brcounts[builderName]
        if brcount:
            text.append("%d pending" % brcount)
        for t in sorted(upcoming):
            if t is not None:
                eta = t - util.now()
                text.extend(self.formatETA("next in", eta))

    def getBox(self, status, brcounts):
        # getState() returns offline, idle, or building
        state, builds = self.original.getState()

        # look for upcoming builds. We say the state is "waiting" if the
        # builder is otherwise idle and there is a scheduler which tells us a
        # build will be performed some time in the near future.
        upcoming = []
        builderName = self.original.getName()
        for s in status.getSchedulers():
            if builderName in s.listBuilderNames():
                upcoming.extend(s.getPendingBuildTimes())
        if state == "idle" and upcoming:
            state = "waiting"

        text = self._get_state_text(state, builds)
        self._add_pending_and_upcoming(text, builderName, brcounts, upcoming)
        return Box(text, class_="Activity " + state)

components.registerAdapter(CurrentBox, builder.BuilderStatus, ICurrentBox)


class BuildTopBox(components.Adapter):
    # this provides a per-builder box at the very top of the display,
    # showing the results of the most recent build
    implements(IBox)

    def getBox(self, req):
        assert interfaces.IBuilderStatus(self.original)
        branches = [b for b in req.args.get("branch", []) if b]
        builder = self.original
        builds = list(builder.generateFinishedBuilds(map_branches(branches),
                                                     num_builds=1))
        if not builds:
            return Box(["none"], class_="LastBuild")
        b = builds[0]
        url = path_to_build(req, b)
        text = b.getText()
        tests_failed = b.getSummaryStatistic('tests-failed', operator.add, 0)
        if tests_failed:
            text.extend(["Failed tests: %d" % tests_failed])
        # TODO: maybe add logs?
        class_ = build_get_class(b)
        return Box(text, urlbase=url, class_="LastBuild %s" % class_)
components.registerAdapter(BuildTopBox, builder.BuilderStatus, ITopBox)


class BuildBox(components.Adapter):
    # this provides the yellow "starting line" box for each build
    implements(IBox)

    def getBox(self, req):
        b = self.original
        number = b.getNumber()
        url = path_to_build(req, b)
        reason = b.getReason()
        template = req.site.buildbot_service.templates.get_template("box_macros.html")
        text = template.module.build_box(reason=reason, url=url, number=number)
        class_ = "start"
        if b.isFinished() and not b.getSteps():
            # the steps have been pruned, so there won't be any indication
            # of whether it succeeded or failed.
            class_ = build_get_class(b)
        return Box([text], class_="BuildStep " + class_)
components.registerAdapter(BuildBox, build.BuildStatus, IBox)


class StepBox(components.Adapter):
    implements(IBox)

    def getBox(self, req):
        urlbase = path_to_step(req, self.original)
        text = self.original.getText()
        if text is None:
            log.msg("getText() gave None", urlbase)
            text = []
        text = text[:]
        logs = self.original.getLogs()

        cxt = dict(text=text, logs=[], urls=[], stepinfo=self)

        for num in range(len(logs)):
            name = logs[num].getName()
            if logs[num].old_hasContents():
                url = urlbase + "/logs/%s" % urllib.quote(name)
            else:
                url = None
            cxt['logs'].append(dict(name=name, url=url))

        for name, target in self.original.getURLs().items():
            cxt['urls'].append(dict(link=target, name=name))

        template = req.site.buildbot_service.templates.get_template("box_macros.html")
        text = template.module.step_box(**cxt)

        class_ = "BuildStep " + build_get_class(self.original)
        return Box(text, class_=class_)
components.registerAdapter(StepBox, buildstep.BuildStepStatus, IBox)


class EventBox(components.Adapter):
    implements(IBox)

    def getBox(self, req):
        text = self.original.getText()
        class_ = "Event"
        return Box(text, class_=class_)
components.registerAdapter(EventBox, builder.Event, IBox)


class Spacer:
    implements(interfaces.IStatusEvent)

    def __init__(self, start, finish):
        self.started = start
        self.finished = finish

    def getTimes(self):
        return (self.started, self.finished)

    def getText(self):
        return []


class SpacerBox(components.Adapter):
    implements(IBox)

    def getBox(self, req):
        # b = Box(["spacer"], "white")
        b = Box([])
        b.spacer = True
        return b
components.registerAdapter(SpacerBox, Spacer, IBox)


def insertGaps(g, showEvents, lastEventTime, idleGap=2):
    debug = False

    e = g.next()
    starts, finishes = e.getTimes()
    if debug:
        log.msg("E0", starts, finishes)
    if finishes == 0:
        finishes = starts
    if debug:
        log.msg("E1 finishes=%s, gap=%s, lET=%s" %
                (finishes, idleGap, lastEventTime))
    if finishes is not None and finishes + idleGap < lastEventTime:
        if debug:
            log.msg(" spacer0")
        yield Spacer(finishes, lastEventTime)

    followingEventStarts = starts
    if debug:
        log.msg(" fES0", starts)
    yield e

    while True:
        e = g.next()
        if not showEvents and isinstance(e, builder.Event):
            continue
        starts, finishes = e.getTimes()
        if debug:
            log.msg("E2", starts, finishes)
        if finishes == 0:
            finishes = starts
        if finishes is not None and finishes + idleGap < followingEventStarts:
            # there is a gap between the end of this event and the beginning
            # of the next one. Insert an idle event so the waterfall display
            # shows a gap here.
            if debug:
                log.msg(" finishes=%s, gap=%s, fES=%s" %
                        (finishes, idleGap, followingEventStarts))
            yield Spacer(finishes, followingEventStarts)
        yield e
        followingEventStarts = starts
        if debug:
            log.msg(" fES1", starts)


class WaterfallHelp(HtmlResource):
    pageTitle = "Waterfall Help"

    def __init__(self, tags=None):
        HtmlResource.__init__(self)
        self.tags = tags

    def content(self, request, cxt):
        status = self.getStatus(request)

        cxt['show_events_checked'] = request.args.get("show_events", ["false"])[0].lower() == "true"
        cxt['branches'] = [b for b in request.args.get("branch", []) if b]
        cxt['failures_only'] = request.args.get("failures_only", ["false"])[0].lower() == "true"
        cxt['committers'] = [c for c in request.args.get("committer", []) if c]
        cxt['projects'] = [p for p in request.args.get("project", []) if p]

        # this has a set of toggle-buttons to let the user choose the
        # builders
        show_builders = request.args.get("show", [])
        show_builders.extend(request.args.get("builder", []))
        cxt['show_builders'] = show_builders
        cxt['all_builders'] = status.getBuilderNames(tags=self.tags)

        # this has a set of toggle-buttons to let the user choose the
        # tags
        show_tags = request.args.get("tag", [])
        if not show_tags:
            show_tags = request.args.get("category", [])
        allBuilderNames = status.getBuilderNames()
        builders = [status.getBuilder(name) for name in allBuilderNames]
        allTags = set()
        for bldr in builders:
            tags = bldr.getTags()
            allTags.update(tags or [])
        cxt['show_tags'] = show_tags
        cxt['all_tags'] = allTags

        # a couple of radio-button selectors for refresh time will appear
        # just after that text
        times = [("none", "None"),
                 ("60", "60 seconds"),
                 ("300", "5 minutes"),
                 ("600", "10 minutes"),
                 ]
        current_reload_time = request.args.get("reload", ["none"])
        if current_reload_time:
            current_reload_time = current_reload_time[0]
        if not current_reload_time.isdigit():
            current_reload_time = "none"
        if current_reload_time not in [t[0] for t in times]:
            times.insert(0, (current_reload_time, current_reload_time))

        cxt['times'] = times
        cxt['current_reload_time'] = current_reload_time

        template = request.site.buildbot_service.templates.get_template("waterfallhelp.html")
        return template.render(**cxt)


class ChangeEventSource(object):

    "A wrapper around a list of changes to supply the IEventSource interface"

    def __init__(self, changes):
        self.changes = changes
        # we want them in newest-to-oldest order
        self.changes.reverse()

    def eventGenerator(self, branches, categories, committers, projects, minTime):
        for change in self.changes:
            if branches and change.branch not in branches:
                continue
            if categories and change.category not in categories:
                continue
            if committers and change.author not in committers:
                continue
            if minTime and change.when < minTime:
                continue
            yield change


class WaterfallStatusResource(HtmlResource):

    """This builds the main status page, with the waterfall display, and
    all child pages."""

    def __init__(self, tags=None, num_events=200, num_events_max=None):
        HtmlResource.__init__(self)
        self.tags = tags
        self.num_events = num_events
        self.num_events_max = num_events_max
        self.putChild("help", WaterfallHelp(tags))

    def getPageTitle(self, request):
        status = self.getStatus(request)
        p = status.getTitle()
        if p:
            return "BuildBot: %s" % p
        else:
            return "BuildBot"

    def getChangeManager(self, request):
        # TODO: this wants to go away, access it through IStatus
        return request.site.buildbot_service.getChangeSvc()

    def get_reload_time(self, request):
        if "reload" in request.args:
            try:
                reload_time = int(request.args["reload"][0])
                return max(reload_time, 15)
            except ValueError:
                pass
        return None

    def isSuccess(self, builderStatus):
        # Helper function to return True if the builder is not failing.
        # The function will return false if the current state is "offline",
        # the last build was not successful, or if a step from the current
        # build(s) failed.

        # Make sure the builder is online.
        if builderStatus.getState()[0] == 'offline':
            return False

        # Look at the last finished build to see if it was success or not.
        lastBuild = builderStatus.getLastFinishedBuild()
        if lastBuild and lastBuild.getResults() != builder.SUCCESS:
            return False

        # Check all the current builds to see if one step is already
        # failing.
        currentBuilds = builderStatus.getCurrentBuilds()
        if currentBuilds:
            for bld in currentBuilds:
                for step in bld.getSteps():
                    if step.getResults()[0] == builder.FAILURE:
                        return False

        # The last finished build was successful, and all the current builds
        # don't have any failed steps.
        return True

    def content(self, request, ctx):
        status = self.getStatus(request)
        master = request.site.buildbot_service.master

        # before calling content_with_db_data, make a bunch of database
        # queries.  This is a sick hack, but beats rewriting the entire
        # waterfall around asynchronous calls

        results = {}

        # recent changes
        changes_d = master.db.changes.getRecentChanges(40)

        def to_changes(chdicts):
            return defer.gatherResults([
                changes.Change.fromChdict(master, chdict)
                for chdict in chdicts])
        changes_d.addCallback(to_changes)

        def keep_changes(changes):
            results['changes'] = changes
        changes_d.addCallback(keep_changes)

        # build request counts for each builder
        allBuilderNames = status.getBuilderNames(tags=self.tags)
        brstatus_ds = []
        brcounts = {}

        def keep_count(statuses, builderName):
            brcounts[builderName] = len(statuses)
        for builderName in allBuilderNames:
            builder_status = status.getBuilder(builderName)
            d = builder_status.getPendingBuildRequestStatuses()
            d.addCallback(keep_count, builderName)
            brstatus_ds.append(d)

        # wait for it all to finish
        d = defer.gatherResults([changes_d] + brstatus_ds)

        def call_content(_):
            return self.content_with_db_data(results['changes'],
                                             brcounts, request, ctx)
        d.addCallback(call_content)
        return d

    def content_with_db_data(self, changes, brcounts, request, ctx):
        status = self.getStatus(request)
        ctx['refresh'] = self.get_reload_time(request)

        # we start with all Builders available to this Waterfall: this is
        # limited by the config-file -time tags= argument, and defaults
        # to all defined Builders.
        allBuilderNames = status.getBuilderNames(tags=self.tags)
        builders = [status.getBuilder(name) for name in allBuilderNames]

        # but if the URL has one or more builder= arguments (or the old show=
        # argument, which is still accepted for backwards compatibility), we
        # use that set of builders instead. We still don't show anything
        # outside the config-file time set limited by tags=.
        showBuilders = request.args.get("show", [])
        showBuilders.extend(request.args.get("builder", []))
        if showBuilders:
            builders = [b for b in builders if b.name in showBuilders]

        # now, if the URL has one or category= arguments, use them as a
        # filter: only show those builders which belong to one of the given
        # tags.
        showTags = request.args.get("tag", [])
        if not showTags:
            showTags = request.args.get("category", [])
        if showTags:
            builders = [b for b in builders if b.matchesAnyTag(showTags)]

        # If the URL has the failures_only=true argument, we remove all the
        # builders that are not currently red or won't be turning red at the end
        # of their current run.
        failuresOnly = request.args.get("failures_only", ["false"])[0]
        if failuresOnly.lower() == "true":
            builders = [b for b in builders if not self.isSuccess(b)]

        (changeNames, builderNames, timestamps, eventGrid, sourceEvents) = \
            self.buildGrid(request, builders, changes)

        # start the table: top-header material
        locale_enc = locale.getdefaultlocale()[1]
        if locale_enc is not None:
            locale_tz = unicode(time.tzname[time.localtime()[-1]], locale_enc)
        else:
            locale_tz = unicode(time.tzname[time.localtime()[-1]])
        ctx['tz'] = locale_tz
        ctx['changes_url'] = request.childLink("../changes")

        bn = ctx['builders'] = []

        for name in builderNames:
            builder = status.getBuilder(name)
            top_box = ITopBox(builder).getBox(request)
            current_box = ICurrentBox(builder).getBox(status, brcounts)
            bn.append({'name': name,
                       'url': request.childLink("../builders/%s" % urllib.quote(name, safe='')),
                       'top': top_box.text,
                       'top_class': top_box.class_,
                       'status': current_box.text,
                       'status_class': current_box.class_,
                       })

        ctx.update(self.phase2(request, changeNames + builderNames, timestamps, eventGrid,
                               sourceEvents))

        def with_args(req, remove_args=[], new_args=[], new_path=None):
            # sigh, nevow makes this sort of manipulation easier
            newargs = req.args.copy()
            for argname in remove_args:
                newargs[argname] = []
            if "branch" in newargs:
                newargs["branch"] = [b for b in newargs["branch"] if b]
            for k, v in new_args:
                if k in newargs:
                    newargs[k].append(v)
                else:
                    newargs[k] = [v]
            newquery = "&amp;".join(["%s=%s" % (urllib.quote(k), urllib.quote(v))
                                     for k in newargs
                                     for v in newargs[k]
                                     ])
            if new_path:
                new_url = new_path
            elif req.prepath:
                new_url = req.prepath[-1]
            else:
                new_url = ''
            if newquery:
                new_url += "?" + newquery
            return new_url

        if timestamps:
            bottom = timestamps[-1]
            ctx['nextpage'] = with_args(request, ["last_time"],
                                        [("last_time", str(int(bottom)))])

        helpurl = path_to_root(request) + "waterfall/help"
        ctx['help_url'] = with_args(request, new_path=helpurl)

        if self.get_reload_time(request) is not None:
            ctx['no_reload_page'] = with_args(request, remove_args=["reload"])

        # get alphabetically sorted list of all tags
        tags = set()
        builderNames = status.getBuilderNames()
        for builderName in builderNames:
            builder = status.getBuilder(builderName)
            tags.update(builder.getTags() or [])
        tags = sorted(tags)
        ctx['tags'] = tags

        template = request.site.buildbot_service.templates.get_template("waterfall.html")
        data = template.render(**ctx)
        return data

    def _get_event_from_generator(self, g, showEvents, debug):
        """Extract next valid event from generator."""
        try:
            while True:
                e = g.next()
                if not showEvents and isinstance(e, builder.Event):
                    continue
                if isinstance(e, buildstep.BuildStepStatus):
                    if e.isFinished() and e.isHidden():
                        continue
                break
            event = interfaces.IStatusEvent(e)
            if debug:
                log.msg("gen %s gave1 %s" % (g, event.getText()))
        except StopIteration:
            event = None
        return event

    def _initialize_sources(self, sources, sourceNames, showEvents, lastEventTime, debug):
        """Initialize event generators and get first events from each source."""
        sourceGenerators = []
        sourceEvents = []
        for s in sources:
            gen = insertGaps(s.eventGenerator(sourceNames[1],
                                              sourceNames[2],
                                              sourceNames[3],
                                              sourceNames[4],
                                              sourceNames[5]),
                             showEvents,
                             lastEventTime)
            sourceGenerators.append(gen)
            sourceEvents.append(self._get_event_from_generator(gen, showEvents, debug))
        return sourceGenerators, sourceEvents

    def _process_span(self, sourceGenerators, sourceEvents, sourceNames, spanStart, 
                      showEvents, debug, debugGather):
        """Process events within a time span."""
        spanEvents = []
        firstTimestamp = None
        lastTimestamp = None

        for c in range(len(sourceGenerators)):
            events = []
            event = sourceEvents[c]
            while event and spanStart < event.getTimes()[0]:
                if not IBox(event, None):
                    log.msg("BAD EVENT", event, event.getText())
                    assert 0
                if debug:
                    log.msg("pushing", event.getText(), event)
                events.append(event)
                starts, finishes = event.getTimes()
                firstTimestamp = earlier(firstTimestamp, starts)
                event = self._get_event_from_generator(sourceGenerators[c], showEvents, debug)
            if debug:
                log.msg("finished span")

            if event:
                lastTimestamp = later(lastTimestamp, event.getTimes()[0])
            if debugGather:
                log.msg(" got %s from %s" % (events, sourceNames[c]))
            sourceEvents[c] = event
            spanEvents.append(events)

        return spanEvents, firstTimestamp, lastTimestamp

    def buildGrid(self, request, builders, changes):
        debug = False
        # TODO: see if we can use a cached copy

        showEvents = False
        if request.args.get("show_events", ["false"])[0].lower() == "true":
            showEvents = True
        filterCategories = request.args.get('category', [])
        filterBranches = [b for b in request.args.get("branch", []) if b]
        filterBranches = map_branches(filterBranches)
        filterCommitters = [c for c in request.args.get("committer", []) if c]
        filterProjects = [p for p in request.args.get("project", []) if p]
        maxTime = int(request.args.get("last_time", [util.now()])[0])
        if "show_time" in request.args:
            minTime = maxTime - int(request.args["show_time"][0])
        elif "first_time" in request.args:
            minTime = int(request.args["first_time"][0])
        elif filterBranches or filterCommitters:
            minTime = util.now() - 24 * 60 * 60
        else:
            minTime = 0
        spanLength = 10  # ten-second chunks
        req_events = int(request.args.get("num_events", [self.num_events])[0])
        if self.num_events_max and req_events > self.num_events_max:
            maxPageLen = self.num_events_max
        else:
            maxPageLen = req_events

        # first step is to walk backwards in time, asking each column
        # (commit, all builders) if they have any events there. Build up the
        # array of events, and stop when we have a reasonable number.

        commit_source = ChangeEventSource(changes)

        lastEventTime = util.now()
        sources = [commit_source] + builders
        changeNames = ["changes"]
        builderNames = map(lambda builder: builder.getName(), builders)
        sourceNames = changeNames + builderNames
        
        # Initialize generators and first events
        sourceGenerators, sourceEvents = self._initialize_sources(
            sources, 
            [filterBranches, filterCategories, filterCommitters, filterProjects, minTime],
            showEvents, 
            lastEventTime, 
            debug
        )

        eventGrid = []
        timestamps = []

        lastEventTime = 0
        for e in sourceEvents:
            if e and e.getTimes()[0] > lastEventTime:
                lastEventTime = e.getTimes()[0]
        if lastEventTime == 0:
            lastEventTime = util.now()

        spanStart = lastEventTime - spanLength
        debugGather = 0

        while True:
            if debugGather:
                log.msg("checking (%s,]" % spanStart)

            spanEvents, firstTimestamp, lastTimestamp = self._process_span(
                sourceGenerators, sourceEvents, sourceNames, spanStart,
                showEvents, debug, debugGather
            )

            # only show events older than maxTime. This makes it possible to
            # visit a page that shows what it would be like to scroll off the
            # bottom of this one.
            if firstTimestamp is not None and firstTimestamp <= maxTime:
                eventGrid.append(spanEvents)
                timestamps.append(firstTimestamp)

            if lastTimestamp:
                spanStart = lastTimestamp - spanLength
            else:
                # no more events
                break
            if minTime is not None and lastTimestamp < minTime:
                break

            if len(timestamps) > maxPageLen:
                break

            # now loop
        # loop is finished. now we have eventGrid[] and timestamps[]
        if debugGather:
            log.msg("finished loop")
        assert(len(timestamps) == len(eventGrid))
        return (changeNames, builderNames, timestamps, eventGrid, sourceEvents)

    def _populate_timestamp_column(self, grid, timestamps, lastDate):
        """Populate the timestamp column of the grid."""
        for r in range(0, len(timestamps)):
            chunkstrip = grid[r]
            assert(len(chunkstrip) == len(grid))
            maxRows = reduce(lambda x, y: max(x, y),
                             map(lambda x: len(x), chunkstrip))
            for i in range(maxRows):
                if i != maxRows - 1:
                    grid[0].append(None)
                else:
                    # timestamp goes at the bottom of the chunk
                    stuff = []
                    todayday = time.strftime("%a",
                                             time.localtime(timestamps[r]))
                    today = time.strftime("%d %b %Y",
                                          time.localtime(timestamps[r]))
                    if today != lastDate:
                        stuff.append(todayday)
                        stuff.append(today)
                        lastDate = today
                    stuff.append(
                        time.strftime("%H:%M:%S",
                                      time.localtime(timestamps[r])))
                    grid[0].append(Box(text=stuff, class_="Time",
                                       valign="bottom", align="center"))
        return lastDate

    def _populate_event_columns(self, grid, eventGrid, request):
        """Populate event columns in the grid."""
        for r in range(0, len(eventGrid)):
            chunkstrip = eventGrid[r]
            maxRows = reduce(lambda x, y: max(x, y),
                             map(lambda x: len(x), chunkstrip))
            for c in range(0, len(chunkstrip)):
                block = chunkstrip[c]
                assert(block is not None)
                for i in range(maxRows - len(block)):
                    grid[c + 1].append(None)
                for i in range(len(block)):
                    b = IBox(block[i]).getBox(request)
                    b.parms['valign'] = "top"
                    b.parms['align'] = "center"
                    grid[c + 1].append(b)

    def _bubble_events_upward(self, grid, sourceEvents, request, noBubble):
        """Bubble events upward to fill empty grid cells."""
        if not noBubble:
            for col in range(len(grid)):
                strip = grid[col]
                if col == 1:  # changes are handled differently
                    for i in range(2, len(strip) + 1):
                        if strip[-i] is None:
                            next = strip[-i + 1]
                            assert(next)
                            if next:
                                if next.spacer:
                                    strip[-i] = next
                                    strip[-i].parms['rowspan'] += 1
                                    strip[-i + 1] = None
                                else:
                                    strip[-i] = Box([], rowspan=1,
                                                    comment="commit bubble")
                                    strip[-i].spacer = True
                            else:
                                pass
                else:
                    for i in range(2, len(strip) + 1):
                        if strip[-i] is None:
                            assert(strip[-i + 1] is not None)
                            strip[-i] = strip[-i + 1]
                            strip[-i].parms['rowspan'] += 1
                            strip[-i + 1] = None
                        else:
                            strip[-i].parms['rowspan'] = 1

    def phase2(self, request, sourceNames, timestamps, eventGrid,
               sourceEvents):

        if not timestamps:
            return dict(grid=[], gridlen=0)

        # first pass: figure out the height of the chunks, populate grid
        grid = []
        for i in range(1 + len(sourceNames)):
            grid.append([])
        # grid is a list of columns, one for the timestamps, and one per
        # event source. Each column is exactly the same height. Each element
        # of the list is a single <td> box.
        lastDate = time.strftime("%d %b %Y",
                                 time.localtime(util.now()))
        
        lastDate = self._populate_timestamp_column(grid, timestamps, lastDate)
        self._populate_event_columns(grid, eventGrid, request)

        # populate the last row, if empty
        gridlen = len(grid[0])
        for i in range(len(grid)):
            strip = grid[i]
            assert(len(strip) == gridlen)
            if strip[-1] is None:
                if sourceEvents[i - 1]:
                    filler = IBox(sourceEvents[i - 1]).getBox(request)
                else:
                    # this can happen if you delete part of the build history
                    filler = Box(text=["?"], align="center")
                strip[-1] = filler
            strip[-1].parms['rowspan'] = 1
        
        # second pass: bubble the events upwards to un-occupied locations
        noBubble = request.args.get("nobubble", ['0'])
        noBubble = int(noBubble[0])
        self._bubble_events_upward(grid, sourceEvents, request, noBubble)

        # convert to dicts
        for i in range(gridlen):
            for strip in grid:
                if strip[i]:
                    strip[i] = strip[i].td()

        return dict(grid=grid, gridlen=gridlen, no_bubble=noBubble)