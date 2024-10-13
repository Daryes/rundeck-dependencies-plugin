

# Migrating from the v1.x Dependencies plugin

A lot of care has been done to the Java/Groovy rewrite to be able to upgrade as a drop-in with the least necessary work.  
Those 2 contraints remain : 
* the `force_launch` optional parameter on all wait_for/* module must has its value updated when activated.
* the jobs using the wait_for/file module must be edited to update the `flag_type/flag file` setting.

Both are considered as minor as force_launch is optional and should be use sparingly, so absent of most of the job definitions.  
And the wait_for/file module is recent.


## Access token

Previously, the plugin was using the API using curl, requiring an access token.  

This token is not necessary anymore.  
If it is not used elsewhere, it can be deleted, and the file `/etc/rundeck/plugin-dependencies.conf` removed.


## Updating many job definitions to the v2 changes

Instead of editing each job manually, it is possible to use an export of a project to execute commands like grep and sed on it :
> Project settings (lower left) => export archive => select only jobs, and clic on "export archive"

When done, you'll get a jar file. Save it somewhere, extract it with unzip or 7z,  
then search under "<project name>/jobs" the files' content for the following parameter : "force_launch"

you'll have the few jobs using this parameter, as it does not exist in the configuration when not activated.

2 ways to change the `force_launch` parameter : 
- Replace the content of each job's xml (or yml) file with the value (keep the quotes) : `'true'`  
  Then, import the changed files only to update the jobs

- Edit directly the jobs in Rundeck.  
  On the workflow tab, select the related step and tick the "Force launch" parameter, then save the job.
  You can retrieve the job's name in their files.


If required, you can do the same for the parameter `flag_type` used only in the wait_for/file module. 


## Error at start of the job : ExecutionServiceException

Exact error : `Exception: class com.dtolabs.rundeck.core.execution.service.ExecutionServiceException: null`

One of the altered parameters in v2 (force_launch, flag_type) was not updated in the job definitions.  
Edit the job, adjut the step(s) configuration, save and relaunch the job.


## Environment variables to customize the flow's start and end

If they were used, all the global variables for the dependency plugin are still available, but they have been moved as properties to the `framework.properties` file.  
They can also be declared in each project configuration as properties.  
Please note the environment variable declarations will not work anymore.

See the explaination in the  [dedicated documentation](module_common_usage.md) for the common usages.
