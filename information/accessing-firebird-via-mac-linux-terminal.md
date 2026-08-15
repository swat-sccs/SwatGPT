---
title: "Accessing Firebird via Mac / Linux Terminal"
source: https://kb.swarthmore.edu/wiki/Accessing_Firebird_via_Mac_/_Linux_Terminal
pageid: 773
categories:
  - Firebird
---

# Accessing Firebird via Mac / Linux Terminal

SSH is the default method to initiate a command-line terminal session on Firebird. Start the Terminal program on your computer (on Mac, it is recommended to use [iTerm2](https://iterm2.com/)) and enter the following command (replace "username" with your Swarthmore username). Usernames are case sensitive, so use all lowercase letters, and note that because this is a shared system, users from Swarthmore will have `-swat` appended onto their username: 
[code] 
    ssh username-swat@firebird.swarthmore.edu
    
[/code]

If you have multiple SSH keys or they are stored in a non-standard location, you may need to [specify the location of the specific private key to use](https://kb.swarthmore.edu/wiki/Create_an_SSH_Key#Multiple_keys "Create an SSH Key"). 

Once logged in, you will be in your home directory (`/home/username-swat`) on Firebird. You are connected to the head node, where you can manage your files, compile programs, and submit jobs to the cluster.
