---
title: "VPN and Off-Campus Access"
source: https://kb.swarthmore.edu/wiki/VPN_and_Off-Campus_Access
pageid: 1040
categories:
  - Accounts, Passwords, Security
---

# VPN and Off-Campus Access

The Cisco Virtual Private Network (VPN) client is the supported way to connect to Swarthmore network resources from off-campus. When the VPN is connected, **all** Internet traffic from that device will be sent through the campus network to reach the Internet. 

You can stay actively connected to the Swarthmore VPN for a maximum of 10 hours, at which point you will be prompted to log back into the client. If the device you are using VPN on is inactive for 4 hours or more, your session will end and you will be prompted to log back into the client. 

Note that Swarthmore VPN is not accessible from the Guest wireless network. 

  


## Contents

  * 1 How to install Swarthmore's VPN system
  * 2 How to connect to VPN
    * 2.1 macOS or Windows Computer
    * 2.2 iOS Device (iPad/iPhone)
    * 2.3 Android
  * 3 Troubleshooting
    * 3.1 Can't print while connected to VPN
    * 3.2 Can't connect to SwatVPN while on the Guest wireless network (SwatGuest)
    * 3.3 Authentication failed due to problem retrieving the single sign-on cookie



## How to install Swarthmore's VPN system

On a computer: 

  1. Open a web browser
  2. Go to <https://swatvpn2.swarthmore.edu/ShibSSO>
  3. Log in using your Swarthmore user name and password
  4. Wait while it checks for Java (may take a minute or so)
  5. If Java detection fails, you will be directed to download and install VPN
  6. Click the AnyConnect VPN link to download and save the file to your computer
  7. Go to the installer that downloaded to your computer, and double-click on it to install



On a mobile device: 

  * Download and connect to the Cisco AnyConnect Client for iOS
  * Download and connect to the Cisco AnyConnect Client for Android



## How to connect to VPN

A new VPN option has been added to Cisco AnyConnect that makes connecting to VPN much easier. If you have logged into [swatvpn.swarthmore.edu](https://swatvpn2.swarthmore.edu/ShibSSO) or [swatvpn2.swarthmore.edu](https://swatvpn2.swarthmore.edu/ShibSSO) connections recently it would have added the new connection: **SwatVPN Login**. On desktop you will find the new connection in the dropdown menu and on mobile you will find it by selecting Connections from the app home screen. This allows users to log in to VPN using the normal Swarthmore login screen and DUO prompt. All VPN connections provide the same security and access experience, but we encourage you to use the new connection to simplify your login process. 

### macOS or Windows Computer

  1. Search for and launch the Cisco AnyConnect Secure Mobility Client.
  2. In the blank text field enter the server name “**swatvpn2.swarthmore.edu/ShibSSO** ” then click **Connect**. 
     1. This connection may already be listed as **SwatVPN Login** in the connection dropdown. Access the dropdown by clicking the arrow on the right-hand side of the text field.
  3. A new window will open with the Swarthmore login page. Enter your Swarthmore credentials and click **Login**.
  4. The DUO prompt will then appear in the window. If you have logged in and verified with DUO recently, this page may skip past the prompt. If not, verify with your DUO method to continue.
  5. You are now connected to VPN! The next time you open Cisco AnyConnect this connection should already be listed in the text field for you.n Cisco AnyConnect this connection should already be listed in the text field for you.



### iOS Device (iPad/iPhone)

  1. Go to the App Store and [install Cisco AnyConnect by New Cisco AnyConnect](https://apps.apple.com/us/app/cisco-anyconnect/id1135064690).
  2. After install, tap the AnyConnect icon on the iPad/iPhone home screen.
  3. Choose OK to enable AnyConnect.
  4. Select **Connections** from the AnyConnect home screen.
  5. Select **Add VPN Connection**.
  6. Tap Description, and enter “**SwatVPN Login** ”.
  7. Tap Server Address, and enter “**swatvpn2.swarthmore.edu/ShibSSO** ”.
  8. Tap **Save**.
  9. To connect via VPN make sure you are connected to Wi-Fi, then go to the AnyConnect home screen.
  10. Select **SwatVPN Login** and tap **ON** next to AnyConnect VPN.
  11. A new window will open with the Swarthmore login page. Enter your Swarthmore credentials and click Login.
  12. The DUO prompt will then appear in the window. If you have logged in and verified with DUO recently, this page may skip past the prompt. If not, verify with your DUO method to continue.
  13. You are now connected to VPN! The next time you open Cisco AnyConnect this connection should already be listed for you.



### Android

  1. Go to the Google Play store and [install AnyConnect by Cisco Systems, Inc](https://play.google.com/store/apps/details?id=com.cisco.anyconnect.vpn.android.avf&hl=en_US). 
     1. For Kindle devices, install from the Amazon Kindle app store.
  2. After install, tap the AnyConnect Icon to start the AnyConnect app.
  3. Accept the End User License Agreement (EULA).
  4. Click **OK** to continue.
  5. Select **Connections** from the AnyConnect home screen.
  6. Select the **plus “+”** button at the bottom-right corner of the screen.
  7. Choose Description, and enter “**SwatVPN Login** ”.
  8. Choose Server Address, and enter “**swatvpn2.swarthmore.edu/ShibSSO** ”.
  9. Select **Done**.
  10. To connect via VPN make sure you are connected to Wi-Fi, then go to the AnyConnect home screen.
  11. Select **SwatVPN Login** , then tap the slider next to AnyConnect VPN to turn VPN on.
  12. A new window will open with the Swarthmore login page. Enter your Swarthmore credentials and click **Login**.
  13. The DUO prompt will then appear in the window. If you have logged in and verified with DUO recently, this page may skip past the prompt. If not, verify with your DUO method to continue.
  14. If prompted, allow Cisco access to finish establishing a connection by tapping OK.
  15. You are now connected to VPN! The next time you open Cisco AnyConnect this connection should already be listed for you.



## Troubleshooting

### Can't print while connected to VPN

When connected to VPN while off-campus, access to local devices such as printers may not work. If you experience problems, try disconnecting from VPN to print. 

### Can't connect to SwatVPN while on the Guest wireless network (SwatGuest)

When connected to the Guest wireless network (SwatGuest), access to SwatVPN is not possible. If you have a Swarthmore account and wish to use WiFi, please connect via eduroam in order to use SwatVPN. 

### Authentication failed due to problem retrieving the single sign-on cookie

If you get this error, also pictured below, try reconnecting with your credentials a few more times. This situation seems to resolve itself on most computers. 

[![Screenshot of VPN error with the text 'Authentication failed due to problem retrieving the single sign-on cookie' and a button with the text 'OK'.](https://kb.swarthmore.edu/images/3/3d/VPN_error.png)](https://kb.swarthmore.edu/wiki/File:VPN_error.png)
