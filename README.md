# Dependencies plugin for Rundeck

This plugin add precise control options to Rundeck job's interaction and allow to link jobs together  
in a global workflow, or to other ressources.

[Changelog](CHANGELOG.md)

## Managing a flow (or batch processing)

These plugins came from having worked with complex flow processing on other schedulers, which were  
providing many tools, not all present in Rundeck.  

It can be reduced to this situation :

![current situation](doc/flow_1.png "flow - current situation")


To obtain the desired state, the dependency plugin is able to create logical links between jobs,  
restraining them to wait for other jobs, with some fine-tuning options.  

In addition, it also manage an internal flow definition, which will start the current day (d+0) at 15h00, and end the next day (d+1), same time.  
This ensure any logical link will automatically restrict its search in the execution history inside this boundary.  
And handling correcty when the day change, as Rundeck does not support internally a processing date as a reference.  


# Available modules

* [dependencies-wait_job](doc/module_wait_job.md)  
  This plugin allow a job to wait for one job until its completion with a specific status (success, error), launched in a defined time flow.  
  Or multiple jobs when used with sequential steps.

* [dependencies-wait_file](doc/module_wait_file.md)  
  This plugin allow a job to wait for the presence of a file and validate its integrity, limited to a defined time flow.  

* [dependencies-wait_slot](doc/module_wait_slot.md)  
  This plugin allow to restrict the number of job executions able to run together to a specific number of places in a slot, in a defined time flow.  


All modules : [common usage documentation](doc/module_common_usage.md)  


# Installation & upgrade

## System requirements

Rundeck **5.0** minimum.  
The plugin has been tested with OpenJDK 11

_It is possible this plugin works on Rundeck 4.x, but is has not been fully validated. For such case, use instead the 1.x version of this plugin._


The `quartz.threadPool.threadCount` property in the `rundeck-config.properties` must be set.  
> A surprising situation can occurs, when only 10 executions are running and stuck, with the other executions missing.  
> Due to the default limit of 10 simultaneous executions, the dependency modules can create a deadlock with the missing executions.  
> 
> The threadCount property should be defined and set at least to 50, or more depending of the total of jobs started at the exact same time. The other executions will be launched as soon as one is finished.  
> Restart Rundeck to apply the new value. Please note this will also increase Rundeck's memory consumption.  
> [More information on Rundeck documentation's website](https://docs.rundeck.com/docs/administration/maintenance/tuning-rundeck.html#quartz-job-threadcount).  


## Installation

You can use the Rundeck UI under the system menu (the cog icon, upper right) => plugins => upload plugin.  
In "upload plugin", just drag and drop the jar file on the text area right of `choose a file`,  
then validate, and it will be ready to run.

An alternate way is to place the Dependencies jar in the `/var/rundeck/lib/rundeck/libext/` directory,  
then restart Rundeck.  
Either the file itself, or a symlink to the jar file elsewhere.  
Remove the previous version while on it.  


## Upgrade

When upgrading, the previous Dependencies plugin version must be removed.  
It can be managed under the system settings, plugin section => Installed plugins.  
Search for "depend", removing one of the Dependencies modules will remove the plugin as a whole.  

Notice : it is not recommended to remove or update to a new version while existing jobs are still running.

If you were using the Dependencies plugin v1.x before, there are also additional steps described  
[in the dedicated page](doc/Migration_v1x.md).


## Job naming suggestions

Given how the dependency plugin change Rundeck behavior, some helpfull informations, while available, are not immediately visible, especially in the execution history.  
To alleviate this, the following informations directly in the job names might help :  

* Rundeck allows spaces, but also the characters `( ) [ ] - _ /` in the job names, use them to make multiple informations easier to distinguish.  
* add the periodicity in the name, ie : daily, weekly, monthly, ... or manual for manual launches.  
* separate each job in groups, by theme.  
* have a `flag - start` and `flag - end` job for each group.  
* if you have a group covering multiple frequencies, have a `flag - end (daily)` as usual, but also a `flag - end all (daily)` linked to all the jobs, using the softlink dependency type.  
  If necessary, you can also put a `flag - end (weekly)` and/or a `flag - end (monthly)` in the mix.  
  Having those in the execution history make them visible due to their shorter name, and understanding this is also the day the weekly or monthly jobs are launched.  
* For the cases an order must be strictly followed when manually launched, also add a numbering in the name


# Licence  

[Apache 2.0](LICENSE)
