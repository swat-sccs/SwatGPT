---
title: "Roles in Moodle"
source: https://kb.swarthmore.edu/wiki/Roles_in_Moodle
pageid: 648
categories:
  - Moodle Basic Administration
  - Moodle Administration
---

# Roles in Moodle

Moodle uses roles to set permissions within the Moodle system and within each course.  If you want to get fancy, it is also possible to set roles for individual resources or activities. 

## Contents

  * 1 Assignable Roles
  * 2 Other Roles
  * 3 Assigning Roles
  * 4 More about roles



## Assignable Roles

Users can be enrolled in a Moodle course with a variety of roles.  Here are some definitions of each available role: 

  * **Teacher** - has full control over a course.  Can add and edit content as well as grade student work.  Teachers are listed as the instructors for the course.
  * **Teaching Assistant (TA)** \- can do everything a teacher can except un-enroll the teacher.  TA's are not listed as instructors of a course.  This is a good role for supporting instructors or AA's that need to assist with grades.
  * **Course Builder** \- can manage content of the course but cannot access the gradebook or grade student work.  Many times an AA or student assistant will be enrolled as a Course Builder.
  * **Grader** \- can grade student work but not edit any of the content of the course.  Student graders are often given this role.
  * **Registered Student ** \- a student that is officially registered for the course through the Registrar's Office.  This role can only be assigned or removed through the automatic Banner-Moodle synchronization process.  Teachers cannot assign or remove this role.
  * **Student ** \- the same as "Registered Student" but this role can be manually assigned or removed by teachers.
  * **Auditor - ** same permissions as student, but does not appear in the gradebook.  This can be used for students auditing a course or for student assistants that need to access course materials but do not need to edit course materials or see the gradebook.
  * **Writing Associate -** The WA role was created for the Writing Program. The role has similar permissions as student, but does not appear in the gradebook and can't submit to activities. Visible to teaching roles but not student roles. They cannot view grades or download papers by default. If you would like for them to download papers from Moodle Assignments you must override their role permissions to be able to view grades. This can be set up temporarily for the time needed to download the papers, then restricted again once all papers have been downloaded if necessary.



## Other Roles

Roles that are not available for teachers to assign but exist on the Moodle system: 

  * **Site administrator - **the Moodle administrator role.  Typically held by IT personnel.
  * **Manager** \- a site-wide role that can manage individual courses but not change the Moodle system itself.  Typically held by Help Desk, Library, or other support personnel.
  * **Course Creator** \- a site-wide role that can create individual courses.  Not used much at Swarthmore.
  * **Authenticated User ** \- a role that any logged in user has.



## Assigning Roles

See the section on Modifying Users and Changing Roles on the [Adding or removing enrollments](https://kb.swarthmore.edu/wiki/Adding_or_removing_enrollments "Adding or removing enrollments") help page for instructions on assigning or changing roles. 

## More about roles

It is possible to have multiple roles within a single course.  Moodle has a complex system for determining what permissions users have when given multiple roles, but generally the permissions are additive.  The most common case may be that a student is manually enrolled in a course and then is enrolled through the Registrar's Office.  The student will end up with both the "Registered Student" and "Student" role.  Since these roles have the same permissions, everything will work fine. 

You can find more details on the [Roles and Permissions](https://docs.moodle.org/en/Roles_and_permissions) page of the Moodle documentation site.
