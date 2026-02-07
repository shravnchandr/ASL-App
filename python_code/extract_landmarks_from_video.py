"""
Extract MediaPipe Landmarks from Video Files

This script extracts pose, hand, and face landmarks from video files
using MediaPipe HolisticLandmarker (Tasks API), then converts them to
the JSON format used by the ASL learning feature.

Setup (requires Python 3.11 - MediaPipe doesn't support 3.12+):
    # Create a separate virtual environment for extraction
    cd python_code
    python3.11 -m venv .venv-extraction
    source .venv-extraction/bin/activate  # On Windows: .venv-extraction\\Scripts\\activate
    pip install mediapipe opencv-python yt-dlp

Usage:
    # Activate the extraction environment first
    source python_code/.venv-extraction/bin/activate

    # Extract from a single video
    python python_code/extract_landmarks_from_video.py --video path/to/video.mp4 --sign "hello"

    # Extract from a folder of videos (filename = sign name)
    python python_code/extract_landmarks_from_video.py --folder path/to/videos/

    # Download from YouTube and extract
    python python_code/extract_landmarks_from_video.py --youtube "https://youtube.com/watch?v=..." --sign "hello"

Output:
    public/sign-data/signs/{sign}.json
"""

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional
import tempfile

try:
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mp_tasks
    from mediapipe.tasks.python import vision
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install mediapipe opencv-python")
    sys.exit(1)

# ============================================================
# CONFIGURATION (must match convert_landmarks.py)
# ============================================================

FACE_KEYPOINTS = {
    "left_eyebrow": [70, 63, 105, 66, 107],
    "right_eyebrow": [336, 296, 334, 293, 300],
    "left_eye": [33, 133, 159, 145],
    "right_eye": [362, 263, 386, 374],
    "mouth": [61, 291, 0, 17, 78, 308, 13, 14],
    "nose": [1, 4],
    "chin": [152, 377, 400, 148, 176],
}

FACE_INDICES = []
for indices in FACE_KEYPOINTS.values():
    FACE_INDICES.extend(indices)
FACE_INDICES = sorted(set(FACE_INDICES))
FACE_INDEX_MAP = {orig: new for new, orig in enumerate(FACE_INDICES)}

POSE_COUNT = 33
HAND_COUNT = 21

BASE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = BASE_DIR / "public" / "sign-data" / "signs"
MODEL_DIR = BASE_DIR / "mediapipe_models"

# Individual model files
POSE_MODEL_PATH = MODEL_DIR / "pose_landmarker_full.task"
HAND_MODEL_PATH = MODEL_DIR / "hand_landmarker.task"
FACE_MODEL_PATH = MODEL_DIR / "face_landmarker.task"

# Model download URLs
MODEL_URLS = {
    "pose": (
        "pose_landmarker_full.task",
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
    ),
    "hand": (
        "hand_landmarker.task",
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
    ),
    "face": (
        "face_landmarker.task",
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
    ),
}


def download_models_if_needed():
    """Download required model files if not present."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    for model_type, (filename, url) in MODEL_URLS.items():
        model_path = MODEL_DIR / filename
        if model_path.exists():
            print(f"  {model_type} model already downloaded: {model_path}")
        else:
            print(f"  Downloading {model_type} model...")
            print(f"  URL: {url}")
            try:
                urllib.request.urlretrieve(url, model_path)
                print(f"  Model saved to: {model_path}")
            except Exception as e:
                print(f"  ERROR: Failed to download {model_type} model: {e}")
                sys.exit(1)


def download_youtube_video(url: str, output_dir: str) -> Optional[str]:
    """Download a YouTube video using yt-dlp."""
    try:
        import yt_dlp
    except ImportError:
        print("yt-dlp not installed. Install with: pip install yt-dlp")
        return None

    output_template = os.path.join(output_dir, "%(id)s.%(ext)s")
    ydl_opts = {
        "format": "best[ext=mp4]/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            video_id = info["id"]
            ext = info.get("ext", "mp4")
            return os.path.join(output_dir, f"{video_id}.{ext}")
    except Exception as e:
        print(f"Error downloading video: {e}")
        return None


def extract_landmarks_from_video(video_path: str) -> Optional[List[Dict]]:
    """
    Extract landmarks from a video file using separate MediaPipe landmarkers
    (Pose, Hand, Face) and combine the results.

    Returns list of frames, each containing pose, left_hand, right_hand, face.
    """
    # Ensure models are downloaded
    download_models_if_needed()

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Cannot open video {video_path}")
        return None

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    frames = []

    # Configure PoseLandmarker
    pose_options = vision.PoseLandmarkerOptions(
        base_options=mp_tasks.BaseOptions(model_asset_path=str(POSE_MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    # Configure HandLandmarker (detects both hands)
    hand_options = vision.HandLandmarkerOptions(
        base_options=mp_tasks.BaseOptions(model_asset_path=str(HAND_MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    # Configure FaceLandmarker (lower confidence for better detection)
    face_options = vision.FaceLandmarkerOptions(
        base_options=mp_tasks.BaseOptions(model_asset_path=str(FACE_MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
        min_face_detection_confidence=0.3,
        min_face_presence_confidence=0.3,
        min_tracking_confidence=0.3,
    )

    # Create landmarkers
    pose_landmarker = vision.PoseLandmarker.create_from_options(pose_options)
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)
    face_landmarker = vision.FaceLandmarker.create_from_options(face_options)

    try:
        frame_count = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Convert BGR to RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # Create MediaPipe Image
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

            # Calculate timestamp in milliseconds
            timestamp_ms = int((frame_count / fps) * 1000)

            # Process frame with each landmarker
            pose_results = pose_landmarker.detect_for_video(mp_image, timestamp_ms)
            hand_results = hand_landmarker.detect_for_video(mp_image, timestamp_ms)
            face_results = face_landmarker.detect_for_video(mp_image, timestamp_ms)

            frame_data = {
                "pose": [None] * POSE_COUNT,
                "left_hand": [None] * HAND_COUNT,
                "right_hand": [None] * HAND_COUNT,
                "face": [None] * len(FACE_INDICES),
            }

            # Extract pose landmarks
            if pose_results.pose_landmarks and len(pose_results.pose_landmarks) > 0:
                landmarks = pose_results.pose_landmarks[0]  # First person detected
                for i, lm in enumerate(landmarks):
                    if i < POSE_COUNT:
                        frame_data["pose"][i] = [
                            round(lm.x, 4),
                            round(lm.y, 4),
                            round(lm.z, 4),
                        ]

            # Extract hand landmarks
            # HandLandmarker returns handedness info to determine left/right
            if hand_results.hand_landmarks and hand_results.handedness:
                for idx, (hand_landmarks, handedness_list) in enumerate(
                    zip(hand_results.hand_landmarks, hand_results.handedness)
                ):
                    # handedness_list is a list of Category, get the first one
                    if handedness_list:
                        hand_label = handedness_list[0].category_name.lower()
                        # Note: MediaPipe's handedness is from the camera's perspective
                        # So "Left" means user's right hand when facing the camera
                        key = "left_hand" if hand_label == "left" else "right_hand"
                        for i, lm in enumerate(hand_landmarks):
                            if i < HAND_COUNT:
                                frame_data[key][i] = [
                                    round(lm.x, 4),
                                    round(lm.y, 4),
                                    round(lm.z, 4),
                                ]

            # Extract face landmarks (only key points from the full 478 landmarks)
            if face_results.face_landmarks and len(face_results.face_landmarks) > 0:
                landmarks = face_results.face_landmarks[0]  # First face detected
                for orig_idx in FACE_INDICES:
                    if orig_idx < len(landmarks):
                        lm = landmarks[orig_idx]
                        new_idx = FACE_INDEX_MAP[orig_idx]
                        frame_data["face"][new_idx] = [
                            round(lm.x, 4),
                            round(lm.y, 4),
                            round(lm.z, 4),
                        ]

            frames.append(frame_data)
            frame_count += 1

            # Progress indicator
            if frame_count % 30 == 0:
                print(f"  Processed {frame_count} frames...")

    finally:
        pose_landmarker.close()
        hand_landmarker.close()
        face_landmarker.close()
        cap.release()

    print(f"  Extracted {len(frames)} frames at {fps} fps")

    return frames if frames else None


def save_sign_data(sign: str, frames: List[Dict], fps: float = 25) -> str:
    """Save extracted landmarks to JSON file."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    sign_lower = sign.lower().replace(" ", "_")
    output_path = OUTPUT_DIR / f"{sign_lower}.json"

    data = {
        "sign": sign_lower,
        "frames": frames,
        "frame_count": len(frames),
        "fps": fps,
        "source": "extracted",
    }

    with open(output_path, "w") as f:
        json.dump(data, f, separators=(",", ":"))

    file_size = output_path.stat().st_size / 1024
    print(f"  Saved: {sign_lower}.json ({file_size:.1f} KB, {len(frames)} frames)")

    return str(output_path)


def update_metadata(sign: str, frame_count: int, fps: float = 25):
    """Update metadata.json with the new sign."""
    metadata_path = OUTPUT_DIR.parent / "metadata.json"

    if metadata_path.exists():
        with open(metadata_path) as f:
            metadata = json.load(f)
    else:
        metadata = {
            "version": "1.0",
            "total_signs": 0,
            "face_landmark_count": len(FACE_INDICES),
            "pose_landmark_count": POSE_COUNT,
            "hand_landmark_count": HAND_COUNT,
            "face_keypoint_mapping": FACE_KEYPOINTS,
            "face_indices": FACE_INDICES,
            "signs": {},
        }

    sign_lower = sign.lower().replace(" ", "_")
    metadata["signs"][sign_lower] = {
        "difficulty": "other",
        "frame_count": frame_count,
        "fps": fps,
        "source": "extracted",
    }
    metadata["total_signs"] = len(metadata["signs"])
    metadata["signs"] = dict(sorted(metadata["signs"].items()))

    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"  Updated metadata.json ({metadata['total_signs']} total signs)")


def process_video(video_path: str, sign: str):
    """Process a single video file."""
    print(f"\nProcessing: {sign}")
    print(f"  Video: {video_path}")

    frames = extract_landmarks_from_video(video_path)
    if not frames:
        print(f"  ERROR: Failed to extract landmarks")
        return False

    # Get video FPS
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    cap.release()

    save_sign_data(sign, frames, fps)
    update_metadata(sign, len(frames), fps)

    return True


def process_folder(folder_path: str):
    """Process all videos in a folder. Filename (without extension) = sign name."""
    folder = Path(folder_path)
    video_extensions = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

    video_files = [f for f in folder.iterdir() if f.suffix.lower() in video_extensions]

    if not video_files:
        print(f"No video files found in {folder_path}")
        return

    print(f"Found {len(video_files)} videos")

    for video_file in video_files:
        sign = video_file.stem  # filename without extension
        process_video(str(video_file), sign)


def main():
    parser = argparse.ArgumentParser(
        description="Extract MediaPipe landmarks from ASL sign videos"
    )
    parser.add_argument("--video", "-v", help="Path to video file")
    parser.add_argument(
        "--sign", "-s", help="Name of the sign (required with --video or --youtube)"
    )
    parser.add_argument(
        "--folder", "-f", help="Process all videos in folder (filename = sign name)"
    )
    parser.add_argument("--youtube", "-y", help="YouTube URL to download and process")

    args = parser.parse_args()

    if not any([args.video, args.folder, args.youtube]):
        parser.print_help()
        print("\nExamples:")
        print("  python extract_landmarks_from_video.py --video hello.mp4 --sign hello")
        print("  python extract_landmarks_from_video.py --folder ./asl_videos/")
        print(
            "  python extract_landmarks_from_video.py --youtube 'https://youtube.com/watch?v=...' --sign hello"
        )
        return

    print("=" * 60)
    print("ASL Landmark Extractor")
    print("=" * 60)

    if args.youtube:
        if not args.sign:
            print("ERROR: --sign required with --youtube")
            return

        print(f"\nDownloading from YouTube...")
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = download_youtube_video(args.youtube, tmpdir)
            if video_path:
                process_video(video_path, args.sign)
            else:
                print("Failed to download video")

    elif args.video:
        if not args.sign:
            print("ERROR: --sign required with --video")
            return
        process_video(args.video, args.sign)

    elif args.folder:
        process_folder(args.folder)

    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == "__main__":
    main()
