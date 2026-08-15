---
title: "Adding or removing enrollments"
source: https://kb.swarthmore.edu/wiki/Adding_or_removing_enrollments
pageid: 666
categories:
  - Moodle Fundamentals
---

# Adding or removing enrollments

Moodle automatically synchronizes course enrollments from Banner. To see a list of students in the class, click on the **Participants** link at the top of the course. You can also manually add people to your course. 

## Contents

  * 1 Enrolling Users
    * 1.1 Limited duration enrollments
    * 1.2 Adding users to groups in bulk
      * 1.2.1 **Sample CSV Import File**
  * 2 Removing Users
  * 3 Modifying Users and Changing Roles
  * 4 Types of Roles
  * 5 Additional Notes



## Enrolling Users

To enroll a a person in your course: 

  * Go to your Moodle course
  * Click on **Participants** (top of the course)** → Enroll Users**
  * Search for a user by first name, last name, or email.
  * Click on the name you want to enroll. You can add more than one person at once, by searching for additional names.
  * Select the Role for the users you are adding (all selected users will get the same role). See the list of roles below
  * Click on the **Enroll users** button add a new user(s) to your course.



  


### Limited duration enrollments

If you want to enroll someone shopping your course but have them automatically removed if they don't register for your course, use the enrollment duration setting when enrolling a user.  After you click on the **Enroll users** button to open the **Enroll Users** pop-up window, click on **Show more ...** link and set the duration of the enrollment for 2 weeks (or whatever value you would like). 

If the student never officially enrolls in the course, they will be dropped after the enrollment duration expires. 

If the student registers for the course, they will be added via Banner and will remain enrolled after the enrollment duration expires. 

### Adding users to groups in bulk

You can import a CSV file with a list of users, and their groups, to Moodle to assign course participants to a group upon import. This can be handy when creating many sets of groups within a course. 

To do this: 

  * Go to your Moodle course
  * Click on **Participants → Bulk Enrollments**
  * Import your CSV



##### **Sample CSV Import File**
[code] 
    email,group
    "aweed1@swarthmore.edu","Group A"
    "aruethe2@swarthmore.edu","Group A"
    "aturner2@swarthmore.edu","Group A"
    "dwillen1@swarthmore.edu","Group D"
    "jword1@swarthmore.edu","Group J"
    "aweed1@swarthmore.edu","Group B"
    
[/code]

  * Configure the options in **Mappings** and **Other Settings**
  * Click **Enroll them to my course**



After clicking **Enroll them to my course** , the plugin will redirect you back to the Bulk Enrollments page. Click on **Participants** to ensure the import went through. 

## Removing Users

If you would like to remove a user from the course, click the **Participants** link at the top of the course, then click on the trash can icon on the far right of a user record. 

## Modifying Users and Changing Roles

If you need to add or change the role of a manually-added user, go to **Participants** link at the top of the course, find the user you want to modify, and click on the **pencil icon** in the **Roles** column.  From here you can add a new role by clicking on the triangle to expand the list of roles, selecting a role, and clicking in the disk icon to save the change.  For example, if you didn't initially give a user a role when you enrolled them in the course, you could add the "student" role.  To remove a role, click the pencil to edit roles, then the **X** next to the name of the role. 

## Types of Roles

  * Students automatically added from Banner are set to the **Registered Student** role
  * Manually added students should have the **Student** role
  * **Teacher** is the role for the main instructor(s) of the course
  * **Teaching Assistant** can do everything a Teacher can, except remove the teacher
  * **Course Builder** can edit the course materials but not see grades
  * **Grader** can enter and modify grades but not edit course materials
  * **Auditor** has the same permissions as a student, but does not have a gradebook entry so can't participate in graded activities.



## Additional Notes

  * You cannot remove students enrolled via Banner (Registered Student). The student must be removed via the Registrar's Office.
  * If you manually add a student and they are later added from Banner, you don't have to remove their manual enrollment.  It is okay to be both a "Student" and "Registered Student"
