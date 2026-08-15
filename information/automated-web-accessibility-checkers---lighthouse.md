---
title: "Automated Web Accessibility Checkers - Lighthouse"
source: https://kb.swarthmore.edu/wiki/Automated_Web_Accessibility_Checkers_-_Lighthouse
pageid: 394
categories:
  - Pages with broken file links
  - Accessibility
---

# Automated Web Accessibility Checkers - Lighthouse

Lighthouse is an open-source, automated tool for assessing the quality of web pages. You can run it against any web page, public or requiring authentication. It has audits for performance, accessibility, progressive web apps, SEO and more. 

## Contents

  * 1 Using the Lighthouse Extension
    * 1.1 Where to get the extension
    * 1.2 To run an audit:
    * 1.3 What is a "good" grade?
  * 2 Using Lighthouse from Developer Tools
  * 3 Resources to learn more about the Lighthouse plugin



## Using the Lighthouse Extension

### Where to get the extension

This extension works on both Chrome and Firefox and can be installed using the links below. 

  * [Lighthouse Chrome Extension](https://bit.ly/LighthouseChrome)
  * [Lighthouse Firefox Extension](https://bit.ly/LighthouseFirefox)



### To run an audit:

  * Go to the page you want to audit.


  * After installing the extension, you should see the Lighthouse icon [lighthouse](https://kb.swarthmore.edu/index.php?title=Special:Upload&wpDestFile=image-20240301-191836.png "File:image-20240301-191836.png") near the address bar. You can also navigate to it using the short cut keys Command+Option+I to open Developer tools and navigate to "Lighthouse"


  * Once you locate the icon, click on it. This opens a modal window  




[![Lighthouse modal window](https://kb.swarthmore.edu/images/d/d6/LighthouseModal.png)](https://kb.swarthmore.edu/wiki/File:LighthouseModal.png)

  * Next, engage the gear icon in the upper right  

    * When you engage the gear icon, there are multiple options. By default, all options are checked and it will look at mobile rather than desktop. 
      * For our purposes choose only **Accessibility** to narrow the results.
      * Choosing mobile or desktop is up to you and depends on how the information will be delivered to users. If the application is going to be used primarily on a laptop or desktop, choose **Desktop**. This is the most common option.  




[![Lighthouse Accessibility Option](https://kb.swarthmore.edu/images/7/7f/LighthouseOptions.png)](https://kb.swarthmore.edu/wiki/File:LighthouseOptions.png)

  * Once you've chosen your options, click **Generate report**. Lighthouse runs its audits against the currently-focused page and opens up a new tab with a report of the results.
  * To save a report go to the far left, engage the three vertical dots and choose **Print Expanded** and save as a PDF.
  * Please note, we have noticed when an [Accessibility Overlay](https://bit.ly/overlay-fact-sheet) is present, the overlay appears to interfere with the plugin's ability to accurately assess a page for WCAG compliance.



### What is a "good" grade?

What a great question. As you may have figured out by now accessibility can be thought of as a spectrum of success levels. 

Ideally, we want to see scores of 90 and above. The main exception is when an [Accessibility Overlay](https://bit.ly/overlay-fact-sheet) is present. An accessibility overlay is often put in place when a vendor or website owner has not coded their application or site to accepted standards (like WCAG, or European Union's EN 301 549). Overlays have been found to interfere with assistive technology thus failing to provide a better user experience for those who rely on assistive technology. 

## Using Lighthouse from Developer Tools

Developer Tools is a set of tools that are used primarily by people coding pages. The main advantage of using Lighthouse this way is that the Developer Tools workflow allows for testing local sites and authenticated pages, while the extension does not. 

## Resources to learn more about the Lighthouse plugin

  * [Test accessibility using Lighthouse](https://bit.ly/Use-Lighthouse)
  * [Google Developer - Lighthouse Overview](https://bit.ly/Lighthouse-testing-tool)
