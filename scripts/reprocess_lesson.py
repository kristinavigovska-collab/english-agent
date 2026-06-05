#!/usr/bin/env python3
"""Re-fetch Recall transcript for a bot and re-run Claude analysis."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

from services import claude_service, recall_service, supabase_service
from services.transcript_service import pick_longer_transcript


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bot_id", help="Recall bot UUID (lessons.recall_bot_id)")
    args = parser.parse_args()

    if not recall_service.is_configured():
        print("Error: set RECALL_API_KEY (and optional RECALL_REGION) in .env")
        sys.exit(1)

    lesson = supabase_service.get_lesson_by_bot_id(args.bot_id)
    if not lesson:
        print(f"No lesson found for bot_id={args.bot_id}")
        sys.exit(1)

    student = supabase_service.get_student(lesson["student_id"])
    if not student:
        print("Student not found for lesson")
        sys.exit(1)

    print(f"Fetching transcript for bot {args.bot_id}...")
    transcript = recall_service.fetch_full_transcript(bot_id=args.bot_id)
    if not transcript:
        print("No transcript returned from Recall API")
        sys.exit(1)

    merged = pick_longer_transcript(lesson.get("transcript") or "", transcript)
    supabase_service.update_lesson_transcript(lesson["id"], merged)
    print(f"Transcript saved ({len(merged)} chars)")

    analysis = claude_service.analyze_transcript(
        merged,
        student_name=student.get("name", ""),
        student_email=student.get("email", ""),
    )
    report = supabase_service.upsert_report_for_lesson(
        student_id=student["id"],
        lesson_id=lesson["id"],
        analysis=analysis,
    )
    print(f"Report updated: {report['id']}")
    print(
        f"Dashboard: https://english-agent.onrender.com/api/dashboard/{student['id']}"
    )


if __name__ == "__main__":
    main()
