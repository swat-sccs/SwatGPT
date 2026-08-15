---
title: "'Fast Five' Essentials to Preparing Materials"
source: https://kb.swarthmore.edu/wiki/%22Fast_Five%22_Essentials_to_Preparing_Materials
pageid: 344
categories:
  - Accessibility
  - Google Workspace
---

# "Fast Five" Essentials to Preparing Materials

Swarthmore employees and students can take advantage of these tools in order to create materials that all can use to work and learn with confidence. 

## Contents

  * 1 In-program Styles
    * 1.1 Apple
    * 1.2 Google
    * 1.3 HTML
    * 1.4 LaTeX
    * 1.5 Markdown
    * 1.6 Microsoft
    * 1.7 Moodle
      * 1.7.1 Atto Editor
      * 1.7.2 TinyMCE Editor
  * 2 Convey Meaning with Words
    * 2.1 Links
    * 2.2 Color
    * 2.3 Alt Text, Captions, Image Descriptions, etc.
  * 3 In-program Accessibility Checkers
    * 3.1 Adobe Accessibility Checker
    * 3.2 Google
    * 3.3 LibreOffice
    * 3.4 Microsoft Office: How to use Accessibility Review KB article
    * 3.5 **Moodle**
      * 3.5.1 **Atto Editor**
  * 4 Captioning
    * 4.1 Google Slides
    * 4.2 Microsoft Office 365 PowerPoint
    * 4.3 Panopto
    * 4.4 YouTube
    * 4.5 Zoom
  * 5 Setting a Language
    * 5.1 Apple Pages
    * 5.2 Adobe Acrobat
    * 5.3 Microsoft Office | Add an editing or authoring language or set language preferences in Office
    * 5.4 Google Docs | Translate documents or write in a different language
    * 5.5 HTML
  * 6 Additional Resources



## In-program Styles

**Use in-program styles to create structure**

Using appropriate headings in the appropriate order in your current program is necessary. They add structure and create consistency in documents and allow screen readers to easily—audibly—scan the information. Additionally, authors can easily create such things as a [Table of Contents](https://support.microsoft.com/en-us/office/insert-a-table-of-contents-882e8564-0edb-435e-84b5-1d8552ccf0c0) or [view an Outline](https://support.microsoft.com/en-us/office/use-the-navigation-pane-in-word-394787be-bca7-459b-894e-3f8511515e55). 

### Apple

  * Apple's article: [Create accessible documents, spreadsheets, or presentations with Pages, Numbers, or Keynote](https://support.apple.com/en-us/HT210563).
  * Toronto Metropolitan University Pressbooks: [Technique 5: Use Headings](https://pressbooks.library.torontomu.ca/docs/chapter/pages-for-mac/#Technique_5_Use_Headings).
  * London College of Communication Teaching Hub: [Create accessible documents using Apple Pages and Keynote](https://lccteaching.myblog.arts.ac.uk/create-accessible-documents-using-apple-pages-and-keynote/).
  * [Intro to paragraph styles in Pages | Mac help](https://support.apple.com/guide/pages/intro-to-paragraph-styles-tanaa39b0aa3/mac).



### Google

  * [Docs](https://support.google.com/docs/answer/116338?hl=en-GB&ref_topic=1361461)
    * Our KB article: [Change the Look of Headings and Paragraphs in Google Docs](https://kb.swarthmore.edu/wiki/Change_the_Look_of_Headings_and_Paragraphs_in_Google_Docs "Change the Look of Headings and Paragraphs in Google Docs")
    * Google's Support page: [Add a title, heading, or table of contents to a document](https://support.google.com/docs/answer/116338?hl=en&ref_topic=1361461)


  * [Sheets](https://support.google.com/docs/answer/46973?hl=en&ref_topic=1361470)
  * [Sites](https://support.google.com/sites/answer/7529116?hl=en&ref_topic=7184581&sjid=13385373985229223832-NA)
  * [Slides](https://support.google.com/docs/answer/1705254?hl=en&ref_topic=19434)



### HTML

In HTML, titles should exist within the `<title>` tag. There should only be one, and it should also be somehow related—and maybe even exactly the same—as the `<h1>` Use headings to establish structure. 

[Best Practices: Webpage Creation](https://kb.swarthmore.edu/wiki/Best_Practices:_Webpage_Creation "Best Practices: Webpage Creation")

### LaTeX

In LaTeX, title is again metadata. Insert the title in the preamble metadata: `\title{_}`. 

Styles that are important to structure in a LaTeX file are: 

  * Insert sections in document body:` \section{_}`, `\subsection{_}`, etc.
  * Numbered lists in use: `\enumerate{_} \item \item ... \end{enumerate}`
  * Bulleted list use:` \itemize{_} \item \item ... \end{itemize}`



See also: 

  * [Lewis Forbes – LaTeX and Accessibility | University of Edinburgh student intern blog](https://blogs.ed.ac.uk/isintern/2023/08/15/lewis-forbes-latex-and-accessibility/)
  * [LaTeX to HTML via PANDOC | Dan W. Joyce](https://www.google.com/url?q=https://www.danwjoyce.com/data-blog/2018/2/20/latex-to-html-via-pandoc&sa=D&source=calendar&ust=1713881518206800&usg=AOvVaw3YyfyXv14fDNBY0tO5Umux)



### Markdown

In **Markdown** , your title exists after a singular hashtag, `# Title`. Hashtags give markdown structure. The relationship between Markdown and HTML shows us that `<h1>` and `<title>` are often the similar or the same. 

  * [Improving the accessibility of your markdown | Smashing Magazine](https://www.smashingmagazine.com/2021/09/improving-accessibility-of-markdown/)
  * [7.14 Improve accessibility of HTML pages | R Markdown Cookbook](https://bookdown.org/yihui/rmarkdown-cookbook/html-accessibility.html)



### Microsoft

  * [Excel](https://support.microsoft.com/en-us/office/make-your-excel-documents-accessible-to-people-with-disabilities-6cc05fc5-1314-48b5-8eb3-683e49b3e593)
  * [PowerPoint](https://support.microsoft.com/en-us/office/make-your-powerpoint-presentations-accessible-to-people-with-disabilities-6f7772b2-2f33-4bd2-8ca7-dae3b2b3ef25)
  * Word 
    * Our KB article: [Using Word's Style Gallery to Create Structure in Your Document](https://kb.swarthmore.edu/wiki/Using_Word%27s_Style_Gallery_to_Create_Structure_in_Your_Document "Using Word's Style Gallery to Create Structure in Your Document")
    * Microsoft's Support page: [Make your Word documents accessible to people with disabilities](https://support.microsoft.com/en-us/office/make-your-word-documents-accessible-to-people-with-disabilities-d9bf3683-87ac-47ea-b91a-78dcacb3c66d)
    * Our KB article: [Using Word's Properties to flow into a more accessible PDF](https://kb.swarthmore.edu/wiki/Using_Word%27s_Properties_to_flow_into_a_more_accessible_PDF "Using Word's Properties to flow into a more accessible PDF")



### Moodle

#### Atto Editor

  * Swarthmore ITS Blog post about using Atto for accessibility features: [Reach all users with Atto text editor in Moodle [Moodle accessibility, part 2](https://blogs.swarthmore.edu/its/2022/06/02/atto-text-editor-moodle-accessibility-part-2/)].
  * Moodle's [Atto Editor documentation](https://docs.moodle.org/402/en/Atto_editor).



#### [TinyMCE Editor](https://docs.moodle.org/402/en/TinyMCE_editor)

[Screen Reader Demo With Headings [YouTube]](https://youtu.be/0xAv1l04aJI?si=zDevmiYLH1okRUaz)

## Convey Meaning with Words

**How to use words to convey meaning**

### Links

When providing a link somewhere within your text, be sure to provide context. Screen readers provide users the opportunity to scroll through links, so links such as "click here" and "more" do not make sense to screen readers. You can see examples below: 

  * Deque University accessibility tips article: [Use link text that makes sense when read out of context](https://dequeuniversity.com/tips/link-text)
  * WebAIM's article: [Links and Hypertext: Link Text and Appearance](https://webaim.org/techniques/hypertext/link_text)



### Color

Sometimes the text needs to stand out. Ask a question as to how one might do that. Color is not read aloud, so consider also calling attention to important text with words. For instance: 

  * _**Important**_ : Paper due on April 15th. All late papers will be deducted one grade per day late.
  * **Note** : All applicants must sign on line 11 and line 15 in order to have their pay direct deposited.
  * Urgent: Pay attention to all directions before handing in this form.



When using color, always consider the contrast between the background and the text. Use [WebAIM's Contrast Checker](https://webaim.org/resources/contrastchecker/) or [Lea Verou's Contrast Ratio Checker](https://www.siegemedia.com/contrast-ratio) to ensure all users who have sight can see the information. 

### Alt Text, Captions, Image Descriptions, etc.

When someone is accessing material with a screen reader, they may not see an image. They will not know the content of an image unless there is some sort of descriptive text in the form of alternative text (commonly referred to as "alt text"), a caption, an image description, or other form of text that their screen reader has access to. Providing this is necessary for all users to understand the meaning of the material and why an image is being included. 

A best practice is to include a description somewhere in the text so that everyone can see it. This can be very difficult to do. Below are a few resources we have found to be useful: 

  * The World Wide Web Consortium (W3C) [Web Accessibility Initiative's (WAI) Images Tutorial](https://www.w3.org/WAI/tutorials/images/) singles out informative images, decorative images, functional images, images of text, complex images like graphs and diagrams, groups of images, and image maps.
  * WebAIM goes more in-depth about images in its [Accessible Images article](https://webaim.org/techniques/images/) but covers alt-text quite well in its [Alternative Text article](https://webaim.org/techniques/alttext/).
  * Bojana Coklyat and Shannon Finnegan developed [Alt Text as Poetry](https://alt-text-as-poetry.net/), a website and workshop dedicated to helping everyone understand how important alt-text is and also how to develop it. [From Shannon's website:](https://shannonfinnegan.com/alt-text-as-poetry)



> "This project reframes alt text as a type of poetry and creates opportunities to practice writing it." 

  * Benetech's [Diagram Center Poet Training Tool](https://poet.diagramcenter.org/index.html) teaches you when and how to describe images, and lets you practice.



## In-program Accessibility Checkers

**Use in-program accessibility checkers to find and fix**

### [Adobe Accessibility Checker](https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html)

See also: 

  * [Changing the title of an Adobe PDF | Swarthmore ITS Solutions](https://support.swarthmore.edu/a/solutions/articles/14000049660)
  * [Changing the global language of an Adobe PDF | Swarthmore ITS Solutions](https://support.swarthmore.edu/a/solutions/articles/14000046898)



### Google

  * [Install and run Grackle](https://bit.ly/GoogleAccessibilityChecker) for each program (Docs, Sheets, Slides, etc.)



### LibreOffice

  * Go to **Tools → Accessibility Check**.



### [Microsoft Office: How to use Accessibility Review KB article](https://kb.swarthmore.edu/wiki/Use_Microsoft%27s_Accessibility_Checkers "Use Microsoft's Accessibility Checkers")

  * Go to **Review → Check Accessibility**.



### **Moodle**

#### [**Atto Editor**](https://docs.moodle.org/402/en/Atto_editor#Accessibility_checker)

  1. **Expand** the editor's menu by clicking the down arrow, which is the first button on the left-hand side and top row of the editor. A screen tip will indicate "Show/hide advanced buttons."
  2. **Click on** the first item in the sixth section, which looks like a stick figure of a person in a circle.



[**TinyMCE Editor**](https://docs.moodle.org/402/en/TinyMCE_editor#Accessibility_checker)

Go to **Tools → Accessibility Checker** in the editor. 

## Captioning

**Ensure all videos have captions and transcripts. Ensure all audio has transcripts**

### [Google Slides](https://support.google.com/docs/answer/9109474?hl=en)

### [Microsoft Office 365 PowerPoint](https://support.microsoft.com/en-au/office/present-with-real-time-automatic-captions-or-subtitles-in-powerpoint-68d20e49-aec3-456a-939d-34a79e8ddd5f)

Please see our article on [installing and accessing Microsoft Office 365](https://kb.swarthmore.edu/wiki/Microsoft_Office_365 "Microsoft Office 365") if you have questions about the program itself. 

### [Panopto](https://kb.swarthmore.edu/wiki/Captioning_Videos_in_Panopto "Captioning Videos in Panopto")

### [YouTube](https://kb.swarthmore.edu/wiki/Auto-Captioning_Video_in_YouTube "Auto-Captioning Video in YouTube")

### [Zoom](https://kb.swarthmore.edu/wiki/Automated_Captioning_in_Zoom "Automated Captioning in Zoom")

## Setting a Language

**Setting your document or content language is an important indicator to all users**

Many programs in most operating systems (OS) follow the overall system settings for language. To view your system's settings: 

  * MacOS: [Change the language your Mac uses](https://support.apple.com/guide/mac-help/change-the-system-language-mh26684/mac)
  * Windows: [Manage the input and display language settings in Windows](https://support.microsoft.com/en-us/windows/manage-the-input-and-display-language-settings-in-windows-12a10cb4-8626-9b77-0ccb-5013e0c7c7a2)



### Apple Pages

  1. Choose **File** from the menu at the top of your screen.
  2. Select **Advanced**.
  3. Choose the**Language & Region**.
  4. In the dialog box that appears, first choose**Language**. 
     1. **Important Note:** According to the Apple support page on [_Change a document’s language and formatting_](https://support.apple.com/guide/pages/format-a-document-for-another-language-tan2a7f8e5ce/mac#:~:text=Change%20a%20document's%20language%20and%20formatting&text=Choose%20File%20%3E%20Advanced%20%3E%20Language%20%26,a%20language%20and%20a%20region.), changing the language of a document may reset the language and region of your computer. However, we have not experienced this. If you do discover this has happened, go to: 
        1. System Settings,
        2. Search for Language & Region,
        3. Change to your preferred language,
        4. and ensure it is set as the Primary.
  5. Choose**Region**.
  6. Choose**Okay**.



### Adobe Acrobat

  1. Navigate to [**Fix accessibility issues (Acrobat Pro)**](https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html#fix_accessibility_issues).
  2. Scroll down to **Document Language** or use **Ctrl+F** to find "Document Language."
  3. Follow the instructions to set document-wide language or the language of a part of a document, if it's different from the overall language of the document.



See also: [Changing the global language of an Adobe PDF | Swarthmore ITS Solutions](https://support.swarthmore.edu/a/solutions/articles/14000046898)

### [Microsoft Office | Add an editing or authoring language or set language preferences in Office](https://support.microsoft.com/en-us/office/add-an-editing-or-authoring-language-or-set-language-preferences-in-office-663d9d94-ca99-4a0d-973e-7c4a6b8a827d)

### [Google Docs | Translate documents or write in a different language](https://support.google.com/docs/answer/187189?hl=en)

### HTML

  * The World Wide Web Consortium's (W3C) [Declaring language in HTML article](https://www.w3.org/International/questions/qa-html-language-declarations).
  * [W3Schools' Language Code Reference](https://www.w3schools.com/tags/ref_language_codes.asp).



## Additional Resources

  * [Styling in Word: Introducing an accessible syllabus template | Swarthmore ITS Blog](https://blogs.swarthmore.edu/its/2025/08/20/introducing-an-accessible-syllabus-template/)
  * [WebAIM article on Microsoft’s built-in alt text generator](https://webaim.org/blog/word-and-powerpoint-alt-text-roundup/)
  * [General Course Material Guidelines for Faculty](https://www.swarthmore.edu/accessibility/general-course-material-guidelines) from [Accessibility@Swarthmore](https://www.swarthmore.edu/accessibility).
  * Google's [Make your document or presentation more accessible](https://support.google.com/docs/answer/6199477?hl=en).
  * Our [Accessibility File Scan](https://kb.swarthmore.edu/wiki/Accessibility_Filescan "Accessibility Filescan") is a tool faculty, teaching and instructional staff, and anyone assisting in the preparation of course materials can utilize. These results are not currently viewable by students. This modal usually appears at the top right of every course page.
  * [Creating Accessible Course Content](https://teachaccess.org/resources/creating-accessible-course-content/) from our partner [TeachAccess](https://teachaccess.org/).
  * [WebAIM Million Report](https://webaim.org/blog/webaim-million-2022/) documents the accessibility of websites over time.
