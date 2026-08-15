---
title: "Running Mathematica on Firebird"
source: https://kb.swarthmore.edu/wiki/Running_Mathematica_on_Firebird
pageid: 793
categories:
  - Firebird Software
---

# Running Mathematica on Firebird

Mathematica can be run on Firebird in three ways: interactively via a GUI or interactively on the command line. 

## Contents

  * 1 Running Interactively with a GUI / Virtual Desktop
    * 1.1 Open OnDemand
    * 1.2 X11
      * 1.2.1 macOS and Linux Users
      * 1.2.2 Windows
  * 2 Command Line



## Running Interactively with a GUI / Virtual Desktop

Mathematica can be run interactively in two ways. The preferred way is through a virtual desktop with Open OnDemand, though X11 on a local system is another option. 

### Open OnDemand

Typically the best option to run Mathematica interactively with a GUI is to use Open OnDemand. Follow the [steps outlined here](https://kb.swarthmore.edu/wiki/Open_OnDemand "Open OnDemand") to launch a virtual desktop through Open OnDemand. Open a terminal and load the Mathematica module: 
[code] 
    module load mathematica
    
[/code]

To launch MATLAB: 
[code] 
    WolframNB
    
[/code]

### X11

It is also possible to launch a GUI interface from your local system via SSH/X11, though this is typically substantially less performant than using a virtual desktop through Open OnDemand. Instructions for doing so differ depending on your system’s operating system. 

#### macOS and Linux Users

On a Mac, you may need to install XQuartz if it isn't already on your system: <https://www.xquartz.org/>

#### Windows

If using Windows, first [configure X11 depending on your client](https://kb.swarthmore.edu/wiki/Running_Graphical_Applications_on_Firebird "Running Graphical Applications on Firebird"). 

Once X11 support is configured, whether using Mac, Linux, or Windows, connect via SSH, request time on a node, making sure to pass the `--x11` flag (adjust options as needed), and launch Mathematica: 
[code] 
    ssh -XYC username@firebird.swarthmore.edu
    [user@firebird ~]$ salloc -t 60 --cpus-per-task=1 --mem-per-cpu=32gb --partition=unowned --x11
    WolframNB
    
[/code]

The GUI interface should then open locally. 

## Command Line

To use Mathematica interactively through a command line, connect to Firebird via SSH. Load the module, connect to a compute node, and then launch Mathematica: 
[code] 
    salloc -t 60 --cpus-per-task=1 --mem-per-cpu=32gb --partition=unowned
    module load mathematica
    math
    
[/code]
