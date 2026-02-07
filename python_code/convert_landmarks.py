"""
ASL Landmark Converter

Converts parquet landmark data to optimized JSON for web delivery.
Reduces face landmarks from 468 to ~33 key points for efficient animation.

Usage:
    python python_code/convert_landmarks.py

Output:
    public/sign-data/signs/{sign}.json - Per-sign landmark data
    public/sign-data/metadata.json - Sign list with metadata
"""

import os
import json
import pandas as pd
from pathlib import Path
from typing import Dict, List, Optional
import numpy as np

# ============================================================
# LANDMARK CONFIGURATION
# ============================================================

# Face keypoints - reduce from 468 to essential points for expression
FACE_KEYPOINTS = {
    # Eyebrows (expression markers - raised/furrowed)
    "left_eyebrow": [70, 63, 105, 66, 107],  # 5 points
    "right_eyebrow": [336, 296, 334, 293, 300],  # 5 points
    # Eyes (for eye gaze, widening)
    "left_eye": [33, 133, 159, 145],  # 4 points
    "right_eye": [362, 263, 386, 374],  # 4 points
    # Mouth (essential for ASL grammar)
    "mouth": [61, 291, 0, 17, 78, 308, 13, 14],  # 8 points (corners + lips)
    # Nose
    "nose": [1, 4],  # 2 points
    # Face outline (simplified)
    "chin": [152, 377, 400, 148, 176],  # 5 points
}

# Flatten face keypoints to a list of indices
FACE_INDICES = []
for indices in FACE_KEYPOINTS.values():
    FACE_INDICES.extend(indices)
FACE_INDICES = sorted(set(FACE_INDICES))  # 33 unique points

# Create mapping from original index to new index
FACE_INDEX_MAP = {orig: new for new, orig in enumerate(FACE_INDICES)}

# Pose landmarks (all 33 MediaPipe pose points)
POSE_COUNT = 33

# Hand landmarks (21 points each)
HAND_COUNT = 21

# ============================================================
# MVP SIGN SELECTION (50 signs)
# ============================================================

# Beginner signs (25)
BEGINNER_SIGNS = [
    "hello",
    "bye",
    "please",
    "thankyou",
    "yes",
    "no",
    "mom",
    "dad",
    "brother",
    "grandma",
    "grandpa",
    "red",
    "blue",
    "green",
    "yellow",
    "orange",
    "black",
    "white",
    "water",
    "food",
    "eat",
    "drink",
    "sleep",
    "happy",
    "sad",
]

# Intermediate signs (25)
INTERMEDIATE_SIGNS = [
    "dog",
    "cat",
    "bird",
    "fish",
    "cow",
    "elephant",
    "go",
    "wait",
    "finish",
    "open",
    "close",
    "like",
    "hungry",
    "thirsty",
    "tired",
    "sick",
    "mad",
    "morning",
    "night",
    "now",
    "tomorrow",
    "help",
    "want",
    "need",
    "love",
]

MVP_SIGNS = set(sign.lower() for sign in BEGINNER_SIGNS + INTERMEDIATE_SIGNS)

# Process all available signs (for demo/testing with limited data)
PROCESS_ALL_AVAILABLE = True

# ============================================================
# DATA PATHS
# ============================================================

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "public" / "sign-data"
SIGNS_OUTPUT_DIR = OUTPUT_DIR / "signs"

# Dataset paths
ISOLATED_ASL_DIR = DATA_DIR / "Isolated_ASL_Recognition"
WLASL_DIR = DATA_DIR / "WLASL_Landmarks"


def process_parquet_file(parquet_path: Path) -> Optional[List[Dict]]:
    """
    Process a single parquet file (long format) and return frames data.

    Parquet format: frame, row_id, type, landmark_index, x, y, z
    Each row is one landmark for one frame.
    """
    if not parquet_path.exists():
        return None

    try:
        df = pd.read_parquet(parquet_path)

        # Get unique frames sorted
        frames_list = sorted(df["frame"].unique())

        frames = []
        for frame_num in frames_list:
            frame_df = df[df["frame"] == frame_num]

            frame_data = {
                "pose": [None] * POSE_COUNT,
                "left_hand": [None] * HAND_COUNT,
                "right_hand": [None] * HAND_COUNT,
                "face": [None] * len(FACE_INDICES),
            }

            for _, row in frame_df.iterrows():
                landmark_type = row["type"]
                idx = int(row["landmark_index"])
                x, y, z = row["x"], row["y"], row["z"]

                # Skip if coordinates are NaN
                if pd.isna(x) or pd.isna(y) or pd.isna(z):
                    continue

                coords = [round(float(x), 4), round(float(y), 4), round(float(z), 4)]

                if landmark_type == "pose" and idx < POSE_COUNT:
                    frame_data["pose"][idx] = coords
                elif landmark_type == "left_hand" and idx < HAND_COUNT:
                    frame_data["left_hand"][idx] = coords
                elif landmark_type == "right_hand" and idx < HAND_COUNT:
                    frame_data["right_hand"][idx] = coords
                elif landmark_type == "face" and idx in FACE_INDEX_MAP:
                    new_idx = FACE_INDEX_MAP[idx]
                    frame_data["face"][new_idx] = coords

            frames.append(frame_data)

        return frames
    except Exception as e:
        print(f"  Error reading {parquet_path}: {e}")
        return None


def find_best_sample(samples: List[Dict]) -> Dict:
    """Select the best sample based on data quality (most non-null landmarks)."""

    def score_sample(sample: Dict) -> int:
        """Score a sample based on landmark completeness."""
        score = 0
        for frame in sample.get("frames", []):
            for landmark_type in ["pose", "left_hand", "right_hand", "face"]:
                landmarks = frame.get(landmark_type, [])
                score += sum(1 for lm in landmarks if lm is not None)
        return score

    return max(samples, key=score_sample)


def get_available_parquet_files(base_dir: Path) -> set:
    """Find all parquet files that actually exist on disk."""
    parquet_files = set()
    for parquet_path in base_dir.rglob("*.parquet"):
        # Get relative path from base_dir
        rel_path = parquet_path.relative_to(base_dir)
        parquet_files.add(str(rel_path))
    return parquet_files


def process_isolated_asl(target_signs: set) -> Dict[str, Dict]:
    """Process Isolated ASL Recognition dataset."""

    print("\n=== Processing Isolated ASL Recognition ===")

    train_csv = ISOLATED_ASL_DIR / "train.csv"
    sign_map_path = ISOLATED_ASL_DIR / "sign_to_prediction_index_map.json"

    if not train_csv.exists():
        print(f"  CSV not found: {train_csv}")
        return {}

    # Load sign mapping to get available signs
    available_signs = set()
    if sign_map_path.exists():
        with open(sign_map_path) as f:
            sign_map = json.load(f)
            available_signs = set(sign_map.keys())
            print(f"  Signs in dataset metadata: {len(available_signs)}")

    # Find actually available parquet files
    available_parquets = get_available_parquet_files(ISOLATED_ASL_DIR)
    print(f"  Parquet files on disk: {len(available_parquets)}")

    # Read CSV
    df = pd.read_csv(train_csv)
    print(f"  Total samples in CSV: {len(df)}")

    # Filter to only rows with existing parquet files
    df = df[df["path"].isin(available_parquets)]
    print(f"  Samples with parquet files: {len(df)}")

    if df.empty:
        return {}

    # Determine which signs to process
    if PROCESS_ALL_AVAILABLE:
        signs_to_process = set(df["sign"].str.lower().unique())
        print(f"  Processing all available signs: {signs_to_process}")
    else:
        signs_to_process = target_signs

    # Group by sign
    sign_samples: Dict[str, List[Dict]] = {}
    processed_count = 0

    for sign in signs_to_process:
        sign_lower = sign.lower()

        # Filter rows for this sign
        sign_rows = df[df["sign"].str.lower() == sign_lower]

        if sign_rows.empty:
            continue

        samples_for_sign = []

        # Process up to 3 samples per sign to find best quality
        for _, row in sign_rows.head(3).iterrows():
            parquet_path = ISOLATED_ASL_DIR / row["path"]
            frames = process_parquet_file(parquet_path)

            if frames and len(frames) > 0:
                samples_for_sign.append(
                    {
                        "sign": sign_lower,
                        "frames": frames,
                        "frame_count": len(frames),
                        "fps": 25,
                        "source": "isolated_asl",
                    }
                )

        if samples_for_sign:
            # Select best quality sample
            sign_samples[sign_lower] = find_best_sample(samples_for_sign)
            processed_count += 1
            print(
                f"  Processed: {sign_lower} ({len(sign_samples[sign_lower]['frames'])} frames)"
            )

    print(f"  Total signs processed: {processed_count}")
    return sign_samples


def process_wlasl(target_signs: set, exclude_signs: set) -> Dict[str, Dict]:
    """Process WLASL Landmarks dataset."""

    print("\n=== Processing WLASL Landmarks ===")

    train_csv = WLASL_DIR / "train.csv"
    sign_map_path = WLASL_DIR / "sign_to_prediction_index_map.json"

    if not train_csv.exists():
        print(f"  CSV not found: {train_csv}")
        return {}

    # Load sign mapping
    available_signs = set()
    if sign_map_path.exists():
        with open(sign_map_path) as f:
            sign_map = json.load(f)
            available_signs = set(sign_map.keys())
            print(f"  Signs in dataset metadata: {len(available_signs)}")

    # Find actually available parquet files
    available_parquets = get_available_parquet_files(WLASL_DIR)
    print(f"  Parquet files on disk: {len(available_parquets)}")

    # Read CSV
    df = pd.read_csv(train_csv)
    print(f"  Total samples in CSV: {len(df)}")

    # Filter to only rows with existing parquet files
    df = df[df["path"].isin(available_parquets)]
    print(f"  Samples with parquet files: {len(df)}")

    if df.empty:
        return {}

    # Determine which signs to process
    if PROCESS_ALL_AVAILABLE:
        signs_to_process = set(df["sign"].str.lower().unique()) - exclude_signs
        print(
            f"  Processing available signs (excluding already processed): {signs_to_process}"
        )
    else:
        signs_to_process = target_signs - exclude_signs

    sign_samples: Dict[str, Dict] = {}
    processed_count = 0

    for sign in signs_to_process:
        sign_lower = sign.lower()

        # Filter rows for this sign
        sign_rows = df[df["sign"].str.lower() == sign_lower]

        if sign_rows.empty:
            continue

        samples_for_sign = []

        # Process up to 3 samples per sign
        for _, row in sign_rows.head(3).iterrows():
            parquet_path = WLASL_DIR / row["path"]
            frames = process_parquet_file(parquet_path)

            if frames and len(frames) > 0:
                samples_for_sign.append(
                    {
                        "sign": sign_lower,
                        "frames": frames,
                        "frame_count": len(frames),
                        "fps": 25,
                        "source": "wlasl",
                    }
                )

        if samples_for_sign:
            sign_samples[sign_lower] = find_best_sample(samples_for_sign)
            processed_count += 1
            print(
                f"  Processed: {sign_lower} ({len(sign_samples[sign_lower]['frames'])} frames)"
            )

    print(f"  Total signs processed: {processed_count}")
    return sign_samples


def save_sign_data(sign_data: Dict[str, Dict]) -> None:
    """Save sign data to JSON files."""

    print("\n=== Saving Sign Data ===")

    # Create output directories
    SIGNS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for sign, data in sign_data.items():
        output_path = SIGNS_OUTPUT_DIR / f"{sign}.json"

        with open(output_path, "w") as f:
            json.dump(data, f, separators=(",", ":"))  # Compact JSON

        file_size = output_path.stat().st_size / 1024  # KB
        print(
            f"  Saved: {sign}.json ({file_size:.1f} KB, {data['frame_count']} frames)"
        )


def create_metadata(sign_data: Dict[str, Dict]) -> None:
    """Create metadata.json with sign list and difficulty levels."""

    print("\n=== Creating Metadata ===")

    beginner_set = set(s.lower() for s in BEGINNER_SIGNS)
    intermediate_set = set(s.lower() for s in INTERMEDIATE_SIGNS)

    metadata = {
        "version": "1.0",
        "total_signs": len(sign_data),
        "face_landmark_count": len(FACE_INDICES),
        "pose_landmark_count": POSE_COUNT,
        "hand_landmark_count": HAND_COUNT,
        "face_keypoint_mapping": FACE_KEYPOINTS,
        "face_indices": FACE_INDICES,
        "signs": {},
    }

    for sign, data in sign_data.items():
        if sign in beginner_set:
            difficulty = "beginner"
        elif sign in intermediate_set:
            difficulty = "intermediate"
        else:
            difficulty = "other"  # Signs not in MVP list

        metadata["signs"][sign] = {
            "difficulty": difficulty,
            "frame_count": data["frame_count"],
            "fps": data["fps"],
            "source": data["source"],
        }

    # Sort signs alphabetically
    metadata["signs"] = dict(sorted(metadata["signs"].items()))

    output_path = OUTPUT_DIR / "metadata.json"
    with open(output_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"  Saved: metadata.json ({len(sign_data)} signs)")

    # Print summary
    beginner_count = sum(
        1 for s in metadata["signs"].values() if s["difficulty"] == "beginner"
    )
    intermediate_count = sum(
        1 for s in metadata["signs"].values() if s["difficulty"] == "intermediate"
    )
    other_count = sum(
        1 for s in metadata["signs"].values() if s["difficulty"] == "other"
    )
    print(f"\n  Summary:")
    print(f"    Beginner signs: {beginner_count}")
    print(f"    Intermediate signs: {intermediate_count}")
    print(f"    Other signs: {other_count}")


def main():
    """Main conversion pipeline."""

    print("=" * 60)
    print("ASL Landmark Converter")
    print("=" * 60)

    print(f"\nTarget signs (MVP): {len(MVP_SIGNS)}")
    print(f"Face landmarks: {len(FACE_INDICES)} (reduced from 468)")

    # Process datasets
    all_sign_data: Dict[str, Dict] = {}

    # 1. Process Isolated ASL (higher quality, child-friendly)
    isolated_signs = process_isolated_asl(MVP_SIGNS)
    all_sign_data.update(isolated_signs)

    # 2. Process WLASL for signs not found in Isolated ASL
    wlasl_signs = process_wlasl(MVP_SIGNS, set(isolated_signs.keys()))
    all_sign_data.update(wlasl_signs)

    if not all_sign_data:
        print("\nNo sign data was processed. Check that parquet files exist.")
        return

    # Save data
    save_sign_data(all_sign_data)
    create_metadata(all_sign_data)

    # Report missing signs
    found_signs = set(all_sign_data.keys())
    missing_signs = MVP_SIGNS - found_signs

    if missing_signs:
        print(f"\n  Missing MVP signs ({len(missing_signs)}):")
        for sign in sorted(missing_signs):
            print(f"    - {sign}")

    print("\n" + "=" * 60)
    print("Conversion complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
