---
title: "Integrating Moodle, Zoom, and Panopto"
source: https://kb.swarthmore.edu/wiki/Integrating_Moodle%2C_Zoom%2C_and_Panopto
pageid: 449
categories:
  - Moodle
  - Panopto
  - Zoom
---

# Integrating Moodle, Zoom, and Panopto

It is possible to integrate Moodle, Zoom, and Panopto so that Zoom meeting recordings are transferred to a Panopto course folder, and show up in Moodle automatically. 

## Contents

  * 1 Add Panopto Block in Moodle
  * 2 Create a Recurring Zoom Meeting in Moodle
    * 2.1 Recommended Zoom Settings
  * 3 Set up Zoom/Panopto Connection
  * 4 Inserting a Link to a Panopto Video in a Moodle Class



## Add Panopto Block in Moodle

Add the Panopto block to your Moodle course by following the instructions on the [Adding the Panopto Block to a Moodle Course](https://kb.swarthmore.edu/wiki/Adding_the_Panopto_Block_to_a_Moodle_Course "Adding the Panopto Block to a Moodle Course") page. 

## Create a Recurring Zoom Meeting in Moodle

Add a recurring Zoom meeting to your Moodle course by following the instructions on the [Zoom Meeting Integration with Moodle](https://kb.swarthmore.edu/wiki/Zoom_Meeting_Integration_with_Moodle "Zoom Meeting Integration with Moodle") page. 

### Recommended Zoom Settings

  * The Zoom meeting ID needs to remain the same, so use the recurring Zoom meeting
  * Disable "Join before host" to prevent student testing of your Zoom link from starting a meeting recording
  * Select the automatic recording option



When done, log in to [swarthmore.zoom.us](https://swarthmore.zoom.us) → **Meetings** → **Upcoming Meetings tab** → Click on your course meeting. Copy the "Meeting ID" listed for use in the next step. 

## Set up Zoom/Panopto Connection

When you create the Panopto block in Moodle, a folder with your course name is automatically created in Panopto. To find your course folder, log into Panopto ([panopto.swarthmore.edu](http://panopto.swarthmore.edu)), then click **Browse** or use the Search bar and enter in your course number (e.g. "ECON056"). Any videos added to the course folder will show up in the Moodle Panopto block. 

When you record a Zoom session, it will automatically be sent to Panopto and placed in "**My Folder** " → "**Meeting Recordings** " by default. It is easier to send all Zoom recordings directly to your course folder. To set this up: 

  1. Log into Panopto ([panopto.swarthmore.edu](https://panopto.swarthmore.edu/))
  2. Click on your name in the upper right
  3. Click on "**User Settings** "
  4. Under "Info", find "Zoom Recording Import Settings" and click "**Add New** "
  5. Under "Meeting ID", paste in the Zoom Meeting ID for your Zoom meeting (you may need to remove any non-numeric characters, such as dashes).
  6. Under Folder Name, select your Moodle course name
  7. Click **Save**

[![Panopto user settings showing Zoom Recording Import Settings with options to set default folder and create folder mappings by meeting ID](https://kb.swarthmore.edu/images/9/90/Panopto.png)](https://kb.swarthmore.edu/wiki/File:Panopto.png)

Now each time a Zoom recording is made for that meeting, it will automatically get sent to your course folder in Panopto and show up in the Moodle Panopto block. It may take several hours for Zoom and Panopto to process a recording. 

## Inserting a Link to a Panopto Video in a Moodle Class

If you would like the recording to appear in a specific topic or week within your Moodle course, log in to Panopto ([panopto.swarthmore.edu](https://panopto.swarthmore.edu)), find your video, select the sharing icon, and copy the url for the video. You can then insert the url to the video in the appropriate week.
