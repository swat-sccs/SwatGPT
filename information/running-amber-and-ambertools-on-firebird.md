---
title: "Running Amber and AmberTools on Firebird"
source: https://kb.swarthmore.edu/wiki/Running_Amber_and_AmberTools_on_Firebird
pageid: 781
categories:
  - Firebird Software
---

# Running Amber and AmberTools on Firebird

Amber and AmberTools are a set of programs related to molecular dynamics. 

## Usage

To run programs within the Amber or AmberTools suite, load the modulefile: 
[code] 
    module load amber/24
    
[/code]

If you wish to use GPU-accelerated versions of programs, you must run your job on a GPU node and also must load the CUDA modulefile: 
[code] 
    module load cuda/12.4-0
    
[/code]

If you wish to use MPI or OpenMP versions of programs, you must load an appropriate modulefile: 
[code] 
    module load openmpi/4.1.6-gcc-11.4.1  ## For OpenMPI
    module load mvapich2/2.3.7-1-gcc-11.4.1  ## For mvapich2
    module load mpich/4.2.0-gcc-11.4.1  ## For mpich
    
[/code]
