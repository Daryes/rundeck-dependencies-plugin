// loaded by workflow-init.js
// helper : functions to extract data from job definitions
// TODO: make a class of this file ?

    var self = this;
    self.rdplugin = window.RDPLUGIN["ui-dependencies-wait-workflow"];
    self.pluginName = self.rdplugin.name;
    self.project = appLinks.project_name;  // provided by RD, alternative to jQuery => rundeckPage
    self.clusterTimePrecisionMinute = self.rdplugin.canvas_schedule_group_precision_minute ?? false;
    self.clusterAttachUnknownNode  = self.rdplugin.canvas_node_unknown_attach_in_time_cluster ?? false;

    self.aYesNoStr = {"true": true, "false": false, 
                      "yes": true, "no": false, 
                      "1": true, "0": false, 
                      "success": true, "error": false
                    };
    self.aDepTargetType = {"job": 0, "file": 1, "slot": 2, "basic": 3, "ref": 4};
    self.aLinkType = {"basiclink": 0, "hardlink": 1, "softlink": 2, "noedgelink": 3};

// #############################################################################


    // record the detailled data of the jobs using their ID as key
    self.aRdJobDataId = new Map();
    function depWaitHelperJobGetJobDataFromId(sJobId) {
        return self.aRdJobDataId.get(sJobId) ?? {};
    };
    
    function depWaitHelperJobClearJobDataFromId() {
        self.aRdJobDataId.clear();
    };
    
    function depWaitHelperJobSetJobDataFromId(sJobId, oJobDef) {
        self.aRdJobDataId.set(sJobId, oJobDef);
    };
    
    function depWaitHelperJobKeysJobDataFromId() {
        return self.aRdJobDataId.keys();
    };


    // Create a cache referencing job names as the index to return their ids, instead of parsing each time the initial array
    self.aRdJobDataGroupNameToId = new Map();
    function depWaitHelperJobRecordNameToId(sGroupName, sJobName, sJobId) {
        self.aRdJobDataGroupNameToId.set(sGroupName + '/' +  sJobName, sJobId);
    };

    function depWaitHelperJobGetNameToId(sGroupName, sJobName) {
        return self.aRdJobDataGroupNameToId.get(sGroupName + "/" + sJobName ) ?? "";
    };

    // used when refreshing the graph
    function depWaitHelperJobClearNameToId() {
        self.aRdJobDataGroupNameToId.clear();
    };


    function depWaitHelperJobGetDependencyType() {
            return self.aDepTargetType;
    };

    function depWaitHelperJobGetLinkType() {
            return self.aLinkType;
    };


    // generate a hash of a string used to have unique ID
    function depWaitHelperJobGenerateHash(sStringToHash) {
        return self.generateHash(sStringToHash);
    };


    // return both the original schedule structure + a simplified version as {simpleLabel, hour, minute, seconds}
    function depWaitHelperJobDefSchedule(aJobDef) {
        oRet = {};
        if (!aJobDef.schedule) { return oRet; };
            
        // structure : "time": {"hour": "05", "minute": "01", "seconds": "0"}
        if (aJobDef.schedule.time) {
            oRet = aJobDef.schedule.time;
            oRet["simpleLabel"] = aJobDef.schedule.time.hour + ":" + aJobDef.schedule.time.minute + ":" + aJobDef.schedule.time.seconds;
            oRet["fullLabel"] = ("schedule: " + 
                                    "year: " + JSON.stringify(aJobDef.schedule.year) + 
                                    ", month: " + JSON.stringify(aJobDef.schedule.month) + 
                                    ", " + JSON.stringify(aJobDef.schedule.weekday) + 
                                    ", time: " + oRet["simpleLabel"]
                                ).replaceAll('"', '');

        // structure: "crontab": "0 30 */6 ? Jan Mon *"
        //  convert it using the time{hour:,minute:,seconds:} format
        } else if (aJobDef.schedule.crontab) {
            var aSplit = aJobDef.schedule.crontab.split(" ");
            // TODO: manage "*" and "/x" values
            oRet["seconds"] = aSplit[0];
            oRet["minute"] = aSplit[1];
            oRet["hour"] = aSplit[2];

            oRet["simpleLabel"] = oRet["hour"] + ":" + oRet["seconds"] + ":" + oRet["minute"];
            oRet["fullLabel"] = "Crontab: " + aJobDef.schedule.crontab;

        } else {
            // not supported
        };

        return oRet;
    };


    function depWaitHelperJobDefNotification(aJobDef) {
        oRet = {};
        if (!aJobDef.notification) { return oRet; };

        oRet["fullNotification"] = "";
        oRet["simpleNotification"] = "";

        for (let sNotif of ["onStart", "onSuccess", "onFailure", "onRetryableFailure", "onAvgDuration"]) {
            if ( aJobDef.notification.hasOwnProperty(sNotif) || aJobDef.notification.hasOwnProperty(sNotif.toLowerCase()) ) {
                oRet["fullNotification"] += sNotif + " ";
                oRet["simpleNotification"] += sNotif.substring(2,4) + " ";
            };
        };

        oRet["fullNotification"] = oRet["fullNotification"].trim();
        oRet["simpleNotification"] = oRet["simpleNotification"].trim();
        return oRet;
    };
    


    // common settings for the dependency-wait plugins
    function depWaitHelperJobDefStepCommand_DependencyWaitCommon(aStepCmd) {
        var oRet = {};

        oRet.force_launch = self.aYesNoStr[ aStepCmd?.force_launch?.toLowerCase() ?? "false" ]; // the property is optional
        return oRet;
    };


    /*
    * Parse and generate an array/list with the essential information for the current step module
    * Also record the informations to create shadow nodes if required and any link type (dependency, ref, ...)
    * @param oMinimalJobDef : the short job definition from project
    * @param oFullJobDef : the full job definition
    * @param aStepCmd : one of the objects under <job>.sequence.commands[{}]
    */
    function depWaitHelperJobDefStepCommand_DependencyWaitJob(oMinimalJobDef, oFullJobDef, aStepCmd) {
        var oRet = depWaitHelperJobDefStepCommand_DependencyWaitCommon(aStepCmd);
        
        oRet.custom_type = depWaitHelperJobGetDependencyType().job;
        oRet.project = self.convertJobVars( aStepCmd.target_project, self.project, oFullJobDef );
        oRet.group = self.convertJobVars( aStepCmd.target_group, self.project, oFullJobDef );
        oRet.name = self.convertJobVars( aStepCmd.target_job, self.project, oFullJobDef );
        oRet.link_status = self.aYesNoStr[aStepCmd.status_job];

        var nLinkType = self.aLinkType.hardlink;
        if (aStepCmd.softlink.indexOf("softlink") !== -1) { nLinkType = self.aLinkType.softlink; };
        oRet.link_type = nLinkType;
        
        // retrieve the job id from the recorded list
        var sTargetJobId = depWaitHelperJobGetNameToId(oRet.group, oRet.name);
        var bTargetJobIdFound = true;

        // generate a custom uid when the job was not found in the current project
        // not using .length on purpose 
        if (sTargetJobId == "") {
            sTargetJobId = oRet.project + "#" + oRet.group + "/" + oRet.name;
            sTargetJobId = "project_" + depWaitHelperJobGenerateHash(sTargetJobId);
            bTargetJobIdFound = false;
        };

        oRet.custom_id = sTargetJobId;
        oRet.custom_job_id_found = bTargetJobIdFound;

        // warning for a job from the current project which does not exist
        if (!oRet.custom_job_id_found) {
            // record the data to create a logical node used later for the edges
            if (self.clusterAttachUnknownNode) { oRet.custom_attach_to_cluster_schedule = oMinimalJobDef?.schedule ?? {}; };
            depWaitGraphDataRecordNodeList(oRet);
        };

        // record the data of the graph edges to create them after all other node objects
        depWaitGraphDataRecordEdgeList({
            sSourceId: oFullJobDef.id,
            sTargetId: oRet.custom_id,
            nLinkType: oRet.link_type,
            bLinkStatus: oRet.link_status,
            bForce: oRet.force_launch,
            nEntityType: oRet.custom_type,
        });

        return oRet;
    };


    /*
    * Parse and generate an array/list with the essential information for the current step module
    * Also record the informations to create shadow nodes if required and any link type (dependency, ref, ...)
    * @param oMinimalJobDef : the short job definition from project
    * @param oFullJobDef : the full job definition
    * @param aStepCmd : one of the objects under <job>.sequence.commands[{}]
    */
    function depWaitHelperJobDefStepCommand_DependencyWaitFile(oMinimalJobDef, oFullJobDef, aStepCmd) {
        var oRet = depWaitHelperJobDefStepCommand_DependencyWaitCommon(aStepCmd);

        oRet.custom_type = depWaitHelperJobGetDependencyType().file;
        oRet.target_host = self.convertJobVars(aStepCmd.target_host, self.project, oFullJobDef) ;
        oRet.target_directory = self.convertJobVars(aStepCmd.target_directory, self.project, oFullJobDef) ;
        oRet.target_file = self.convertJobVars(aStepCmd.target_file, self.project, oFullJobDef) ;
        oRet.flag_type = self.aYesNoStr[aStepCmd.flag_type] ;
        // without a flag verify is ignored
        if (oRet.flag_type) {
            oRet.flag_verify_hash = self.aYesNoStr[aStepCmd.flag_verify_hash] ;
        } else {
            oRet.flag_verify_hash = false;
        };
        
        oRet.link_type = self.aLinkType.hardlink;

        oRet.custom_id = "file_" + 
            depWaitHelperJobGenerateHash(oRet.target_host) + 
            "_" + depWaitHelperJobGenerateHash(oRet.target_directory) + 
            "_" + depWaitHelperJobGenerateHash(oRet.target_file)
            ;

        oRet.custom_job_id_found = true;

        // record a shadow node of the file the step is waiting for
        if (self.clusterAttachUnknownNode) { oRet.custom_attach_to_cluster_schedule = oMinimalJobDef?.schedule ?? {}; };
        depWaitGraphDataRecordNodeList(oRet);

        // record the data of the graph edges to create them after all other node objects
        depWaitGraphDataRecordEdgeList({
            sSourceId: oFullJobDef.id,
            sTargetId: oRet.custom_id,
            nLinkType: oRet.link_type,
            bLinkStatus: true,
            bForce: oRet.force_launch,
            nEntityType: oRet.custom_type,
        });

        return oRet;
    };


    /*
    * Parse and generate an array/list with the essential information for the current step module
    * @param oMinimalJobDef : the short job definition from project
    * @param oFullJobDef : the full job definition
    * @param aStepCmd : one of the objects under <job>.sequence.commands[{}]
    */
    function depWaitHelperJobDefStepCommand_DependencyWaitSlot(oMinimalJobDef, oFullJobDef, aStepCmd) {
        var oRet = depWaitHelperJobDefStepCommand_DependencyWaitCommon(aStepCmd);

        oRet.type = "slot";
        oRet.custom_type = depWaitHelperJobGetDependencyType().slot;
        oRet.slot_project = self.convertJobVars(aStepCmd.target_project, self.project, oFullJobDef) ;
        oRet.slot = aStepCmd.target_slot;

        // no link for the slot module, the data is inserted into the job's definition to create a visual marker in the label for the job
        if (!oMinimalJobDef.hasOwnProperty("custom_slot")) { oMinimalJobDef.custom_slot = []; };
        oMinimalJobDef.custom_slot.push(oRet.slot);

        return oRet;
    };


    /*
    * Parse and generate an array/list with the essential information for the current step module
    * Also record the informations to create shadow nodes if required and any link type (dependency, ref, ...)
    * @param oMinimalJobDef : the short job definition from project
    * @param oFullJobDef : the full job definition
    * @param aStepCmd : one of the objects under <job>.sequence.commands[{}]
    */
    function depWaitHelperJobDefStepCommand_jobref(oMinimalJobDef, oFullJobDef, aStepCmd) {
        var oRet = {};
        var sTargetJobId = "";
        var bLinkStatus = true;

        oRet.custom_type = depWaitHelperJobGetDependencyType().ref;

        if (aStepCmd.hasOwnProperty("project")) {
            oRet.project = self.convertJobVars( aStepCmd.project, self.project, oFullJobDef );
        } else {
            oRet.project = self.project;
        };

        oRet.custom_project_is_current = false;
        if (self.project == oRet.project) {
            oRet.custom_project_is_current = true;
        };
        
        var bUseTargetGroupName = false;
        if (self.aYesNoStr[aStepCmd.useName]) {
            bUseTargetGroupName = true;

        } else {
            sTargetJobId = aStepCmd.uuid;   // only use the provided ID when useName = false
            var oTargetJobDef = depWaitHelperJobGetJobDataFromId(sTargetJobId);
            if (oTargetJobDef.length > 0) {
                oRet.group = self.convertJobVars( oTargetJobDef.group, oRet.project, oTargetJobDef );
                oRet.name = self.convertJobVars( oTargetJobDef.name, oRet.project, oTargetJobDef );

            // no job data found, the job might be in another project
            } else {
                bUseTargetGroupName = true;
            };
        };

        if (bUseTargetGroupName) {
            oRet.group = self.convertJobVars( aStepCmd.group, self.project, oFullJobDef );
            oRet.name = self.convertJobVars( aStepCmd.name, self.project, oFullJobDef );
            if (sTargetJobId == "") {
                sTargetJobId = depWaitHelperJobGetNameToId(oRet.group, oRet.name);
            };
        };

        // custom_errorhandler is created by the function parsing the job steps
        if (aStepCmd.custom_errorhandler) {
            bLinkStatus = false;
        }

        // generate a custom uid when the job was not found in the current project
        // not using .length on purpose 
        var bTargetJobIdFound = true;
        if (sTargetJobId == "") {
            sTargetJobId = oRet.project + "#" + oRet.group + "/" + oRet.name;
            sTargetJobId = depWaitHelperJobGenerateHash(sTargetJobId);
            bTargetJobIdFound = false;
        };
        oRet.id = sTargetJobId;

        // special case, even if the job exists, record the data for a shadow node to prevent very long edges
        // => the custom_id to generate the node must be unique
        oRet.custom_id = "ref_" + sTargetJobId + "_from_" +  self.generateHash(oFullJobDef.id);

        oRet.custom_job_id_found = bTargetJobIdFound;
        oRet.link_type = self.aLinkType.noedgelink;
        oRet.link_status = bLinkStatus;

        if (self.clusterAttachUnknownNode) { oRet.custom_attach_to_cluster_schedule = oMinimalJobDef?.schedule ?? {}; };
        depWaitGraphDataRecordNodeList(oRet);

        // record the data of the graph edges to create them after all other node objects
        depWaitGraphDataRecordEdgeList({
            sSourceId: oFullJobDef.id,
            sTargetId: oRet.custom_id,
            nLinkType: oRet.link_type,
            bLinkStatus: oRet.link_status,
            bForce: false,
            nEntityType: oRet.custom_type,
            bIsErrorHandler: aStepCmd?.custom_errorhandler ?? false,
        });

        return oRet;
    };


// Tools #######################################################################

    // generate the correct ID for a schedule group
    // also manage a cache to reduce the time spent given this is requested multiple times per job : job, group cluster, time cluster, ...
    self.aGraphDataRecordGroupTimeFormat = new Map();
    function depWaitGraphHelperGroupTimeFormat(sSuffix, sMinute = "") {
        if (!self.clusterTimePrecisionMinute) { 
            sMinute = ""; 
        } else if (sMinute == "") {
            sMinute = "00";
        };

        var sCacheIndex = '#' + sSuffix + '#' + sMinute + '#';
        var sRet = self.aGraphDataRecordGroupTimeFormat?.get(sCacheIndex, sRet) ?? "";

        if (sRet == "") {
            if (sMinute.length > 0 && !Number.isNaN(sMinute)) {
                var nMinute = parseInt(sMinute);
                nMinute = Math.floor(nMinute / 15) * 15;
                sMinute = nMinute.toString();
            };

            sRet = "time_" + depWaitGraphHelperJobTimeFormat(sSuffix, sMinute);
            
            self.aGraphDataRecordGroupTimeFormat.set(sCacheIndex, sRet);
        };
        // depWaitLog("depWaitGraphHelperGroupTimeFormat: param = (  " + sSuffix + ", " + sMinute + ") | return = " + sRet);
        return sRet;
    };


    // format time data presented as a string or number in the format ??h or ??h??m or ??h??m??s
    function depWaitGraphHelperJobTimeFormat(oHour, oMinute = "", oSecond = "") {
        if (typeof oHour == "string") {
            if (oHour == "manual" ) { return oHour; };
            if (Number.isNaN(oHour) && ! /[\*\/]/.test(oHour)) { return oHour; };     // does not seem to work correctly, hence the dedicated "manual" + other tests
        };

        var sRet = "";
        for (e of [{d: oHour, s: "h"}, {d: oMinute, s: "m"}, {d: oSecond, s: "s"}]) {
            if (typeof e.d == "string") {
                if (e.d.length == 0) { continue; };
                if ( /[\*\/]/.test(e.d) ) { return "*/*"; }            // special case for incremental schedules : * or ?/num
                sRet += ((e.d.length == 1) ? "0" + e.d : e.d) + e.s;
            } else {
                sRet += ((e.d < 10) ? "0" + e.d.toString() : e.d.toString()) + e.s;
            };
        };
        return sRet;
    };

    function depWaitGraphHelperClearTimeFormat() {
        self.aGraphDataRecordGroupTimeFormat.clear();
    }


    // convert the internal $var from rundeck - 
    self.convertJobVars = (sText, sProject, aJobDef)=> {
        if (!sText.includes('\${')) { return sText; };

        var aJobVarParms = new Map();
        aJobVarParms.set("job.project", sProject);
        aJobVarParms.set("job.group", aJobDef.group);
        aJobVarParms.set("job.name", aJobDef.name);

        for (oOpt of aJobDef.options ?? [] ) {
            aJobVarParms.set("option." + oOpt.name, oOpt.value);
        };

        for (sIdx of aJobVarParms.keys()) {
            sText = sText.replace("\${" + sIdx + "}", aJobVarParms.get(sIdx));
            if (!sText.includes('\${')) { break; };
        };

        return sText
    };

    // generate a hash used as an ID for the jobs located in other projects or group names
    // ref: https://stackoverflow.com/a/7616484
    self.generateHash = (string) => {
      let hash = 0;
      for (const char of unescape(encodeURIComponent(string))) {
        hash = (hash << 5) - hash + char.charCodeAt(0);
        hash |= 0; // Constrain to 32bit integer
      }
      return hash;
    };
