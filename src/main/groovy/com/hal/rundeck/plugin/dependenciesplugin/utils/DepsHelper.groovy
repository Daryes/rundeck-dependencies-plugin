package com.hal.rundeck.plugin.dependenciesplugin;

// External packages or modules dependencies
import org.rundeck.storage.api.PathUtil
import org.rundeck.storage.api.StorageException
import com.dtolabs.rundeck.core.storage.ResourceMeta
import com.dtolabs.rundeck.plugins.step.PluginStepContext
import com.dtolabs.rundeck.core.execution.workflow.steps.FailureReason;
import com.dtolabs.rundeck.core.execution.workflow.steps.StepException;
import com.dtolabs.rundeck.core.execution.workflow.steps.StepFailureReason;
import com.dtolabs.rundeck.core.execution.ExecutionListener

import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.TimeZone

import java.util.HashMap;

import java.io.File;

import java.lang.ProcessBuilder;


/**
* Bunch of functions and methods common to the Dependencies plugins
*/
class DepsHelper {

    // ref  J8: https://docs.oracle.com/javase/8/docs/api/java/time/ZonedDateTime.html
    // ref  J8: https://docs.oracle.com/javase/8/docs/api/java/time/format/DateTimeFormatter.html
    // ref J11: https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/time/ZonedDateTime.html

    // Generic functions ---------------------------------------------------------------------------

    /**
    * wait for xxx ms with a minimum of 1s - thread blocking
    * @param nDelayMs : time to sleep in milliseconds
    */
    static void waiting(Long nDelayMs) {
        if ( nDelayMs < 1000 ) { nDelayMs = 1000 }

        try {
            Thread.sleep(nDelayMs);
        }
        catch (InterruptedException e) {
            System.err.println("DepsHelper:wait:" + e + ". Probably due to a timeout.")

            // ref : https://www.javaspecialists.eu/archive/Issue056-Shutting-down-Threads-Cleanly.html
            // the exception can be raised by java from another thread, if not catched it will go up in remaining threads
            // Given raising the exception clear the interrupt flag it must be set again
            Thread.currentThread().interrupt();
            throw new RuntimeException("Unexpected interrupt", e);
        }
    }


    /**
    * return the system hostname using the environment
    * @return string : hostname
    */
    static String getHostname() {
        if ( System.getProperty("os.name").toLowerCase().contains("windows") ) {
            return System.getenv("COMPUTERNAME")
        }
        // getenv("HOSTNAME") in java process return null
        return DepsHelper.shellExec("hostname")
    }


    /**
    * Launch command executed in a bash shell ( bash -c "..." ) <br/>
    * Able to accept multiples commands in a single string
    * @param sCommand : command(s) to execute, it can be a single command or a chain, like "cmd1 ; cmd2 -arg && ..."
    * @param bPrintCmdOutputOnStd : set to true to print on the stdout console the execution output
    * @return string : the command output
    */
    static String shellExec(String sCommand, Boolean bPrintCmdOutputOnStd = false) throws IOException {
        String sRet
        int nExitValue = 0
        StringBuilder oCmdOutput = new StringBuilder()

        String sSystemShell = System.getenv("SHELL")
        if (! sSystemShell || sSystemShell.length() == 0 ) { sSystemShell = DepsConstants.shellInterpreterDefault }

        String[] aCmd = [ sSystemShell, "-c", sCommand ]
        
        // Using Runtime.getRuntime().exec(...) has been deprecated with Java 18
        // ref : https://docs.oracle.com/javase/8/docs/api/java/lang/ProcessBuilder.html
        ProcessBuilder oProcessBuild = new ProcessBuilder();

        try {
            oProcessBuild.command(aCmd)
            Process oProcess = oProcessBuild.start()
            nExitValue = oProcess.waitFor()

            BufferedReader oBuffer = new BufferedReader(new InputStreamReader( oProcess.getInputStream() ))

            String sStock = ""
            while ( (sStock = oBuffer.readLine()) != null) {
                oCmdOutput.append(sStock)
                if ( bPrintCmdOutputOnStd ) { System.err.println(sStock) }
            }
            if ( nExitValue != 0 ) {
                throw new java.lang.UnsupportedOperationException("The process terminated with an error : " + String.valueOf(nExitValue) )
            }

            sRet = oCmdOutput.toString()

            oBuffer.close()

            // must be cleaned in the try{}
            sStock = oBuffer = oProcess = null

        } catch (Exception e) {
            System.err.println("Error: the following command failed : " + sCommand)
            throw e
        }

        oCmdOutput = oProcessBuild = aCmd = sSystemShell = null

        return sRet;
    }


    // Custom parameter as command line style function ---------------------------------------------

    /**
    * return the parsed command line arguments <br/>
    * some required parameters might be specific to one plugin or another
    * @param sCmdArgs : full command line argument list in a single string
    * @return Object : HashMap of the detected arguments and their values
    * @throws StepException or Exception
    */
    static Map cliParamParse(String sCmdArgs) {
        String[] aData
        Map oRet = new HashMap<>()

        // Too much unstability between the gutted CliBuilder in groovy basic and the apache commons.cli => v1.0 <= from rundeck
        // write a basic cmdline interpreter instead
        // if ( ! oCli ) { cliParamInit() }


        if ( sCmdArgs.contains("-debug") ) { System.err.println("DepsHelper:cliParamParse:parsing command line with value : " + sCmdArgs) }

        // very basic interpreter
        aData = sCmdArgs.split(" ")

        for (Integer i = 0 ; i < aData.length; i++) {
            // allow both "-arg" and "--arg"
            if ( aData[i].startsWith("--") ) { aData[i] = aData[i].replaceFirst("--", "-") }
            if ( sCmdArgs.contains("-debug") ) { System.err.println("DepsHelper:cliParamParse: param " + aData[i]) }

            try {
                switch( aData[i].toLowerCase() ) {
                    case "-debug":
                    case "-d":
                        if ( ! oRet.containsKey("debug") ) { oRet.put("debug", true) }
                        break;

                    case "-force":
                    case "-forced":
                    case "-force_launch":
                    case "-forced_launch":
                        if ( ! oRet.containsKey("force_launch") ) { oRet.put("force_launch", true) }
                        break;

                    case "-skip":
                    case "-bypass":
                        if ( ! oRet.containsKey("skip") ) { oRet.put("skip", true) }
                        break;

                    case "-wait":
                    case "-maxwait":
                    case "-max_wait":
                        i++
                        oRet.put("wait", Integer.parseInt( aData[i] ) )
                        break;

                    case "-startup_delay":
                        i++
                        oRet.put("startup_delay", Short.parseShort( aData[i] ) )
                        break;

                    case "-sleep_duration":
                        i++
                        oRet.put("sleep_duration", Short.parseShort( aData[i] ) )
                        break;

                    case "-sleep_slower_duration":
                        i++
                        oRet.put("sleep_slower_duration", Short.parseShort( aData[i] ) )
                        break;

                    case "-flow_daily_start":
                        i++
                        oRet.put("flow_daily_start", aData[i].trim() )
                        break;

                    case "-flow_daily_end":
                        i++
                        oRet.put("flow_daily_end", aData[i].trim() )
                        break;

                    case "-nodefilter_regex":
                        i++
                        oRet.put("nodefilter_regex", aData[i].trim() )
                        break;

                    default:
                        // rundeck can pass additionals spaces as args
                        if ( aData[i].trim() == "" ) { continue; }
                        // rundeck issue #8509 - sending the variable name as-is when empty instead of an empty string
                        if ( aData[i].trim() == '\${option.DEPENDENCY_EXTRA_PARAMS}' ) { continue; }

                        throw new StepException(
                            "DepsHelper:cliParamParse:Error - Unknown parameter : " + aData[i],
                            PluginFailureReason.ConfigurationExtraArgsFailure
                        )
                        // break; <= implicit with throw
                }
            } catch (Exception e) {
                System.err.println("DepsHelper:cliParamParse:Error parsing or converting the value : " + aData[i] )
                throw e
            }
        }

        if ( oRet.containsKey("debug") ) { System.err.println("DepsHelper:cliParamParse:parsed command line object : " + oRet ) }

        aData = null

        return oRet
    }

    // Workflow start and end time and other date manipulation -------------------------------------

    /**
    * return the current date/time as a formatted string in ISO format
    */
    static String dateNowPrettyPrint() {
        return ZonedDateTime.now().format( DateTimeFormatter.ISO_OFFSET_DATE_TIME )
    }

    /**
    * Provide a short number for increasing time with a random jitter duration
    * @param nSleepJitterTimeSec : maximum jitter duration
    * @return integer: duration between 0 and the maximum jitter duration - it will always be 0 if jitter <= 1
    */
    static Integer timeJitterSec(final short nSleepJitterTimeSec) {
        Integer nJitterDelaySec = 0

        // add some randomness
        if ( nSleepJitterTimeSec > 1 ) {
            nJitterDelaySec = (Integer)(Math.random() * nSleepJitterTimeSec + 1 - (nSleepJitterTimeSec/2) );
        }
        return nJitterDelaySec
    }


    /**
    * get the flow pivot time from the string definition
    * @param  sFlowDailyRefTime : starting/ending time of the flow in format "hh:mm:ss"
    * @return array : time in [hh, mm, ss]
    */
    static Integer[] timeFlowDaily_TimeRef_Split(String sFlowDailyRefTime) {
        String[] sRefTime = sFlowDailyRefTime.split(":")
        Integer[] nRet = new int[sRefTime.length]

        try {
            for (int i = 0; i < sRefTime.length; i++) {
                nRet[i] = Integer.parseInt( sRefTime[i].trim() )
            }
            sRefTime = null
            
        } catch (NumberFormatException e) {
            System.err.println("DepsHelper:timeFlowDaily_TimeRef_Split: badly formatted data, expected 'number', received " + e.getMessage() + " (full data is : '" + sFlowDailyRefTime + "' )" )
            throw e
        }

        return nRet
    }


    /**
    * Today date set to the flow pivot time for starting/ending calculations
    * @see DepsHelper.timeFlowDaily_TimeRef_Split()
    * @param  dNow : current date/time
    * @param  sFlowDailyLimitTime : starting or ending time "hh:mm:ss"
    * @return date/time : set to today flow's starting or ending time
    */
    static ZonedDateTime timeFlowDaily_limitTodayPivot(ZonedDateTime dNow, String sFlowDailyLimitTime) {
        Integer[] nTimePivot = DepsHelper.timeFlowDaily_TimeRef_Split(sFlowDailyLimitTime)

        ZonedDateTime dTodayLimit = dNow
                                    .withHour(   nTimePivot[0] )
                                    .withMinute( nTimePivot[1] )
                                    .withSecond( nTimePivot[2] )
                                    .withNano(0);
        nTimePivot = null

        return dTodayLimit
    }


    /**
    * Compute the real day and time of the flow starting time
    * @see DepsHelper.timeFlowDaily_TimeRef_Split() and DepsHelper.timeFlowDaily_limitTodayPivot()
    * @param  dNow : current date/time
    * @param  sFlowTimeRefStart : starting time "hh:mm:ss" of the flow
    * @return date/time : starting time
    */
    static ZonedDateTime timeFlowDaily_start(ZonedDateTime dNow, String sFlowTimeRefStart) {
        Integer[] nTimeStart = timeFlowDaily_TimeRef_Split( sFlowTimeRefStart )

        ZonedDateTime dDateCalc = dNow
            .withHour(   nTimeStart[0] )
            .withMinute( nTimeStart[1] )
            .withSecond( nTimeStart[2] )
            .withNano(0);
        nTimeStart = null

        // Current workflow is before today pivot = yesterday boundary start
        if ( dNow.isBefore( DepsHelper.timeFlowDaily_limitTodayPivot(dNow, sFlowTimeRefStart) ) ) {
            dDateCalc = dDateCalc.minusDays(1);
        }

        return dDateCalc
    }


    /**
    * Compute the real day and time of the flow ending time
    * @see DepsHelper.timeFlowDaily_limitTodayPivot()
    * @param  dNow : current date/time
    * @param  sFlowTimeRefEnd : ending time "hh:mm:ss" of the flow
    * @return date/time : ending time
    */
    static ZonedDateTime timeFlowDaily_end(ZonedDateTime dNow, String sFlowTimeRefEnd) {
        Integer[] nTimeEnd = DepsHelper.timeFlowDaily_TimeRef_Split( sFlowTimeRefEnd )

        ZonedDateTime dDateCalc = dNow
            .withHour(   nTimeEnd[0] )
            .withMinute( nTimeEnd[1] )
            .withSecond( nTimeEnd[2] )
            .withNano(0);
        nTimeEnd = null

        // Current workflow is after today pivot => the flow has just started and will end at day+1
        if ( dNow.isAfter( DepsHelper.timeFlowDaily_limitTodayPivot(dNow, sFlowTimeRefEnd) ) ) {
            dDateCalc = dDateCalc.plusDays(1);
        }

        return dDateCalc
    }


    /**
    * format a duration in sec to "??h??m??s"
    * @param nDurationInSec : number duration in seconds to format
    * @param bRemoveLeadingZero : remove any "0h" or "0h00m" present in the formated result
    * @param sFormatToUSe : (optional) printf format to use - default to "%dh%02dm%02ds" for "?h??m??s"
    * @return string : formatted time duration
    */
    static String formatElapsedTime(Integer nDurationInSec, Boolean bRemoveLeadingZero = false, String sFormatToUSe = DepsConstants.timeDurationFormatHMS ) {
        // Groovy returns a decimal value when using "x / y" , use x.intdiv(y) instead for an integer value
        String sRet = String.format(sFormatToUSe,
                        nDurationInSec.intdiv(3600),
                        (nDurationInSec % 3600).intdiv(60),
                        (nDurationInSec % 60)
                    );

        if (bRemoveLeadingZero) { sRet = sRet.replaceAll("^0h(00m)?", "") }

        sFormatToUSe = null

        return sRet
    }

    // Workflow messages and other functions -------------------------------------------------------


    /**
    * wait for the desired duration and print a message after each hour
    * @param oLogger : log object
    * @param nSleepDurationTimeSec : Sleep duration time, in seconds
    * @param dStartDateTime : flow start date/time
    */
    static void timeFlowDaily_sleep(final ExecutionListener oLogger, final short nSleepDurationTimeSec, final short nSleepJitterTimeSec, final ZonedDateTime dStartDateTime) {
        // wait expect a time in milliseconds
        DepsHelper.waiting( (nSleepDurationTimeSec + DepsHelper.timeJitterSec(nSleepJitterTimeSec) ) * 1000 )

        Integer nElapsedTimeInSec = ZonedDateTime.now().toEpochSecond() - dStartDateTime.toEpochSecond()

        // print an information message each waiting hour
        if ( nElapsedTimeInSec > 60 && ( nElapsedTimeInSec % 3600 ) <= nSleepDurationTimeSec ) {
            // groovy automatically switch to BigDecimal for a math operation => use .round()
            oLogger.log(2, "Still waiting after " + ( nElapsedTimeInSec / 3600).round(0).toString() + " hour" )
        }
    }


    /**
    * print a message and return true if the flow limit date/time or the wait timeout is reached
    * @see DepsHelper.timeFlowDaily_start() and DepsHelper.timeFlowDaily_end()
    * @param oLogger : log object
    * @param dStartDateTime : start date/time
    * @param dEndDateTime : end date/time
    * @param nWaitTimeoutSec : duration in seconds before raising a timeout
    * @return boolean : true if the limit is reached, otherwise false
    */
    static Boolean timeFlowDaily_limitReach(final ExecutionListener oLogger, final ZonedDateTime dStartDateTime, final ZonedDateTime dEndDateTime, final Integer nWaitTimeoutSec ) {
        Boolean bRet = false

        // the flow time limit must be first
        if ( ZonedDateTime.now().isAfter(dEndDateTime) ) {
            oLogger.log(2, "Flow limit reached: " + dEndDateTime.format( DateTimeFormatter.ISO_OFFSET_DATE_TIME ) + " => timeout" )
            bRet = true

        } else if ( ZonedDateTime.now().isAfter( dStartDateTime.plusSeconds(nWaitTimeoutSec) ) ) {
            oLogger.log(2, "Maximum waiting time reached: " + DepsHelper.formatElapsedTime(nWaitTimeoutSec, true) + " => timeout" )
            bRet = true
        }

        return bRet
    }


    /**
    * generate the filename for the skipfile
    * @param sPluginName : the plugin name
    * @param sExecId : execution ID
    * @param sJobStep : job step number
    * @return string : full path and name for the skipfile
    */
    static String timeFlowDaily_skipFileGenerateName(final String sPluginName, final String sExecId, final String sJobStep) {
        return System.getProperty("rundeck.server.workDir", System.getProperty("rdeck.base") + "/work" ) + "/" + sPluginName.replace(' ', '') + ".skip." + sExecId + "." + sJobStep
    }


    /**
    * check if a skipfile is present
    * @param oLogger : log object
    * @param sSkipFileFullPath : The skipfile to search
    * @return boolean : true if the file was found then deleted, otherwise false
    */
    static Boolean timeFlowDaily_skipFileExists(final ExecutionListener oLogger, final String sSkipFileFullPath) {
        Boolean bRet = false

        if ( sSkipFileFullPath.length() == 0 || sSkipFileFullPath == "/" ) {
            throw new StepException(
                    "DepsHelper:timeFlowDaily_skipFileExists:validate: The skip file parameter is either empty or targeting '/' (current value=" + sSkipFileFullPath + ")",
                    StepFailureReason.ConfigurationFailure
            );
        }

        // search for the manually created skipfile
        File oSkipFile = new File(sSkipFileFullPath)
        if ( oSkipFile.exists() ) {
            oLogger.log(2, "Skip file found : " + sSkipFileFullPath + " => success" )

            try {
                bRet = oSkipFile.delete()
            }
            catch (IOException ex) {
                // non-blocking error - the file was manually created some seconds ago, just log the problem and continue
                oLogger.log(0, "DepsHelper:timeFlowDaily_skipFileExists:delete: the file " + sSkipFileFullPath + " cannot be removed - continuing to wait" )
                oLogger.log(0, ex.toString() )
            }
        }
        oSkipFile = null

        return bRet
    }
}
