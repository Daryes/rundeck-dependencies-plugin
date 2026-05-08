package com.hal.rundeck.plugin.dependenciesplugin;

// Author : HAL, aka Ogme

// External packages or modules dependencies
// base
import com.dtolabs.rundeck.core.plugins.Plugin

import com.dtolabs.rundeck.plugins.ServiceNameConstants
import com.dtolabs.rundeck.plugins.descriptions.PluginDescription
import com.dtolabs.rundeck.plugins.descriptions.PluginMetadata
import com.dtolabs.rundeck.plugins.descriptions.PluginProperty

// ui plugin
import com.dtolabs.rundeck.core.plugins.PluginException
import com.dtolabs.rundeck.core.plugins.PluginResourceLoader
import com.dtolabs.rundeck.plugins.rundeck.UIPlugin

// servlet & json response
import javax.servlet.http.HttpServletResponse;

// extras
import java.util.List;
import java.util.ArrayList;
import java.util.HashMap;


/**
* Module dependencies-wait_ui-workflow - a Rundeck workflow plugin  <br />
* this is basically a shell plugin limited to return the appropriate html/js/css/... elements <br />
*/
@Plugin(name = PLUGIN_NAME, service = ServiceNameConstants.UI)
@PluginDescription(title = PLUGIN_TITLE, description = PLUGIN_DESCRIPTION)
class DependenciesWaitUiWorkflowPlugin implements UIPlugin {

    public static final String PLUGIN_NAME = "ui-dependencies-wait-workflow"
    public static final String PLUGIN_TITLE = "Dependencies Workflow / UI"
    public static final String PLUGIN_DESCRIPTION = "Visualize the dependencies between multiple jobs of a project"

    private static final Boolean DEBUG = false        // codenarc-disable-line PropertyName,FieldName

    // returning an empty [] will raise an error on Rundeck side, only null is expected
    private static final List<String> PLUGIN_LST_EMPTY = null

    private static final List<String> PLUGIN_RES_CSS = [
            "css/ui-dependencies-wait.css",
            ]

    private static final List<String> PLUGIN_RES_WORKFLOW_HTML = PLUGIN_LST_EMPTY

    private static final List<String> PLUGIN_RES_WORKFLOW_SCRIPTS = [
            "lib/d3.v7.min.js",
            "lib/dagre-d3.min.js",
            "js/dependencies-wait-workflow-init.js",    // the other JS are loaded by init.js from the plugin static resources
            ]

    private static final List<String> PLUGIN_RES_ALL = PLUGIN_RES_CSS +
                                                       PLUGIN_RES_WORKFLOW_HTML +
                                                       PLUGIN_RES_WORKFLOW_SCRIPTS

    // possible values : UIPLUGIN_PAGES => https://github.com/rundeck/rundeck/blob/main/rundeckapp/grails-app/controllers/rundeck/interceptors/ControllerBaseInterceptor.groovy
    private static final List<String> PLUGIN_URL_CONTEXT = [
            "menu/jobs",
            "plugin/" + PLUGIN_NAME,
            ]

    // #############################################################################################

    void logDebug(final String sText) {
        if ( !DEBUG ) { return }
        System.out.println("DEBUG  " + PLUGIN_NAME + ":" + sText)
    }

    /**
    * ref: https://docs.rundeck.com/docs/developer/11-ui-plugins.html
    * example: https://github.com/rundeck/rundeck/blob/main/grails-execution-mode-timer/src/main/groovy/com/rundeck/plugin/ui/UIEnableExecutionLater.groovy
    *
    * ref plugin types :
    * https://github.com/rundeck/rundeck/blob/main/core/src/main/java/com/dtolabs/rundeck/plugins/ServiceNameConstants.java
    *
    * ref: Jar & Script plugin loaders
    * https://github.com/rundeck/rundeck/blob/main/core/src/main/java/com/dtolabs/rundeck/core/plugins/JarPluginProviderLoader.java
    * https://github.com/rundeck/rundeck/blob/main/core/src/main/java/com/dtolabs/rundeck/core/plugins/ScriptPluginProviderLoader.java
    */

    /**
     * @param path
     * @return list of other required UI plugins
     */
    @Override
    List<String> requires(String sPath) {
        return null         // codenarc-disable-line ReturnsNullInsteadOfEmptyCollection
    }

    /**
     * @param path - see the comment about UIPLUGIN_PAGES for the possible values
     * @return true if this plugin applies at the path - this will be followed with calls to the *ResourcesForPath() functions
     */
    @Override
    boolean doesApply(String sPath) {
        logDebug("doesApply: path received => " + sPath)
        return (! pluginContextForPath(PLUGIN_URL_CONTEXT, sPath).isEmpty() )
    }

    /**
     * @param path
     * @return list of html resources available at the path
     */
    @Override
    List<String> resourcesForPath(String sPath) {
        logDebug("resourcesForPath: path received => " + sPath)
        return pluginResourcesForPath(sPath,
            PLUGIN_RES_WORKFLOW_HTML,
            PLUGIN_LST_EMPTY
            )
    }

    /**
     * @param path
     * @return list of javascript resources to load at the path
     */
    @Override
    List<String> scriptResourcesForPath(String sPath) {
        logDebug("scriptResourcesForPath: path received => " + sPath)
        return pluginResourcesForPath(sPath,
            PLUGIN_RES_WORKFLOW_SCRIPTS,
            PLUGIN_LST_EMPTY
            )
    }

    /**
     * @param path
     * @return list of css stylesheets to load at the path
     */
    @Override
    List<String> styleResourcesForPath(String sPath) {
        logDebug("styleResourcesForPath: path received => " + sPath)
        return pluginResourcesForPath(sPath,
            PLUGIN_RES_CSS,
            PLUGIN_LST_EMPTY
            )
    }


    // #############################################################################################

    /**
     * sPath : requested path
     * @aResForOtherMenu : list of resources for the calling menu
     * @aResForPluginHtmlPage : list of resources for the main html page of the plugin
     * @return list of resources depending of the path
     */
    private List<String> pluginResourcesForPath(String sPath, List<String> aResForJobRoute, List<String> aResForPluginRoute) {
        List<String> aSupportedPaths = pluginContextForPath(PLUGIN_URL_CONTEXT, sPath)
        if ( aSupportedPaths.isEmpty() ) {
            return PLUGIN_LST_EMPTY
        }
        if (aSupportedPaths.get(0) == PLUGIN_URL_CONTEXT.get(0)) {
            return aResForJobRoute
        }
        return aResForPluginRoute
    }


    /**
    * verify if the requested path applies to the plugin contexts and return those supported
    */
    private List<String> pluginContextForPath(List<String> aContexts, String sRequestedPath) {
        List<String> aRet = new ArrayList<String>()

        for (String sSupportedPath : aContexts) {
            // compare as a string or as a regex
            if ( sRequestedPath == sSupportedPath || sRequestedPath.matches(sSupportedPath) ) {
                aRet.add(sSupportedPath)
            }
        }
        return aRet
    }

}
