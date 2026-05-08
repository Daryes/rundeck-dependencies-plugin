**Rundeck plugin : dependencies**

# Module usage


## Module: Wait for / Slot  

This module is a workflow step, executed globally.  
It will handle a dependency - or link - to a numbered slot, specifying the number of jobs allowed to execute simultaneously.  
When the limit of a slot is reached, all other jobs related to the same slot will wait, until a job is finished and free a place in the slot.  

For example :  having the jobs "a", "b", "c" and "d" linked to the slot number `2`, only "a" and "b" will proceed.  
The jobs "c" and "d" will wait, and one of them will proceed only when "a" or "b" is ended.  
As the module uses the executions as a reference, launching a new instance of an allowed job will have to wait like the other executions.

Another example with the slot number "1", allowing only 1 job after the other :  
![workflow](module_wait_slot_flow.png "Module slot workflow")

Please note this mechanic applies on groups of jobs, it is not related to the `Multiple Executions` setting specific to a single job. 


### Execution output

Example :  
```
MODULE: DEPENDENCIES WAIT_SLOT
------------------------------------------------------------
FLOW START:              Mon, 14 May 2025 15:00:00 +0200
FLOW END:                Tue, 15 May 2025 14:59:59 +0200
SLOT project:            'rundeck-plugins'
SLOT number:             1
Force launch on timeout: false
------------------------------------------------------------
Started at:              2025-05-15T06:00:01.102653+02:00
Execution #ID:           83421
------------------------------------------------------------

Waiting loop started (each 30s for 12h00m00s or until the flow's ending time) ...
To exit this loop, run this shell command on the Rundeck host : sudo su rundeck -c 'touch /tmp/rundeck/dependencies-wait_slot.skip.83421.1'

Notice (06:00:08) : Slot 1 has reached its capacity for the project 'rundeck-plugins' - waiting ...
Slot 1 : an empty spot is available => success
(2025-05-15T06:18:00.116214+02:00)
############################################################
```


### Step settings
------

![parameters](module_wait_slot.png "Module step parameters")

The documentation is integrated into the plugin.  
An existing project name must be specified. Targeting all the projects with a wildcard is currently not supported.


### Available slots
------

Currently 5 slots are available, each of them being the number of jobs allowed to execute simultaneously.  
Each slot limit is per project : the 3rd slot will have 3 spots for a given project, and each other project will also have their own 3 spots.  

The slots have no relation with the other dependency modules, but they can be combined if necessary.  
If there is a need to have a slot reset to its full capacity, just separate the jobs in groups and add a dependency job step between the 2 groups.  
As long as all the jobs linked to a slot are finished, even if in a failed state, the next jobs will be able to access the same slot, fully empty.  


**Special case**  
Having a step configured with a reduced "maximum waiting time" (i.e. : 1 hour), with "forced execution" also activated.  
In such situation, the execution will override the slot limit when the timeout occurs, and still register itself in the slot.  
This can give a higher priority to some jobs as the other with a longer waiting time will still wait.  
But it can also cause problems if the slot limit must always be followed.


### Usage with other dependency modules
------

While the modules can be used multiples times together in the same job, the main restriction is being able to work only from an already running job.  
Given the wait-for/slot module checks the "running" state when activated, having it placed before another dependency step might create a deadlock situation.  
It is suggested to have the wait-for/slot step as the last dependency step in a job, before its workload steps.  

As such, it is also not suitable for a job to have more than a single "wait for / slot" step.  
