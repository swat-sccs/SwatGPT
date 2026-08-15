---
title: "Running Software on Firebird"
source: https://kb.swarthmore.edu/wiki/Running_Software_on_Firebird
pageid: 83
categories:
  - Firebird Software
---

# Running Software on Firebird

Firebird offers several software packages, both open-source and licensed. Access to many packages is controlled through **modules** : in order to use a particular software package, users must first load the appropriate module, which updates the user’s PATH and other environment variables to ensure the software works as expected. 

## Contents

  * 1 List Available Modules
  * 2 Load a Software Module
  * 3 View Loaded Modules
  * 4 Unload or Purge Modules
  * 5 Firebird Software Help Pages



## List Available Modules

To see a list of available software modules: 
[code] 
    module avail
    
[/code]

## Load a Software Module

To load a particular module: 
[code] 
    module load mathematica/14
    
[/code]

Note that because Firebird is a shared system, some software may be licensed only for one institution. For example, Stata is licensed differently for Swarthmore: 
[code] 
    module avail stata
    
    ------------------------------------------------------------------------------------- /opt/modulefiles -------------------------------------------------------------------------------------
       stata/18-laf    stata/18-swat (D)
    
[/code]

Make sure to load the module for your institution. 

## View Loaded Modules

To see a list of currently loaded modules in your environment: 
[code] 
    module list
    
[/code]

## Unload or Purge Modules

To unload a specific module: 
[code] 
    module unload mathematica/14
    
[/code]

To unload all loaded modules: 
[code] 
    module purge
    
[/code]

## Firebird Software Help Pages

  * [Python on Firebird](https://kb.swarthmore.edu/wiki/Python_on_Firebird "Python on Firebird")
  * [Running Amber and AmberTools on Firebird](https://kb.swarthmore.edu/wiki/Running_Amber_and_AmberTools_on_Firebird "Running Amber and AmberTools on Firebird")
  * [Running FEBio on Firebird](https://kb.swarthmore.edu/wiki/Running_FEBio_on_Firebird "Running FEBio on Firebird")
  * [Running Gaussian on Firebird](https://kb.swarthmore.edu/wiki/Running_Gaussian_on_Firebird "Running Gaussian on Firebird")
  * [Running MATLAB on Firebird](https://kb.swarthmore.edu/wiki/Running_MATLAB_on_Firebird "Running MATLAB on Firebird")
  * [Running Mathematica on Firebird](https://kb.swarthmore.edu/wiki/Running_Mathematica_on_Firebird "Running Mathematica on Firebird")
  * [Running RStudio on Firebird](https://kb.swarthmore.edu/wiki/Running_RStudio_on_Firebird "Running RStudio on Firebird")
  * Running Software on Firebird
  * [Running Stata/MP on Firebird](https://kb.swarthmore.edu/wiki/Running_Stata/MP_on_Firebird "Running Stata/MP on Firebird")
