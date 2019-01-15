Change history
======

v1.9 (2019/01/02)
------

- new optional Node Filtering option allowing the dependency to adjust when a job was launched using 'Change the Target Nodes' option.  
  The old behavior is the 'global' value
- Grouped options  in the creation/editing UI
- internal variables cleaning
- changelog rewrote in english
- max loop duration format changed to HH MM SS

v1.8 (2019/01/02)
------

- New REF_TMP_DIR variable
- New option visible in the log for exiting a waiting loop, using a local empty file  (internal TARGET_JOB_SKIPFILE)
- fix to handle jobs with empty execution history
- Some error messages rewrote


v1.7 (2018/08/21)
------

- Better visibility of API errors
- allow to change the flow start and end time through FLOW_DAILY_START and _END variables and command line args
- check external variables availability
- usageSyntax updated
- Flow start time changed to 15h00


v1.6 (2018/05/05)
------

- project, group and job name parameters trimmed
- check / presence at end of RD_JOB_SERVERURL.
- -softlink fixed with recent execution.
- wait expiration when the end of flow is reached


v1.5 (2018/01/06)
------

- Internal variable API_VERSION in curl calls


v1.4 (2017/12/10)
------

- rewrite to switch to Rundeck API instead of rd-cli
- RD_JOB_* variables renamed to TARGET_JOB_*
- added an information message visible after each hour when waiting


v1.3 (2017/09/17)
------

- wait_timeout duration set to 16h 
- new variable DEPENDENCY_IGNORE with associated command line args
- script PID visible in the console output


v1.2 (2017/09/09)
------

- rdJob_GetLastExecValue : using correct rd-cli with iso-8601 date format 
- fix to -time_end arg
- sleep duration set to 60s
- rd-cli commands using nice


v1.1 (2017/08/26)
------

- Comments 
- Better handling of the command line


v1.0 (2017/07/09)
------

first version
