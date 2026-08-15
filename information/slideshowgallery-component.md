---
title: "Slideshow/Gallery Component"
source: https://kb.swarthmore.edu/wiki/Slideshow/Gallery_Component
pageid: 820
categories:
  - Drupal
---

# Slideshow/Gallery Component

[← Return to the Drupal User Guide](https://kb.swarthmore.edu/wiki/Drupal_Home "Drupal Home")

The **Slideshow/Gallery** component is used to easily add an interactive image gallery to your Drupal page. There are two styles (or display types) available: **Slideshow** and **Gallery**. 

## Contents

  * 1 Elements
  * 2 Examples
    * 2.1 Image Slideshow
    * 2.2 Image Gallery
  * 3 Step-by-step Instructions
    * 3.1 Preparing your Images
    * 3.2 Creating a Slideshow/Gallery



## Elements

  1. Title (_required but not displayed_)
  2. Label
  3. Display Type (_required_) 
     1. **Options** : Slideshow (_default_), Gallery
  4. Number of Images to Display 
     1. Default set to **All Slides**
  5. Slideshow/Gallery Items (Images)



[![Diagram showing the fields that make up the Slideshow/Gallery component.](https://kb.swarthmore.edu/images/9/9b/Screenshot_2024-06-14_at_1.39.18_PM.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_2024-06-14_at_1.39.18_PM.png)

**Figure:** The Slideshow/Gallery component fields.

## Examples

### Image Slideshow

Interactive Example

The preview below shows the Slideshow component using its default configuration. 

To experiment with different layouts and other settings, open the interactive component playground. 

**[Open Component Playground](https://toolkit.swarthmore.edu/?path=/story/swarthmore-theme-components-image-slideshow)**

  


  


### Image Gallery

Interactive Example

The preview below shows the Gallery component using its default configuration. 

To experiment with different layouts and other settings, open the interactive component playground. 

**[Open Component Playground](https://toolkit.swarthmore.edu/?path=/story/swarthmore-theme-components-image-gallery)**

  


  


## Step-by-step Instructions

### Preparing your Images

Although the slideshow layout is capable of handling various image sizes, we have a few recommendations that will help ensure a pleasant user experience for your visitors. Prior to creating your slideshow, it is helpful to use Photoshop or an equivalent tool to resize slide images with the following in mind: 

  * Keep your image sizes consistent. If the images aren't exactly the same dimensions, the screen will resize as the slideshow progresses.
  * Image slideshows look best when landscape-oriented images are used (the width is greater than the height). 
    * Optimal: **1600px wide** × **1000px tall**
    * Larger heights are acceptable but should be consistent across all slides.
  * **IMPORTANT:** Before proceeding to Drupal, prepare your images first using a photo editor such as Photoshop. Once your images are properly cropped, color corrected, and sized, continue with the steps below.



### Creating a Slideshow/Gallery

  1. Provide a **Title** for the new **Slideshow/Gallery**. 
     1. **Note:** At this time, the **Title** is only displayed when the **Display Type** is set to **Image Gallery**.
  2. Optionally, add a **Label**.
  3. Under **Display Type** , select either **Slideshow** or **Image Gallery** (see the examples above).
  4. Under **Number of Images to Display** , select the number of images to display in the component. The default value is **All Slides**.
  5. Begin adding your Slide Items: 
     1. **If using an existing image already in the system:**
        1. Click the **Insert an Image** button to launch the image browser.
        2. Navigate to the image under **Select Image** , select it using the radio button, and click **Select Image**.
     2. **If using a new image:**
        1. Click the **Insert an Image** button to launch the image browser.
        2. Select **Upload Image** , click **Browse…** to locate the image on your computer, then click **Select Image**.
     3. Optionally, add a **Video URL**. The system expects the video to come from YouTube. 
        1. _Note:_ If both a **Video URL** and **Image File** are present, the image will be used as the video's poster image. This is the intended behavior but is not required.
     4. Optionally, add a **Caption**. The **Caption** should be no more than 250 characters and ideally closer to 125 characters.
     5. Optionally, add **Image Attribution** with the photographer's name and any other required attribution.
     6. Drupal automatically creates a **Thumbnail Image**. The thumbnail is used primarily in RSS feeds and may be replaced with your own if desired.
     7. Click the blue **Add another item** button and repeat the process for each additional slide.
  6. When finished, click the green **Save** button at the bottom of the page.
