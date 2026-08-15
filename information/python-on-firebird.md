---
title: "Python on Firebird"
source: https://kb.swarthmore.edu/wiki/Python_on_Firebird
pageid: 779
categories:
  - Firebird Software
---

# Python on Firebird

Firebird has Python 3 installed. Most Python programs only run as a single process, so running on a cluster won't necessarily speed up execution without parallelizing the code. If you need to run the same code repeatedly or with different inputs, you can launch many single-process jobs on the cluster at the same time. Alternatively, it is possible to parallelize your code using modules such as [multiprocessing](https://docs.python.org/dev/library/multiprocessing.html#module-multiprocessing), [Dask](https://dask.org/), or [mpi4py](https://mpi4py.readthedocs.io/en/stable/). Cornell University Center for Advanced Computing has information on [Python for High Performance](https://cvw.cac.cornell.edu/python-performance) which may be useful. 

While the system version of Python can be used for many typical needs, it is generally advised not to use it and instead create a custom Python environment using anaconda/miniconda. Mostly this is because the system Python and its packages can be updated, possibly breaking code. Maintaining your own Python environment ensures that you will receive consistent results and have complete control over versions. Package management is simpler as well, because if you are using the system Python and require a package that is not available, you will need to install it locally within your home directory; this is even more complex if you want or need to use a newer or older version of a package than what is available on the system. 

## Contents

  * 1 Miniconda
    * 1.1 Activating a conda environment within a Slurm batch script
  * 2 System Python
  * 3 Jupyter Notebooks



## Miniconda

The preferred way to use Python within a shared computing environment is with anaconda/miniconda. The difference is that anaconda comes with several scientific packages already installed, whereas miniconda is a minimal installation of Python, allowing you to create environments with only the packages you need. It is therefore recommended to use miniconda and install packages as needed. Miniconda installs in your personal home directory and enables users to create multiple Python environments and switch among them; for example, you can have one environment with Python 3.6 and another with 3.10, and each can have different versions of various packages. While a complete tutorial is beyond the scope of this document, here is some basic information to get started. 

To install miniconda, start by logging into Firebird; you should by default end up in your home directory. The following commands will download miniconda and then start the installation process; generally, you can accept the defaults, and **after installation you will need to log out and back in for certain environment variable changes to take effect**. 
[code] 
    wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
    bash Miniconda3-latest-Linux-x86_64.sh
    
[/code]

Update miniconda: 
[code] 
    conda update conda
    
[/code]

Miniconda is most useful for creating and managing multiple Python environments. The [getting started documentation](https://conda.io/projects/conda/en/stable/user-guide/getting-started.html) is a great place to start, but here are some common commands (more advanced commands are listed on the [conda cheat sheet](https://conda.io/projects/conda/en/stable/_downloads/843d9e0198f2a193a3484886fa28163c/conda-cheatsheet.pdf)). 

Create an environment named `testenv` and add the `biopython` package (any needed dependencies will be installed automatically); note that while you can add packages to and use the default environment (named `base`), this is not advised and you should generally create and use a named environment for most projects: 
[code] 
    conda create --name testenv biopython
    
[/code]

Create an environment with a specific Python version: 
[code] 
    conda create --name testenv2 python=3.10
    
[/code]

To use a particular environment, you must "activate" it, and similarly you can "deactivate" it; note that you can also include these commands in your Slurm scripts and submission files: 
[code] 
    conda activate testenv
    conda deactivate
    
[/code]

List all available environments (the current active environment will be marked with an *): 
[code] 
    conda env list
    
[/code]

Install a package within the currently active environment, list all packages installed in the environment, and then uninstall a package: 
[code] 
    conda install biopython
    conda list
    conda uninstall biopython
    
[/code]

Update all packages within a particular environment: 
[code] 
    conda update --all -n testenv
    
[/code]

Install a specific version of a package: 
[code] 
    conda install biopython=1.81
    
[/code]

Delete an environment and all its packages: 
[code] 
    conda remove -n testenv --all
    
[/code]

You can also export or import whole environments, which is useful for working with a team or lab to ensure that everyone is using an identical environment: 
[code] 
    conda env export testenv>testenv.yml
    conda env create -n testenv --file testenv.yml
    
[/code]

### Activating a conda environment within a Slurm batch script

It is possible to use a conda environment within a Slurm batch job script, but it must be activated first, and the steps to do are slightly different than doing so from an interactive command prompt. First, initialize the shell to use conda, then activate the environment (substituting `myenvironment` for whichever specific conda environment is needed): 
[code] 
    eval "$(conda shell.bash hook)"
    conda activate myenvironment
    
[/code]

## System Python

For simple tasks that may not require additional packages, you can use the system version of Python, though in almost all cases it is recommended to use miniconda. 

Run Python 3.9.18: 
[code] 
    python3
    
[/code]

Use pip to install Python packages in your home directory (in `~/.local/`): 
[code] 
    python3 -m pip install --user <name of package>
    
[/code]

## Jupyter Notebooks

It is possible to [run Python in a Jupyter notebook on Firebird](https://kb.swarthmore.edu/wiki/Open_OnDemand#Jupyter-Notebooks "Open OnDemand"). 

It is also possible to run Jupyter within an interactive terminal session via an SSH tunnel. This allows you to access your Jupyter session from your local browser, which might be preferable and more performant. 

Assuming Conda is installed as discussed above, create an environment for Jupyter and install it: 
[code] 
    conda create -n jupyter
    conda install jupyterlab
    
[/code]

Create an interactive session through Slurm (your options may vary - see [these instructions](https://kb.swarthmore.edu/wiki/Slurm#Command-line "Slurm") for more details): 
[code] 
    salloc --nodes=1 -c 4 --time=03:00:00 --partition=interactive
    
[/code]

To connect from your local computer to the notebook, you need to know the IP address of the node you are running on. The node will generally be reported on your command prompt, and Slurm will report it when your interactive session is allocated. Use the following command to get the IP of the node (the IP you want will be the bottom/last IP reported, under the node name): 
[code] 
    nslookup <node name>
    
[/code]

Activate the Conda environment and start Jupyter: 
[code] 
    conda activate jupyter
    export XDG_RUNTIME_DIR=""  ## may be necessary to avoid some warnings/errors
    srun jupyter-lab --no-browser --port=8889 --ip=0.0.0.0
    
[/code]

Examine the output of the command and make a note of the URL starting with `<http://127.0.0.1>`. 

On your local system, connect to the Jupyter session. Replace <username> and <ip address of node> of the actual values. Use your Swarthmore username and the IP address of the node as determined above. 

MacOS/Linux: 
[code] 
    ssh -N -L 8889:<ip address of node>:8889 <username>@firebird.swarthmore.edu
    
[/code]

Windows (open a terminal with `cmd` and run the following): 
[code] 
    plink.exe -N -L 8889:<ip address of node>:8889 <username>@firebird.swarthmore.edu
    
[/code]

To access JupyterLab, open your browser on your local computer and go to the link from the output of the `srun` command above.
