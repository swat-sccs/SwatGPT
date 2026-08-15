---
title: "Wireless"
source: https://kb.swarthmore.edu/wiki/Wireless
pageid: 1189
categories:
  - Networking
---

# Wireless

Swarthmore has three Wi-Fi networks. Follow the links below for instructions to connect to the appropriate network. 

  * **eduroam** for users from Swarthmore, Haverford, Bryn Mawr, and [other eduroam institutions](https://www.eduroam.us/institutions_list).
  * [**SwatGuest**](https://kb.swarthmore.edu/wiki/Self-Service_Guest_Wireless "Self-Service Guest Wireless") for campus guests.
  * [**SwatDevice**](https://kb.swarthmore.edu/wiki/Gaming_and_Device_Registration "Gaming and Device Registration") for devices such as gaming systems and e-readers.



## Contents

  * 1 eduroam for Swarthmore, Haverford, Bryn Mawr, and other eduroam institutions
  * 2 eduroam Connection Instructions
    * 2.1 macOS, Windows, Ubuntu computers, and iOS-based phones and tablets
      * 2.1.1 Register your Computer
    * 2.2 Android Device Configuration
      * 2.2.1 Android: Most Common Instructions
      * 2.2.2 Android: Alternate Instructions (includes some Samsung Galaxy devices)
      * 2.2.3 Android: Google Pixel 6 and 7 with Android 13
    * 2.3 ChromeOS Device Configuration
  * 3 Troubleshooting



## eduroam for Swarthmore, Haverford, Bryn Mawr, and other eduroam institutions

eduroam should be used by current members of Swarthmore, Haverford, and Bryn Mawr Colleges, as well as other eduroam-enabled institutions. The College's  _authenticated_ wireless network provides a high level of security using WPA2 authentication and AES encryption. Please follow the instructions below to get started. 

[List of eduroam enabled institutions](https://www.eduroam.us/institutions_list)

## eduroam Connection Instructions

  * macOS, Windows, Ubuntu computers, and iOS-based phones and tablets
  * Android
  * Chromebook



### macOS, Windows, Ubuntu computers, and iOS-based phones and tablets

  1. Connect to the eduroam Wi-Fi network.
  2. For **username,** enter your full email address (e.g. jdoe1@yourinstitution.edu).
  3. Enter your home institution password.
  4. **For Android devices and Chromebooks:**follow these configuration instructions.
  5. Accept/trust the security certificate if prompted, and follow any instructions to launch the registration webpage (see Register your Computer below). 
     1. You can review the certificate and verify that it is the correct one by comparing with the following fingerprints (_not_ case sensitive), as of December 2025: 
        1. SHA1 fingerprint: D8 5B 86 04 B0 B0 9B 1E 60 0B F0 FA 70 13 E5 7A A7 E0 2F 6C or
        2. SHA256 fingerprint: 8E 3D A8 37 D5 32 9B 09 48 43 AA 94 8C BA A9 A4 FF C8 73 AF 7B 7C D9 4F 16 EC 51 35 7F E0 C4 15



#### Register your Computer

Computers running Windows and macOS operating systems will have to install software at this stage. The software is an agent from SafeConnect that runs in the background called Policy Key. (The Policy Key software is not required for Android, iOS, and Linux computers.) A few moments after you first connect to eduroam, a web page should open with the Swarthmore network registration process; if not, open up a web browser and go to any off-campus webpage (e.g. [cnn.com](http://cnn.com)), which will redirect you to the registration page. Enter your Swarthmore username (leave off @swarthmore.edu) and password, then download and install SafeConnect to install the Policy Key. If prompted, install antivirus—an up-to-date and fully functional antivirus is required to obtain access to the network. 

After installing the required software, it may take up to three minutes for your network connection to reconfigure. When it does, you should be online! If it does not automatically redirect you to the Swarthmore home page, open up a new tab or window, and try to go to your off-campus webpage again (e.g. [cnn.com](http://cnn.com) or [facebook.com](http://facebook.com), etc.). 

### Android Device Configuration

Android and ChromeOS devices need to be manually configured, and require an extra step (Phase 2 Authentication). Follow the instructions below, and only fill in the following fields - leave everything else set to the defaults (no need to change them): 

#### Android: Most Common Instructions

_**NOTE:** If Phase 2 Authentication is not one of the visible fields, skip down to the Android: Alternate Instructions listed below._

When you attempt to connect to eduroam for the first time, ensure that the below options are configured. Leave all other options blank or with their default choices 

  1. For **EAP** (before Phase 2 Authentication), choose **PEAP**
  2. **Phase 2 Authentication** \- choose **MSCHAPV2**
  3. **CA Certificate** \- choose **Do Not validate**
  4. **Online Certificate Status** \- choose **Do not verify** (or system certificates or Unspecified
  5. **Domain** \- enter **swarthmore.edu** (if domain is requested)
  6. **Identity** \- enter your **Swarthmore email address**
  7. **Password** \- enter your **Swarthmore password**
  8. Click **Connect**. If prompted to install a certificate, allow installation.



#### Android: Alternate Instructions (includes some Samsung Galaxy devices)

  1. Under **Advanced** at the bottom of the eduroam wireless configuration options, configure: 
     * Make sure EAP is set to **PEAP**
     * **Phase 2 Authentication** \- choose **MSCHAPV2**
  2. Click **Save**
  3. On the main configuration screen, configure: 
     * **Certificates** \- confirm **Do not validate** is checked
     * **Identity** \- enter your FULL Swarthmore email address
     * **Password** \- enter your Swarthmore password



#### Android: Google Pixel 6 and 7 with Android 13

  1. On your Android device, swipe down twice to find the settings option.
  2. Tap **Settings** , then **Network & internet**, then **Internet**.
  3. Tap **eduroam**.
  4. Tap **EAP method** , then select **PEAP**.
  5. Tap **Phase 2 authentication** , then select **MSCHAPV2**.
  6. Tap **CA certificate** , then select **Use system certificates**.
  7. Tap **Online Certificate Status** , then select **Do not verify**.
  8. Tap the line under **Domain** and enter swarthmore.edu. [![picture of eduroam settings on android phone](https://kb.swarthmore.edu/images/1/12/android_pixel_eduroam_signin-SCcropped.jpg)](https://kb.swarthmore.edu/wiki/File:android_pixel_eduroam_signin-SCcropped.jpg)
  9. Tap the line under **Identity** and enter your username@swarthmore.edu email address.
  10. Tap the line under **Password** and enter your Swarthmore password.
  11. Tap **Connect** at the bottom of the screen



### ChromeOS Device Configuration

Chromebooks and other devices using the ChromeOS require additional configuration, similar to Android devices. 

  1. When you attempt to connect to eduroam for the first time, ensure that the below options are configured. Leave all other options blank or with their default choices. 
     * **EAP** \- Choose **PEAP**
     * **Phase 2 Authentication** \- Choose **MSCHAPV2**
     * **CA Certificates** \- Confirm **Unspecified** is chosen
     * **Identity** \- enter your FULL Swarthmore email address
     * **Password** \- enter your Swarthmore email password
  2. Click **Connect**. You should be fully configured for eduroam on ChromeOS.



## Troubleshooting

If you have previously connected to eduroam with credentials from another institution and are having trouble connecting to eduroam at Swarthmore, try removing your old eduroam profile (or choose to "forget" eduroam) and log back in using your Swarthmore credentials. 

For connection problems, it may be helpful to delete the eduroam connection configuration on your device and re-add it. 

More troubleshooting information: [Network Troubleshooting](https://kb.swarthmore.edu/wiki/Network_Troubleshooting "Network Troubleshooting")
