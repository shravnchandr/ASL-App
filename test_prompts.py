#!/usr/bin/env python3
"""
Test script for enhanced ASL prompts
Tests sentence-level grammar explanations
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "python_code"))

from asl_dict_langgraph import build_asl_graph
from colorama import Fore, Style

def test_sentence(graph, sentence):
    """Test a single sentence and print results"""
    print(f"\n{'='*80}")
    print(f"{Fore.CYAN}Testing: '{sentence}'{Style.RESET_ALL}")
    print(f"{'='*80}\n")

    try:
        result = graph.invoke({"english_input": sentence})

        if result.get("error"):
            print(f"{Fore.RED}ERROR: {result['error']}{Style.RESET_ALL}")
            return False

        output = result.get("final_output")
        if not output:
            print(f"{Fore.RED}No output generated{Style.RESET_ALL}")
            return False

        # Print ASL gloss order
        gloss_order = " ".join([sign.word for sign in output.signs])
        print(f"{Fore.GREEN}ASL Gloss: {gloss_order}{Style.RESET_ALL}\n")

        # Print each sign
        print(f"{Fore.YELLOW}Individual Signs:{Style.RESET_ALL}")
        for i, sign in enumerate(output.signs, 1):
            print(f"\n{i}. {Fore.MAGENTA}{sign.word}{Style.RESET_ALL}")
            print(f"   Hand Shape: {sign.hand_shape[:100]}...")
            print(f"   Location: {sign.location[:80]}...")
            print(f"   Movement: {sign.movement[:80]}...")
            print(f"   Facial/Body: {sign.non_manual_markers[:80]}...")

        # Print grammar note
        print(f"\n{Fore.CYAN}Grammar Explanation:{Style.RESET_ALL}")
        print(f"{output.note}\n")

        return True

    except Exception as e:
        print(f"{Fore.RED}Exception: {e}{Style.RESET_ALL}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run tests on various sentence types"""
    print(f"{Fore.MAGENTA}{'='*80}")
    print(f"ASL PROMPT TESTING - Sentence-Level Grammar Explanations")
    print(f"{'='*80}{Style.RESET_ALL}\n")

    # Build the graph
    print("Building LangGraph...")
    graph = build_asl_graph()

    # Test sentences
    test_cases = [
        "I want to go to the store",           # Destination before verb, omit articles
        "What is your name?",                  # Question formation
        "Yesterday I saw my friend",           # Time-first structure
        "I don't like coffee",                 # Negation
        "She is eating breakfast",             # Present continuous
        "Can you help me tomorrow?",           # Future time, yes/no question
    ]

    results = []
    for sentence in test_cases:
        success = test_sentence(graph, sentence)
        results.append((sentence, success))

    # Summary
    print(f"\n{'='*80}")
    print(f"{Fore.MAGENTA}TEST SUMMARY{Style.RESET_ALL}")
    print(f"{'='*80}\n")

    passed = sum(1 for _, success in results if success)
    total = len(results)

    for sentence, success in results:
        status = f"{Fore.GREEN}✓ PASS{Style.RESET_ALL}" if success else f"{Fore.RED}✗ FAIL{Style.RESET_ALL}"
        print(f"{status} - {sentence}")

    print(f"\n{Fore.CYAN}Results: {passed}/{total} passed{Style.RESET_ALL}\n")

if __name__ == "__main__":
    main()
