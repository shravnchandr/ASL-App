# Training data credits — frozen phrases07

This browser model was trained on landmark data from the datasets below. Its checkpoint is `results/phrases/frozen-phrases07/phrases07/best_phrases.pth`, trained at code revision `2de95c1`, with the accepted contract-v4 releases recorded in `frozen_inputs.json`.

## PopSign ASL v1.0

**Thad Starner et al. (2023), Georgia Institute of Technology and Deaf Professional Arts Network.** *PopSign ASL v1.0: An Isolated American Sign Language Dataset Collected via Smartphones*, NeurIPS 2023 Datasets and Benchmarks.

- Dataset and credits: https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/
- Paper: https://proceedings.neurips.cc/paper_files/paper/2023/hash/00dada608b8db212ea7d9d92b24c68de-Abstract-Datasets_and_Benchmarks.html
- License: **Creative Commons Attribution 4.0 International (CC BY 4.0)** — https://creativecommons.org/licenses/by/4.0/

Changes: selected game-training recordings were processed into MediaPipe landmarks, repeated 120/60 fps frames were decimated by 4/2, 257 ASL Signs recording matches were excluded, and contract-v4 preprocessing canonicalized copied hand detections, filled missing coordinates, and formed synthetic training phrases. The accepted PopSign release contains 26,021 clips. The model export contains neither videos nor the source dataset. These modifications and this model are not endorsed by the dataset creators.

Retain this credit and the source and license links when distributing this model or an application containing it. A visible app credits entry should link to these credits.

## Google — Isolated Sign Language Recognition (ASL Signs)

Kaggle competition landmark data: https://www.kaggle.com/competitions/asl-signs/data

The accepted release contains 94,477 clips. The common starting checkpoint was also trained on ASL Signs using the legacy preprocessing pipeline, as recorded in the frozen experiment specification.

## WLASL

Dongxu Li et al., *Word-level Deep Sign Language Recognition from Video: A New Large-scale Dataset and Methods Comparison*, WACV 2020.

Project and Computational Use of Data Agreement: https://dxli94.github.io/WLASL/

Training used the accepted WLASL-all release (10,162 clips, canonical base vocabulary plus additional glosses), with held-out test signers excluded from training. The browser head retains the canonical 250 signs and the CTC blank.

ASL Citizen was used for evaluation only; this checkpoint was not trained on its research-only release.
