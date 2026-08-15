---
title: "Tools & Tips for Image Descriptions"
source: https://kb.swarthmore.edu/wiki/Tools_%26_Tips_for_Image_Descriptions
pageid: 357
categories:
  - Accessibility
---

# Tools & Tips for Image Descriptions

## Contents

  * 1 What is alt text?
  * 2 Role
    * 2.1 Accessibility
    * 2.2 Image Loading Failures
    * 2.3 Search Engine Optimization (SEO)
  * 3 Best Practices
  * 4 Resources



## What is alt text?

Alt text is a short descriptive phrase or sentence that provides a text alternative for images, graphics, and other non-text content. 

## Role

Alt text is particularly important for screen reader users but also helpful for those with low internet bandwidth, when an image link is broken, and to increase search engine optimization. 

### Accessibility

Screen readers read alt text aloud, allowing users who are blind or have low vision to understand visual information. This is a fundamental WCAG criteria. Take a look at [W3C’s Images Tutorial](https://bit.ly/W3C-ImagesTutorial) for more information. 

### Image Loading Failures

If an image doesn't load (due to slow connection or a broken link), the alt text is displayed in its place, preventing information loss. Mobile device users may also have images turn off, or run into loading issues when data roaming. 

### Search Engine Optimization (SEO)

Search engines use alt text to understand image content, helping them index images and potentially rank pages higher in image search results and overall search rankings. 

## Best Practices

These are taken from several credible resources such as [WebAIM Alt Text](https://bit.ly/altTexWebAIM), [Alt Text Decision Tree](https://bit.ly/altDecisionTree), [Alt Text as Poetry](https://bit.ly/altPoetry), and [Five Golden Rules for Compliant Alt Text](https://bit.ly/AltTextAdvice). 

  * Be descriptive and as concise as possible. Most screen reader users and developers suggest 150 characters or less. When longer descriptions are needed use the longdesc attribute, provide a link to more detail, or include a figure caption.
  * Context is key. Ask why you chose this image and how it relates the rest of the content. Include that information in the description. [Alt Text as Poetry](https://bit.ly/altPoetry) is a great resource to learn more.
  * Do not include “image of” or “picture of” in the description. Screen readers already announce that an image is present.
  * It is okay to indicate if an image is a logo, illustration, painting, or cartoon as this information adds more context.
  * Don’t duplicate text that’s adjacent in the document or website.
  * End the alt text sentence with a period.
  * For decorative images, use an empty alt attribute (`alt=""`) so screen readers can skip them. Use the [Alt Text Decision Tree](https://bit.ly/altDecisionTree) to help you decide if an image might be decorative.
  * When adding a title attribute (when present, it appears when one hovers over an element), do not duplicate the alt text.
  * Artificial Intelligence (AI) can be a great starting place. Checkout [Jen’s Gemini Gem Alt Tool](https://bit.ly/JenAltTextTool) as a place to start. Its designed specifically to generate image descriptions and uses some of the resources listed below as its base.



## Resources

  * [_Images Tutorial by the World Wide Web (W3C) Web Accessibility Initiative (WAI)_](https://bit.ly/W3C-ImagesTutorial)
  * [WebAIM Alt Text](https://bit.ly/altTexWebAIM)
  * [Alt Text Decision Tree](https://bit.ly/altDecisionTree)
  * [Jen’s Gemini Gem Alt Text Tool](https://bit.ly/JenAltTextTool)
  * [Alt Text as Poetry](https://bit.ly/altPoetry)
  * [Five Golden Rules for Compliant Alt Text](https://bit.ly/AltTextAdvice)
