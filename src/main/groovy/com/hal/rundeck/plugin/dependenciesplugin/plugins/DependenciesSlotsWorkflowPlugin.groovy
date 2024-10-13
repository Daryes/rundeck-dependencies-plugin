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


// other
import java.util.HashMap;
import java.lang.System;


// extras
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.Collections;
import java.util.Iterator;
// required by com.dtolabs.rundeck.core.execution.ExecutionReference
import java.util.Date;
import com.dtolabs.rundeck.core.execution.ExecutionNotFound;


/**
* Module dependencies-wait_job - a Rundeck workflow plugin  <br />
* All variables or function calls using "this.<name>" are using the parent class elements.
*/
@Plugin(name = PLUGIN_NAME, service = ServiceNameConstants.WorkflowStep)
@PluginDescription(title = PLUGIN_TITLE, description = PLUGIN_DESCRIPTION)
class DependenciesSlotsWorkflowPlugin extends DependenciesWorkflowTemplate {

    public static final String PLUGIN_NAME = "dependencies-wait_slot"
    public static final String PLUGIN_TITLE = "Dependencies Workflow / wait / slot"
    public static final String PLUGIN_DESCRIPTION = "Limit job executions to a number of open slots and have other waiting their turn in a workflow."

    /*
    * Many problems in groovy to use constants in annotation with {} in the same class
    * declare value={...} with value=[ ... ] and might have to use protected instead of public
    * ref : https://issues.apache.org/jira/browse/GROOVY-5776
    * ref : https://issues.apache.org/jira/browse/GROOVY-3278
    * ref : https://docs.groovy-lang.org/3.0.17/html/documentation/#_java_style_array_initialization
    */

    // for an absurd reason Groovy casts the array [ "1", "2", ... "5"] as java.lang.object
    // => use directly static values in the annotation

    // Reference list of the slots per projects and the active jobs
    // structure is HashMap("project name", HashMap(slot number, (ArrayList("exec id number") ) ) )
    static HashMap<String,HashMap> aSlotsReference = Collections.synchronizedMap( new HashMap<>() )


    // #############################################################################################

    // ref: https://docs.rundeck.com/docs/developer/02-plugin-annotations.html#plugin-properties
    // all parameters here are of string type to stay compatible with the older plugin version which was a shell script

    @PluginProperty(
        name = "target_project",
        title = "Project",
        description = "The project name to apply the slot limit. Default to the current project.",
        defaultValue = '${job.project}',
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Slot definition") ])
    String sPropTargetProject;


    @PluginProperty(
        name = "target_slot",
        title = "Slot",
        description = "The slot number, which is the amount of job executions allowed to run simultaneously.  \nOther executions in the same slot will wait until one of those allowed is finished.",
        defaultValue = "1",
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Slot definition") ])
    @SelectValues(freeSelect = false, values = [ "1", "2", "3", "4", "5" ] )
    String sPropTargetSlot;


    // #############################################################################################

    /**
     * Plugin main method
     * @param context : execution informations
     * @param configuration : data
     * @throws StepException : possible errors
     */
    @Override
    void executeStep(final PluginStepContext context, final Map<String, Object> configuration) throws StepException {
        // information messages in the main loop
        Boolean bLoopOnetimeMsgSlotFull = false

        // init execution context variables
        this.initExecutionContext(PLUGIN_NAME, context)

        // show environment and known properties - only if debug is set in the class
        this.showEnvironmentAndProperties()

        // manage props values
        sPropTargetProject = sPropTargetProject.trim()
        sPropTargetSlot = sPropTargetSlot.trim()
        short nPropTargetSlot = Short.parseShort( sPropTargetSlot )


        // manage values from the extra parameters - command line behavior from the previous version
        // a value from the extra param has the priority over a UI value
        this.initParseCommandLine()
        this.initPropertiesFinalValueFromCmdLine()
        this.initPropertiesFinalValueFromCmdLineCleanup()


        // workflow starting and ending date/time calculation
        this.initWorkflowDateTimeSettings()


        // execution banner
        this.logBanner(PLUGIN_NAME)
        this.logger.log(2, "PROJECT:           '" + sPropTargetProject + "'")
        this.logger.log(2, "Slot number:       " + sPropTargetSlot)
        this.logger.log(2, "Forced on timeout: " + bPropFlowForceLaunch.toString() )

        this.logBannerBottomConfigInfo(configuration)

        initSlotReferenceForProject(sPropTargetProject, nPropTargetSlot)

        // check if -skip was provided on the command line
        if ( this.logSkipActivated() ) {
            // the execution must still be registered in the list
            synchronized ( aSlotsReference.get(sPropTargetProject).get(nPropTargetSlot) ) {
                aSlotsReference.get(sPropTargetProject).get(nPropTargetSlot).add( sThisExecutionId )
            }
            return
        }

        // alter slightly at random the sleep duration to prevent a possible lock of the jobs
        this.nWaitSecJitter = 5


        // Target job waiting sequence -------------------------------------------------

        // wait before starting anything to let the executions setting in
        this.sleepBeforeLoopAndSkipMsg()

        // loop until the max wait duration is reached or the dependency is resolved
        // "do...while <test>" does not exists in groovy
        while (true) {
            // search for the manually created skipfile
            // still have some work to do after the loop => break
            if ( this.loopFirstActionSearchForSkipfile() ) { break; }

            // validate the status of each execution referenced in the slot
            slotExecutionListValidateAllStatuses( this.oJobService, sPropTargetProject, nPropTargetSlot)

            // free spot available in the slot
            synchronized ( aSlotsReference.get(sPropTargetProject).get(nPropTargetSlot) ) {
                if ( aSlotsReference.get(sPropTargetProject).get(nPropTargetSlot).size() < nPropTargetSlot ) {
                    aSlotsReference.get(sPropTargetProject).get(nPropTargetSlot).add( sThisExecutionId )
                    this.logFinishMessage("Slot " + sPropTargetSlot + " : an empty spot is available => success")
                    this.bThisFlowDepResolved = true
                    break

                } else if (! bLoopOnetimeMsgSlotFull) {
                    this.logger.log(2, "Notice: Slot " + sPropTargetSlot + " has reached its capacity for the project '" + sPropTargetProject + "' - waiting ..." )
                    bLoopOnetimeMsgSlotFull = true
                }
            }
            
            // Wait and While conditions #######################################
            if ( this.loopSleepAndVerifyDurationLimit() ) { break; }
        }

        // verify the force launch and last test for the dependency state
        this.loopEndForceLaunchAndResolvedFinalTest("no opening available in the selected '" + sPropTargetSlot + "' slot limit")

        // registering this execution into the target slot
        if ( this.bThisFlowDepResolved ) {
            synchronized ( aSlotsReference.get(sPropTargetProject).get(nPropTargetSlot) ) {
                if ( ! aSlotsReference.get(sPropTargetProject).get(nPropTargetSlot).contains( sThisExecutionId ) ) {
                    aSlotsReference.get(sPropTargetProject).get(nPropTargetSlot).add( sThisExecutionId )
                }
            }
        }
    }


    // #############################################################################################


    /**
    * add to the slot reference variable the current project structure if missing
    */
    private void initSlotReferenceForProject( String sProjectName, short nSlotNumber ) {
        if (DEBUG) { System.err.println("plugin:initSlotReferenceForProject: project '" + sProjectName + "' with slot " + String.valueOf( nSlotNumber ) + " ...") }

        synchronized ( aSlotsReference ) {
            if ( ! aSlotsReference.containsKey( sProjectName ) ) {
                aSlotsReference.put( sProjectName, Collections.synchronizedMap( new HashMap<short,ArrayList>() ) )
            }
        }

        synchronized ( aSlotsReference.get( sProjectName ) ) {
            if ( ! aSlotsReference.get( sProjectName ).containsKey( nSlotNumber ) ) {
                aSlotsReference.get( sProjectName ).put( nSlotNumber, Collections.synchronizedList( new ArrayList<String>() ) )
            }
        }
    }

    /**
    * find a job's execution from its project and id
    * ref: https://javadoc.io/static/org.rundeck/rundeck-core/5.0.1-20240115/com/dtolabs/rundeck/core/jobs/JobService.html
    * @param oJobSvc : the current JobService
    * @param sTargetProjectName : target project name
    * @param sTargetJobId : target execution ID
    * @return : the execution definition as object
    */
    private ExecutionReference rdJob_GetObjFromExecId(JobService oJobSvc, String sTargetProjectName, String sTargetExecId) {
        if (DEBUG) { System.err.println("plugin:rdJob_GetObjFromExecId: search for '" + sTargetExecId + "' in '" + sTargetProjectName +"'  ...") }

        try {
            return oJobSvc.executionForId(sTargetExecId, sTargetProjectName);
        }
        catch (ExecutionNotFound e) {
            if (DEBUG) { System.err.println("plugin:rdJob_GetObjFromExecId: target execution '" + sTargetExecId + "' was not found in the project '" + sTargetProjectName + "' => recovering ...") }
            return null;
        }
    }


    /**
    * Loop over each execution and validate their statuses
    * and remove them from the reference list if they are not running anymore
    * ref: https://javadoc.io/static/org.rundeck/rundeck-core/5.0.1-20240115/com/dtolabs/rundeck/core/execution/ExecutionReference.html
    * @TODO add a stand alone timer doing the cleaning
    * @param oJobSvc : the current JobService
    * @param sTargetProject : target project name
    * @param nTargetSlot : target slot number
    */
    private void slotExecutionListValidateAllStatuses(JobService oJobSvc, String sTargetProject, short nTargetSlot) {
        ExecutionReference oTargetJobExec
        ArrayList<String> aLstToRemove = new ArrayList<String>()

        // not working : a copy is made, instead of a direct reference to the slot array => keep using the full path
        // ArrayList<String> aTemp = aSlotsReference.get(sTargetProject).get(nTargetSlot)

        if (DEBUG) {
            System.err.println("plugin:slotExecutionListValidateAllStatuses: project " + sTargetProject + " / slot '" + String.valueOf(nTargetSlot) + "' ..." )
            System.err.println("plugin:slotExecutionListValidateAllStatuses: number of execution in the slot before validation : " +
                                aSlotsReference.get(sTargetProject).get(nTargetSlot).size().toString() )
        }

        // synchronize is required for a thread safe list/map
        synchronized ( aSlotsReference.get(sTargetProject).get(nTargetSlot) ) {
            if (aSlotsReference.get(sTargetProject).get(nTargetSlot).size() == 0 ) { return }

            // loop and remove all finished executions
            // as the remove and the loop are applied over the same object, this must be splitted in 2 times using an intermediate variable
            for (String sTargetExecId : aSlotsReference.get(sTargetProject).get(nTargetSlot) ) {
                if (DEBUG) { System.err.println("plugin:slotExecutionListValidateAllStatuses:loop: validate execution '" + sTargetExecId + "' ..." ) }

                oTargetJobExec =  rdJob_GetObjFromExecId( oJobSvc, sTargetProject, sTargetExecId)

                // if() splitted due to the debug messages
                if ( ! oTargetJobExec ) {
                    if (DEBUG) { System.err.println("plugin:slotExecutionListValidateAllStatuses:loop: execution " + sTargetExecId + " not found - removing") }
                    aLstToRemove.add( sTargetExecId )
                    continue
                }

                // shouldn't be required, but many properties can be with inappropriate types or values or even null in some cases
                if (DEBUG) { this.debug_ExecutionReferenceInfos("plugin:rdJob_GetObjFromExecId: ", oTargetJobExec) }

                if (DEBUG) { System.err.println("plugin:slotExecutionListValidateAllStatuses:loop: execution '" + sTargetExecId + "' with status '" + oTargetJobExec.getStatus() + "' found") }

                // ExecutionReference.getStatus() can be null when the state is "running" ... don't ask
                if ( oTargetJobExec.getStatus() && oTargetJobExec.getStatus().equalsIgnoreCase( String.valueOf(ExecutionState.RUNNING) ) == false ) {
                    if (DEBUG) { System.err.println("plugin:slotExecutionListValidateAllStatuses:loop: execution '" + sTargetExecId + "' is finished - removing") }
                    aLstToRemove.add( sTargetExecId )
                }
            }

            if (aLstToRemove.size() > 0) {
                if (DEBUG) { System.err.println("plugin:slotExecutionListValidateAllStatuses:toRemove: applying the removal ...") }
                try {
                    aSlotsReference.get(sTargetProject).get(nTargetSlot).removeAll( aLstToRemove )
                }
                catch (Exception e) {
                    System.err.println("plugin:slotExecutionListValidateAllStatuses:toRemove:Exception thrown : " + e)
                    throw e
                }
            }
        }

        if (DEBUG) { System.err.println("plugin:slotExecutionListValidateAllStatuses: remaining number of executions after validation : " +
                                        aSlotsReference.get(sTargetProject).get(nTargetSlot).size().toString() ) }

        oTargetJobExec = aLstToRemove = null
    }


    /**
    * @TODO : add support for global slots onver all projects

    * find all running executions
    * ref: https://javadoc.io/static/org.rundeck/rundeck-core/5.0.1-20240115/com/dtolabs/rundeck/core/jobs/JobService.html
    * @param oJobSvc : the current JobService
    * @param sTargetProjectName : target project name
    * @return : list of the execution definition

    private def rdJob_GetAllRunningExecutions(JobService oJobSvc, String sTargetProjectName) {
        if (DEBUG) { System.err.println("plugin:rdJob_GetAllRunningExecutions: search in project '" + sTargetProjectName +"'  ...") }

        // given executionForId() requiring a project name => go for queryExecutions()


        // JobService.queryExecutions() is a wrapper for authJobService.queryExecutions()
        // Results are of type : java.util.LinkedHashMap$Entry[ result: List<Execution>, total: int]
        // ref: rundeckapp/grails-app/services/rundeck/services/JobStateService.groovy
        def oQueryResult
        if ( sTargetProjectName.length() == 0 || sTargetProjectName.equalsIgnoreCase("*") ) {
            oQueryResult = oJobSvc.queryExecutions( [statusFilter: ExecutionState.RUNNING, jobonly: true, offset: 0, max: 0] )
        } else {
            oQueryResult = oJobSvc.queryExecutions( [projFilter: sTargetProjectName, statusFilter: ExecutionState.RUNNING, jobonly: true, offset: 0, max: 0] )
        }

        if (DEBUG) { System.err.println("plugin:rdJob_GetAllRunningExecutions: search result total : " + String.valueOf(oQueryResult.total) ) }

        if (oQueryResult.total == 0) { return null; }
        return oQueryResult.result;
    }
    */
}
