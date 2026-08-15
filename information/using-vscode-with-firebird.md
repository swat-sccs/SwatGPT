---
title: "Using VSCode with Firebird"
source: https://kb.swarthmore.edu/wiki/Using_VSCode_with_Firebird
pageid: 802
categories:
  - Firebird
---

# Using VSCode with Firebird

VSCode is a popular software development suite that can allow users to develop locally and then connect to a remote system (such as Firebird) to execute intensive tasks. While convenient, the main issue with VSCode is that the **Remote-SSH** extension runs `vscode-server` processes on the Firebird login node. These processes can be surprisingly resource-intensive (CPU and RAM) even when idle and they often fail to terminate when a user disconnects. There is, however, a solution that has worked well for multiple researchers. 

## Prerequisites

As prerequisites, you need: 

  * an account on Github (either a personal account or through Swarthmore’s [Github Enterprise](https://kb.swarthmore.edu/wiki/GitHub_Enterprise "GitHub Enterprise"))
  * VSCode installed on your local system, with **Remote Explorer** and **Remote SSH** extensions installed.



## Usage

This method is based on [these instructions](https://docs.rc.fas.harvard.edu/kb/vscode-remote-development-via-ssh-or-tunnel/). Essentially, you include steps within a Slurm batch script to download VSCode in your job’s temporary working (scratch) folder, unpack it, and launch a tunnel. Sample code for such a script is below, though it will need to be modified for your specific jobs: 
[code] 
    #!/bin/bash
    #SBATCH -p compute
    #SBATCH --mem=16g
    #SBATCH --time=04:00:00
    #SBATCH -c 4
    
    set -o errexit -o nounset -o pipefail
    
    MY_SCRATCH=$(TMPDIR=/scratch mktemp -d)
    
    echo $MY_SCRATCH
    
    #Obtain the tarball and untar it in $MY_SCRATCH location to obtain the
    #executable, code, and run it using Github
    curl -Lk 'https://code.visualstudio.com/sha/download?build=stable&os=cli-alpine-x64' | tar -C $MY_SCRATCH -xzf -
    VSCODE_CLI_DISABLE_KEYCHAIN_ENCRYPT=1 $MY_SCRATCH/code tunnel user login --provider github
    
    #Accept the license terms & launch the tunnel
    $MY_SCRATCH/code tunnel --accept-server-license-terms --name cannontunnel
    
[/code]
