/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hadoop.yarn.server.resourcemanager.webapp;

import java.io.IOException;
import java.lang.reflect.UndeclaredThrowableException;
import java.security.AccessControlException;
import java.nio.ByteBuffer;
import java.security.Principal;
import java.security.PrivilegedExceptionAction;
import java.util.Arrays;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentMap;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.ws.rs.Consumes;
import javax.ws.rs.DELETE;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.PUT;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.QueryParam;
import javax.ws.rs.core.Context;
import javax.ws.rs.core.HttpHeaders;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import javax.ws.rs.core.Response.Status;

import org.apache.commons.codec.binary.Base64;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.CommonConfigurationKeys;
import org.apache.hadoop.io.DataOutputBuffer;
import org.apache.hadoop.io.Text;
import org.apache.hadoop.security.Credentials;
import org.apache.hadoop.security.UserGroupInformation;
import org.apache.hadoop.security.UserGroupInformation.AuthenticationMethod;
import org.apache.hadoop.security.authentication.server.KerberosAuthenticationHandler;
import org.apache.hadoop.security.authorize.AuthorizationException;
import org.apache.hadoop.security.token.Token;
import org.apache.hadoop.security.token.TokenIdentifier;
import org.apache.hadoop.security.token.delegation.web.DelegationTokenAuthenticationHandler;
import org.apache.hadoop.util.StringUtils;
import org.apache.hadoop.yarn.api.protocolrecords.GetApplicationsRequest;
import org.apache.hadoop.yarn.api.protocolrecords.GetNewApplicationRequest;
import org.apache.hadoop.yarn.api.protocolrecords.GetNewApplicationResponse;
import org.apache.hadoop.yarn.api.protocolrecords.KillApplicationRequest;
import org.apache.hadoop.yarn.api.protocolrecords.KillApplicationResponse;
import org.apache.hadoop.yarn.api.protocolrecords.SubmitApplicationRequest;
import org.apache.hadoop.yarn.api.protocolrecords.SubmitApplicationResponse;
import org.apache.hadoop.security.token.SecretManager.InvalidToken;
import org.apache.hadoop.yarn.api.protocolrecords.CancelDelegationTokenRequest;
import org.apache.hadoop.yarn.api.protocolrecords.CancelDelegationTokenResponse;
import org.apache.hadoop.yarn.api.protocolrecords.GetDelegationTokenRequest;
import org.apache.hadoop.yarn.api.protocolrecords.GetDelegationTokenResponse;
import org.apache.hadoop.yarn.api.protocolrecords.RenewDelegationTokenRequest;
import org.apache.hadoop.yarn.api.protocolrecords.RenewDelegationTokenResponse;
import org.apache.hadoop.yarn.api.protocolrecords.MoveApplicationAcrossQueuesRequest;
import org.apache.hadoop.yarn.api.records.ApplicationAccessType;
import org.apache.hadoop.yarn.api.records.ApplicationId;
import org.apache.hadoop.yarn.api.records.ApplicationReport;
import org.apache.hadoop.yarn.api.records.ApplicationSubmissionContext;
import org.apache.hadoop.yarn.api.records.ContainerLaunchContext;
import org.apache.hadoop.yarn.api.records.FinalApplicationStatus;
import org.apache.hadoop.yarn.api.records.LocalResource;
import org.apache.hadoop.yarn.api.records.NodeId;
import org.apache.hadoop.yarn.api.records.NodeState;
import org.apache.hadoop.yarn.api.records.Priority;
import org.apache.hadoop.yarn.api.records.QueueACL;
import org.apache.hadoop.yarn.api.records.Resource;
import org.apache.hadoop.yarn.api.records.YarnApplicationState;
import org.apache.hadoop.yarn.conf.YarnConfiguration;
import org.apache.hadoop.yarn.exceptions.YarnException;
import org.apache.hadoop.yarn.exceptions.YarnRuntimeException;
import org.apache.hadoop.yarn.factories.RecordFactory;
import org.apache.hadoop.yarn.factory.providers.RecordFactoryProvider;
import org.apache.hadoop.yarn.security.client.RMDelegationTokenIdentifier;
import org.apache.hadoop.yarn.server.resourcemanager.RMAuditLogger;
import org.apache.hadoop.yarn.server.resourcemanager.RMAuditLogger.AuditConstants;
import org.apache.hadoop.yarn.server.resourcemanager.RMServerUtils;
import org.apache.hadoop.yarn.server.resourcemanager.ResourceManager;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.RMApp;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.attempt.RMAppAttempt;
import org.apache.hadoop.yarn.server.resourcemanager.rmnode.RMNode;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.ResourceScheduler;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.capacity.CSQueue;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.capacity.CapacityScheduler;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.fair.FairScheduler;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.fifo.FifoScheduler;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.AppAttemptInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.AppAttemptsInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.NewApplication;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.AppInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.AppState;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.AppQueue;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.ApplicationSubmissionContextInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.ApplicationStatisticsInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.AppsInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.CapacitySchedulerInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.ClusterInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.ClusterMetricsInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.CredentialsInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.DelegationToken;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.FairSchedulerInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.FifoSchedulerInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.LocalResourceInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.NodeInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.NodesInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.ResourceInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.SchedulerInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.SchedulerTypeInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.StatisticsItemInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.NodeLabelsInfo;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.NodeToLabelsInfo;
import org.apache.hadoop.yarn.server.utils.BuilderUtils;
import org.apache.hadoop.yarn.util.ConverterUtils;
import org.apache.hadoop.yarn.webapp.BadRequestException;
import org.apache.hadoop.yarn.webapp.NotFoundException;
import org.apache.hadoop.yarn.webapp.util.WebAppUtils;

import com.google.inject.Inject;
import com.google.inject.Singleton;

@Singleton
@Path("/ws/v1/cluster")
public class RMWebServices {
  private static final Log LOG =
      LogFactory.getLog(RMWebServices.class.getName());
  private static final String EMPTY = "";
  private static final String ANY = "*";
  private final ResourceManager rm;
  private static RecordFactory recordFactory = RecordFactoryProvider
      .getRecordFactory(null);
  private final Configuration conf;
  private @Context HttpServletResponse response;

  public final static String DELEGATION_TOKEN_HEADER =
      "Hadoop-YARN-RM-Delegation-Token";

  @Inject
  public RMWebServices(final ResourceManager rm, Configuration conf) {
    this.rm = rm;
    this.conf = conf;
  }

  RMWebServices(ResourceManager rm, Configuration conf,
      HttpServletResponse response) {
    this(rm, conf);
    this.response = response;
  }

  protected Boolean hasAccess(RMApp app, HttpServletRequest hsr) {
    // Check for the authorization.
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI != null
        && !(this.rm.getApplicationACLsManager().checkAccess(callerUGI,
              ApplicationAccessType.VIEW_APP, app.getUser(),
              app.getApplicationId()) ||
            this.rm.getQueueACLsManager().checkAccess(callerUGI,
              QueueACL.ADMINISTER_QUEUE, app.getQueue()))) {
      return false;
    }
    return true;
  }

  private void init() {
    //clear content type
    response.setContentType(null);
  }

  @GET
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public ClusterInfo get() {
    return getClusterInfo();
  }

  @GET
  @Path("/info")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public ClusterInfo getClusterInfo() {
    init();
    return new ClusterInfo(this.rm);
  }

  @GET
  @Path("/metrics")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public ClusterMetricsInfo getClusterMetricsInfo() {
    init();
    return new ClusterMetricsInfo(this.rm);
  }

  @GET
  @Path("/scheduler")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public SchedulerTypeInfo getSchedulerInfo() {
    init();
    ResourceScheduler rs = rm.getResourceScheduler();
    SchedulerInfo sinfo = createSchedulerInfo(rs);
    return new SchedulerTypeInfo(sinfo);
  }

  private SchedulerInfo createSchedulerInfo(ResourceScheduler rs) {
    if (rs == null) {
      throw new NotFoundException("Null ResourceScheduler instance");
    }
    
    if (rs instanceof CapacityScheduler) {
      CapacityScheduler cs = (CapacityScheduler) rs;
      CSQueue root = cs.getRootQueue();
      return new CapacitySchedulerInfo(root);
    } else if (rs instanceof FairScheduler) {
      FairScheduler fs = (FairScheduler) rs;
      return new FairSchedulerInfo(fs);
    } else if (rs instanceof FifoScheduler) {
      return new FifoSchedulerInfo(this.rm);
    } else {
      throw new NotFoundException("Unknown scheduler configured");
    }
  }

  /**
   * Returns all nodes in the cluster. If the states param is given, returns
   * all nodes that are in the comma-separated list of states.
   */
  @GET
  @Path("/nodes")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public NodesInfo getNodes(@QueryParam("states") String states) {
    init();
    ResourceScheduler sched = this.rm.getResourceScheduler();
    if (sched == null) {
      throw new NotFoundException("Null ResourceScheduler instance");
    }
    
    EnumSet<NodeState> acceptedStates = resolveNodeStates(states);
    
    Collection<RMNode> rmNodes = RMServerUtils.queryRMNodes(this.rm.getRMContext(),
        acceptedStates);
    NodesInfo nodesInfo = new NodesInfo();
    for (RMNode rmNode : rmNodes) {
      NodeInfo nodeInfo = createNodeInfo(rmNode, sched);
      nodesInfo.add(nodeInfo);
    }
    
    return nodesInfo;
  }

  private EnumSet<NodeState> resolveNodeStates(String states) {
    if (states == null) {
      return EnumSet.allOf(NodeState.class);
    }
    EnumSet<NodeState> acceptedStates = EnumSet.noneOf(NodeState.class);
    for (String stateStr : states.split(",")) {
      acceptedStates.add(
          NodeState.valueOf(StringUtils.toUpperCase(stateStr.trim())));
    }
    return acceptedStates;
  }

  private NodeInfo createNodeInfo(RMNode rmNode, ResourceScheduler sched) {
    NodeInfo nodeInfo = new NodeInfo(rmNode, sched);
    if (EnumSet.of(NodeState.LOST, NodeState.DECOMMISSIONED, NodeState.REBOOTED)
        .contains(rmNode.getState())) {
      nodeInfo.setNodeHTTPAddress(EMPTY);
    }
    return nodeInfo;
  }

  @GET
  @Path("/nodes/{nodeId}")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public NodeInfo getNode(@PathParam("nodeId") String nodeId) {
    init();
    if (nodeId == null || nodeId.isEmpty()) {
      throw new NotFoundException("nodeId, " + nodeId + ", is empty or null");
    }
    ResourceScheduler sched = this.rm.getResourceScheduler();
    if (sched == null) {
      throw new NotFoundException("Null ResourceScheduler instance");
    }
    NodeId nid = ConverterUtils.toNodeId(nodeId);
    RMNode ni = this.rm.getRMContext().getRMNodes().get(nid);
    boolean isInactive = false;
    if (ni == null) {
      ni = this.rm.getRMContext().getInactiveRMNodes().get(nid.getHost());
      if (ni == null) {
        throw new NotFoundException("nodeId, " + nodeId + ", is not found");
      }
      isInactive = true;
    }
    NodeInfo nodeInfo = new NodeInfo(ni, sched);
    if (isInactive) {
      nodeInfo.setNodeHTTPAddress(EMPTY);
    }
    return nodeInfo;
  }

  @GET
  @Path("/apps")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public AppsInfo getApps(@Context HttpServletRequest hsr,
      @QueryParam("state") String stateQuery,
      @QueryParam("states") Set<String> statesQuery,
      @QueryParam("finalStatus") String finalStatusQuery,
      @QueryParam("user") String userQuery,
      @QueryParam("queue") String queueQuery,
      @QueryParam("limit") String count,
      @QueryParam("startedTimeBegin") String startedBegin,
      @QueryParam("startedTimeEnd") String startedEnd,
      @QueryParam("finishedTimeBegin") String finishBegin,
      @QueryParam("finishedTimeEnd") String finishEnd,
      @QueryParam("applicationTypes") Set<String> applicationTypes,
      @QueryParam("applicationTags") Set<String> applicationTags) {
    init();
    validateAppQueries(count, startedBegin, startedEnd, finishBegin, finishEnd);

    Set<String> appTypes = parseQueries(applicationTypes, false);
    Set<String> appTags = parseQueries(applicationTags, false);
    
    // stateQuery is deprecated.
    if (stateQuery != null && !stateQuery.isEmpty()) {
      statesQuery.add(stateQuery);
    }
    Set<String> appStates = parseQueries(statesQuery, true);

    GetApplicationsRequest request = buildGetAppsRequest(
        appTypes, appTags, appStates, count, startedBegin, startedEnd,
        finishBegin, finishEnd);
    request = applyQueueFilter(request, queueQuery);
    request = applyUserFilter(request, userQuery);

    List<ApplicationReport> appReports = fetchApplicationReports(request);
    final ConcurrentMap<ApplicationId, RMApp> apps =
        rm.getRMContext().getRMApps();
    AppsInfo allApps = new AppsInfo();
    for (ApplicationReport report : appReports) {
      RMApp rmapp = apps.get(report.getApplicationId());
      if (rmapp == null) {
        continue;
      }

      if (!matchesFinalStatus(rmapp, finalStatusQuery)) {
        continue;
      }

      AppInfo app = new AppInfo(rm, rmapp,
          hasAccess(rmapp, hsr), WebAppUtils.getHttpSchemePrefix(conf));
      allApps.add(app);
    }
    return allApps;
  }

  private void validateAppQueries(String count, String startedBegin, String startedEnd,
      String finishBegin, String finishEnd) {
    parseLongParam("limit", count, value -> {
      if (value <= 0) {
        throw new BadRequestException("limit value must be greater then 0");
      }
    });
    TimeRangeConstraints rangeBegin = parseTimeRange("startedTimeBegin", startedBegin);
    TimeRangeConstraints rangeEnd = parseTimeRange("startedTimeEnd", startedEnd);
    validateTimeRangeOrder(rangeBegin, rangeEnd);

    TimeRangeConstraints finishBeginRange = parseTimeRange("finishedTimeBegin", finishBegin);
    TimeRangeConstraints finishEndRange = parseTimeRange("finishedTimeEnd", finishEnd);
    validateTimeRangeOrder(finishBeginRange, finishEndRange);
  }

  private void parseLongParam(String paramName, String value, LongConsumer validator) {
    if (value != null && !value.isEmpty()) {
      try {
        long parsed = Long.parseLong(value);
        validator.accept(parsed);
      } catch (NumberFormatException e) {
        throw new BadRequestException("Invalid " + paramName + " value: " + value);
      }
    }
  }

  private TimeRangeConstraints parseTimeRange(String paramName, String value) {
    if (value != null && !value.isEmpty()) {
      try {
        long longValue = Long.parseLong(value);
        if (longValue < 0) {
          throw new BadRequestException(paramName + " must be greater than 0");
        }
        return new TimeRangeConstraints(longValue, true);
      } catch (NumberFormatException e) {
        throw new BadRequestException("Invalid " + paramName + " value: " + value);
      }
    }
    return new TimeRangeConstraints(0, false);
  }

  private void validateTimeRangeOrder(TimeRangeConstraints begin, TimeRangeConstraints end) {
    if (begin.isPresent && end.isPresent && begin.value > end.value) {
      throw new BadRequestException(end.paramName + " must be greater than " + begin.paramName);
    }
  }

  private static class TimeRangeConstraints {
    final long value;
    final boolean isPresent;
    final String paramName;

    TimeRangeConstraints(long value, boolean isPresent) {
      this.value = value;
      this.isPresent = isPresent;
      this.paramName = null;
    }

    TimeRangeConstraints(String paramName) {
      this.paramName = paramName;
      this.isPresent = true;
      this.value = 0;
    }
  }

  private interface LongConsumer {
    void accept(long value);
  }

  private GetApplicationsRequest buildGetAppsRequest(
      Set<String> appTypes, Set<String> appTags, Set<String> appStates,
      String count, String startedBegin, String startedEnd,
      String finishBegin, String finishEnd) {
    GetApplicationsRequest request = GetApplicationsRequest.newInstance();

    if (startedBegin != null && !startedBegin.isEmpty()) {
      long sBegin = Long.parseLong(startedBegin);
      long sEnd = Long.parseLong(startedEnd);
      request.setStartRange(sBegin, sEnd);
    }

    if (finishBegin != null && !finishBegin.isEmpty()) {
      long fBegin = Long.parseLong(finishBegin);
      long fEnd = Long.parseLong(finishEnd);
      request.setFinishRange(fBegin, fEnd);
    }

    if (count != null && !count.isEmpty()) {
      request.setLimit(Long.parseLong(count));
    }

    if (!appTypes.isEmpty()) {
      request.setApplicationTypes(appTypes);
    }

    if (!appTags.isEmpty()) {
      request.setApplicationTags(appTags);
    }

    if (!appStates.isEmpty()) {
      request.setApplicationStates(appStates);
    }

    return request;
  }

  private GetApplicationsRequest applyQueueFilter(GetApplicationsRequest request, String queueQuery) {
    if (queueQuery != null && !queueQuery.isEmpty()) {
      ResourceScheduler rs = rm.getResourceScheduler();
      if (rs instanceof CapacityScheduler) {
        CapacityScheduler cs = (CapacityScheduler) rs;
        try {
          cs.getQueueInfo(queueQuery, false, false);
        } catch (IOException e) {
          throw new BadRequestException(e.getMessage());
        }
      }
      Set<String> queues = new HashSet<String>(1);
      queues.add(queueQuery);
      request.setQueues(queues);
    }
    return request;
  }

  private GetApplicationsRequest applyUserFilter(GetApplicationsRequest request, String userQuery) {
    if (userQuery != null && !userQuery.isEmpty()) {
      Set<String> users = new HashSet<String>(1);
      users.add(userQuery);
      request.setUsers(users);
    }
    return request;
  }

  private List<ApplicationReport> fetchApplicationReports(GetApplicationsRequest request) {
    List<ApplicationReport> appReports = null;
    try {
      appReports = rm.getClientRMService()
          .getApplications(request, false).getApplicationList();
    } catch (YarnException e) {
      LOG.error("Unable to retrieve apps from ClientRMService", e);
      throw new YarnRuntimeException(
          "Unable to retrieve apps from ClientRMService", e);
    }
    return appReports;
  }

  private boolean matchesFinalStatus(RMApp rmapp, String finalStatusQuery) {
    if (finalStatusQuery == null || finalStatusQuery.isEmpty()) {
      return true;
    }
    FinalApplicationStatus.valueOf(finalStatusQuery);
    return rmapp.getFinalApplicationStatus().toString()
        .equalsIgnoreCase(finalStatusQuery);
  }

  @GET
  @Path("/appstatistics")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public ApplicationStatisticsInfo getAppStatistics(
      @Context HttpServletRequest hsr,
      @QueryParam("states") Set<String> stateQueries,
      @QueryParam("applicationTypes") Set<String> typeQueries) {
    init();

    Set<String> states = parseQueries(stateQueries, true);
    Set<String> types = parseQueries(typeQueries, false);
    if (types.isEmpty()) {
      types.add(ANY);
    } else if (types.size() != 1) {
      throw new BadRequestException("# of applicationTypes = " + types.size()
          + ", we temporarily support at most one applicationType");
    }
    if (states.isEmpty()) {
      for (YarnApplicationState state : YarnApplicationState.values()) {
        states.add(StringUtils.toLowerCase(state.toString()));
      }
    }

    Map<YarnApplicationState, Map<String, Long>> scoreboard =
        buildScoreboard(states, types);

    ConcurrentMap<ApplicationId, RMApp> apps = rm.getRMContext().getRMApps();
    for (RMApp rmapp : apps.values()) {
      YarnApplicationState state = rmapp.createApplicationState();
      String type = StringUtils.toLowerCase(rmapp.getApplicationType().trim());
      if (states.contains(StringUtils.toLowerCase(state.toString()))) {
        if (types.contains(ANY)) {
          countApp(scoreboard, state, ANY);
        } else if (types.contains(type)) {
          countApp(scoreboard, state, type);
        }
      }
    }

    return buildStatisticsResponse(scoreboard);
  }

  private ApplicationStatisticsInfo buildStatisticsResponse(
      Map<YarnApplicationState, Map<String, Long>> scoreboard) {
    ApplicationStatisticsInfo appStatInfo = new ApplicationStatisticsInfo();
    for (Map.Entry<YarnApplicationState, Map<String, Long>> partScoreboard
        : scoreboard.entrySet()) {
      for (Map.Entry<String, Long> statEntry
          : partScoreboard.getValue().entrySet()) {
        StatisticsItemInfo statItem = new StatisticsItemInfo(
            partScoreboard.getKey(), statEntry.getKey(), statEntry.getValue());
        appStatInfo.add(statItem);
      }
    }
    return appStatInfo;
  }

  private static Set<String> parseQueries(
      Set<String> queries, boolean isState) {
    Set<String> params = new HashSet<String>();
    if (!queries.isEmpty()) {
      for (String query : queries) {
        if (query != null && !query.trim().isEmpty()) {
          String[] paramStrs = query.split(",");
          for (String paramStr : paramStrs) {
            if (paramStr != null && !paramStr.trim().isEmpty()) {
              if (isState) {
                try {
                  YarnApplicationState.valueOf(
                      StringUtils.toUpperCase(paramStr.trim()));
                } catch (RuntimeException e) {
                  YarnApplicationState[] stateArray =
                      YarnApplicationState.values();
                  String allAppStates = Arrays.toString(stateArray);
                  throw new BadRequestException(
                      "Invalid application-state " + paramStr.trim()
                      + " specified. It should be one of " + allAppStates);
                }
              }
              params.add(
                  StringUtils.toLowerCase(paramStr.trim()));
            }
          }
        }
      }
    }
    return params;
  }

  private static Map<YarnApplicationState, Map<String, Long>> buildScoreboard(
     Set<String> states, Set<String> types) {
    Map<YarnApplicationState, Map<String, Long>> scoreboard
        = new HashMap<YarnApplicationState, Map<String, Long>>();
    assert !states.isEmpty();
    for (String state : states) {
      Map<String, Long> partScoreboard = new HashMap<String, Long>();
      scoreboard.put(
          YarnApplicationState.valueOf(StringUtils.toUpperCase(state)),
          partScoreboard);
      for (String type : types) {
        partScoreboard.put(type, 0L);
      }
    }
    return scoreboard;
  }

  private static void countApp(
      Map<YarnApplicationState, Map<String, Long>> scoreboard,
      YarnApplicationState state, String type) {
    Map<String, Long> partScoreboard = scoreboard.get(state);
    Long count = partScoreboard.get(type);
    partScoreboard.put(type, count + 1L);
  }

  @GET
  @Path("/apps/{appid}")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public AppInfo getApp(@Context HttpServletRequest hsr,
      @PathParam("appid") String appId) {
    init();
    validateAppId(appId);
    RMApp app = getRMApp(appId);
    return new AppInfo(rm, app, hasAccess(app, hsr), hsr.getScheme() + "://");
  }

  private void validateAppId(String appId) {
    if (appId == null || appId.isEmpty()) {
      throw new NotFoundException("appId, " + appId + ", is empty or null");
    }
  }

  private RMApp getRMApp(String appId) {
    ApplicationId id =ConverterUtils.toApplicationId(recordFactory, appId);
    if (id == null) {
      throw new NotFoundException("appId is null");
    }
    RMApp app = rm.getRMContext().getRMApps().get(id);
    if (app == null) {
      throw new NotFoundException("app with id: " + appId + " not found");
    }
    return app;
  }

  @GET
  @Path("/apps/{appid}/appattempts")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public AppAttemptsInfo getAppAttempts(@PathParam("appid") String appId) {

    init();
    validateAppId(appId);
    RMApp app = getRMApp(appId);

    AppAttemptsInfo appAttemptsInfo = new AppAttemptsInfo();
    for (RMAppAttempt attempt : app.getAppAttempts().values()) {
      AppAttemptInfo attemptInfo = new AppAttemptInfo(attempt, app.getUser());
      appAttemptsInfo.add(attemptInfo);
    }

    return appAttemptsInfo;
  }

  @GET
  @Path("/apps/{appid}/state")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public AppState getAppState(@Context HttpServletRequest hsr,
      @PathParam("appid") String appId) throws AuthorizationException {
    init();
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    String userName = "";
    if (callerUGI != null) {
      userName = callerUGI.getUserName();
    }
    RMApp app = getRMAppOrThrow(appId, userName, AuditConstants.KILL_APP_REQUEST);

    AppState ret = new AppState();
    ret.setState(app.getState().toString());
    return ret;
  }

  private RMApp getRMAppOrThrow(String appId, String userName,
      String auditOperation) throws AuthorizationException {
    try {
      return getRMApp(appId);
    } catch (NotFoundException e) {
      RMAuditLogger.logFailure(userName, auditOperation,
        "UNKNOWN", "RMWebService",
        "Trying to get state of an absent application " + appId);
      throw e;
    }
  }

  @PUT
  @Path("/apps/{appid}/state")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  @Consumes({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response updateAppState(AppState targetState,
      @Context HttpServletRequest hsr, @PathParam("appid") String appId)
      throws AuthorizationException, YarnException, InterruptedException,
      IOException {

    init();
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI == null) {
      String msg = "Unable to obtain user name, user not authenticated";
      throw new AuthorizationException(msg);
    }

    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(callerUGI)) {
      String msg = "The default static user cannot carry out this operation.";
      return Response.status(Status.FORBIDDEN).entity(msg).build();
    }

    String userName = callerUGI.getUserName();
    RMApp app = getRMAppOrThrow(appId, userName, AuditConstants.KILL_APP_REQUEST);

    if (!app.getState().toString().equals(targetState.getState())) {
      if (targetState.getState().equals(YarnApplicationState.KILLED.toString())) {
        return killApp(app, callerUGI, hsr);
      }
      throw new BadRequestException("Only '"
          + YarnApplicationState.KILLED.toString()
          + "' is allowed as a target state.");
    }

    AppState ret = new AppState();
    ret.setState(app.getState().toString());

    return Response.status(Status.OK).entity(ret).build();
  }
  
  @GET
  @Path("/get-node-to-labels")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public NodeToLabelsInfo getNodeToLabels(@Context HttpServletRequest hsr) 
    throws IOException {
    init();
    return buildNodeToLabelsInfo();
  }

  private NodeToLabelsInfo buildNodeToLabelsInfo() {
    NodeToLabelsInfo ntl = new NodeToLabelsInfo();
    Map<String, NodeLabelsInfo> ntlMap = ntl.getNodeToLabels();
    Map<NodeId, Set<String>> nodeIdToLabels =   
      rm.getRMContext().getNodeLabelManager().getNodeLabels();
      
    for (Map.Entry<NodeId, Set<String>> nitle : nodeIdToLabels.entrySet()) {
      ntlMap.put(nitle.getKey().toString(), 
        new NodeLabelsInfo(nitle.getValue()));
    }

    return ntl;
  }
  
  @POST
  @Path("/replace-node-to-labels")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response replaceLabelsOnNodes(
    final NodeToLabelsInfo newNodeToLabels,
    @Context HttpServletRequest hsr) 
    throws IOException {
    init();
    
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI == null) {
      String msg = "Unable to obtain user name, user not authenticated for"
        + " post to .../replace-node-to-labels";
      throw new AuthorizationException(msg);
    }
    if (!rm.getRMContext().getNodeLabelManager().checkAccess(callerUGI)) {
      String msg = "User " + callerUGI.getShortUserName() + " not authorized"
        + " for post to .../replace-node-to-labels ";
      throw new AuthorizationException(msg);
    }
    
    Map<NodeId, Set<String>> nodeIdToLabels = 
      new HashMap<NodeId, Set<String>>();

    for (Map.Entry<String, NodeLabelsInfo> nitle : 
      newNodeToLabels.getNodeToLabels().entrySet()) {
     nodeIdToLabels.put(ConverterUtils.toNodeIdWithDefaultPort(nitle.getKey()),
       new HashSet<String>(nitle.getValue().getNodeLabels()));
    }
    
    rm.getRMContext().getNodeLabelManager().replaceLabelsOnNode(nodeIdToLabels);

    return Response.status(Status.OK).build();
  }
  
  @GET
  @Path("/get-node-labels")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public NodeLabelsInfo getClusterNodeLabels(@Context HttpServletRequest hsr) 
    throws IOException {
    init();

    NodeLabelsInfo ret = 
      new NodeLabelsInfo(rm.getRMContext().getNodeLabelManager()
        .getClusterNodeLabels());

    return ret;
  }
  
  @POST
  @Path("/add-node-labels")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response addToClusterNodeLabels(final NodeLabelsInfo newNodeLabels,
      @Context HttpServletRequest hsr)
      throws Exception {
    init();
    
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI == null) {
      String msg = "Unable to obtain user name, user not authenticated for"
        + " post to .../add-node-labels";
      throw new AuthorizationException(msg);
    }
    if (!rm.getRMContext().getNodeLabelManager().checkAccess(callerUGI)) {
      String msg = "User " + callerUGI.getShortUserName() + " not authorized"
        + " for post to .../add-node-labels ";
      throw new AuthorizationException(msg);
    }
    
    rm.getRMContext().getNodeLabelManager()
        .addToCluserNodeLabels(new HashSet<String>(
          newNodeLabels.getNodeLabels()));
            
    return Response.status(Status.OK).build();

  }
  
  @POST
  @Path("/remove-node-labels")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response removeFromCluserNodeLabels(final NodeLabelsInfo oldNodeLabels,
      @Context HttpServletRequest hsr)
      throws Exception {
    init();
    
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI == null) {
      String msg = "Unable to obtain user name, user not authenticated for"
        + " post to .../remove-node-labels";
      throw new AuthorizationException(msg);
    }
    if (!rm.getRMContext().getNodeLabelManager().checkAccess(callerUGI)) {
      String msg = "User " + callerUGI.getShortUserName() + " not authorized"
        + " for post to .../remove-node-labels ";
      throw new AuthorizationException(msg);
    }
    
    rm.getRMContext().getNodeLabelManager()
        .removeFromClusterNodeLabels(new HashSet<String>(
          oldNodeLabels.getNodeLabels()));
            
    return Response.status(Status.OK).build();

  }
  
  @GET
  @Path("/nodes/{nodeId}/get-labels")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public NodeLabelsInfo getLabelsOnNode(@Context HttpServletRequest hsr,
                                  @PathParam("nodeId") String nodeId) 
    throws IOException {
    init();

    NodeId nid = ConverterUtils.toNodeIdWithDefaultPort(nodeId);
    return new NodeLabelsInfo(
      rm.getRMContext().getNodeLabelManager().getLabelsOnNode(nid));

  }
  
  @POST
  @Path("/nodes/{nodeId}/replace-labels")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response replaceLabelsOnNode(NodeLabelsInfo newNodeLabelsInfo,
      @Context HttpServletRequest hsr, @PathParam("nodeId") String nodeId)
      throws Exception {
    init();
    
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI == null) {
      String msg = "Unable to obtain user name, user not authenticated for"
        + " post to .../nodes/nodeid/replace-labels";
      throw new AuthorizationException(msg);
    }

    if (!rm.getRMContext().getNodeLabelManager().checkAccess(callerUGI)) {
      String msg = "User " + callerUGI.getShortUserName() + " not authorized"
        + " for post to .../nodes/nodeid/replace-labels";
      throw new AuthorizationException(msg);
    }
    
    NodeId nid = ConverterUtils.toNodeIdWithDefaultPort(nodeId);
    
    Map<NodeId, Set<String>> newLabelsForNode = new HashMap<NodeId,
      Set<String>>();
    
    newLabelsForNode.put(nid, new HashSet<String>(newNodeLabelsInfo.getNodeLabels()));
    
    rm.getRMContext().getNodeLabelManager().replaceLabelsOnNode(newLabelsForNode);
    
    return Response.status(Status.OK).build();

  }

  protected Response killApp(RMApp app, UserGroupInformation callerUGI,
      HttpServletRequest hsr) throws IOException, InterruptedException {

    if (app == null) {
      throw new IllegalArgumentException("app cannot be null");
    }
    String userName = callerUGI.getUserName();
    final ApplicationId appid = app.getApplicationId();
    KillApplicationResponse resp = null;
    try {
      resp =
          callerUGI
            .doAs(new PrivilegedExceptionAction<KillApplicationResponse>() {
              @Override
              public KillApplicationResponse run() throws IOException,
                  YarnException {
                KillApplicationRequest req =
                    KillApplicationRequest.newInstance(appid);
                return rm.getClientRMService().forceKillApplication(req);
              }
            });
    } catch (UndeclaredThrowableException ue) {
      if (ue.getCause() instanceof YarnException) {
        YarnException ye = (YarnException) ue.getCause();
        if (ye.getCause() instanceof AccessControlException) {
          String appId = app.getApplicationId().toString();
          String msg =
              "Unauthorized attempt to kill appid " + appId
                  + " by remote user " + userName;
          return Response.status(Status.FORBIDDEN).entity(msg).build();
        } else {
          throw ue;
        }
      } else {
        throw ue;
      }
    }

    AppState ret = new AppState();
    ret.setState(app.getState().toString());

    if (resp.getIsKillCompleted()) {
      RMAuditLogger.logSuccess(userName, AuditConstants.KILL_APP_REQUEST,
        "RMWebService", app.getApplicationId());
      return Response.status(Status.OK).entity(ret).build();
    } else {
      return Response.status(Status.ACCEPTED).entity(ret)
        .header(HttpHeaders.LOCATION, hsr.getRequestURL()).build();
    }
  }

  @GET
  @Path("/apps/{appid}/queue")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public AppQueue getAppQueue(@Context HttpServletRequest hsr,
      @PathParam("appid") String appId) throws AuthorizationException {
    init();
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    String userName = "UNKNOWN-USER";
    if (callerUGI != null) {
      userName = callerUGI.getUserName();
    }
    RMApp app = getRMAppOrThrow(appId, userName, AuditConstants.KILL_APP_REQUEST);

    AppQueue ret = new AppQueue();
    ret.setQueue(app.getQueue());

    return ret;
  }

  @PUT
  @Path("/apps/{appid}/queue")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  @Consumes({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response updateAppQueue(AppQueue targetQueue,
      @Context HttpServletRequest hsr, @PathParam("appid") String appId)
      throws AuthorizationException, YarnException, InterruptedException,
      IOException {

    init();
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI == null) {
      String msg = "Unable to obtain user name, user not authenticated";
      throw new AuthorizationException(msg);
    }

    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(callerUGI)) {
      String msg = "The default static user cannot carry out this operation.";
      return Response.status(Status.FORBIDDEN).entity(msg).build();
    }

    String userName = callerUGI.getUserName();
    RMApp app = getRMAppOrThrow(appId, userName, AuditConstants.KILL_APP_REQUEST);

    if (!app.getQueue().equals(targetQueue.getQueue())) {
      return moveApp(app, callerUGI, targetQueue.getQueue());
    }

    AppQueue ret = new AppQueue();
    ret.setQueue(app.getQueue());

    return Response.status(Status.OK).entity(ret).build();
  }

  protected Response moveApp(RMApp app, UserGroupInformation callerUGI,
      String targetQueue) throws IOException, InterruptedException {

    if (app == null) {
      throw new IllegalArgumentException("app cannot be null");
    }
    String userName = callerUGI.getUserName();
    final ApplicationId appid = app.getApplicationId();
    final String reqTargetQueue = targetQueue;
    try {
      callerUGI
        .doAs(new PrivilegedExceptionAction<Void>() {
          @Override
          public Void run() throws IOException,
              YarnException {
            MoveApplicationAcrossQueuesRequest req =
                MoveApplicationAcrossQueuesRequest.newInstance(appid,
                  reqTargetQueue);
            rm.getClientRMService().moveApplicationAcrossQueues(req);
            return null;
          }
        });
    } catch (UndeclaredThrowableException ue) {
      if (ue.getCause() instanceof YarnException) {
        YarnException ye = (YarnException) ue.getCause();
        if (ye.getCause() instanceof AccessControlException) {
          String appId = app.getApplicationId().toString();
          String msg =
              "Unauthorized attempt to move appid " + appId
                  + " by remote user " + userName;
          return Response.status(Status.FORBIDDEN).entity(msg).build();
        } else if (ye.getMessage().startsWith("App in")
            && ye.getMessage().endsWith("state cannot be moved.")) {
          return Response.status(Status.BAD_REQUEST).entity(ye.getMessage())
            .build();
        } else {
          throw ue;
        }
      } else {
        throw ue;
      }
    }

    AppQueue ret = new AppQueue();
    ret.setQueue(app.getQueue());
    return Response.status(Status.OK).entity(ret).build();
  }

  private RMApp getRMAppForAppId(String appId) {

    if (appId == null || appId.isEmpty()) {
      throw new NotFoundException("appId, " + appId + ", is empty or null");
    }
    ApplicationId id;
    try {
      id = ConverterUtils.toApplicationId(recordFactory, appId);
    } catch (NumberFormatException e) {
      throw new NotFoundException("appId is invalid");
    }
    if (id == null) {
      throw new NotFoundException("appId is invalid");
    }
    RMApp app = rm.getRMContext().getRMApps().get(id);
    if (app == null) {
      throw new NotFoundException("app with id: " + appId + " not found");
    }
    return app;
  }

  private UserGroupInformation getCallerUserGroupInformation(
      HttpServletRequest hsr, boolean usePrincipal) {

    String remoteUser = hsr.getRemoteUser();
    if (usePrincipal) {
      Principal princ = hsr.getUserPrincipal();
      remoteUser = princ == null ? null : princ.getName();
    }

    UserGroupInformation callerUGI = null;
    if (remoteUser != null) {
      callerUGI = UserGroupInformation.createRemoteUser(remoteUser);
    }

    return callerUGI;
  }

  private boolean isStaticUser(UserGroupInformation callerUGI) {
    String staticUser =
        conf.get(CommonConfigurationKeys.HADOOP_HTTP_STATIC_USER,
          CommonConfigurationKeys.DEFAULT_HADOOP_HTTP_STATIC_USER);
    return staticUser.equals(callerUGI.getUserName());
  }

  /**
   * Generates a new ApplicationId which is then sent to the client
   * 
   * @param hsr
   *          the servlet request
   * @return Response containing the app id and the maximum resource
   *         capabilities
   * @throws AuthorizationException
   * @throws IOException
   * @throws InterruptedException
   */
  @POST
  @Path("/apps/new-application")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response createNewApplication(@Context HttpServletRequest hsr)
      throws AuthorizationException, IOException, InterruptedException {
    init();
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI == null) {
      throw new AuthorizationException("Unable to obtain user name, "
          + "user not authenticated");
    }
    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(callerUGI)) {
      String msg = "The default static user cannot carry out this operation.";
      return Response.status(Status.FORBIDDEN).entity(msg).build();
    }

    NewApplication appId = createNewApplication();
    return Response.status(Status.OK).entity(appId).build();

  }

  // reuse the code in ClientRMService to create new app
  // get the new app id and submit app
  // set location header with new app location
  /**
   * Function to submit an app to the RM
   * 
   * @param newApp
   *          structure containing information to construct the
   *          ApplicationSubmissionContext
   * @param hsr
   *          the servlet request
   * @return Response containing the status code
   * @throws AuthorizationException
   * @throws IOException
   * @throws InterruptedException
   */
  @POST
  @Path("/apps")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  @Consumes({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response submitApplication(ApplicationSubmissionContextInfo newApp,
      @Context HttpServletRequest hsr) throws AuthorizationException,
      IOException, InterruptedException {

    init();
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI == null) {
      throw new AuthorizationException("Unable to obtain user name, "
          + "user not authenticated");
    }

    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(callerUGI)) {
      String msg = "The default static user cannot carry out this operation.";
      return Response.status(Status.FORBIDDEN).entity(msg).build();
    }

    ApplicationSubmissionContext appContext =
        createAppSubmissionContext(newApp);
    final SubmitApplicationRequest req =
        SubmitApplicationRequest.newInstance(appContext);

    try {
      callerUGI
        .doAs(new PrivilegedExceptionAction<SubmitApplicationResponse>() {
          @Override
          public SubmitApplicationResponse run() throws IOException,
              YarnException {
            return rm.getClientRMService().submitApplication(req);
          }
        });
    } catch (UndeclaredThrowableException ue) {
      if (ue.getCause() instanceof YarnException) {
        throw new BadRequestException(ue.getCause().getMessage());
      }
      LOG.info("Submit app request failed", ue);
      throw ue;
    }

    String url = hsr.getRequestURL() + "/" + newApp.getApplicationId();
    return Response.status(Status.ACCEPTED).header(HttpHeaders.LOCATION, url)
      .build();
  }

  /**
   * Function that actually creates the ApplicationId by calling the
   * ClientRMService
   * 
   * @return returns structure containing the app-id and maximum resource
   *         capabilities
   */
  private NewApplication createNewApplication() {
    GetNewApplicationRequest req =
        recordFactory.newRecordInstance(GetNewApplicationRequest.class);
    GetNewApplicationResponse resp;
    try {
      resp = rm.getClientRMService().getNewApplication(req);
    } catch (YarnException e) {
      String msg = "Unable to create new app from RM web service";
      LOG.error(msg, e);
      throw new YarnRuntimeException(msg, e);
    }
    NewApplication appId =
        new NewApplication(resp.getApplicationId().toString(),
          new ResourceInfo(resp.getMaximumResourceCapability()));
    return appId;
  }

  /**
   * Create the actual ApplicationSubmissionContext to be submitted to the RM
   * from the information provided by the user.
   * 
   * @param newApp
   *          the information provided by the user
   * @return returns the constructed ApplicationSubmissionContext
   * @throws IOException
   */
  protected ApplicationSubmissionContext createAppSubmissionContext(
      ApplicationSubmissionContextInfo newApp) throws IOException {

    ApplicationId appid;
    try {
      appid =
          ConverterUtils.toApplicationId(recordFactory,
            newApp.getApplicationId());
    } catch (Exception e) {
      throw new BadRequestException("Could not parse application id " + newApp.getApplicationId());
    }
    ApplicationSubmissionContext appContext =
        ApplicationSubmissionContext.newInstance(appid,
          newApp.getApplicationName(), newApp.getQueue(),
          Priority.newInstance(newApp.getPriority()),
          createContainerLaunchContext(newApp), newApp.getUnmanagedAM(),
          newApp.getCancelTokensWhenComplete(), newApp.getMaxAppAttempts(),
          createAppSubmissionContextResource(newApp),
          newApp.getApplicationType(),
          newApp.getKeepContainersAcrossApplicationAttempts(),
          newApp.getAppNodeLabelExpression(),
          newApp.getAMContainerNodeLabelExpression());
    appContext.setApplicationTags(newApp.getApplicationTags());

    return appContext;
  }

  protected Resource createAppSubmissionContextResource(
      ApplicationSubmissionContextInfo newApp) throws BadRequestException {
    validateResourceAllocation(newApp.getResource());

    return Resource.newInstance(newApp.getResource().getMemory(), newApp
          .getResource().getvCores());
  }

  private void validateResourceAllocation(ResourceInfo resourceInfo) throws BadRequestException {
    if (resourceInfo.getvCores() > rm.getConfig().getInt(
      YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES,
      YarnConfiguration.DEFAULT_RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES)) {
      throw new BadRequestException("Requested more cores than configured max");
    }
    if (resourceInfo.getMemory() > rm.getConfig().getInt(
      YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_MB,
      YarnConfiguration.DEFAULT_RM_SCHEDULER_MAXIMUM_ALLOCATION_MB)) {
      throw new BadRequestException("Requested more memory than configured max");
    }
  }

  /**
   * Create the ContainerLaunchContext required for the
   * ApplicationSubmissionContext. This function takes the user information and
   * generates the ByteBuffer structures required by the ContainerLaunchContext
   * 
   * @param newApp
   *          the information provided by the user
   * @return created context
   * @throws BadRequestException
   * @throws IOException
   */
  protected ContainerLaunchContext createContainerLaunchContext(
      ApplicationSubmissionContextInfo newApp) throws BadRequestException,
      IOException {

    HashMap<String, ByteBuffer> auxDataMap = new HashMap<String, ByteBuffer>();
    for (Map.Entry<String, String> entry : newApp
      .getContainerLaunchContextInfo().getAuxillaryServiceData().entrySet()) {
      if (!entry.getValue().isEmpty()) {
        Base64 decoder = new Base64(0, null, true);
        byte[] data = decoder.decode(entry.getValue());
        auxDataMap.put(entry.getKey(), ByteBuffer.wrap(data));
      }
    }

    HashMap<String, LocalResource> hlr = new HashMap<String, LocalResource>();
    for (Map.Entry<String, LocalResourceInfo> entry : newApp
      .getContainerLaunchContextInfo().getResources().entrySet()) {
      LocalResourceInfo l = entry.getValue();
      LocalResource lr =
          LocalResource.newInstance(
            ConverterUtils.getYarnUrlFromURI(l.getUrl()), l.getType(),
            l.getVisibility(), l.getSize(), l.getTimestamp());
      hlr.put(entry.getKey(), lr);
    }

    DataOutputBuffer out = new DataOutputBuffer();
    Credentials cs =
        createCredentials(newApp.getContainerLaunchContextInfo()
          .getCredentials());
    cs.writeTokenStorageToStream(out);
    ByteBuffer tokens = ByteBuffer.wrap(out.getData());

    ContainerLaunchContext ctx =
        ContainerLaunchContext.newInstance(hlr, newApp
          .getContainerLaunchContextInfo().getEnvironment(), newApp
          .getContainerLaunchContextInfo().getCommands(), auxDataMap, tokens, newApp
          .getContainerLaunchContextInfo().getAcls());

    return ctx;
  }

  /**
   * Generate a Credentials object from the information in the CredentialsInfo
   * object.
   * 
   * @param credentials
   *          the CredentialsInfo provided by the user.
   * @return
   */
  private Credentials createCredentials(CredentialsInfo credentials) {
    Credentials ret = new Credentials();
    try {
      for (Map.Entry<String, String> entry : credentials.getTokens().entrySet()) {
        Text alias = new Text(entry.getKey());
        Token<TokenIdentifier> token = new Token<TokenIdentifier>();
        token.decodeFromUrlString(entry.getValue());
        ret.addToken(alias, token);
      }
      for (Map.Entry<String, String> entry : credentials.getSecrets().entrySet()) {
        Text alias = new Text(entry.getKey());
        Base64 decoder = new Base64(0, null, true);
        byte[] secret = decoder.decode(entry.getValue());
        ret.addSecretKey(alias, secret);
      }
    } catch (IOException ie) {
      throw new BadRequestException(
        "Could not parse credentials data; exception message = "
            + ie.getMessage());
    }
    return ret;
  }

  private UserGroupInformation createKerberosUserGroupInformation(
      HttpServletRequest hsr) throws AuthorizationException, YarnException {

    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI == null) {
      String msg = "Unable to obtain user name, user not authenticated";
      throw new AuthorizationException(msg);
    }

    String authType = hsr.getAuthType();
    if (!KerberosAuthenticationHandler.TYPE.equalsIgnoreCase(authType)) {
      String msg =
          "Delegation token operations can only be carried out on a "
              + "Kerberos authenticated channel. Expected auth type is "
              + KerberosAuthenticationHandler.TYPE + ", got type " + authType;
      throw new YarnException(msg);
    }
    if (hsr
      .getAttribute(DelegationTokenAuthenticationHandler.DELEGATION_TOKEN_UGI_ATTRIBUTE) != null) {
      String msg =
          "Delegation token operations cannot be carried out using delegation"
              + " token authentication.";
      throw new YarnException(msg);
    }

    callerUGI.setAuthenticationMethod(AuthenticationMethod.KERBEROS);
    return callerUGI;
  }

  @POST
  @Path("/delegation-token")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  @Consumes({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response postDelegationToken(DelegationToken tokenData,
      @Context HttpServletRequest hsr) throws AuthorizationException,
      IOException, InterruptedException, Exception {

    init();
    UserGroupInformation callerUGI;
    try {
      callerUGI = createKerberosUserGroupInformation(hsr);
    } catch (YarnException ye) {
      return Response.status(Status.FORBIDDEN).entity(ye.getMessage()).build();
    }
    return createDelegationToken(tokenData, hsr, callerUGI);
  }

  @POST
  @Path("/delegation-token/expiration")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  @Consumes({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response
      postDelegationTokenExpiration(@Context HttpServletRequest hsr)
          throws AuthorizationException, IOException, InterruptedException,
          Exception {

    init();
    UserGroupInformation callerUGI;
    try {
      callerUGI = createKerberosUserGroupInformation(hsr);
    } catch (YarnException ye) {
      return Response.status(Status.FORBIDDEN).entity(ye.getMessage()).build();
    }

    DelegationToken requestToken = new DelegationToken();
    requestToken.setToken(extractToken(hsr).encodeToUrlString());
    return renewDelegationToken(requestToken, hsr, callerUGI);
  }

  private Response createDelegationToken(DelegationToken tokenData,
      HttpServletRequest hsr, UserGroupInformation callerUGI)
      throws AuthorizationException, IOException, InterruptedException,
      Exception {

    final String renewer = tokenData.getRenewer();
    GetDelegationTokenResponse resp;
    try {
      resp =
          callerUGI
            .doAs(new PrivilegedExceptionAction<GetDelegationTokenResponse>() {
              @Override
              public GetDelegationTokenResponse run() throws IOException,
                  YarnException {
                GetDelegationTokenRequest createReq =
                    GetDelegationTokenRequest.newInstance(renewer);
                return rm.getClientRMService().getDelegationToken(createReq);
              }
            });
    } catch (Exception e) {
      LOG.info("Create delegation token request failed", e);
      throw e;
    }

    Token<RMDelegationTokenIdentifier> tk =
        new Token<RMDelegationTokenIdentifier>(resp.getRMDelegationToken()
          .getIdentifier().array(), resp.getRMDelegationToken().getPassword()
          .array(), new Text(resp.getRMDelegationToken().getKind()), new Text(
          resp.getRMDelegationToken().getService()));
    RMDelegationTokenIdentifier identifier = tk.decodeIdentifier();
    long currentExpiration =
        rm.getRMContext().getRMDelegationTokenSecretManager()
          .getRenewDate(identifier);
    DelegationToken respToken =
        new DelegationToken(tk.encodeToUrlString(), renewer, identifier
          .getOwner().toString(), tk.getKind().toString(), currentExpiration,
          identifier.getMaxDate());
    return Response.status(Status.OK).entity(respToken).build();
  }

  private Response renewDelegationToken(DelegationToken tokenData,
      HttpServletRequest hsr, UserGroupInformation callerUGI)
      throws AuthorizationException, IOException, InterruptedException,
      Exception {

    Token<RMDelegationTokenIdentifier> token =
        extractToken(tokenData.getToken());

    org.apache.hadoop.yarn.api.records.Token dToken =
        BuilderUtils.newDelegationToken(token.getIdentifier(), token.getKind()
          .toString(), token.getPassword(), token.getService().toString());
    final RenewDelegationTokenRequest req =
        RenewDelegationTokenRequest.newInstance(dToken);

    RenewDelegationTokenResponse resp;
    try {
      resp =
          callerUGI
            .doAs(new PrivilegedExceptionAction<RenewDelegationTokenResponse>() {
              @Override
              public RenewDelegationTokenResponse run() throws IOException,
                  YarnException {
                return rm.getClientRMService().renewDelegationToken(req);
              }
            });
    } catch (UndeclaredThrowableException ue) {
      if (ue.getCause() instanceof YarnException) {
        if (ue.getCause().getCause() instanceof InvalidToken) {
          throw new BadRequestException(ue.getCause().getCause().getMessage());
        } else if (ue.getCause().getCause() instanceof org.apache.hadoop.security.AccessControlException) {
          return Response.status(Status.FORBIDDEN)
            .entity(ue.getCause().getCause().getMessage()).build();
        }
        LOG.info("Renew delegation token request failed", ue);
        throw ue;
      }
      LOG.info("Renew delegation token request failed", ue);
      throw ue;
    } catch (Exception e) {
      LOG.info("Renew delegation token request failed", e);
      throw e;
    }
    long renewTime = resp.getNextExpirationTime();

    DelegationToken respToken = new DelegationToken();
    respToken.setNextExpirationTime(renewTime);
    return Response.status(Status.OK).entity(respToken).build();
  }

  @DELETE
  @Path("/delegation-token")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response cancelDelegationToken(@Context HttpServletRequest hsr)
      throws AuthorizationException, IOException, InterruptedException,
      Exception {

    init();
    UserGroupInformation callerUGI;
    try {
      callerUGI = createKerberosUserGroupInformation(hsr);
    } catch (YarnException ye) {
      return Response.status(Status.FORBIDDEN).entity(ye.getMessage()).build();
    }

    Token<RMDelegationTokenIdentifier> token = extractToken(hsr);

    org.apache.hadoop.yarn.api.records.Token dToken =
        BuilderUtils.newDelegationToken(token.getIdentifier(), token.getKind()
          .toString(), token.getPassword(), token.getService().toString());
    final CancelDelegationTokenRequest req =
        CancelDelegationTokenRequest.newInstance(dToken);

    try {
      callerUGI
        .doAs(new PrivilegedExceptionAction<CancelDelegationTokenResponse>() {
          @Override
          public CancelDelegationTokenResponse run() throws IOException,
              YarnException {
            return rm.getClientRMService().cancelDelegationToken(req);
          }
        });
    } catch (UndeclaredThrowableException ue) {
      if (ue.getCause() instanceof YarnException) {
        if (ue.getCause().getCause() instanceof InvalidToken) {
          throw new BadRequestException(ue.getCause().getCause().getMessage());
        } else if (ue.getCause().getCause() instanceof org.apache.hadoop.security.AccessControlException) {
          return Response.status(Status.FORBIDDEN)
            .entity(ue.getCause().getCause().getMessage()).build();
        }
        LOG.info("Cancel delegation token request failed", ue);
        throw ue;
      }
      LOG.info("Cancel delegation token request failed", ue);
      throw ue;
    } catch (Exception e) {
      LOG.info("Cancel delegation token request failed", e);
      throw e;
    }

    return Response.status(Status.OK).build();
  }

  private Token<RMDelegationTokenIdentifier> extractToken(
      HttpServletRequest request) {
    String encodedToken = request.getHeader(DELEGATION_TOKEN_HEADER);
    if (encodedToken == null) {
      String msg =
          "Header '" + DELEGATION_TOKEN_HEADER
              + "' containing encoded token not found";
      throw new BadRequestException(msg);
    }
    return extractToken(encodedToken);
  }

  private Token<RMDelegationTokenIdentifier> extractToken(String encodedToken) {
    Token<RMDelegationTokenIdentifier> token =
        new Token<RMDelegationTokenIdentifier>();
    try {
      token.decodeFromUrlString(encodedToken);
    } catch (Exception ie) {
      String msg = "Could not decode encoded token";
      throw new BadRequestException(msg);
    }
    return token;
  }
}