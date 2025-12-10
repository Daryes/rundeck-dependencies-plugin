package com.hal.rundeck.plugin.dependenciesplugin;

import com.dtolabs.rundeck.core.execution.workflow.steps.FailureReason
import com.dtolabs.rundeck.core.execution.workflow.steps.StepFailureReason

/**
 * Lists the known reasons the plugins might fail.
 * ref: https://github.com/rundeck/rundeck/blob/main/core/src/main/java/com/dtolabs/rundeck/core/execution/workflow/steps/StepFailureReason.java
 */
@SuppressWarnings('FieldName')
enum PluginFailureReason implements FailureReason {

    KeyStorageError,
    ResourceInfoError,
    PluginFailed,
    aborted,                        // step reason
    failed,                         // step reason
    failed_with_retry,              // step reason
    other,                          // step reason
    TimedOut,                       // step reason - it is not TimeOut but TimedOut (mind the "d")
    ConfigurationFailure,
    ConfigurationExtraArgsFailure,
    FilesHashesNotMatching,
    FilesHashesFormatUnknown
}
