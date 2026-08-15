---
title: "Slurm Command Reference"
source: https://kb.swarthmore.edu/wiki/Slurm_Command_Reference
pageid: 755
categories:
  - Firebird
---

# Slurm Command Reference

This page has information on how to use Slurm to submit, manage, and analyze jobs. 

Resource sharing and allocations on the cluster are handled by a combination of a  _resource manager_ (tracking which computational resources are available on which nodes) and a  _job scheduler_ (determining when and to which available resources to submit a particular job, and then monitoring it). To accomplish both tasks, The Firebird computing cluster uses the Slurm queue manager. 

There are two primary reasons to use Slurm. First, other than for basic, short testing, no “real” work should be performed on the login node, which has several responsibilities such as managing users, handling logins, monitoring the other nodes, etc. For that reason, nearly all work should be performed on the compute nodes, and Slurm acts as the “gateway” into those systems. Second, because Slurm keeps track of which resources are available on the compute nodes, it is able to allocate the most efficient set of them for your tasks, as quickly as possible. 

Slurm is a powerful and flexible program, and as such it is beyond the scope of this document to provide an exhaustive tutorial. Rather, the examples provided here should be sufficient to get started, and a wide array of online resources for further guidance. 

## Contents

  * 1 Slurm References
  * 2 Gathering Information
    * 2.1 sinfo
    * 2.2 squeue
  * 3 Job Scheduling
  * 4 Partition Configuration and Job Priority
  * 5 Creating and Submitting Jobs
    * 5.1 Interactive
      * 5.1.1 Command line
      * 5.1.2 Virtual desktop / GUI
    * 5.2 Batch
      * 5.2.1 Parallel batch
    * 5.3 Submit a job to the queue
    * 5.4 Cancel a job
  * 6 Job Information and Analysis
    * 6.1 Get details about a running job
    * 6.2 List status info for a currently running job
    * 6.3 Get efficiency statistics for a currently running job
    * 6.4 Get details about a completed job
  * 7 Cluster Information
    * 7.1 Show busy/free cores for the entire cluster
    * 7.2 Show busy/free cores for each partition
    * 7.3 Show busy/free cores for each node
    * 7.4 Show reserved nodes
    * 7.5 Reporting
    * 7.6 Generate a report for historical usage



## Slurm References

For detailed reference, the Slurm site has lots of information 

[Slurm Quick reference guide](https://slurm.schedmd.com/pdfs/summary.pdf) \- two page document with common command references 

[Slurm Man Pages](https://slurm.schedmd.com/man_index.html) \- full reference for Slurm user commands 

This page itself is modeled after the excellent [CÉCI Slurm tutorial](https://support.ceci-hpc.be/doc/_contents/QuickStart/SubmittingJobs/SlurmTutorial.html). 

## Gathering Information

Slurm offers a variety of commands to query the nodes, which can provide a snapshot of the overall computational ecosystem, list jobs in process or that are queued up, and more. 

### sinfo

The `sinfo` command lists available partitions and some basic information about each. A partition is a logical grouping of physical compute nodes. Running `sinfo` produces output similar to this; the list is dynamic and represents a current snapshot of which partitions are available, which systems comprise a given partition, and an idea of the availability of those systems: 
[code] 
    [jsimms1-swat@firebird ~]$ sinfo
    PARTITION   AVAIL  TIMELIMIT  NODES  STATE NODELIST
    compute*       up   infinite      4  alloc himem[02-03],node[01,06]
    compute*       up   infinite      5   resv himem01,node[02-03,05,07]
    compute*       up   infinite      1    mix node04
    himem          up   infinite      2  alloc himem[02-03]
    himem          up   infinite      1   resv himem01
    hicpu          up   infinite      1    mix hicpu01
    gpu            up   infinite      2    mix gpu[01-02]
    interactive    up    5:00:00      2    mix gpu[01-02]
    
[/code]

### squeue

The command `squeue` displays a list of jobs that are currently running (denoted with **R**) or that are pending (denoted with **PD**). Here is example output: 
[code] 
    $ squeue
    JOBID PARTITION NAME USER ST  TIME  NODES NODELIST(REASON)
    12345     debug job1 dave  R   0:21     4 node[9-12]
    12346     debug job2 dave PD   0:00     8 (Resources)
    12348     debug job3 ed   PD   0:00     4 (Priority)
    
[/code]

In this example, job 12345 is running on nodes 9-12 within the `debug` partition, job 12346 is pending because requested resources are unavailable, and job 12348 is pending because it is a lower priority than currently-running jobs. The other columns are largely self-explanatory, though `TIME` is the time up until now that a given job has been running. The `squeue` [help page](https://slurm.schedmd.com/squeue.html) describes many other options available to control what information is displayed and its formatting. 

## Job Scheduling

As is commonly the case with HPC clusters, there are often insufficient resources to run all jobs immediately when they are submitted; as such, submitted jobs are regularly placed into the job queue. Each job’s position in the queue depends on a number of factors. Slurm updates the priority queue every 5 seconds, so a job’s priority may change over time, moving up or down. 

Slurm also uses [backfill scheduling](https://slurm.schedmd.com/sched_config.html) to “fill in” slots when, e.g., a job completes earlier than estimated, so it is possible, especially for shorter jobs, that a job may be run prior to when it was estimated to do so. For this reason, it is **critical** to estimate the time required for your job as accurately as possible. While you should not underestimate, excessive overestimation can make it appear that subsequent jobs won’t start for a long time. A good rule of thumb, when possible, is to request about 10-15% more time than you think is required. 

Prior to submitting a job, you can check when it is estimated to be run:  
`sbatch --test-only myscript.sh`

For a job that has already been submitted, you can check its status:  
`squeue --start -j <jobid>`

For a list of your jobids:  
`squeue -u <username>`

You can check your usage information with [sshare](https://slurm.schedmd.com/sshare.html); note that **RawUsage** corresponds to CPU seconds:  
`sshare -u <username>`

You can also see a formatted list of all queued jobs, sorted by current priority (which, as noted, constantly updates):  
`squeue -o '%.7i %.9Q %.9P %.8j %.8u %.8T %.10M %.11l %.8D %.5C %R' -S '-p' --state=pending | less`

## Partition Configuration and Job Priority

Firebird's compute nodes are grouped into logical  _partitions_ , or collections of physical nodes; one common use, for example, is to designate a set of nodes owned by a particular researcher, to ensure that they have priority access to those resources. The general approach is that, for the most part, any user can use any node, but a node's owner and those they designate can preempt jobs (on nodes they purchased) from other users, resulting in those jobs being requeued. 

Users who do not own specific nodes will typically work with three partitions: `compute`, `unowned`, and `interactive`: 

**Partition** | **Description** | **Advantages** | **Disadvantages**  
---|---|---|---  
`compute` | The default partition, containing nearly every node on Firebird; if you do not specify a different partition to use, your jobs will run here.  | Due to the large pool of nodes available, jobs will start as quickly as possible.  | If a job ends up on a node owned by someone else, it is possible that the job will be preempted and would be requeued. This may not be a concern if the job uses regular checkpointing.   
`unowned` | Contains only nodes that have not been purchased by a specific researcher; that is, they are "owned" by ITS.  | Jobs running in this partition cannot be preempted.  | Because the available node pool is comparatively small, jobs may wait in the queue for a longer period of time.   
`interactive` | Contains nodes reserved for interactive sessions, either via the command line or Open OnDemand.  | Permits an interactive session that cannot be preempted.  | Interactive sessions have a time limit of 5:00:00 (five hours).   
  
It is possible to designate the desired partition to which you want to submit a job, as discussed below. 

## Creating and Submitting Jobs

Slurm offers two primary ways to submit jobs to the compute nodes: **interactive** and **batch**. Interactive is the simpler method, but its usefulness is somewhat limited and is generally used to work with software interactively. Batch is more complex and requires greater planning, but it is by far the most common use of Slurm and provides a great deal of flexibility and power. 

### Interactive

#### Command line

The simplest way to connect to a set of resources is to request an interactive shell, which can be accomplished with the `salloc` command. Here is a basic example: 
[code] 
    [user@firebird ~]$ salloc -t 60 --cpus-per-task=1 --mem-per-cpu=32gb --partition=interactive
    [user@node01 ~]$
    
[/code]

This example allocates an interactive shell session for 60 minutes (`-t 60`), provides one CPU (`--cpus-per-task=1`) and 32gb of memory to the session (`--mem-per-cpu=32gb`), and designates that the job should run on the interactive partition (`--partition=interactive`). As the second line shows, the requested resources were allocated using `node01` and the interactive session switched to that node, ready for commands. At the end of 60 minutes, the session will be terminated, demonstrating why it is important to request a suitable amount of time (if you leave off the `-t` flag and do not specify a time, your session will be allocated only 5 minutes). 

Once your interactive session starts, you will be in your home directory and can begin performing work. But, if you wish to run software with a GUI, you must explicitly indicate that by adding the `--x11` flag: 

[user@firebird ~]$ salloc -t 60 --cpus-per-task=1 --mem-per-cpu=32gb --partition=interactive --x11

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

If a virtual desktop is preferred, or is required to run a GUI program, a second option is to request an interactive session through [Open OnDemand](https://kb.swarthmore.edu/wiki/Open_OnDemand_on_Firebird "Open OnDemand on Firebird"). 

### Batch

The most common way to work with Slurm is to submit batch jobs and allow the scheduler to manage which resources are used, and at which times. So, what then, exactly, is a job? A job has two separate parts: 

  1. a **resource request** , which requests things like required cores, memory, GPUs, etc.
  2. a list of one or more **job steps** , which are basically the individual commands to be run sequentially to perform the actual tasks of the job.



The best way to manage these two parts is within a single **submission script** that Slurm uses to allocate resources and process your job steps. Here is an extremely basic sample submission script (we’ll name it `sample.sh`): 
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

**Setting** | **Meaning** | **Value**  
---|---|---  
`#SBATCH --job-name=sample` | Provide a short-ish descriptive name for your job  | sample   
`#SBATCH --output=/home/username/samplejob/output/output_%j.txt` | Where to save output from the job; note that any content that normally would be output to the terminal will be saved in the file.  | `/home/username/samplejob/output/output_%j.txt` (%j will be replaced by the job number assigned by Slurm; note that Slurm will default to producing an output file in the directory from which the job is submitted)   
`#SBATCH --partition=unowned` | Which partition to use  | unowned   
`#SBATCH --time=1:00:00` | Time limit of the job  | 1:00:00 (one hour)   
`#SBATCH --ntasks=1` | Number of CPU cores to request  | 1 (this can be increased if your code can leverage additional cores)   
`#SBATCH --mem-per-cpu=100mb` | How much memory to request  | 100mb (this is per-core and can be expressed in gb, etc.)   
`#SBATCH --mail-type=BEGIN,END,FAIL,REQUEUE` | Decide when to receive an email  | BEGIN,END,FAIL,REQUEUE (this will send an email when the job actually starts running, when it ends, if it fails, and if the job is requeued)   
`#SBATCH --mail-user=username@swarthmore.edu` | Email address  | username@swarthmore.edu   
  
After the parameters are set, the commands to run the code are added. Note that this is effectively a modified shell script, so any commands that work in such scripts will typically work. It is important, however, to precede any actual commands with `srun`. 

#### Parallel batch

Please see [Running Array or Batch Jobs](https://kb.swarthmore.edu/wiki/Running_Array_or_Batch_Jobs "Running Array or Batch Jobs")

### Submit a job to the queue

Once you have a job submission script created (e.g., `sample.sh`), use `sbatch` to send it into the queue: 

`sbatch sample.sh`

### Cancel a job

Use `scancel` to cancel a job either waiting in the queue or that is running: 

`scancel <jobid>`

## Job Information and Analysis

### Get details about a running job

`scontrol show jobid -d <jobid>`

This command will show detailed information about a running job, including how many nodes and cores requested, memory requested, and the start, elapsed, and end times. This can be run for any job including those you did not submit. 

### List status info for a currently running job

`sstat --format=AveCPU,AvePages,AveRSS,AveVMSize,JobID -j <jobid> --allsteps`

The `sstat` command can only be run on a job that you submitted. It provides detailed, configurable reporting on a running job. See detailed options on the [Slurm sstat reference page](https://slurm.schedmd.com/sstat.html). 

### Get efficiency statistics for a currently running job

`seff <jobid>`

Use the `seff` command to see CPU and memory usage for a job. The command shows how efficient a job is using both cpu and memory. If you notice low utilization, you may be able to request fewer resources. 

### Get details about a completed job

`sacct -o jobid,jobname,start,end,NNodes,NCPUS,ReqMem,CPUTime,AveRSS,MaxRSS -S <start date> -E <end date> --user=<username> --units=G`

The sacct command will show information about completed jobs which can be helpful to see how much memory was used. Check the [sacct Slurm reference page](https://slurm.schedmd.com/sacct.html) for the full list of attributes available. 

Example: 

`sacct -o jobid,jobname,start,end,NNodes,NCPUS,ReqMem,CPUTime,AveRSS,MaxRSS -S 2021-06-01 -E 2021-07-01 --user=apaul1 --units=G`

## Cluster Information

### Show busy/free cores for the entire cluster
[code] 
    sinfo -o "%C"
    
[/code]

Example output (A=allocated, I=idle, O=other, T=total): 
[code] 
    CPUS(A/I/O/T)
    296/24/0/320
    
[/code]

In this example, 296 cores in the cluster are allocated (busy), 24 cores are idle, 0 cores are other (e.g. unavailable, down), and there are 320 total cores. 

### Show busy/free cores for each partition

This commands shows how many cores are allocated and idle for each partition. 
[code] 
    sinfo -o "%R %C"
    
[/code]

Example output (A=allocated, I=idle, O=other, T=total): 
[code] 
    PARTITION CPUS(A/I/O/T)
    compute 296/24/0/320
    himem 120/0/0/120
    gpu 76/4/0/80
    
[/code]

### Show busy/free cores for each node

This command shows how many cores are allocated and idle for each node. We also add the status (idle, allocated, or mixed) 
[code] 
    sinfo -o "%n %T %C"
    
[/code]

Example output (A=allocated, I=idle, O=other, T=total): 
[code] 
    HOSTNAMES STATE CPUS(A/I/O/T)
    node01 mixed 30/10/0/40
    node03 mixed 30/10/0/40
    himem02 allocated 40/0/0/40
    gpu02 mixed 36/4/0/40
    gpu01 allocated 40/0/0/40
    himem01 allocated 40/0/0/40
    himem03 allocated 40/0/0/40
    node02 allocated 40/0/0/40
    
[/code]

In this example, some nodes are mixed status and some are completely allocated 

### Show reserved nodes

Researchers who have purchased nodes on Firebird may reserve them for exclusive use during periods of intense work. Use this command to see the list of reserved nodes: 
[code] 
    sinfo -T
    
[/code]

Example output: 
[code] 
    RESV_NAME      STATE           START_TIME             END_TIME     DURATION  NODELIST
    group1       ACTIVE  2021-08-31T10:23:01  2021-12-15T09:23:01  106-00:00:00  node[01,02]
    
[/code]

This indicates that node01 and node02 are reserved and can only be used by members of group1. 

### Reporting

### Generate a report for historical usage

`sreport cluster UserUtilizationByAccount -t Hours start=<start date> Users=$USER`

The `sreport `command can generate a report of cluster usage for a specific user. This can be helpful when determining how much analyzing how much CPU time was needed to perform a set of jobs. Detailed information available on the [Slurm sreport reference page](https://slurm.schedmd.com/sreport.html). 

Example: 

`sreport cluster UserUtilizationByAccount -t Hours start=2021-01-01 Users=$USER`
