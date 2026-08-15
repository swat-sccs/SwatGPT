---
title: "Running MATLAB on Firebird"
source: https://kb.swarthmore.edu/wiki/Running_MATLAB_on_Firebird
pageid: 720
categories:
  - Firebird Software
---

# Running MATLAB on Firebird

MATLAB can be run on Firebird in three ways: interactively via a GUI, interactively on the command line, or unattended batch. 

## Contents

  * 1 Running Interactively with a GUI / Virtual Desktop
    * 1.1 Open OnDemand
    * 1.2 X11
      * 1.2.1 macOS and Linux Users
      * 1.2.2 Windows
  * 2 Command Line
  * 3 Running with a Graphical User Interface
    * 3.1 Windows
    * 3.2 Starting MATLAB
  * 4 Unattended Batch
    * 4.1 Submission Script Example



## Running Interactively with a GUI / Virtual Desktop

MATLAB can be run interactively in two ways. The preferred way is through a virtual desktop with Open OnDemand, though X11 on a local system is another option. 

### Open OnDemand

Typically the best option to run MATLAB interactively with a GUI is to use Open OnDemand. Follow the [steps outlined here](https://kb.swarthmore.edu/wiki/Open_OnDemand "Open OnDemand") to launch a virtual desktop through Open OnDemand. Open a terminal and load the MATLAB module: 
[code] 
    module load matlab
    
[/code]

To launch MATLAB: 
[code] 
    matlab
    
[/code]

### X11

It is also possible to launch a GUI interface from your local system via SSH/X11, though this is typically substantially less performant than using a virtual desktop through Open OnDemand. Instructions for doing so differ depending on your system’s operating system. 

#### macOS and Linux Users

On a Mac, you may need to install XQuartz if it isn't already on your system: <https://www.xquartz.org/>

#### Windows

If using Windows, first [configure X11 depending on your client](https://kb.swarthmore.edu/wiki/Running_Graphical_Applications_on_Firebird "Running Graphical Applications on Firebird"). 

Once X11 support is configured, whether using Mac, Linux, or Windows, connect via SSH, request time on a node, making sure to pass the `--x11` flag (adjust options as needed), and launch MATLAB: 
[code] 
    ssh -XYC username@firebird.swarthmore.edu
    [user@firebird ~]$ salloc -t 60 --cpus-per-task=1 --mem-per-cpu=32gb --partition=unowned --x11
    matlab
    
[/code]

The GUI interface should open locally: 

## Command Line

To use MATLAB interactively through a command line, connect to Firebird via SSH. Load the module, connect to a compute node, and then launch MATLAB: 
[code] 
    module load matlab
    matlab
    
[/code]

## Running with a Graphical User Interface

If you want to run the MATLAB graphical user interface (as opposed to the command line), connect to Firebird with X11. 

### Windows

[Setting up X11 forwarding for Windows](https://kb.swarthmore.edu/wiki/Running_Graphical_Applications_on_Firebird "Running Graphical Applications on Firebird")

### Starting MATLAB

To start MATLAB, make sure to load the MATLAB module (see above) and then type: 
[code] 
    matlab
    
[/code]

The graphical user interface will load on your computer. 

## Unattended Batch

It is possible to submit a script that will run within MTLAB, using Slurm. 

### Submission Script Example

You can submit a file with MATLAB commands; in this example, that file is named `matlab_test`, and this job submit file might be named `matlab_job.sh`. 
[code] 
    #! /bin/bash
    #SBATCH -t 1:00:00
    #SBATCH -n 1
    #SBATCH -N 1
    #SBATCH -p compute
    #SBATCH --output=./output/output_%j.log
    
    cd $HOME/matlab_test
    module load matlab
    
    matlab -batch "matlab_test" >> ./output/testcode.out.$SLURM_JOB_ID
    
[/code]

This is a basic example script and will likely need to be further modified for your specific needs. Once you have a job script, you can submit it to Slurm via: 
[code] 
    sbatch matlab_job.sh
    
[/code]
