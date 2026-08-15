---
title: "Copying a WeBWorK Course"
source: https://kb.swarthmore.edu/wiki/Copying_a_WeBWorK_Course
pageid: 539
categories:
  - WeBWorK
---

# Copying a WeBWorK Course

To copy homework sets from one WeBWorK course to another, follow the procedure below. 

  1. Go to the WeBWorK course with the content you want to copy **from**
  2. Click on **Sets Manager**
  3. Select **Export** and pick the sets you want to export (or select all) and click **Export**. The export function creates "set definition files" for each assignment. These .def files have a filename generated from the name of the homework set and contain the assignment name, dates, and problems. The files are saved in the `templates` directory of the course.
  4. Click on **File Manager**
  5. Select all the .def files you want to copy (make sure you are in the templates folder)
  6. Select **Make archive** and a .zip file will be created. This is an archive containing all the def files.
  7. Download the .zip file to your computer by selecting the .tgz file and clicking the **Download** button
  8. Go to the new course → **File Manager**
  9. Upload the .zip file. Click **Choose file** → select the .zip file from your computer → click **Upload**. The .def files are now in your new course
  10. Go to **Sets Manager** → **Import** → **Multiple Sets** → Select the .def files → Assign students as needed → click **Import**
  11. Edit the assignment due dates and homework sets as needed.



  


## Copying additional problem data

If there are problems that have been added to the original course that are not part of the standard problem library, you may also need to copy the "local" folder within the templates directory. 

  1. Go to the original course
  2. Go to the **File Manager**
  3. Select the "local" folder.
  4. Select **Make archive** and a .zip file will be created. This is an archive (like a zip file) containing the local files.
  5. Download the .zip file to your computer by selecting the .zip file and clicking the **Download** button
  6. Go to the new course → **File Manager**
  7. Upload the .zip file. Click **Choose file** → select the .zip file → click **Upload**. The local files are now in your new course



Check to see if the homework sets now render properly. 

## Optional Clean up Step

If copied several times, your course may end up with lots of .def files in the templates directory. If you have already imported the homework sets, you can delete the extraneous .def files using the functions in the File Manager.
