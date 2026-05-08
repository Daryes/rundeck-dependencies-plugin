// loaded by workflow-init.js
// helper : graph functions using Dagre-D3
// TODO: make a class of this file ?

    var self = this;
    self.rdplugin = window.RDPLUGIN["ui-dependencies-wait-workflow"];
    self.pluginName = self.rdplugin.name;
    self.clusterTimePrecisionMinute = self.rdplugin.canvas_schedule_group_precision_minute ?? false;
    self.graphLayoutConstraints = [];       // format: [{left: "nodeA", right: "nodeB"}, ...]
    self.graph = {};                        // updated in depWaitGraphInit()


    // must be duplicated
    function depWaitLog(sMessage) {
        console.log(self.pluginName + ":" + sMessage);
    };


    function depWaitGraphDagreCanvasInit() {
        depWaitLog("depWaitGraphDagreInit: graph initial configuration");
        // ref: https://dagrejs.github.io/project/dagre-d3/latest/demo/clusters.html
        // ref: https://github.com/dagrejs/dagre/wiki#configuring-the-layout
        // ref: https://github.com/dagrejs/graphlib/wiki/API-Reference#graph-concepts

        self.graph.g = new dagreD3.graphlib.Graph({
            directed: true,                     // default
            compound: true,                     // allow clusters (groups of nodes)
            multigraph: true,                   // shouldn't be required, but mistakes can happen
        })
            .setGraph({
                rankdir: "LR",                  // Direction for the graph - default : "TB", can be TB, BT, LR, or RL, where T = top, B = bottom, L = left, and R = right
                align: "",                      // Alignment for rank nodes - default : "", can be UL, UR, DL, or DR, where U = up, D = down, L = left, and R = right
                rankalign: "center",            // Alignment for same rank nodes - default : "center", can be 'top' | 'center' | 'bottom' | undefined;
                ranker: "network-simplex",      // Type of algorithm to assigns a rank - default : "network-simplex", other : "tight-tree", "longest-path" but might fail on complex graphs
            })
            .setDefaultEdgeLabel(function() { return {}; });
    };


    // clear any items under the <g> node allowing to refresh the data and redraw the graph
    function depWaitGraphDagreClearForRefresh(oHtmlCanvas) {
        if (! self.graph.hasOwnProperty("svg")) { return; };

        // edges should be removed when using removeNode()
        for (oElt of self.graph.g.edges()) {
            self.graph.g.removeEdge(oElt.v, oElt.w);
        };
        
        var c = 0;
        while (self.graph.g.nodes().length > 0) {
            c++;
            for (sElt of self.graph.g.nodes()) {
                if (self.graph.g.children(sElt).length > 0) { continue; };
                self.graph.g.setParent(sElt);
                self.graph.g.removeNode(sElt);
            };
            
            if (c > 5) { break; }; // houston we have a problem, there should be 3 loops top : nodes, group clusters, time clusters
        }; 

        /*
        * Aaaannnnnnnnd that's not enough : dagre does not support the removal of clusters.
        * So instead, recreate a new graph while removing all svg/html/variables elements of the previous one.
        * Hence why the other functions do not have a presence check and are fully executed.
        * The removeNode/Edge() is still applied to clear the memory
        */
        d3.select(oHtmlCanvas.prop("nodeName") + "#" + oHtmlCanvas.attr("id")).select("*").remove();
        self.graph = {};
    };


    // called before render()
    function depWaitGraphDagreLayout() {
        depWaitLog("depWaitGraphDagreLayout: graph layout last updade before rendering");

        // ref: https://github.com/dagrejs/dagre/pull/302
        dagreD3.dagre.layout(self.graph.g, {constraints: self.graphLayoutConstraints});
        
        // ref: https://github.com/dagrejs/dagre/pull/263
        // dagreD3.dagre.layout(self.graph.g, { disableOptimalOrderHeuristic: false });
    }


    // @param oHtmlCanvas : the svg DOM element
    // @param oHtmlCanvasHolder : the parent (or grandparent) DOM element containing the canvas, to resize and make visible
    var depWaitGraphDagreRender = (oHtmlCanvas, oHtmlCanvasHolder) => {
        depWaitLog("depWaitGraphDagreRender: graph renderer configuration using D3");

        // ref: https://github.com/dagrejs/dagre-d3/wiki#demos
        self.graph.render = new dagreD3.render();
        self.graph.svg = d3.select(oHtmlCanvas.prop("nodeName") + "#" + oHtmlCanvas.prop("id")),
            self.graph.inner = self.graph.svg.append("g");
        
        self.graph.render(self.graph.inner, self.graph.g);

        depWaitLog("depWaitGraphDagreRender: graph viewport size");
        // adjust the <svg> height to the graph size => disabled : parent height is fixed to the screen size
        // self.graph.svg.attr('height', self.graph.g.graph().height * 0.50 + 40);
        oHtmlCanvasHolder.height(window.innerHeight * 0.90);
        oHtmlCanvasHolder.width(window.innerWidth * 0.95);
        oHtmlCanvas.parent().height(oHtmlCanvasHolder.height() * 0.90);
        oHtmlCanvas.parent().width(oHtmlCanvasHolder.width() * 0.97);
        

        depWaitLog("depWaitGraphDagreRender: graph zoom support");
        self.graph.zoom = d3.zoom()
            /* .on("zoom", function() {    // D3 v5
                self.graph.inner.attr("transform", d3.event.transform); 
             */
            .on("zoom", function(e) {   // D3 v7
                self.graph.inner.attr("transform", e.transform);
            });
        self.graph.svg.call(self.graph.zoom);
        
        
        // must be after the svg global size is set and after the zoom is activated
        depWaitLog("depWaitGraphDagreRender: graph initial scale and center");
        var fInitialScale = 0.50;
        
        var nXCenterOffset = (oHtmlCanvas.width() - self.graph.g.graph().width * fInitialScale) / 2;
        var nYCenterOffset = (oHtmlCanvas.height() - self.graph.g.graph().height * fInitialScale) / 1.5;
        self.graph.svg.call(
            self.graph.zoom.transform, 
            d3.zoomIdentity.translate(nXCenterOffset, nYCenterOffset).scale(fInitialScale)
        );
    };


    function depWaitGraphDagreGetSvgInner() {
        return self.graph.inner;
    };

// Clusters ####################################################################


    // create a cluster for the target group, add the job into it, and create a parent schedule cluster 
    function depWaitGraphDagreSetClusterGroupAndClusterScheduled(sJobId, sGroupId, sJobGroup, sParentClusterId) {

        if (!self.graph.g.hasNode(sGroupId)) {
            // depWaitLog("depWaitGraphDagreSetClusterGroupAndClusterScheduled: new group for " + sGroupId);

            // automatically resized when nodes are inserted into
            self.graph.g.setNode(sGroupId, {
                label: "Group: " + sJobGroup,
                labelType: "text",
                clusterLabelPos: 'top',
                class: "cluster-group-jobs",         // this is ignored on clusters, hence using *style : https://github.com/dagrejs/dagre-d3/issues/420
                style: 'fill: var(--colors-gray-200);',
                rank: 99,                           // TODO: does rank can prevent the single colum effect with "...g.children(sParentClusterId).length" 
                // labelStyle: "see CSS",
            });
            self.graph.g.setParent(sGroupId, sParentClusterId);
        };
        self.graph.g.setParent(sJobId, sGroupId);
    };


    // create a standard cluster for schedules
    function depWaitGraphDagreSetClusterScheduleGeneric(sClusterId, {sLabel = "", sClass = "cluster-schedule", nRank = 1}={}) {
        if (self.graph.g.hasNode(sClusterId)) { return; };
        
        // automatically resized when nodes are inserted into
        self.graph.g.setNode(sClusterId, {
            label: sLabel,
            labelType: "text",
            clusterLabelPos: 'top',
            rank: nRank,            // dagre v2+, does not seems to work
            class: sClass,          // this is ignored on clusters, hence using *style : https://github.com/dagrejs/dagre-d3/issues/420
            style: "stroke: var(--colors-gray-100); fill: var(--colors-gray-100);",
            labelStyle: "text-decoration: underline;",
        });
    };


    function depWaitGraphDagreSetParent(sNodeId, sParentId) {
        self.graph.g.setParent(sNodeId, sParentId);
    };


// Nodes #######################################################################
    

    // node for a job
    function depWaitGraphDagreSetNodeJob(sJobId, aJobDef, {sLabelOverride = "", nMarkerWarning = 0, sClassOverride = ""} = {}) {
        var nPaddingWidth = 3; var nPaddingHeigth = 3;
        var nNodeWidth  = 300;  var nLabelWidth = nNodeWidth - (nPaddingWidth * 2); 
        var nNodeHeight = 100; var nLabelHeight = nNodeHeight - (nPaddingHeigth * 2);

        var oLabelHtml = depWaitGraphJobLabelHtml(aJobDef, {sLabelOverride: sLabelOverride, nMarkerWarning: nMarkerWarning});

        // rx=ry=? => round corners
        self.graph.g.setNode(sJobId, {
            id: "job_" + sJobId,    // undocumented, add the desired ID to the DOM
            shape: "rect",
            label: depWaitGraphDagreDefineCanvasLabel({sLabel: oLabelHtml.label, nWidth: nLabelWidth, nHeight: nLabelHeight}),
            labelType: "svg",
            width:  nNodeWidth,
            height: nNodeHeight,
            padding: 0,             // also : paddingLeft paddingRight paddingTop paddingBottom
            class: (sClassOverride == "" ? oLabelHtml.nodeClass : sClassOverride),
            rank: 5,
            rx: 7,
            ry: 7,
        });
    };


    // node for a file
    function depWaitGraphDagreSetNodeFile(sFileId, aFileDef, {sLabelOverride = ""} = {}) {
        var nPaddingWidth = 3; var nPaddingHeigth = 3;
        var nNodeWidth  = 200;  var nLabelWidth = nNodeWidth - (nPaddingWidth * 2); 
        var nNodeHeight = 75; var nLabelHeight = nNodeHeight - (nPaddingHeigth * 2);

        var oLabelHtml = depWaitGraphFileLabelHtml(aFileDef, {sLabelOverride: sLabelOverride});

        // rx=ry=? => round corners
        self.graph.g.setNode(sFileId, {
            id: sFileId,            // undocumented, add the desired ID to the DOM
            shape: "rect",          // also polygon, ellipse, circle ?
            label: depWaitGraphDagreDefineCanvasLabel({sLabel: oLabelHtml.label, nWidth: nLabelWidth, nHeight: nLabelHeight}),
            labelType: "svg",
            width:  nNodeWidth,
            height: nNodeHeight,
            padding: 0,             // also : paddingLeft paddingRight paddingTop paddingBottom
            class: oLabelHtml.nodeClass,
            rank: 1,
            rx: 40,
            ry: 40,
        });
    };
    

    // Final label construction
    // when using labelType=html, Dagre-d3 will compute a box with vertical position and size redefined each time, depending of the length and width of the text
    // => using SVG instead of html will keep the size as defined, without alteration
    // when using SVG, an object is expected => no templating, keep the compute low
    function depWaitGraphDagreDefineCanvasLabel({sLabel, nWidth, nHeight, sClass = "label"}={}) {
        var oLabel = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        oLabel.setAttribute("width",  nWidth.toString());
        oLabel.setAttribute("height", nHeight.toString());

        // forcing the class here due to rundeck CSS interfering on the foreignObject
        oLabel.innerHTML = '<div class="' + sClass + '" xmlns="http://www.w3.org/1999/xhtml">' +
                              sLabel +
                           '</div>';
        return oLabel;
    };

// Edges #######################################################################


    // generic edge - named optional parameters - arrowhead = "normal", "vee", "undirected"
    function depWaitGraphDagreSetEdge(sJobIdSrc, sJobIdDest, {sName = "", sLabel = "", sClass = "", nWeight = 1, sArrowhead = "vee"}={} ) {

        // ref curves : https://d3js.org/d3-shape/curve#curves
        // sName is only used for multigraph duplicates, ignored if missing
        // notice : for multigraph, the documentation is directing to "{name: ...}", while "name" must also be in the core parameters at the end
        self.graph.g.setEdge(sJobIdSrc, sJobIdDest, {
            name: sName,                // required for multigraph
            label: sLabel,
            labelType: "html",
            id: sName,                  // undocumented, add the desired ID to the DOM
            class: sClass,
            arrowhead: sArrowhead,
            arrowheadClass: ("arrowhead " + sClass).trim(),
            // curve: d3.curveStepBefore,  // <= better for TB orientation but need the connectors to be only on 2 sides, and not all 4
            curve: d3.curveBasis,
            weight: nWeight,
            minlen: 2,
        }, sName);                      // required for multigraph
    };


    // edge designed to link major clusters between them - must not be visible
    function depWaitGraphDagreSetEdgeHiddenLink(sIdSrc, sIdDest, {nMinLen = 1} = {}) {
        // depWaitLog("depWaitGraphDagreSetEdgeHiddenLink: link for " + sIdSrc + " => " + sIdDest + " of len=" + nMinLen.toString());

        if (nMinLen < 1) { nMinLen = 1; };
        self.graph.g.setEdge(sIdSrc, sIdDest, {
            label: "",
            arrowhead: "undirected",
            class: "schedule-link",
            minlen: nMinLen,
            weight: self.graph.g.edgeCount() + 10,  // = 100 ?
        });
    };


    // Dagre frequently crashes when linking 2 clusters together
    // => create in the schedule clusters 2 hidden nodes linked by a hidden egde to force the order
    // Alternative : create all clusters first ? Maybe too much information on the graph
    // WARNING : https://github.com/dagrejs/dagre-d3/issues/152  => use hidden nodes in each group and link them together in order
    function depWaitGraphDagreSetEdgeForAllScheduleGroups() {
        depWaitLog("depWaitGraphDagreSetEdgeForAllScheduleGroups: linking schedule groups");

        var nLinkLengthFactor = 2;     // increase the link length to reach a minimum size where Dagre respects the alignment

        var scheduleOrder = depWaitGraphScheduleTimeOrder();
        
        var sClusterPrevious = ""; var sLinkPrevious = "";
        var sClusterCurrent = ""; var sLinkCurrent = "";
        var bInverted = false;
        var oDagreConstraints = [];

        for (let sClusterCurrent of scheduleOrder) {
            if (! self.graph.g.hasNode(sClusterCurrent)) { continue; };
            // depWaitLog("depWaitGraphDagreSetEdgeForAllScheduleGroups: cluster " + sClusterCurrent);

            var nLinkLength = depWaitGraphDagreGetChildrenRecurse(sClusterCurrent).length;
            if ( sClusterCurrent.includes("manual") ) { nLinkLength = 2 };   // prevent a too large cluster, but need a minimum size to keep it aligned
            if ( nLinkLength < 2 ) { nLinkLength = 0 };
            nLinkLength = nLinkLength * nLinkLengthFactor;  // TODO: use instead something based on  f=ln(1/x)


            // add hidden nodes to force the order between the clusters
            // this is required as dagrejs does not allow edges between clusters (nodes with children)
            // ref : https://github.com/dagrejs/dagre-d3/issues/152
            // the invert allow prevents a staircase effect in the output
            var aSequence = ["top", "bottom"];
            if (bInverted) { aSequence = ["bottom", "top"]; };

            for (let i = 0; i < aSequence.length; i++) {
                var sIdNodeLink = sClusterCurrent + "_link_" + aSequence[i];
                self.graph.g.setNode(sIdNodeLink, {
                    label: "",
                    width: 10,
                    height: 10,
                    class: "schedule-link link-" + aSequence[i],
                    rank: 99,       // requires dagre v3 but does even not seems to work
                });
                self.graph.g.setParent(sIdNodeLink, sClusterCurrent);
            };

            // link the current cluster to the previous one using the nodes
            if (sClusterPrevious !== "") {
                sLinkPrevious = sClusterPrevious + "_link_bottom";
                sLinkCurrent =  sClusterCurrent + "_link_top";
                depWaitGraphDagreSetEdgeHiddenLink(sLinkPrevious, sLinkCurrent);
            };
            // And also link the 2 hidden nodes of the current cluster together
            // Use a minimum length for the edge to prevent Dagre flattening the graph
            depWaitGraphDagreSetEdgeHiddenLink(sClusterCurrent + "_link_top" , sClusterCurrent + "_link_bottom", {nMinLen: nLinkLength});

            sClusterPrevious = sClusterCurrent;
            bInverted = ! bInverted;
        };
    };


    // dagre only returns the children of a cluster on one level, more depth is required
    function depWaitGraphDagreGetChildrenRecurse(sClusterName) {
        aRet = [];

        var aChilds = self.graph.g.children(sClusterName);
        
        if (aChilds.length > 0) {
            // Array.prototype.push.apply(aRet, aChilds);

            for (let sSubChild of aChilds) {
                // only 2 levels required
                var aSubChilds = self.graph.g.children(sSubChild);

                if (aSubChilds.length > 0) { Array.prototype.push.apply(aRet, aSubChilds); };
            };
        };

        return aRet;
    };

    function depWaitGraphDagreGetEdgesForNodeId(sNodeId) {
        return self.graph.g.nodeEdges(sNodeId);
    };

    function depWaitGraphDagreGetEdge({v, w, name = ""}={}) {
        if (name && name != "") {
            return self.graph.g.edge(v, w, name);
        }
        return self.graph.g.edge(v, w);
    };


// Backup ######################################################################

    // generate a json from the graph data
    function depWaitGraphDagreBackupSave() {
        // ref: https://github.com/dagrejs/graphlib/wiki/API-Reference#json-write
        return dagreD3.graphlib.json.write(self.graph.g);
    };
    
    // generate a graph from a json definition
    function depWaitGraphDagreBackupLoad(sGraphJsonBackup) {
        self.graph = dagreD3.graphlib.json.read(JSON.parse(sGraphJsonBackup));
    };
