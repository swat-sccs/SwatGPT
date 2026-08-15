---
title: "Running Gaussian on Firebird"
source: https://kb.swarthmore.edu/wiki/Running_Gaussian_on_Firebird
pageid: 718
categories:
  - Firebird Software
---

# Running Gaussian on Firebird

[Gaussian](https://gaussian.com/) is computational chemistry software application. 

## Contents

  * 1 Setup
    * 1.1 Verify you are in the Gaussian Group
      * 1.1.1 **Run this command on Firebird**
      * 1.1.2 **Expected output of groups command**
    * 1.2 Transfer files
  * 2 Submitting Gaussian Jobs
    * 2.1 Job submission script
    * 2.2 Gaussian Submission Script File
    * 2.3 Running the Gaussian Submission Script
    * 2.4 Other notes
    * 2.5 Clean Up Script
  * 3 Transferring Gaussian Checkpoint Files
    * 3.1 **Run these commands on Firebird**
    * 3.2 **Run this command on your computer to copy files from Firebird**
    * 3.3 **Run this command on your computer**



## Setup

Log into Firebird 

### Verify you are in the Gaussian Group

Check to see if you are in the "gaussian" group. This is required to be able to use Gaussian. To check, type the command "groups" on Firebird. 

##### **Run this command on Firebird**
[code] 
    groups
    
[/code]

The output should look something like this: 

##### **Expected output of groups command**
[code] 
    username gaussian
    
[/code]

The command lists all the groups you are in. You should see (at least) your username and the gaussian group. If you don't see the gaussian group listed, email [support@swarthmore.edu](mailto:support@swarthmore.edu) with a request to be added to the gaussian group on Firebird. 

### Transfer files

Use the scp command to copy files from your computer to Firebird. Replace the file, directory, and usernames (highlighted in red) with your actual values. 

_Run this command on your computer to copy files to Firebird_. If you are logged into Firebird already, open a new Terminal window or tab and run the command below. 

`scp gaussian_input.com username@firebird.swarthmore.edu:/home/username/TargetDirectory`  


  


## Submitting Gaussian Jobs

Here is an example of a Gaussian Slurm job submission file that runs on 8 cores on a single node using 50GB of memory for up to 1 hour. By default, Gaussian will only use a single core. The benefits of parallelism depend on the type of Gaussian job. Specifying more cores than needed may actually slow down a job. 

_This example is adapted from_[ _Gaussian documentation_](https://curc.readthedocs.io/en/latest/software/gaussian.html) _ from Research Computing at the University of Colorado Boulder._
[code] 
    #!/bin/bash
    
    #SBATCH --job-name=gaussian
    #SBATCH --partition=compute
    #SBATCH --nodes=1
    #SBATCH --ntasks-per-node=8
    #SBATCH --time=01:00:00
    #SBATCH --mail-user=$USER\@swarthmore.edu
    #SBATCH --mail-type=BEGIN,END,FAIL
    #SBATCH --output=gaussian.%j.out
    
    module load g16
    
    # If checkpointing, specify a scratch directory. Uncomment the 2 lines below and adjust path as needed.
    # export GAUSS_SCRDIR=/home/$USER/$SLURM_JOBID
    # mkdir $GAUSS_SCRDIR  # only needed if using /scratch/summit
    
    # the next line prevents OpenMP parallelism from conflicting with Gaussian's internal SMP parallelization
    export OMP_NUM_THREADS=1
    
    g16 -m=50gb -p=$SLURM_NTASKS_PER_NODE gaussian_input.com
    
[/code]

Submit the job as you would normally using sbatch. 

### Job submission script

Professor [Paul Rablen](https://www.swarthmore.edu/profile/paul-rablen) created a program to generate a Gaussian Slurm submission script. 

### Gaussian Submission Script File

Download the submission script to Firebird and unzip. 

[View script](https://gist.github.com/aruethe2/200266a68a441bbe2bb5f0fdd70b42f5)

[Download code](https://gist.github.com/aruethe2/200266a68a441bbe2bb5f0fdd70b42f5/archive/9db1e8ee59a7187cb23ff31fca6e7f52501cf195.zip)

### Running the Gaussian Submission Script

Update the submission script file to allow execution (only needs to be done once) 
[code] 
    chmod u+x subg16
    
[/code]

Run the script as follows where filename.com is the Gaussian input file 
[code] 
    ./subg16 filename
    
[/code]

### Other notes

The script will send email on job start, end, or fail. It assumes your email is your username + "@swarthmore.edu". If not, edit the script to change the line containing "--mail-user". 

The script will then prompt for a number of cores to use, and a maximum number of hours. The former defaults to 8, and the latter to 10, if you just hit return. 

You can also enter the number of cores and hours directly on the command line when running the script: 
[code] 
    subg16 filename cores hours
    
[/code]

The memory defaults to 8GB per core. 

### Clean Up Script

Professor [Paul Rablen](https://www.swarthmore.edu/profile/paul-rablen) created a script to clean up extraneous Gaussian files after a run has been completed. 

Download the script to Firebird and unzip. 

[View script](https://gist.github.com/aruethe2/c24555dcd11fa7ffbe921e95c32573d9)

[Download code](https://gist.github.com/aruethe2/c24555dcd11fa7ffbe921e95c32573d9/archive/6a2c5f13199a903f8917d63cad664e6a3dcd5c5b.zip)

## Transferring Gaussian Checkpoint Files

Procedure for transferring checkpoint files from Firebird to a local computer: 

##### **Run these commands on Firebird**
[code] 
    module load gaussian
    formchk filename.chk
    
[/code]

The formchk utility makes a new file,` filename.fchk`, that is a text file. 

Log out of Firebird, and copy the .fchk file back to your own computer: 

##### **Run this command on your computer to copy files from Firebird**
[code] 
    scp username@firebird.swarthmore.edu:filename.fchk .
    
[/code]

Use the `unfchk` utility to convert the file back: 

##### **Run this command on your computer**
[code] 
    unfchk filename.fchk
    
[/code]

That will create a new binary version of the file, `filename.chk`.  
  
To clean up, you may want to delete the `.fchk` files, both on Firebird and on your own computer because they can take up a lot of space.
