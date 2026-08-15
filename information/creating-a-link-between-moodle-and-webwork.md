---
title: "Creating a link between Moodle and WeBWorK"
source: https://kb.swarthmore.edu/wiki/Creating_a_link_between_Moodle_and_WeBWorK
pageid: 556
categories:
  - Moodle External Tools
  - WeBWorK
---

# Creating a link between Moodle and WeBWorK

WeBWorK is an online math homework system.  It is possible to connect Moodle to WeBWorK so that students are automatically enrolled in WeBWorK by clicking on a link from within Moodle and have WeBWorK send grade information to Moodle. 

There are two ways to set up the connection between Moodle and WeBWorK.  If you aren't interested in having WeBWorK send grades to Moodle or only need the overall WeBWorK grade reported back to Moodle, it is easiest to set up a single link between the two systems.  If you need to have the individual grades for WeBWorK assignments reported to Moodle, you will need to create a link to each WeBWorK assignment. 

## Contents

  * 1 Setting your WeBWorK course
  * 2 Setting up a link between Moodle and WeBWorK
    * 2.1 WeBWorK setup
    * 2.2 Moodle Setup
  * 3 Student Enrollments and Access
  * 4 Grading
  * 5 PiRates
  * 6 Other information about WeBWorK



## Setting your WeBWorK course

  * Ask a colleague who is a WeBWorK administrator or submit a Help Desk ticket (support@swarthmore.edu) to request a WeBWorK course.  Provide the name and number of the course you want to configure.
  * Log into your course at [webwork.swarthmore.edu](https://webwork.swarthmore.edu) with your Swarthmore username and password
  * If needed, follow the [Instructions for copying a WeBWorK Course](https://kb.swarthmore.edu/wiki/Copying_a_WeBWorK_Course "Copying a WeBWorK Course") from one semester to another



## Setting up a link between Moodle and WeBWorK

The procedure below will create a link between WeBWorK and Moodle and can be used for either a single, course-wide link or a link to a specific WeBWorK assignment. 

### WeBWorK setup

Start by deciding if you want a single link to WeBWorK in Moodle or if you want a separate link for each assignment. A single link is simpler for the instructor to set up. Individual links may make it easier for students to know when assignments are due. When using individual links for each homework assignment, students must click on the link in Moodle to start their homework assignment. After they have clicked the link once, they can access the assignment by logging into WeBWorK directly. 

The default configuration is a single, course-wide link. If you prefer individual links to each homework assignment, log into your WeBWorK course and click on **Course configuration** (left menu)**→ LTI tab → Grade passback mode → Homework**

### Moodle Setup

  * Go to your Moodle course and turn editing on
  * Click **Add an activity or resource** and select **WeBWorK**
  * Click **Select Content**
  * If the Moodle course hasn’t already been connected to WeBWorK, you will see a window showing some information about the course, including the Context ID. Copy the value of the **Context ID**.



[![Moodle dialog box showing Context ID for use with WeBWorK](https://kb.swarthmore.edu/images/4/40/image-20240806-175230.png)](https://kb.swarthmore.edu/wiki/File:image-20240806-175230.png)

  * Leaving this browser window open, go to your WebWorK course and click on **Course Configuration**
  * Click on the **LTI** tab
  * Enter the value from Moodle in the **Context ID** field
  * Click **Save changes**
  * Go back to Moodle, close the “Select content” dialog box, and click **Select Content** again.
  * To create a single link to all the homework sets in the WeBWorK course, select **Assignments (Course Home)**. To to link individual homework assignments, select specific sets. A Moodle activity will be created for each selected WeBWorK item.

[![Moodle dialog showing choices for selecting content from WeBWorK](https://kb.swarthmore.edu/images/e/e6/image-20240806-194106.png)](https://kb.swarthmore.edu/wiki/File:image-20240806-194106.png)

  * Click **Submit Choices**
  * Under the **Grade** section, adjust the settings as desired. If multiple WeBWorK sets were selected you must adjust the grade options individually after creating the Moodle activities.
  * Click **Save and return to course**



You should now have a link to WeBWorK in your Moodle course that students can use to access WeBWorK. 

## Student Enrollments and Access

When a student clicks on a Moodle link to a WeBWorK course for the first time, their WeBWorK course account is automatically created. Moodle does not send the entire class roster to WeBWorK, so if a student never clicks on the WeBWorK link, they will not have a WeBWorK course account. 

Once their WeBWorK course account is created, a student can log into their WeBWorK course either through the Moodle link or directly on the WeBWorK website. When using individual homework links, students must click on the WeBWorK homework link in Moodle once to create a connection between the two systems. After that, students can access their assignment via Moodle or by logging into WeBWorK directly. 

By default, WeBWorK will assign students any visible homework sets in the course. 

## Grading

If grading is set up in the Moodle WeBWorK activity, Moodle will add an corresponding entry to the gradebook. 

WeBWorK sends the percentage grade for each assignment back to Moodle and the two systems do not synchronize visibility, due dates, or point values. Most instructors let WeBWorK control the availability and timing of the homework sets and set the point value of each homework set to be 100. 

WeBWorK calculates the overall grade by adding up the number of points earned for all assignments divided by the overall number. 

## PiRates

You may want to enroll PiRates in your Moodle course with the Auditor role.  This will allow them to see your Moodle resources and access your WeBWorK assignments via the link from Moodle, but does not create a Moodle gradebook entry.  After they have logged into WebWorK to create their accounts, you may want to elevate their permissions in WebWorK. 

## Other information about WeBWorK

[Copying a WeBWorK Course](https://kb.swarthmore.edu/wiki/Copying_a_WeBWorK_Course "Copying a WeBWorK Course")

[Limiting WeBWorK Emails](https://kb.swarthmore.edu/wiki/Limiting_WeBWorK_Emails "Limiting WeBWorK Emails")

[WeBWorK Project Documentation Wiki](https://webwork.maa.org/wiki/WeBWorK_Main_Page)
