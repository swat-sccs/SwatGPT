---
title: "Best Practices: Webpage Creation"
source: https://kb.swarthmore.edu/wiki/Best_Practices%3A_Webpage_Creation
pageid: 1256
categories:
  - Accessibility
---

# Best Practices: Webpage Creation

Most of the guidance provided on this page is based on the work and standards created by the [World Wide Web Consortium or W3C](https://www.w3.org/). 

## Contents

  * 1 Page Title
    * 1.1 Note on Semantics
    * 1.2 Code Example
    * 1.3 Titles, Search Engine Optimization (SEO), and Accessibility
      * 1.3.1 Give every page a unique title
      * 1.3.2 Keep an eye on your title length
      * 1.3.3 Do not stuff a title with keywords
      * 1.3.4 Put the unique information first
  * 2 Text and Typography
    * 2.1 Serif v. Sans-serif
    * 2.2 Mono-spaced
    * 2.3 Avoid fully justified text
    * 2.4 Pay attention to text spacing to improve readability
    * 2.5 Break up long passages of text
  * 3 Color
  * 4 References for additional information



## Page Title

The page title is one of the first things anyone sees, including anyone using a screen reader and search engines. Blind users cannot glance quickly at the content of a web page to see what the page is about, so they rely on the page title to give them this information. Web pages without titles waste the time of screen reader users because they force users to navigate through the web page past the main menu and into the content to find out what the page is about. 

It is particularly helpful when a visitor has multiple tabs open. In tabbed browsers, the title displays in the tab, making it easy to identify open pages and quickly switch between them. 

[![Examples of document titles in tabs](https://kb.swarthmore.edu/images/0/03/Screen_Shot_2021-08-12_at_9.32.30_AM.png)](https://kb.swarthmore.edu/wiki/File:Screen_Shot_2021-08-12_at_9.32.30_AM.png)

### Note on Semantics

Both the title (`<title>`) and the top heading in the main content (ideally marked with `<h1>`) serve essentially the same purpose: to give the page a title. With this in mind, it usually makes sense to match the page title and the top heading with identical text, or at least very similar text. 

There is some room for slight variations. For example, you might put the website brand at the end of the page title but not in the main heading for the content. Redundancy is a good thing in this case because it allows users to see the page title whether they're viewing the tabs in a browser, listening to a page load with a screen reader (the title is the first thing screen readers read), or reading through the main content. 

If you have questions about headings (`<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`, and `<h6>`) we will talk about how they work and provide structure a little later. 

  


### Code Example

`<head><title>Example Title</title></head>`

### Titles, Search Engine Optimization (SEO), and Accessibility

#### Give every page a unique title

This is the most important practice. The purpose of the page title is to succinctly identify the purpose of a page. 

#### Keep an eye on your title length

Try to keep your title length less than 60 characters. A good page title is a brief phrase that clearly identifies the topic or purpose of the web page. 

#### Do not stuff a title with keywords

Focus on embedding SEO keywords in content instead. It is fine to add one or two keywords in a title, but be sure it still identifies the topic or purpose of a page. 

#### Put the unique information first

If you want to include your site's brand in each page title, put it last, after the unique information (with the possible exception of the home page). 

## Text and Typography

In web circles, there is a lot of debate about which fonts are better than others, but one thing is clear: fonts with cursive, unusual shapes, or artistic features may look pretty, but they are harder to read than standard fonts like Times New Roman or Arial. Avoid them. 

[![Several different fancy font types that are hard to read. Each font example uses the phrase This font may be fun to look at, but it is not the easiest to read](https://kb.swarthmore.edu/images/0/0c/fonts-hard-to-read.png)](https://kb.swarthmore.edu/wiki/File:fonts-hard-to-read.png)Various decorative fonts that can be hard to read.

### Serif v. Sans-serif

Serif stands for a stroke or line, and typically these fonts have an embellishment at the top and/or bottom of the letters. Common Serif fonts include Times New Roman, Garamond, Baskerville, Georgia, and Courier New. 

Sans means without, and typically these fonts are plainer and without any embellishments. Common sans-serif fonts include Arial, Verdana, and Helvetica. 

Which of these two is better for the web is up for debate. These days, it is more common to see Sans-Serif fonts on the web than Serif. One of the caveats when using sans-serif is that it is the possibility of confusion between uppercase I (as in Idaho) and lowercase L (as in linger). Usually, the context prevents this, but if you are mixing letters and numbers it might be better to use a serif font. 

All the fonts in this example of different font families are all the same size. 

### Mono-spaced

With monospace fonts each character is positioned at the same vertical point, making it easier to align columns of text or numbers. This type of font is best when used sparingly for shorter snippets of information. Coders are the more common users of a mono-space font because it makes it easier to vertical alignment different elements and the code doesn’t often span multiple lines. Below is an example of how we might use mono-spaced fonts. 
[code] 
    <!-- This is a example of a comment in HTML on a single line -->
    
    <p>Use the <p></p> tag pairs to create a paragraph in HTML.</p>
    
    <!--
          This is a multiline comment and it can
          span through as many as lines you like.
      -->
    
[/code]

### Avoid fully justified text

The uneven spacing between words in fully-justified text can cause "rivers of white space" to run down the page, making reading difficult and, in some cases, impossible. Full justification can also cause words to be bunched too closely together, or stretched in unnatural ways, making it difficult for some users to locate word boundaries. 

### Pay attention to text spacing to improve readability

Use the line-height, word-spacing, and letter-spacing style attributes to help your visitors read content more easily. [W3C has specific guidelines on text-spacing](https://www.w3.org/WAI/WCAG21/Understanding/text-spacing.html): 

  * Line height (line spacing) to at least 1.5 times the font size;
  * Spacing following paragraphs to at least 2 times the font size;
  * Letter spacing (tracking) to at least 0.12 times the font size;
  * Word spacing to at least 0.16 times the font size.



This is usually accomplished via Cascading Style Sheets (CSS). [WCAG provides some techniques](https://www.w3.org/WAI/WCAG21/quickref/?showtechniques=1412#text-spacing) you can use to accomplish this. 

### Break up long passages of text

Split up long sections of text into separate paragraphs, or lists, or find other ways to make each section of text more manageable. 

## Color

Choosing a color theme can be challenging sometimes, especially when you realize that some of your visitors can not distinguish between some color combinations. This is color blindness. 

What follows are guidelines to keep in mind as you choose your color elements for your web pages. 

  * Red/green color blindness is the most common. There is also blue/yellow and complete color blindness.
  * Avoid putting red or green text on black backgrounds, or black text on red or green backgrounds.
  * The minimum contrast cannot be less than 4.5:1. Whenever possible strive to meet a 7:1 standard in order to be easily seen by anyone. Use this [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/) to assist.
  * Desaturate your page/design. Doing so can help you quickly find color blindness and color contrast issues. To do this you can use the [WebAIM WAVE tool](https://bit.ly/WaveHowTo), an extension like [Chrome’s High Contrast](https://bit.ly/HighContrastChrome) or [Firefox’s Greyscale Bro](https://mzl.la/3ZrIF6N) or within your graphic design tools.



## References for additional information

  * [Mozilla HTML elements guide](https://developer.mozilla.org/en-US/docs/Web/HTML/Element)
  * [Text spacing guidance](https://dequeuniversity.com/resources/wcag2.1/1.4.12-text-spacing)
  * [W3C tutorials](https://www.w3.org/WAI/tutorials/)
  * [Screen Reader Demo With Headings [YouTube](https://youtu.be/0xAv1l04aJI?si=zDevmiYLH1okRUaz)]
  * [The 23 Best Web-Safe HTML & CSS Fonts for 2024](https://blog.hubspot.com/website/web-safe-html-css-fonts)
