// loaded by workflow-init.js
// call the api and populate the graph
jQuery(function () {
    "use strict";
    var $ = jQuery.noConflict();
    
    var self = this;
    self.rdplugin = window.RDPLUGIN["ui-dependencies-wait-workflow"];     // idx name must be the same as in menu-insert.js
    self.project = rundeckPage.project();
    self.pluginName = self.rdplugin.name;
    self.baseUrl = rundeckPage.pluginBaseUrl(self.pluginName);

    self.clusterAttachUnknownNode  = self.rdplugin.canvas_node_unknown_attach_in_time_cluster ?? false;    

    self.apiUrl = '/api/' + appLinks.api_version;   // RD context variable

    self.htmlButtonRefresh = $("#" + self.rdplugin.canvas_refresh);
    self.htmlSpinner = $("#" + self.rdplugin.canvas_spinner);
    self.htmlProgressBar = $("#" + self.rdplugin.canvas_progress_bar);
    self.htmlMsgNoJob = $("#" + self.rdplugin.canvas_msg_nojob);
    self.htmlCanvas = $("svg#" + self.rdplugin.canvas);
    self.htmlCanvasHolder = $("#" + self.rdplugin.canvas_holder);


    if (self.rdplugin.initialized_graph) { return; };

    depWaitLog("graph: installed");
    
    self.htmlButtonRefresh.click(function (event) {
        event.preventDefault();
        self.htmlButtonRefresh.prop("disabled", true);
        depWaitHtmlRefreshClick();
        self.htmlButtonRefresh.prop("disabled", false);
    });

    window.RDPLUGIN[self.pluginName].initialized_graph = true;

    // -------------------------------------------------------------------------
    function depWaitLog(sMessage) {
        console.log(self.pluginName + ":" + sMessage);
    };


    function depWaitHtmlRefreshClick() {
        depWaitLog("refresh: started");
        self.htmlSpinnerShow();

        // notes about promises 
        // they will execute immediatly without waiting
        // using then() can wait for a promise to be resolved
        // but then() expects a function returning a promise. Otherwise it will not wait
        // await can only be used in an async function
        // using forEach() will not work correctly with promises as it is optimized to works concurrently

        try {
            depWaitGraphCanvasInit(self.htmlCanvas);
            
            var oPromiseJobList = depWaitAjaxGetJobsFromProject(self.project);
            // no ; here
            Promise.any([oPromiseJobList])
                .then( (oPromiseData) => { 
                    if (!depWaitDataParseProject(oPromiseData)) { throw new Error ("Aborting => no jobs"); };
                    return depWaitDataLoopJobs();
                }).then( (oPromiseJobsData) => {
                    // TODO: the html rendering update visually only after the loop is ended
                    // self.htmlProgressBar.show();

                    var i = 0; var nSize = oPromiseJobsData.length;
                    for (var item of oPromiseJobsData) {
                        depWaitDataParseDef(item);
                        depWaitHtmlModalProgressBar(i + 1, nSize);
                        i++
                    };
                    depWaitLog("Jobs parsing is complete");

                    // self.htmlProgressBar.hide();
                    
                    depWaitGraphLastElements()
                    depWaitGraphLayout();

                    self.htmlSpinner.fadeOut(1000, () => {
                        depWaitHtmlModalToggleCanvas();
                        depWaitGraphRender(self.htmlCanvas, self.htmlCanvasHolder);
                    });
                });

        } catch (e) {
            self.htmlSpinnerHide();
            console.error(self.pluginName + ":refresh:ajax: an error occured => ", e);
            // TODO
        };
    };


    self.htmlSpinnerShow = () => {
        self.htmlSpinner.find(".fa-spinner").addClass("fa-spin");
        self.htmlSpinner.show();
    };

    self.htmlSpinnerHide = () => {
        self.htmlSpinner.find("i.fa-spinner").removeClass("fa-spin");
        self.htmlSpinner.hide();
    };


    function depWaitHtmlModalToggleMsg(sState = "show") {
        if (sState == "show") {
            self.htmlMsgNoJob.show();
            self.htmlCanvas.hide();
            self.htmlCanvas.parent().removeAttr("style");
            self.htmlCanvasHolder.removeAttr("style");
        } else {
            self.htmlMsgNoJob.hide();
            self.htmlCanvas.show();
        };
        // always
        self.htmlProgressBar.hide();
        self.htmlSpinnerHide();
    };

    function depWaitHtmlModalToggleCanvas(sState = "show") {
        if (sState == "show") {
            self.htmlMsgNoJob.hide();
            self.htmlCanvas.show();
        } else {
            self.htmlMsgNoJob.hide();
            self.htmlCanvas.hide();
        };
        // always
        self.htmlProgressBar.hide();
        self.htmlSpinnerHide();
    };



    function depWaitHtmlModalProgressBar(nValueCurrent, nValueMax) {
        // ref: https://www.w3schools.com/howto/howto_js_progressbar.asp
        if (! self.htmlProgressBarElt) {
            self.htmlProgressBarElt = {};
            self.htmlProgressBarElt.bar = self.htmlProgressBar.find(".progress-bar-info");
            self.htmlProgressBarElt.desc = self.htmlProgressBar.find(".progress-bar-text");
        };
        // only each X jobs
        var nRate = 5;
        if (nValueMax > 10 && (nValueCurrent % nRate) != 0 && (nValueCurrent + nRate) <= nValueMax) { return; };
        
        var nPercent = Math.floor(nValueCurrent * 100 / nValueMax);

        if (nPercent >= 100) { 
            nPercent = 100; 
            self.htmlProgressBarElt.desc.text("Job analyzing is complete");
        } else {
            self.htmlProgressBarElt.desc.text("Analyzing job " + nValueCurrent.toString() + " of " + nValueMax.toString());
        };
        self.htmlProgressBarElt.bar.css("width", nPercent.toString() + "%");
    };

// Data ########################################################################


    // parse the project data to generate a map with the job informations
    function depWaitDataParseProject(aJsonJobList) {
        depWaitLog("depWaitDataParseProject: jobs found : " + aJsonJobList.length.toString());
        if (aJsonJobList.length == 0) {
            depWaitHtmlModalToggleMsg("show");
            return false;
        };

        depWaitHelperJobClearJobDataFromId();
        depWaitHelperJobClearNameToId();

        aJsonJobList.forEach((item, index) => {
            depWaitHelperJobSetJobDataFromId(item['id'], item);
            depWaitHelperJobRecordNameToId(item['group'], item['name'], item['id']);
        });
        
        return true;
    };


    // retrieve each job definition
    async function depWaitDataLoopJobs() {
        depWaitLog("depWaitDataLoopJobs: parsing job list ...");

        var nBatchSize = 10;
        // TODO: sequence the call in batches
        // notice: use when() or all() for batches, with : .all(...aMyArray);

        // cannot do any compute in a "foreach => async", must use an array of promise results, then compute
        // also, .map(function) is applicable to an array, not a Map object

        var oPromiseJobDefs = Array.from( depWaitHelperJobKeysJobDataFromId() ).map( (sJobUid) => { 
            return depWaitAjaxGetJobDef(sJobUid);
        });

        var oRet = await Promise.all(oPromiseJobDefs);
        return oRet;
    };


    // extract the informations from a single job definition
    // the informations will be stored in maps to create later the graph elements 
    function depWaitDataParseDef(aJsonData) {
        // job structure : https://docs.rundeck.com/docs/manual/document-format-reference/job-json-v44.html
        
        var oFullJobDef = aJsonData[0];     // the definition is returned as an array of 1 element in the json response
        var sJobIndex = oFullJobDef.id;

        // depWaitLog("depWaitDataParseDef: parsing job definition for id : " + sJobIndex);

        // use the project definition for the job data to return
        var oMinimalJobDef = depWaitHelperJobGetJobDataFromId(sJobIndex);
        
        // add or update some properties
        oMinimalJobDef.custom_groupHash = "group_" + depWaitHelperJobGenerateHash(oMinimalJobDef.group);
        oMinimalJobDef.timeout = oFullJobDef?.timeout ?? "";
        oMinimalJobDef.custom_project_is_current = (oMinimalJobDef.project == self.project) ? true : false;

        // extract the schedule
        if (oFullJobDef.schedule) {
            oMinimalJobDef.schedule = depWaitHelperJobDefSchedule(oFullJobDef);
        };

        if (oFullJobDef.notification) {
            oMinimalJobDef.custom_notification = depWaitHelperJobDefNotification(oFullJobDef);
        };

        var aCmdItemConf; var aCurrentStep; var sCmdItemType; var aInterItem = new Map(); var sErrHandlerKeyName;
        
        // extract all the job's steps under "commands"
        if (oFullJobDef?.sequence?.commands) {
            oFullJobDef.sequence.commands.forEach((cmdItemInter, cmdIdxInter) => {

                // each step can have an error handler, which can be any valid action => add it as an extra step
                aInterItem.clear();
                aInterItem.set(cmdIdxInter, cmdItemInter);

                if ( cmdItemInter.hasOwnProperty("errorhandler") ) {
                    sErrHandlerKeyName = Object.keys(cmdItemInter.errorhandler)[0];    // for now an errorhandler is always unique

                    cmdItemInter.errorhandler[sErrHandlerKeyName].custom_errorhandler = true;
                    aInterItem.set("errorhandler", cmdItemInter.errorhandler);
                };

                // good to parse the step definition
                aInterItem.forEach( (cmdItem, cmdIdx, oIgnore) => {
                    sCmdItemType = "";
                    // each plugin has its own configuration located under different names

                    // the deps-wait plugins are workflow steps
                    if (cmdItem.hasOwnProperty("nodeStep") && cmdItem.nodeStep == false) { 
                        aCmdItemConf = cmdItem?.configuration ?? {};
                        sCmdItemType = cmdItem?.type ?? "";

                    // jobref
                    } else if (cmdItem.hasOwnProperty("jobref")) {
                        aCmdItemConf = cmdItem.jobref;
                        sCmdItemType = "jobref";

                    // unknown plugin
                    } else {
                        return;  // "continue" equivalent to .forEach()
                    };
                    
                    // the functions dedicated for each modules must also cover the creation of any secondary node and link when required
                    switch(sCmdItemType) {
                        case "dependencies-wait_job":
                            aCurrentStep = depWaitHelperJobDefStepCommand_DependencyWaitJob(oMinimalJobDef, oFullJobDef, aCmdItemConf);
                            break;


                        case "dependencies-wait_file":
                            aCurrentStep = depWaitHelperJobDefStepCommand_DependencyWaitFile(oMinimalJobDef, oFullJobDef, aCmdItemConf);
                            break;


                        case "dependencies-wait_slot":
                            aCurrentStep = depWaitHelperJobDefStepCommand_DependencyWaitSlot(oMinimalJobDef, oFullJobDef, aCmdItemConf);
                            break;
                        
                        
                        case "jobref":
                            aCurrentStep = depWaitHelperJobDefStepCommand_jobref(oMinimalJobDef, oFullJobDef, aCmdItemConf);
                            break;

                        default:
                            // plugin not supported - do nothing
                    };
                });
            });
        };
        
        // create the main node for the job
        if (oMinimalJobDef.schedule) {
            depWaitGraphSetNodeJobWithSchedule(sJobIndex, oMinimalJobDef);
        } else {
            depWaitGraphSetNodeJobManual(sJobIndex, oMinimalJobDef);
        };
    };


// API #########################################################################

    // API - retrieve all jobs from the project - function defined lazily
    var depWaitAjaxGetJobsFromProject = async (sProjectName) => {
        var oQuery = await jQuery.ajax({
            url: self.apiUrl + "/project/" + sProjectName + "/jobs?max=999",
            method: 'GET',
            contentType: 'json'
        });
        return oQuery;
    };


    // API - get the definition of the target job - function defined lazily
    var depWaitAjaxGetJobDef = async (sJobId) => {
        var oQuery = await jQuery.ajax({
            url: self.apiUrl + "/job/" + sJobId + "?format=json",
            method: 'GET',
            contentType: 'json'
        });
        return oQuery;
    };


// Tools #######################################################################

    // used for progressbar tests
    self.sleep = (milliseconds) => {
        var start = new Date().getTime();
        for (var i = 0; i < 1e7; i++) {
            if ((new Date().getTime() - start) > milliseconds){ break; };
        };
    };

    /*
    self.delayedLoop = (aCollection, nDelay, callback, context = null) => {
        // ref: https://stackoverflow.com/a/31655098
        var i = 0,
            nextInteration = function() {
                if (i >= aCollection.length) { return; };

                callback.call(context, aCollection[i], i);
                i++;
                setTimeout(nextInteration, nDelay);
                return i;
            };
        var nRet = nextInteration();
        console.log(nRet);
    };
    */

});