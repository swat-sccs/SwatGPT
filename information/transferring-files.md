---
title: "Transferring Files"
source: https://kb.swarthmore.edu/wiki/Transferring_Files
pageid: 777
categories:
  - Firebird
---

# Transferring Files

There are several ways to copy files to/from Firebird. 

## Contents

  * 1 Web via Open OnDemand
  * 2 macOS/Linux command line
  * 3 CyberDuck graphical file transfer for macOS/Windows/Linux
  * 4 Other Windows Options



## Web via Open OnDemand

Open OnDemand offers a web interface to Firebird, including a [graphical file manager](https://kb.swarthmore.edu/wiki/Open_OnDemand#File_Browser "Open OnDemand"), making it one of the most straightforward options to transfer files to/from Firebird. There is, however, a 10GB limit on transfers; should you need to transfer larger files, use one of the methods listed below. 

## macOS/Linux command line

`scp` is used to transfer files to/from Firebird; note that regardless whether you want to transfer files to OR from Firebird, you initiate the command from your local computer, not from Firebird. In other words, you are either pushing files to Firebird or pulling them from Firebird. 

Use `scp` command on your computer to copy files to Firebird: 
[code] 
    scp <path to file on your computer> <your username>@firebird.swarthmore.edu:/home/<your username>
    
[/code]

Here is an example of user Alice Paul copying a file from a folder on her computer to her home directory on Firebird: 
[code] 
    scp /Users/apaul1/votingdata/data.csv apaul1-swat@firebird.swarthmore.edu:~
    
[/code]

It also works to copy files from Firebird to your computer: 
[code] 
    scp <your username>@firebird.swarthmore.edu:<path to file on Firebird> <path to folder on your computer>
    
[/code]

Use the `-r` flag to copy multiple files or folders recursively. Here is an example of user Alice Paul copying all .csv files from a folder on her computer to her home directory on Firebird: 
[code] 
    scp -r /Users/apaul1/votingdata/*.csv apaul1-swat@firebird.swarthmore.edu:~
    
[/code]

## CyberDuck graphical file transfer for macOS/Windows/Linux

[CyberDuck](https://cyberduck.io/) is a free graphical program that can be used to transfer files to and from Firebird. Download and install CyberDuck and then set up an SFTP connection to Firebird: 

  * Click **Open Connection**
  * Select **SFTP (SSH File Transfer Protocol)** from the drop-down list
  * Set _Server_ to **firebird.swarthmore.edu**
  * Set _Username_ to your Firebird username
  * Leave _Password_ blank
  * Select the file containing your **SSH Private Key** (likely named `id_ed25519`)
  * Click **Connect**



## Other Windows Options

[PuTTY SCP](https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html) (PSCP) is a command line version of `scp` for Windows. 

[WinSCP](https://winscp.net/eng/index.php) is an open source file transfer application.
