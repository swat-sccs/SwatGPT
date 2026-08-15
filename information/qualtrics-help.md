---
title: "Qualtrics Help"
source: https://kb.swarthmore.edu/wiki/Qualtrics_Help
pageid: 691
categories:
  - Qualtrics
---

# Qualtrics Help

This page contains some information on how to administer Qualtrics surveys, but most questions can be answered through the Official Qualtrics Help Pages (see **Help Resources** below). 

## Contents

  * 1 Help Resources
  * 2 Getting Started / Account Setup
    * 2.1 To start creating a survey
  * 3 Collaborating
    * 3.1 Adding Swarthmore users
  * 4 Adding a submit button
  * 5 Limit number of words (instead of characters) in a text box
  * 6 Sending a reminder for a survey in progress
  * 7 Survey response shows as incomplete, but user says they completed the survey
  * 8 Automatically shift to next question + No Next button (fastest way to navigate through survey)
  * 9 Prevent video replay
  * 10 Calculating a total
    * 10.1 **Javascript Code for Calculated Total**
  * 11 Password Protecting a Survey
  * 12 Handling Hard Blocked Emails in your Distribution List
  * 13 Qualtrics Help Pages



## Help Resources

[Official Qualtrics Help & Tutorials](http://www.qualtrics.com/university/researchsuite/)

## Getting Started / Account Setup

Set up your Swarthmore Qualtrics account at <https://qualtrics.swarthmore.edu>

  1. Log into the system with your Swarthmore credentials
  2. Click "**I don't have a Qualtrics account"** in pop-up window
  3. Agree to Terms of Service



### To start creating a survey

  1. Click Blank Survey when asked presented with Research Core pop-up with Customer Experience, Employee Experience, Product Experience, Brand Experience options.
  2. Enter a survey name
  3. Click **Create**
  4. Start adding questions!



## Collaborating

It is possible to work on surveys with colleagues at Swarthmore or from other institutions.  Details are available from the [Collaboration page at the Qualtrics support site](https://www.qualtrics.com/support/survey-platform/my-projects/sharing-a-project/). 

**📝 Note**

### Adding Swarthmore users

To collaborate with someone from Swarthmore, start typing the person's name in the search box and click on the version of their name with the "**#** " sign,  in the autocomplete results (**Not** the "**@** " sign as in an email). If you just enter the person's email address and click **Add** , Qualtrics will not associate the person with Swarthmore's account. If your collaborator doesn't show up with a name with a "#" sign in the autocomplete listing, they probably don't have a Qualtrics account. Have them go to <https://swarthmore.qualtrics.com> and create new account. 

## Adding a submit button

By default, the button to click to the next page of a survey looks like this: >>. It is easy to accidentally submit a survey if you don't realize that you are on the last page. One solution is to change the text on the "next page" button of the last page of your survey to say "Submit". The Qualtrics help site has [instructions on how to change the button text](https://www.qualtrics.com/support/survey-platform/common-use-cases-rc/survey-tips-tricks/#Submit). 

## Limit number of words (instead of characters) in a text box

This information is from [Lafayette College's Custom Validation in Qualtrics](https://help.lafayette.edu/custom-validation-in-qualtrics/) help page. 

**ℹ️ Info**

When using a text entry question with an Essay Text Box you may want to limit the number of words a person can write. There is validation built in to Qualtrics to limit the number of characters, but not the number of words so custom validation will have to be used. 

To add custom validation when limiting entries to a certain number of words: 

  1. In your survey click the question where you are asking for a limited text entry.
  2. In the right hand column click **Custom Validation** under the Validation Type area.
  3. In the window that appears the first drop-down box should already be populated with the question you are on, if not select it from the list of questions.
  4. In the second drop-down box select the text entry area where they will be typing their paragraph.
  5. Select "Matches Regex" from the third drop-down box, then type **^\s*(\S+\s+){0,349}\S*$** in the fourth box. This is regular expression that will make sure the text entered contains between 1 and 350 words. To change the word range you just have to update the two numbers in the string of text. For example to make the range between 200 and 400 words you would enter **^\s*(\S+\s+){199,399}\S*$** into the box. Notice that the numbers you enter are always your goal number minus 1.
  6. You can choose a System Default message, like Require valid response, but in this case creating a custom message that indicates the word range is probably best.
  7. Click Save.



## Sending a reminder for a survey in progress

When sending out a reminder email, the message may not get sent to people with a survey in progress (even if they haven't accessed it for a while). If you go to the "responses in progress" screen and close a person's responses, it then records the results as partial.  You can then go back in and resend the link with their partial answers included. 

## Survey response shows as incomplete, but user says they completed the survey

If this is a survey that uses a panel, go to **Distribute Survey → Email History **and download the mailing history.  Find the link to the survey respondent and copy and paste into a browser.  Try to submit the survey on their behalf. 

## Automatically shift to next question + No Next button (fastest way to navigate through survey)

When you need to get someone's first response to a question, and not allow them to go back to second guess, or rethink it... 

  1. Make sure survey **Look and Feel** is set to 1 question per page
  2. Enter Javascript editor on any question
  3. Copy and delete all code in that window
  4. Paste the following: `Qualtrics.SurveyEngine.addOnload(function() { var that = thlis; this.questionclick = function(event,element){ if (element.type == 'radio') { that.clickNextButton(); } } });`
  5. Enter into HTML editor for same question and switch to the HTML code view
  6. Move the cursor to the bottom/end of the text
  7. Add the following: `#NextButton {display:none;}`



## Prevent video replay

In some cases, a video inserted into a Qualtrics question should only be viewed once and the respondent should not be able to restart the video and watch it again. It is possible to check if the video has ended and then turn off the playback controls, to prevent replay. 

Insert a video using the Qualtrics rich text editor. Add the following Javascript to the question (right after the line "`/*Place your JavaScript here to run when the page is fully displayed*/`") 
[code] 
    var vids = jQuery("video");
    jQuery.each(vids, function(){
    	this.on('ended', function(e) {
    	   var target = e.target || e.srcElement;
           target.controls = false;
       });
    });
    
[/code]

If you add this code to one question on a page, it will affect all videos on that page, even if they are in a different question. 

## Calculating a total

This custom code will calculate a total dollar amount from a list of categories. 

Add a Matrix table question type with short or medium text extry. Use as many statements as needed with a single scale point. Your matrix should look like single column with multiple rows. 

**Example**

[![Qualtrics survey question asking to enter total amounts for food, clothing, and shelter with a total amount displayed below the instructions.](https://kb.swarthmore.edu/images/5/50/Qualtrics_Help_1778617551252.png)](https://kb.swarthmore.edu/wiki/File:Qualtrics_Help_1778617551252.png)

In the rich text editor for the question, go into HTML source mode and add the following code: `Total: N/A`

Use the following for the Javascript content (replace the entire existing Javascript code): 

##### **Javascript Code for Calculated Total**
[code] 
    var questionObject;
    
    Qualtrics.SurveyEngine.addOnload(function()
    {
    	/*Place your JavaScript here to run when the page loads*/
    
    	//var choices = this. getChoices();
    	//document.getElementById("QR~QID4~5~1~TEXT").addEventListener("focusout", function() {alert("hi");});
    
    
    });
    
    Qualtrics.SurveyEngine.addOnReady(function()
    {
    	/*Place your JavaScript here to run when the page is fully displayed*/
    
    
    	updateTotal(this);// In case there is any saved data
    
    	questionObject = this;
    	var questionid = this.questionId
    	jQuery("#" + questionid + " :input").focusout ( function(){updateTotal(questionObject);});
    
    });
    
    Qualtrics.SurveyEngine.addOnUnload(function()
    {
    	/*Place your JavaScript here to run when the page is unloaded*/
    
    });
    
    function updateTotal(q) {
    	var choices = q. getChoices();
    
    	var total = 0;
    		for (var i = 0; i< choices.length; i++) {
    			var x =  q.getChoiceAnswerValue(choices[i],1);
    			if (isNumeric(x)) {
    				total += parseFloat(x);
    			}
    
    			console.log(x);
    		}
    		jQuery("#total_expenses").text("$" + total.toFixed(2));
    }
    
    function isNumeric(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }
    
[/code]

## Password Protecting a Survey

See our help page on [Password Protecting a Qualtrics Survey](https://kb.swarthmore.edu/wiki/Password_Protecting_a_Qualtrics_Survey "Password Protecting a Qualtrics Survey")

## Handling Hard Blocked Emails in your Distribution List

There are times when you send to a distribution list of Swarthmore College participants and you find that some of those participants emails have been “Hard Blocked” by Qualtrics. This, historically, happens most when the person whose address is blocked has been at Swarthmore, left the College for a time, and then returned. In this case their email was valid, was disabled for a bit, and then re-enabled on their return. However, it’s likely that they may have been sent a survey during that interim to which they were unable to respond. This results in that address being blocked by Qualtrics’s systems automatically during that period. That block is not automatically removed when they return and their email at Swarthmore is restored. 

If this happens to you, please put a request to ITS at <https://support.swarthmore.edu> as we need to manually contact Qualtrics support to have that address removed from their block list. It may also happen with email addresses for participants that are not at Swarthmore. Likewise, first verify with your participant that their email address is valid and works, then let us know, so we can request removal from the Qualtrics block list. 

## Qualtrics Help Pages

  * [How to check who has shared surveys with you as a collaborator](https://kb.swarthmore.edu/wiki/How_to_check_who_has_shared_surveys_with_you_as_a_collaborator "How to check who has shared surveys with you as a collaborator")
  * [Password Protecting a Qualtrics Survey](https://kb.swarthmore.edu/wiki/Password_Protecting_a_Qualtrics_Survey "Password Protecting a Qualtrics Survey")
  * [Qualtrics](https://kb.swarthmore.edu/wiki/Qualtrics "Qualtrics")
  * [Qualtrics Data Retention Policy](https://kb.swarthmore.edu/wiki/Qualtrics_Data_Retention_Policy "Qualtrics Data Retention Policy")
  * Qualtrics Help
