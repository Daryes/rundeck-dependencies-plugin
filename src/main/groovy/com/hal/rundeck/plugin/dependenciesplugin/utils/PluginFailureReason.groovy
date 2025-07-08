package com.hal.rundeck.plugin.dependenciesplugin;

import com.dtolabs.rundeck.core.execution.workflow.steps.FailureReason
import com.dtolabs.rundeck.core.execution.workflow.steps.StepFailureReason

/**
 * Lists the known reasons the plugins might fail.
 */
enum PluginFailureReason implements FailureReason {

    KeyStorageError,
    ResourceInfoError,
    PluginFailed,
    Timeout,
    ConfigurationFailure,
    ConfigurationExtraArgsFailure,
    FilesHashesNotMatching,
    FilesHashesFormatUnknown
}
