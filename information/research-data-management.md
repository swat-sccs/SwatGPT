---
title: "Research Data Management"
source: https://kb.swarthmore.edu/wiki/Research_Data_Management
pageid: 768
categories:
  - Research Computing
---

# Research Data Management

The College provides several ways for Swarthmore researchers to manage data (e.g., storage, backup, sharing, etc.). Often, multiple options may be available, and selecting the best approach depends on a number of factors (size, access and sharing requirements or restrictions, types of data, backup requirements, etc.). In many cases, it is helpful to reach out to Jason Simms ([jsimms1@swarthmore.edu](mailto:jsimms1@swarthmore.edu)) to discuss your research needs as early as possible. 

## Contents

  * 1 Data Intake Form
  * 2 Data Storage Options
    * 2.1 CrashPlan (workstation only backup)
    * 2.2 Google Drive
    * 2.3 Network share
    * 2.4 Firebird
  * 3 Storage and Backup Comparison
  * 4 Data Management



## Data Intake Form

If you have data storage needs or are considering starting a new project, a good first step is to complete the [data intake form](https://docs.google.com/forms/d/e/1FAIpQLSekXdd6_eaAoMC3oAAkAG7OJMcjxABxn6AREWtojGr_8xIswQ/viewform?usp=sharing&ouid=108119742550371559704) (authentication required). Doing so provides ITS with useful information to begin a conversation about your needs and to make some initial recommendations. 

## Data Storage Options

### CrashPlan (workstation only backup)

CrashPlan is Swarthmore's primary computer backup system for faculty and staff. It is the easiest solution for backing up a computer automatically. If your research data easily fit on a laptop or desktop computer, then this is the best way we can help you keep it safe. The backup software can be installed on multiple office computers and is not designed for lab or research machines. More information is available on the [Computer Backup help page](https://kb.swarthmore.edu/wiki/Computer_Backup "Computer Backup"). 

### Google Drive

Swarthmore's Google Drive storage can be easily accessed anywhere and shared with both internal and external colleagues. Research groups are usually best served by a Google Shared Drive because any files added to a Shared Drive are owned by the group instead of the individual user, preventing files from being deleted when users leave the College. Data are encrypted both at rest and in transit. Google Drive is best for smaller total amounts of data (<1 TB) and number of files; performance when transferring large number of files or total amounts of data can be inconsistent. Also, Google Drive is better for data that will not be analyzed on a variety of systems (e.g., HPC environments), because it can introduce challenges related to file names (especially for Google-native file types, such as Docs, Sheets, etc.) unless strict conventions are followed. It also can be difficult to configure sharing subsets/subdirectories with specific people or groups. To set up a Google Shared Drive for your group, [fill out a request form](https://support.swarthmore.edu/support/catalog/items/119). 

### Network share

ITS can set up a network share for groups that need a simple way to share files internally, or for data that are too large to be stored on personal systems. Such shares can be accessed like a network drive, but data is stored securely off campus (such as within AWS S3). External collaborators can be added provided they have a Swarthmore [sponsored guest account](https://support.swarthmore.edu/a/catalog/request-items/136). This option offers more nuanced and flexible control over data access, amounts, backup, and sharing but is slightly more complex. It also may be possible to develop special shares for projects relying on controlled or otherwise restricted data. Network shares require the use of VPN when off campus to protect the data. 

### Firebird

If your research project makes use of [Firebird](https://kb.swarthmore.edu/wiki/Firebird_Computing_Cluster "Firebird Computing Cluster") (Swarthmore’s HPC environment), it is possible to store data on that system. Firebird offers multiple storage locations (e.g., home directory, shared lab space, etc.) depending on the amount and use case of the data. It is possible to store multiple TB of data, if needed, and some filesystems are backed up locally (snapshots). Restricted or controlled data are not permitted to be stored, however, and it is meant for active data only (i.e., it is not meant for long-term storage of older or “cold” data). External collaborators can [request a guest account](https://kb.swarthmore.edu/wiki/Requesting_a_Guest_Account_on_Firebird "Requesting a Guest Account on Firebird"). 

## Storage and Backup Comparison

**Platform** | **Optimal Use Case**  
---|---  
**CrashPlan** | All your data fits on your office computer. Note: only user folders are backed up unless otherwise specified (by contacting ITS). For faculty and staff machines **only**.   
**Google Shared Drive** | Your data needs to be shared with collaborators and is limited to <1 TB.   
**Network Share** | All your data doesn't fit on your computer, or you want to archive rarely used data and remove it from your computer. You have large >1TB storage needs. You need to share data among Swarthmore users.   
**Firebird** | Your project makes use of Firebird for data analysis.   
  
## Data Management

Managing workflows related to your data, including sharing, backups, and so forth, will depend on where your data are located, who needs access, whether the data are restricted in any way, etc. One primary tool, however, is [Globus](https://kb.swarthmore.edu/wiki/Globus "Globus"), which provides a single tool to facilitate data transfer and sharing.
