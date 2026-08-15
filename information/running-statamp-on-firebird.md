---
title: "Running Stata/MP on Firebird"
source: https://kb.swarthmore.edu/wiki/Running_Stata/MP_on_Firebird
pageid: 780
categories:
  - Firebird Software
---

# Running Stata/MP on Firebird

Stata/MP is available for use on Firebird and can be run either interactively or in unattended batch mode. Running it on Firebird has potentially several advantages over running it on a local system, such as a personal laptop or lab workstation, including: 

  * Stata/MP can handle extremely large datasets that may require more memory, disk space, or time than is reasonable or efficient on a local system.
  * It is possible to create a batch job that can process multiple jobs serially, such as a parameter sweep, that would be extremely tedious to manage on a local system.
  * Stata/MP can automatically use parallel versions of its internal functions to leverage up to 8 CPUs simultaneously without requiring any code changes.



Below are basic instructions for using Stata/MP either interactively or in batch mode; these are not meant to be exhaustive. For further assistance with your specific workflows, please reach out to [jsimms1@swarthmore.edu](mailto:jsimms1@swarthmore.edu)

## Contents

  * 1 Interactive
    * 1.1 Open OnDemand / Interactive Desktop
    * 1.2 SSH / X11
    * 1.3 Launching the graphical version of Stata/MP
  * 2 Batch Mode
  * 3 Accessing Data on Firebird



## Interactive

It is possible to run Stata/MP with its traditional GUI interface, which looks and feels nearly identical to running it from a local system, and there are two options to do this. 

### Open OnDemand / Interactive Desktop

The preferred method is to use [Open OnDemand](https://kb.swarthmore.edu/wiki/Open_OnDemand "Open OnDemand") and request an interactive desktop. This offers the best graphical performance, though there are resource limitations (mostly that you are limited to a 5-hour continuous session). Once connected to the virtual desktop, launch a terminal session and then follow the instructions below to launch Stata. 

### SSH / X11

You can connect to Firebird via SSH and enable X11 forwarding, which will allow you to launch Stata and interact with it as though it were running locally. Please see [these instructions for doing so](https://kb.swarthmore.edu/wiki/Running_Graphical_Applications_on_Firebird "Running Graphical Applications on Firebird"), which differ depending on the system and software used to connect. To allocate an interactive session through Slurm once logged into Firebird, use the following command (please note, the `salloc` line below is for example purposes only and will likely need to be modified; in this case, you would get an interactive session with 8 cores and 32GB of memory for two hours): 
[code] 
    salloc -t120 -c8 -n1 --mem-per-cpu=4GB --x11
    
[/code]

### Launching the graphical version of Stata/MP

Regardless of whether you are using a virtual desktop through Open OnDemand or are using SSH to connect to Firebird, launching the GUI version of Stata/MP from the command line is the same. 
[code] 
    module load stata/19-swat
    xstata-mp
    
[/code]

## Batch Mode

[Using Stata/MP in batch mode](https://www.stata.com/support/faqs/unix/batch-mode/) generally means submitting text files with commands that execute without the need for active monitoring (called  _unattended_). It is possible to submit many jobs simultaneously using [Slurm](https://kb.swarthmore.edu/wiki/Slurm "Slurm"), for example, and then logging in later when the jobs have completed to view or analyze the results. All the possible ways to accomplish this are many and nuanced, so again please feel free to reach out for assistance. 

## Accessing Data on Firebird

Regardless of whether you are working interactively or in batch mode, the program is actually running on Firebird, which means any scripts, datasets, etc. must be on Firebird in order to be used. Again, [several options are available to transfer files to and from Firebird](https://kb.swarthmore.edu/wiki/Transferring_Files "Transferring Files"), and it depends mostly on the platform and software used to connect to Firebird. Please reach out for additional assistance or information.
