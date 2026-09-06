// loaded by workflow-init.js
// helper : functions to generate a minimap
// TODO: make a class of this file ?

    var self = this;
    self.rdplugin = window.RDPLUGIN["ui-dependencies-wait-workflow"];
    self.pluginName = self.rdplugin.name;

    self.graphMinimap = {};


// #############################################################################

    // @param oHtmlCanvas : the jQuery object of the SVG canvas, the minimap will be created alongside
    var depWaitGraphD3Minimap = (oHtmlCanvas) => {
        depWaitLog("depWaitGraphD3Minimap: minimap rendering");

        const sHtmlCanvasMinimapId = oHtmlCanvas.attr("id") + "-minimap";
        const sMinimapIdClone = "minimap-clone";
        const sMinimapIdCaret = "minimap-caret";
        self.graphMinimap.scaling = {};


        // minimap initial size xx% of the window size
        self.graphMinimap.reduceFactor = 0.15;
        // border size around the minimap
        self.graphMinimap.borderFactor = 1.05 ;

       
        var oHtmlCanvasMinimap = oHtmlCanvas.parent().children("svg#" + sHtmlCanvasMinimapId);

        if (!oHtmlCanvasMinimap || oHtmlCanvasMinimap.prop("id") != sHtmlCanvasMinimapId) {
            oHtmlCanvasMinimap = jQuery(document.createElementNS('http://www.w3.org/2000/svg', "svg"));
            oHtmlCanvasMinimap.attr("id", sHtmlCanvasMinimapId);

            oHtmlCanvas.parent().append(oHtmlCanvasMinimap);
        };
        self.graphMinimap.canvas = oHtmlCanvasMinimap;

        // minimap size at xx% of the window size
        self.graphMinimap.canvas.width(oHtmlCanvas.width() * self.graphMinimap.reduceFactor);
        self.graphMinimap.canvas.height(oHtmlCanvas.height() * self.graphMinimap.reduceFactor);


        // jquery and js clone() functions choke on SVG elements - while they are created in the DOM, they are raw html and not visually rendered as SVG
        // d3 is able to handle a SVG clone, and as we're using it anyway, switch everything to d3
        depWaitLog("depWaitGraphD3Minimap: cloning the graph data");
        self.graphMinimap.svg = d3.select(oHtmlCanvasMinimap.prop("nodeName") + "#" + oHtmlCanvasMinimap.prop("id"));
        
        self.graphMinimap.clone = self.graphMinimap.svg.append("g")
                                        .attr("id", sMinimapIdClone);

        self.graphMinimap.clone.append("g")
                                .attr("class", "output");
        // get also the parent canvas as a d3 object
        self.graphMinimap.canvasParent = d3.select(oHtmlCanvas.prop("nodeName") + "#" + oHtmlCanvas.prop("id"));

        // clone the canvas in the minimap - only the clusters
        // d3.append() handle objects through a function, which itself expects a .node() object
        self.graphMinimap.clone.select("g.output").append( () => self.graphMinimap.canvasParent.select("g.clusters").clone(true).node() );

        // The SVG clone must fit in the minimap - need to scale it down
        // retrieve the real dimensions of the svg diagram - structure is : SVGRect{ x, y, width, height }
        self.graphMinimap.canvasParentBBox = self.graphMinimap.canvasParent.node().getBBox();
        // adjust the scale to the largest dimension / lowest scale
        var fScaleX = self.graphMinimap.canvas.width() / self.graphMinimap.canvasParentBBox.width ;
        var fScaleY = self.graphMinimap.canvas.height() / self.graphMinimap.canvasParentBBox.height ;
        self.graphMinimap.scaling.scale = fScaleX; if (fScaleY < fScaleX) { self.graphMinimap.scaling.scale = fScaleY };

        // the clone will also need to be centered on both axis - the positions are for the minimap after the scaling
        self.graphMinimap.scaling.parentBBoxWidthScaled =  self.graphMinimap.canvasParentBBox.width  * self.graphMinimap.scaling.scale
        self.graphMinimap.scaling.parentBBoxHeightScaled = self.graphMinimap.canvasParentBBox.height * self.graphMinimap.scaling.scale
        
        self.graphMinimap.scaling.moveX = (self.graphMinimap.canvas.width()  - self.graphMinimap.scaling.parentBBoxWidthScaled) / 2;
        self.graphMinimap.scaling.moveY = (self.graphMinimap.canvas.height() - self.graphMinimap.scaling.parentBBoxHeightScaled) / 2;


        // create the rectangle for the zoom area and link it to the zoom function
        self.graphMinimap.inner = self.graphMinimap.clone.append("g")
                                            .attr("id", sMinimapIdCaret)
                                            .attr("class", "output");

        // no position, the transform for the clone will do the work also for the caret
        self.graphMinimap.rect = self.graphMinimap.inner.append('g')
            .attr("class", "zoom-area")
            .append('rect')
                .attr("id", "zoom-area")
                .attr("width", oHtmlCanvas.width() )
                .attr("height", oHtmlCanvas.height() )
                ;


        // set the final scaling and position of the full minimap
        self.graphMinimap.clone.attr('transform', d3.zoomIdentity.translate(
                                                        self.graphMinimap.scaling.moveX, 
                                                        self.graphMinimap.scaling.moveY
                                                    ).scale(self.graphMinimap.scaling.scale)
                                    );
    };

    function depWaitGraphD3MinimapZoomEvent(e) {
        // prevent any error when called before the minimap/rect objects are created
        if ( !self.graphMinimap || !self.graphMinimap.rect || !e.transform) { return; };

        var modifiedTransform = d3.zoomIdentity
            .scale( 1 / e.transform.k )
            .translate( - e.transform.x, - e.transform.y )
            ; 
       
        // the width and dasharray are recalculated to always keep the same apparent size
        self.graphMinimap.rect
            .attr("stroke-width", Math.floor(2 / self.graphMinimap.scaling.scale / modifiedTransform.k) )
            .attr("stroke-dasharray", Math.floor(2 / self.graphMinimap.scaling.scale / modifiedTransform.k) )
            .attr('transform', modifiedTransform);
    };


    // wrapper due to self.graphMinimap not accessible outside this script
    function depWaitGraphD3MinimapGetRect() {
        return self.graphMinimap.rect;
    };


    function depWaitGraphD3MinimapClearForRefresh(oHtmlCanvas) {
        if ( !self.graphMinimap.canvas ) { return; };

        self.graphMinimap.canvas.empty();
        self.graphMinimap = {};
    };


    // return the transform matrix from a SVG object
    function depWaitGraphD3MinimapSvgGetMatrix(sSvgCanvasPropName, sSvgCanvasPropId) {
        return d3.select(sSvgCanvasPropName + "#" + sSvgCanvasProp)
            .transform
            .baseVal
            .getItem(0)
            .matrix
    };