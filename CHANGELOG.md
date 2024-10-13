Change history
======

v2.0.0 (2024/09/25)
------
- Fully rewritten in Groovy, this removes any external dependency like jq, curl or others, and reduces the load on the system.    
  The API access token is also not required anymore.
- The jar archive filename is renamed to `dependencies-plugin-<version>-<date>`
- Rundeck 5+ is required, see the readme for how to upgrade.  
  Rundeck 4 with java 11 might work, but this scenario has not been validated.
- New module wait-for slot : gives the possibility to regroup different executions together and limit the amount of concurrent executions in each group.
- all modules : the skip file now uses the current execution ID and the step number in its naming scheme instead of the job ID.
- all modules : the  initial timeout duration has been reduced to 12h instead of 18h.
- all modules : new properties are available to modify the initial timeout duration, the flow starting time and the flow ending time.  
  They replace the related variables in the shell environment.  
- module wait-for job : informational messages will appear each time the target job state change, from "missing" to "running" to "finished".
- Some of the status messages are more detailled.


v1.2.1 (2024/06/15)
------

- New requirement : the package/command "jq" is now required.
- Module dependencies-wait_job: Rundeck 5.x support by switching the expected api output from xml to json.
- Module dependencies-wait_job: updated the minimum Rundeck API version to 47 which might hamper the support of older Rundeck version.
- Module dependencies-wait_file : rewording of some messages.


v1.2.0 (2023/11/12)
------

- Module dependencies-wait_file : new module able to wait for a file presence.
- Better wording of the readme and plugin descriptions
- Module dependencies-wait_job: updated the minimum Rundeck API version from 11 to 14
- Module dependencies-wait_job: able to manage the disappearance of a running job while waiting on it with an optional dependency


v1.1.1 (2021/05/16)
------

- rewrote the curl command


v1.1.0 (2021/04/04)
------

- updated the minimum Rundeck API to 11
- changed the api token to support a file based location
- switched to semver versionning

v1.0.10 (2019/06/06)
------

- updated the token location when installing the plugin the first time
- new error message when the api token wasn't found
- updated the shell command for exiting a waiting/stuck loop to be more copy/paste friendly


v1.0.9 (2019/01/02)
------

- new optional Node Filtering option allowing the dependency to adjust when a job was launched using 'Change the Target Nodes' option.  
  Old behavior is available with the 'global' value
- Grouped options  in the creation/editing UI
- internal variables cleaning
- changelog rewrote in english
- max loop duration format changed to HH MM SS


v1.0.8 (2019/01/02)
------

- New REF_TMP_DIR variable
- New option visible in the log for exiting a waiting loop, using a local empty file  (internal TARGET_JOB_SKIPFILE)
- fix to handle jobs with empty execution history
- Some error messages rewrote


v1.0.7 (2018/08/21)
------

- Better visibility of API errors
- allow to change the flow start and end time through FLOW_DAILY_START and _END variables and command line args
- check external variables availability
- usageSyntax updated
- Flow start time changed to 15h00


v1.0.6 (2018/05/05)
------

- project, group and job name parameters trimmed
- check / presence at end of RD_JOB_SERVERURL.
- -softlink fixed with recent execution.
- wait expiration when the end of flow is reached


v1.0.5 (2018/01/06)
------

- Internal variable API_VERSION in curl calls


v1.0.4 (2017/12/10)
------

- rewrite to switch to Rundeck API instead of rd-cli
- RD_JOB_* variables renamed to TARGET_JOB_*
- added an information message visible after each hour when waiting


v1.0.3 (2017/09/17)
------

- wait_timeout duration set to 16h 
- new variable DEPENDENCY_IGNORE with associated command line args
- script PID visible in the console output


v1.0.2 (2017/09/09)
------

- rdJob_GetLastExecValue : using correct rd-cli with iso-8601 date format 
- fix to -time_end arg
- sleep duration set to 60s
- rd-cli commands using nice


v1.0.1 (2017/08/26)
------

- Comments 
- Better handling of the command line


v1.0.0 (2017/07/09)
------

first version
