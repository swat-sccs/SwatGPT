---
title: "Export or backup a course from Moodle"
source: https://kb.swarthmore.edu/wiki/Export_or_backup_a_course_from_Moodle
pageid: 451
categories:
  - Moodle
  - Moodle Administration
---

# Export or backup a course from Moodle

Moodle has two mechanisms for exporting and backing up course content. 

  * **Download course content** : good for saving or sharing files from the course. This does not include any student or grade information or any activities such as assignments or discussion forums.
  * **Backup course content** : good for backing up an entire course as a self-contained archive. The backup file is not human-readable, but can be imported to another Moodle site. This is a good solution to create a complete record of a course or to transfer a Moodle course to another Moodle site.



  


## Download Course Content

Moodle can export all files using the **Download course content** feature. The export also includes a simple web page showing all the items on the main course page, including links to the downloaded files. 

By default, this feature is disabled for students, but instructors can provide access to students by allowing **Enable download course content** in the course settings. 

  1. Go to the course main page
  2. Click on the **More** link (under the course title)
  3. Select **Download course content**.



Moodle will download a zip file with your course content. This can be used to distribute files or as an archive. 

## Backup Course Content

Moodle has a backup feature that stores all (or selected parts) of a course to a compressed file that can be saved for future use or copied to a different Moodle site. This can be useful if an instructor is moving to a different institution or would like to have a backup of the course for safekeeping. This feature is not available to students. 

  


To generate the backup, 

  1. Go to the course main page
  2. Click on the **More** link (under the course title)
  3. Select **Course reuse**.
  4. Select **Backup** from the dropdown menu.



The backup process will guide you through what information and which activities you want to backup. 

By default, all content items will be included in the backup file. It is possible to exclude items or entire sections by unchecking them in the second step labeled **2\. Scheme settings**. 

When the process completes, you will see a list of the backup files generated for this course and can download the file(s).  If you want to download a file at a later time, clicking on **More → Course reuse** **→ Restore** will show a list of all the backup files for the course. 

## Transferring a Moodle course from Swarthmore to another institution

It may be possible to export a course from Swarthmore's Moodle site and import it to another institution's Moodle site. Download the `.mbz` Moodle backup file as specified above and use the Moodle Restore feature to import it to the other Moodle site. Depending on the versions of Moodle used, it may not be possible to transfer all the activities.
