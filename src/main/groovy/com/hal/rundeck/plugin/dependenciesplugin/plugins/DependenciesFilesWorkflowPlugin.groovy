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


/**
* Module dependencies-wait_file - a Rundeck workflow plugin  <br />
* All variables or function calls using "this.<name>" are using the parent class elements.
*/
@Plugin(name = PLUGIN_NAME, service = ServiceNameConstants.WorkflowStep)
@PluginDescription(title = PLUGIN_TITLE, description = PLUGIN_DESCRIPTION)
class DependenciesFilesWorkflowPlugin extends DependenciesWorkflowTemplate {

    public static final String PLUGIN_NAME = "dependencies-wait_file"
    public static final String PLUGIN_TITLE = "Dependencies Workflow / wait / file"
    public static final String PLUGIN_DESCRIPTION = "Wait for a file in a given directory on or from the Rundeck server."

    /**
    * Many problems to use constants in annotation with {} in the same class
    * declare value={...} with value=[ ... ] and might have to use protected instead of public
    * ref : https://issues.apache.org/jira/browse/GROOVY-5776
    * ref : https://issues.apache.org/jira/browse/GROOVY-3278
    * ref : https://docs.groovy-lang.org/3.0.17/html/documentation/#_java_style_array_initialization
    **/

    protected static final String JOBDEPS_PROP_FLAG_YES = "yes"
    protected static final String JOBDEPS_PROP_FLAG_NO = "no"
    protected static final String JOBDEPS_PROP_FLAG_YES_OLD = "flag"
    protected static final String JOBDEPS_PROP_FLAG_NO_OLD = "noflag"

    protected static final String JOBDEPS_PROP_HOST_LOCAL = "local"
    protected static final String JOBDEPS_PROP_HOST_LOCALHOST = "localhost"


    // #############################################################################################

    // ref: https://docs.rundeck.com/docs/developer/02-plugin-annotations.html#plugin-properties
    // all parameters here are of string type to stay compatible with the older plugin version which was a shell script

    @PluginProperty(
        name = "target_host",
        title = "Host name",
        description = "The host where the expected file will be located.  \n" +
          "Use `local` or `localhost` for the Rundeck server containing the expected file.  \n" +
          "For a remote location on a different host through ssh, use either `my-remote.server.name` (the default Rundeck user will be applied) or `user@server.domain.tld` for a specific user.  \n" +
          "In both case, the rundeck user public key must be allowed on the remote host.  \n" +
          "Please note Rundeck configuration might not allow a remote connection out of the box, as this plugin is unable to make use of the integrated vault.",
        defaultValue = 'localhost',
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Target file definition") ])
    String sPropTargetHost;


    @PluginProperty(
        name = "target_directory",
        title = "Directory",
        description = "The directory containing the expected file, either a local filesystem or a NFS mount point.",
        defaultValue = '',
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Target file definition") ])
    String sPropTargetDirectory;


    @PluginProperty(
        name = "target_file",
        title = "Filename",
        description = "the filename to search (* and ? are supported)",
        defaultValue = "",
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Target file definition") ])
    String sPropTargetFile;


    // was a string in the v1.x series
    @PluginProperty(
        name = "flag_type",
        title = "Flag file",
        description = "Companion file 'name.ext.flag' along the targeted file 'name.ext'.  \n" +
          "Usefull for large file transfer, as it will ensure the file is complete before being processed.  \n" +
          "The flag file can be empty or contains a hash (md5, sha1 to 512 are supported).  \n" +
          "If the flag is a single file for multiple transfered files, disable the 'flag' setting and change the 'Filename' setting to target this single file instead.",
        defaultValue = "true",
        required = true
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Target file flag") ])
    Boolean bPropTargetHasFlag;


    @PluginProperty(
        name = "flag_ext",
        title = "Flag extension",
        description = "The flag filename extension. The setting is ignored if the flag file setting is not activated.  \n" +
            "Example: for a file named 'my_own_file.ext_flag', use '_flag'.",
        defaultValue = ".flag",
        required = false
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Target file flag") ])
    String sPropTargetFlagExt;


    @PluginProperty(
        name = "flag_verify_hash",
        title = "Use flag hash to validate the file",
        description = "It is expected the flag file is either empty or contains a hash of the received file to verify its validity.  \n" +
            "The setting is ignored if using a flag is not checked.  \n" +
            "Set this to false when a flag file is not empty but the content must be ignored, to skip the hash validation.  \n" +
            "Empty lines and comments in the flag file are allowed, full line only, starting with : # or ; or //  \n" +
            "Please note only a single hash is expected.",
        defaultValue = "false",
        required = false
    )
    @RenderingOptions([ @RenderingOption(key = GROUP_NAME, value = "Target file flag") ])
    Boolean bPropTargetFlagVerifyHash;


    // #############################################################################################

    /**
     * Plugin main method
     * @param context : execution informations
     * @param configuration : data
     * @throws StepException : possible errors
     */
    @Override
    void executeStep(final PluginStepContext context, final Map<String, Object> configuration) throws StepException {
        // ref: https://github.com/rundeck-plugins/job-state-plugin/blob/master/src/main/java/org/rundeck/plugin/jobstate/JobStateWorkflowStep.java
        // ref: https://javadoc.io/doc/org.rundeck/rundeck-core/latest/index.html

        HashMap<short,String> HASH_CMD_LIST = new HashMap<>()
        HASH_CMD_LIST.put(5, "sum -r")       // BSD algorithm
        HASH_CMD_LIST.put(9, "cksum")        // CRC
        HASH_CMD_LIST.put(32, "md5sum")
        HASH_CMD_LIST.put(40, "sha1sum")
        HASH_CMD_LIST.put(56, "sha224sum")
        HASH_CMD_LIST.put(64, "sha256sum")
        HASH_CMD_LIST.put(96, "sha384sum")
        HASH_CMD_LIST.put(128, "sha512sum")

        final String SSH_CMD_BASE = "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=QUIET"

        String sCmdOutputFile
        String sCmdOutputFlag
        String sCmdFlagContent
        String sFlagBinary = ""
        String sFileHash

        String sTargetHostConnect = ""
        String sTargetHostMsg = ""

        // init execution context variables
        this.initExecutionContext(PLUGIN_NAME, context)

        // show environment and known properties - only if debug is set in the class
        this.showEnvironmentAndProperties()

        // manage props values
        String sTargetFlagFilename = "n/a"
        if (bPropTargetHasFlag) { sTargetFlagFilename = sPropTargetFile + sPropTargetFlagExt }

        if (sPropTargetHost.trim().length() == 0) {
            throw new StepException(
                "Error: the target hostname cannot be empty => abort\n(" + DepsHelper.dateNowPrettyPrint() + ")",
                PluginFailureReason.ConfigurationFailure
            )
        }


        // manage values from the extra parameters - command line behavior from the previous version
        // a value from the extra param has the priority over a UI value
        this.initParseCommandLine()
        this.initPropertiesFinalValueFromCmdLine()
        this.initPropertiesFinalValueFromCmdLineCleanup()


        // workflow starting and ending date/time calculation
        this.initWorkflowDateTimeSettings()


        // execution banner
        this.logBanner(PLUGIN_NAME)
        this.logger.log(2, "Host:              '" + sPropTargetHost + "'")
        this.logger.log(2, "Directory:         '" + sPropTargetDirectory + "'")
        this.logger.log(2, "File:              '" + sPropTargetFile + "'")
        if (bPropTargetHasFlag) {
            this.logger.log(2, "Flag file:         '" + sTargetFlagFilename + "'")
            this.logger.log(2, "Validate hash:     " + bPropTargetFlagVerifyHash.toString() )
        }
        this.logger.log(2, "Forced on timeout: " + this.bPropFlowForceLaunch.toString() )

        this.logBannerBottomConfigInfo(configuration)

        // check if -skip was provided on the command line
        if ( this.logSkipActivated() ) { return }


        // disable the slight pause before starting the loop
        this.nStartDelaySleepSec = 0

        // update the configuration for a remote host
        if (sPropTargetHost.toLowerCase() != JOBDEPS_PROP_HOST_LOCAL &&  sPropTargetHost.toLowerCase() != JOBDEPS_PROP_HOST_LOCALHOST) {
            sTargetHostConnect = SSH_CMD_BASE + " " + sPropTargetHost + " -- "
            sTargetHostMsg = "on " + sPropTargetHost + " "

            // increase the sleep duration for remote usage
            this.nflowLoopSleepDurationFinal = this.nflowLoopSleepSlowerDurationFinal
        }

        // validate the access and find command presence - output is unused as an error wll be raised if it does not work
        this.logger.log(2, "Validating shell access " + sTargetHostMsg + "..." )
        DepsHelper.shellExec( sTargetHostConnect + " command -v find" )


        // Target file waiting sequence ------------------------------------------------

        // wait before starting anything to let the executions setting in
        this.sleepBeforeLoopAndSkipMsg()

        // loop until the max wait duration is reached or the dependency is resolved
        // "do...while <test>" does not exists in groovy
        while (true) {
            // search for the manually created skipfile
            // nothing to do after exiting the loop => exit completely
            if ( this.loopFirstActionSearchForSkipfile() ) { return ; }


            // File execution status
            sCmdOutputFile = DepsHelper.shellExec( sTargetHostConnect + " find '" + sPropTargetDirectory + "' -maxdepth 1 -name '" + sPropTargetFile + "' -type f 2>/dev/null" )

            if ( sCmdOutputFile.length() > 0 ) {
                // flag is requested, wait for it
                if (bPropTargetHasFlag) {
                    this.logger.log(2, "Target file found " + sTargetHostMsg + ": '" + sCmdOutputFile + "' - looking for flag file ...")
                    sCmdOutputFlag = DepsHelper.shellExec( sTargetHostConnect + " find '" + sPropTargetDirectory + "' -maxdepth 1 -name '" + sTargetFlagFilename + "' -type f 2>/dev/null" )

                    if ( sCmdOutputFlag.length() > 0 ) {
                        this.logger.log(2, "Target flag found " + sTargetHostMsg + ": '" + sCmdOutputFlag + "' - validation ...")
                        this.bThisFlowDepResolved = true
                        break
                    }

                // flag is not used  => exit
                } else {
                    this.logFinishMessage("Target file found " + sTargetHostMsg + ": '" + sCmdOutputFile + "' => success")
                    this.bThisFlowDepResolved = true
                    break
                }
            }


            // Wait and While conditions #######################################
            if ( this.loopSleepAndVerifyDurationLimit() ) { break; }
        }


        if ( this.bThisFlowDepResolved && bPropTargetHasFlag) {
            this.logger.log(2, "")

            if ( ! bPropTargetFlagVerifyHash ) {
                this.logFinishMessage("Usage of the flag file content is not active, the received file will not be validated => success")

            // verifiy the file with the flag content
            } else {
                try {
                    sCmdFlagContent = DepsHelper.shellExec( sTargetHostConnect + " cat " + sCmdOutputFlag )

                } catch (Exception e) {
                    System.err.println("Error: couldn't read the file " + sTargetHostMsg + ": '" + sCmdOutputFlag + "'")
                    throw e
                }

                // clean up the content from unwanted spaces and comments
                // a hash file can contain both the hash and the filename, separated by a blank
                sCmdFlagContent = sCmdFlagContent
                                .trim()
                                .replaceAll("^ *(#|;|//).*", "")        // remove comments : # or ; or //
                                .replaceAll('(?m)^\\s*\\r?\\n', "")     // remove blank or empty lines
                                .replaceAll("\\s+", " ")                // replace all multiple spaces and tabs with a single space
                sCmdFlagContent = sCmdFlagContent.split(' ')[0]


                if (sCmdFlagContent.length() < 3) {
                    this.logFinishMessage("The received flag file has no usable content, this will be ignored => success")

                } else {
                    this.logger.log(2, "Processing hash found in '" + sCmdOutputFlag + "' ...")

                    if ( ! HASH_CMD_LIST.containsKey( sCmdFlagContent.length() ) ) {
                        System.err.println("plugin:loop:hash: no hash method suitable for the extracted hash with " + sCmdFlagContent.length().toString() +
                                            " characters long and the value : " + sCmdFlagContent)
                        throw new StepException(
                            "Error: no hash method suitable for the given hash size => abort\n(" + DepsHelper.dateNowPrettyPrint() + ")",
                            PluginFailureReason.FilesHashesFormatUnknown
                        );
                    }

                    sFlagBinary = HASH_CMD_LIST.get( sCmdFlagContent.length() )

                    this.logger.log(2, "Related binary detected for hash verification : " + sFlagBinary )

                    try {
                        sFileHash = DepsHelper.shellExec( sTargetHostConnect + " " + sFlagBinary + " " + sCmdOutputFlag )
                    } catch (Exception e) {
                        System.err.println("Error: could not validate the file " + sTargetHostMsg + ": '" + sCmdOutputFlag + "'")
                        System.err.println("with the received hash : " + sCmdFlagContent)
                        throw e
                    }

                    sFileHash = sFileHash.split(" ")[0]

                    if (! sCmdFlagContent.compareToIgnoreCase( sFileHash ) ) {
                        System.err.println("plugin:loop:hash:comparison invalid")
                        throw new StepException(
                            "Error: the hash in the flag file doesn't match with the received file => abort\n(" + DepsHelper.dateNowPrettyPrint() + ")\n" +
                            "  calculated hash with " + sFlagBinary + " : " + sFileHash + "\n" +
                            "  hash in the flag file : " + sCmdFlagContent,
                            PluginFailureReason.FilesHashesNotMatching
                        );
                    }

                    this.logFinishMessage("Target file hash is valid: " + sCmdFlagContent + " => success")
                }
            }
        }


        // verify the force launch and last test for the dependency state
        this.loopEndForceLaunchAndResolvedFinalTest("no file found " + sTargetHostMsg + ": '" + sPropTargetFile + "'")
    }
}
