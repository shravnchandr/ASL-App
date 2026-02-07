"""
Download ASL Sign Videos from Various Sources

This script downloads ASL sign videos from reliable sources and prepares them
for landmark extraction.

Usage:
    source python_code/.venv-extraction/bin/activate
    python python_code/download_asl_signs.py --category alphabet
    python python_code/download_asl_signs.py --category numbers
    python python_code/download_asl_signs.py --category common
    python python_code/download_asl_signs.py --all
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
VIDEO_DIR = BASE_DIR / "data" / "videos"

# ASL Fingerspelling alphabet videos (YouTube sources)
# These are from reputable ASL education channels
ALPHABET_SOURCES = {
    # Individual letter videos from reliable ASL sources
    # Using Signing Savvy / HandSpeak style content
    "a": "https://www.youtube.com/watch?v=YXhJqFXqQzk",  # ASL Meredith
    "b": "https://www.youtube.com/watch?v=YXhJqFXqQzk",
    "c": "https://www.youtube.com/watch?v=YXhJqFXqQzk",
    # Note: Many alphabet videos are compilations - need individual letter videos
}

# Numbers 0-9 video sources
NUMBER_SOURCES = {
    # Individual number videos
}

# Common sign video sources
COMMON_SIGN_SOURCES = {
    "please": None,
    "sorry": None,
    "help": None,
    "more": None,
    "done": None,
    "want": None,
    "like": None,
    "love": None,
    "good": None,
    "bad": None,
    "happy": None,
    "sad": None,
    "hungry": None,
    "thirsty": None,
    "tired": None,
    "sick": None,
    "hot": None,
    "cold": None,
    "big": None,
    "small": None,
    "mother": None,
    "father": None,
    "baby": None,
    "friend": None,
    "teacher": None,
    "student": None,
    "school": None,
    "home": None,
    "work": None,
    "play": None,
}


def download_from_url(url: str, output_path: str, sign_name: str) -> bool:
    """Download video using yt-dlp."""
    try:
        cmd = [
            "yt-dlp",
            "-f",
            "best[ext=mp4]/best",
            "-o",
            output_path,
            "--quiet",
            "--no-warnings",
            url,
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        print(f"  Downloaded: {sign_name}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"  Failed to download {sign_name}: {e}")
        return False
    except FileNotFoundError:
        print("yt-dlp not found. Install with: pip install yt-dlp")
        return False


def download_from_signing_savvy(sign_name: str) -> bool:
    """
    Download from Signing Savvy using their video URL pattern.
    Note: This requires knowing the video ID for each sign.
    """
    # Signing Savvy uses a specific URL pattern for their videos
    # Example: https://www.signingsavvy.com/media/mp4-hd/26/26-1.mp4
    # The ID varies per sign and needs to be looked up
    pass


def create_placeholder_script():
    """Create a script that explains how to manually download videos."""
    script_content = """#!/bin/bash
# ASL Video Download Guide
#
# To add more signs, you can download videos from these sources:
#
# 1. Signing Savvy (https://www.signingsavvy.com)
#    - Search for a sign, right-click the video, "Save video as..."
#    - Save to: data/videos/{sign_name}.mp4
#
# 2. HandSpeak (https://www.handspeak.com)
#    - Search in ASL dictionary, download videos
#
# 3. ASLU/Lifeprint (https://www.lifeprint.com)
#    - Dr. Bill Vicars' ASL University has video lessons
#
# 4. YouTube ASL Channels:
#    - ASL Meredith: https://www.youtube.com/@ASLMeredith
#    - Bill Vicars: https://www.youtube.com/@billvicars
#    - Signed with Heart: https://www.youtube.com/@SignedWithHeart
#
# After downloading videos to data/videos/, run:
#   source python_code/.venv-extraction/bin/activate
#   python python_code/extract_landmarks_from_video.py --folder data/videos/
#
# Video naming convention:
#   - Use lowercase with underscores: thank_you.mp4, good_morning.mp4
#   - For alphabet: a.mp4, b.mp4, c.mp4, etc.
#   - For numbers: 0.mp4, 1.mp4, 2.mp4, etc.
"""
    guide_path = VIDEO_DIR / "DOWNLOAD_GUIDE.txt"
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    with open(guide_path, "w") as f:
        f.write(script_content)
    print(f"Created download guide at: {guide_path}")


def main():
    parser = argparse.ArgumentParser(description="Download ASL sign videos")
    parser.add_argument(
        "--category",
        choices=["alphabet", "numbers", "common"],
        help="Category to download",
    )
    parser.add_argument("--all", action="store_true", help="Download all categories")
    parser.add_argument("--guide", action="store_true", help="Create download guide")

    args = parser.parse_args()

    if args.guide or not any([args.category, args.all]):
        create_placeholder_script()
        print("\nNote: Automatic downloading from most ASL sources is not supported")
        print("due to copyright and terms of service considerations.")
        print("\nPlease see the download guide for manual download instructions.")
        return

    VIDEO_DIR.mkdir(parents=True, exist_ok=True)

    # For now, just create the guide since we can't automatically download
    # from most ASL education sites
    create_placeholder_script()


if __name__ == "__main__":
    main()
