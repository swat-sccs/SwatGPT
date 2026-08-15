---
title: "Globus"
source: https://kb.swarthmore.edu/wiki/Globus
pageid: 805
categories:
  - Research Computing
---

# Globus

Globus is a service that facilitates data management, sharing, and transfer and is considered the standard utility for such tasks. Globus is designed to be a “fire and forget” solution, able to handle moving or sharing datasets of nearly any size. Globus is able to handle network hiccups, data validation, and other issues that can derail most large transfers. And, unlike single-threaded data transfer tools such as `rsync`, Globus uses GridFTP to drastically speed up large transfers. General information is available on the [Globus website](https://www.globus.org/). 

This is not intended to be a comprehensive guide for Globus but should be sufficient as a starting resource. If you would like to discuss data management workflows, please reach out to Jason Simms ([jsimms1@swarthmore.edu](mailto:jsimms1@swarthmore.edu)). 

Some common use cases include transferring data from a personal system to a lab system, [Firebird](https://kb.swarthmore.edu/wiki/Firebird_Computing_Cluster "Firebird Computing Cluster"), or to national compute resources (TACC, Anvil, SDSC, etc.); syncing files between local and remote data stores (AWS, Firebird, collaborator’s systems, etc.); and, sharing data with others. 

## Contents

  * 1 Getting started
  * 2 Using Globus with Firebird
  * 3 Globus Connect Personal
  * 4 Sharing data with Globus



## Getting started

The first step is to create a Globus identity. Note that it will be possible to manage multiple identities (e.g., for different institutions) under a single “umbrella” identity. 

  1. Navigate to <https://app.globus.org>
  2. Select **Swarthmore College** from the drop-down box and click **Continue**.
  3. Log in using your standard Swarthmore credentials.
  4. If you have not authenticated through Globus previously, it may ask some permission questions, but ultimately you should see a similar screen to this:



[![](https://kb.swarthmore.edu/images/e/e2/Screenshot_2026-04-06_at_12.23.32_PM.png)](https://kb.swarthmore.edu/wiki/File:Screenshot_2026-04-06_at_12.23.32_PM.png) Usually the next step is to search for one or more Collections that you have access to. Once you have access to a given Collection, it is possible to bookmark it for easy one-click access. 

## Using Globus with Firebird

Firebird hosts two Globus Collections. Please note that when you connect to a Collection for the first time, there may be some permission and similar questions that appear. 

If you have an account on Firebird, you have access to the **Firebird Home Mapped Collection**. This will present a list of all directories within `/home`; navigate to yours and click it to access its contents. Note that you do not have access to anyone else’s home directory, nor does anyone else have access to yours (attempting to access someone else’s directory will result in a permission denied message). You can use the interface to transfer files from your local system (or from any other Collection) to Firebird, and vice-versa. 

If you also have access to a lab directory, you can search for the **Firebird Labs Mapped Collection**. Similarly, this will present a list of lab directories, and you can navigate to ones for which you have permission. 

## Globus Connect Personal

[Globus Connect Personal](https://www.globus.org/globus-connect-personal) is an application you can install on a personal system, such as a laptop or lab system. It is meant for two primary purposes: 1) it provides an interface to Globus through a dedicated app rather than a website, and 2) you can create essentially a Collection for that specific system, which can be helpful if you regularly transfer data to/from it (meaning, you can transfer or sync files to/from a personal system remotely without needing to be at that system). 

## Sharing data with Globus
