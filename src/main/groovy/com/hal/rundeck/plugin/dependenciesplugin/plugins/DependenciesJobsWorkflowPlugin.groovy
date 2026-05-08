package com.hal.rundeck.plugin.dependenciesplugin;

// Author : HAL, aka Ogme

// External packages or modules dependencies
// skip imports - CPD-OFF
// base
import static com.dtolabs.rundeck.core.plugins.configuration.StringRenderingConstants.GROUPING
import static com.dtolabs.rundeck.core.plugins.configuration.StringRenderingConstants.GROUP_NAME
import com.dtolabs.rundeck.core.plugins.Plugin
import com.dtolabs.rundeck.core.plugins.configuration.StringRenderingConstants
import com.dtolabs.rundeck.plugins.step.StepPlugin
import com.dtolabs.rundeck.plugins.step.PluginStepContext
import com.dtolabs.rundeck.plugins.ServiceNameConstants
import com.dtolabs.rundeck.plugins.descriptions.PluginDescription
import com.dtolabs.rundeck.plugins.descriptions.PluginMetadata
import com.dtolabs.rundeck.plugins.descriptions.PluginProperty
import com.dtolabs.rundeck.plugins.descriptions.RenderingOption
import com.dtolabs.rundeck.plugins.descriptions.RenderingOptions
import com.dtolabs.rundeck.plugins.descriptions.SelectValues
import com.dtolabs.rundeck.core.execution.ExecutionListener
import groovy.json.JsonBuilder
import groovy.json.JsonOutput
import org.rundeck.storage.api.StorageException

// workflow errors
import com.dtolabs.rundeck.core.execution.workflow.steps.StepException;


// job informations - required for the current execution
import com.dtolabs.rundeck.core.jobs.JobNotFound;
import com.dtolabs.rundeck.core.jobs.JobReference;
import com.dtolabs.rundeck.core.jobs.JobService;
import com.dtolabs.rundeck.core.jobs.JobState;

// execution informations - required for the current execution
import com.dtolabs.rundeck.core.execution.ExecutionReference;
// ref: https://github.com/rundeck/rundeck/blob/development/core/src/main/java/com/dtolabs/rundeck/core/execution/workflow/state/ExecutionState.java
import com.dtolabs.rundeck.core.execution.workflow.state.ExecutionState;


// date/time
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.TimeZone;
import java.text.DateFormat;


// other
import java.util.HashMap;
import java.lang.System;


// extras
import java.util.List;
import java.util.Date;

// CPD-ON

/**
* Module dependencies-wait_job - a Rundeck workflow plugin  <br />
*/
@Plugin(name = PLUGIN_NAME, service = ServiceNameConstants.WorkflowStep)
@PluginDescription(title = PLUGIN_TITLE, description = PLUGIN_DESCRIPTION)
class DependenciesJobsWorkflowPlugin extends DependenciesWorkflowTemplate {

    public static final String PLUGIN_NAME = "dependencies-wait_job"
    public static final String PLUGIN_TITLE = "Dependencies Workflow / wait / job"
    public static final String PLUGIN_DESCRIPTION = "Wait for another job execution in a given state in a workflow, with advanced waiting options."

    protected static final String JOBDEPS_PROP_STATE_SUCCESS = "success"
    protected static final String JOBDEPS_PROP_STATE_ERROR = "error"

    protected static final String JOBDEPS_PROP_LINK_HARD = "-hardlink"
    protected static final String JOBDEPS_PROP_LINK_SOFT = "-softlink"

    protected static final String JOBDEPS_PROP_NODE_FILTER_ADAPT = "adapt"
    protected static final String JOBDEPS_PROP_NODE_FILTER_GLOBAL = "global"
    protected static final String JOBDEPS_PROP_NODE_FILTER_REGEX = "regex"

    // #############################################################################################

    // ref: https://docs.rundeck.com/docs/developer/02-plugin-annotations.html#plugin-properties
    // most of the parameters here are of string type to stay compatible with the older plugin version which was a shell script

    @PluginProperty(
        name = "target_project",
        title = "Project",
        description = "The project name of the job to await. Default to the current project.",
        defaultValue = '${job.project}',
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Target job definition") ])
    String sPropTargetProject;


    @PluginProperty(
        name = "target_group",
        title = "Group",
        description = "The group name of the job to await. Default to the same group as this job.",
        defaultValue = '${job.group}',
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Target job definition") ])
    String sPropTargetGroup;


    @PluginProperty(
        name = "target_job",
        title = "Job",
        description = "The job name to await. It must be defined.",
        defaultValue = "",
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Target job definition") ])
    String sPropTargetJobName;


    @PluginProperty(
        name = "status_job",
        title = "Status",
        description = "The expected ending status of the referenced job.",
        defaultValue = JOBDEPS_PROP_STATE_SUCCESS,
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Dependency definition") ])
    @SelectValues(freeSelect = false, values = [JOBDEPS_PROP_STATE_SUCCESS, JOBDEPS_PROP_STATE_ERROR] )
    String sPropTargetJobStatus;


    // NOTICE: The property should be named "link_type", but is kept as "softlink" for the compatibility with older versions
    @PluginProperty(
        name = "softlink",
        title = "Dependency type",
        description = JOBDEPS_PROP_LINK_HARD + " will wait until the required job is started, finished and with the expected status.  \n" +
                      JOBDEPS_PROP_LINK_SOFT + " will honor the dependency only if the required job is already launched (at least running, or already complete or in error).  \n" +
                        "Useful for jobs not always present in a workflow, like those with a weekly or monthly frequency.",
        defaultValue = JOBDEPS_PROP_LINK_HARD,
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Dependency definition") ])
    @SelectValues(freeSelect = false, values = [JOBDEPS_PROP_LINK_HARD, JOBDEPS_PROP_LINK_SOFT] )
    String sPropLinkMode;


    @PluginProperty(
        name = "halt_opposite_state",
        title = "Halt execution on opposite job's state",
        description = "Halt and exit this job's execution with the 'success' state ONLY when the target job is ended and in the opposite state than desired.  \n" +
                      "I.E. when the target job is completed with the success state, and the dependency is set to error,  \n" +
                      "or when the target job is in error, but the dependency is expecting the success state.  \n" +
                      "Useful for jobs with steps to execute only when the target job is in error, and skip them the other times.",
        defaultValue = "false",
        required = false
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Dependency tuning"), @RenderingOption(key = GROUPING, value = "secondary") ])
    Boolean bPropHaltOnOppositeState;


    @PluginProperty(
        name = "node_filtering",
        title = "Node filtering",
        description = "Option to manage launches when the 'Change the target nodes' option is used in the job instead of keeping the default setting.  \n" +
                      "- " + JOBDEPS_PROP_NODE_FILTER_ADAPT + " tries to reuse the information from the current job to search for the same execution nodes (default).  \n" +
                      "- " + JOBDEPS_PROP_NODE_FILTER_GLOBAL + " will search for the first targeted job with a valid status, without regard for the execution node.  \n" +
                      "  Use this mode when a job cannot be found with the Adapt mode.  \n" +
                      "- " + JOBDEPS_PROP_NODE_FILTER_REGEX + " will use the provided regex filter in the execution node list to target specific nodes.  \n" +
                      "  When used, add in 'Other Params' this extra parameter : `-nodefilter_regex 'your regex mask'`",
        defaultValue = JOBDEPS_PROP_NODE_FILTER_ADAPT,
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Other options"), @RenderingOption(key = GROUPING, value = "secondary") ])
    @SelectValues(freeSelect = false, values = [JOBDEPS_PROP_NODE_FILTER_ADAPT, JOBDEPS_PROP_NODE_FILTER_GLOBAL, JOBDEPS_PROP_NODE_FILTER_REGEX] )
    String sPropNodeFilter;


    // #############################################################################################

    /**
     * Plugin main method
     * @param context : execution informations
     * @param configuration : data
     * @throws StepException : possible errors
     */
    @Override
    @SuppressWarnings(['CyclomaticComplexity', 'AbcMetric'])
    void executeStep(final PluginStepContext context, final Map<String, Object> configuration) throws StepException {
        /*
        * ref: https://javadoc.io/doc/org.rundeck/rundeck-core/latest/index.html
        * ref: https://javadoc.io/doc/org.rundeck/rundeck-core/latest/com/dtolabs/rundeck/core/jobs/JobService.html
        * ref: https://javadoc.io/doc/org.rundeck/rundeck-core/latest/com/dtolabs/rundeck/core/jobs/JobReference.html
        * ref: https://javadoc.io/doc/org.rundeck/rundeck-core/latest/com/dtolabs/rundeck/core/execution/ExecutionReference.html
        */

        JobReference oTargetJobRef      = null
        String sTargetJobId             = ""
        Boolean bTargetJobIsRunning     = false
        java.util.List<ExecutionReference> aTargetJobExecData
        ExecutionReference oTargetJobExec
        String sTargetJobExecCurrentStatus = ""
        // information messages in the main loop
        Boolean bLoopOnetimeMsgNoExecInFlow = false
        Boolean bLoopOnetimeMsgJobRunning = false
        Boolean bLoopOnetimeMsgExecNotDesiredState = false

        // init execution context variables
        this.initExecutionContext(PLUGIN_NAME, context)

        // show environment and known properties - only if debug is set in the class
        this.showEnvironmentAndProperties()

        // manage props values
        if (sPropLinkMode != JOBDEPS_PROP_LINK_SOFT) { sPropLinkMode = JOBDEPS_PROP_LINK_HARD }
        Boolean bTargetJobMandatory = false; if ( sPropLinkMode.contains(JOBDEPS_PROP_LINK_HARD) ) { bTargetJobMandatory = true; }

        // the execution filter can be absent or null
        String sTargetJobNodeFilterAdapt = ""; if ( this.oThisExecution.getTargetNodes() ) { sTargetJobNodeFilterAdapt = this.oThisExecution.getTargetNodes() }


        // manage values from the extra parameters - command line behavior from the previous version
        // a value from the extra param has the priority over a UI value
        this.initParseCommandLine()
        // get the node filter from the cmdline
        String sPropFlowNodeFilterRegex = this.oPropExtraParams.get("nodefilter_regex") ?: ""
        // cleanup
        this.initParseCommandLineCleanup()


        // workflow starting and ending date/time calculation
        this.initWorkflowDateTimeSettings()


        // execution banner
        this.logBanner(PLUGIN_NAME)
        this.logBannerTitleLineFormat( "JOB project", "'" + sPropTargetProject + "'")
        this.logBannerTitleLineFormat("JOB group", "'" + sPropTargetGroup + "'")
        this.logBannerTitleLineFormat("JOB name", "'" + sPropTargetJobName + "'")
        this.logBannerTitleLineFormat("JOB wanted state", sPropTargetJobStatus + " (" + sPropLinkMode.replace('-', '') + ")" )
        this.logBannerTitleForceLaunchStatus()
        this.logBannerTitleLineFormat("Node filter mode", sPropNodeFilter)
        if (sPropNodeFilter == JOBDEPS_PROP_NODE_FILTER_REGEX) { this.logBannerTitleLineFormat("Node filter regex", sPropFlowNodeFilterRegex) }

        this.logBannerBottomConfigInfo(configuration)

        // check if -skip was provided on the command line
        if ( this.logSkipActivated() ) { return }

        if (bPropHaltOnOppositeState) {
            this.logBannerTitleLineFormat("Halt on opposite job's state",  "active")
        }


        // Lookup for the target job ID ------------------------------------------------
        this.logDebug("plugin:executeStep:job:Looking for the target job ID ...")
        oTargetJobRef = rdJob_GetJobFromName( this.oJobService, sPropTargetProject, sPropTargetGroup, sPropTargetJobName )
        sTargetJobId = oTargetJobRef.getId()
        this.loggerNotice("Notice: Target job definition found with the ID: " + sTargetJobId)

        // Target job waiting sequence -------------------------------------------------

        // wait before starting anything to let the executions setting in
        this.sleepBeforeLoopAndSkipMsg()

        // loop until the max wait duration is reached or the dependency is resolved
        // "do...while <test>" does not exists in groovy
        while (true) {
            // search for the manually created skipfile
            // nothing to do after exiting the loop => output the finish message and exit completely
            if ( this.searchForSkipfile() ) { this.logFinishMessage("") ; return ; }


            // Job execution status
            bTargetJobIsRunning = this.oJobService.getJobState( oTargetJobRef ).isRunning()
            this.logDebug("plugin:executeStep:loop:Target job isRunning : " + bTargetJobIsRunning.toString() )


            // if running, just have to wait more
            // if not running, that's where the work is starting
            if (!bTargetJobIsRunning) {         // codenarc-disable-line InvertedIfElse
                this.logDebug("plugin:executeStep:loop:Retrieving target job execution list ...")
                aTargetJobExecData = rdJob_GetJobSearchExecutions( this.oJobService, sPropTargetProject, sTargetJobId, "", dTimeFlowDailyStart)

                if (aTargetJobExecData.size() > 0) {
                    // Select the last execution from the list which should be the more recent
                    oTargetJobExec = aTargetJobExecData.get( aTargetJobExecData.size() - 1 )        // codenarc-disable-line UnnecessaryCallForLastElement

                    // shouldn't be required, but many properties can be with inappropriate types or values or even null in some cases
                    this.debug_ExecutionReferenceInfos("plugin:executeStep:loop: ", oTargetJobExec)

                    sTargetJobExecCurrentStatus = jobExecutionGetStatus(oTargetJobExec.getStatus())
                    if (sTargetJobExecCurrentStatus == sPropTargetJobStatus) {
                        // behavior change depending of the compare mode for the node
                        this.logDebug("plugin:executeStep:loop:targetFound:execution with the valid state found - node filtering comparison ...")
                        this.logDebug("plugin:executeStep:loop:targetFound:filter:target job - node list : " + oTargetJobExec.getTargetNodes() )

                        this.bThisFlowDepResolved = nodeFilterIsDepFoundResolved(oTargetJobExec, sPropNodeFilter, sTargetJobNodeFilterAdapt, sPropFlowNodeFilterRegex)

                        // work is done  if the dep resolution is in the valid state
                        if (this.bThisFlowDepResolved) {
                            this.logDebug("plugin:executeStep:loop:dependency resolved ...")

                            // handle the incomplete data from execRef.getDateCompleted() - ref : https://github.com/rundeck/rundeck/issues/9290
                            String sDateEndedStarted
                            if ( oTargetJobExec.getDateCompleted() != null) {
                                sDateEndedStarted = " ended at " + oTargetJobExec.getDateCompleted()
                            } else {
                                sDateEndedStarted = " started at " + oTargetJobExec.getDateStarted()
                            }

                            this.logFinishMessage("Valid execution found : #" + oTargetJobExec.getId() + sDateEndedStarted + " with status '" + oTargetJobExec.getStatus() + "' => success" )    // codenarc-disable-line LineLength
                            break
                        }

                    // execution found but not in the desired state
                    } else {
                        if (sTargetJobExecCurrentStatus.length() > 0 && bPropHaltOnOppositeState) {
                            this.loggerNoticeWithTime("Notice: Execution #" + oTargetJobExec.getId() + " has ended but is not in the desired state", ":")
                            this.executeStepHaltJobFlow(context, "success")
                            return

                        } else if (!bLoopOnetimeMsgExecNotDesiredState) {
                            this.loggerNoticeWithTime("Notice: Execution #" + oTargetJobExec.getId() + " found but is not in the desired state - waiting ...", ":")
                            bLoopOnetimeMsgExecNotDesiredState = true
                            bLoopOnetimeMsgJobRunning = false
                        }
                    }

                // the job exists but there is no execution in the current flow
                } else {
                    // the dependency is not mandatory => success & finish
                    if (!bTargetJobMandatory) {
                        this.logFinishMessage("No execution for the target job in this current flow AND optional dependency => success" )
                        this.bThisFlowDepResolved = true
                        break
                    }

                    // the dependency is mandatory => wait
                    if (!bLoopOnetimeMsgNoExecInFlow) {
                        // no date output as the step just started
                        this.loggerNotice("Notice: No execution found for the target job since the current flow starting time - waiting ..." )
                        bLoopOnetimeMsgNoExecInFlow = true
                    }
                }

            // target job is still running
            } else {
                if (!bLoopOnetimeMsgJobRunning) {
                    this.loggerNoticeWithTime("Notice: The target job is currently running - waiting ...", ":")
                    bLoopOnetimeMsgJobRunning = true
                    bLoopOnetimeMsgExecNotDesiredState = false
                }
            }


            // Wait and While conditions #######################################
            if ( this.loopSleepAndVerifyDurationLimit() ) { break; }
        }


        // verify the force launch and last test for the dependency state
        this.executeStepFinalizeAndForceLaunch("no job execution found with status '" + sPropTargetJobStatus + "'")
    }


    // #############################################################################################

    /**
    * Verify if the dependency is resolved depending of the node filter selection
    * @param oJobExecRef :
    * @param sPropNodeFilter :
    * @param sTargetFilterNodeAdapt :
    * @param sTargetFilterNodeRegex ;
    * @return : true if the job nodes are covered by the node filter
    */
    Boolean nodeFilterIsDepFoundResolved(ExecutionReference oJobExecRef, String sPropNodeFilter, String sTargetFilterNodeAdapt, String sTargetFilterNodeRegex) {
        Boolean bRet = false
        String sJobExecTargetNodes = ""

        if ( oJobExecRef.getTargetNodes() ) {
            sJobExecTargetNodes = oJobExecRef.getTargetNodes()
            // when the job is local, the Rundeck server will appear as "localhost" => add the Rundeck server hostname
            sJobExecTargetNodes = sJobExecTargetNodes.replace( "localhost", "localhost," + this.sThisJobComputerName )
        }
        this.logDebug("plugin:nodeFilterIsDepFoundResolved: target job nodes = " + sJobExecTargetNodes)
        this.logDebug("plugin:nodeFilterIsDepFoundResolved: nodeFilterProp = " + sPropNodeFilter + " (regex='" + sTargetFilterNodeRegex + "')")
        this.logDebug("plugin:nodeFilterIsDepFoundResolved: nodeFilterAdapt = " + sTargetFilterNodeAdapt)

        if (sJobExecTargetNodes.isEmpty()) {
            this.logDebug("plugin:nodeFilterIsDepFoundResolved:getTargetNodes is empty => dependency set to resolved")
            return true
        }

        // node filter: adapt mode - look for having the same node for both jobs
        if (sPropNodeFilter == JOBDEPS_PROP_NODE_FILTER_ADAPT && !sTargetFilterNodeAdapt.isEmpty() ) {
            this.logDebug("plugin:nodeFilterIsDepFoundResolved:filter:Adapt:search into this job node list : " + sTargetFilterNodeAdapt )

            for ( String sNode : sJobExecTargetNodes.split(', *') ) {
                if ( sTargetFilterNodeAdapt.contains(sNode) ) {
                    this.loggerNotice("Notice: Adapt mode filtering - Node " + sNode + " found in : " +  sJobExecTargetNodes )
                    bRet = true
                    break
                }
            }

        // node filter: regex mode
        } else if (sPropNodeFilter == JOBDEPS_PROP_NODE_FILTER_REGEX && !sTargetFilterNodeRegex.trim().isEmpty() ) {
            this.logDebug("plugin:nodeFilterIsDepFoundResolved:filter:Regex:search in target with the regex : " + sTargetFilterNodeRegex )

            if ( sJobExecTargetNodes.matches( sTargetFilterNodeRegex ) ) {
                this.loggerNotice("Notice: Regex mode filtering - node found in : " + sJobExecTargetNodes )
                bRet = true
            }

        // node filter: global mode or no filter - any job in the expected state is valid, without regards for the execution node
        } else {
            this.logDebug("plugin:nodeFilterIsDepFoundResolved:filter:None:dependency set to resolved")
            bRet = true
        }

        return bRet
    }

    /**
    * validate the status of an execution
    * @param sExecGetStatus :
    * @return : return either "success", "error", or "" if the status it not an expected state for a completed execution
    */
    String jobExecutionGetStatus(String sExecGetStatus) {
        Boolean bTestState

        // When a job is running getStatus() can be null in rare occurences
        if (sExecGetStatus) {
            // compare the job state with the definitions
            // groovism => [].any{ autogenerated "it" }

            bTestState = DepsConstants.jobState_ok.any { sExecGetStatus.equalsIgnoreCase(it) }
            if (bTestState) { return JOBDEPS_PROP_STATE_SUCCESS }

            bTestState = DepsConstants.jobState_ko.any { sExecGetStatus.equalsIgnoreCase(it) }
            if (bTestState) { return JOBDEPS_PROP_STATE_ERROR }

        }
        return ""
    }


    /**
    * find a job ID from its project, group and job name
    * ref: https://javadoc.io/static/org.rundeck/rundeck-core/5.0.1-20240115/com/dtolabs/rundeck/core/jobs/JobService.html
    * @param oJobSvc : the current JobService
    * @param sTargetProjectName : target project name
    * @param sTargetGroupName : target group name
    * @param sTargetJobName : target job name
    * @return : the job definition as object
    */
    private JobReference rdJob_GetJobFromName(JobService oJobSvc, String sTargetProjectName, String sTargetGroupName, String sTargetJobName) {
        this.logDebug("plugin:rdJob_GetJobFromName: search for '" + sTargetGroupName + "/" + sTargetJobName + "' in '" + sTargetProjectName + "'  ...")

        try {
            return oJobSvc.jobForName(sTargetGroupName, sTargetJobName, sTargetProjectName);
        }
        catch (JobNotFound e) {
            throw new StepException(
                "plugin:rdJob_GetJobFromName:Error - target job '" + sTargetJobName + "' in group '" + sTargetGroupName + "' was not found in the project '" + sTargetProjectName + "'",
                PluginFailureReason.ConfigurationFailure
            )
        }
    }


    /**
    * retrieve the execution history of a job
    * ref: https://javadoc.io/static/org.rundeck/rundeck-core/5.0.1-20240115/com/dtolabs/rundeck/core/jobs/JobService.html
    * @param oJobSvc : the current JobService
    * @param sTargetProject : target project name
    * @param sTargetJobId : target job uid
    * @param sTargetJobState : job state, set to "" if not desired
    * @param dDateTimeAfter : (optional) starting date to search for executions
    * @return : list of the target job executions, when found
    */
    private java.util.List<ExecutionReference> rdJob_GetJobSearchExecutions(JobService oJobSvc, String sTargetProject, String sTargetJobId, String sTargetJobState, ZonedDateTime dDateTimeAfter = null) {
        Long nTimeStart = 0
        String sTimeStart = ""

        // the searchExecutions(..., time) parameter expect a duration with the format "<number>T" having T from this list: h,n,s,d,w,m,y (hour,minute,second,day,week,month,year)
        if (dDateTimeAfter) {
            nTimeStart = dDateTimeAfter.toEpochSecond() - ZonedDateTime.now().toEpochSecond()
            sTimeStart = nTimeStart.toString() + "s"
        }

        // ref: https://github.com/rundeck/rundeck/blob/main/core/src/main/java/com/dtolabs/rundeck/core/jobs/JobService.java#L81
        // the state parameter can be empty
        return oJobSvc.searchExecutions(sTargetJobState, sTargetProject, sTargetJobId, "", sTimeStart)
    }
}
