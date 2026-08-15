---
title: "Windows Terminal Access"
source: https://kb.swarthmore.edu/wiki/Windows_Terminal_Access
pageid: 775
categories:
  - Firebird
---

# Windows Terminal Access

Windows users can connect to Firebird using either PuTTY or MobaXterm. Unlike on Mac / Linux, the processes of both generating SSH keys and connecting to a remote system are integrated within a single program. Follow the instructions below to install either package, set up a key pair, and connect to Firebird. 

## Contents

  * 1 PuTTY
    * 1.1 Setting up a key pair
    * 1.2 Configuring PuTTY
    * 1.3 Connecting to Firebird with PuTTY
  * 2 MobaXterm
    * 2.1 Setting up a key pair
    * 2.2 Configuring MobaXterm
    * 2.3 Connecting to Firebird with MobaXterm
  * 3 Which program should I use?



## PuTTY

PuTTY is a basic yet flexible program regularly used to interact with remote systems. [Download PuTTY](https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html) and install. 

### Setting up a key pair

Start the PuTTYgen program 

  * Under _Parameters_ → _Type of key to generate_ → select _EdDSA_
  * Under _Actions_ → _Generate a public/private key pair_ → Click the "Generate" button
  * Follow the instructions
  * Under _Actions_ →  _Save the generated key_ → Click "Save private key"
  * Save private key file in a folder of your choosing. Set filename to: "id_ed25519.ppk"
  * Copy the contents of the "Public key for Pasting into OpenSSH authorized_keys file" text box (this is your public key; you should save this somewhere, or you can also click the “Save public key” button and save it as “id_ed25519.pub”)
  * Go to the [Firebird Account Request page](https://support.swarthmore.edu/support/catalog/items/121) and paste the public key text into the box provided.



### Configuring PuTTY

Start the PuTTY program and configure as follows: 

  * _Session → Hostname_ → Enter "firebird.swarthmore.edu" (don't include the quotes)
  * Session →  _Connection type _→ check "SSH"
  * _Connection_ →  _Data_ → Auto-login username → Enter your Firebird username (it will follow the pattern of `username-swat`). Usernames are case sensitive, so use all lowercase letters.
  * _Connection _→ _SSH _→ _Auth _→ select the "id_ed25519.ppk" file created in the section above.
  * _Session _→ _Saved sessions_ → enter "Firebird" in the text box and click "Save"



The configuration only needs to be done once. In the future, the configuring can be loaded by starting PuTTY, selecting  _Session _→ _Saved sessions, _selecting "Firebird" and clicking "Load" 

### Connecting to Firebird with PuTTY

Connect to Firebird by clicking on "Open" button at the bottom of the window. 

## MobaXterm

MobaXterm is a powerful program that integrates a shell, file manager, X11 server, and additional utilities in one package. [Download](https://mobaxterm.mobatek.net/) and install MobaXterm (the free Home Edition is sufficient). 

### Setting up a key pair

  * _Tools_ _→ MobaKeyGen (SSH key generator)_
  * Under _Parameters_ → _Type of key to generate_ → select _EdDSA_
  * _Generate_ (follow the instructions to move your mouse randomly in the specified area)
  * _Save private key_ _→ _save the private key file in a folder of your choosing, and set the filename to `id_ed25519.ppk`
  * _Save public key_ _→ _save the public key in a folder of your choosing so you have a backup of it if needed later (generally you would save this as `id_ed25519.pub`.
  * Copy the entire contents in the text box under "Public key for pasting into OpenSSH server"
  * Go to the [Firebird Account Request page](https://support.swarthmore.edu/support/catalog/items/121) and paste the public key text into the box provided.



### Configuring MobaXterm

  * _Session → SSH_ _→ Remote host_ _→ _ enter `firebird.swarthmore.edu`
  * Check _Specify username_ _→ _enter your Firebird username (in the format of `username-swat`, and case-sensitive, use all lowercase letters)
  * Under _Advanced SSH settings_ _→ _check _Use private key_ _→ _click the file icon and navigate to the private key file (`id_ed25519.ppk`) you generated above
  * Click _OK_ to save the session settings



### Connecting to Firebird with MobaXterm

The session will be saved in a list on the left side of the window; double-click on `firebird.swarthmore.edu` to connect. 

  


## Which program should I use?

Both PuTTY and MobaXterm provide similar functionality. PuTTY is lighter-weight, whereas MobaXterm comes with many additional utilities and capabilities that most users won't need. On the other hand, MobaXterm comes with a built-in X11 server, so if you intend to use graphical applications, it is an excellent all-in-one solution, plus it has other useful features, such as an integrated SFTP file manager, making it straightforward to upload and download files to/from Firebird. In the end, it is mostly personal preference.
