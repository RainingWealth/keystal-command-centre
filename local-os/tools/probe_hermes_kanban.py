#!/usr/bin/env python3
"""Exercise the REAL Hermes Kanban read adapter. Read-only, no model call, no paid API.

Runs exactly what the app runs (`hermes kanban [--board B] list --json`) through the app's own
parser and prints a summary with NO task titles, ids or assignees: counts, raw state names and the
JSON field names Hermes used, so you can check the mapping without exposing board content.

  python3 local-os/tools/probe_hermes_kanban.py [--board NAME] [--hermes PATH] [--timeout 20]

Exit 0 = connected and parsed. 1 = not connected / read failed / nothing recognised.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import agent_tasks  # noqa: E402


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--board', default=os.environ.get('KEYSTAL_OS_KANBAN_BOARD', ''), help='pin a board (default: Hermes current board)')
    parser.add_argument('--hermes', default=os.environ.get('KEYSTAL_OS_HERMES', 'hermes'))
    parser.add_argument('--timeout', type=int, default=20)
    args = parser.parse_args(argv)
    board = args.board.strip() or None
    if board and not agent_tasks.BOARD.fullmatch(board):
        print(f'Invalid board name {board!r}. Refusing to read a different board.', file=sys.stderr)
        return 2
    hermes = shutil.which(args.hermes)
    result = agent_tasks.fetch_kanban(hermes, board, args.timeout)
    rows = result.get('rows', [])
    summary = {'hermes_found': bool(hermes), 'board': board or '(not pinned: Hermes current board)', 'status': result['status'], 'detail': result['detail'],
               'counts': {k: result.get(k) for k in ('received', 'rejected', 'archived_skipped', 'duplicates', 'unique', 'stored', 'dropped', 'truncated')},
               'raw_states_seen': {}, 'mapped_status_counts': {}, 'state_class_counts': {}, 'unmapped_raw_states': [], 'json_field_names_seen': result.get('field_names', []),
               'content_printed': False, 'model_called': False, 'commands_run': ['hermes kanban ' + ('--board <name> ' if board else '') + 'list --json']}
    for r in rows:
        summary['raw_states_seen'][r['status_raw']] = summary['raw_states_seen'].get(r['status_raw'], 0) + 1
        summary['state_class_counts'][r['state_class']] = summary['state_class_counts'].get(r['state_class'], 0) + 1
        if r['status']:
            summary['mapped_status_counts'][r['status']] = summary['mapped_status_counts'].get(r['status'], 0) + 1
        elif r['status_raw'] not in summary['unmapped_raw_states']:
            summary['unmapped_raw_states'].append(r['status_raw'])
    print(json.dumps(summary, indent=2))
    return 0 if result['status'] == 'connected' else 1


if __name__ == '__main__':
    sys.exit(main())
