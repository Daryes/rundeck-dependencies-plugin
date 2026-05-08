// Insert the elements in Rundeck's UI for accessing the graph panel
// no use of jquery here, but nextUI is highly incompatible with addEventListener("...state...")
jQuery(function () {
    "use strict";
    var $ = jQuery.noConflict();

    // if (document.readyState != "interactive") { return; };

    var self = this;
    self.pluginName = "ui-dependencies-wait-workflow";
    self.baseUrl = "/plugin/file/UI/" + self.pluginName;  // not yet loaded : "rundeckPage.pluginBaseUrl(...)"
    self.controller = "dependencies-wait-ui";
    self.htmlMenuButtonId = self.controller + "-menu-button";
    self.htmlCanvasId = self.controller + "-canvas";
    self.htmlCanvasSpinnerId = self.controller + "-spinner";
    self.htmlCanvasProgressBarId = self.controller + "-progress-bar";
    self.htmlCanvasRefreshId = self.controller + "-refresh";
    self.htmlCanvasMsgNoJobId = self.controller + "-msg-no-job";
    self.htmlCanvasHolder = self.controller + "-modal";
    self.htmlCanvasTooltipId = self.controller + "-tooltip";
    // appLinks.project_name => current project

    // create the RDPLUGIN structure if missing and allow only one initialization
    if (typeof window.RDPLUGIN !== 'object') { window.RDPLUGIN = {}; };

    if (!window.RDPLUGIN[self.pluginName]) {
        window.RDPLUGIN[self.pluginName] = {
            name: self.pluginName,
            initialized: false,
            canvas: self.htmlCanvasId,
            canvas_refresh: self.htmlCanvasRefreshId,
            canvas_spinner: self.htmlCanvasSpinnerId,
            canvas_progress_bar: self.htmlCanvasProgressBarId,
            canvas_msg_nojob: self.htmlCanvasMsgNoJobId,
            canvas_holder: self.htmlCanvasHolder,
            canvas_tooltip: self.htmlCanvasTooltipId,
            canvas_schedule_group_precision_minute: false,          // create clusters for schedules with HH:MM/15m (true) or HH (false) precision
            canvas_schedule_group_create_all: false,                // create clusters for all hourly schedules even if empty
            canvas_job_label_show_href_link: true,                  // allow href links in job labels
            canvas_node_unknown_attach_in_time_cluster: true,      // attach the unknown nodes (file, shadow, ...) to the current time cluster instead of being outside
        };
    };

    if (window.RDPLUGIN[self.pluginName].initialized) { return; };

    console.log(self.pluginName + ":menu-insert: started");
       // RD context variable
    if (! _rundeck.data.projectAdminAuth) {
        console.log(self.pluginName + ":menu-insert: admin auth required - exiting");
        return;
    };

    // new button - reuse Rundeck modal functions
    var oButtonDependsWaitUi = document.createElement("span");
    oButtonDependsWaitUi.setAttribute("id", self.htmlMenuButtonId);
    oButtonDependsWaitUi.setAttribute("class", "btn btn-default btn-md query mr-2");
    oButtonDependsWaitUi.setAttribute("title", "Open the dependencies workflow page");
    oButtonDependsWaitUi.setAttribute("data-toggle", "modal");
    oButtonDependsWaitUi.setAttribute("data-target", "#" + self.controller);
    oButtonDependsWaitUi.innerHTML = `
        <img style="vertical-align: text-top;" name="${self.controller}" width="16px" height="16px" src="${ self.baseUrl + '/icon.png' }">
        Dependencies
    `;


    // new modal window for the button
    var oModalDependsWaitUi = document.createElement("div");
    oModalDependsWaitUi.setAttribute("id", self.controller);
    oModalDependsWaitUi.setAttribute("class", "modal in");
    oModalDependsWaitUi.setAttribute("tabindex", "-1");
    oModalDependsWaitUi.setAttribute("role", "dialog");
    oModalDependsWaitUi.setAttribute("aria-labelledby", self.controller + "-title");
    oModalDependsWaitUi.setAttribute("aria-hidden", "true");
    oModalDependsWaitUi.setAttribute("style", "display: none;");
    // modal-lg => width=900
    oModalDependsWaitUi.innerHTML = `
        <div id="${self.htmlCanvasHolder}" class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                    <h4 class="modal-title" id="${self.controller}-title">
                        <div>
                            <img style="vertical-align: baseline;" name="${self.controller}" width="16px" height="16px" src="${ self.baseUrl + '/icon.png' }">
                            Dependencies workflow for jobs
                        </div>
                        <div>Project: ${appLinks.project_name}</div>
                    </h4>
                </div>
                <div class="modal-body" id="${self.controller}-content">
                    <div id="${self.htmlCanvasMsgNoJobId}"  style="display: none;"><h3 style="color: #008080;"><center>There are currently no job in this project</center></h3></div>
                    <div id="${self.htmlCanvasSpinnerId}" class="loading" style="display: none;">
                        <div class="loading-spinner">
                            <i class="fas fa-spinner fa-spin fa-5x"></i>
                        </div>
                    </div>
                    <div id="${self.htmlCanvasProgressBarId}" class="progress" style="display: none;">
                        <div class="progressbar progress-bar-info"></div>
                        <div class="progress-bar-text"></div>
                    </div>
                    <svg id="${self.htmlCanvasId}" style="display: none;"></svg>
                </div>
                <div class="modal-footer" id="${self.controller}-footer">
                    <div id="${self.htmlCanvasTooltipId}" class="svg-tooltip-info btn-md"></div>
                    <button type="submit" class="btn btn-default pull-right" data-dismiss="modal">Close</button>
                    <button type="button" class="btn btn-primary btn-md mr-2 pull-right" id="${self.htmlCanvasRefreshId}">Refresh</button>
                </div>
            </div>
        </div>
    `;


    try {
        // get the subtitle, right section then insert the new button as the first element and the hidden modal after - old UI & NextUI
        var oTitleSection = document.querySelector("div[class*='title'] .subtitle-head-item .search").parentElement;
        if (!oTitleSection) { console.log("The title bar on 'menu/jobs' cannot be found"); throw new Error("UI not supported"); };
        
        oTitleSection.insertBefore( oButtonDependsWaitUi, oTitleSection.firstElementChild);
    } catch (e) {
        console.log("ERROR:" + self.pluginName + ": the UI button could not be inserted");
        console.log(e);
        return;
    };


    try {
        // no need for a designated location
        document.body.appendChild(oModalDependsWaitUi);

        // add the JS managing the graph
        for (let sLib of [
                "js/dependencies-wait-workflow-helper-graph-dagred3.js",
                "js/dependencies-wait-workflow-helper-jobs.js",
                "js/dependencies-wait-workflow-graph.js",
                "js/dependencies-wait-workflow-core.js",
            ]) {
            var oHeadGraphScript = document.createElement("script");
            oHeadGraphScript.defer = true;
            oHeadGraphScript.setAttribute("type", "text/javascript");
            oHeadGraphScript.setAttribute("src", self.baseUrl + '/' + sLib);
            document.head.append(oHeadGraphScript);
        };

    } catch (e) {
        console.log("ERROR:" + self.pluginName + ": the UI elements could not be inserted");
        return;
    };

    window.RDPLUGIN[self.pluginName].initialized = true;
});
