---
title: "The Editor"
source: https://kb.swarthmore.edu/wiki/The_Editor
pageid: 917
categories:
  - Drupal
---

# The Editor

[← Return to the Drupal User Guide](https://kb.swarthmore.edu/wiki/Drupal_Home "Drupal Home")

This section introduces the Drupal content editor, where you'll create and format the main content of your webpages. Each tool in the editor toolbar is explained in the sections that follow, along with recommended best practices for creating accessible, well-formatted content. 

## Contents

  * 1 2\. Working with the Editor
  * 2 2.1 Undo | Redo
  * 3 2.2 Remove Formatting
  * 4 2.3 Bold, Italics, Bullet Lists, and Numbered Lists
    * 4.1 Choosing the Right Type of List
  * 5 2.4 Headings
  * 6 2.5 Styles
  * 7 2.6 Horizontal Rule
  * 8 2.7 Anchors
    * 8.1 2.7.1 Creating an Anchor
    * 8.2 2.7.2 Linking to an Anchor on the Same Page
    * 8.3 2.7.3 Linking to an Anchor on Another Page
  * 9 2.8 Links
    * 9.1 2.8.1 Linking to Another Webpage in Drupal
    * 9.2 2.8.2 How the Link Editor Works
    * 9.3 2.8.3 Creating a Link to Another Page in Drupal
    * 9.4 2.8.4 Creating a Link Using a URL
    * 9.5 2.8.5 Linking to a Document
      * 9.5.1 How the "Link to Document" Dialog Works
      * 9.5.2 Once the Document Is Selected
    * 9.6 2.8.6 Edit or Remove a Link
  * 10 2.9 Special Characters
  * 11 2.10 Find & Replace
  * 12 2.11 Tables
  * 13 2.12 Add Image
  * 14 2.13 Upload Image
  * 15 2.14 HTML Source
  * 16 2.15 Full Screen



## 2\. Working with the Editor

The **body** field contains the main content that appears on a webpage. The editor toolbar appears above the body field and includes tools for formatting text, adding headings, creating links, inserting tables, adding images, and editing HTML source. 

[![Screenshot of the body editor in Swarthmore's Drupal 10 CMS.](https://kb.swarthmore.edu/images/6/60/image-20240710-211017.png)](https://kb.swarthmore.edu/wiki/File:image-20240710-211017.png)

**Figure:** The body editor contains the main page content and formatting toolbar.

The editor functions are shown below. 

[![Screenshot of the Drupal editor toolbar with formatting, link, table, image, source, and fullscreen controls.](https://kb.swarthmore.edu/images/b/b8/editor.png)](https://kb.swarthmore.edu/wiki/File:editor.png)

**Figure:** The Drupal editor toolbar includes the main tools used to format and manage body content.

From left to right, the editor toolbar includes: 

  1. Undo / Redo
  2. Remove Formatting
  3. Bold, Italics, Bullet List, Ordered List
  4. Headings
  5. Styles
  6. Horizontal Rule
  7. Anchors
  8. Links
  9. Special Characters
  10. Find / Replace
  11. Tables
  12. Add Image in Body Copy
  13. Upload Image
  14. View HTML Source
  15. Toggle Full Screen



## 2.1 Undo | Redo

Allows you to undo or redo any edit you make to the body copy block. 

## 2.2 Remove Formatting

When you copy and paste content from another source (Google Docs, Microsoft Word, PDFs, or a website) the original formatting (fonts, colors, font sizes, spacing, and other styles) is often copied along with the text. This formatting may not match the design of the Swarthmore website. 

The **Remove Formatting** tool strips away the imported formatting while preserving the text itself. To use it, highlight the text you want to clean up and click the **Remove Formatting** button in the editor toolbar. 

Best Practice

Always use **Remove Formatting** after pasting content into Drupal. This helps ensure your content uses the site's standard styles and remains consistent with the rest of the website. 

  


## 2.3 Bold, Italics, Bullet Lists, and Numbered Lists

The editor toolbar includes tools for applying **bold** and _italic_ formatting, as well as creating bulleted and numbered lists. 

### Choosing the Right Type of List

Drupal supports two types of lists, each intended for a different purpose. 

**Numbered lists** should be used when the order of the items matters, such as instructions or procedures. 

Example: 

  1. Heat the oven to 250°F.
  2. Season the steak.
  3. Cook in the oven until nearly done.
  4. Sear each side over high heat.
  5. Let the steak rest.
  6. Serve.



**Bulleted lists** should be used when the order of the items is not important, such as checklists or collections of related items. 

Example: 

  * Charging cables
  * Socks
  * Shirts
  * Toiletries
  * Prescription medications
  * Extra pair of glasses



Best Practice

Choose the list type based on its purpose. Use **numbered lists** for step-by-step instructions and **bulleted lists** for unordered collections of related items. 

  


## 2.4 Headings

Headings organize your content into logical sections, making webpages easier to read and navigate. Drupal supports heading levels from **H2** through **H6** within the page editor. 

The page title is automatically created as the page's **H1** heading. When adding headings within the body content, always begin with an **H2** , then use **H3** , **H4** , and so on as needed. 

Heading levels should always follow a logical hierarchy. Skipping heading levels (for example, jumping from **H2** directly to **H4**) can make content more difficult to understand, particularly for visitors using screen readers. 

A typical heading hierarchy looks like this: 
[code] 
    H1  Page Title (added automatically)
    
    H2  First Main Topic
      H3  First Subtopic
      H3  Second Subtopic
      H3  Third Subtopic
    
    H2  Second Main Topic
      H3  First Subtopic
        H4  Supporting Detail
        H4  Supporting Detail
      H3  Second Subtopic
    
    H2  Third Main Topic
    
[/code]

Accessibility

Headings are one of the primary ways people using screen readers navigate webpages. To see why heading structure is important, watch [Screen Reader Demo: Using Headings (YouTube)](https://youtu.be/0xAv1l04aJI?si=zDevmiYLH1okRUaz).

  


## 2.5 Styles

The **Styles** menu provides several predefined formatting options that have been approved for use on the Swarthmore website. These styles allow you to emphasize content while maintaining a consistent appearance across the site. 

Common styles include: 

  * Lead paragraphs
  * Pull quotes
  * Other approved content styles



Best Practice

Whenever possible, use the predefined styles instead of manually changing font sizes, colors, or other formatting. This helps keep the website visually consistent and accessible. 

  


## 2.6 Horizontal Rule

The **Horizontal Rule** tool inserts a visual divider between sections of content. 

Horizontal rules should be used sparingly to separate major sections of a page. In most cases, headings provide a clearer and more accessible way to organize content. 

Best Practice

Use headings, not horizontal rules, to organize page structure. Horizontal rules should only be used when a visual separation is helpful. 

## 2.7 Anchors

Anchors are internal links that allow visitors to jump directly to a specific section of a webpage. They are commonly placed on headings so readers can quickly navigate long pages. 

Anchor names should be unique, contain no spaces, and use a simple naming convention. Examples include: 

  * `CreatingAnchors`
  * `admissionsRequirements`
  * `required-documents`



When an anchor has been created successfully, a small red flag icon appears in the editor. This icon is only visible while editing and is never shown to website visitors. Selecting the flag displays the anchor's name and allows you to edit it if necessary. 

[![Red flag icon indicating an anchor has been created.](https://kb.swarthmore.edu/images/e/ee/Screenshot_2024-10-10_at_11.59.15_AM.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_2024-10-10_at_11.59.15_AM.png)

**Figure:** A red flag icon identifies an anchor within the editor.

### 2.7.1 Creating an Anchor

After creating an anchor, click the red flag icon to open the **Anchor** dialog. 

[![Screenshot of the Anchor dialog in the Drupal editor.](https://kb.swarthmore.edu/images/5/5d/anchor-dialog.png)](https://kb.swarthmore.edu/wiki/File:anchor-dialog.png)

**Figure:** The Anchor dialog allows you to create or edit an anchor.

### 2.7.2 Linking to an Anchor on the Same Page

To create a link to an anchor on the page you're currently editing: 

  1. Highlight the text that should become the link.
  2. Select **Edit Link**.
  3. In the **Link URL** field, enter the anchor name preceded by a `#` character.



For example, if the anchor name is `Definitions`, enter: 
[code] 
    #Definitions
[/code]

[![Screenshot showing the Edit Link option for an existing link.](https://kb.swarthmore.edu/images/b/ba/Screenshot_2024-10-10_at_11.33.39_AM.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_2024-10-10_at_11.33.39_AM.png)

**Figure:** Open the Edit Link dialog to configure the destination.

[![Screenshot showing the Link URL field containing an anchor reference.](https://kb.swarthmore.edu/images/4/47/Screenshot_2024-10-10_at_11.33.47_AM.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_2024-10-10_at_11.33.47_AM.png)

**Figure:** Enter the anchor name in the Link URL field, preceded by a # symbol.

### 2.7.3 Linking to an Anchor on Another Page

You can also link directly to an anchor on another page by appending the anchor name to the end of the page's URL. 

Examples: 
[code] 
    /my-example-page#Definitions
    
[/code]

or 
[code] 
    /node/100057#Definitions
    
[/code]

Best Practice

Choose descriptive anchor names that clearly identify the section they reference. Consistent naming makes anchors easier to maintain and reuse throughout your page(s).

  


## 2.8 Links

Adding links to other webpages or other content is one of the most common tasks you'll perform when creating webpages. The most important thing to remember about a link is the text of that link. Make sure it is meaningful and lets visitors know what will happen when they select it. Visit [Unlock the Power of Meaningful Links](https://blogs.swarthmore.edu/its/2024/03/13/unlock-the-power-of-meaningful-links/) to learn more. 

Here are some examples of effective and ineffective link text: 

Ineffective  | Effective   
---|---  
WCAG-compliant links should explain their purpose from the link text alone. [Click here](https://www.w3.org/WAI/WCAG22/quickref/?versions=2.1#link-purpose-in-context) to learn more.  | [WCAG-compliant links should explain their purpose](https://www.w3.org/WAI/WCAG22/quickref/?versions=2.1#link-purpose-in-context) from the link text alone.   
Check your contrast levels using [https://webaim.org/resources/](https://webaim.org/resources/contrastchecker/)  
[contrastchecker/](https://webaim.org/resources/contrastchecker/) | Check your contrast levels using [WebAIM's Contrast Checker](https://webaim.org/resources/contrastchecker/)  
[Swarthmore's Accessibility website](https://www.swarthmore.edu/accessibility) includes five tips for preparing accessible materials.  | Swarthmore's Accessibility website includes [five tips for preparing accessible materials](https://kb.swarthmore.edu/wiki/%22Fast_Five%22_Essentials_to_Preparing_Materials ""Fast Five" Essentials to Preparing Materials").   
[Here](https://webaim.org/techniques/hypertext/) is an introduction from WebAIM to links and hypertext.  | [WebAIM's introduction to links and hypertext](https://webaim.org/techniques/hypertext/)  
[10 minute conversation](https://www.swarthmore.edu/sites/default/files/assets/documents/human-resources/10_Minute_Conversation_Guide%5B1%5D.pdf) | How to have a [10 minute conversation [PDF](https://www.swarthmore.edu/sites/default/files/assets/documents/human-resources/10_Minute_Conversation_Guide%5B1%5D.pdf)]   
  
### 2.8.1 Linking to Another Webpage in Drupal

  1. Highlight the text you wish to become a link.
  2. Click the **Link** (chain) icon in the editor toolbar. This will open the Link Editor.



[![Screenshot showing the Link button in the Drupal editor toolbar.](https://kb.swarthmore.edu/images/f/f1/link1.png)](https://kb.swarthmore.edu/wiki/File:link1.png)

**Figure:** Select the Link button to create a new link.

### 2.8.2 How the Link Editor Works

  1. **Link URL** — Enter the URL or destination for the link.
  2. **Link to a Document** — Opens the document browser so you can select or upload a document stored in Drupal.
  3. **Advanced** — Expands additional options, including CSS Classes, ID, and **Open in a new window**.
  4. **Open in a new window** — Controls whether the link opens in a new browser tab. By default, links open in the current tab.
  5. **Save / Cancel** — Click the checkmark to save your changes or the **X** to cancel.



Tip

It is recommended that links to external websites (outside of swarthmore.edu) and documents open in a new browser tab.

  


[![Screenshot of the Drupal Link Editor showing the Link URL field and advanced options.](https://kb.swarthmore.edu/images/2/21/link_editor1.png)](https://kb.swarthmore.edu/wiki/File:link_editor1.png)

**Figure:** The Link Editor is used to create and edit links.

### 2.8.3 Creating a Link to Another Page in Drupal

  1. Start typing the name of the webpage you wish to link to. For example, if you wanted to link to the **Admissions & Aid** homepage, you would type **Admissions**. Drupal will display pages whose titles match your search.
  2. Select the webpage you wish to link to.



[![Screenshot showing Drupal's page search while creating an internal link.](https://kb.swarthmore.edu/images/5/54/link_to_drupal_page.png)](https://kb.swarthmore.edu/wiki/File:link_to_drupal_page.png)

**Figure:** Search for and select another Drupal page.

  1. After selecting the page, the Link Editor will return to its minimized view. In place of the page title, you'll see a reference similar to `/node/######`. This is normal and is how Drupal keeps track of internal links.
  2. Click the checkmark to save your changes or the **X** to cancel.



[![Screenshot showing the node reference after selecting an internal page.](https://kb.swarthmore.edu/images/3/36/node_speak1.png)](https://kb.swarthmore.edu/wiki/File:node_speak1.png)

**Figure:** Drupal stores internal links using node references.

### 2.8.4 Creating a Link Using a URL

  1. You can also copy and paste any URL directly into the **Link URL** field. This includes external websites, internal URLs, Google Drive links, and other valid web addresses.



[![Screenshot showing the Link URL field in the Drupal Link Editor.](https://kb.swarthmore.edu/images/3/39/link_url1.png)](https://kb.swarthmore.edu/wiki/File:link_url1.png)

**Figure:** Paste a URL directly into the Link URL field.

Tip

It is recommended that links to external websites (outside of swarthmore.edu) and documents open in a new browser tab. 

[![Screenshot showing the Open in New Window option in the Link Editor.](https://kb.swarthmore.edu/images/2/2b/link_open_new_win.png)](https://kb.swarthmore.edu/wiki/File:link_open_new_win.png)

**Figure:** Enable **Open in New Window** under the Advanced options.

  


### 2.8.5 Linking to a Document

  1. Highlight the text you wish to become a link. Always include the file type in the link text so visitors know they are opening a document (for example, `[PDF]`).



[![Screenshot showing how to begin creating a document link.](https://kb.swarthmore.edu/images/5/5d/link_doc1.png)](https://kb.swarthmore.edu/wiki/File:link_doc1.png)

**Figure:** Select the text that will become the document link.

  1. Click the **Link to a Document** button to upload a new document or select one that has already been uploaded to Drupal.
  2. It is recommended that PDFs (and other documents) open in a new browser tab. This setting is available under the **Advanced** options.
  3. Enable **Open in a new window** if appropriate.



[![Screenshot showing the Link to Document button in the Link Editor.](https://kb.swarthmore.edu/images/d/dd/link_doc2.png)](https://kb.swarthmore.edu/wiki/File:link_doc2.png)

**Figure:** Select **Link to a Document** to choose or upload a document.

#### How the "Link to Document" Dialog Works

Clicking the **Link to a Document** button opens a window where you can upload a new document or select one that has already been uploaded to Drupal. 

  1. **Select Document** — Displays documents that have already been uploaded.
  2. **Upload Document** — Uploads a new document.
  3. **Filename** — Searches the document library by filename.
  4. **Name** — Sorts documents alphabetically.
  5. **Created** — Sorts documents by upload date.
  6. **Radio Button** — Selects the document you wish to link to.
  7. **Select Document** — Saves your selection and returns you to the Link Editor.



[![Screenshot of the Link to Document dialog showing document selection and upload options.](https://kb.swarthmore.edu/images/e/ea/link_select_docuement.png)](https://kb.swarthmore.edu/wiki/File:link_select_docuement.png)

**Figure:** The Link to Document dialog allows you to upload or select a document.

#### Once the Document Is Selected

  1. The name of the selected document will appear in the **Link URL** field.
  2. Click the green checkmark to create the link.



[![Screenshot showing the selected document before saving the link.](https://kb.swarthmore.edu/images/e/ee/link_doc_save1.png)](https://kb.swarthmore.edu/wiki/File:link_doc_save1.png)

**Figure:** Save the document link by clicking the checkmark.

### 2.8.6 Edit or Remove a Link

  1. Click an existing link to open the Link Editor.
  2. Select the pencil icon to edit the link.
  3. Select the broken chain icon to remove the link while leaving the text in place.



[![Screenshot showing the Edit Link and Remove Link options.](https://kb.swarthmore.edu/images/9/99/edit_delete_link.png)](https://kb.swarthmore.edu/wiki/File:edit_delete_link.png)

**Figure:** Edit or remove an existing link.

## 2.9 Special Characters

The **Special Characters** tool allows you to insert characters that are not available on a standard keyboard, such as accented letters, mathematical symbols, currency symbols, and punctuation marks. This is most commonly used when entering foreign words, names, or other specialized characters. 

[![Screenshot of the Special Characters dialog in the Drupal editor.](https://kb.swarthmore.edu/images/b/b4/Screenshot_2024-08-01_at_4.38.30_PM.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_2024-08-01_at_4.38.30_PM.png)

**Figure:** The Special Characters dialog lets you insert symbols and accented characters into your content.

## 2.10 Find & Replace

Allows you to do a standard find and replace in the body content block. 

## 2.11 Tables

Use the **Table** tool to add tabular data to a webpage. Tables should be used to present data that naturally belongs in rows and columns, such as schedules, pricing information, or comparison charts. Avoid using tables to control the layout or appearance of a webpage. 

  1. Select the desired number of rows and columns using the table matrix. Remember to include a row or column for table headings. See [WebAIM's article on accessible tables](https://webaim.org/techniques/tables/data) to learn more.



[![Screenshot showing the table size selection matrix in the Drupal editor.](https://kb.swarthmore.edu/images/e/e6/table3.png)](https://kb.swarthmore.edu/wiki/File:table3.png)

**Figure:** Select the number of rows and columns for your table.

  1. Add your row and/or column headings.
  2. Enter your table data.



[![Screenshot showing a table being edited in the Drupal editor.](https://kb.swarthmore.edu/images/c/c6/table2.png)](https://kb.swarthmore.edu/wiki/File:table2.png)

**Figure:** Enter your headings and data into the table.

Accessible Tables

Every table should include a **caption** and appropriate **row or column headings**. These elements help all visitors understand the purpose of the table and are especially important for people using assistive technologies. 

Tables should be used to present data—not to control page layout. To learn more, see [WebAIM's article on accessible tables](https://webaim.org/techniques/tables/data). 

  


## 2.12 Add Image

Visit 6.2) [Adding an Image in the Body Copy](https://kb.swarthmore.edu/wiki/Images#6.2\)-Adding-an-Image-in-the-Body-Copy "Images") to learn more about adding an image to the body copy 

## 2.13 Upload Image

Allows you upload images directly to Drupal. 

## 2.14 HTML Source

Clicking the **HTML Source** button will display the underlying HTML responsible for rendering the text formatting, links, images, and other elements that appear on the page. Editors who are comfortable working with HTML may find this functionality useful for troubleshooting, however it is not necessary for the general editing of content. 

## 2.15 Full Screen

The **Full Screen** button will maximize the Copy Editor to take up the full browser window. This can be useful when working with a large amount of content or as a means of cutting down on distraction during the writing process. 

Click the button a second time in order to minimize the Copy Editor, returning it to its original size.
