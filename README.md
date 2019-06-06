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

The curl command  must be available in the path.

This command must return a message with "<message>API Version not specified</message>" :  
  curl http(s)://<rundeck server address>/api/

A token must be created from Rundeck, with at least read access on all project.  
In rundeck GUI (as admin) => user profile => User API Tokens.  
- Leave the role empty.
- If you don't want to handle the date limitation, add / change the following option
in rundeck-config.properties : "rundeck.api.tokens.duration.max=0" 

The token must be placed in the following environment variable:  
RD_TOKEN=< API admin token >  
In the rundeck user $HOME/.profile, as 'export RD_TOKEN=...'


Module: Wait for / Job
======
This module is a workflow step.  
It will handle a dependency - or link - to another job, waiting until its execution is 
complete with a specific status.


Available modes 
------
* blocking mode : wait for a job until it is finished, even if it will be started 
much after, or if the end of the internal flow is reached.  
This mode allows to launch multiples jobs at the same time, the order being handled 
by the dependencies.  

* non-blocking mode: in the case of a conditional job that isn't executed each 
time, the module will wait only if the job has been started previously and is still 
running, or already finished in the current flow.  
Otherwise, skip the dependency step without error.  
A job with a step using this mode might require another step in blocking mode, 
to ensure the global sequence is respected.

In both modes, the module will keep waiting if the target job is finished but 
without the required status (success or error)


Skipping a dependency
------
When using this module, 2 ways are usable to skip a dependency :  

* using an additionnal option/variable in the job declaration :  
DEPENDENCY_EXTRA_PARAMS : text type, empty, optionnal.
Filling the option with the value " -bypass " at launch will set the step to exit 
immediatly, allowing the next step to run.
Note : the  module will use this name as a default value, but can be changed in the 
step options.

* at the execution time, the step will show in the log output an information line to 
skip the current waiting loop, starting with "touch /tmp/..."  
This command will create an empty file the job is looking for, which is required to 
exit immediatly without error, allowing the next step to run.  

The file method can only be used when the dependency step is running, as the filename
is unique to the execution. On the opposite, the variable used at launch works better 
with a scheduled job.


Customization
------
The flow time limit can be changed globaly, using the following environment variables 
in the rundeck profile under /etc or in the user home (a restart is required) :
- RD_FLOW_DAILY_START="hh:mm:ss"
- RD_FLOW_DAILY_STOP="hh:mm:ss"


 Study case: managing a sizeable number of jobs in a flow
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
and an ending flag linked to all the said jobs in this group (and the starting flag).  
Any job in such group won't start until the starting flag is complete. In the same 
manner, any job linked to the ending flag will have to wait for the completion of 
all the jobs in the group.

While this increase the complexity with the number of total job, it also gives 
more flexibility with manual execution, and less work for maintaining and altering 
a large flow : only the end flag of the group is usually concerned when inserting 
or removing a job.

Hint : having a complete diagram at hand is always usefull.
