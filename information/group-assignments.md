---
title: "Group Assignments"
source: https://kb.swarthmore.edu/wiki/Group_Assignments
pageid: 532
categories:
  - Moodle Assignments
---

# Group Assignments

Moodle can be set up for assignments that only require one member of a group to submit a document. Grading the assignment will send the same grade to all members of the group. 

## Contents

  * 1 Configuration
    * 1.1 Set up groups
    * 1.2 Set up the assignment
    * 1.3 Due Dates
  * 2 How it works
  * 3 Other Notes



## Configuration

### Set up groups

  * Click **Participants** (under course title)→ **Groups** (from dropdown menu)
  * Click **Create Group**
  * Give the group a name (e.g. "Group 1" or "Monday Lab A") and save
  * Select the newly created group and click on **Add/remove users**. Add users as needed to this group.
  * Repeat the process for all the groups in the course



### Set up the assignment

Create a [Moodle assignment as usual](https://kb.swarthmore.edu/wiki/Set_up_an_assignment_in_Moodle "Set up an assignment in Moodle"), but adjust the settings for group submission. 

Under **Group submission settings** section 

  * **Students submit in groups** → **Yes**



Under **Common Module settings** section 

  * **Group mode** → **Visible groups**



### Due Dates

If all groups have the same deadline, set the due date as normal. If different groups have different deadlines (e.g. for lab groups meeting on different days) it is possible to set up different due dates for different groups. Click on the assignment → **More** → **Overrides** → **Group Overrides**. Set the due dates for each group as needed. 

Alternatively, it is possible to disable the due date for the assignment and rely on Moodle's assignment grading interface to show when the students submitted their work. The **View all submissions** screen shows the dates for student submissions and can be used to ensure that the assignment was turned in on time. 

## How it works

Students will submit files to the assignment as usual, but when one group member submits a file, it will show up under all the group members' submissions. Grading one group member will send the grade to all group members. 

## Other Notes

It is more difficult to set up assignments if the groups change throughout the semester, but it is possible using something called a "Grouping". Groupings are sets of groups. 

Create a "Week 1" Grouping and then create and populate Groups A, B, and C within the Week 1 grouping. Create the assignment for Week 1 and specify the "Week 1" grouping in the Group Submission Settings → Grouping for student groups. 

Repeat the same process for Week 2 with a new grouping and new groups A, B, and C within the Week 2 grouping. 

It can get time consuming to create the groups. It is possible to import a csv file with the group memberships, if that is an easier format for you to generate: <https://docs.moodle.org/en/Import_groups>
