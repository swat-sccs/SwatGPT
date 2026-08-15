---
title: "Running Ollama and LLMs on Firebird"
source: https://kb.swarthmore.edu/wiki/Running_Ollama_and_LLMs_on_Firebird
pageid: 807
categories:
  - Firebird
---

# Running Ollama and LLMs on Firebird

Ollama is an easy way to run large language models (LLMs) ion Firebird. 

## Contents

  * 1 Install Ollama
  * 2 Install and Interact with Models
    * 2.1 Models
    * 2.2 Work with models interactively
    * 2.3 Ollama API
    * 2.4 Using Ollama with Slurm
  * 3 Size of Ollama Folder
  * 4 Troubleshooting



## Install Ollama

Log into Firebird with a browser with [Open OnDemand](https://kb.swarthmore.edu/wiki/Open_OnDemand "Open OnDemand"). Launch a [virtual desktop](https://kb.swarthmore.edu/wiki/Open_OnDemand#Interactive-Desktop "Open OnDemand"), **making sure to select a GPU as part of the request**. From within the virtual desktop, open a terminal window. 

Download and uncompress the latest release of Ollama: 
[code] 
    curl -L https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst -o ollama-linux-amd64.tar.zst
    tar -I zstd -xf ollama-linux-amd64.tar.zst
    
[/code]

Move the Ollama `bin` and `lib` folders to your `.local` directory (making sure the folder exists). The `.local` directory is a common location used for installing applications in a user's home folder instead of system-wide: 
[code] 
    mkdir -p ~/.local
    cp -av bin/ lib/ ~/.local/
    
[/code]

Your `$PATH` variable must include `~/.local/bin`. This command will verify whether or not it is already present, and if not, it will add the path to your `.bashrc` and reload it: 
[code] 
    echo "$PATH" | grep -q "$HOME/.local/bin" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc; source ~/.bashrc
    
[/code]

## Install and Interact with Models

Once Ollama is installed, you can launch it, install models, and interact with it. Ollama uses a server/client model. The server must be running on a GPU node. 

### Models

Several LLMs are available. See the list at <https://ollama.com/search> . This list is constantly updating and includes both general purpose and specialized models. 

### Work with models interactively

One of the easier ways to work interactively with Ollama is to start the server in one terminal window, then open a second one to interact with it. 

In the first terminal window, start the Ollama server: 
[code] 
    ollama serve
    
[/code]

In a second terminal window, download and install an LLM: 
[code] 
    ollama run gemma4
    
[/code]

The first time you run this command, it will take a while to download the model (`gemma4` in this example) and install it. Once installed, you can interact/chat with the model. 

### Ollama API

See <https://docs.ollama.com/api/introduction> for documentation of the Ollama API. Here is a basic example using the gemma4 model: 
[code] 
    curl http://localhost:11434/api/generate -d '{
      "model": "gemma4",
      "prompt": "Why is the sky blue?",
      "stream": false
    }'
    
[/code]

### Using Ollama with Slurm

It is possible to work with Ollama from [Slurm](https://kb.swarthmore.edu/wiki/Slurm "Slurm") batch jobs. The basic steps involve launching the Ollama server in the background, then make requests or run code that uses the API. As a basic example of what to include in your Slurm job file: 
[code] 
    export PATH="$HOME/.local/bin:$PATH"
    ollama serve &
    sleep 10
    ollama run gemma4 "What is the best liberal ats college for students interested in economics and art history?"
    
[/code]

The Ollama server defaults to running on port `11434`. If you are running multiple jobs on the same server, you will need to use different ports (unless you are sharing an Ollama server). You can set a different port by setting the `OLLAMA_HOST` environment variable within your Slurm script (for example, to `12345`): 
[code] 
    export OLLAMA_HOST=127.0.0.1:12345
    
[/code]

One advantage of using a Slurm batch script is that it is possible to request multiple GPUs, whereas within a virtual desktop session, only a single one can be requested: 
[code] 
    #SBATCH --gres=gpu:4 		# Request 4 GPUs of any type
    #SBATCH --gres=gpu:L40:2    # Specifically request two L40 GPUs
    
[/code]

You can see the [types and quantities of GPUs available on Firebird](https://kb.swarthmore.edu/wiki/Using_GPUs_on_Firebird#List-of-GPUs "Using GPUs on Firebird"), or from a command line, it is possible to see in real time what is currently available: 
[code] 
    sinfo -o "%G"
    
[/code]

## Size of Ollama Folder

LLMs can take up substantial disk space, especially if you download multiple models. To see the size of all downloaded models: 
[code] 
    du -sh ~/.ollama/models/
    
[/code]

## Troubleshooting

Firebird offers several different GPUs. Some LLMs won't fit within a single GPU and you may need to request a GPU with more memory to handle certain models. The [list of GPUs](https://kb.swarthmore.edu/wiki/Using_GPUs_on_Firebird#List-of-GPUs "Using GPUs on Firebird") shows how much memory each type has. 

If you are working interactively, the `nvidia-smi` command outputs details of the GPU usage which may be helpful for debugging. This command will update the output regularly (you could run it from, e.g., a third terminal window): 
[code] 
    watch nvidia-smi
    
[/code]
