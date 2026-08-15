---
title: "Disabling Private and Random Wi-Fi MAC addresses"
source: https://kb.swarthmore.edu/wiki/Disabling_Private_and_Random_Wi-Fi_MAC_addresses
pageid: 1195
categories:
  - Networking
---

# Disabling Private and Random Wi-Fi MAC addresses

Apple devices have a private Wi-Fi address feature. This feature creates a new private MAC address for each wireless network the device joins and is enabled by default. 

Android has a similar feature called “MAC address randomization”. 

These features are in conflict with the MAC address registration used for the "SwatDevice" wireless network SSID. Since the MAC address is "new", the device is no longer recognized by the network and will be prompted to re-register. Once the private address function is disabled, the registered device will connect again. Since the private address function can be disabled on an individual Wi-Fi network, this only needs to be done for "SwatDevice" at this time. 

### iPhone, iPad, or iPod touch

  1. Open the **Settings** app, then tap Wi-Fi.
  2. Tap the **Information** button ℹ️ next to a network.
  3. Tap on **Private Wi-Fi Address** and select **Off.**



These instructions are adapted from the following page <https://support.apple.com/en-us/HT211227>. 

### **Android 10 or higher**

  1. Open the **Settings** app.
  2. Select **Network and Internet**.
  3. Select **WiFi**.
  4. Connect to the SwatDevice wireless network.
  5. Tap the  _gear icon_ next to the current Wi-Fi connection.
  6. Select **Advanced**.
  7. Select **Privacy**.
  8. Select **Use device MAC**.
