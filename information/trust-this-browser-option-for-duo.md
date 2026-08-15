---
title: "'Trust this Browser' Option for Duo"
source: https://kb.swarthmore.edu/wiki/%22Trust_this_Browser%22_Option_for_Duo
pageid: 1016
categories:
  - Accounts, Passwords, Security
  - Duo
---

# "Trust this Browser" Option for Duo

## Contents

  * 1 Summary
  * 2 Troubleshooting
    * 2.1 What if I clicked the “Trust this Browser” button but I am still being asked to authenticate?
  * 3 Required Browser Settings
    * 3.1 Chrome
    * 3.2 Firefox
    * 3.3 Safari



## Summary

You can set Duo to remember your authentication for a predetermined period of time. This allows you to authenticate once, and then not have to do so again (on that computer/device) when logging into your account during this time period. Currently, the time period is set to 30 days. 

**NOTE:** You should never select the “**Trust This Browser** ” option on shared or public computers. 

## Troubleshooting

### What if I clicked the “Trust this Browser” button but I am still being asked to authenticate?

**This setting must be applied to each browser you use on each computer you use**. If you choose this setting but login later with a different browser or computer you will have to set it again for that browser during authentication. If you are certain you chose it to remember you on both the computer and the browser you are using, then it might be a setting on the browser that is not saving your choice. 

## Required Browser Settings

### Chrome

  1. While in Chrome click on the 3 vertical dots in the top-right corner of the browser ([![An icon displaying three vertical dots, representing the "Customize and control Google Chrome" menu](https://kb.swarthmore.edu/images/b/b2/Google3verticalDots.png)](https://kb.swarthmore.edu/wiki/File:Google3verticalDots.png) ) and choose “Settings” in the drop down menu.
  2. Click on the section labelled “Privacy and Security" on the left side of the window. In the menu in the center of the screen, click on "Third-Party Cookies".
  3. In the "Third-Party Cookies" menu, make sure "block third-party cookies" is NOT selected (either of the other two options are fine).
  4. If you are still having trouble after doing steps 1-3, go back to the "Cookies and other site data" menu and at the bottom under the "Sites allowed to use third-party cookies" section, click the "Add" button and add [# [*.]duosecurity.com.]
  5. Changes you make here are immediate, so there is no option to save. You can close the Chrome settings tab/window whenever you are finished.



### Firefox

  1. While in Firefox click on the 3 horizontal lines in the top-right corner of the browser ([![An icon displaying three horizontal lines, representing the "Open application menu" option in Firefox](https://kb.swarthmore.edu/images/d/d6/horizontalLines.png)](https://kb.swarthmore.edu/wiki/File:horizontalLines.png) ) and choose “Settings” from the drop down menu.
  2. On the left-hand side, choose the “Privacy & Security” option.
  3. In the “Cookies and Site Data” section make sure you uncheck the "Delete cookies and site data when Firefox is closed" option.
  4. If you still have trouble after doing steps 1-3, you can also click the "Manage Exceptions" button to the right of this option and add <https://duosecurity.com> to the exceptions list.
  5. Changes you make here are immediate, so there is no option to save. You can close the preferences tab/window whenever you are finished.



### Safari

  1. With Safari open and active, click on “Safari” at the top-left of your computer screen (next to the Apple symbol on your top taskbar) and choose “Settings” from the drop down menu.
  2. Choose the “Advanced” option across the top of the window that appears.
  3. Under “Privacy” make sure the “Block all cookies” option is NOT selected. Safari should save all website data unless you specifically remove it in Preferences.
  4. Changes you make here are immediate, so there is no save option. You can close the Preferences window whenever you are finished.
