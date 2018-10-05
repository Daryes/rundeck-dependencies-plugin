Rundeck plugin : dependencies
======

This plugin add precise control options to Rundeck job's interaction between them
in a global flow. 


Internal flow
------
Currently, there is no any easy way to handle the date when switching to the next 
day, or the start and end of a global flow, or also to distinguish a specific 
launch between multiple schedules of the same job.

In this regard, the dependencies plugin works with an internal flow definition.  
This flow will start at d+0, 14h00, and end at d+1, 13h59.  
When looking for a job, only those started in the boundaries of the current flow
will be analyzed, without restriction even if the day change.


Installation
------
The zip archive must be placed in the var/rundeck/lib/rundeck/libext subdirectory.  
It can be directly the zip file, or a symlink to the archive.

A token must be created from Rundeck, with at least read access on all project.  
In rundeck GUI (as admin) => user profile => User API Tokens.  
- Let the role set to blank
- If you don't want to handle the date limitation, add / change the following option
in rundeck-config.properties : "rundeck.api.tokens.duration.max=0" 

The following environment variable must be present:  
RD_TOKEN=< API admin token >  
Either in the rundeck user .profile, as 'export RD_TOKEN=...' or in /etc/rundeck/profile


Module: Wait for / Job
======
This module is a workflow step.  
It allows to handle a dependency, or link, to another job, waiting until its his execution 
complete with a specific status.


Available modes 
------
* blocking mode : wait for a job until it is finished, even if it will be started 
much after, or if the end of the internal flow is reached.  
This mode allow to 
launch multiples jobs in parallel, the dependencies will take care of the order.

* non-blocking mode: in the case of a conditional job that isn't executed each 
time, the module will wait only if the job has been started previously and is still 
running, or already finished in the current flow.  
Otherwise, skip the dependency step without error.  
A job with a step using this mode might require another step in blocking mode, 
to ensure the global order is respected.

In both modes, the module will keep waiting if the target job is finished but 
without the required status (success or error)


Mandatory job variable
======
Any job using this module requires an additional option (variable):  
text type, empty, with the following name : "DEPENDENCY_EXTRA_PARAMS".  
It is provided by the module as a default value, but can be changed.

This variable is provided to bypass a blocking dependency, in case of a manual 
intervention, as skipping a step is not possible.  
In such situation, kill the waiting job, and relaunch it manually using " -bypass " as 
an extra param. The dependency step will then exit immediatly.


Customization
------
The flow time limit can be changed globaly, using the following environment variables 
in the rundeck etc or user profile (a restart is required) :
- RD_FLOW_DAILY_START="hh:mm:ss"
- RD_FLOW_DAILY_STOP="hh:mm:ss"


 Study case: managing a sizeable job count in a flow
------
Let's start with multiple backup jobs running on different servers:  
one for a database type A, another one for a db type B, and a file backup.

The easiest declaration would be a single job, with differents steps for each 
backups.  
When working with production and large environments, it's more appropriate
to separate such steps on differents jobs, allowing easier actions in case of 
error or when on-demand launch is required. 
Also, you can have each job targeting a different group of multiple servers.  
So you'll end with at least 3 separate jobs.

Now, add another job requiring all backups to be finished with a success status.  
If it's the only job, you can directly add the 3 dependencies on the job. 
Right after, create after other jobs with similar requirements.  
In such situation, inserting a blank job, also known as a flag, is more suited:  
its single purpose is to contains only the dependencies to the backup jobs.  
You can then link  instead to the flag all the jobs waiting for the backups jobs.

Usually, in very large flow, it's better to aggregate the jobs in distinct groups, 
either arbitrary or for application purpose, and enclose them with 2 flags:   
a starting flag which will be linked to by all the jobs in the group,  
and an ending flag linked to all the said jobs in this group (and the flag).  
Any job in such group won't move until the starting flag is complete.

While this increase the  complexity with the number of total job, it also gives 
more flexibility with manual execution, and less work for maintaining and altering 
a large flow : only the new job and the end flag of the group are usually concerned.

Hint : having a complete diagram at hand is always usefull.
