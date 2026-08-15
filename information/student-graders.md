---
title: "Student Graders"
source: https://kb.swarthmore.edu/wiki/Student_Graders
pageid: 534
categories:
  - Moodle
---

# Student Graders

It is useful to allow student graders to enter grades directly in Moodle.  Here is how to set things up within Moodle. 

## Contents

  * 1 Enrolling Student Graders
  * 2 Permissions for the Grader role
  * 3 Grading Procedure
  * 4 Making Information Visible to Graders but Hidden from Students
  * 5 Preventing Graders from seeing the Gradebook
    * 5.1 Configuration



## Enrolling Student Graders

Student graders are added to the Moodle course using [standard manual enrollment method](https://kb.swarthmore.edu/wiki/Adding_or_removing_enrollments "Adding or removing enrollments").  Select the **Grader** role for student graders. 

## Permissions for the Grader role

The Grader role can grade assignments, Moodle quizzes, and other activities, and can view and edit the grader report and grade history. 

Graders cannot make any changes to the course content or manage course settings, including setting up the gradebook. 

## Grading Procedure

To allow Graders to enter grades, set up the grade book in Moodle with your desired items.  For more details, see [Grading in Moodle](https://kb.swarthmore.edu/wiki/Grading_in_Moodle "Grading in Moodle").  Graders will see a **Grades** link on the top of their Moodle page and can enter the Grader Report and enter grades directly into the Moodle grader report. 

If you are using the Assignment activity in Moodle, graders can enter grades from within the activity by clicking on the assignment and viewing the list of submissions just as the Teacher role does.  For more information see [Set up an assignment in Moodle](https://kb.swarthmore.edu/wiki/Set_up_an_assignment_in_Moodle "Set up an assignment in Moodle")

## Making Information Visible to Graders but Hidden from Students

It is possible to share sensitive information such as homework solutions with graders but keep it hidden from students. See [Restricting access to items to certain members of the course](https://kb.swarthmore.edu/wiki/Restricting_access_to_items_to_certain_members_of_the_course "Restricting access to items to certain members of the course") for more information. 

## Preventing Graders from seeing the Gradebook

Some faculty that keep all their grades in Moodle prefer to hide student exam grades from their graders.  It is possible to allow graders to enter homework grades while preventing them from seeing other grades. 

Normally, the Grader role can view the gradebook and fill in grades (without being able to make changes to the grade items or other grade settings). You can override this behavior and prevent graders from accessing the gradebook. Because the graders won't be able to enter grades directly in the gradebook, you need to have the homework set up as an "Assignment" activity. Graders will be able to click on an Assignment activity in the course and enter grades but will not be able to see the full gradebook, including any exam grades. 

### Configuration

  * Go to the main course page
  * Click on **Participants **(under course title) → **Permissions **(from pulldown menu)
  * Select **Advanced Role Override** → **Grader**
  * In the **Filter** box, enter "grade"
  * Set the permissions for the following items to "Prevent" 
    * View the grader report
    * View the grade history
    * Edit grades
    * View grades of other users
  * Scroll to the bottom of the page and save the changes



To hide grades for the Moodle Quiz activity from Graders, set the following permissions to "Prevent": 

  * Grade quizzes manually
  * Regrade quiz attempts
