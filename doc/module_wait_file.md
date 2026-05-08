**Rundeck plugin : dependencies**

# Module usage


## Module: Wait for / File  

This module is a workflow step, executed globally.  
It will handle a dependency - or link - to the presence of a file, waiting until the  file exists on the system.  
The additional presence of a flag or marker for signaling the completion of the transfer is supported.

Having this module designed as a workflow step allows to handle some special cases.  
For more standard situations requiring a node step, it exists other plugins for Rundeck more suited for this usage.  

Notice : this module can only works on Linux systems, or anything supporting at least the shell commands `ssh` and `find` (from the `findutils` package).  
The `coreutils` package is also required on the target system, if the checksum validation is used.


### Execution output

Example :  

```
MODULE: DEPENDENCIES WAIT_FILE
------------------------------------------------------------
FLOW START:              Mon, 14 May 2025 15:00:00 +0200
FLOW END:                Tue, 15 May 2025 14:59:59 +0200
FILE host:               'simulator'
FILE directory:          '/tmp'
FILE name:               'rundeck_deps_wait_file_hash.test'
FILE flag:               'rundeck_deps_wait_file_hash.test_flag'
Flag hash validation:    true
Force launch on timeout: false
------------------------------------------------------------
Started at:              2025-05-15T05:30:00.93836+02:00
Execution #ID:           83419
------------------------------------------------------------
Validating shell access on simulator ...

Waiting loop started (each 180s for 12h00m00s or until the flow's ending time) ...
To exit this loop, run this shell command on the Rundeck host : sudo su rundeck -c 'touch /tmp/rundeck/dependencies-wait_file.skip.83419.2'

Target file found on simulator (05:39:12) : '/tmp/rundeck_deps_wait_file_hash.test' - looking for flag file ...
Target flag found on simulator (05:39:12) : '/tmp/rundeck_deps_wait_file_hash.test_flag' - validation ...

Processing (05:39:13) : hash found in '/tmp/rundeck_deps_wait_file_hash.test_flag' ...
Related binary detected for hash verification : sha1sum
Target file hash is valid: 74df5fa1522875f200c0198f8d32bcaec17ab790 => success
(2025-05-15T05:39:13.973294+02:00)
############################################################
```


### Step settings
------

![parameters](module_wait_file.png "Module step parameters")

The documentation is integrated into the plugin.  


### Available modes
------

* standard : just check for the file presence

* flag : if used, an additional file will be searched, reusing the requested filename and a suffix.  
  This is to alleviate file sending utilities unable to use a temporary file, and directly sending the data
  under the final file name.  
  Without this, a step could be already working on a partial file due to a transfer not yet completed.  
  In addition, if the flag is not an empty file and contains a hash, a validation will be done  
  to validate the given hash with the received file.  


While the job is initialy created for searching for a single file, it is possible to wait for multiple files,  
as long as a flag file is created last, after all of the other files are fully sent.  
Also, if the files are always sent in the same order, in this case targeting the last file will also work.  


### Supported hash methods
------

The following hashes are supported : crc, md5, sha1, sha224, sha256, sha384, sha512.  

Please note the flag file's content must be using the format supported by the system commands, like sha256sum.  
The Dependencies module does not do a checksum validation by itself.


### Sleep duration
------

This module can uses 2 differents time between each file presence check :  
* for a local verification, the usual sleep time is used, with a default value set to 30 secs.
* for a remote verification, the longer sleep time is used, which is 180 secs.

Both values can be changed globally, see the "common usage" section in the documentation.
