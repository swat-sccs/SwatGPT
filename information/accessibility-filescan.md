---
title: "Accessibility Filescan"
source: https://kb.swarthmore.edu/wiki/Accessibility_Filescan
pageid: 507
categories:
  - Moodle Fundamentals
  - Accessibility
  - Moodle Basics
---

# Accessibility Filescan

The Accessibility Filescan block was developed to help determine how friendly course PDFs are to assistive technology such as Read&Write, Kurzweil, screen readers, and other tools students might use to help them consume course readings. 

To access the Accessibility Filescan block (and all other blocks), open the "block drawer" on the right of your Moodle course. Please see [Moodle Blocks](https://kb.swarthmore.edu/wiki/Moodle_Blocks "Moodle Blocks") for more thorough information. 

[![Moodle block drawer location, which is an arrow button on the right side of the screen in a Moodle course.](https://kb.swarthmore.edu/images/7/70/Moodle_block_drawer_location.png)](https://kb.swarthmore.edu/wiki/File:Moodle_block_drawer_location.png)

The Accessibility Filescan provides a summary report on files in the course. Click the **Details** button to get more information. 

[![The Accessibility Filescan block displays a pie chart showing the percentage of PDFs that satisfy all checks, some checks, and no checks. There is a Details button and a "last scanned" status below it.](https://kb.swarthmore.edu/images/4/47/accessibility_filescan_block.png)](https://kb.swarthmore.edu/wiki/File:accessibility_filescan_block.png)

The Accessibility Filescan tool checks the accessibility of PDFs in a Moodle class and provides a report on the accessibility of each file. The status is either **Satisfies all checks** , **Satisfies some checks** , or **Satisfies no checks**. A PDF **fails** if it does not pass any of the checks. A file is marked as **check** if the file passes at least one check but does not meet all checks. A PDF **passes** if it meets all the accessibility checks. 

## Contents

  * 1 What the Tool Checks For
    * 1.1 Language
    * 1.2 Text
    * 1.3 Title
    * 1.4 Tagged
  * 2 Symbols
  * 3 How to Fix PDFs
    * 3.1 Check with the Library
    * 3.2 Converting to Text
    * 3.3 Setting PDF Title, Language, and Outline
  * 4 Additional Resources



## What the Tool Checks For

[![Accessibility of Course PDFs details table with a button to download to CSV. File names are listed in one column, followed by four columns with checkmarks or x's indicating whether the files pass the categories Language, Text, Title, and Tagged. A final column displays the PDFs' page counts.](https://kb.swarthmore.edu/images/3/30/accessibility_filescan_table.png)](https://kb.swarthmore.edu/wiki/File:accessibility_filescan_table.png)

### Language

A PDF stores information about the language of the document. This is used by screen readers and other assistive devices to ensure proper pronunciation and is particularly important for documents that are in non-English languages. See [Changing the global language of an Adobe PDF](https://support.swarthmore.edu/a/solutions/articles/14000046898). 

### Text

If a PDF does not have selectable text, the file has been scanned as an image. This means that screen readers and other assistive devices will not be able to read the content unless steps are taken to convert the image to text. As of fall 2023, our goal is to strive for green checks under both the "Text" and the "Tagged" columns on all documents (except where files are legitimate images, not images of text). 

### Title

A PDF stores metadata about the document, including the title of the document. This is different than the file name. Having a clear and accurate title helps assure users that they are reading the correct document. It also helps with findability. If the title is missing from the metadata fields, the PDF will fail this test. See [Changing the title of an Adobe PDF](https://support.swarthmore.edu/a/solutions/articles/14000049660). 

### Tagged

Creating structure in a PDF allows screen readers to easily navigate a document. 

For instance, if every section of a document is tagged, a user can quickly jump from one section to the next. Imagine someone looking at a syllabus who could visually scan the document for the section on grading; someone using a screen reader could do the same audibly if the sections are marked correctly. 

Documents created in a word processor (Word, Google Docs, Pages) can create structure using the [built-in heading styles](https://kb.swarthmore.edu/wiki/%22Fast_Five%22_Essentials_to_Preparing_Materials#In-program_Styles ""Fast Five" Essentials to Preparing Materials") (e.g., Heading 1, Heading 2). That structure will be saved in the native document format or by saving as a tagged PDF. PDFs created from a scanned document usually do not have outlines because the scanner cannot distinguish between chapters or sections within a document. It can be complex to tag PDFs, and we suggest contacting the [accessibility team](mailto:accessibility@swarthmore.edu) if you need help. 

As of fall 2023, our goal is to strive for green checks under both the "Text" and the "Tagged" columns on all documents (except where files are legitimate images, not images of text). 

## Symbols

The following symbols are used to display the result of the Accessibility Filescan. 

[![Green check mark](https://kb.swarthmore.edu/images/a/a1/green_check.png)](https://kb.swarthmore.edu/wiki/File:green_check.png)A green check means the test **passed**. 

[![Red X symbol](https://kb.swarthmore.edu/images/f/f6/red_x.png)](https://kb.swarthmore.edu/wiki/File:red_x.png)A red X means the test **failed**. 

## How to Fix PDFs

### Check with the Library

Before fixing a document, check with the Library to see if they have the document in an accessible electronic format. This can save a lot of time. 

### Converting to Text

OCR, or Optical Character Recognition, is a technology that enables you to convert different types of documents—such as scanned paper documents, PDF files, or images captured by a digital camera—into editable and searchable data. Copiers installed by ITS at Swarthmore default using to OCR. 

However, if you need to execute OCR, you can use [Adobe Acrobat Pro](https://kb.swarthmore.edu/wiki/Adobe_Acrobat_%26_Creative_Cloud "Adobe Acrobat & Creative Cloud") to convert the material. 

  1. Open the document in Adobe Acrobat Pro.
  2. Open the Tools tab.
  3. Select Scan & OCR.
  4. Select Recognize Text.
  5. Choose the relevant settings, such as language.
  6. Click on the Recognize Text button.



For more details, explore Adobe's article [How to scan and get text from an image with OCR](https://www.adobe.com/acrobat/hub/use-ocr-to-read-text-from-image.html). 

You can also upload your file to Robobraille's [Alternate media made easy](https://www.robobraille.org/web3/swarthmore/) tool. Multiple documents can be converted at once. You will receive the converted document(s) via email within a few hours. 

To check whether your scan was OCRed, try copying some text from the document and pasting it into Word. If you can successfully paste the text you copied, your document has been OCRed, but you should check a few things: 

  * If there isn't any text in the document, [open a ticket with the help desk](https://support.swarthmore.edu/) explaining that the Canon copier you used is not OCRing documents.
  * How accurate is the text? If there are significant errors with the accuracy or the reading order, please [open a ticket with the help desk](https://support.swarthmore.edu/) and flag the document for the accessibility team.



### Setting PDF Title, Language, and Outline

The title, language, and outline can often be fixed by using [Acrobat Pro's](https://kb.swarthmore.edu/wiki/Adobe_Acrobat_%26_Creative_Cloud "Adobe Acrobat & Creative Cloud") Make Accessible guided action. Go to All tools > Use guided actions (click on "View more" at the bottom if you don't see it) > Make Accessible. 

[![Adobe Acrobat highlighting location of the guided actions tool.](https://kb.swarthmore.edu/images/f/f6/Use_guided_actions_tool_Acrobat.png)](https://kb.swarthmore.edu/wiki/File:Use_guided_actions_tool_Acrobat.png) [!["Make Accessible" action highlighted at the top of the Use guided actions list in a PDF editing tool](https://kb.swarthmore.edu/images/5/56/Make_Accessible_guided_action_Acrobat.png)](https://kb.swarthmore.edu/wiki/File:Make_Accessible_guided_action_Acrobat.png)

  


## Additional Resources

If you'd like to learn more about accessibility, check out these [posts on the ITS blog](https://blogs.swarthmore.edu/its/category/accessibility/). 

Below are a few informative videos about the major screen readers: 

  * [VoiceOver [video]](https://youtu.be/5R-6WvAihms?feature=shared): Native screen reader for macOS and iOS
  * [NVDA [video]](https://youtu.be/Jao3s_CwdRU?feature=shared): Stands for Non-Visual Desktop Access; only works on Windows
  * [JAWS [video]](https://youtu.be/aQzT_mHRGjk?feature=shared): Stands for Job Access With Speech; only works on Windows; is the most robust
