---
title: "Open OnDemand on Firebird"
source: https://kb.swarthmore.edu/wiki/Open_OnDemand_on_Firebird
pageid: 776
categories:
  - Firebird
---

# Open OnDemand on Firebird

The Firebird computing cluster runs the Open OnDemand system, which provides access to files, jobs, and an interactive desktop via a web browser. 

## Contents

  * 1 Accessing the site
  * 2 Features
    * 2.1 Interactive Desktop
    * 2.2 File Browser
    * 2.3 Jupyter Notebooks
      * 2.3.1 Jupyter Application
      * 2.3.2 Configuring Jupyter via Miniconda
    * 2.4 Shell / Terminal Session
    * 2.5 Slurm Jobs



## Accessing the site

You must have a Firebird account set up to use Open OnDemand. 

  * In a web browser, go to <https://firebird.swarthmore.edu>
  * You will be presented with a CILogon page; under _Select an Identity Provider_ , choose _Swarthmore College_
  * Click _Log On_. You will be directed to Swarthmore’s single sign-on page.
  * Once you have authenticated, you should be logged into Open OnDemand.



## Features

Open OnDemand is feature-rich, though certain features available from the Open OnDemand menus and interface may be unavailable. The most useful applications are the file browser, Slurm job lists, the interactive desktop, and Jupyter Notebooks. 

### Interactive Desktop

It is possible to launch an interactive desktop from within Open OnDemand, which provides a graphical Linux desktop environment running on a Firebird worker node. This can be useful for running a graphical program such as MATLAB, Mathematica, Stata, etc. There are time and resource limits, so the interactive use is not designed for long-running or intensive compute jobs. To launch an interactive desktop session after logging in: 

  * From the top menu bar, click **Interactive Apps**
  * Click **Firebird Desktop**
  * Adjust values in the form (e.g., cores, memory, and whether you require a GPU) and click **Launch**
  * You may have to wait a minute for the session to start; when it does, click **Launch Firebird Desktop**
    * note that if insufficient resources are available to create the desktop immediately, you may have to wait for resources to become available; if so, you can elect to receive an email when your desktop is available



### File Browser

Open OnDemand provides a helpful file browser, which shows a list of your files on Firebird and makes it easy to manage them. It is possible to upload and download files as well as view and edit text files, which can be handy for simple changes. 

  * From the top menu bar, click **Files** → **Home Directory**



### Jupyter Notebooks

Users have two options to access Jupyter Notebooks via Open OnDemand. It is possible to launch a basic Jupyter Notebook through a pre-defined application. In certain cases, however, such as when specific Python libraries or a GPU are required, it makes more sense to create a specific miniconda environment and launch custom Jupyter notebooks through the interactive desktop; nevertheless, this generic option can be useful for testing, class use, etc. Moreover, from within the Jupyter interface, it is possible to open an interactive Python console, as well as a shell / terminal session. 

#### Jupyter Application

  * From the top menu bar, click **Interactive Apps**
  * Click **Jupyter Notebook**
  * Adjust form values as needed (most can be left blank or at the default value, but it may especially be helpful to adjust the time needed) and click **Launch**
  * You may have to wait a minute for the session to start; when it does, click **Launch Jupyter Notebook**
    * note that if insufficient resources are available to create the notebook immediately, you may have to wait for resources to become available; if so, you can elect to receive an email when your notebook is available



#### Configuring Jupyter via Miniconda

It is possible to configure a Miniconda environment to run Jupyter Notebooks or Jupyter Lab, which is useful if you need to customize your environment with additional packages, or if you need to run on a GPU node, etc. These instructions assume you have [installed Miniconda](https://kb.swarthmore.edu/wiki/Python_on_Firebird#Miniconda "Python on Firebird") and are working within an interactive virtual desktop session (instructions above): 
[code] 
    conda create -n jupyter
    conda install notebook
    jupyter notebook
    
[/code]

This should launch a Jupyter Notebook session in a web browser. If you prefer to work within Jupyter Lab instead, you can use these commands: 
[code] 
    conda create -n jupyter
    conda install jupyterlab
    jupyter lab
    
[/code]

### Shell / Terminal Session

It is possible to open a terminal session from within Open OnDemand: 

  * Click on the Firebird Shell Access icon from the main page
  * Or, from the top menu bar, click **Clusters** → **Firebird Shell Access**
  * As an alternative method, from the top menu bar, click **Files** → **Home Directory**
  * In the upper-right of the screen, click **Open in Terminal**



### Slurm Jobs

See a list of Slurm jobs running on Firebird. The default view shows only your jobs, but it can be changed to view all jobs. Expanding a job shows more details. While it is also possible to submit jobs from this interface, for most cases it is easier to use the command line: 

  * From the top menu bar, click **Jobs** → **Active Jobs**
