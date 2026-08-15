---
title: "Make PDFs Accessible to More Students (Fundamentals)"
source: https://kb.swarthmore.edu/wiki/Make_PDFs_Accessible_to_More_Students_%28Fundamentals%29
pageid: 1703
categories:
  - Accessibility
  - Adobe
---

# Make PDFs Accessible to More Students (Fundamentals)

Making PDFs accessible can be difficult, but taking a few easy steps will open up your content to many more users. 

This article can help with everyday content. If your PDFs are more complex, we strongly recommend the LinkedIn Learning course [Creating Accessible PDFs](https://www.linkedin.com/learning-login/share?account=76206914&forceAccount=false&redirect=https%3A%2F%2Fwww.linkedin.com%2Flearning%2Fcreating-accessible-pdfs-14445392%3Ftrk%3Dshare_ent_url%26shareId%3DHvzg7T0LSU6vXQvq%252BreGiA%253D%253D) by Chad Chelius. [LinkedIn Learning](http://linkedin.swarthmore.edu/) is a free resource available to everyone at Swarthmore. 

## Contents

  * 1 What Makes a PDF Accessible?
  * 2 Before You Begin
    * 2.1 Accessible PDFs Start with Accessible Source Files
  * 3 The “Make Accessible” Guided Action
  * 4 Take Your Knowledge to the Next Level
  * 5 Resources to Learn More



## What Makes a PDF Accessible?

Getting a PDF to full WCAG accessibility compliance can be complex; there are technical specifics that require a bit of training to understand. However, PDFs with the following basic characteristics generally meet the majority of students’ needs, including many students with disabilities: 

  1. Searchable text—if you can copy and paste text from the PDF into another document, the PDF has real text and is not an image of text
  2. Structure—tags for paragraphs, headings, images, and other elements
  3. Alt text—meaningful text descriptions for all images that are not decorative
  4. [A metadata title](https://support.swarthmore.edu/a/solutions/articles/14000049660)
  5. The [document’s language](https://support.swarthmore.edu/a/solutions/articles/14000046898) identified in the metadata



Fortunately, these steps can be easily accomplished with one tool in [Adobe Acrobat](https://kb.swarthmore.edu/wiki/Adobe_Acrobat_%26_Creative_Cloud "Adobe Acrobat & Creative Cloud"). 

## Before You Begin

### Accessible PDFs Start with Accessible Source Files

The best way to improve the accessibility of a PDF is to first make its source file as accessible as you can by using [accessibility checkers](https://kb.swarthmore.edu/wiki/%22Fast_Five%22_Essentials_to_Preparing_Materials#In-program_Accessibility_Checkers) and following [guidance on creating good scans](https://www.washington.edu/accesstech/documents/scans/). See [Accessible Alternatives to PDF (option 2)](https://kb.swarthmore.edu/wiki/Accessible_Alternatives_to_PDF#Option_2:_Creating_Your_Own_Document?_Start_with_an_Accessible_Source_File) for more details. 

## The “Make Accessible” Guided Action

The tool we have found to be most helpful and efficient is the **Make Accessible** guided action in Acrobat. Depending on the number of pages and images, it should only take a few minutes to complete the guided action. The following instructions explain what to do at each step. 

  1. **Open** the PDF in Acrobat.
  2. In the **Search** bar (accessed from the magnifying glass), start typing “**use** ,” then click on the auto-suggestion **Use guided actions**.  
OR  
In the upper left corner, click on **All tools** , then **View more** at the bottom of the list. Scroll down to **Use guided actions** (or Action Wizard for older versions of Acrobat).  
[![A PDF open in Adobe Acrobat, with arrows pointing to the locations indicated in the text instructions.](https://kb.swarthmore.edu/images/8/8e/Finding_Guided_Actions_in_Acrobat.png)](https://kb.swarthmore.edu/wiki/File:Finding_Guided_Actions_in_Acrobat.png)
  3. Click on the **Make Accessible** option, then **Start**. A series of dialog box prompts will guide you. 
     1. _Add Document Description:_ Add a brief but descriptive document title to the **Title** field (you may need to uncheck **Leave As Is** first). This title will appear at the top of the Acrobat window and will be read by assistive technology.  
[![A PDF in Acrobat with a dialog box called "Description." The "Title" field has the name of the article: "Using a Person-Situation Approach to Market Segmentation."](https://kb.swarthmore.edu/images/3/3f/Add_Document_Description.png)](https://kb.swarthmore.edu/wiki/File:Add_Document_Description.png)
     2. _Set Open Options:_ Acrobat handles this automatically; no dialog box will pop up.
     3. _Recognize Text:_ From the Output dropdown menu, select **Editable Text and Images** and click **OK**. Acrobat may take a few minutes to process the document.
     4. _Detect Form Fields:_ Click **No, Skip this Step**.
     5. _Set Tab Order Property:_ Acrobat handles this automatically; no dialog box will pop up.
     6. _Set Reading Language:_ Select the **primary language** in which a screen reader should read the document.
     7. _Autotag Document:_ Acrobat handles this automatically; no dialog box will pop up, but a status bar will appear in the bottom corner. It may take a few minutes to process.
     8. _Set Alternate Text:_ Acrobat will detect possible images and provide a field for you to write a meaningful description, known as alt text, for each one or mark it as decorative. Click the arrows to navigate between the auto-detected images, and be sure to click **Save & Close** when you’re done! If you accidentally click Save & Close too soon, you can still add alt text later.[![The Set Alternate Text dialog box. It says "Image 1 of 5" and has left and right arrows to navigate between images. There is a field to write alternate text and a check box that says "Decorative figure."](https://kb.swarthmore.edu/images/d/d9/Set_Alternate_Text_Dialog_Box.png)](https://kb.swarthmore.edu/wiki/File:Set_Alternate_Text_Dialog_Box.png)
     9. _Run Accessibility Full Check:_ Please note there are limitations to Acrobat’s accessibility checker. You may find the interface can be confusing, and it does not check issues against a specific standard, such as WCAG 2.1. That said, using Acrobat’s accessibility checker can be useful in flagging issues that can often be corrected by going back to the source document.  
  
If you are on a Windows machine, you can install [PAC](https://pac.pdf-accessibility.org/en/download). It is currently the industry-standard PDF Accessibility Checker (hence PAC), but please note that it also checks for issues beyond the scope of this article.



Your PDF is now on its way to helping more learners access its information, including students with disabilities. Great work! 

## Take Your Knowledge to the Next Level

Students who rely on assistive technology to read and navigate digital content may require a more advanced level of PDF accessibility. To learn how to create document structure, logical reading order, meaningful hyperlinks, accessible forms, and more in PDF, see the LinkedIn Learning course [Creating Accessible PDFs](https://www.linkedin.com/learning-login/share?account=76206914&forceAccount=false&redirect=https%3A%2F%2Fwww.linkedin.com%2Flearning%2Fcreating-accessible-pdfs-14445392%3Ftrk%3Dshare_ent_url%26shareId%3DHvzg7T0LSU6vXQvq%252BreGiA%253D%253D) by Chad Chelius. 

## Resources to Learn More

  * [Creating Accessible PDFs (LinkedIn Learning)](https://www.linkedin.com/learning-login/share?account=76206914&forceAccount=false&redirect=https%3A%2F%2Fwww.linkedin.com%2Flearning%2Fcreating-accessible-pdfs-14445392%3Ftrk%3Dshare_ent_url%26shareId%3DHvzg7T0LSU6vXQvq%252BreGiA%253D%253D)
  * [Digital Accessibility for PDFs (Clemson University)](https://www.clemson.edu/accessibility/digital/guides/pdf/)
  * [Changing the Title of an Adobe PDF (Swarthmore Solutions)](https://support.swarthmore.edu/a/solutions/articles/14000049660)
  * [Changing the Global Language of an Adobe PDF (Swarthmore Solutions)](https://support.swarthmore.edu/a/solutions/articles/14000046898)
  * [Converting Documents to PDF (WebAIM)](https://webaim.org/techniques/acrobat/converting)
  * [Create Accessible PDFs (Microsoft)](https://support.microsoft.com/en-us/office/create-accessible-pdfs-064625e0-56ea-4e16-ad71-3aa33bb4b7ed)
  * [Universal Accessibility (PDF/UA) (LibreOffice)](https://help.libreoffice.org/latest/en-US/text/shared/01/ref_pdf_export_universal_accessibility.html)
  * [Going through the Make Accessible Wizard in Acrobat Pro DC (YouTube)](https://youtu.be/5w8A77Vdwqc) (Note: After this video walkthrough was made, Adobe updated “Action Wizard” to be called “Guided Actions,” but the steps are the same.)
  * [Create and Verify PDF Accessibility (Adobe)](https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html)
  * [Creating Accessible PDFs (Adobe)](https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html)
  * [PDF Techniques (WCAG)](https://www.w3.org/WAI/WCAG21/Techniques/#pdf)
