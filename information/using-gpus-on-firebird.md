---
title: "Using GPUs on Firebird"
source: https://kb.swarthmore.edu/wiki/Using_GPUs_on_Firebird
pageid: 783
categories:
  - Firebird
---

# Using GPUs on Firebird

Firebird offers multiple nodes with NVIDIA GPUs. Typically, these must be requested via Slurm before they can be used. There are different methods to request one or more GPUs depending on whether you are submitting a batch script, working interactively on the command line, or creating a virtual desktop session. 

## List of GPUs

The following table lists which specific types of GPUs are available, some of their characteristics, and which nodes they are in. Examples of how to use this information to request a specific GPU are below. 

**Node** | **GPU Type and Number** | **Memory**  
---|---|---  
gpu01  | rtx2080ti (4)  | 11 GB   
gpu02  | quadro_8000 (3)  | 48 GB   
gpu03  | rtx2080ti (4)  | 11 GB   
gpu04  | l40s (4)  | 48 GB   
gpu05  | h200 (2)  | 141 GB   
gpu06  | rtx6000 (2)  | 96 GB   
  
## Requesting a GPU in a Batch Script or Interactively

The easiest way to request a GPU through Slurm is with the `--gpus-per-node`directive. 

If you do not have a preference which specific GPU you want: 

Within a [job submission script](https://kb.swarthmore.edu/wiki/Slurm#Batch "Slurm"): 
[code] 
    #SBATCH --gpus-per-node=1
    
[/code]

As part of an `salloc`command to create an [interactive terminal session](https://kb.swarthmore.edu/wiki/Slurm#Interactive "Slurm"): 
[code] 
    --gpus-per-node=1
    
[/code]

If you want to request a specific model of GPU, add the **type** from the table above, for example: 
[code] 
    --gpus-per-node=h200:1
    
[/code]

In addition to requesting the GPU, it is necessary to load the CUDA module. Either within a job submission script, or from the command line: 
[code] 
    module load cuda
    
[/code]

This will load the latest default CUDA version. To see a list of all available CUDA versions, for example: 
[code] 
    module keyword cuda
    
    The following modules match your search criteria: "cuda"
    ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    
      cuda: cuda/11.8-0, cuda/12.4-0
    
[/code]

## Requesting a GPU in a Virtual Desktop Session

As part of the form to request a [virtual desktop session](https://kb.swarthmore.edu/wiki/Open_OnDemand#Interactive-Desktop "Open OnDemand"), there is a drop-down box to request a specific model of GPU, if desired.
