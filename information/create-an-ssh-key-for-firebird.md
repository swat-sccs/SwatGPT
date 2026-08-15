---
title: "Create an SSH Key for Firebird"
source: https://kb.swarthmore.edu/wiki/Create_an_SSH_Key_for_Firebird
pageid: 752
categories:
  - Firebird
---

# Create an SSH Key for Firebird

SSH (**S** ecure **SH** ell) is a command line program used to interact with remote machines and issue commands to them. SSH is used to connect to the Firebird HPC cluster, [GitHub Enterprise](https://kb.swarthmore.edu/wiki/GitHub_Enterprise "GitHub Enterprise"), and other servers. Most Swarthmore systems using SSH require a cryptographic key instead of a password to log in. A cryptographic key consists of a public key, which can be shared with others, and a private key, which must be kept secret. To set up your account on a remote server, provide the systems administrator with your public key. Instructions for creating and managing SSH keys differ based on the operating system. 

_Thanks to_[ _Andy Danner_](https://www.cs.swarthmore.edu/~adanner/index.php) _in Computer Science for providing the basis for these instructions._

## Contents

  * 1 macOS / Linux
    * 1.1 Checking for existing SSH Keys
    * 1.2 Creating an SSH Key
    * 1.3 Getting the Public Key
  * 2 Windows
  * 3 Multiple Computers
    * 3.1 Mac / Linux
      * 3.1.1 Create .ssh directory on macOS
      * 3.1.2 Create .ssh directory on Linux
    * 3.2 Windows
  * 4 Multiple keys
    * 4.1 Mac / Linux
    * 4.2 Windows



## macOS / Linux

Steps to create an SSH key on Mac and Linux operating systems are largely the same. The main difference is that on a Mac, the home directory is `/Users` whereas on Linux it is `/home`. As such, in some steps below, the actual paths may differ slightly, but the steps are otherwise identical and should not result in issues. 

### Checking for existing SSH Keys

If you already have an SSH key, you can skip the next step. If you're not sure, you probably do not already have a key. You can check by issuing the command within a terminal: 
[code] 
    ls -al ~/.ssh
    
[/code]

If you see files named `id_rsa` and `id_rsa.pub`, or `id_ed25519` and `id_ed25519.pub`, you already have one or more keys. If those files aren't there, or you're told that you have no such directory named `.ssh`, you'll need to generate a key. If you do have files named `id_ed25519` and `id_ed25519.pub`, you can use those. 

### Creating an SSH Key

GitHub has a good [comprehensive guide](https://help.github.com/en/github/authenticating-to-github/connecting-to-github-with-ssh) on the subject, but the abbreviated version is below. 

Run the command 

`ssh-keygen -t ed25519 -C "your_email@example.com"`

This will give you the output: 
[code] 
    $ ssh-keygen -t ed25519 -C "your_email@example.com"
    Generating public/private rsa key pair.
    Enter file in which to save the key (/home/[username]/.ssh/id_ed25519):
    
[/code]

Press enter to confirm the default location of `/home/[username]/.ssh/id_ed25519`. Next, it'll ask you for a passphrase: 
[code] 
    Enter passphrase (empty for no passphrase):
    Enter same passphrase again:
    
[/code]

Set a passphrase that you'll remember and then confirm it a second time. After confirming your passphrase, it'll print a key fingerprint and some strange abstract ASCII artwork that you can safely ignore. 

  


There will be two files created in the `/home/[username]/.ssh` directory: `id_ed25519` (private key) and `id_ed25519.pub` (public key). 

### Getting the Public Key

The file `id_ed25519.pub` contains your public key. Print the contents of the file by executing: 
[code] 
    cat ~/.ssh/id_ed25519.pub
    
[/code]

To share the public key, copy the entire output of that file. 

## Windows

On Windows, the steps to create and manage SSH keys are generally integrated within the specific program, such as PuTTY or MobaXTerm, used to access remote systems. As such, in order to generate an SSH key, please follow the instructions on the [Windows Terminal Access](https://kb.swarthmore.edu/wiki/Windows_Terminal_Access "Windows Terminal Access") page. Alternatively, Windows users can set up [Git Bash](https://gitforwindows.org/) or [Windows Subsystem for Linux](https://docs.microsoft.com/en-us/windows/wsl/about) and follow the instructions above for Mac / Linux users. 

## Multiple Computers

It is possible to copy your key from one computer to another to avoid the need to generate multiple keys. As with creating SSH keys, the steps differ based on the operating system. 

### Mac / Linux

On the original computer, go to the `.ssh` directory and copy the `id_ed25519` and `id_ed25519.pub` files to the same location on a new computer. The .ssh directory is located at `/Users/<username>/.ssh` (macOS) or `/home/<username>/.ssh` (Linux). Replace "<username>" with your computer username. 

If the `.ssh `directory doesn't exist, create it and set the appropriate permissions as follows: 

#### Create .ssh directory on macOS

`mkdir /Users/<username>/.ssh`  
`chmod 700 /Users/<username>/.ssh`

#### Create .ssh directory on Linux

`mkdir /home/<username>/.ssh`  
`chmod 700 /home/<username>/.ssh`

Then copy the key files into the .ssh directory and set the permissions on the key files as follows: 

`cd /Users/<username>/.ssh` (macOS) or `cd /home/<username>/.ssh` (Linux)   
`chmod 644 id_ed25519.pub`  
`chmod 600 id_ed25519`

### Windows

The process is slightly different for Windows, largely because specific terminal programs expect SSH keys to be in default locations specific to the software, rather than in a central location (users can, however, elect to save SSH keys in any location when creating them). Regardless, the basic premise is the same: find the public and private SSH keys on the first system, then copy them to the second system, then configure the specific terminal program to use those keys rather than generating a new one. 

## Multiple keys

### Mac / Linux

If there is already `id_ed25519` file on the second computer, it is possible to rename the key to something else and then specify the key name when making an SSH connection. For example, if you have a desktop computer with a key and want to copy the key to a laptop that already has an `id_ed25519` file, you can rename the desktop keys to `id_ed25519_desktop` and `id_ed25519_desktop.pub`, put them in the `/Users/[username]/.ssh` (macOS) or `/home/[username]/.ssh` (Linux) directory on the laptop, and ssh with a specific key using the `-i` flag: 
[code] 
    ssh -i id_ed25519_desktop username@computername.swarthmore.edu
    
[/code]

### Windows

The process for using multiple keys on Windows systems will depend on the particular terminal program. For most programs, however, it is possible to generate a new key for each profile or system to which you need to connect.
