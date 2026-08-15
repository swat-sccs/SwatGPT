---
title: "Navigation"
source: https://kb.swarthmore.edu/wiki/Navigation
pageid: 926
categories:
  - Drupal
---

# Navigation

[← Return to the Drupal User Guide](https://kb.swarthmore.edu/wiki/Drupal_Home "Drupal Home")

This section covers how to manage your site's navigation, including adding, removing, and changing the sort order of navigation items. 

## Contents

  * 1 5.1 Accessing a Site's Navigation
  * 2 5.2 How the Navigation Editor Works
  * 3 5.3 Arranging the Sort Order of Navigation
  * 4 5.4 Adding a Page to Navigation
  * 5 5.5 Editing or Removing a Navigation Link



## 5.1 Accessing a Site's Navigation

To access a site's navigation, go to **1) Site Settings**. Then click **2) Manage Navigation** in the submenu. This will open the Navigation editor (see 5.2). 

[![Screenshot showing the Site Settings menu with the Manage Navigation option highlighted.](https://kb.swarthmore.edu/images/9/90/navigation_1.png)](https://kb.swarthmore.edu/wiki/File:navigation_1.png)

**Figure:** Access the Navigation editor from the Site Settings menu.

## 5.2 How the Navigation Editor Works

  1. **Title** \- The name displayed at the top of the navigation component. This is always the name of your homepage and should not be changed.
  2. **Menu Link** \- Displays all webpages that appear in your site's navigation. To rearrange navigation items, hover over the **+** icon to the left of a page name. When the cursor changes, click and drag the page to its new location.
  3. **Enabled/Disabled** \- Check or uncheck this box to temporarily show or hide a navigation item.
  4. **Operations** \- This dropdown menu allows you to **Edit** an existing link name or **Delete** it from the navigation.
  5. **Add Link** \- Allows you to add a new navigation link. See section 5.4 for more information.
  6. **Save** \- Click **Save** for your changes to appear on the website.



Changes Are Immediate

All navigation changes become live as soon as you click **Save**. Unlike page content, navigation changes do not have a draft state.

  


[![Screenshot of the Navigation editor showing the menu structure and editing controls.](https://kb.swarthmore.edu/images/0/0a/navigation_editor1.png)](https://kb.swarthmore.edu/wiki/File:navigation_editor1.png)

**Figure:** The Navigation editor.

## 5.3 Arranging the Sort Order of Navigation

Moving your mouse over the **+** icon changes the cursor so you can click and drag a menu item to a new position. Items indented beneath another menu item become child pages of the parent above them. 

Drupal supports up to four levels of navigation. 

[![Screenshot demonstrating drag-and-drop navigation ordering within the Navigation editor.](https://kb.swarthmore.edu/images/5/50/Screenshot_2024-07-29_at_5.00.58_PM.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_2024-07-29_at_5.00.58_PM.png)

**Figure:** Drag and drop menu items to change the navigation hierarchy.

Best Practice

It is recommended that you keep your navigation to three levels whenever possible. Although Drupal supports a fourth level, limiting your navigation depth generally makes websites easier to navigate. 

For example: 

  * **1st Level** — Biology Homepage
  * **2nd Level** — Academic Program
  * **3rd Level** — Course Majors & Minors
  * **4th Level** — Optional (if needed)



  


## 5.4 Adding a Page to Navigation

To add a new page or link to the navigation, click the **Add Link** button in the **Manage Navigation** screen. 

[![Screenshot showing the Add Link button in the Navigation editor.](https://kb.swarthmore.edu/images/5/5d/add_link1.png)](https://kb.swarthmore.edu/wiki/File:add_link1.png)

**Figure:** Select **Add Link** to create a new navigation item.

  1. **Link** \- Place your cursor in the **Link** field and begin typing the title of the page you wish to add (for example, "Admissions"). You may also enter an internal path such as `/admissions-aid` or an external URL such as `<https://swarthmoreathletics.com/>`.
  2. **Menu Link Title** \- This is the text displayed in the navigation. When selecting another Drupal page, this field is automatically populated using the page title. If linking to an external website or document, you will need to provide your own title.
  3. **Link to a Document** \- Select or upload a document to create a navigation link directly to that file.
  4. **Enabled/Disabled** \- Determines whether the navigation link is immediately visible.
  5. **Parent Link** \- Places the link beneath an existing navigation item when it is created, reducing the amount of drag-and-drop required afterward.
  6. **Save** \- Save your changes.



[![Screenshot of the Add Menu Link form showing the available fields.](https://kb.swarthmore.edu/images/a/a5/add_menu_link1.png)](https://kb.swarthmore.edu/wiki/File:add_menu_link1.png)

**Figure:** The Add Menu Link form.

## 5.5 Editing or Removing a Navigation Link

You can edit or remove an existing navigation link using the **Operations** menu. 

  1. Click **Edit** in the Operations dropdown to edit an existing navigation link.



[![Screenshot showing the Edit option in the Operations menu.](https://kb.swarthmore.edu/images/8/83/edit_1.png)](https://kb.swarthmore.edu/wiki/File:edit_1.png)

**Figure:** Choose **Edit** to modify a navigation link.

  1. Select **Delete** from the same menu if you wish to remove the navigation link.



[![Screenshot showing the Delete option in the Operations menu.](https://kb.swarthmore.edu/images/a/ac/edit_3.png)](https://kb.swarthmore.edu/wiki/File:edit_3.png)

**Figure:** Choose **Delete** to remove a navigation link.

If you select **Edit** , Drupal opens the **Edit Menu Link** window. 

  1. **Link** \- Displays the current webpage, external URL, or document referenced by the navigation item.
  2. **Menu Link Title** \- Displays the text shown in the navigation.
  3. **Link to a Document** \- Allows you to change the linked document.
  4. **Enabled/Disabled** \- Allows you to show or hide the navigation link.
  5. **Save** \- Click **Save** to commit your changes.



[![Screenshot of the Edit Menu Link dialog showing the available editing fields.](https://kb.swarthmore.edu/images/9/96/edit_2.png)](https://kb.swarthmore.edu/wiki/File:edit_2.png)

**Figure:** The Edit Menu Link dialog.
