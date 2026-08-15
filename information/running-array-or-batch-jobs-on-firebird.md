---
title: "Running Array or Batch Jobs on Firebird"
source: https://kb.swarthmore.edu/wiki/Running_Array_or_Batch_Jobs_on_Firebird
pageid: 784
categories:
  - Firebird
---

# Running Array or Batch Jobs on Firebird

While serial or interactive jobs are incredibly useful, one of the greatest advantages that working on a cluster provides is relatively simple management of parallel tasks. You may want to run many instances of the same job, possibly with different inputs. Use the Slurm [job array](https://slurm.schedmd.com/job_array.html) command or other batch approaches. You can, with a comparatively simple script, manage thousands of runs of a program over several hours or days, or run the same program using a different input file each time, automatically. Many types of parallel jobs are possible, such as parameter sweeps, MPI, and OpenMP. Please note that the examples below are, indeed, merely examples, and are meant to be as basic as possible to demonstrate what is possible. Actual scripts could be much more complex, depending on a particular use case. 

## Example array and parallel submission scripts

The --array line configures the number and value of the tasks. There are many ways to configure this command - see the [Slurm job array command reference](https://slurm.schedmd.com/job_array.html) for more information. A very simple example is: 
[code] 
    #!/bin/bash
    #SBATCH --job-name=param_sweep
    #SBATCH --output=param_sweep_output.txt
    #SBATCH --ntasks=1
    #SBATCH --time=10:00
    #SBATCH --mem-per-cpu=100mb
    #SBATCH --array=1-8
    
    srun ./my_script $SLURM_ARRAY_TASK_ID
    
[/code]

This would run eight distinct jobs: `my_script 1`, `my_script 2`, etc., but note that they could execute in any order (e.g., 2,3,1,4,5,6,8,7). 

This approach can also be used to process multiple data files: 
[code] 
    #!/bin/bash
    #SBATCH --job-name=param_sweep
    #SBATCH --output=param_sweep_output.txt
    #SBATCH --ntasks=1
    #SBATCH --time=10:00
    #SBATCH --mem-per-cpu=100mb
    #SBATCH --array=0-7
    
    FILES=(/path/to/data/*)
    
    srun ./my_script ${FILES[$SLURM_ARRAY_TASK_ID]}
    
[/code]

The `FILES=` command creates an array of all files in a particular directory, which you can then pass to `my_script` by iterating through them using the current integer value of `$SLURM_ARRAY_TASK_ID`. 

A similar approach allows you to pass non-integer values to your program: 
[code] 
    #!/bin/bash
    #SBATCH --job-name=param_sweep
    #SBATCH --output=param_sweep_output.txt
    #SBATCH --ntasks=1
    #SBATCH --time=10:00
    #SBATCH --mem-per-cpu=100mb
    #SBATCH --array=0-2
    
    ARGS=(0.05 0.76 1.28)
    srun ./my_script ${ARGS[$SLURM_ARRAY_TASK_ID]}
    
[/code]

Non-numeric arguments can also be passed simply by populating them within the `ARGS` array: `ARGS=("red" "blue" "green")`. In addition, it is possible to use non-sequential integers: `--array=0,3,4,9-22` or `--array=0-12:4` (equivalent to `--array=0,4,8,12`). 

To illustrate a slightly more robust example, an array of 10 jobs with ids from 1 to 10 are created. All jobs share the same Slurm job id ($SLURM_JOB_ID), but have task ids that match their array value ($SLURM_ARRAY_TASK_ID). The variable a is assigned to the value of the array task id before being passed into the MATLAB script. The output files are set up to use both the job id and array task id in the filename to avoid being overwritten by other jobs/tasks. 
[code] 
    #!/bin/bash
    #SBATCH --time=1:00:00
    #SBATCH --array=1-10
    #SBATCH --nodes=1
    #SBATCH --partition=compute
    #SBATCH --output=./output/output_%A_%a.log
    
    cd $HOME/matlab_test
    module load matlab
    srun matlab -batch "a=$SLURM_ARRAY_TASK_ID;run('./matlab_test.m');exit" >> ./output/testcode.out_$SLURM_JOB_ID.$SLURM_ARRAY_TASK_ID
    
[/code]

If the running time of an individual job is about 10 minutes or less, however, using a job array may introduce unnecessary overhead; instead, you can loop through files manually: 
[code] 
    #!/bin/bash
    #SBATCH --ntasks=8
    
    for file in /path/to/data/*
    do
       srun -n1 --exclusive ./my_script $file &
    done
    wait
    
[/code]

This will loop through all files within a given directory, processing up to eight at a time. A variant allows you to send in, e.g., integers to your program, again 8 at a time: 
[code] 
    #!/bin/bash
    #
    #SBATCH --ntasks=8
    
    for i in {1..1000}
    do
       srun -N1 -n1 -c1 --exclusive ./my_script $i &
    done
    wait
    
[/code]
