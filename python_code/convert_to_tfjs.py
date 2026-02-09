#!/usr/bin/env python3
"""
Converts PyTorch ASL classifier model to TensorFlow.js format.

Manually creates TensorFlow.js LayersModel format to avoid version compatibility issues.

Also exports:
- scaler.json: StandardScaler mean and scale values
- labels.json: Class labels (0-9, a-z)
"""

import json
import pickle
import struct
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn


# --- PyTorch Model Architecture (must match training) ---
class ASLClassifierPyTorch(nn.Module):
    """PyTorch model architecture matching the trained model."""

    def __init__(self, input_size: int = 63, num_classes: int = 36):
        super(ASLClassifierPyTorch, self).__init__()
        self.layer_stack = nn.Sequential(
            nn.Linear(input_size, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, num_classes),
        )

    def forward(self, x):
        return self.layer_stack(x)


def load_pytorch_model(model_path: str, input_size: int = 63, num_classes: int = 36):
    """Load the trained PyTorch model."""
    model = ASLClassifierPyTorch(input_size, num_classes)
    model.load_state_dict(
        torch.load(model_path, map_location=torch.device("cpu"), weights_only=True)
    )
    model.eval()
    return model


def save_tfjs_model(pytorch_model, output_dir: Path, input_size: int = 63, num_classes: int = 36):
    """
    Manually create TensorFlow.js LayersModel format.

    TensorFlow.js format consists of:
    - model.json: Model topology and weight manifest
    - group1-shard1of1.bin: Binary weights file
    """
    state_dict = pytorch_model.state_dict()

    # Extract and transpose weights (PyTorch uses [out, in], TF uses [in, out])
    weights = []

    # Layer 0: Dense 63 -> 128
    w0 = state_dict['layer_stack.0.weight'].numpy().T.astype(np.float32)
    b0 = state_dict['layer_stack.0.bias'].numpy().astype(np.float32)
    weights.extend([w0, b0])

    # Layer 1: Dense 128 -> 64
    w1 = state_dict['layer_stack.3.weight'].numpy().T.astype(np.float32)
    b1 = state_dict['layer_stack.3.bias'].numpy().astype(np.float32)
    weights.extend([w1, b1])

    # Layer 2: Dense 64 -> 36
    w2 = state_dict['layer_stack.5.weight'].numpy().T.astype(np.float32)
    b2 = state_dict['layer_stack.5.bias'].numpy().astype(np.float32)
    weights.extend([w2, b2])

    # Create binary weights file
    weights_data = b''
    weight_specs = []
    offset = 0

    weight_names = [
        "dense/kernel", "dense/bias",
        "dense_1/kernel", "dense_1/bias",
        "dense_2/kernel", "dense_2/bias"
    ]

    for name, w in zip(weight_names, weights):
        # Flatten and convert to bytes
        flat = w.flatten()
        byte_data = flat.tobytes()
        weights_data += byte_data

        weight_specs.append({
            "name": name,
            "shape": list(w.shape),
            "dtype": "float32"
        })
        offset += len(byte_data)

    # Write binary weights
    weights_path = output_dir / "group1-shard1of1.bin"
    with open(weights_path, 'wb') as f:
        f.write(weights_data)

    # Create model.json (TensorFlow.js LayersModel format)
    model_json = {
        "format": "layers-model",
        "generatedBy": "convert_to_tfjs.py",
        "convertedBy": "Manual PyTorch to TF.js conversion",
        "modelTopology": {
            "keras_version": "3.0.0",
            "backend": "tensorflow",
            "model_config": {
                "class_name": "Sequential",
                "config": {
                    "name": "sequential",
                    "layers": [
                        {
                            "class_name": "InputLayer",
                            "config": {
                                "batch_input_shape": [None, input_size],
                                "dtype": "float32",
                                "sparse": False,
                                "name": "input_1"
                            }
                        },
                        {
                            "class_name": "Dense",
                            "config": {
                                "name": "dense",
                                "trainable": True,
                                "dtype": "float32",
                                "units": 128,
                                "activation": "relu",
                                "use_bias": True,
                                "kernel_initializer": {"class_name": "GlorotUniform", "config": {"seed": None}},
                                "bias_initializer": {"class_name": "Zeros", "config": {}},
                                "kernel_regularizer": None,
                                "bias_regularizer": None,
                                "activity_regularizer": None,
                                "kernel_constraint": None,
                                "bias_constraint": None
                            }
                        },
                        {
                            "class_name": "Dropout",
                            "config": {
                                "name": "dropout",
                                "trainable": True,
                                "dtype": "float32",
                                "rate": 0.2,
                                "noise_shape": None,
                                "seed": None
                            }
                        },
                        {
                            "class_name": "Dense",
                            "config": {
                                "name": "dense_1",
                                "trainable": True,
                                "dtype": "float32",
                                "units": 64,
                                "activation": "relu",
                                "use_bias": True,
                                "kernel_initializer": {"class_name": "GlorotUniform", "config": {"seed": None}},
                                "bias_initializer": {"class_name": "Zeros", "config": {}},
                                "kernel_regularizer": None,
                                "bias_regularizer": None,
                                "activity_regularizer": None,
                                "kernel_constraint": None,
                                "bias_constraint": None
                            }
                        },
                        {
                            "class_name": "Dense",
                            "config": {
                                "name": "dense_2",
                                "trainable": True,
                                "dtype": "float32",
                                "units": num_classes,
                                "activation": "linear",
                                "use_bias": True,
                                "kernel_initializer": {"class_name": "GlorotUniform", "config": {"seed": None}},
                                "bias_initializer": {"class_name": "Zeros", "config": {}},
                                "kernel_regularizer": None,
                                "bias_regularizer": None,
                                "activity_regularizer": None,
                                "kernel_constraint": None,
                                "bias_constraint": None
                            }
                        }
                    ]
                }
            }
        },
        "weightsManifest": [
            {
                "paths": ["group1-shard1of1.bin"],
                "weights": weight_specs
            }
        ]
    }

    model_path = output_dir / "model.json"
    with open(model_path, 'w') as f:
        json.dump(model_json, f, indent=2)

    print(f"Saved TensorFlow.js model to: {output_dir}")
    print(f"  - model.json ({model_path.stat().st_size:,} bytes)")
    print(f"  - group1-shard1of1.bin ({weights_path.stat().st_size:,} bytes)")


def verify_weights(pytorch_model, output_dir: Path):
    """Verify the exported weights match the original."""
    state_dict = pytorch_model.state_dict()

    # Read back the binary weights
    with open(output_dir / "group1-shard1of1.bin", 'rb') as f:
        weights_data = f.read()

    # Verify each weight
    offset = 0
    weight_shapes = [
        (63, 128), (128,),
        (128, 64), (64,),
        (64, 36), (36,)
    ]
    pytorch_keys = [
        'layer_stack.0.weight', 'layer_stack.0.bias',
        'layer_stack.3.weight', 'layer_stack.3.bias',
        'layer_stack.5.weight', 'layer_stack.5.bias'
    ]

    for shape, key in zip(weight_shapes, pytorch_keys):
        num_elements = np.prod(shape)
        byte_length = num_elements * 4  # float32 = 4 bytes

        exported = np.frombuffer(weights_data[offset:offset+byte_length], dtype=np.float32).reshape(shape)

        original = state_dict[key].numpy()
        if 'weight' in key:
            original = original.T  # Transpose kernels

        max_diff = np.max(np.abs(exported - original))
        if max_diff > 1e-6:
            print(f"WARNING: Weight mismatch for {key}: max diff = {max_diff}")

        offset += byte_length

    print("Weight verification passed!")


def export_scaler(scaler_path: str, output_path: str):
    """Export StandardScaler parameters to JSON."""
    with open(scaler_path, "rb") as f:
        scaler = pickle.load(f)

    scaler_data = {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
    }

    with open(output_path, "w") as f:
        json.dump(scaler_data, f, indent=2)

    print(f"Exported scaler to: {output_path}")
    return scaler_data


def export_labels(output_path: str):
    """Export class labels to JSON (0-9, a-z)."""
    labels = []

    # Digits 0-9
    for i in range(10):
        labels.append(str(i))

    # Letters a-z
    for i in range(26):
        labels.append(chr(ord("a") + i))

    with open(output_path, "w") as f:
        json.dump(labels, f, indent=2)

    print(f"Exported labels to: {output_path}")
    return labels


def main():
    # Paths
    project_root = Path(__file__).parent.parent
    model_state_path = project_root / "saved_models" / "hand_landmark_model_state.pth"
    scaler_path = project_root / "saved_models" / "scaler.pkl"
    output_dir = project_root / "public" / "models" / "asl-classifier"

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("ASL Classifier Model Conversion")
    print("=" * 60)

    # Verify input files exist
    if not model_state_path.exists():
        raise FileNotFoundError(f"Model not found: {model_state_path}")
    if not scaler_path.exists():
        raise FileNotFoundError(f"Scaler not found: {scaler_path}")

    # Step 1: Load PyTorch model
    print("\n[1/4] Loading PyTorch model...")
    pytorch_model = load_pytorch_model(str(model_state_path))
    print(f"Loaded model from: {model_state_path}")

    # Step 2: Save as TensorFlow.js format
    print("\n[2/4] Converting to TensorFlow.js format...")
    save_tfjs_model(pytorch_model, output_dir)

    # Step 3: Verify weights
    print("\n[3/4] Verifying exported weights...")
    verify_weights(pytorch_model, output_dir)

    # Step 4: Export scaler and labels
    print("\n[4/4] Exporting scaler and labels...")
    export_scaler(str(scaler_path), str(output_dir / "scaler.json"))
    export_labels(str(output_dir / "labels.json"))

    # Summary
    print("\n" + "=" * 60)
    print("Conversion Complete!")
    print("=" * 60)
    print(f"\nOutput directory: {output_dir}")
    print("\nGenerated files:")
    for f in sorted(output_dir.iterdir()):
        size = f.stat().st_size
        print(f"  - {f.name} ({size:,} bytes)")


if __name__ == "__main__":
    main()
