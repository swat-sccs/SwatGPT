---
title: "Running Graphical Applications on Firebird"
source: https://kb.swarthmore.edu/wiki/Running_Graphical_Applications_on_Firebird
pageid: 778
categories:
  - Firebird
---

# Running Graphical Applications on Firebird

While the most common way to interact with a computing cluster such as Firebird is through the command line and batch scripts, from time to time it is useful to run programs that have a GUI (e.g., Stata, MATLAB, etc.), such as when something needs to be visualized or when it's easier to proceed through an analysis interactively. In addition, using certain programs graphically can be easier for users who might be less comfortable working in a Linux command-line environment, while still providing the greater resources available on the cluster. 

It is possible to run GUI applications on both Windows and Mac systems, as well as through any web browser. 

## Contents

  * 1 Mac and Windows
    * 1.1 Mac
    * 1.2 Windows
      * 1.2.1 PuTTY
      * 1.2.2 MobaXterm
    * 1.3 Connecting to a compute node
    * 1.4 Testing X11
  * 2 Web Browser / Open OnDemand



## Mac and Windows

On Windows and Mac systems, displaying graphics from a remote system requires _X11 forwarding_ , which essentially sends the graphics from the remote system back to your local system in order to actually render them. Because this relies largely on software to render the graphics, graphical performance usually will be degraded compared with running the same application locally, but the actual analyses and processing happen on the server and will often be more performant than a local system. 

### Mac

In order to support X11 graphical applications on a Mac, download and install [XQuartz](https://www.xquartz.org/). Note that this will necessitate a reboot. Following installation, XQuartz will launch automatically when needed. 

The second requirement is to enable X11 to be forwarded over SSH. This is accomplished by using the `-Y` flag when connecting to Firebird via SSH: 
[code] 
    ssh -Y username@firebird.swarthmore.edu
    
[/code]

### Windows

On Windows, there are two primary options to support X11, depending on the program used to connect to Firebird (PuTTY or MobaXterm). 

#### PuTTY

[PuTTY](https://kb.swarthmore.edu/wiki/Windows_Terminal_Access#PuTTY "Windows Terminal Access") users should download and install XMing, and then configure PuTTY to connect the two: 

  * [Download Xming](https://sourceforge.net/projects/xming/files/Xming/) and install
  * Start Xming by running the XLaunch program and configure 
    * At the Display settings dialog box, select Multiple windows and set the Display number as 0
    * Accept the default settings for everything else
  * Start PuTTY and configure SSH compression and "X11 forwarding" 
    * _Connection → SSH → _Check "Enable compression"
    * _Connection _→ _ SSH_ →  _X11_ → Check "Enable X11 forwarding"
  * Connect to Firebird



#### MobaXterm

[MobaXterm](https://kb.swarthmore.edu/wiki/Windows_Terminal_Access#MobaXterm "Windows Terminal Access") comes with a built-in X11 server and automatically launches it when connecting via SSH. Nothing further needs to be done to support GUI applications. 

### Connecting to a compute node

In general, users must connect to a compute node to run applications or code; it is not typically permitted to run any application, including those requiring a GUI, from the login/head node. When [creating an interactive session](https://kb.swarthmore.edu/wiki/Slurm_Command_Reference#Interactive "Slurm Command Reference"), users must specify the `--x11` flag to enable graphics to display, as shown in this example: 
[code] 
    salloc -t 60 --cpus-per-task=1 --mem-per-cpu=32gb --x11
    
[/code]

### Testing X11

Regardless of which operating system and program is used to connect to Firebird, the best way to test whether X11 forwarding is working on your local system is to launch a graphical application, the simplest of which is `xclock`, which displays a basic clock face. 
[code] 
    xclock &
    
[/code]

## Web Browser / Open OnDemand

It is also possible to [launch graphical applications through an interactive desktop](https://kb.swarthmore.edu/wiki/Open_OnDemand_on_Firebird#Interactive_Desktop "Open OnDemand on Firebird") provided through Open OnDemand, and indeed the graphical performance will be dramatically faster than launching the application from your local system using X11.
