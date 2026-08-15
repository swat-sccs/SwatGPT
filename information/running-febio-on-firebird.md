---
title: "Running FEBio on Firebird"
source: https://kb.swarthmore.edu/wiki/Running_FEBio_on_Firebird
pageid: 803
categories:
  - Firebird Software
---

# Running FEBio on Firebird

FEBio is a suite of software for finite element modeling in biomechanics and biophysics. 

## Usage

To run FEBio, first load the modulefile: 
[code] 
    module load febio
    
[/code]

To launch the command-line version of FEBio: 
[code] 
    febio4
    
[/code]

NOTE that the installation include both a command-line version (`febio4`) and a GUI version (`FEBioStudio`), but only the command-line version works. That is because the graphical version requires a slightly newer version of `glibc` than is available for the version of Rocky Linux currently installed. It is not possible to update to the newer version of `glibc` without substantial irritation.
