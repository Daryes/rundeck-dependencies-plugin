// loaded by workflow-init.js
// helper : functions to extract data from job definitions
// TODO: make a class of this file ?

    var self = this;
    self.rdplugin = window.RDPLUGIN["ui-dependencies-wait-workflow"];
    self.pluginName = self.rdplugin.name;
    self.clusterTimePrecisionMinute = self.rdplugin.canvas_schedule_group_precision_minute ?? false;
    self.clusterTimeCreateAll = self.rdplugin.canvas_schedule_group_create_all ?? "false";
    self.htmlJobLabelShowHrefLink = self.rdplugin.canvas_job_label_show_href_link ?? "false";
    self.htmlCanvasTooltip = document.getElementById(self.rdplugin.canvas_tooltip);

    self.project = appLinks.project_name;  // provided by RD, alternative to jQuery => rundeckPage
    self.rdUrlScheduledExecutionShow = appLinks.scheduledExecutionDetailFragment.replace("/detailFragment", "/show");   // appLinks.scheduledExecutionShow does not exist

    self.aWarningType = {"none": 0, "warning": 1, "question": 2, "exclamation": 3 };


// #############################################################################

    // must be duplicated
    function depWaitLog(sMessage) {
        console.log(self.pluginName + ":" + sMessage);
    };


    /*
    * functions are in order to create and render the graph on an existing SVG element
    * Init, LastElements, Layout, Render
    * Render must be done on a visible element
    */    
    
    function depWaitGraphCanvasInit(oHtmlCanvas) {
        // for refresh, it is required to clear all recorded elements to get a new canvas to draw upon
        self.aGraphDataRecordObjectList.clear();
        self.aGraphDataRecordEdgeList.clear();
        // depWaitGraphHelperClearTimeFormat();  <= not required, the data is generic

        depWaitGraphDagreClearForRefresh(oHtmlCanvas);

        depWaitGraphDagreCanvasInit();
    };



    function depWaitGraphLastElements() {
        // order is important
        depWaitGraphCreateRecordNodeList();
        depWaitGraphCreateRecordEdgeList();
        depWaitGraphDagreSetEdgeForAllScheduleGroups();        
    };


    function depWaitGraphLayout() {
        depWaitGraphDagreLayout();
    };

    
    var depWaitGraphRender = (oHtmlCanvas, oHtmlCanvasHolder) => {
        depWaitGraphDagreRender(oHtmlCanvas, oHtmlCanvasHolder);

        depWaitGraphJsAddToSvgPath(oHtmlCanvas);
    }

// Record now and create later #################################################
// Record the data for other type of objects to create at the end.
// Some of them, like edges, cannot be created until all the required elements are generated.
// this is to reduce the amount of tests each time such a node is encountered, like jobs from another project, or files

    
    // @param oNewNode : map() with keys related to each type
    self.aGraphDataRecordObjectList = new Map();
    function depWaitGraphDataRecordNodeList(oNewNode) {
        self.aGraphDataRecordObjectList.set( self.aGraphDataRecordObjectList.size, oNewNode);
    };
    
    function depWaitGraphCreateRecordNodeList() {
        var aNodeTypes = depWaitHelperJobGetDependencyType();

        self.aGraphDataRecordObjectList.forEach((oNode, nIdx) => {
            if (self.graph.g.hasNode(oNode.custom_id)) { return; };  // "continue" equivalent with foreach()

            switch(oNode?.custom_type ?? 0 ) {
                case aNodeTypes.job:
                case aNodeTypes.basic:
                    depWaitGraphSetNodeJobOtherProject(oNode.custom_id, oNode);
                    break;

                case aNodeTypes.ref:
                    depWaitGraphSetNodeRef(oNode.custom_id, oNode);
                    break;
                    
                case aNodeTypes.file:
                    depWaitGraphSetNodeFile(oNode.custom_id, oNode);
                    break;

                case aNodeTypes.slot:
                    // not here : placed as a property in the job definition to insert a marker with an icon
                    break;
            };
        });
    };


    // To create an edge, the targets must already exist
    // so either create a dummy target with its content updated after or record the edges to create them at the end
    // @param oNewEdge : array/object with the structure : {sSourceId: "str", sTargetId: "str", sEdgeId: "str", nLinkType: 0|1, bForce:  bool, ...}
    self.aGraphDataRecordEdgeList = new Map();
    function depWaitGraphDataRecordEdgeList(oNewEdge) {
        var nEdgeListSize = self.aGraphDataRecordEdgeList.size;
        if (!oNewEdge.hasOwnProperty("sEdgeId")) { oNewEdge.sEdgeId = "edge_" + nEdgeListSize.toString(); };
        self.aGraphDataRecordEdgeList.set( nEdgeListSize, oNewEdge);
    };
    
    function depWaitGraphCreateRecordEdgeList() {
        depWaitLog("depWaitGraphCreateRecordEdgeList: generating link between objects");

        var aNodeTypes = depWaitHelperJobGetDependencyType();
        var aLinkTypes = depWaitHelperJobGetLinkType();

        self.aGraphDataRecordEdgeList.forEach( (oEdge, nIdx) => {
            switch(oEdge?.nEntityType ?? aNodeTypes.job ) {
                case aNodeTypes.job:
                    switch (oEdge?.nLinkType ?? aLinkTypes.basiclink) {
                        case aLinkTypes.basiclink:
                            depWaitGraphSetEdgeBasic(oEdge.sTargetId, oEdge.sSourceId, oEdge.sEdgeId, oEdge.bLinkStatus);
                            break;

                        case aLinkTypes.hardlink:
                            depWaitGraphSetEdgeHard(oEdge.sTargetId, oEdge.sSourceId, oEdge.sEdgeId, oEdge.bForce, oEdge.bLinkStatus);
                            break;

                        case aLinkTypes.softlink:
                            depWaitGraphSetEdgeSoft(oEdge.sTargetId, oEdge.sSourceId, oEdge.sEdgeId, oEdge.bForce, oEdge.bLinkStatus);
                            break;
                        
                        default:
                            break;
                    };
                    break;

                case aNodeTypes.ref:
                    depWaitGraphSetEdgeJobRef(oEdge.sTargetId, oEdge.sSourceId, oEdge.sEdgeId, oEdge.bLinkStatus, oEdge.bIsErrorHandler);
                    break;

                case aNodeTypes.file:
                    depWaitGraphSetEdgeFile(oEdge.sTargetId, oEdge.sSourceId, oEdge.sEdgeId, oEdge.bForce);
                    break;
            };
        });
    };


// Javascript to SVG elements ##################################################

    // get a handle to the given global css rule - put in a function as used at different location
    function depWaitGraphJsHelperSvgClickVisibilityCss() {
        return self.getCSSRule( 
                    "#" + self.svgClickVisibilityCssId + " ." + self.svgClickVisibilityToggleClass + ":not(.toggle-visible-protect)", 
                    { bRemoteRulesOnly: true }
                );
    };


    // dedicated function due to the refresh
    function depWaitGraphJsHelperClickNodeFocusClear() {
        if (self.svgClickVisibilityCss) { self.svgClickVisibilityCss.style.filter = "opacity(1)"; };
    };


    function depWaitGraphJsAddToSvgPath(oHtmlCanvas) {
        // ref: https://dagrejs.github.io/project/dagre-d3/latest/demo/hover.html
        // ref: https://codepen.io/billdwhite/pen/OJLeLR
        var oSvgInner = depWaitGraphDagreGetSvgInner();

        // add tooltip for edges on hover 
        var oSvgElts = oSvgInner.selectAll("g.edgePaths .joblink, g.edgePaths .filelink, g.edgePaths .reflink");
        oSvgElts.selectAll("path, marker").each( function() {
            this.setAttribute("onmousemove", 'depWaitGraphJsTooltipShow(evt, "link");');
            this.setAttribute("onmouseout", 'depWaitGraphJsTooltipHide();');
        });
        depWaitGraphJsTooltipHide();

        // add a click behavior to toggle the visibility of nodes and edges
        // splitted to prevent having a unused if() for each edge
        self.svgClickVisibilityToggleClass = "toggle-visibility";
        self.svgClickVisibilityProtectClass = "toggle-visible-protect";
        self.svgClickVisibilitySelectClass = "toggle-select";
        self.svgClickVisibilityCssId = oHtmlCanvas.attr("id")
        self.svgClickVisibilityCss = depWaitGraphJsHelperSvgClickVisibilityCss();

        depWaitGraphJsHelperClickNodeFocusClear();

        oSvgInner.selectAll("g.output g.edgePaths .edgePath").each( function() { this.classList.add(self.svgClickVisibilityToggleClass); });
        oSvgInner.selectAll("g.output g.nodes .node").each( function() { 
            this.classList.add(self.svgClickVisibilityToggleClass);
            this.addEventListener("click", depWaitGraphJsClickNode);
        });
    };


    function depWaitGraphJsClickNode(oEvt) {
        // only on a job label-group
        if ( oEvt.target.classList.contains("label-group") ) {
            var oEltParent = oEvt.target.closest("g.node");
            if (! oEltParent.classList.contains("job") ) { return; };
  
            var oSvgInner = depWaitGraphDagreGetSvgInner();

            var bCurrentNodeIsAlreadySelected = false;
            if ( oEltParent.classList.contains(self.svgClickVisibilitySelectClass) ) {
                bCurrentNodeIsAlreadySelected = true;
            };
            
            // in all case, remove the protected class from all related nodes and edges
            oSvgInner.selectAll(
                "g.output g.edgePaths ." + self.svgClickVisibilityProtectClass + ", " +
                "g.output g.nodes ." + self.svgClickVisibilityProtectClass
            ).each( function() {
                this.classList.remove(...[self.svgClickVisibilityProtectClass, self.svgClickVisibilitySelectClass]);
            });

            // the toggle was activated on the same node => restore the visibility on the global style, then done
            if (bCurrentNodeIsAlreadySelected) {
               depWaitGraphJsHelperClickNodeFocusClear();
            
            // the toggle was activated for the first time or elsewhere => add the protect class to the node + edges
            } else {
                // add the protection class to the selected job
                oEltParent.classList.add(...[self.svgClickVisibilityProtectClass, self.svgClickVisibilitySelectClass]);

                // and to the connected edges
                // the required job ID is in the dom g.node on the ID with the prefix "job_"
                var sRdJobId = oEltParent.getAttribute("id").replace("job_", "");
                for ( oCurrentEdgeInfo of depWaitGraphDagreGetEdgesForNodeId(sRdJobId) ) {
                    // fun dagre fact : only the base informations are returned, another call is required for the rest of the data (class, text, ...)
                    var oCurrentEdge = depWaitGraphDagreGetEdge({v: oCurrentEdgeInfo.v, w: oCurrentEdgeInfo.w, name: oCurrentEdgeInfo?.name});

                    // the edge name should have been set in the DOM as ID when created, otherwise they are hidden edges
                    if (!oCurrentEdge?.name) { continue; };
                    // also, oSvgInner is a d3 object : .classed(..., true) <=> .classList.add(...)
                    oSvgInner.select("g.output g.edgePaths g#" + oCurrentEdge.name)?.classed(self.svgClickVisibilityProtectClass, true);
                    
                    sNodeIdPrefix = "job_";
                    if ( oCurrentEdge["class"].includes("filelink") ) { sNodeIdPrefix = ""; };
                    
                    // and get the node at the other side of the edge - account of the possible inverted direction
                    var sTargetNodeId = oCurrentEdgeInfo.v;
                    if (sTargetNodeId == sRdJobId) { sTargetNodeId = oCurrentEdgeInfo.w; };
                    oSvgInner.select("g.output g.nodes g#" + sNodeIdPrefix + sTargetNodeId)?.classed(self.svgClickVisibilityProtectClass, true);
                };
                
                // Finally, switch the global style to transparent
                // When the user alter any css rule, this reference  become invalid and raise a NS_ERROR_NOT_AVAILABLE error
                if (! self.svgClickVisibilityCss?.style) { self.svgClickVisibilityCss = depWaitGraphJsHelperSvgClickVisibilityCss(); };
                self.svgClickVisibilityCss.style.filter = "opacity(0.07)";
            };
        };
    };
    

    function depWaitGraphJsTooltipShow(oEvt, sType) {
        var sToolTipText = "";

        var oParentClassList;
        if (oEvt.target.nodeName == "path") {
            oParentClassList = oEvt.target.parentElement.classList;
        } else {
            oParentClassList = oEvt.parentElement.parentElement.classList;
        };

        if (sType == "link") {
            // default link tooltip
            var sTooltipIcon = "";
            var sTooltipType = "";
            var sTooltipDesc = "";
            var sTooltipDescState = "";
            var sTooltipDescSuffix = "";

            if ( oParentClassList.contains("reflink") ) {
                    sTooltipIcon = "far fa-plus-square";
                    sTooltipType = "(Jobref) Reference";
                    sTooltipDesc = "execute the related job";
                    sTooltipDescState = "";

            } else {
                sTooltipIcon = "far fa-arrow-alt-circle-right";
                sTooltipDesc = "wait until";
                sTooltipDescState = "completion";

                if ( oParentClassList.contains("link-soft") ) {
                    sTooltipType = "Soft link";
                    sTooltipDescSuffix = " only if the execution is already present";
                } else {
                    sTooltipType = "Link";
                };

                if ( oParentClassList.contains("link-force") ) {
                    sTooltipIcon = "fas fa-angle-double-right";
                    sTooltipType = "Forced " + sTooltipType.toLowerCase();
                    sTooltipDescSuffix += " or force the execution on timeout";
                };

                if (oParentClassList.contains("link-error")) { sTooltipDescState = "error"; };

                sTooltipType = "(Dependencies) " + sTooltipType;
            };

            if (oParentClassList.contains("link-errorhandler")) {
                sTooltipType += " with errorhandler";
                sTooltipDescSuffix += " when the parent step is in error";
            };

            sToolTipText = '<i class="' + sTooltipIcon + '"></i>' + sTooltipType + ' :  ' + sTooltipDesc + " " + sTooltipDescState + sTooltipDescSuffix;
        };

        self.htmlCanvasTooltip.innerHTML = sToolTipText;
        self.htmlCanvasTooltip.style.display = "unset";
    };


    function depWaitGraphJsTooltipHide() {
        self.htmlCanvasTooltip.style.display = "none";
    };


    self.getCSSRule = (sRuleName, {bRemoteRulesOnly = false, bDebug = false}={}) => {
        // ref : https://stackoverflow.com/questions/1409225/changing-a-css-rule-set-from-javascript
        sRuleName = sRuleName.toLowerCase();
        if (bDebug) { depWaitLog("getCSSRule: searching for rule : " + sRuleName); };
        var styleSheet; var cssRules; var cssRule;
        if (!document.styleSheets) { return false; };
        for (var i = 0; i < document.styleSheets.length; i++) {
            styleSheet = document.styleSheets[i];
            if (bRemoteRulesOnly && !styleSheet.href) { continue; };
            if (styleSheet.cssRules) {
                cssRules = styleSheet.cssRules;
            } else {
                cssRules = styleSheet.rules; // IE style
            }
            if (cssRules) {
                for (var ii = 0; ii < cssRules.length; ii++) {
                    cssRule = cssRules[ii];
                    if (cssRule && cssRule.selectorText) {
                        if (cssRule.selectorText.toLowerCase() == sRuleName) {
                            depWaitLog("getCSSRule: Rule found");
                            return cssRule;
                        };
                    };
                };
            };
        };
        return false;
    };


// #############################################################################
    
    // create a cluster for the target group, add the job into it, and create a parent schedule cluster 
    function depWaitGraphSetClusterGroupAndClusterScheduled(sJobId, sJobGroup, sHour, sMinute = "") {
    
        // create the parent cluster for the schedule
        var sParentClusterId = depWaitGraphSetClusterForSchedule(sHour, sMinute);
        
        // generate the cluster for the job's group
        var sGroupId = sParentClusterId + "#" + sJobGroup;
        
        // create and link the group
        depWaitGraphDagreSetClusterGroupAndClusterScheduled(sJobId, sGroupId, sJobGroup, sParentClusterId);
        
        return {"parentCluster": sParentClusterId, "cluster": sGroupId};
    };


    // create a cluster for the target group, add the job into it, and create a parent "manual launch" cluster 
    function depWaitGraphSetClusterGroupAndClusterManual(sJobId, sJobGroup) {
        return depWaitGraphSetClusterGroupAndClusterScheduled(sJobId, sJobGroup, "manual");
    }


    // create a cluster group for the given hour - supports also ("manual", "") as time
    function depWaitGraphSetClusterForSchedule(sHour, sMinute = "") {
        var sClusterId = depWaitGraphHelperGroupTimeFormat(sHour, sMinute);
        
        if (!self.graph.g.hasNode(sClusterId)) { 
            depWaitLog("depWaitGraphSetClusterForSchedule: new group for " + sClusterId);
            
            var sClusterLabel = "";
            if (sHour != "manual") { 
                sClusterLabel = sClusterId.replace("_", ": "); // + ((sMinute == "") ? "h" : "");
            } else {
                sClusterLabel = "Manual launch"; 
            };

            var nRank = 1;
            if (Number.isInteger(sHour)) { nRank = parseInt(sHour) + 1; };

            depWaitGraphDagreSetClusterScheduleGeneric(sClusterId, {sLabel: sClusterLabel, nRank: 100});
        };
        
        return sClusterId;
        // the setParent() link must not be done here to preserve the cluster order
    };

// #############################################################################

    // node for a job using a manual launch without schedule
    // @param sJobId : job UID
    // @param aJobDef : array / object containing the job basic definition + extra data
    function depWaitGraphSetNodeJobManual(sJobId, aJobDef) {
        depWaitGraphDagreSetNodeJob(sJobId, aJobDef);

        depWaitGraphSetClusterGroupAndClusterManual(sJobId, aJobDef.group);
    };


    // node for a job with a schedule (enabled or not)
    // @param sJobId : job UID
    // @param aJobDef : array / object containing the job basic definition + extra data
    function depWaitGraphSetNodeJobWithSchedule(sJobId, aJobDef) {
        depWaitGraphDagreSetNodeJob(sJobId, aJobDef);

        // create a cluster for the job's group
        depWaitGraphSetClusterGroupAndClusterScheduled(sJobId, aJobDef.group, aJobDef.schedule.hour, aJobDef.schedule.minute);
        
        // keep track of the number of links on the job
        
    };


    // node for a job from another project with informations missing
    // @param sCustomId : job custom UID
    // @param oCustomJob : array / object containing the fake job basic definition + extra data
    function depWaitGraphSetNodeJobOtherProject(sCustomId, oCustomJob) {
        oCustomJob.custom_project_is_current = false;

        var nMarkerWarning = self.aWarningType.none;
        if (!oCustomJob.custom_job_id_found) { nMarkerWarning = self.aWarningType.question; };
 
        depWaitGraphDagreSetNodeJob(sCustomId, oCustomJob, {
            nMarkerWarning: nMarkerWarning,
        });
        
        depWaitGraphAttachUnknownToClusterSchedule(sCustomId, oCustomJob);
    };


    // node for a jobref is created from a normal nodeJob with alterations on the label
    function depWaitGraphSetNodeRef(sCustomId, oCustomJob) {
        var nMarkerWarning = self.aWarningType.none;
        if (!oCustomJob.custom_job_id_found) { nMarkerWarning = self.aWarningType.question; };
        
        var oLabelHtml = depWaitGraphJobLabelHtml(oCustomJob, {nMarkerWarning: nMarkerWarning});
        oLabelHtml.nodeClass += " node-jobref";
        oLabelHtml.label = '<div class="label-marker marker-jobref pull-absolute-top-center" title="Job launched by another job">' + 
                                '<i class="glyphicon glyphicon-book"></i>JobRef</div>' + 
                            '<div class="node-label-overlay overlay-jobref"></div>' +
                            oLabelHtml.label;

        depWaitGraphDagreSetNodeJob(sCustomId, oCustomJob, {
            sLabelOverride: oLabelHtml.label,   // required to keep the altered label
            nMarkerWarning: nMarkerWarning, 
            sClassOverride: oLabelHtml.nodeClass
        });
        
        depWaitGraphAttachUnknownToClusterSchedule(sCustomId, oCustomJob);
    };


    // node for a file
    function depWaitGraphSetNodeFile(sCustomId, oCustomFile) {
        depWaitGraphDagreSetNodeFile(sCustomId, oCustomFile);
        depWaitGraphAttachUnknownToClusterSchedule(sCustomId, oCustomFile);
    }


    // create the schedule cluster and attach the desired node when "custom_attach_to_cluster_schedule = true"
    function depWaitGraphAttachUnknownToClusterSchedule(sCustomId, oCustomJob) {
        if (! oCustomJob.hasOwnProperty("custom_attach_to_cluster_schedule") ) { return; };

        var sClusterScheduleCurrentId;
        if (oCustomJob.custom_attach_to_cluster_schedule.hasOwnProperty("hour")) {
            sClusterScheduleCurrentId = depWaitGraphSetClusterForSchedule(
                oCustomJob.custom_attach_to_cluster_schedule.hour, 
                oCustomJob.custom_attach_to_cluster_schedule.minute
            );

        } else {
            sClusterScheduleCurrentId = depWaitGraphSetClusterForSchedule("manual");
        };

        depWaitGraphDagreSetParent(sCustomId, sClusterScheduleCurrentId);
    };

// #############################################################################

    // hard edge for a job
    function depWaitGraphSetEdgeHard(sJobIdSrc, sJobIdDest, sEdgeName, bExecForce, bStatus) {
        depWaitGraphSetEdgeJob(sJobIdSrc, sJobIdDest, sEdgeName, bExecForce, bStatus, "link-hard");
    };

    // soft edge for a job
    function depWaitGraphSetEdgeSoft(sJobIdSrc, sJobIdDest, sEdgeName, bExecForce, bStatus) {
        depWaitGraphSetEdgeJob(sJobIdSrc, sJobIdDest, sEdgeName, bExecForce, bStatus, "link-soft");
    };

    // basic edge for a job
    function depWaitGraphSetEdgeBasic(sJobIdSrc, sJobIdDest, sEdgeName, bStatus) {
        depWaitGraphSetEdgeJob(sJobIdSrc, sJobIdDest, sEdgeName, false, bStatus, "link-normal");
    };

    // common edge function for a job
    function depWaitGraphSetEdgeJob(sJobIdSrc, sJobIdDest, sEdgeName, bExecForce, bStatus, sClass, sArrowhead = "normal") {
        sClass = "joblink " + sClass + (bExecForce ? " link-force" : "") + (bStatus ? " link-success" : " link-error");
        if (bExecForce) { sArrowhead = "vee"; };
        depWaitGraphDagreSetEdge( sJobIdSrc, sJobIdDest, {sName: sEdgeName, sClass: sClass.trim(), sArrowhead: sArrowhead });
    };


    // edge for a jobref
    function depWaitGraphSetEdgeJobRef(sJobIdSrc, sJobIdDest, sEdgeName, bStatus = true, bIsErrorHandler = false) {
        var sClass =  "reflink" + 
            (bStatus ? " link-success" : " link-error") +
            (bIsErrorHandler ? " link-errorhandler" : "");
        var sArrowhead = "undirected";
        depWaitGraphDagreSetEdge( sJobIdSrc, sJobIdDest, {sName: sEdgeName, sClass: sClass.trim(), sArrowhead: sArrowhead });
    };


    // edge for a file
    function depWaitGraphSetEdgeFile(sJobIdSrc, sJobIdDest, sEdgeName, bExecForce) {
        var sClass =  "filelink" + (bExecForce ? " link-force" : "");
        var sArrowhead = "normal";
        if (bExecForce) { sArrowhead = "vee"; };
        depWaitGraphDagreSetEdge( sJobIdSrc, sJobIdDest, {sName: sEdgeName, sClass: sClass.trim(), sArrowhead: sArrowhead });
    };


// #############################################################################

    function depWaitGraphJobLabelHtml(aJobDef, {sLabelOverride = "", nMarkerWarning = 0} = {}) {
        var sLabelMarkers = "";
        var sLabel = "";
        var sClass = "job";


        if (sLabelOverride != "") {
            return { label: sLabelOverride, nodeClass: sClass.trim()};
        };

        if (nMarkerWarning > 0 ) {
            var sIcon = "";
            var sTooltip = "";

            switch (nMarkerWarning) {
                case self.aWarningType.warning:
                    sIcon = "fas fa-exclamation-triangle"
                    sTooltip = "Anomaly in the definition";
                    break;

                case self.aWarningType.question:
                    sIcon = "fas fa-question-circle";
                    sTooltip = "Job definition is unknown in the current project";
                    break;
                    
                case self.aWarningType.exclamation:
                    sIcon = "fas fa-exclamation-circle";
                    sTooltip = "Houston we've got a problem !";
                    break;
                    
                default:
                    // nothing
                    break;
            };
            sLabelMarkers += '<div class="label-marker-warning pull-absolute-top-left" title="' + sTooltip + '"><i class="' + sIcon + '"></i></div>';
        };

        if (aJobDef.hasOwnProperty("enabled") && !aJobDef.enabled) {
            sClass += " node-disabled";
            sLabelMarkers += '<div class="label-marker-warning marker-disabled pull-absolute-top-left" title="Job execution is disabled">' + 
                                '<i class="fas fa-power-off"></i></div>' + 
                            '<div class="node-label-overlay overlay-disabled"></div>';
        };

        if (aJobDef.hasOwnProperty("custom_slot")) {
            sLabelMarkers += '<div class="label-marker marker-slot pull-absolute-top-right" title="Slot restrictions on ' + aJobDef.custom_slot.length + ' step(s)">' +  
                aJobDef.custom_slot.join("+") + 
                '</div>';
        };

        if (aJobDef.hasOwnProperty("custom_notification")) {
            sLabelMarkers += '<div class="label-marker marker-notification pull-absolute-bottom-left" title="Notifications : ' + aJobDef.custom_notification.fullNotification +'">' + 
                '<i class="far fa-bell"></i>' +
                aJobDef.custom_notification.simpleNotification +
                '</div>';
        };

        // the schedule was reworked as a basic string by the data parser fonction
        var sSchedule = "";
        var sScheduleTooltip = "";
        var sScheduleClass = "text-success";    // rd class
        var sScheduleIcon = "far fa-clock";

        if (aJobDef.hasOwnProperty("schedule") && aJobDef.scheduled) {
            sSchedule = aJobDef.schedule.simpleLabel;
            sScheduleTooltip = aJobDef.schedule.fullLabel;

            if (!aJobDef.scheduleEnabled) {
                sScheduleTooltip = "(disabled) "+ sScheduleTooltip;
                sScheduleClass = "text-warning";    // rd class
                sScheduleIcon = "far fa-pause-circle"
            };

        } else if (aJobDef.hasOwnProperty("custom_project_is_current") && !aJobDef.custom_project_is_current) {
            sSchedule = "external";
            sScheduleTooltip = "Definition not accessible";
            sScheduleIcon = "far fa-clock";

        } else {
            sSchedule = "manual";
            sScheduleTooltip = "No schedule defined";
            sScheduleIcon = "far fa-play-circle";
        };
        
        var sLabelProject = "";
        if ( aJobDef.hasOwnProperty("custom_project_is_current") )  {
            if (aJobDef.custom_project_is_current && nMarkerWarning == 0 ) {
                if (self.htmlJobLabelShowHrefLink) {
                    aJobDef.name = '<a href="' + self.rdUrlScheduledExecutionShow + "/" + aJobDef.id + '" target="_blank" title="Open the job definition">' +
                                  aJobDef.name +
                                  '</a>';
                };
            } else {
                sLabelProject = '<div class="label-project-external">Project: ' + aJobDef.project + '</div>';    
            }
        };
        var sLabelGroup = '<div class="label-group">' + aJobDef.group + '</div>';
        var sLabelName = '<div class="label-name">' + aJobDef.name + '</div>';            

        sLabel += sLabelGroup + sLabelName + sLabelProject;
        sLabel += '<div class="label-marker marker-schedule pull-absolute-bottom-right ' + sScheduleClass + '" title="' + sScheduleTooltip + '"><i class="' + sScheduleIcon + '"></i>' + sSchedule + '</div>';

        return { label: sLabelMarkers + sLabel, nodeClass: sClass.trim()};
    };


    function depWaitGraphFileLabelHtml(aFileDef, {sLabelOverride = ""} = {}) {
        var sLabelMarkers = "";
        var sLabel = "";
        var sClass = "file";

        if (aFileDef.flag_verify_hash) {
            // also : "far fa-check-circle"
            sLabelMarkers += '<div class="label-marker marker-hash pull-relative-right" title="File hash is verified"><i class="fas fa-hashtag"></i></div>';
        };

        if (aFileDef.flag_type) {
            sLabelMarkers += '<div class="label-marker marker-flag pull-relative-right" title="A flag file is expected when the transfer is complete"><i class="fas fa-flag"></i></div>';
        };
        
        sLabel = '' + 
            '<div class="label-empty"></div>' +
            '<div class="label-file-host">Host: ' + aFileDef.target_host + '</div>' +
            '<div class="label-file-name" title="' + aFileDef.target_file +'"><i class="far fa-file-alt"></i>' + aFileDef.target_file + '</div>' +
            '<div class="label-file-dir" title="' + aFileDef.target_directory +'"><i class="far fa-folder-open"></i>' + aFileDef.target_directory + '</div>';

        return { label: sLabelMarkers + sLabel, nodeClass: sClass.trim()};
    };


// Tools #######################################################################

    // generate an array with the workflow hours or hours + minutes
    function depWaitGraphScheduleTimeOrder() {
    
        // sequence is from 15h to 00h to 14h. Manual is placed first
        var aScheduleOrder = [depWaitGraphHelperGroupTimeFormat("manual"), depWaitGraphHelperGroupTimeFormat("*/*")];
        var nWorkflowStartHour = 15     // Also referenced as the pivot time
        var nWorkflowEndHour = nWorkflowStartHour - 1 
        
        for ( let i of Array.prototype.concat.apply([], [self.intSequence(nWorkflowStartHour, 23, 1), self.intSequence(0, nWorkflowEndHour, 1)]) ) { 
            if (!self.clusterTimePrecisionMinute) {
                if (clusterTimeCreateAll) { depWaitGraphSetClusterForSchedule(i); };
                aScheduleOrder.push( depWaitGraphHelperGroupTimeFormat(i) );

            // add the quarter minutes to each hour - from 0 to 45, 15 mins increments
            } else {
                for (let m of self.intSequence(0, 45, 15) ) {
                    if (clusterTimeCreateAll) { depWaitGraphSetClusterForSchedule(i, m); };
                    aScheduleOrder.push( depWaitGraphHelperGroupTimeFormat(i, m) );
                };
            };
        };
        return aScheduleOrder;
    };


    // create an array [start ... end ] filled with a sequence of numbers increased by the step
    // @param nStart : [start ...]
    // @param nEnd : [...end]
    // @param nStep : increase value
    self.intSequence = (nStart, nEnd, nStep = 1) => {
        var oRet = [];
        for (var i = nStart; i <= nEnd; i += nStep) { oRet.push(i); };
        return oRet;
    };