---
title: "Slurm"
source: https://kb.swarthmore.edu/wiki/Slurm
pageid: 782
categories:
  - Firebird
---

# Slurm

Resource sharing and allocations on the cluster are handled by a combination of a  _resource manager_ (tracking which computational resources are available on which nodes) and a  _job scheduler_ (determining when and to which available resources to submit a particular job, and then monitoring it). To accomplish both tasks, The Firebird computing cluster uses the Slurm queue manager. 

There are two primary reasons to use Slurm. First, other than for basic, short testing, no “real” work should be performed on the login node, which has several responsibilities such as managing users, handling logins, monitoring the other nodes, etc. For that reason, nearly all work should be performed on the compute nodes, and Slurm acts as the “gateway” into those systems. Second, because Slurm keeps track of which resources are available on the compute nodes, it is able to allocate the most efficient set of them for your tasks, as quickly as possible. 

Slurm is a powerful and flexible program, and as such it is beyond the scope of this document to provide an exhaustive tutorial. For specific guidance about using Slurm for your specific workflow, please contact Jason Simms (jsimms1@swarthmore.edu). 

## Contents

  * 1 Creating and Submitting Jobs
    * 1.1 Interactive
      * 1.1.1 Command line
      * 1.1.2 Virtual desktop / GUI
    * 1.2 Batch
      * 1.2.1 Parallel batch
    * 1.3 Submit a job to the queue
    * 1.4 Cancel a job



## Creating and Submitting Jobs

Slurm offers two primary ways to submit jobs to the compute nodes: **interactive** and **batch**. Interactive is the simpler method, but its usefulness is somewhat limited and is generally used to work with software interactively. Batch is more complex and requires greater planning, but it is by far the most common use of Slurm and provides a great deal of flexibility and power. 

### Interactive

#### Command line

The simplest way to connect to a set of resources is to request an interactive shell, which can be accomplished with the `salloc` command. Here is a basic example: 
[code] 
    [user@firebird ~]$ salloc -t 60 --cpus-per-task=1 --mem-per-cpu=32gb --partition=interactive
    [user@node01 ~]$
    
[/code]

This example allocates an interactive shell session for 60 minutes (`-t 60`), provides one CPU (`--cpus-per-task=1`) and 32gb of memory to the session (`--mem-per-cpu=32gb`), and designates that the job should run on the `interactive` partition (`--partition=interactive`). As the second line shows, the requested resources were allocated using `node01` and the interactive session switched to that node, ready for commands. At the end of 60 minutes, the session will be terminated, demonstrating why it is important to request a suitable amount of time (if you leave off the `-t` flag and do not specify a time, your session will be allocated only 5 minutes). 

Once your interactive session starts, you will be in your home directory and can begin performing work. But, if you wish to run software with a GUI, you must explicitly indicate that by adding the `--x11` flag to your request: 
[code] 
    [user@firebird ~]$ salloc -t 60 --cpus-per-task=1 --mem-per-cpu=32gb --partition=interactive --x11
    
[/code]

`salloc` is extremely powerful and [there are a number of other options you can leverage](https://slurm.schedmd.com/salloc.html). One of the most useful flags is `--ntasks-per-node`, which will allocate a specific number of computational cores to the session. This can be useful when running software that is optimized for parallel operations, such as Stata. For instance, the following example modifies the previous command to also request 8 cores: 
[code] 
    [user@firebird ~]$ salloc -t 60 -N 1-1 --ntasks-per-node=8 --mem=32gb --partition=interactive
    [user@node01 ~]$
    
[/code]

When finished with your session, the `exit` command will terminate it and return you to the login node: 
[code] 
    [user@node01 ~]$ exit
    [user@firebird ~]$
    
[/code]

#### Virtual desktop / GUI

If a virtual desktop is preferred, or is required to run a GUI program, a second option is to request an [interactive desktop session through Open OnDemand](https://kb.swarthmore.edu/wiki/Open_OnDemand#Interactive-Desktop "Open OnDemand"). 

### Batch

The most common way to work with Slurm is to submit batch jobs and allow the scheduler to manage which resources are used, and at which times. So, what then, exactly, is a job? A job has two separate parts: 

  1. a **resource request** , which requests things like required cores, memory, GPUs, etc.
  2. a list of one or more **job steps** , which are basically the individual commands to be run sequentially to perform the actual tasks of the job.



The best way to manage these two parts is within a single **submission script** that Slurm uses to allocate resources and process your job steps. Here is an extremely basic sample submission script (we’ll name it `sample.sh` \- a [more realistic sample script](https://kb.swarthmore.edu/wiki/Sample_Slurm_Job_Script "Sample Slurm Job Script") is also available): 
[code] 
    #!/bin/bash
    #SBATCH --job-name=sample
    #SBATCH --output=/home/username/samplejob/output/output_%j.txt
    #SBATCH --partition=unowned
    #SBATCH --time=1:00:00
    #SBATCH --ntasks=1
    #SBATCH --mem-per-cpu=100mb
    #SBATCH --mail-type=BEGIN,END,FAIL,REQUEUE
    #SBATCH --mail-user=username@swarthmore.edu
    
    cd $HOME/samplejob
    srun my_code.sh
    
[/code]

Following the first (shebang) line are any number of `SBATCH` directives, which handle the resource request and other data (e.g., job name, output file location, and potentially many other options) associated with your job. These all must appear at the top of the file, prior to any job steps. In this file, multiple `#SBATCH` directives define the job: 

Setting  | Meaning  | Value   
---|---|---  
`#SBATCH --job-name=sample` | Provide a short-ish descriptive name for your job  | sample   
`#SBATCH --output=/home/username/samplejob/output/output_%j.txt` | Where to save output from the job; note that any content that normally would be output to the terminal will be saved in the file.  | `/home/username/samplejob/output/output_%j.txt` (%j will be replaced by the job number assigned by Slurm; note that Slurm will default to producing an output file in the directory from which the job is submitted)   
`#SBATCH --partition=unowned` | Which partition to use  | unowned   
`#SBATCH --time=1:00:00` | Time limit of the job  | 1:00:00 (one hour)   
`#SBATCH --ntasks=1` | Number of CPU cores to request  | 1 (this can be increased if your code can leverage additional cores)   
`#SBATCH --mem-per-cpu=100mb` | How much memory to request  | 100mb (this is per-core and can be expressed in gb, etc.)   
`#SBATCH --mail-type=BEGIN,END,FAIL,REQUEUE` | Decide when to receive an email  | BEGIN,END,FAIL,REQUEUE (this will send an email when the job actually starts running, when it ends, if it fails, and if the job is requeued)   
`#SBATCH --mail-user=username@swarthmore.edu` | Email address  | [username@swarthmore.edu](mailto:username@swarthmore.edu)  
  
After the parameters are set, the commands to run the code are added. Note that this is effectively a modified shell script, so any commands that work in such scripts will typically work. It is important, however, to precede any actual commands with `srun`. 

#### Parallel batch

Please see [Running Array or Batch Jobs](https://kb.swarthmore.edu/wiki/Running_Array_or_Batch_Jobs "Running Array or Batch Jobs") for information about submitting batch or array jobs. 

### Submit a job to the queue

Once you have a job submission script created (e.g., `sample.sh`), use `sbatch` to send it into the queue: 

`sbatch sample.sh`

### Cancel a job

Use `scancel` to cancel a job either waiting in the queue or that is running: 

`scancel <jobid>`
