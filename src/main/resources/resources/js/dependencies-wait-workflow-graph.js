// loaded by workflow-init.js
// helper : functions to extract data from job definitions
// TODO: make a class of this file ?

    var self = this;
    self.rdplugin = window.RDPLUGIN["ui-dependencies-wait-workflow"];
    self.pluginName = self.rdplugin.name;
    self.clusterTimePrecisionMinute = self.rdplugin.canvas_schedule_group_precision_minute ?? 0;
    self.clusterTimeCreateAll = self.rdplugin.canvas_schedule_group_create_all ?? "false";
    self.htmlJobLabelShowHrefLink = self.rdplugin.canvas_job_label_show_href_link ?? "false";
    self.htmlCanvasTooltip = document.getElementById(self.rdplugin.canvas_tooltip);
    self.htmlEdgeLabelShow = self.rdplugin.canvas_edge_labels ?? false;

    self.htmlTagDataPrefix = "data-uidww"
    self.htmlTagDataTooltip = self.htmlTagDataPrefix + "-tooltip"
    self.htmlTagDataType = self.htmlTagDataPrefix + "-type"

    self.project = appLinks.project_name;  // provided by RD, alternative to jQuery => rundeckPage
    self.rdUrlScheduledExecutionShow = appLinks.scheduledExecutionDetailFragment.replace("/detailFragment", "/show");   // appLinks.scheduledExecutionShow does not exist

    self.cookieName = {"project": self.pluginName + "_project", "graph": self.pluginName + "_graph"}

    self.aWarningType = {"none": 0, "warning": 1, "question": 2, "exclamation": 3 };

    // FA icons depending of the element class - only those used multiple times
    self.aLinkIcons = { "link-success": "far fa-arrow-alt-circle-right fa-border",
                        "link-force": "fas fa-angle-double-right fa-border",
                        "link-wait": "far fa-clock fa-border",
                        "link-error": "fas fa-arrow-circle-right fa-border",
                        "link-errorhandler": "fas fa-redo-alt fa-flip-horizontal fa-border",
                        "link-halt": "fas fa-exclamation fa-border",
                        "link-fail": "fas fa-times-circle fa-border",
                        // "link-soft": "",    // no icon
                        "reflink": "glyphicon glyphicon-book",
                        // "reflink": "fas fa-book fa-border",
                        "statelink": "fas fa-sort fa-border",
                        };


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
        var bFullInit = true;
        // for refresh, it is required to clear all recorded elements to get a new canvas to draw upon
        self.aGraphDataRecordObjectList.clear();
        self.aGraphDataRecordEdgeList.clear();
        // depWaitGraphHelperClearTimeFormat();  <= not required, the data is generic

        depWaitGraphDagreClearForRefresh(oHtmlCanvas);
        depWaitGraphD3MinimapClearForRefresh(oHtmlCanvas);

        /* TODO : cache of the graph 
        var sCookieProject = depWaitGraphSessionJarGetProject();
        if (sCookieProject && sCookieProject == self.project) {
            bFullInit = !depWaitGraphSessionJarGetGraphData();
        }
        */
        if (bFullInit) {
            depWaitGraphDagreCanvasInit();
        };
        
        return bFullInit;
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
        // depWaitGraphD3Minimap(oHtmlCanvas);

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
            if (!oEdge.hasOwnProperty("nWeight")) { oEdge.nWeight = 2; };

            switch(oEdge?.nEntityType ?? aNodeTypes.job ) {
                case aNodeTypes.job:
                    switch (oEdge?.nLinkType ?? aLinkTypes.basiclink) {
                        case aLinkTypes.basiclink:
                            depWaitGraphSetEdgeBasic(oEdge);
                            break;

                        case aLinkTypes.hardlink:
                            depWaitGraphSetEdgeHard(oEdge);
                            break;

                        case aLinkTypes.softlink:
                            depWaitGraphSetEdgeSoft(oEdge);
                            break;
                        
                        default:
                            break;
                    };
                    break;

                case aNodeTypes.ref:
                    depWaitGraphSetEdgeJobRef(oEdge);
                    break;

                case aNodeTypes.file:
                    depWaitGraphSetEdgeFile(oEdge);
                    break;

                case aNodeTypes.stateCond:
                    depWaitGraphSetEdgeJobState(oEdge);
                    break;
            };
        });
    };


// Javascript to SVG elements ##################################################

    // add js event to SVG elements - the functions are for now independant and will add their own properties on the svg objects
    function depWaitGraphJsAddToSvgPath(oHtmlCanvas) {
        // ref: https://dagrejs.github.io/project/dagre-d3/latest/demo/hover.html
        // ref: https://codepen.io/billdwhite/pen/OJLeLR
        var oSvgInner = depWaitGraphDagreGetSvgInner();

        depWaitGraphJsTooltipRegister(oHtmlCanvas, oSvgInner);

        depWaitGraphJsFocusRegister(oHtmlCanvas, oSvgInner);
    };


    //--------------------------------------------------------------------------
    // register mouse events on specific objects for the focus effect
    // @param oSvgHtmlCanvas : the SVG canvas html object
    // @param oSvgCanvasInner : the SVG dagre.graph.inner object
    function depWaitGraphJsFocusRegister(oSvgHtmlCanvas, oSvgGraphInner) {
        // ref: https://dagrejs.github.io/project/dagre-d3/latest/demo/hover.html

        // add a focus behavior to toggle the visibility of nodes and edges
        // => a visible/hide class on all nodes/edges with its rule switched to on or off depending of the state
        // => a protect class to disable the visibility effect on specific nodes & edges
        self.svgClickVisibilityToggleClass = "toggle-visibility";
        self.svgClickVisibilityProtectClass = "toggle-visible-protect";
        self.svgClickVisibilitySelectClass = "toggle-select";
        self.svgClickVisibilityCssId = oSvgHtmlCanvas.attr("id");
        self.svgClickVisibilityCssFullPath = "#" + self.svgClickVisibilityCssId + 
                                             " ." + self.svgClickVisibilityToggleClass + ":not(." + self.svgClickVisibilityProtectClass + ")";
        self.svgClickVisibilityCss = depWaitGraphJsHelperSvgClickVisibilityCss();

        depWaitGraphJsHelperClickNodeFocusClear();

        // to work, the visibility class must be positonned on the same node than the protect class, which is set on the ID
        // => nodes and edges are the same, but label has their ID set on an additional level
        oSvgGraphInner.selectAll("g.output g.edgePaths .edgePath" + ", " + 
                                 "g.output g.edgeLabels .edgeLabel g.label"
        ).each(
            function() { this.classList.add(self.svgClickVisibilityToggleClass);
        });

        // register the clic event on nodes
        oSvgGraphInner.selectAll("g.output g.nodes .node").each( function() { 
            this.classList.add(self.svgClickVisibilityToggleClass);
            this.addEventListener("click", depWaitGraphJsFocusNode);
        });
    }


    // get a handle to the given global css rule - put in a function as used at different location
    function depWaitGraphJsHelperSvgClickVisibilityCss() {
        return self.getCSSRule( self.svgClickVisibilityCssFullPath, 
                    { bRemoteRulesOnly: true }
                );
    };


    // dedicated function due to the refresh button
    function depWaitGraphJsHelperClickNodeFocusClear() {
        if (self.svgClickVisibilityCss) { self.svgClickVisibilityCss.style.filter = "opacity(1)"; };
    };


    // focus function for nodes on mouse event
    function depWaitGraphJsFocusNode(oEvt) {
        // execute only on a label-group element
        if ( oEvt.target.classList.contains("label-group") ) {
            // TODO : see the key events (boolean) : oEvt.ctrlKey, oEvt.shiftKey, oEvt.altKey

            var oEltParent = oEvt.target.closest("g.node");
            if (! oEltParent.classList.contains("job") ) { return; };

            var oSvgInner = depWaitGraphDagreGetSvgInner();

            var bCurrentNodeIsAlreadySelected = false;
            if ( oEltParent.classList.contains(self.svgClickVisibilitySelectClass) ) {
                bCurrentNodeIsAlreadySelected = true;
            };
            
            // in all case, remove the protected class from all related nodes and edges
            oSvgInner.selectAll(
                "g.output g.edgeLabels ." + self.svgClickVisibilityProtectClass + ", " +
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

                    // The edge name should have been set in the DOM as ID when created, otherwise they are hidden edges
                    // And the edge label reuse the same ID
                    if (!oCurrentEdge?.name) { continue; };
                    // also, oSvgInner is a d3 object : .classed(..., true) <=> .classList.add(...)
                    oSvgInner.selectAll("g.output g.edgePaths g#" + oCurrentEdge.name + "," +
                                        "g.output g.edgeLabels g#" + oCurrentEdge.name
                                        )?.classed(self.svgClickVisibilityProtectClass, true);


                    // and get the node at the other side of the edge - account of the possible inverted direction
                    sNodeIdPrefix = "job_";
                    if ( oCurrentEdge["class"].includes("filelink") ) { sNodeIdPrefix = ""; };

                    var sTargetNodeId = oCurrentEdgeInfo.v;
                    if (sTargetNodeId == sRdJobId) { sTargetNodeId = oCurrentEdgeInfo.w; };
                    oSvgInner.select("g.output g.nodes g#" + sNodeIdPrefix + sTargetNodeId)?.classed(self.svgClickVisibilityProtectClass, true);
                };
                
                // Finally, switch the global style to transparent
                try {
                    self.svgClickVisibilityCss.style.filter = "opacity(0.07)";

                // When the user alter any css rule, this reference become invalid and raise a NS_ERROR_NOT_AVAILABLE error - try again
                } catch (e) {
                    self.svgClickVisibilityCss = depWaitGraphJsHelperSvgClickVisibilityCss();
                    self.svgClickVisibilityCss.style.filter = "opacity(0.07)";
                }
            };
        };
    };


    //--------------------------------------------------------------------------
    // register the mouse events on specific objects for tooltip support
    // @param oSvgHtmlCanvas : the SVG canvas html object
    // @param oSvgCanvasInner : the SVG dagre.graph.inner object
    function depWaitGraphJsTooltipRegister(oSvgHtmlCanvas, oSvgGraphInner) {
        // ref: https://dagrejs.github.io/project/dagre-d3/latest/demo/hover.html
        // ref: https://codepen.io/billdwhite/pen/OJLeLR

        self.svgTooltipSvgCanvas = oSvgHtmlCanvas;
        self.svgTooltipSvgGraphInner = oSvgGraphInner;

        // list of elements to add tooltip on hover
        var aHtmlSelectors = [ {type: "node", selector: "g.nodes g.label div.label", subElt: "div"},                    // label area for nodes
                               {type: "link", selector: "g.edgePaths g:not(.schedule-link)", subElt: "path, marker"},   // all edges
                               {type: "link-label", selector: "g.edgeLabel g.label div.label", subElt: "i"},            // label icons for edgeLabels
                             ];

        for (oCurrentSelect of aHtmlSelectors) {
            var oSvgElts = oSvgGraphInner.selectAll(oCurrentSelect.selector);
            oSvgElts.selectAll(oCurrentSelect.subElt).each( function() {
                this.setAttribute(self.htmlTagDataType, oCurrentSelect.type);
                this.addEventListener("mouseover", depWaitGraphJsTooltipShow);
                this.addEventListener("mouseout", depWaitGraphJsTooltipHide);
            });
        };
        depWaitGraphJsTooltipHide();
    };

    // hide the tooltip area
    function depWaitGraphJsTooltipHide() {
        self.htmlCanvasTooltip.style.display = "none";
    };


    // print tooltips in the panel footer
    function depWaitGraphJsTooltipShow(oEvt) {
        var oElement = oEvt.target;
        var sType = "";
        var sToolTipText = "";
        var bIsManaged = false;

        // manage <a href> elements
        if (oElement.nodeName == "A") { oElement = oElement.parentElement; };

        // all elements
        if (oElement.hasAttribute(self.htmlTagDataType)) { sType = oElement.getAttribute(htmlTagDataType); bIsManaged = true; };
        if (oElement.hasAttribute(self.htmlTagDataTooltip)) { sToolTipText = oElement.getAttribute(htmlTagDataTooltip); bIsManaged = true; };

        if (!bIsManaged) { return; };

        if (sToolTipText != "") {
            // default action
            sToolTipText = sToolTipText.replace(/(.*?): /, '<b>$1:</b> ');

        } else if (sType == "node") {
            if (oElement.classList.contains("label-group")) {
                sToolTipText = "Job group : " + oElement.textContent + " &#9479 <em>(Click to use or move the focus mode)</em>";
            } else if (oElement.classList.contains("label-name")) {
                sToolTipText = "Job name : " + oElement.textContent + " &#9479 <em>(Click to open the definition)</em>"
            };
            sToolTipText = sToolTipText.replace(/(.*?): /, '<b>$1:</b> ');

        } else if (sType == "link" || sType == "link-label") {
            var oParentClassList;
            // default link tooltip
            var sTooltipIcon = "";
            var sTooltipDescState = "";
            sToolTipText = "";
            var sToolTipTextType = "";


            // extract the html classes of the element
            if (sType == "link-label") {
                // retrieve the related link of the label
                var sLinkId = oEvt.target.parentElement.parentElement.parentElement.parentElement.id;
                // svgCanvas is a jquery object
                oElement = self.svgTooltipSvgCanvas.find("g.edgePaths g#" + sLinkId)[0];
                oParentClassList = oElement.classList;

            } else if (oElement.nodeName == "path") {
                oParentClassList = oElement.parentElement.classList;

            } else {
                oParentClassList = oEvt.parentElement.parentElement.classList;
            };


            // main link types
            if ( oParentClassList.contains("reflink") ) {
                sTooltipIcon = "reflink " + self.aLinkIcons["reflink"];
                sToolTipText = '<i class="' + sTooltipIcon + '"></i><b>(Jobref)</b> Reference : inline execution of the related job';

            } else if ( oParentClassList.contains("statelink") ) {
                sTooltipDescState = "success";
                if (oParentClassList.contains("link-error")) { sTooltipDescState = "error"; };
                sTooltipIcon = "statelink " + self.aLinkIcons["statelink"];
                sToolTipText = '<i class="' + sTooltipIcon + '"></i><b>(State)</b> Job state conditional : Assert that another job is in ' + sTooltipDescState;

            } else if ( oParentClassList.contains("joblink") || oParentClassList.contains("filelink") ) {
                sTooltipIcon = "link-success";
                sToolTipTextType = "Job"; 

                if ( oParentClassList.contains("filelink") ) { sToolTipTextType = "File"; sTooltipIcon = "filelink"; };
                sTooltipIcon += " " + self.aLinkIcons["link-success"];

                if ( oParentClassList.contains("link-error") ) { sTooltipIcon = "link-error " + self.aLinkIcons["link-error"]; };

                if ( oParentClassList.contains("link-soft") ) {
                    if (oParentClassList.contains("link-error")) { sTooltipDescState = "for error "; };
                    sToolTipText += ' <i class="' + sTooltipIcon + '"></i><b>(Dependencies) ' + sToolTipTextType + ' soft link :</b> wait ' + sTooltipDescState + 'only if the execution is present';

                } else {
                    sTooltipDescState = "until completion";
                    if (oParentClassList.contains("link-error")) { sTooltipDescState = "until error"; };
                    sToolTipText += ' <i class="' + sTooltipIcon + '"></i><b>(Dependencies) ' + sToolTipTextType + ' link :</b> wait ' + sTooltipDescState;
                };

                if ( oParentClassList.contains("link-force") ) {
                    sTooltipIcon = "link-force " + self.aLinkIcons["link-force"];
                    sToolTipText += ' <i class="' + sTooltipIcon + '"></i>Forced : launch forced on timeout';
                };

                if ( oParentClassList.contains("link-wait") ) {
                    sTooltipIcon = "link-wait " + self.aLinkIcons["link-wait"];
                    sToolTipText += ' <i class="' + sTooltipIcon + '"></i>Max wait : timeout duration modified';
                };
            };

            // additional states on links
            if ( oParentClassList.contains("link-errorhandler") ) {
                sTooltipIcon = "link-handler " + self.aLinkIcons["link-errorhandler"];
                sToolTipText += ' <i class="' + sTooltipIcon + '"></i>Errorhandler : when the parent step is in error';
            };

            if ( oParentClassList.contains("link-halt") ) {
                var sFinalText = "Halt : if succeded, halt the current job as success"
                sTooltipIcon = "link-halt " + self.aLinkIcons["link-halt"];
                sToolTipText += ' <i class="' + sTooltipIcon + '"></i>';

                if ( oParentClassList.contains("link-fail") ) {
                    sTooltipIcon = "link-halt " + self.aLinkIcons["link-fail"];
                    sToolTipText += ' <i class="' + sTooltipIcon + '"></i>';
                    var sFinalText = "Halt & fail : if succeded, halt the current job as failed"
                };
                sToolTipText += sFinalText;
            };
        };

        self.htmlCanvasTooltip.innerHTML = sToolTipText;
        self.htmlCanvasTooltip.style.display = "unset";
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
        oLabelHtml.label = '<div class="label-marker marker-jobref pull-absolute-top-center" ' + self.htmlTagDataTooltip + '="Jobref : Job launched by another job">' +
                                '<i class="' + self.aLinkIcons["reflink"] + '"></i>JobRef</div>' +
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
    function depWaitGraphSetEdgeHard(oEdgeDef) {
        depWaitGraphSetEdgeJob(oEdgeDef, "link-hard");
    };

    // soft edge for a job
    function depWaitGraphSetEdgeSoft(oEdgeDef) {
        depWaitGraphSetEdgeJob(oEdgeDef, "link-soft");
    };

    // basic edge for a job
    function depWaitGraphSetEdgeBasic(oEdgeDef) {
        depWaitGraphSetEdgeJob(oEdgeDef, "link-normal");
    };

    // common edge function for a job
    function depWaitGraphSetEdgeJob(oEdgeDef, sClass) {
        var sArrowhead = "normal";
        if (oEdgeDef.bForce) { sArrowhead = "vee"; };
        var oLabelClass = depWaitGraphEdgeClassLabelHtml(oEdgeDef, "joblink " + sClass);
        var sLabel = oLabelClass["htmlLabel"];
        var sClass = oLabelClass["htmlClass"];

        depWaitGraphDagreSetEdge(oEdgeDef.sTargetId, oEdgeDef.sSourceId, {sName: oEdgeDef.sEdgeId, sClass: sClass.trim(), sArrowhead: sArrowhead, sLabel: sLabel });
    };


    // edge for a jobref
    function depWaitGraphSetEdgeJobRef(oEdgeDef) {
        var sArrowhead = "undirected";
        var oLabelClass = depWaitGraphEdgeClassLabelHtml(oEdgeDef, "reflink");
        var sLabel = oLabelClass["htmlLabel"];
        var sClass = oLabelClass["htmlClass"];

        depWaitGraphDagreSetEdge(oEdgeDef.sTargetId, oEdgeDef.sSourceId, {sName: oEdgeDef.sEdgeId, sClass: sClass.trim(), sArrowhead: sArrowhead, sLabel: sLabel });
    };


    // edge for a jobref
    function depWaitGraphSetEdgeJobState(oEdgeDef) {
        var sArrowhead = "normal";
        var oLabelClass = depWaitGraphEdgeClassLabelHtml(oEdgeDef, "statelink");
        var sLabel = oLabelClass["htmlLabel"];
        var sClass = oLabelClass["htmlClass"];

        depWaitGraphDagreSetEdge(oEdgeDef.sTargetId, oEdgeDef.sSourceId, {sName: oEdgeDef.sEdgeId, sClass: sClass.trim(), sArrowhead: sArrowhead, sLabel: sLabel });
    };

    // edge for a file
    function depWaitGraphSetEdgeFile(oEdgeDef) {
        var sArrowhead = "normal";
        if (oEdgeDef.bForce) { sArrowhead = "vee"; };
        var oLabelClass = depWaitGraphEdgeClassLabelHtml(oEdgeDef, "filelink");
        var sLabel = oLabelClass["htmlLabel"];
        var sClass = oLabelClass["htmlClass"];

        depWaitGraphDagreSetEdge(oEdgeDef.sTargetId, oEdgeDef.sSourceId, {sName: oEdgeDef.sEdgeId, sClass: sClass.trim(), sArrowhead: sArrowhead, sLabel: sLabel });
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
                    sTooltip = "Warning : Job definition is unknown in the current project";
                    break;
                    
                case self.aWarningType.exclamation:
                    sIcon = "fas fa-exclamation-circle";
                    sTooltip = "Critical : Houston we've got a problem !";
                    break;
                    
                default:
                    // nothing
                    break;
            };
            sLabelMarkers += '<div class="label-marker-warning pull-absolute-top-left" ' + self.htmlTagDataTooltip + '="' + sTooltip + '"><i class="' + sIcon + '"></i></div>';
        };

        if (aJobDef.hasOwnProperty("enabled") && !aJobDef.enabled) {
            sClass += " node-disabled";
            sLabelMarkers += '<div class="label-marker-warning marker-disabled pull-absolute-top-left" ' + self.htmlTagDataTooltip + '="Job state : execution is disabled">' +
                                '<i class="fas fa-power-off"></i></div>' +
                            '<div class="node-label-overlay overlay-disabled"></div>';
        };

        if (aJobDef.hasOwnProperty("custom_slot")) {
            sLabelMarkers += '<div class="label-marker marker-slot pull-absolute-top-right" ' + self.htmlTagDataTooltip + '="(Dependencies) Slots : restriction on ' + aJobDef.custom_slot.length + ' step(s)">' +
                aJobDef.custom_slot.join("+") +
                '</div>';
        };

        if (aJobDef.hasOwnProperty("custom_notification")) {
            sLabelMarkers += '<div class="label-marker marker-notification pull-absolute-bottom-left" ' + self.htmlTagDataTooltip +'="Notifications : ' + aJobDef.custom_notification.fullNotification +'">' +
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
                sScheduleTooltip = sScheduleTooltip.replace(/(.*?): /, '$1 (Disabled) : ');
                sScheduleClass = "text-warning";    // rd class
                sScheduleIcon = "far fa-pause-circle"
            };

        } else if (aJobDef.hasOwnProperty("custom_project_is_current") && !aJobDef.custom_project_is_current) {
            sSchedule = "external";
            sScheduleTooltip = "Schedule : definition is not accessible";
            sScheduleIcon = "far fa-clock";

        } else {
            sSchedule = "manual";
            sScheduleTooltip = "Manual launch : no schedule defined";
            sScheduleIcon = "far fa-play-circle";
        };
        
        var sLabelProject = "";
        if ( aJobDef.hasOwnProperty("custom_project_is_current") )  {
            if (aJobDef.custom_project_is_current && nMarkerWarning == 0 ) {
                if (self.htmlJobLabelShowHrefLink) {
                    aJobDef.name = '<a href="' + self.rdUrlScheduledExecutionShow + "/" + aJobDef.id + '" target="_blank">' +
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
        sLabel += '<div class="label-marker marker-schedule pull-absolute-bottom-right ' + sScheduleClass + '" ' + self.htmlTagDataTooltip + '="' + sScheduleTooltip + '"><i class="' + sScheduleIcon + '"></i>' + sSchedule + '</div>';

        return { label: sLabelMarkers + sLabel, nodeClass: sClass.trim()};
    };


    function depWaitGraphFileLabelHtml(aFileDef, {sLabelOverride = ""} = {}) {
        var sLabelMarkers = "";
        var sLabel = "";
        var sClass = "file";

        if (aFileDef.flag_verify_hash) {
            // also : "far fa-check-circle"
            sLabelMarkers += '<div class="label-marker marker-hash pull-relative-right" ' + self.htmlTagDataTooltip + '="(Dependencies) Files : The file hash is verified"><i class="fas fa-hashtag"></i></div>';
        };

        if (aFileDef.flag_type) {
            sLabelMarkers += '<div class="label-marker marker-flag pull-relative-right" ' + self.htmlTagDataTooltip + '="(Dependencies) Files : A flag file is expected when the transfer is complete"><i class="fas fa-flag"></i></div>';
        };
        
        sLabel = '' + 
            '<div class="label-empty"></div>' +
            '<div class="label-file-host" ' + self.htmlTagDataTooltip + '="File host : ' + aFileDef.target_host +'">Host: ' + aFileDef.target_host + '</div>' +
            '<div class="label-file-name" ' + self.htmlTagDataTooltip + '="File name : ' + aFileDef.target_file +'"><i class="far fa-file-alt"></i>' + aFileDef.target_file + '</div>' +
            '<div class="label-file-dir" ' + self.htmlTagDataTooltip + '="File directory : ' + aFileDef.target_directory +'"><i class="far fa-folder-open"></i>' + aFileDef.target_directory + '</div>';

        return { label: sLabelMarkers + sLabel, nodeClass: sClass.trim()};
    };


    function depWaitGraphEdgeClassLabelHtml(oEdgeDef, sClassName, {sLabelOverride = ""} = {}) {
        if (!self.htmlEdgeLabelShow) { return false; };

        var sLabel = "";
        var sLabelMarkers = "";
        var sClass = sClassName;


        if (oEdgeDef?.nEntityType == depWaitHelperJobGetDependencyType().ref) {
            sLabelMarkers += '<div class="reflink"><i class="' + self.aLinkIcons["reflink"] + '"></i></div>';
            // no class here
        };

        if (oEdgeDef?.nEntityType == depWaitHelperJobGetDependencyType().stateCond) {
            sLabelMarkers += '<div class="statelink"><i class="' + self.aLinkIcons["statelink"] + '"></i></div>';
            // no class here
        };

        // job type must always has the status class
        if (oEdgeDef.hasOwnProperty("bLinkStatus") || oEdgeDef?.nEntityType == depWaitHelperJobGetDependencyType().job) {
            // no label here
            sClass += ((oEdgeDef.bLinkStatus ?? true) ? " link-success" : " link-error");
        };


        if (oEdgeDef?.bForce) {
            sLabelMarkers += '<div class="joblink link-force"><i class="' + self.aLinkIcons["link-force"] + '"></i></div>';
            sClass += " link-force";
        };

        if (oEdgeDef?.bMaxWait) {
            sLabelMarkers += '<div class="joblink link-wait"><i class="' + self.aLinkIcons["link-wait"] + '"></i></div>';
            sClass += " link-wait";
        };

        if (oEdgeDef?.bHalt) {
            sLabelMarkers += '<div class="joblink link-halt"><i class="' + self.aLinkIcons["link-halt"] + '"></i></div>';
            sClass += " link-halt";
        };

        if (oEdgeDef?.bFail) {
            sLabelMarkers += '<div class="joblink link-fail"><i class="' + self.aLinkIcons["link-fail"] + '"></i></div>';
            sClass += " link-fail";
        };

        // handler is generic - must be last
        if (oEdgeDef?.bIsErrorHandler) {
            sLabelMarkers += '<div class="joblink link-handler"><i class="' + self.aLinkIcons["link-errorhandler"] + '"></i></div>';
            sClass += " link-errorhandler";
        }

        return {htmlClass: sClass, htmlLabel: sLabelMarkers}
    };


// Session cookies #############################################################

    function depWaitGraphSessionJarSave(sRdProject) {
        return;

        /* TODO
        checkJarCookieStorageQuota();

        // for limiting a cookie to the session, leave "expires" and "max-age" absent
        // format : "cookiename=value; path=/"
        sessionStorage.setItem(self.cookieName.project, sRdProject);

        sessionStorage.setItem(self.cookieName.graph, JSON.stringify( depWaitGraphDagreBackupSave() ) );
        */
    };


    function depWaitGraphSessionJarGetProject() {
        var sRet = "";
        if (self.cookieName && self.cookieName.project) {
            var sData = sessionStorage.getItem(self.cookieName.project);
            if (sData) { sRet = sData; };
        };
        return sRet;
    };


    function depWaitGraphSessionJarGetGraphData() {
        var bLoaded = false;
        if (self.cookieName && self.cookieName.graph) {
            var sData = sessionStorage.getItem(self.cookieName.graph);
            if (sData) {
                try {
                    depWaitGraphDagreBackupLoad( JSON.parse(sData) );
                    bLoaded = true;
                } catch (error) {
                    depWaitLog("Warning: invalid graph data from the cookie - full reload of the project data");
                };
            };
        };
        return bLoaded;
    };


    // ref: https://www.slingacademy.com/article/manage-data-limits-and-quotas-in-javascript-storage/
    function checkJarCookieStorageQuota() {
      let usedBytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);
        usedBytes += localStorage.getItem(key).length;
      }
      depWaitLog(`Maximum storage: ${usedBytes} bytes`);
      return usedBytes;
    }


    function getJarCookie(sName) {
        var oMatch = document.cookie.match(new RegExp('(^| )' + sName + '=([^;]+)'));
        if (oMatch) return oMatch[2];
    };


// Tools #######################################################################

    // generate an array with the workflow hours or hours + minutes
    function depWaitGraphScheduleTimeOrder() {
    
        // sequence is from 15h to 00h to 14h. Manual is placed first
        var aScheduleOrder = [depWaitGraphHelperGroupTimeFormat("manual"), depWaitGraphHelperGroupTimeFormat("*/*")];
        var nWorkflowStartHour = 15     // Also referenced as the pivot time
        var nWorkflowEndHour = nWorkflowStartHour - 1 
        
        for ( let i of Array.prototype.concat.apply([], [self.intSequence(nWorkflowStartHour, 23, 1), self.intSequence(0, nWorkflowEndHour, 1)]) ) { 
            // add the minute precision to each hour
            for (let m of self.intSequence(0, 59, self.clusterTimePrecisionMinute) ) {
                if (clusterTimeCreateAll) { depWaitGraphSetClusterForSchedule(i, m); };
                aScheduleOrder.push( depWaitGraphHelperGroupTimeFormat(i, m) );
            };
        };
        return aScheduleOrder;
    };


    // create an array [start ... end ] filled with a sequence of numbers increased by the step
    // @param nStart : [start ...]
    // @param nEnd : [...end]
    // @param nStep : increase value. If nStep < 1 the result will be : [start]
    self.intSequence = (nStart, nEnd, nStep = 1) => {
        var oRet = [];
        if (nStep < 1) { nStep = nEnd + 1; };
        for (var i = nStart; i <= nEnd; i += nStep) { oRet.push(i); };
        return oRet;
    };