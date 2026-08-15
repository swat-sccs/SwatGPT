---
title: "Setting Up Remote Desktop"
source: https://kb.swarthmore.edu/wiki/Setting_Up_Remote_Desktop
pageid: 1223
categories:
  - Working Remotely
---

# Setting Up Remote Desktop

Use Remote Desktop to connect to a computer on campus remotely. 

## Contents

  * 1 Configuring the Host Computer
    * 1.1 Windows Host
    * 1.2 Mac Host
  * 2 Connecting to a Windows Computer
    * 2.1 Connect to a Windows computer from a Mac
    * 2.2 Connect to a Windows computer from a Windows computer
  * 3 Connecting to a Mac Computer
    * 3.1 Connect to a Mac computer from a Mac Computer
    * 3.2 Connect to a Mac computer from a Windows Computer
  * 4 Additional Considerations



# Configuring the Host Computer

## Windows Host

Follow the instructions on Microsoft's [Remote Desktop - Allow access to your PC](https://docs.microsoft.com/en-us/windows-server/remote/remote-desktop-services/clients/remote-desktop-allow-access) page. 

Settings: 

  * Enable **Network Level Authentication**
  * Select the users you wish to grant access to the system. Only add people that you know and trust. Do not add all users or large groups of users. For security, do not allow remote users to be administrators on the computer.



Note the IP address and name of your computer 

  * For the name, use the **full version of the device name**. This is found by going to **Settings** > **System** > **About**.



## Mac Host

Follow the instructions on Apple's [Turn Mac screen sharing on or off](https://support.apple.com/guide/mac-help/turn-screen-sharing-on-or-off-mh11848/mac) page. 

Settings: 

  * Specify **Only these users** and select individual users to share the screen. For security reasons, only add people that you know and trust. Do not add all users or large groups of users.
  * If sharing with a non macOS user, select Computer Settings and check **VNC viewers may control screen with password** and enter a secure password. This password is separate from your regular Swarthmore password.



Note the IP address and name of your computer. The IP address is available from **System Preferences** → **Network** screen. The IP address consists of 4 numbers separated by periods 

# Connecting to a Windows Computer

## Connect to a Windows computer from a Mac

  1. Download [Microsoft Remote Desktop](https://apps.apple.com/us/app/microsoftremote-%20desktop-10/id1295203466?mt=12)from the App Store and install
  2. Connect to the [Swarthmore VPN](https://kb.swarthmore.edu/wiki/VPN_and_Off-Campus_Access "VPN and Off-Campus Access")
  3. Open Microsoft Remote Desktop - Click the **plus (+)** sign and select **Desktop**
  4. Type the name or IP address of the computer that you want to connect to and click **Save**
     1. For the name, use the **full device name**. Get this information from the computer that you want to connect to. This is found by going to **Settings** > **System** > **About**.
  5. Log in to the desired computer using **garnet\username** and your password - replacing "username" with your Swarthmore username
  6. Perform DUO authentication (if necessary)



## Connect to a Windows computer from a Windows computer

  1. Connect to the [Swarthmore VPN](https://kb.swarthmore.edu/wiki/VPN_and_Off-Campus_Access "VPN and Off-Campus Access")
  2. Open Remote Desktop Connection 
     1. Click the **Start **button
     2. In the search box, type **Remote Desktop Connection. **In the list of results, click **Remote Desktop Connection**.
  3. In the Computer box, type the name or IP address of the computer that you want to connect and then click **Connect**
     1. Use the **full device name**. Get this information from the computer that you want to connect to. This is found by going to **Settings** > **System** > **About**.
  4. Connect to the desired computer using **garnet\username** and your password - replacing "username" with your Swarthmore username
  5. Perform DUO authentication (if necessary)



# Connecting to a Mac Computer

## Connect to a Mac computer from a Mac Computer

  1. Connect to the [Swarthmore VPN](https://kb.swarthmore.edu/wiki/VPN_and_Off-Campus_Access "VPN and Off-Campus Access")
  2. Finder → Go menu → Connect to Server
  3. Enter **vnc:// <ip address of remote computer>**  _ (replace <ip address of remote computer> with the actual IP address which consists of 4 numbers separated by periods) _
  4. If prompted, enter your Swarthmore username and password



Additional documentation from Apple: [Share the screen of another Mac](https://support.apple.com/guide/mac-help/share-the-screen-of-another-mac-mh14066/mac)

## Connect to a Mac computer from a Windows Computer

Install a "VNC viewer" application such as [Tight VNC](https://www.tightvnc.com/download.php) or [RealVNC Viewer](https://www.realvnc.com/en/connect/download/viewer/). You will only need to install a viewer application, not a server application. 

  1. Connect to the [Swarthmore VPN](https://kb.swarthmore.edu/wiki/VPN_and_Off-Campus_Access "VPN and Off-Campus Access")
  2. Start the VNC viewer program of your choice
  3. Configure the connection (this may only need to be done once) 
     1. Create a new connection for the remote Mac computer
     2. Use the IP address of the Mac computer as the address. The IP address consists of 4 numbers separated by periods.
     3. Use the password specified in the **System Preferences **→ **Sharing** → **Screen Sharing** → **Computer settings screen for the remote Mac**. This is not your Swarthmore password.
  4. Start the VNC connection
  5. Once connected, you may also need to log into the remote computer with your Swarthmore username and password (or the username and password you normally use to log into the Mac).



# Additional Considerations

  * If your computer shuts down due to a power outage or operating system update, you will have to physically turn it on before accessing it remotely again. You may want to look into seeing if the system can be configured to start up automatically or purchase a battery backup (UPS).
  * In most cases, a campus desktop computer will retain the same IP address. If the system is moved or powered down for more than a day, the IP address may change. Wired connections retain their IP addresses for longer than wireless connections, so we suggest that any machine regularly used for remote desktop use should be connected to a wired network.
