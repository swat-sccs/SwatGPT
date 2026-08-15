---
title: "Adding video to a course"
source: https://kb.swarthmore.edu/wiki/Adding_video_to_a_course
pageid: 570
categories:
  - Moodle
---

# Adding video to a course

There are a variety of ways to add videos to a Moodle course 

## Contents

  * 1 Feature Films and Television Shows
  * 2 Adding a YouTube or Vimeo video
  * 3 Panopto video streaming server
  * 4 Adding a Video from Google Drive
  * 5 Embed a video file on a Moodle page
  * 6 Preventing Auto-Embedding of Videos



## Feature Films and Television Shows

To stream films and television shows, please contact the Digital Initiatives Librarian in McCabe or the Director of the Language Resource Lab (for Modern Languages). They can secure rights to screen feature films (if required) and set up the video for streaming via Moodle. 

## Adding a YouTube or Vimeo video

There are several methods to add a YouTube or Vimeo video to your Moodle course 

  1. The easiest way to add a YouTube video is to add a link to the video, by adding a URL resource.  Copy the URL of the YouTube video and paste it into the address of the URL resource.
  2. If you create link to the YouTube video in a label or Moodle page (using the chain icon in the text editor), Moodle will replace the link with the embedded video.
  3. You can also embed a video from YouTube into your course using the following steps


  * Click **Add** **an activity or resource** → **Page**
  * In the **Content** area toolbar, by clicking on the Multimedia button [![Moodle media button](https://kb.swarthmore.edu/images/e/e7/image-2023-8-31_10-56-24.png)](https://kb.swarthmore.edu/wiki/File:image-2023-8-31_10-56-24.png) in the content box. A pop up will appear.
  * Go to YouTube or Vimeo and copy the link to the video
  * Head back to Moodle. In the pop up window, paste the video URL in the field labeled **Source URL**
  * In the **Name** field, give your video a friendly name.
  * Click **Insert Media**



## Panopto video streaming server

Panopto, Swarthmore's video streaming service is usually the best way to embed your videos in Moodle. More information is available on the Moodle [Video Streaming and Lecture Capture](https://kb.swarthmore.edu/wiki/Video_Streaming_and_Lecture_Capture "Video Streaming and Lecture Capture") page. 

## Adding a Video from Google Drive

You can upload many common video files to Google Drive and view the videos right from within Google Drive.  This is handy if you want to control the permissions via Google Drive or want to avoid the ads in the YouTube interface.  Upload the video to Google Drive just as you would any other file.  When you click on the video it will display within the Google Drive interface (it may take a few minutes to process after you have uploaded the video).  To add the video to Moodle, copy the URL to video (or a folder with several videos) and add it to Moodle as a url link.  Make sure to set the permissions of the video appropriately.  Most instructors will allow anyone at Swarthmore or any users with the link to view the video. 

Google Drive will compress and reduce the quality of the video a bit.  For most purposes this is fine, but if you require the highest quality video, you will likely prefer one of the other methods. 

## Embed a video file on a Moodle page

Moodle has a built-in media player that can play videos.  The player can be inserted into any text editing box.  Typically, most users create a new page in Moodle and then click on the Multimedia button (looks like a play button) in the page editor.  From here you can upload your video and Moodle will embed the video within a player on the page.  You will not see the video player while editing the page, but it will show up when the page is saved. 

  


## Preventing Auto-Embedding of Videos

If you create a link to a YouTube video in a label, page, or other description field, Moodle will automatically embed the YouTube video instead of just linking to the video.  Similarly, if you insert a link to a video or audio file in a text editor, Moodle will convert the link to an embedded media player. 

If you just want a simple link, you can do one of the following things: 

  1. Add the link by using** Add a resource or activity** → **URL**.  This will not embed the video.
  2. Turn off automatic multimedia embedding for your course.  This can be set from the main course page. Click** More **(under course title)** → Filters → Multimedia plugins → Off**.  This setting will affect content in the entire course.  If you don't want to affect the entire course, you can turn the multimedia filter off for a single page by editing the page, clicking on** More** ** → Filters** , and setting **Multimedia plugins** to** Off**.
  3. Edit the YouTube link to prevent auto-embedding. For example, if the YouTube link is <http://www.youtube.com/watch?v=0PfzLRs7YC0>, adding a parameter to the middle will prevent auto-embedding: [http://www.youtube.com/watch?**embed=no &**v=0PfzLRs7YC0](http://www.youtube.com/watch?embed=no&v=0PfzLRs7YC0) (add the text in bold to the URL).  Note for advanced users: Moodle is looking for a match for `watch?v=`, so adding something to the middle disrupts the filter.
