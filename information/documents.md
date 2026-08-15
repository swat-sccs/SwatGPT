---
title: "Documents"
source: https://kb.swarthmore.edu/wiki/Documents
pageid: 881
categories:
  - Drupal
---

# Documents

[← Return to the Drupal User Guide](https://kb.swarthmore.edu/wiki/Drupal_Home "Drupal Home")

This section explains how to upload, manage, and link to documents on your website. 

Recommended File Format

Whenever possible, use the **PDF** format when publishing documents to the website. Other file types, such as **.docx** , **.pptx** , and **.xlsx** , are supported, but regardless of the format you choose, all documents must be accessible. See [Creating Accessible Documents](https://kb.swarthmore.edu/wiki/Creating_Accessible_Documents "Creating Accessible Documents") for accessibility guidance and best practices.

  


## Contents

  * 1 7.1 PDFs vs. Web Pages
    * 1.1 When should your content be a PDF?
  * 2 7.2 Accessibility Requirements
  * 3 7.3 Hosting Options
  * 4 7.4 Uploading a Document to Drupal
  * 5 7.5 Uploading a Document to Google Drive



## 7.1 PDFs vs. Web Pages

Before You Upload a PDF

Before adding a PDF to your website, consider whether the content would be better presented as a webpage instead.

  
While converting a Google Doc or Microsoft Word document to a PDF can be a convenient way to share information online, it is not always the best option for several reasons: 

  1. PDFs often present major accessibility issues. [Microsoft has a built-in tool](https://kb.swarthmore.edu/wiki/Use_Microsoft%27s_Accessibility_Checkers "Use Microsoft's Accessibility Checkers") for all its products. For the Google Workspace suite, everyone on campus has access to [Grackle](https://blogs.swarthmore.edu/its/2019/03/18/grackle-making-google-documents-accessible/). **Very Important:** Departments that publish PDFs online are responsible for ensuring the files meet all of Swarthmore's accessibility standards. Inaccessible PDFs are subject to removal.
  2. PDFs are harder to update than HTML pages. Updating a PDF requires fixing the original source document, rerunning accessibility checks, uploading a new version, and updating any links that reference it. Updating a webpage avoids these additional steps.
  3. Older PDFs often continue to appear in search engine results even after they have been removed from a website. This can result in visitors accessing outdated information. A webpage, by contrast, typically presents only the current version.



To learn more about creating accessible PDFs with Google Workspace and Microsoft Office, see [Creating PDFs](https://kb.swarthmore.edu/wiki/Creating_PDFs "Creating PDFs"). 

### When should your content be a PDF?

Rarely is the simple answer. There is one situation where a PDF may be the better choice: 

  * Does the document require highly precise formatting that must be preserved for printing or distribution? If so, a PDF may be appropriate. **Important:** Even in this case, the PDF must still be fully accessible.



Otherwise, publishing the content as a webpage is usually the better option. 

## 7.2 Accessibility Requirements

All documents hosted on [Swarthmore.edu](https://www.swarthmore.edu) must comply with the College's [ICT Accessibility Policy](https://www.swarthmore.edu/accessibility/ict-accessibility-policy). Departments are responsible for ensuring that **all** documents shared online are accessible. 

Our [Creating PDFs](https://kb.swarthmore.edu/wiki/Creating_PDFs "Creating PDFs") guide provides step-by-step instructions for creating accessible documents. If you need assistance or encounter problems, please [submit a support request](https://support.swarthmore.edu/support/tickets/new) and request an accessibility consultation. 

Department Responsibility

Correcting accessibility issues is the responsibility of the department that published the document. Documents that do not meet the College's accessibility requirements are subject to removal.

  


## 7.3 Hosting Options

When hosting PDFs online, you have two primary options: **Drupal** or **Google Drive**. Each has advantages and disadvantages depending on your department's needs. 

  * **Drupal** — PDFs can be uploaded directly into Drupal. 
    * **Pros:** Quick and easy to use. Documents can be indexed by search engines and appear in search results.
    * **Cons:** Drupal provides only a single document library. Creating subfolders is not supported, and there are no document-level permission settings.



File Organization

Because all Drupal documents are stored in a single document library, it is important to use clear, consistent file names. Following good file naming practices will make documents much easier to locate and manage over time.

  


  * **Google Drive** — Documents can also be uploaded to your department's Google Drive folder. Every department has a Google Drive folder managed by ITS that can be used to share documents on your website. 
    * **Pros:** Supports nested folders for organization and provides robust sharing and permission controls. For example, you can restrict a document so that it is available only to members of the Swarthmore community.
    * **Cons:** Requires signing into Google Drive, uploading the document, and creating a share link before it can be added to your website.



## 7.4 Uploading a Document to Drupal

1\. Highlight the text that should become a link to the document. Be sure to include the file type by appending `[PDF]` to the end of the link text. This lets visitors know they are opening a document rather than another webpage. 

2\. Click the **Link** icon in the editor toolbar, or press `Command` \+ `K` (Mac). 

[![Screenshot showing the Link button in the Drupal editor toolbar.](https://kb.swarthmore.edu/images/2/24/doc1.png)](https://kb.swarthmore.edu/wiki/File:doc1.png)

**Figure:** Select the text and click the Link button.

3\. The link dialog will appear next to the selected text. Click the **Link to a Document** button. 

[![Screenshot showing the Link to a Document button in the link dialog.](https://kb.swarthmore.edu/images/3/38/doc2.png)](https://kb.swarthmore.edu/wiki/File:doc2.png)

**Figure:** Select **Link to a Document** to browse or upload files.

4\. The **Link to a Document** window will open. Choose either: 

  * **Upload Document** to upload a new file.
  * **Select Document** to choose a document that has already been uploaded.



5\. Select the appropriate document using the radio button to the left. 

6\. Click **Select Document**. 

[![Screenshot of the Link to a Document dialog showing the document library.](https://kb.swarthmore.edu/images/7/7e/doc3.png)](https://kb.swarthmore.edu/wiki/File:doc3.png)

**Figure:** Select an existing document or upload a new one.

You will be returned to the previous dialog. 

7\. Expand the **Advanced** section. 

8\. Toggle **Open in new window** so it is enabled (green). 

9\. Click the green checkmark to save the link. 

[![Screenshot showing the Advanced options with Open in new window enabled.](https://kb.swarthmore.edu/images/6/6f/doc4.png)](https://kb.swarthmore.edu/wiki/File:doc4.png)

**Figure:** Enable **Open in new window** before saving the link.

  1. The selected text will now appear as a link.
  2. Save the page as either **Draft** or **Published** , then verify that the link works.



[![Screenshot showing the completed document link in the editor.](https://kb.swarthmore.edu/images/3/39/doc5.png)](https://kb.swarthmore.edu/wiki/File:doc5.png)

**Figure:** Save the page before testing the link.

Testing Document Links

You cannot test a document link directly from within the editor. Clicking the link while editing will reopen the link editor instead. Save the page first (as either **Draft** or **Published**) and then test the link from the rendered webpage. 

[![Screenshot showing the link editing interface that appears when clicking a link inside the editor.](https://kb.swarthmore.edu/images/7/7c/doc6.png)](https://kb.swarthmore.edu/wiki/File:doc6.png)

**Figure:** Links clicked while editing will open the link editor instead of the document.

  


## 7.5 Uploading a Document to Google Drive

To learn more about sharing files from Google Drive, see [Sharing a File from Google Drive](https://kb.swarthmore.edu/wiki/Sharing_a_File_from_Google_Drive "Sharing a File from Google Drive"). 

1\. After uploading your document to Google Drive and creating a share link, highlight the text that should become the link. Be sure to include the file type by appending `[PDF]` to the end of the link text. This lets visitors know they are opening a document rather than another webpage. 

2\. Click the **Link** icon in the editor toolbar. 

[![Screenshot showing the Link button in the Drupal editor toolbar.](https://kb.swarthmore.edu/images/0/0c/f325a97e-9000-4038-b2c4-bca4aff0bdb5.png)](https://kb.swarthmore.edu/wiki/File:f325a97e-9000-4038-b2c4-bca4aff0bdb5.png)

**Figure:** Select the text and click the Link button.

3\. The link dialog will appear next to the selected text. Paste the Google Drive share link into the **Link URL** field. 

[![Screenshot showing the Link URL field in the Drupal link editor.](https://kb.swarthmore.edu/images/f/f7/google_link_url.png)](https://kb.swarthmore.edu/wiki/File:google_link_url.png)

**Figure:** Paste the Google Drive share link into the Link URL field.

  1. Expand the **Advanced** section.
  2. Enable the **Open in new window** toggle so it is active (green). This will cause the document to open in a new browser tab.
  3. Click the green checkmark to save the link.
