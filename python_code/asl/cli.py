"""
CLI entry point for local testing of the ASL translation workflow.
Run with: python -m python_code.asl.cli
"""

from dotenv import load_dotenv

load_dotenv()  # Must be before relative imports so env vars are set before KB loads

from colorama import Fore, Style, init  # noqa: E402

init(autoreset=True)

from .graph import build_asl_graph  # noqa: E402
from .schemas import SentenceDescriptionSchema  # noqa: E402


def print_header():
    print("=" * 60)
    print(
        f"{Fore.BLUE}{Style.BRIGHT}  ASL Dictionary (LangGraph: Plan -> Instruct){Style.RESET_ALL}"
    )
    print("=" * 60)


def display_result(word_input: str, result: SentenceDescriptionSchema):
    print(f"\n{Fore.GREEN}✔ Final Result for '{word_input}':{Style.RESET_ALL}")

    for i, sign in enumerate(result.signs, 1):
        print(f"\n  {Fore.CYAN}#{i}: {sign.word.upper()}{Style.RESET_ALL}")
        print(f"  ✋ Hand Shape:   {sign.hand_shape}")
        print(f"  📍 Location:     {sign.location}")
        print(f"  🔄 Movement:     {sign.movement}")
        print(f"  😐 NMM (Face):   {sign.non_manual_markers}")

    print(f"\n  {Fore.WHITE}{Style.DIM}Note: {result.note}{Style.RESET_ALL}")


def main():
    print_header()
    asl_app = build_asl_graph()

    while True:
        print("\n--- ASL Dictionary Lookup ---")
        print(
            "Enter a phrase to test the Grammar Planner (e.g., 'I went to the store yesterday')."
        )
        print("Type 'q' to quit.")

        word_input = input(
            f"\n{Fore.YELLOW}Enter English word or phrase: {Style.RESET_ALL}"
        ).strip()

        if word_input.lower() == "q":
            print("Exiting...")
            break

        if not word_input:
            print(f"{Fore.RED}Input cannot be empty.{Style.RESET_ALL}")
            continue

        initial_state = {"english_input": word_input}

        try:
            print(f"{Fore.YELLOW}Starting LangGraph execution...{Style.RESET_ALL}")
            final_state = asl_app.invoke(initial_state)
            final_output: SentenceDescriptionSchema = final_state.get("final_output")

            if final_output:
                display_result(word_input, final_output)
            elif final_state.get("error"):
                print(
                    f"{Fore.RED}Workflow stopped due to error: {final_state['error']}{Style.RESET_ALL}"
                )
            else:
                print(
                    f"{Fore.RED}Workflow completed but produced no output.{Style.RESET_ALL}"
                )

        except Exception as e:
            print(f"{Fore.RED}LangGraph Runtime Error: {e}{Style.RESET_ALL}")


if __name__ == "__main__":
    main()
