---
title: "Firebird Technical Specifications"
source: https://kb.swarthmore.edu/wiki/Firebird_Technical_Specifications
pageid: 1698
categories:
  - Firebird
---

# Firebird Technical Specifications

## Technical Specifications

Firebird consists of 32 compute nodes, 6 high-memory nodes, 2 high-CPU nodes, 6 GPU nodes, and 2 storage nodes, offering more than 2,700 cores, 19 GPUs, and over 1.2 PB of storage, all linked by Omni-Path 100 fast interconnects. 

**Node** | **CPUs** | **Memory** | **Storage** | **GPUs**  
---|---|---|---|---  
Login Node  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 256 GB  | 98 TB  |   
node01  | 2x 32-core Intel Xeon Gold 6430 2.1 GHz  | 512 GB  | 7 TB  |   
node02  | 2x 32-core Intel Xeon Gold 6430 2.1 GHz  | 512 GB  | 7 TB  |   
node03  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 192 GB  | 830 GB  |   
node04  | 2x 26-core Intel Xeon Gold 6230R 2.1GHz  | 192 GB  | 830 GB  |   
node05  | 2x 26-core Intel Xeon Gold 6230R 2.1GHz  | 192 GB  | 830 GB  |   
node06  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 192 GB  | 830 GB  |   
node07  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 192 GB  | 830 GB  |   
node08  | 2x 26-core Intel Xeon Gold 6230R 2.1GHz  | 192 GB  | 830 GB  |   
node09  | 2x 10-core Intel Xeon Gold 5215 2.5 GHz  | 192 GB  | 22 TB  |   
node10  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 192 GB  | 66 TB  |   
node11  | 2x 32-core Intel Xeon Gold 6430 2.1 GHz  | 512 GB  | 7 TB  |   
node12  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 384 GB  | 830 GB  |   
node13  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 384 GB  | 830 GB  |   
node14  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 384 GB  | 830 GB  |   
node15  | 2x 32-core Intel Xeon Gold 6338 2.0GHz  | 512 GB  | 1.7 TB  |   
node16  | 2x 32-core Intel Xeon Gold 6338 2.0GHz  | 512 GB  | 1.7 TB  |   
node17  | 2x 32-core Intel Xeon Gold 6338 2.0GHz  | 512 GB  | 1.7 TB  |   
node18  | 2x 32-core Intel Xeon Gold 6338 2.0GHz  | 512 GB  | 1.7 TB  |   
node19  | 2x 32-core Intel Xeon Gold 6338 2.0GHz  | 512 GB  | 1.7 TB  |   
node20  | 2x 32-core Intel Xeon Gold 6338 2.0GHz  | 512 GB  | 1.7 TB  |   
node21  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node22  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node23  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node24  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node25  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node26  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node27  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node28  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node29  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node30  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node31  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node32  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.9 TB  |   
node33  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.7 TB  |   
node34  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 1.7 TB  |   
node35  | 2x 32-core Intel Xeon Gold 6530P 2.3GHz  | 1 TB  | 1.7 TB  |   
himem01  | 2x 18-core Intel Xeon Gold 6240 2.6GHz  | 768 GB  | 830 GB  |   
himem02  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 768 GB  | 830 GB  |   
himem03  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 768 GB  | 830 GB  |   
himem04  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 768 GB  | 830 GB  |   
himem05  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 2 TB  | 1.7 TB  |   
himem06  | 2x 32-core Intel Xeon Gold 6530P 2.3GHz  | 2 TB  | 1.7 TB  |   
hicpu01  | 2x 36-core Intel Xeon Platinum 8360Y 2.4GHz  | 1 TB  | 1.7 TB  |   
hicpu02  | 2x 96-core AMD EPYC 9654 2.4GHz  | 768 GB  | 1.7 TB  |   
gpu01  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 384 GB  | 830 GB  | 4x NVIDIA RTX 2080 Ti (12 GB)   
gpu02  | 2x 16-core Intel Xeon Gold 6226R 2.9GHz  | 192 GB  | 1.7 TB  | 3x NVIDIA Quadro 8000 (48 GB)   
gpu03  | 2x 20-core Intel Xeon Gold 6230 2.1GHz  | 384 GB  | 830 GB  | 4x NVIDIA RTX 2080 Ti (12 GB)   
gpu04  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 512 GB  | 7 TB  | 4x NVIDIA L40s (48 GB)   
gpu05  | 2x 32-core Intel Xeon Gold 6530 2.1GHz  | 1 TB  | 1.7 TB  | 2x NVIDIA H200 (141 GB)   
gpu06  | 2x 32-core AMD EPYC 9335 3.0GHz  | 768 GB  | 1.7 TB  | 2x NVIDIA RTX6000 Pro (96GB)
