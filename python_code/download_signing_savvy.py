"""
Download ASL Sign Videos from Signing Savvy

This script downloads ASL sign videos from Signing Savvy for landmark extraction.
Signing Savvy provides high-quality ASL demonstration videos.

Usage:
    source python_code/.venv-extraction/bin/activate
    python python_code/download_signing_savvy.py --signs hello thank_you
    python python_code/download_signing_savvy.py --alphabet
    python python_code/download_signing_savvy.py --numbers
    python python_code/download_signing_savvy.py --common
    python python_code/download_signing_savvy.py --all
"""

import argparse
import os
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import List, Optional
from urllib.error import HTTPError, URLError

try:
    from bs4 import BeautifulSoup

    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

BASE_DIR = Path(__file__).parent.parent
VIDEO_DIR = BASE_DIR / "data" / "videos"

# Signing Savvy base URL
SIGNING_SAVVY_BASE = "https://www.signingsavvy.com"

# Common signs to download
COMMON_SIGNS = [
    # Greetings & Basics
    "please",
    "sorry",
    "thank_you",
    "hello",
    "goodbye",
    "yes",
    "no",
    "help",
    "more",
    "done",
    "finished",
    "want",
    "need",
    "like",
    "love",
    # Feelings
    "happy",
    "sad",
    "angry",
    "scared",
    "tired",
    "sick",
    "hungry",
    "thirsty",
    "good",
    "bad",
    "fine",
    "okay",
    # Family
    "mother",
    "father",
    "sister",
    "brother",
    "baby",
    "family",
    "friend",
    "grandmother",
    "grandfather",
    # Actions
    "eat",
    "drink",
    "sleep",
    "go",
    "come",
    "stop",
    "wait",
    "sit",
    "stand",
    "walk",
    "run",
    "play",
    "work",
    "learn",
    "teach",
    "read",
    "write",
    # Questions
    "what",
    "where",
    "when",
    "why",
    "how",
    "who",
    "which",
    # Time
    "now",
    "later",
    "tomorrow",
    "yesterday",
    "today",
    "morning",
    "night",
    # Places
    "home",
    "school",
    "store",
    "hospital",
    "bathroom",
    # Objects
    "food",
    "water",
    "book",
    "phone",
    "car",
    "house",
    # Descriptors
    "big",
    "small",
    "hot",
    "cold",
    "new",
    "old",
]

# ASL Alphabet - with Signing Savvy IDs
# Pattern: /sign/{letter}/{id}/1 where id starts at 5820 for 'a'
ALPHABET = list("abcdefghijklmnopqrstuvwxyz")
ALPHABET_START_ID = 5820  # 'a' = 5820, 'b' = 5821, etc.

# Numbers 1-10 with explicit Signing Savvy URLs
NUMBER_URLS = {
    "one": "https://www.signingsavvy.com/sign/one/4013/1",
    "two": "https://www.signingsavvy.com/sign/two/4792/1",
    "three": "https://www.signingsavvy.com/sign/three/4753/1",
    "four": "https://www.signingsavvy.com/sign/four/12582/1",
    "five": "https://www.signingsavvy.com/sign/five/3462/1",
    "six": "https://www.signingsavvy.com/sign/six/4514/1",
    "seven": "https://www.signingsavvy.com/sign/seven/4472/1",
    "eight": "https://www.signingsavvy.com/sign/eight/3354/1",
    "nine": "https://www.signingsavvy.com/sign/nine/3961/1",
    "ten": "https://www.signingsavvy.com/sign/ten/4721/1",
}
NUMBERS = list(NUMBER_URLS.keys())

# Months - some have explicit URLs, others use search
MONTH_URLS = {
    "march": "https://www.signingsavvy.com/sign/march/793/1",
    "april": "https://www.signingsavvy.com/sign/april/794/1",
    "may": "https://www.signingsavvy.com/sign/may/790/1",
}
MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
]


def get_video_url_from_explicit_page(page_url: str) -> Optional[str]:
    """
    Get video URL from an explicit Signing Savvy page URL.
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        req = urllib.request.Request(page_url, headers=headers)

        with urllib.request.urlopen(req, timeout=15) as response:
            html = response.read().decode("utf-8")

        # Look for mp4 URLs in the HTML
        mp4_urls = re.findall(
            r'https?://www\.signingsavvy\.com/media2?/[^\s<>"\']+\.mp4', html
        )
        if mp4_urls:
            return mp4_urls[0]

        return None

    except (HTTPError, URLError) as e:
        print(f"  Error fetching page: {e}")
        return None


def get_alphabet_video_url(letter: str) -> Optional[str]:
    """
    Get video URL for alphabet letters using the known Signing Savvy ID pattern.
    Pattern: /sign/{letter}/{id}/1 where id starts at 5820 for 'a'
    """
    letter = letter.lower()
    if len(letter) != 1 or letter not in ALPHABET:
        return None

    # Calculate the ID for this letter
    letter_index = ord(letter) - ord("a")
    sign_id = ALPHABET_START_ID + letter_index

    # Construct the URL
    page_url = f"{SIGNING_SAVVY_BASE}/sign/{letter}/{sign_id}/1"

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        req = urllib.request.Request(page_url, headers=headers)

        with urllib.request.urlopen(req, timeout=15) as response:
            html = response.read().decode("utf-8")

        # Look for mp4 URLs in the HTML
        mp4_urls = re.findall(
            r'https?://www\.signingsavvy\.com/media2?/[^\s<>"\']+\.mp4', html
        )
        if mp4_urls:
            return mp4_urls[0]

        return None

    except (HTTPError, URLError) as e:
        print(f"  Error fetching alphabet {letter}: {e}")
        return None


def get_video_url_from_page(sign: str) -> Optional[str]:
    """
    Fetch the Signing Savvy page for a sign and extract the video URL.
    Uses the search URL pattern which works better for finding videos.
    Note: Many signs require membership - only free signs will have videos.
    """
    # Use search URL pattern (works better than direct /sign/ URLs)
    sign_lower = sign.lower().replace("_", " ").replace("-", " ")
    search_url = f"{SIGNING_SAVVY_BASE}/search/{sign_lower.replace(' ', '%20')}"

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        req = urllib.request.Request(search_url, headers=headers)

        with urllib.request.urlopen(req, timeout=15) as response:
            html = response.read().decode("utf-8")

        # Look for direct mp4 URLs in the HTML (pattern from successful downloads)
        mp4_urls = re.findall(
            r'https?://www\.signingsavvy\.com/media2?/[^\s<>"\']+\.mp4', html
        )
        if mp4_urls:
            return mp4_urls[0]

        # Also try relative URLs
        relative_urls = re.findall(r'/media2?/[^\s<>"\']+\.mp4', html)
        if relative_urls:
            return SIGNING_SAVVY_BASE + relative_urls[0]

        # If no mp4 found, this sign likely requires membership
        return None

    except (HTTPError, URLError) as e:
        print(f"  Error fetching {sign}: {e}")
        return None


def download_video(url: str, output_path: Path) -> bool:
    """Download video from URL."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        req = urllib.request.Request(url, headers=headers)

        with urllib.request.urlopen(req, timeout=30) as response:
            with open(output_path, "wb") as f:
                f.write(response.read())
        return True

    except (HTTPError, URLError) as e:
        print(f"  Download failed: {e}")
        return False


def download_sign(sign: str, force: bool = False, is_alphabet: bool = False) -> bool:
    """Download a single sign video."""
    # Normalize sign name
    sign_key = sign.lower().replace(" ", "_").replace("-", "_")
    output_path = VIDEO_DIR / f"{sign_key}.mp4"

    if output_path.exists() and not force:
        print(f"  Skipping {sign_key} (already exists)")
        return True

    print(f"  Fetching {sign_key}...")

    video_url = None

    # Check if there's an explicit URL for this sign (e.g., numbers, some months)
    if sign_key in NUMBER_URLS:
        video_url = get_video_url_from_explicit_page(NUMBER_URLS[sign_key])
    elif sign_key in MONTH_URLS:
        video_url = get_video_url_from_explicit_page(MONTH_URLS[sign_key])
    # Use alphabet-specific function for single letters
    elif is_alphabet or (len(sign_key) == 1 and sign_key in ALPHABET):
        video_url = get_alphabet_video_url(sign_key)
    else:
        video_url = get_video_url_from_page(sign_key)
        if not video_url:
            # Try without underscores
            video_url = get_video_url_from_page(sign.lower().replace("_", " "))

    if not video_url:
        print(f"  Could not find video for: {sign_key}")
        return False

    print(f"  Downloading from: {video_url}")

    if download_video(video_url, output_path):
        print(f"  Saved: {output_path.name}")
        return True

    return False


def download_signs(signs: List[str], force: bool = False, is_alphabet: bool = False):
    """Download multiple sign videos."""
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)

    success = 0
    failed = []

    for i, sign in enumerate(signs):
        print(f"\n[{i+1}/{len(signs)}] {sign}")

        if download_sign(sign, force, is_alphabet=is_alphabet):
            success += 1
        else:
            failed.append(sign)

        # Be respectful - add delay between requests
        time.sleep(1)

    print(f"\n{'='*50}")
    print(f"Downloaded: {success}/{len(signs)} signs")
    if failed:
        print(f"Failed: {', '.join(failed)}")


def download_alphabet_videos(force: bool = False):
    """
    Download alphabet fingerspelling videos.
    Uses the known Signing Savvy ID pattern: /sign/{letter}/{id}/1
    where id starts at 5820 for 'a' and increments for each letter.
    """
    print("\n" + "=" * 50)
    print("Downloading ASL Alphabet (A-Z)")
    print("=" * 50)

    download_signs(ALPHABET, force, is_alphabet=True)


def download_number_videos(force: bool = False):
    """Download number sign videos (1-10)."""
    print("\n" + "=" * 50)
    print("Downloading ASL Numbers (1-10)")
    print("=" * 50)

    download_signs(NUMBERS, force)


def download_month_videos(force: bool = False):
    """Download month name sign videos."""
    print("\n" + "=" * 50)
    print("Downloading ASL Months (January-December)")
    print("=" * 50)

    download_signs(MONTHS, force)


def download_common_videos(force: bool = False):
    """Download common sign videos."""
    print("\n" + "=" * 50)
    print("Downloading Common ASL Signs")
    print("=" * 50)

    download_signs(COMMON_SIGNS, force)


def main():
    parser = argparse.ArgumentParser(
        description="Download ASL sign videos from Signing Savvy"
    )
    parser.add_argument("--signs", nargs="+", help="Specific signs to download")
    parser.add_argument("--alphabet", action="store_true", help="Download A-Z")
    parser.add_argument("--numbers", action="store_true", help="Download 1-10")
    parser.add_argument("--months", action="store_true", help="Download January-December")
    parser.add_argument("--common", action="store_true", help="Download common signs")
    parser.add_argument("--all", action="store_true", help="Download everything")
    parser.add_argument("--force", action="store_true", help="Re-download existing")

    args = parser.parse_args()

    if not HAS_BS4:
        print("Installing beautifulsoup4...")
        import subprocess

        subprocess.run(
            [sys.executable, "-m", "pip", "install", "beautifulsoup4"],
            capture_output=True,
        )
        print("Please run the script again.")
        return

    VIDEO_DIR.mkdir(parents=True, exist_ok=True)

    if args.signs:
        download_signs(args.signs, args.force)
    elif args.alphabet:
        download_alphabet_videos(args.force)
    elif args.numbers:
        download_number_videos(args.force)
    elif args.months:
        download_month_videos(args.force)
    elif args.common:
        download_common_videos(args.force)
    elif args.all:
        download_common_videos(args.force)
        download_alphabet_videos(args.force)
        download_number_videos(args.force)
        download_month_videos(args.force)
    else:
        parser.print_help()
        print("\nExamples:")
        print("  python download_signing_savvy.py --signs hello goodbye")
        print("  python download_signing_savvy.py --alphabet")
        print("  python download_signing_savvy.py --numbers")
        print("  python download_signing_savvy.py --months")
        print("  python download_signing_savvy.py --common")
        print("  python download_signing_savvy.py --all")


if __name__ == "__main__":
    main()
