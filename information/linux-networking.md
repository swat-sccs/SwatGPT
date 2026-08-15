---
title: "Linux Networking"
source: https://kb.swarthmore.edu/wiki/Linux_Networking
pageid: 1202
categories:
  - Networking
---

# Linux Networking

## Contents

  * 1 Installing Linux on an former macOS or Windows computer
  * 2 Dual Boot Systems
  * 3 SwatVPN
    * 3.1 Option 1
    * 3.2 Option 2
    * 3.3 Option 3 (deprecated)
  * 4 Ubuntu apt-get errors



## Installing Linux on an former macOS or Windows computer

If the device was previously on the network as a macOS or Windows system and is being reimaged as Linux, [Submit a help request](https://support.swarthmore.edu) to remove the previous identification record so the Linux machine can be identified correctly. 

## Dual Boot Systems

When using a dual boot system you will need to randomize the MAC addresses on one of the operating systems, as both systems cannot use the same MAC Address. 

## SwatVPN

### Option 1

Install the Cisco Secure Client for Linux 64. Confirmed working on Ubuntu 24.04. 

  1. Download the Cisco Secure Client by visiting <https://swatvpn2.swarthmore.edu/ShibSSO>
  2. Log in to the SSO page.
  3. Download Linux client. [![Screenshot from 2025-03-13 14-21-22.png](https://kb.swarthmore.edu/images/1/12/Screenshot_from_2025-03-13_14-21-22.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_from_2025-03-13_14-21-22.png)
  4. Follow instructions 
     1. step 1 [![Screenshot from 2025-03-13 14-21-58.png](https://kb.swarthmore.edu/images/1/11/Screenshot_from_2025-03-13_14-21-58.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_from_2025-03-13_14-21-58.png)
     2. step 2 [![Screenshot from 2025-03-13 14-22-03.png](https://kb.swarthmore.edu/images/e/e6/Screenshot_from_2025-03-13_14-22-03.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_from_2025-03-13_14-22-03.png)
     3. step 3 [![Screenshot from 2025-03-13 14-22-34.png](https://kb.swarthmore.edu/images/e/e9/Screenshot_from_2025-03-13_14-22-34.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_from_2025-03-13_14-22-34.png)
     4. step 4 [![Screenshot from 2025-03-13 14-22-47.png](https://kb.swarthmore.edu/images/d/d7/Screenshot_from_2025-03-13_14-22-47.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_from_2025-03-13_14-22-47.png)



### Option 2

Install openconnect, a SSL VPN client that works with the Cisco Anyconnect VPN servers used by Swarthmore. The example below was done using Ubuntu 18.04 and 24.04. Other versions of Linux might require different commands. 

To install: 

  1. Open a terminal window
  2. `$ sudo apt-get update`
  3. `$ sudo apt install network-manager-openconnect-gnome `



To run from the command line (cli), it must run as root, so use the sudo option: 

  1. Open a terminal window.
  2. `$ sudo openconnect swatvpn2.swarthmore.edu/ShibSSO`
  3. Accept the certificate, even with the error "signer not found".
  4. Enter your username, password (first PASSCODE prompt), and "push" without the quotes (at the second PASSCODE prompt, used for DUO 2FA prompt).
  5. Once DUO has successfully completed, it will finish connecting and show `Connected as 130.58.#.#, using SSL`
  6. Leave terminal open to maintain the VPN connection. Use web browser or another terminal window to access the network via the VPN tunnel.
  7. CTRL-C to end the VPN session.



### Option 3 (deprecated)

To use Swarthmore's VPN system from Linux install the Cisco AnyConnect client for Linux.  [Submit a help request](https://support.swarthmore.edu) to ask for the AnyConnect Linux installer then enter the following in a terminal window. 
[code] 
    tar -zxvf anyconnect-linux64-<version number>-predeploy-k9.tar.gz
    cd anyconnect-linux64-<version number>
    cd vpn
    sudo ./vpn_install.sh
    
[/code]

## Ubuntu apt-get errors

Swarthmore's network can cause problems for some Ubuntu systems when installing software via apt-get. To avoid the problem, use the following instructions. 

Create a file on the system called `/etc/apt/apt.conf.d/99ignoreproxy` (or `99something`) and add the following lines: 
[code] 
    Acquire::http::Pipeline-Depth 0;
    Acquire::http::No-Cache true;
    Acquire::BrokenProxy true;
    
[/code]
