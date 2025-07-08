**Rundeck plugin : dependencies**

# Module usage


## All Modules : common usage

Many parameters can be given at launch time, but this requires using an additionnal option/variable in the job declaration :  
* DEPENDENCY_EXTRA_PARAMS : text type, empty, optional.  

This option will allow to customize the behavior of the Dependency modules.

When using properties to change the value of a setting, a definition in a project settings' are of a higher priority than when defined globally.  
If you want a project uses the global value, just remove the project own properties for the Dependencies module.


**Index**
* [Job naming suggestions](#job-naming-suggestions)
* [Skipping a dependency](#skipping-a-dependency)
* [DEPENDENCY_EXTRA_PARAMS usage example](#dependency_extra_params-usage-example)
* [Changing the sleep duration time](#changing-the-sleep-duration-time)
* [Slight pause on warmup](#slight-pause-on-warmup)
* [Changing the maximum waiting time](#changing-the-maximum-waiting-time)
* [Flow start and end time customization](#flow-start-and-end-time-customization)
* [Shell interpreter](#shell-interpreter)


### Job naming suggestions
------

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


### Skipping a dependency
------

After a module is launched, there is no option in Rundeck to act directly on a blocking dependency, but alternate ways are available to do so :    

1. using the DEPENDENCY_EXTRA_PARAMS option and filling with `-skip` or `-bypass` at launch.  
  This will cause the step to exit immediatly without error, allowing the next step to run.  
  Note : the  module will use this variable name as a default value, but allow to change it in the step options.  

2. at the execution time, all Dependencies modules will show an information in the log output explaining how to skip the current loop, containing "touch /tmp/..."   
  This command will create an empty file this step is looking for, which will allow  to exit it immediatly without error, and proceed to the next step.  
  _The sudo command is implied, if not installed, just switch to the rundeck user and remove the `sudo su ...` from the start of the command._  


The variable method works best on a job that must be launched immediatly without additional actions.  

On the opposite, the file method will generate a unique name specific for each execution. This can be used anytime, but mostly when a job is already running and waiting.   
Please note that in rare cases, some skip files may remain. They can be deleted without risk after the job is finished.  


### DEPENDENCY_EXTRA_PARAMS usage example
------

Given a job named MyJob, created in a group named MyGroup.  
This job must wait for the execution of a job named ParentJob, which can be empty, in the same group.  
Any error is treated as blocking, i.e. not allowed to continue.  

Set the dependency configuration in MyJob as follow:  
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

Then, also add an option named `DEPENDENCY_EXTRA_PARAMS`, plain text, without default value, no restriction, and not required.  
Verify the syntax at the bottom of the "add a new option" area, in the usage section the "Commandline Arguments:" should be : `${option.DEPENDENCY_EXTRA_PARAMS}`  
Exactly as the value set in the extra parameter in the dependency definition.

You can then launch MyJob and test the supported values in the option box at launch time.

Declaring the option `DEPENDENCY_EXTRA_PARAMS` is not mandatory, the modules will accept having it missing.  
But it is extremely helpfull when a job's execution must be manually forced.  


### Changing the sleep duration time
------

The dependency modules will be in a sleep state between 2 verifications of the dependencies.  
This duration is by default 30 seconds, and for some specific situations, set to 180 seconds.  
All the dependency modules will output a line in the execution log with the value used by the module.

Both can be changed globaly, using the following parameters in the rundeck file : `/etc/rundeck/framework.properties` 
A restart is required.  

```
# replace with the desired duration in seconds

framework.dependencies-waitfor.flow-sleep-duration-sec=30
framework.dependencies-waitfor.flow-sleep-slower-duration-sec=180
```

Or per project, with the project parameters :
```
project.dependencies-waitfor.flow-sleep-duration-sec=30
project.dependencies-waitfor.flow-sleep-slower-duration-sec=180
```
It will apply on the next job launch.  


### Slight pause on warmup
------

A slight pause occurs right after the header panel information is printed, before entering the main waiting loop.  
The pause has a 7 secs duration, and will only occur in a job when the dependency plugin is on the step 1 or step 2.  

It is meant for allowing enough time for the scheduler to settle when a workflow starts, with multiples jobs launched at the same moment.


### Changing the maximum waiting time
------

When a module is executed, it will initially wait for 12h.  
Assuming the jobs were launched around 20h00, this put an ending time around 08h00.  
With the default flow ending time, this gives more time to fix the jobs that didn't finish correctly before the daily workflow limit is reached.

This is in addition with the generic timeout option available to all jobs.  
The difference being the generic timeout applies for the full duration of a job, while this timeout is for the dependency step only.


The waiting time can be changed with either :

1. globaly, using the following parameters in the rundeck file : `/etc/rundeck/framework.properties` 
  A restart is required.  

```
# replace with the desired duration in second

framework.dependencies-waitfor.flow-timeout-duration-sec=43200
```

2. per project, using the following parameter in the project configuration :  
```
# the same constraints also apply here

project.dependencies-waitfor.flow-timeout-duration-sec=43200
```
  It will apply on the next job launch.  

3. per job, using the DEPENDENCY_EXTRA_PARAMS option with `--maxWait <duration in sec>` which will apply to all steps.  

4. at the step level, in Other options => specify the `--maxWait <duration in sec>` parameter, it will affect only this step.  


Please note the launch time of the job is the reference date/time for the timeout.


### Flow start and end time customization
------

The flow time limit can be changed globaly, using the following parameters in the rundeck file : `/etc/rundeck/framework.properties` 
A restart is required.  

Keep in mind the `:` character must be escaped with a `\`

```
# replace with the desired time 

framework.dependencies-waitfor.flow-daily-start-end-pivot-time=15\:00\:00
```

Or per project, with the project parameters :
```
# the same constraints also apply here

project.dependencies-waitfor.flow-daily-start-end-pivot-time=hh\:mm\:ss
```
It will apply on the next job launch.  


### Shell interpreter
------

The default shell interpreter is reused from the `SHELL` environment variable. If missing, `bash` will be used.  
It can be changed globaly, forcing to use the value defined with the following parameters in the rundeck file : `/etc/rundeck/framework.properties`  
A restart is required.  

```
framework.dependencies-waitfor.shell=bash
```

Or per project, in the project parameters :
```
project.dependencies-waitfor.shell=bash
```
It will apply on the next job launch.  

To fall back to the value from the environment, just remove the setting.  
