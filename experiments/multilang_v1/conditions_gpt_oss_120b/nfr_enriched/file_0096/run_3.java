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
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied.  See the License for the specific
 * language governing permissions and limitations under the License.
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
    SchedulerInfo sinfo;
    if (rs instanceof CapacityScheduler) {
      CapacityScheduler cs = (CapacityScheduler) rs;
      CSQueue root = cs.getRootQueue();
      sinfo = new CapacitySchedulerInfo(root);
    } else if (rs instanceof FairScheduler) {
      FairScheduler fs = (FairScheduler) rs;
      sinfo = new FairSchedulerInfo(fs);
    } else if (rs instanceof FifoScheduler) {
      sinfo = new FifoSchedulerInfo(this.rm);
    } else {
      throw new NotFoundException("Unknown scheduler configured");
    }
    return new SchedulerTypeInfo(sinfo);
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
    EnumSet<NodeState> acceptedStates = parseNodeStates(states);
    Collection<RMNode> rmNodes = RMServerUtils.queryRMNodes(this.rm.getRMContext(),
        acceptedStates);
    NodesInfo nodesInfo = new NodesInfo();
    for (RMNode rmNode : rmNodes) {
      NodeInfo nodeInfo = new NodeInfo(rmNode, sched);
      if (EnumSet.of(NodeState.LOST, NodeState.DECOMMISSIONED, NodeState.REBOOTED)
          .contains(rmNode.getState())) {
        nodeInfo.setNodeHTTPAddress(EMPTY);
      }
      nodesInfo.add(nodeInfo);
    }
    return nodesInfo;
  }

  private EnumSet<NodeState> parseNodeStates(String states) {
    if (states == null) {
      return EnumSet.allOf(NodeState.class);
    }
    EnumSet<NodeState> set = EnumSet.noneOf(NodeState.class);
    for (String s : states.split(",")) {
      set.add(NodeState.valueOf(StringUtils.toUpperCase(s)));
    }
    return set;
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
    GetApplicationsRequest request = buildApplicationsRequest(stateQuery, statesQuery,
        finalStatusQuery, userQuery, queueQuery, count,
        startedBegin, startedEnd, finishBegin, finishEnd,
        applicationTypes, applicationTags);
    List<ApplicationReport> appReports = fetchApplicationReports(request);
    return buildAppsInfo(appReports, hsr);
  }

  private GetApplicationsRequest buildApplicationsRequest(
      String stateQuery,
      Set<String> statesQuery,
      String finalStatusQuery,
      String userQuery,
      String queueQuery,
      String count,
      String startedBegin,
      String startedEnd,
      String finishBegin,
      String finishEnd,
      Set<String> applicationTypes,
      Set<String> applicationTags) {
    GetApplicationsRequest request = GetApplicationsRequest.newInstance();

    if (count != null && !count.isEmpty()) {
      long limit = parsePositiveLong(count, "limit");
      request.setLimit(limit);
    }

    parseTimeRange(startedBegin, startedEnd, request::setStartRange);
    parseTimeRange(finishBegin, finishEnd, request::setFinishRange);

    Set<String> appTypes = parseQueries(applicationTypes, false);
    if (!appTypes.isEmpty()) {
      request.setApplicationTypes(appTypes);
    }

    Set<String> appTags = parseQueries(applicationTags, false);
    if (!appTags.isEmpty()) {
      request.setApplicationTags(appTags);
    }

    if (stateQuery != null && !stateQuery.isEmpty()) {
      statesQuery.add(stateQuery);
    }
    Set<String> appStates = parseQueries(statesQuery, true);
    if (!appStates.isEmpty()) {
      request.setApplicationStates(appStates);
    }

    if (queueQuery != null && !queueQuery.isEmpty()) {
      validateQueueExists(queueQuery);
      request.setQueues(new HashSet<String>(Arrays.asList(queueQuery)));
    }

    if (userQuery != null && !userQuery.isEmpty()) {
      request.setUsers(new HashSet<String>(Arrays.asList(userQuery)));
    }

    return request;
  }

  private void parseTimeRange(String begin, String end,
      java.util.function.BiConsumer<Long, Long> setter) {
    if ((begin == null || begin.isEmpty()) && (end == null || end.isEmpty())) {
      return;
    }
    long b = (begin == null || begin.isEmpty()) ? 0L : parseNonNegativeLong(begin,
        "time begin");
    long e = (end == null || end.isEmpty()) ? Long.MAX_VALUE : parseNonNegativeLong(end,
        "time end");
    if (b > e) {
      throw new BadRequestException(
          "time end must be greater than time begin");
    }
    setter.accept(b, e);
  }

  private long parsePositiveLong(String value, String name) {
    long v = Long.parseLong(value);
    if (v <= 0) {
      throw new BadRequestException(name + " value must be greater then 0");
    }
    return v;
  }

  private long parseNonNegativeLong(String value, String name) {
    long v = Long.parseLong(value);
    if (v < 0) {
      throw new BadRequestException(name + " must be greater than 0");
    }
    return v;
  }

  private void validateQueueExists(String queue) {
    ResourceScheduler rs = rm.getResourceScheduler();
    if (rs instanceof CapacityScheduler) {
      CapacityScheduler cs = (CapacityScheduler) rs;
      try {
        cs.getQueueInfo(queue, false, false);
      } catch (IOException e) {
        throw new BadRequestException(e.getMessage());
      }
    }
  }

  private List<ApplicationReport> fetchApplicationReports(
      GetApplicationsRequest request) {
    try {
      return rm.getClientRMService()
          .getApplications(request, false).getApplicationList();
    } catch (YarnException e) {
      LOG.error("Unable to retrieve apps from ClientRMService", e);
      throw new YarnRuntimeException(
          "Unable to retrieve apps from ClientRMService", e);
    }
  }

  private AppsInfo buildAppsInfo(List<ApplicationReport> reports,
      HttpServletRequest hsr) {
    final ConcurrentMap<ApplicationId, RMApp> apps =
        rm.getRMContext().getRMApps();
    AppsInfo allApps = new AppsInfo();
    for (ApplicationReport report : reports) {
      RMApp rmapp = apps.get(report.getApplicationId());
      if (rmapp == null) {
        continue;
      }
      if (shouldFilterByFinalStatus(rmapp, hsr)) {
        continue;
      }
      AppInfo app = new AppInfo(rm, rmapp,
          hasAccess(rmapp, hsr), WebAppUtils.getHttpSchemePrefix(conf));
      allApps.add(app);
    }
    return allApps;
  }

  private boolean shouldFilterByFinalStatus(RMApp rmapp,
      HttpServletRequest hsr) {
    String finalStatusQuery = hsr.getParameter("finalStatus");
    if (finalStatusQuery != null && !finalStatusQuery.isEmpty()) {
      FinalApplicationStatus.valueOf(finalStatusQuery);
      return !rmapp.getFinalApplicationStatus().toString()
          .equalsIgnoreCase(finalStatusQuery);
    }
    return false;
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
    normalizeStatisticsParams(states, types);
    Map<YarnApplicationState, Map<String, Long>> scoreboard =
        buildScoreboard(states, types);
    countApplications(scoreboard);
    return buildStatisticsInfo(scoreboard);
  }

  private void normalizeStatisticsParams(Set<String> states,
      Set<String> types) {
    if (types.isEmpty()) {
      types.add(ANY);
    } else if (types.size() != 1) {
      throw new BadRequestException("# of applicationTypes = " + types.size()
          + ", we temporarily support at most one applicationType");
    }
    if (states.isEmpty()) {
      for (YarnApplicationState s : YarnApplicationState.values()) {
        states.add(StringUtils.toLowerCase(s.toString()));
      }
    }
  }

  private void countApplications(
      Map<YarnApplicationState, Map<String, Long>> scoreboard) {
    ConcurrentMap<ApplicationId, RMApp> apps = rm.getRMContext().getRMApps();
    for (RMApp rmapp : apps.values()) {
      YarnApplicationState state = rmapp.createApplicationState();
      String type = StringUtils.toLowerCase(rmapp.getApplicationType().trim());
      if (scoreboard.containsKey(state)) {
        if (scoreboard.get(state).containsKey(ANY)) {
          incrementScore(scoreboard, state, ANY);
        } else if (scoreboard.get(state).containsKey(type)) {
          incrementScore(scoreboard, state, type);
        }
      }
    }
  }

  private void incrementScore(
      Map<YarnApplicationState, Map<String, Long>> scoreboard,
      YarnApplicationState state, String type) {
    Map<String, Long> inner = scoreboard.get(state);
    inner.put(type, inner.get(type) + 1L);
  }

  private ApplicationStatisticsInfo buildStatisticsInfo(
      Map<YarnApplicationState, Map<String, Long>> scoreboard) {
    ApplicationStatisticsInfo appStatInfo = new ApplicationStatisticsInfo();
    for (Map.Entry<YarnApplicationState, Map<String, Long>> entry :
        scoreboard.entrySet()) {
      YarnApplicationState state = entry.getKey();
      for (Map.Entry<String, Long> inner : entry.getValue().entrySet()) {
        StatisticsItemInfo statItem = new StatisticsItemInfo(
            state, inner.getKey(), inner.getValue());
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
                  String allAppStates = Arrays.toString(YarnApplicationState.values());
                  throw new BadRequestException(
                      "Invalid application-state " + paramStr.trim()
                      + " specified. It should be one of " + allAppStates);
                }
              }
              params.add(StringUtils.toLowerCase(paramStr.trim()));
            }
          }
        }
      }
    }
    return params;
  }

  private static Map<YarnApplicationState, Map<String, Long>> buildScoreboard(
     Set<String> states, Set<String> types) {
    Map<YarnApplicationState, Map<String, Long>> scoreboard = new HashMap<>();
    for (String state : states) {
      Map<String, Long> inner = new HashMap<>();
      scoreboard.put(YarnApplicationState.valueOf(StringUtils.toUpperCase(state)), inner);
      for (String type : types) {
        inner.put(type, 0L);
      }
    }
    return scoreboard;
  }

  @GET
  @Path("/apps/{appid}")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public AppInfo getApp(@Context HttpServletRequest hsr,
      @PathParam("appid") String appId) {
    init();
    ApplicationId id = parseApplicationId(appId);
    RMApp app = getRMApp(id);
    return new AppInfo(rm, app, hasAccess(app, hsr), hsr.getScheme() + "://");
  }

  @GET
  @Path("/apps/{appid}/appattempts")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public AppAttemptsInfo getAppAttempts(@PathParam("appid") String appId) {
    init();
    ApplicationId id = parseApplicationId(appId);
    RMApp app = getRMApp(id);
    AppAttemptsInfo appAttemptsInfo = new AppAttemptsInfo();
    for (RMAppAttempt attempt : app.getAppAttempts().values()) {
      appAttemptsInfo.add(new AppAttemptInfo(attempt, app.getUser()));
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
    String userName = (callerUGI != null) ? callerUGI.getUserName() : "";
    RMApp app = getRMAppForAppId(appId);
    AppState ret = new AppState();
    ret.setState(app.getState().toString());
    return ret;
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
      throw new AuthorizationException("Unable to obtain user name, user not authenticated");
    }
    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(callerUGI)) {
      return Response.status(Status.FORBIDDEN)
          .entity("The default static user cannot carry out this operation.").build();
    }
    RMApp app = getRMAppForAppId(appId);
    if (!app.getState().toString().equals(targetState.getState())) {
      if (targetState.getState().equals(YarnApplicationState.KILLED.toString())) {
        return killApp(app, callerUGI, hsr);
      }
      throw new BadRequestException("Only '" + YarnApplicationState.KILLED.toString()
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
    NodeToLabelsInfo ntl = new NodeToLabelsInfo();
    Map<NodeId, Set<String>> nodeIdToLabels =
        rm.getRMContext().getNodeLabelManager().getNodeLabels();
    for (Map.Entry<NodeId, Set<String>> e : nodeIdToLabels.entrySet()) {
      ntl.getNodeToLabels().put(e.getKey().toString(),
          new NodeLabelsInfo(e.getValue()));
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
    authorizeNodeLabelOperation(callerUGI, "post to .../replace-node-to-labels");
    Map<NodeId, Set<String>> nodeIdToLabels = new HashMap<>();
    for (Map.Entry<String, NodeLabelsInfo> e :
        newNodeToLabels.getNodeToLabels().entrySet()) {
      nodeIdToLabels.put(ConverterUtils.toNodeIdWithDefaultPort(e.getKey()),
          new HashSet<>(e.getValue().getNodeLabels()));
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
    return new NodeLabelsInfo(rm.getRMContext().getNodeLabelManager()
        .getClusterNodeLabels());
  }

  @POST
  @Path("/add-node-labels")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response addToClusterNodeLabels(final NodeLabelsInfo newNodeLabels,
      @Context HttpServletRequest hsr)
      throws Exception {
    init();
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    authorizeNodeLabelOperation(callerUGI, "post to .../add-node-labels");
    rm.getRMContext().getNodeLabelManager()
        .addToCluserNodeLabels(new HashSet<>(newNodeLabels.getNodeLabels()));
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
    authorizeNodeLabelOperation(callerUGI, "post to .../remove-node-labels");
    rm.getRMContext().getNodeLabelManager()
        .removeFromClusterNodeLabels(new HashSet<>(oldNodeLabels.getNodeLabels()));
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
    authorizeNodeLabelOperation(callerUGI, "post to .../nodes/nodeid/replace-labels");
    NodeId nid = ConverterUtils.toNodeIdWithDefaultPort(nodeId);
    Map<NodeId, Set<String>> map = new HashMap<>();
    map.put(nid, new HashSet<>(newNodeLabelsInfo.getNodeLabels()));
    rm.getRMContext().getNodeLabelManager().replaceLabelsOnNode(map);
    return Response.status(Status.OK).build();
  }

  private void authorizeNodeLabelOperation(UserGroupInformation ugi, String action) {
    if (ugi == null) {
      throw new AuthorizationException("Unable to obtain user name, user not authenticated for " + action);
    }
    if (!rm.getRMContext().getNodeLabelManager().checkAccess(ugi)) {
      throw new AuthorizationException("User " + ugi.getShortUserName()
          + " not authorized for " + action);
    }
  }

  protected Response killApp(RMApp app, UserGroupInformation callerUGI,
      HttpServletRequest hsr) throws IOException, InterruptedException {
    if (app == null) {
      throw new IllegalArgumentException("app cannot be null");
    }
    String userName = callerUGI.getUserName();
    final ApplicationId appid = app.getApplicationId();
    KillApplicationResponse resp;
    try {
      resp = callerUGI.doAs(new PrivilegedExceptionAction<KillApplicationResponse>() {
        @Override
        public KillApplicationResponse run() throws IOException, YarnException {
          KillApplicationRequest req = KillApplicationRequest.newInstance(appid);
          return rm.getClientRMService().forceKillApplication(req);
        }
      });
    } catch (UndeclaredThrowableException ue) {
      if (ue.getCause() instanceof YarnException) {
        YarnException ye = (YarnException) ue.getCause();
        if (ye.getCause() instanceof AccessControlException) {
          String msg = "Unauthorized attempt to kill appid " + appid
              + " by remote user " + userName;
          return Response.status(Status.FORBIDDEN).entity(msg).build();
        }
        throw ue;
      }
      throw ue;
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
    String userName = (callerUGI != null) ? callerUGI.getUserName() : "UNKNOWN-USER";
    RMApp app = getRMAppForAppId(appId);
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
      throw new AuthorizationException("Unable to obtain user name, user not authenticated");
    }
    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(callerUGI)) {
      return Response.status(Status.FORBIDDEN)
          .entity("The default static user cannot carry out this operation.").build();
    }
    RMApp app = getRMAppForAppId(appId);
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
    try {
      callerUGI.doAs(new PrivilegedExceptionAction<Void>() {
        @Override
        public Void run() throws IOException, YarnException {
          MoveApplicationAcrossQueuesRequest req =
              MoveApplicationAcrossQueuesRequest.newInstance(appid, targetQueue);
          rm.getClientRMService().moveApplicationAcrossQueues(req);
          return null;
        }
      });
    } catch (UndeclaredThrowableException ue) {
      if (ue.getCause() instanceof YarnException) {
        YarnException ye = (YarnException) ue.getCause();
        if (ye.getCause() instanceof AccessControlException) {
          String msg = "Unauthorized attempt to move appid " + appid
              + " by remote user " + userName;
          return Response.status(Status.FORBIDDEN).entity(msg).build();
        } else if (ye.getMessage().startsWith("App in")
            && ye.getMessage().endsWith("state cannot be moved.")) {
          return Response.status(Status.BAD_REQUEST).entity(ye.getMessage()).build();
        }
        throw ue;
      }
      throw ue;
    }
    AppQueue ret = new AppQueue();
    ret.setQueue(app.getQueue());
    return Response.status(Status.OK).entity(ret).build();
  }

  private RMApp getRMAppForAppId(String appId) {
    ApplicationId id = parseApplicationId(appId);
    RMApp app = rm.getRMContext().getRMApps().get(id);
    if (app == null) {
      throw new NotFoundException("app with id: " + appId + " not found");
    }
    return app;
  }

  private ApplicationId parseApplicationId(String appId) {
    if (appId == null || appId.isEmpty()) {
      throw new NotFoundException("appId, " + appId + ", is empty or null");
    }
    try {
      ApplicationId id = ConverterUtils.toApplicationId(recordFactory, appId);
      if (id == null) {
        throw new NotFoundException("appId is invalid");
      }
      return id;
    } catch (NumberFormatException e) {
      throw new NotFoundException("appId is invalid");
    }
  }

  private RMApp getRMApp(ApplicationId id) {
    RMApp app = rm.getRMContext().getRMApps().get(id);
    if (app == null) {
      throw new NotFoundException("app with id: " + id + " not found");
    }
    return app;
  }

  private UserGroupInformation getCallerUserGroupInformation(
      HttpServletRequest hsr, boolean usePrincipal) {
    String remoteUser = hsr.getRemoteUser();
    if (usePrincipal) {
      Principal princ = hsr.getUserPrincipal();
      remoteUser = (princ == null) ? null : princ.getName();
    }
    if (remoteUser != null) {
      return UserGroupInformation.createRemoteUser(remoteUser);
    }
    return null;
  }

  private boolean isStaticUser(UserGroupInformation callerUGI) {
    String staticUser = conf.get(CommonConfigurationKeys.HADOOP_HTTP_STATIC_USER,
        CommonConfigurationKeys.DEFAULT_HADOOP_HTTP_STATIC_USER);
    return staticUser.equals(callerUGI.getUserName());
  }

  @POST
  @Path("/apps/new-application")
  @Produces({ MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML })
  public Response createNewApplication(@Context HttpServletRequest hsr)
      throws AuthorizationException, IOException, InterruptedException {
    init();
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI == null) {
      throw new AuthorizationException("Unable to obtain user name, user not authenticated");
    }
    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(callerUGI)) {
      return Response.status(Status.FORBIDDEN)
          .entity("The default static user cannot carry out this operation.").build();
    }
    NewApplication appId = createNewApplication();
    return Response.status(Status.OK).entity(appId).build();
  }

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
      throw new AuthorizationException("Unable to obtain user name, user not authenticated");
    }
    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(callerUGI)) {
      return Response.status(Status.FORBIDDEN)
          .entity("The default static user cannot carry out this operation.").build();
    }
    ApplicationSubmissionContext appContext = createAppSubmissionContext(newApp);
    final SubmitApplicationRequest req = SubmitApplicationRequest.newInstance(appContext);
    try {
      callerUGI.doAs(new PrivilegedExceptionAction<SubmitApplicationResponse>() {
        @Override
        public SubmitApplicationResponse run() throws IOException, YarnException {
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
    return Response.status(Status.ACCEPTED).header(HttpHeaders.LOCATION, url).build();
  }

  private NewApplication createNewApplication() {
    GetNewApplicationRequest req = recordFactory.newRecordInstance(GetNewApplicationRequest.class);
    try {
      GetNewApplicationResponse resp = rm.getClientRMService().getNewApplication(req);
      return new NewApplication(resp.getApplicationId().toString(),
          new ResourceInfo(resp.getMaximumResourceCapability()));
    } catch (YarnException e) {
      String msg = "Unable to create new app from RM web service";
      LOG.error(msg, e);
      throw new YarnRuntimeException(msg, e);
    }
  }

  protected ApplicationSubmissionContext createAppSubmissionContext(
      ApplicationSubmissionContextInfo newApp) throws IOException {
    ApplicationId appid;
    try {
      appid = ConverterUtils.toApplicationId(recordFactory, newApp.getApplicationId());
    } catch (Exception e) {
      throw new BadRequestException("Could not parse application id " + newApp.getApplicationId());
    }
    ApplicationSubmissionContext appContext = ApplicationSubmissionContext.newInstance(
        appid,
        newApp.getApplicationName(),
        newApp.getQueue(),
        Priority.newInstance(newApp.getPriority()),
        createContainerLaunchContext(newApp),
        newApp.getUnmanagedAM(),
        newApp.getCancelTokensWhenComplete(),
        newApp.getMaxAppAttempts(),
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
    if (newApp.getResource().getvCores() > rm.getConfig().getInt(
        YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES,
        YarnConfiguration.DEFAULT_RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES)) {
      throw new BadRequestException("Requested more cores than configured max");
    }
    if (newApp.getResource().getMemory() > rm.getConfig().getInt(
        YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_MB,
        YarnConfiguration.DEFAULT_RM_SCHEDULER_MAXIMUM_ALLOCATION_MB)) {
      throw new BadRequestException("Requested more memory than configured max");
    }
    return Resource.newInstance(newApp.getResource().getMemory(),
        newApp.getResource().getvCores());
  }

  protected ContainerLaunchContext createContainerLaunchContext(
      ApplicationSubmissionContextInfo newApp) throws BadRequestException,
      IOException {
    HashMap<String, ByteBuffer> serviceData = new HashMap<>();
    for (Map.Entry<String, String> e : newApp.getContainerLaunchContextInfo()
        .getAuxillaryServiceData().entrySet()) {
      if (!e.getValue().isEmpty()) {
        Base64 decoder = new Base64(0, null, true);
        serviceData.put(e.getKey(), ByteBuffer.wrap(decoder.decode(e.getValue())));
      }
    }
    HashMap<String, LocalResource> resources = new HashMap<>();
    for (Map.Entry<String, LocalResourceInfo> e : newApp.getContainerLaunchContextInfo()
        .getResources().entrySet()) {
      LocalResourceInfo l = e.getValue();
      resources.put(e.getKey(),
          LocalResource.newInstance(
              ConverterUtils.getYarnUrlFromURI(l.getUrl()), l.getType(),
              l.getVisibility(), l.getSize(), l.getTimestamp()));
    }
    DataOutputBuffer out = new DataOutputBuffer();
    Credentials cs = createCredentials(newApp.getContainerLaunchContextInfo()
        .getCredentials());
    cs.writeTokenStorageToStream(out);
    ByteBuffer tokens = ByteBuffer.wrap(out.getData());
    return ContainerLaunchContext.newInstance(resources,
        newApp.getContainerLaunchContextInfo().getEnvironment(),
        newApp.getContainerLaunchContextInfo().getCommands(),
        serviceData, tokens,
        newApp.getContainerLaunchContextInfo().getAcls());
  }

  private Credentials createCredentials(CredentialsInfo credentials) {
    Credentials ret = new Credentials();
    try {
      for (Map.Entry<String, String> e : credentials.getTokens().entrySet()) {
        Text alias = new Text(e.getKey());
        Token<TokenIdentifier> token = new Token<>();
        token.decodeFromUrlString(e.getValue());
        ret.addToken(alias, token);
      }
      for (Map.Entry<String, String> e : credentials.getSecrets().entrySet()) {
        Text alias = new Text(e.getKey());
        Base64 decoder = new Base64(0, null, true);
        ret.addSecretKey(alias, decoder.decode(e.getValue()));
      }
    } catch (IOException ie) {
      throw new BadRequestException(
          "Could not parse credentials data; exception message = " + ie.getMessage());
    }
    return ret;
  }

  private UserGroupInformation createKerberosUserGroupInformation(
      HttpServletRequest hsr) throws AuthorizationException, YarnException {
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI == null) {
      throw new AuthorizationException("Unable to obtain user name, user not authenticated");
    }
    String authType = hsr.getAuthType();
    if (!KerberosAuthenticationHandler.TYPE.equalsIgnoreCase(authType)) {
      throw new YarnException("Delegation token operations can only be carried out on a "
          + "Kerberos authenticated channel. Expected auth type is "
          + KerberosAuthenticationHandler.TYPE + ", got type " + authType);
    }
    if (hsr.getAttribute(DelegationTokenAuthenticationHandler.DELEGATION_TOKEN_UGI_ATTRIBUTE) != null) {
      throw new YarnException("Delegation token operations cannot be carried out using delegation token authentication.");
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
  public Response postDelegationTokenExpiration(@Context HttpServletRequest hsr)
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
    GetDelegationTokenResponse resp = callerUGI.doAs(
        new PrivilegedExceptionAction<GetDelegationTokenResponse>() {
          @Override
          public GetDelegationTokenResponse run() throws IOException, YarnException {
            GetDelegationTokenRequest createReq = GetDelegationTokenRequest.newInstance(renewer);
            return rm.getClientRMService().getDelegationToken(createReq);
          }
        });
    Token<RMDelegationTokenIdentifier> tk = new Token<>(
        resp.getRMDelegationToken().getIdentifier().array(),
        resp.getRMDelegationToken().getPassword().array(),
        new Text(resp.getRMDelegationToken().getKind()),
        new Text(resp.getRMDelegationToken().getService()));
    RMDelegationTokenIdentifier identifier = tk.decodeIdentifier();
    long currentExpiration = rm.getRMContext().getRMDelegationTokenSecretManager()
        .getRenewDate(identifier);
    DelegationToken respToken = new DelegationToken(tk.encodeToUrlString(),
        renewer, identifier.getOwner().toString(), tk.getKind().toString(),
        currentExpiration, identifier.getMaxDate());
    return Response.status(Status.OK).entity(respToken).build();
  }

  private Response renewDelegationToken(DelegationToken tokenData,
      HttpServletRequest hsr, UserGroupInformation callerUGI)
      throws AuthorizationException, IOException, InterruptedException,
      Exception {
    Token<RMDelegationTokenIdentifier> token = extractToken(tokenData.getToken());
    org.apache.hadoop.yarn.api.records.Token dToken = BuilderUtils.newDelegationToken(
        token.getIdentifier(), token.getKind().toString(),
        token.getPassword(), token.getService().toString());
    final RenewDelegationTokenRequest req = RenewDelegationTokenRequest.newInstance(dToken);
    RenewDelegationTokenResponse resp = callerUGI.doAs(
        new PrivilegedExceptionAction<RenewDelegationTokenResponse>() {
          @Override
          public RenewDelegationTokenResponse run() throws IOException, YarnException {
            return rm.getClientRMService().renewDelegationToken(req);
          }
        });
    DelegationToken respToken = new DelegationToken();
    respToken.setNextExpirationTime(resp.getNextExpirationTime());
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
    org.apache.hadoop.yarn.api.records.Token dToken = BuilderUtils.newDelegationToken(
        token.getIdentifier(), token.getKind().toString(),
        token.getPassword(), token.getService().toString());
    final CancelDelegationTokenRequest req = CancelDelegationTokenRequest.newInstance(dToken);
    callerUGI.doAs(new PrivilegedExceptionAction<CancelDelegationTokenResponse>() {
      @Override
      public CancelDelegationTokenResponse run() throws IOException, YarnException {
        return rm.getClientRMService().cancelDelegationToken(req);
      }
    });
    return Response.status(Status.OK).build();
  }

  private Token<RMDelegationTokenIdentifier> extractToken(HttpServletRequest request) {
    String encodedToken = request.getHeader(DELEGATION_TOKEN_HEADER);
    if (encodedToken == null) {
      throw new BadRequestException("Header '" + DELEGATION_TOKEN_HEADER
          + "' containing encoded token not found");
    }
    return extractToken(encodedToken);
  }

  private Token<RMDelegationTokenIdentifier> extractToken(String encodedToken) {
    Token<RMDelegationTokenIdentifier> token = new Token<>();
    try {
      token.decodeFromUrlString(encodedToken);
    } catch (Exception ie) {
      throw new BadRequestException("Could not decode encoded token");
    }
    return token;
  }
}