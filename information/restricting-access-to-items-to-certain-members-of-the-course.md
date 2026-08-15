---
title: "Restricting access to items to certain members of the course"
source: https://kb.swarthmore.edu/wiki/Restricting_access_to_items_to_certain_members_of_the_course
pageid: 567
categories:
  - Moodle
  - Moodle Administration
---

# Restricting access to items to certain members of the course

There are many cases in which it is useful to restrict access to material in Moodle.  For example, some professors need to sharing homework solutions with graders. 

## Contents

  * 1 Procedure
  * 2 Additional Notes
    * 2.1 Restricting Topics
    * 2.2 Viewing as a Different Role Doesn't Work as Expected
  * 3
  * 4
  * 5
  * 6
  * 7



## Procedure

Create a group of users (students, graders, TA's, etc) that can access the content.  If a student is not in the group, they won't be able to see the content. 

  1. Go to **Participants** **→** **Groups **(from dropdown menu)
  2. Click **Create group**
  3. Create a new group and give it a descriptive name.  None of the other information is required.  Click **Save changes**.
  4. You should now see your group in the groups listing.  Click on the group name, then on the **Add/remove users** button.  Find users to add and click the **Add** button to add them to the group.  When you have finished adding all the group members, return to your course main page.
  5. For the resource or activity you want to limit access to, click toggle **edit mode** on at the top right corner, click on the activity, then **Edit settings**
  6. Under **Restrict Access** , add a new restriction
  7. Select **Group** and pick the group you want to have access to the item
  8. Click on the eyeball next to your group so that the item will be hidden totally from users not in that group
  9. Save changes.  When you return to the course main page you will see an indication that the item is restricted



## Additional Notes

### Restricting Topics

It is possible to add a group restriction on a topic or week. Follow the same procedure as above, but set the restriction on the entire topic. You will need to leave the topic and all its contents visible, but Moodle will display a label indicating that access to the topic is restricted. You do not need to adjust the permissions/restrictions for any of the items within the topic. If the topic itself is restricted so will all the contents of the topic. 

### Viewing as a Different Role Doesn't Work as Expected

Roles and Groups in Moodle are two different things. It is possible to switch your role to see what a Student or Grader sees, but it is not possible to set a specific group. Because we can only restrict visibility based on groups, it isn't possible to verify that the visibility of a topic or item based on group membership. 

For example, if you have users enrolled as the "Grader" **role** , put them in the "Student Graders" **group** , and restrict homework solutions to only be visible to the "Student Graders Group", switching your **role** to view as a "Grader" won't allow you to see the homework solutions because there is no way to preview what someone in the "Student Graders" **group** would see. If you would like to make sure your course is set up properly, please get in touch with your Academic Technologist and they can verify your settings. 

##   


## 

## 

## 

##
