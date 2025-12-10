package com.hal.rundeck.plugin.dependenciesplugin;

// External packages or modules dependencies
import org.rundeck.storage.api.PathUtil
import org.rundeck.storage.api.StorageException
import com.dtolabs.rundeck.core.storage.ResourceMeta
import com.dtolabs.rundeck.plugins.step.PluginStepContext


// required to retrieve the project properties
import com.dtolabs.rundeck.core.common.IFramework;
import com.dtolabs.rundeck.core.common.IRundeckProject;
import com.dtolabs.rundeck.core.execution.utils.ResolverUtil;
import com.dtolabs.rundeck.core.utils.IPropertyLookup;

import java.util.HashMap;


/**
* Class for retrieving the properties values common to the Dependencies plugins - must be instanciated
*/
class DepsHelperProperties {
    static final String PROJ_PROP_PREFIX = "project.";
    static final String FWK_PROP_PREFIX = "framework.";


    IFramework oFramework
    IRundeckProject oFrameworkProject
    String sProjectName


    /**
    * class initialization
    * @param oTargetFramework : the framework object from the plugin instance, usually from : PluginStepContext.getIFramework()
    * @param sTargetFrameworkProjectName : the current project name, usually from : PluginStepContext.getFrameworkProject()
    */
    DepsHelperProperties(IFramework oTargetFramework, String sTargetFrameworkProjectName) {
        oFramework = oTargetFramework
        sProjectName = sTargetFrameworkProjectName
        oFrameworkProject = oFramework.getFrameworkProjectMgr().getFrameworkProject( sProjectName )
    }


    /**
    * Print all accessible framework.* and project.* properties
    */
    void debugPrintAllProps() {
        oFramework.getPropertyLookup().getPropertiesMap().forEach((k, v) -> { System.err.println("DepsHelperProperties:framework: " + k + "=" + String.valueOf(v) ); });
        oFrameworkProject.getProjectProperties().forEach((k, v) -> { System.err.println("DepsHelperProperties:project: " + k + "=" + String.valueOf(v) ); });
        oFrameworkProject.getProperties().forEach((k, v) -> { System.err.println("DepsHelperProperties:merged: " + k + "=" + String.valueOf(v) ); });
    }


    // Properties functions ------------------------------------------------------------------------

    /**
    * return the final property value after scanning the possible variant from framework and project properties
    * @param sPropName : the property name without the framework. or project. prefix
    * @param sDefaultValue : the property default value
    * @return String : the final value
    */
    String getPropertyFromAllVariants(String sPropName, String sDefaultValue) {
        // ref : https://javadoc.io/doc/org.rundeck/rundeck-core/latest/com/dtolabs/rundeck/core/execution/utils/ResolverUtil.html
        // ref : https://github.com/rundeck/rundeck/blob/main/core/src/main/java/com/dtolabs/rundeck/core/execution/utils/ResolverUtil.java
        // return ResolverUtil.resolveProperty(sPropName, sDefaultValue, null, oFrameworkProject, oFramework);
        // => no use about the node object, but ResolverUtil needs it => local implementation

        String sRet = ""

        if ( oFrameworkProject.hasProperty(PROJ_PROP_PREFIX + sPropName) ) {
            sRet = oFrameworkProject.getProperty(PROJ_PROP_PREFIX + sPropName)
            if ( sRet != "" ) {
                return sRet;
            }
        }

        if ( oFramework.getPropertyLookup().hasProperty(FWK_PROP_PREFIX + sPropName) ) {
            sRet = oFramework.getPropertyLookup().getProperty(FWK_PROP_PREFIX + sPropName)
            if ( sRet != "" ) {
                return sRet;
            }
        }

        return sDefaultValue;
    }


    /**
    * return the final value for the constant of the related name if a custom property is defined
    */
    String getPropShellInterpreter() {
        String sSystemShell = System.getenv("SHELL")
        if (! sSystemShell || sSystemShell.length() == 0 ) { sSystemShell = DepsConstants.shellInterpreterDefault }

        return getPropertyFromAllVariants(DepsConstants.shellInterpreterPropertyName, sSystemShell)
    }


    /**
    * return the final value for the constant of the related name if a custom property is defined
    */
    Integer getPropFlowTimeoutDurationSec() {
        return Integer.valueOf( getPropertyFromAllVariants( DepsConstants.flowTimeoutDurationPropertyName, String.valueOf(DepsConstants.flowTimeoutDurationSec) ) )
    }


    /**
    * return the final value for the constant of the related name if a custom property is defined
    */
    String getPropFlowTimeoutDurationFormated() {
        return DepsHelper.formatElapsedTime( getPropFlowTimeoutDurationSec() )
    }


    /**
    * return the final value for the constant of the related name if a custom property is defined
    */
    short getPropFlowLoopSleepDurationSec() {
        // need a short and not an object
        return Short.parseShort( getPropertyFromAllVariants( DepsConstants.flowLoopSleepDurationPropertyName, String.valueOf(DepsConstants.flowLoopSleepDurationSec) ) )
    }


    /**
    * return the final value for the constant of the related name if a custom property is defined
    */
    short getPropFlowLoopSleepSlowerDurationSec() {
        return Short.parseShort( getPropertyFromAllVariants( DepsConstants.flowLoopSleepSlowerDurationPropertyName, String.valueOf(DepsConstants.flowLoopSleepSlowerDurationSec) ) )
    }


    /**
    * return the final value for the constant of the related name if a custom property is defined
    */
    String getPropFlowDailyStartEndPivotTime() {
        return getPropertyFromAllVariants( DepsConstants.flowDailyStartEndPivotTimePropertyName, DepsConstants.flowDailyStartEndPivotTime)
    }


    /**
    * Calculate the daily workflow start time from the pivot time.
    * This is a stand-in as previously the starting and ending time were separate parameters.
    */
    String getPropFlowDailyStartTime() {
        // no change for the start time, only the end time must be altered
        return getPropFlowDailyStartEndPivotTime()
    }


    /**
    * Calculate the daily workflow end time from the pivot time.
    * This is a stand-in as previously the starting and ending time were separate parameters.
    */
    String getPropFlowDailyEndTime() {
        String sTimePivot = getPropFlowDailyStartEndPivotTime()
        Integer[] nTimePivot = DepsHelper.timeFlowDaily_TimeRef_Split(sTimePivot)

        // 1 second must be substracted
        sTimePivot = DepsHelper.formatElapsedTime( ( nTimePivot[0] * 60 * 60 ) +
                                                   ( nTimePivot[1] * 60 ) +
                                                   ( nTimePivot[2] - 1 ),
                                                   false, DepsConstants.timeDurationFormatColon ) // use the hh:mm:ss format
        nTimePivot = null

        return sTimePivot
    }
}
