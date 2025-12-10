package com.hal.rundeck.plugin.dependenciesplugin;

/**
*  Constant variables common to the Dependencies plugins
*/
@SuppressWarnings('FieldName')
@groovy.transform.CompileStatic
class DepsConstants {

    /**
    * jobs status
    * <br/>ref: https://docs.rundeck.com/docs/api/#executions
    * @TODO: use instead rundeck's own "ExecutionConstants" definitions
    */
    public static final String[] jobState_ok = [ "ok", "success", "succeeded" ]
    public static final String[] jobState_ko = [ "ko", "error", "failed", "aborted", "timedout", "timeout", "other" ]
    public static final String[] jobState_ignore = [ "running", "failed-with-retry", "scheduled" ]

    /**
    * other strings
    */
    public static final String stdout_line =      "------------------------------------------------------------"
    public static final String stdout_line_hash = "############################################################"
    public static final String timeDurationFormatColon = "%2d:%02d:%02d"
    public static final String timeDurationFormatHMS =   "%dh%02dm%02ds"


    /**
    * default duration before timeout <br />
    * required to have both declarations in integer and date formatted string
    */
    public static final Integer flowTimeoutDurationSec = 43200
    public static final String flowTimeoutDurationSecStringForAnnotations = "43200"
    public static final String flowTimeoutDurationFormated = "12h00m00s"
    public static final String flowTimeoutDurationPropertyName = "dependencies-waitfor.flow-timeout-duration-sec"

    /**
    * default pause before starting the dependency loop
    * Does not apply to all jobs
    */
    public static final short flowStartupDelaySec = 7

    /**
    * default pause in sec between each loop
    */
    public static final short flowLoopSleepDurationSec = 30
    public static final String flowLoopSleepDurationPropertyName = "dependencies-waitfor.flow-sleep-duration-sec"
    public static final short flowLoopSleepSlowerDurationSec = 180
    public static final String flowLoopSleepSlowerDurationPropertyName = "dependencies-waitfor.flow-sleep-slower-duration-sec"

    /**
    * default flow start and end pivot time
    */
    public static final String flowDailyStartEndPivotTime = "15:00:00"
    public static final String flowDailyStartEndPivotTimePropertyName = "dependencies-waitfor.flow-daily-start-end-pivot-time"

    /**
    * default shell interpreter
    */
    public static final String shellInterpreterDefault = "bash"
    public static final String shellInterpreterPropertyName = "dependencies-waitfor.shell"
}
