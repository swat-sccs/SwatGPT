---
title: "Hiding selected Moodle items from guests"
source: https://kb.swarthmore.edu/wiki/Hiding_selected_Moodle_items_from_guests
pageid: 561
categories:
  - Moodle
  - Moodle Administration
---

# Hiding selected Moodle items from guests

If a course doesn't have material with copyright issues, some faculty prefer to open the course to guests.  A guest is anyone in the world with Internet access.  Instructions for turning on Guest Access: [Making a course available to students](https://kb.swarthmore.edu/wiki/Making_a_course_available_to_students "Making a course available to students")

In some cases, it is desirable to hide some resources or activities from Guests.  One possible way to restrict access to specific items is by putting all registered students in a group and limiting access to only that group.  Instructions for this method: [Restricting access to items to certain members of the course](https://kb.swarthmore.edu/wiki/Restricting_access_to_items_to_certain_members_of_the_course "Restricting access to items to certain members of the course")

If the class enrollment changes frequently, it can be cumbersome to manually update the group.  Another method to prevent Guests from accessing specific material in the course is to override the permissions for those items.  To do this: 

  * Go into Edit mode
  * On the course page, click the 3 vertical dots button and choose Edit settings
  * Under the title of the item, choose **More** and select **Permissions**
  * Click **More → Permissions**.
  * Under **Activity** <type of item> you have selected, find the setting for**View** <type of item>
  * Click the **Plus sign** to the right of the list of roles, to bring up a list of roles to prohibit for that activity
  * Select the **Guest** role to change the viewing permissions to **Prohibit**. 
    * For example, when limiting access to a file, Under Activity: File change the **View resource** list to **Prohibit** for Guests (Note that you may have to remove the Guest user from the “Roles with Permission” list on that same line)
