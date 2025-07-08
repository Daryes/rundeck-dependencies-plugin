package com.hal.rundeck.plugin.dependenciesplugin;

// External packages or modules dependencies
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
// required by com.dtolabs.rundeck.core.execution.ExecutionReference
import java.util.Date;


// cli
// ref : https://blogsarchive.apache.org/logging/entry/groovy-2-5-clibuilder-renewal
// ref : https://issues.apache.org/jira/browse/GROOVY-9165
// ref : https://docs.groovy-lang.org/latest/html/gapi/groovy/cli/internal/package-summary.html
// import groovy.cli.internal.CliBuilderInternal;
// import groovy.cli.internal.OptionAccessor;
// DROPPED => using basic code instead


// other
import java.util.HashMap;
import java.lang.System;


/**
* Module Template for dependencies Workflow plugins  <br />
* The following annotations must be uncommented for a new plugin :
* <pre>
* @Plugin(name = PLUGIN_NAME, service = ServiceNameConstants.WorkflowStep) }
* @PluginDescription(title = PLUGIN_TITLE, description = PLUGIN_DESCRIPTION) }
* </pre>
*/
@SuppressWarnings('ClassNameSameAsFilename')
class DependenciesWorkflowTemplate implements StepPlugin {

    // Fill these variables and uncomment them for a new plugin
    // public static final String PLUGIN_NAME = "dependencies-wait_FILL ME"
    // public static final String PLUGIN_TITLE = "Dependencies Workflow / wait / FILL ME"
    // public static final String PLUGIN_DESCRIPTION = "FILL ME"
    // => also : build.gradle => pluginClassNames needs also to be filled with the new plugin name

    Boolean DEBUG = false

    // current execution elements
    ExecutionListener logger
    JobService oJobService
    ExecutionReference oThisExecution
    String sThisJobStep
    String sThisExecutionId
    String sThisJobComputerName

    String sThisFlowSkipfile
    Boolean bThisFlowDepResolved

    // for properties access
    DepsHelperProperties oDepsHelperProps

    // command line parameters
    Map oPropExtraParams

    // values from properties
    Boolean bPropFlowSkipDep
    Boolean bPropFlowForceLaunch
    Integer nPropMaxWaitSecFinal
    short nWaitSecJitter = 0            // allow to alter the loop sleep duration with a random amount of secs
    short nStartDelaySleepSec
    String sPropFlowDailyStart
    String sPropFlowDailyEnd
    short nflowLoopSleepDurationFinal
    short nflowLoopSleepSlowerDurationFinal


    // date/time information
    ZonedDateTime dTimeFlowStarted
    Long nTimeFlowStartedEpoch
    ZonedDateTime dTimeFlowDailyStart
    ZonedDateTime dTimeFlowDailyEnd


    /*
    * Many problems in groovy to use constants in annotation with {} in the same class
    * declare value={...} with value=[ ... ] and might have to use protected instead of public
    * ref : https://issues.apache.org/jira/browse/GROOVY-5776
    * ref : https://issues.apache.org/jira/browse/GROOVY-3278
    * ref : https://docs.groovy-lang.org/3.0.17/html/documentation/#_java_style_array_initialization
    */


    // PluginProperty Definitions #################################################################
    // ref: https://docs.rundeck.com/docs/developer/02-plugin-annotations.html#plugin-properties

    @PluginProperty(
        name = "force_launch",
        title = "Force launch",
        description = "Force the execution when the timeout delay is reached, ignoring the state of the required job and without raising an error.",
        // yes, false, no => single checkbox | true => 2 selection dot
        defaultValue = "false",
        // should be required but disabled for compatibility with previous versions
        required = false
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Dependency definition") ])
    Boolean bPropForceLaunch;


    /* disabled for compatibility with previous versions
    * @PluginProperty(
    *     name = "maxWait",
    *     title = "Max wait duration",
    *     description = "The duration in seconds before this step end with a timeout. Default value is " +
    *                   DepsConstants.flowTimeoutDurationSecStringForAnnotations + " (" + DepsConstants.flowTimeoutDurationFormated + ").  \n" +
    *                   "Reaching the current workflow end time will always raise a timeout, taking precedence over this setting.  \n" +
    *                   "The old option '-maxWait ...' in the extra parameters field is also supported to change this value." ,
    *     defaultValue = DepsConstants.flowTimeoutDurationSecStringForAnnotations,
    *     required = true
    * )
    * @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "secondary") ])
    * Integer nPropMaxWait;
    */

    @PluginProperty(
        name = "optional_params",
        title = "Extra parameters",
        description = "Additional parameters from this list:  \n" +
                                    "- `-maxWait number`  \n" +
                                    "  (alias: `-wait number`) Total wait duration in seconds before raising a timeout.  \n" +
                                    "  Reaching the workflow global end time has precedence over this setting.  \n" +
                                    "  Can be combined with the parameter 'Force Launch'\n" +

                                    "- `-nodefilter_regex 'my regex mask'`  \n" +
                                    "  Filter the target job execution only on the nodes selected by the regex mask  \n" +
                                    "  Requires the parameter 'Node filtering' set to the mode `regex`\n" +

                                    "- `-skip`  \n" +
                                    "  (alias: `-bypass`) Ignore the target job status and exit this step immediately without error  \n" +
                                    "  This is usually for manual launches, when the dependency might not be desired.  \n" +

                                    "\n To use these dynamically at launch time, create an additional workflow option in this job named `DEPENDENCY_EXTRA_PARAMS` of string type, empty.  \n" +
                                    "This will allow at launch time to change some properties, even use the -skip parameter to disable the dependency steps.  \n" +
                                    "(both the created option name and the name in this property value must be the same)." ,
        defaultValue = '\${option.DEPENDENCY_EXTRA_PARAMS}',
        required = false
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Other options"), @RenderingOption(key = GROUPING, value = "secondary") ])
    String sPropExtraParams;


    // #############################################################################################

    /**
     * Plugin main method
     * @param context : execution informations
     * @param configuration : data
     * @throws StepException : possible errors
     */
    @Override
    void executeStep(final PluginStepContext context, final Map<String, Object> configuration) throws StepException {
        // ref: https://javadoc.io/doc/org.rundeck/rundeck-core/latest/index.html

        initExecutionContext();
        loggerNotice("plugin:executeStep: empty function - this should not happen")
    }

    // #############################################################################################

    /**
    * Retrieve current execution informations
    * <br/>ref : https://javadoc.io/doc/org.rundeck/rundeck-core/latest/com/dtolabs/rundeck/plugins/step/PluginStepContext.html
    * <br/>ref : https://javadoc.io/doc/org.rundeck/rundeck-core/latest/com/dtolabs/rundeck/core/jobs/JobService.html
    * <br/>ref : https://javadoc.io/doc/org.rundeck/rundeck-core/latest/com/dtolabs/rundeck/core/jobs/JobReference.html
    * <br/>ref : https://javadoc.io/doc/org.rundeck/rundeck-core/latest/com/dtolabs/rundeck/core/execution/ExecutionReference.html
    * <br/>ref : https://javadoc.io/doc/org.rundeck/rundeck-core/latest/com/dtolabs/rundeck/core/utils/IPropertyLookup.html
    */
    void initExecutionContext(final String sPluginName, final PluginStepContext oStepContext) {
        logger                      = oStepContext.getExecutionContext().getExecutionListener()
        oJobService                 = oStepContext.getExecutionContext().getJobService()
        oThisExecution              = oStepContext.getExecutionContext().getExecution()
        sThisJobStep                = String.valueOf( oStepContext.getStepNumber() )
        sThisExecutionId            = oThisExecution.getId()

        oDepsHelperProps            = new DepsHelperProperties( oStepContext.getIFramework(), oStepContext.getFrameworkProject() )

        sThisJobComputerName        = DepsHelper.getHostname()

        bThisFlowDepResolved        = false
        sThisFlowSkipfile           = DepsHelper.timeFlowDaily_skipFileGenerateName(sPluginName, sThisExecutionId, sThisJobStep)

        nStartDelaySleepSec         = DepsConstants.flowStartupDelaySec
        // remove the start delay when the current step is not the first or second
        if ( oStepContext.getStepNumber() > 2 ) { nStartDelaySleepSec = 0 }
    }


    /**
    * Show environment and known properties - only if debug is active => in this class <=
    */
    void showEnvironmentAndProperties() {
        if ( DEBUG ) {
            System.err.println("Class DEBUG is active")
            System.getenv().forEach((k, v) -> { System.err.println("envir: " + k + "=" + v); });
            System.getProperties().forEach((k, v) -> { System.err.println("system props: " + k + "=" + v); });
            oDepsHelperProps.debugPrintAllProps()
        }
    }


    /**
    * Manage values from the extra parameters - command line behavior from the previous version <br />
    * A value from the extra param has the priority over a UI value
    */
    void initParseCommandLine() {
        if ( DEBUG || sPropExtraParams.contains("-debug") ) { System.err.println("plugin:initExecutionContext:parsing command line ...") }

        oPropExtraParams = DepsHelper.cliParamParse(sPropExtraParams)
        if ( oPropExtraParams.containsKey("debug") ) { DEBUG = true }
    }


    /**
    * set the final values from the PluginProperty parameters when defined
    * @require initParseCommandLine
    */
    void initPropertiesFinalValueFromCmdLine() {
        bPropFlowSkipDep            = oPropExtraParams.containsKey("skip")
        bPropFlowForceLaunch        = oPropExtraParams.get("force_launch") ?: bPropForceLaunch
        nPropMaxWaitSecFinal        = oPropExtraParams.get("wait") ?: oDepsHelperProps.getPropFlowTimeoutDurationSec()
        sPropFlowDailyStart         = oPropExtraParams.get("flow_daily_start") ?: oDepsHelperProps.getPropFlowDailyStartTime()
        sPropFlowDailyEnd           = oPropExtraParams.get("flow_daily_end") ?: oDepsHelperProps.getPropFlowDailyEndTime()
        nStartDelaySleepSec         = oPropExtraParams.get("startup_delay") ?: nStartDelaySleepSec
        nflowLoopSleepDurationFinal = oPropExtraParams.get("sleep_duration") ?: oDepsHelperProps.getPropFlowLoopSleepDurationSec()
        nflowLoopSleepSlowerDurationFinal = oPropExtraParams.get("sleep_slower_duration") ?: oDepsHelperProps.getPropFlowLoopSleepSlowerDurationSec()
    }

    void initPropertiesFinalValueFromCmdLineCleanup() {
        // no more use
        oPropExtraParams.clear()
        oPropExtraParams = oDepsHelperProps = null
    }


    /**
    * workflow starting and ending date/time calculation
    * ref : https://groovy.apache.org/blog/groovy-dates-and-times-cheat
    */
    void initWorkflowDateTimeSettings() {
        // ref : https://groovy.apache.org/blog/groovy-dates-and-times-cheat
        if ( DEBUG ) { System.err.println("plugin:initWorkflowDateTimeSettings:parsing workflow ZonedDateTime ...") }

        dTimeFlowStarted            = ZonedDateTime.now()
        nTimeFlowStartedEpoch       = dTimeFlowStarted.toEpochSecond()
        dTimeFlowDailyStart         = DepsHelper.timeFlowDaily_start(dTimeFlowStarted, sPropFlowDailyStart)
        dTimeFlowDailyEnd           = DepsHelper.timeFlowDaily_end(dTimeFlowStarted, sPropFlowDailyEnd)
    }


    /**
    * output to logger object as notice message
    */
    void loggerNotice(final String sText) {
        // log levels : 0=Error, 1=Warning, 2=Notice; 3=Info, 4=Debug  with 3 and 4 visible only with "Run with Debug Output"=on
        logger.log(2, sText)
    }


    /**
    * output to logger object as warning message
    */
    void loggerWarn(final String sText) {
        logger.log(1, sText)
    }


    /**
    * output to logger object as error message
    */
    void loggerError(final String sText) {
        logger.log(0, sText)
    }


    /**
    * show the execution banner on the logger
    */
    void logBanner(final String sPluginName) {
        if ( DEBUG ) { loggerWarn("Debug mode active !"); System.err.println("plugin:executeStep:banner:print informations ...") }

        loggerNotice("MODULE: " + sPluginName.toUpperCase().replace("-", " ") )
        loggerNotice("Package version: " + getClass().getPackage().getImplementationVersion() )

        loggerNotice(DepsConstants.stdout_line)

        logBannerTitleLineFormat("FLOW START", dTimeFlowDailyStart.format( DateTimeFormatter.RFC_1123_DATE_TIME ) )
        logBannerTitleLineFormat("FLOW END", dTimeFlowDailyEnd.format( DateTimeFormatter.RFC_1123_DATE_TIME ) )
        if ( Short.compare(nflowLoopSleepDurationFinal, DepsConstants.flowLoopSleepDurationSec) != 0 ) {
            logBannerTitleLineFormat("PAUSE DURATION", String.valueOf(DepsHelper.flowLoopSleepDurationSec) + "s" )
        }
    }


    /**
    * output a formatted "title: description" line
    * @param sTitle : the title value
    * @param sDescription : the description for the title
    */
    void logBannerTitleLineFormat(String sTitle, String sDescription) {
        if (sTitle.trim().substring(sTitle.length() - 1) != ":") { sTitle = sTitle.trim() + ":" }
        loggerNotice( String.format("%-24s %s", sTitle, sDescription) )
    }

    /**
    * output a title line in the banner for the "force_launch" parameter
    */
    void logBannerTitleForceLaunchStatus() {
        logBannerTitleLineFormat("Force launch on timeout", bPropFlowForceLaunch.toString() )
    }

    /**
    * show extra informations at the end of the banner
    */
    void logBannerBottomConfigInfo(final Map<String, Object> oConfig ) {
        loggerNotice(DepsConstants.stdout_line )
        logBannerTitleLineFormat("Started at", dTimeFlowStarted.format( DateTimeFormatter.ISO_OFFSET_DATE_TIME ) )
        logBannerTitleLineFormat("Exec #ID", sThisExecutionId )
        loggerNotice(DepsConstants.stdout_line )

        if (DEBUG) {
            loggerWarn("Printing other configuration parameters (can be empty) ..." )
            for (Map.Entry<String, Object> entry : oConfig.entrySet()) {
                loggerWarn(entry.getKey() + ":" + entry.getValue().toString() )
            }

            loggerWarn("")
            loggerWarn("Printing current execution nodes filters (null if empty) ...")
            loggerWarn("getFilter : " + oThisExecution.getFilter() )
            loggerWarn("getTargetNodes : " + oThisExecution.getTargetNodes() )
        }
    }


    /**
    * test the skip parameter presence and print a message if activated
    * @return : true if activated
    */
    Boolean logSkipActivated() {
        if (bPropFlowSkipDep) {
            logFinishMessage("\nThe -skip parameter is set => the step will exit immediately => success")
        }
        return bPropFlowSkipDep
    }


    /**
    * Slight sleep before starting then print the loop duration and skip filename
    */
    void sleepBeforeLoopAndSkipMsg() {
        // wait before starting anything to let the jobs setting in
        if ( DEBUG ) {
            System.err.println("plugin:executeStep:loop:skipping the " + String.valueOf( nStartDelaySleepSec ) + "s pause before the waiting loop due to debug activated ...")

        } else if (nStartDelaySleepSec > 0) {
            DepsHelper.waiting( nStartDelaySleepSec * 1000 )
        }

        loggerNotice("\nWaiting loop started (each " + String.valueOf(nflowLoopSleepDurationFinal) + "s for " + DepsHelper.formatElapsedTime(nPropMaxWaitSecFinal, true) +
                      " or until the flow's ending time) ..."
                  )
        loggerNotice("To exit this loop, run this shell command on the Rundeck host : sudo su " + System.getProperty("user.name") + " -c 'touch " + sThisFlowSkipfile + "'" )
        loggerNotice("")
    }


    /**
    * test if the skip file was created
    * @return : true if the skip file is present, set also bThisFlowDepResolved = true
    */
    Boolean searchForSkipfile() {
        Boolean bRet = false

        if ( DEBUG ) { System.err.println("\nplugin:executeStep:loop:new pass starting...") }

        if ( DepsHelper.timeFlowDaily_skipFileExists(logger, sThisFlowSkipfile ) ) {
            bThisFlowDepResolved = true
            bRet = true
        }

        if ( DEBUG ) { System.err.println("plugin:executeStep:loop:searchForSkipfile: skip file status : " + String.valueOf(bThisFlowDepResolved) ) }

        return bRet
    }


    /**
    * sleep for the default time and test if the total duration or the flow end time is reached
    * @return : true if one of the time limit was reached
    */
    Boolean loopSleepAndVerifyDurationLimit() {
        Boolean bRet = false
        // Wait
        if (DEBUG) { System.err.println("plugin:executeStep:loop:sleeping ...") }
        DepsHelper.timeFlowDaily_sleep( logger, nflowLoopSleepDurationFinal, nWaitSecJitter, dTimeFlowStarted)

        // activate if the flow ending limit or the max wait duration is reached
        // Use the job starting time, there are other existing parameters for the flow start/end time
        if ( DepsHelper.timeFlowDaily_limitReach( logger, dTimeFlowStarted, dTimeFlowDailyEnd, nPropMaxWaitSecFinal ) ) { bRet = true }

        return bRet
    }

    /**
    * verify at the end of the flow if force launch is activated and set the resolved status <br/>
    * then verify the resolved final status and throws a StepException if not resolved
    * @param sMsgForNoDepResolved : additional information to the abort message if the dependency was not resolved
    */
    void loopEndForceLaunchAndResolvedFinalTest(String sMsgForNoDepResolved) throws StepException {
        if ( bPropFlowForceLaunch && ! bThisFlowDepResolved ) {
            logFinishMessage("Timeout reached (" + DepsHelper.formatElapsedTime(nPropMaxWaitSecFinal, true) + ") or the flow ended AND forced execution active => success" )
            bThisFlowDepResolved = true
        }

        if ( ! bThisFlowDepResolved ) {
            throw new StepException(
                "Timeout reached and " + sMsgForNoDepResolved + " => abort\n(" + DepsHelper.dateNowPrettyPrint() + ")",
                PluginFailureReason.Timeout
            )
        }
    }


    /**
    * Show the final message (success or abort) with some extra informations
    * @param sFinalMessage : message to output, can be empty
    * @param bDecorate : (optional) boolean, add a line separator on the output if true
    */
    void logFinishMessage(String sFinalMessage) {
        logFinishMessage(sFinalMessage, true )
    }

    void logFinishMessage(String sFinalMessage, Boolean bDecorate) {
        if (sFinalMessage.trim().length() > 0) { loggerNotice(sFinalMessage) }
        loggerNotice("(" + DepsHelper.dateNowPrettyPrint() + ")" )
        if (bDecorate) { loggerNotice(DepsConstants.stdout_line_hash) }
    }


    /**
    * Show informations about a Job Execution Reference object due to multiples anomalies
    * (https://github.com/rundeck/rundeck/issues/9290)
    */
    void debug_ExecutionReferenceInfos(String sMessagePrefix, ExecutionReference oTargetJobExecRef) {
        // ref : https://javadoc.io/doc/org.rundeck/rundeck-core/latest/com/dtolabs/rundeck/core/execution/ExecutionReference.html
        // ref : https://github.com/rundeck/rundeck/blob/main/grails-rundeck-data-shared/src/main/groovy/rundeck/data/util/ExecutionDataUtil.groovy

        System.err.println(sMessagePrefix + "Job execution found : " +
            "[" + oTargetJobExecRef.getClass().getName() + "] " +
           "getId(" + oTargetJobExecRef.getId() + ")[" + oTargetJobExecRef.getId().getClass().getName() + "] -* " +
           // should not be "null" when the execution is still running
           "getStatus(" + oTargetJobExecRef.getStatus() + ")[" + oTargetJobExecRef.getStatus().getClass().getName() + "] -* " +
           "getOptions(" + oTargetJobExecRef.getOptions() + ")[" + oTargetJobExecRef.getOptions().getClass().getName() + "] -* " +
           "getTargetNodes(" + oTargetJobExecRef.getTargetNodes() + ")[" + oTargetJobExecRef.getTargetNodes().getClass().getName() + "] -* " +
           "getFilter(" + oTargetJobExecRef.getFilter() + ")[" + oTargetJobExecRef.getFilter().getClass().getName() + "] -* " +
           "getExecutionType(" + oTargetJobExecRef.getExecutionType() + ")[" + oTargetJobExecRef.getExecutionType().getClass().getName() + "] -* " +
           // should be "java.date" instead of "java.sql.Timestamp"
           "getDateStarted(" + oTargetJobExecRef.getDateStarted() + ")[" + oTargetJobExecRef.getDateStarted().getClass().getName() + "] -* " +
           // should be "java.date" instead of "null" when complete
           "getDateCompleted(" + oTargetJobExecRef.getDateCompleted() + ")[" + oTargetJobExecRef.getDateCompleted().getClass().getName() + "] -* " +
           "")
    }


    // #############################################################################################

    /*  DROPPED - check again when Rundeck implements the full "groovy-all" and not the basic flavor with only a gutted CliBuilder

    // The cli module is here for the extra parameters to keep the compatibility with the previous versions running as a shell script
    CliBuilderInternal oCli = null


    * initialize the supported cli parameters for this class
    * ref : https://docs.groovy-lang.org/latest/html/gapi/groovy/cli/internal/CliBuilderInternal.html
    * @return object oCli
    void cliParamInit() {
        // no override allowed
        if ( oCli ) { return }

        if ( DEBUG ) { System.err.println("plugin:cliParamInit:build cli list ...") }

        // the CliBuilder "aliases" property is not yet supported
        oCli = new CliBuilderInternal(name: PLUGIN_NAME).tap {
            debug(type: Boolean, defaultValue: false, "(optional) activate the debug mode.")
            force_launch("(optional) force the execution when the waiting time period or workflow end time is reached.")
            skip("('optional) skip all checks and exit immediatly with a success state. Used to unlock the job waiting for a dependency.")
            bypass(type: Boolean, defaultValue: false, "'optional) alias for skip")
            wait(type: Integer, args: 1, "(optional) maximum wait duration in seconds for a dependency, if the workflow end time is not reached. " +
                                         "Default is " + DepsConstants.flowTimeoutDurationSecString + " sec")
            maxwait(type: Integer, args: 1, "(optional) alias for wait")
            maxWait(type: Integer, args: 1, "(optional) alias for wait")
            startup_delay(type: Integer, args: 1, "(optional) Delay before starting to look for other jobs. Default is " + DepsConstants.flowStartupDelaySec + " sec")
            flow_daily_start(type: String, args: 1, "(optional) start time of the execution flow. Defaut : " + DepsConstants.flowDailyStartTime )
            flow_daily_end(type: String, args: 1, "(optional) end time of the execution flow. Defaut : " + DepsConstants.flowDailyEndTime )
            nodefilter_regex(type: String, args: 1, "(optional) specify the regex string if 'node_filtering' is set to 'regex'")
        }
        oCli.acceptLongOptionsWithSingleHyphen = true

        // not supported by groovy.cli.internal.CliBuilderInternal
        // oCli.setOptionsCaseInsensitive(true);
        // oCli.setSubcommandsCaseInsensitive(true);
    }
    */
}
