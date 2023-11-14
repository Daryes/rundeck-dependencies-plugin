# Rundeck plugin : dependencies

This plugin add precise control options to Rundeck job's interaction and allow to links them  
together or to other ressources in a global flow.   

Support Rundeck 3.x and more


## Available modules

* dependencies-wait_job : allow a job to wait for one or multiple jobs launched in a time flow.

* dependencies-wait_file : allow a job to wait for one or multiple file presence in a time flow.  


## Managing a flow (or batch processing)

![current situation](doc/flow_1.png "flow - current situation")

To obtain the desired state, the dependency plugin is able to create logical links between  
jobs with some fine-tuning options.
In addition, it also works with an internal flow definition, which will start the  
current day (d+0) at 15h00, and end the next day (d+1), 14h59.  

When looking for a job history,  this allow to select only those started in the  boundaries  
of the current flow. Even if the day change, as Rundeck does not support a processing date as a reference.


# Installation

The dependencies zip archive must be placed in the `/var/rundeck/lib/rundeck/libext/` directory.  
Either the zip file as is, or a symlink to the zip file elsewhere.  

If upgrading, the remaining file for the previous version must be removed.

An alternate option is by using the UI under the system menu (the cog icon) => plugins.  
You can then upload a plugin to Rundeck.


## System requirements

The curl and findutils packages must be installed.  

This command must return a message with `<message>API Version not specified</message>` :  
  `curl https://<rundeck_url>/api/`


## Access token

A token must be created from Rundeck, with read access on all project.  
It can be created by any user, preferably a service account with minimum access.  

In rundeck GUI (as the desired user) => user profile => User API Tokens.  
- Set the "read" value to the role if you have configured the roles, or leave it empty.  
- If you don't want to handle the date limitation, add / change the following option  
  in rundeck-config.properties : `rundeck.api.tokens.duration.max=0`  

Then, place the token in a dedicated file under /etc/rundeck/plugin-dependencies.conf
```
sudo su - rundeck
# vim or nano should be used instead - or clear the history after this
echo "<my token>" > /etc/rundeck/plugin-dependencies.conf
chmod 600 /etc/rundeck/plugin-dependencies.conf
```

It can be set instead in the RD_TOKEN environment variable in Rundeck profile,  
but this use is not recommended anymore.


# Module usage

## Module: Wait for / Job  

This module is a workflow step.  
It will handle a dependency - or link - to another job, waiting until its execution is  
complete with a specific status.  


**Available modes**  

* blocking mode : wait for a job until it is finished, even if it will be started  
much later, or if the end of the internal flow is reached.  
This mode allows to launch multiples jobs at the same time, with the order handled  
by the dependencies themselves.  

* non-blocking mode: in the case of a conditional job that isn't executed each  
time, the module will wait only if the job has been started previously and is still  
running, or already finished in the current flow.  
Otherwise, skip the dependency step without error.  
A job with a step using this mode might require an additional step using also the  
Wait for module, but this time in blocking mode to a different job, to ensure  
the global sequence is respected.  

In both modes, the module will keep waiting if the target job is finished but  
without the required status (success or error)  

Hint: if you have a lot of jobs, a diagram tool might be handy to write down the  
expected order.  


## Module: Wait for / File  

This module is a workflow step.  
It will handle a dependency - or link - to the presence of a file, waiting until the  file exists on the system.  
The additional presence of a flag or marker for signaling the completion of the transfer is supported.


**Available modes**  

* flag : if used, an additional file will be searched, reusing the requested filename and a suffix.  
  This is to alleviate file sending utilities unable to use a temporary name, and directly use  
  the final name for the file to send.  
  Without this, a step could be already working on a partial file due to a transfer not yet completed.  
  In addition, if the flag is not an empty file and contains a hash, a validation will be done  
  by running the corresponding binary.  
  

## All Modules : common usage

### Skipping a dependency
------
When using a module, 2 ways are available to skip a dependency :  

* using an additionnal option/variable in the job declaration :  
DEPENDENCY_EXTRA_PARAMS : text type, empty, optional.  
Filling the option with the value `-skip` or `-bypass` at launch will set the step to exit  
immediatly, allowing the next step to run.  
Note : the  module will use this variable name as a default value, but can be changed  
in the step options.  

* at the execution time, the step will show an information line in the log output  
explaining  how to skip the current waiting loop, starting with "touch /tmp/..."   
This command will create an empty file this job is looking for, which will allow  
to exit immediatly without error, allowing the next step to run.  

The file method can only be used when the dependency step is running, as the expected  
filename is unique to the execution, generated at launch.  
On the opposite, the variable works best on a job that must be launched immediatly.  


### Flow start and end customization
------

The flow time limit can be changed globaly, using the following environment variables  
in the rundeck `/etc/rundeck/profile` file (a restart is required) :  

* RD_FLOW_DAILY_START="hh:mm:ss"
* RD_FLOW_DAILY_STOP="hh:mm:ss"


# Examples

Given a job named MyJob, created in a group named MyGroup.  
This job must wait for the execution of a job named ParentJob, in the same group.  
Any error is treated as blocking, i.e. not allowed to continue.  

Set the dependency on MyJob as follow:  
```
Target job definition
    Project: ${job.project}     # reusing the current job project, as it is the same
    Goup: ${job.group}          # reusing the current job group, as it is the same
    Job: ParentJob
  
Dependency definition
    Status: success
    Dependency type: -hardlink
    Force launch: none (default)

Other options
    Node filtering: adapt (default)
    Extra parameters: ${option.DEPENDENCY_EXTRA_PARAMS}         # can also be empty
```

Using the option `DEPENDENCY_EXTRA_PARAMS` is not mandatory, but helpfull when a job's execution must be forced.  
If the option is set, declare it as a text type (plain text), without default value, no restriction, and not required.  
