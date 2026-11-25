"""Build and sign the "Zoro Sleep" shortcut that copies last night's sleep from Apple Health.

Run on a Mac: python3 scripts/make-sleep-shortcut.py
Writes public/ZoroSleep.shortcut (signed so anyone can add it).

The shortcut finds Sleep samples from the last day and copies one block of text:
    ZORO-SLEEP2
    <start dates, one per line>
    ---
    <end dates>
    ---
    <values (Asleep Core, Awake, In Bed, ...)>
Zoro reads that from the clipboard (see src/core/sleep.ts).
"""
import plistlib
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

FIND = str(uuid.uuid4()).upper()
TEXT = str(uuid.uuid4()).upper()


def samples(prop: str, iso: bool) -> dict:
    agg = [{'Type': 'WFPropertyVariableAggrandizement', 'PropertyName': prop}]
    if iso:
        agg.append({'Type': 'WFDateFormatVariableAggrandizement', 'WFDateFormatStyle': 'ISO 8601', 'WFISO8601IncludeTime': True})
    return {'Type': 'ActionOutput', 'OutputUUID': FIND, 'OutputName': 'Health Samples', 'Aggrandizements': agg}


OBJ = '￼'
parts = ['ZORO-SLEEP2\n', OBJ, '\n---\n', OBJ, '\n---\n', OBJ]
text = ''.join(parts)
attachments = {}
pos = 0
values = [samples('Start Date', True), samples('End Date', True), samples('Value', False)]
vi = 0
for p in parts:
    if p == OBJ:
        attachments[f'{{{pos}, 1}}'] = values[vi]
        vi += 1
    pos += len(p.encode('utf-16-le')) // 2

actions = [
    {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.filter.health.quantity',
        'WFWorkflowActionParameters': {
            'UUID': FIND,
            'WFContentItemFilter': {
                'Value': {
                    'WFActionParameterFilterPrefix': 1,
                    'WFContentPredicateBoundedDate': False,
                    'WFActionParameterFilterTemplates': [
                        {'Bounded': True, 'Operator': 4, 'Property': 'Type', 'Removable': False, 'Values': {'Enumeration': 'Sleep Analysis'}},
                        {'Bounded': True, 'Operator': 1002, 'Property': 'Start Date', 'Removable': True, 'Values': {'Number': 1, 'Unit': 16}},
                    ],
                },
                'WFSerializationType': 'WFContentPredicateTableTemplate',
            },
            'WFContentItemSortProperty': 'Start Date',
            'WFContentItemSortOrder': 'Oldest First',
        },
    },
    {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.gettext',
        'WFWorkflowActionParameters': {
            'UUID': TEXT,
            'WFTextActionText': {
                'Value': {'string': text, 'attachmentsByRange': attachments},
                'WFSerializationType': 'WFTextTokenString',
            },
        },
    },
    {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.setclipboard',
        'WFWorkflowActionParameters': {
            'WFInput': {
                'Value': {'Type': 'ActionOutput', 'OutputUUID': TEXT, 'OutputName': 'Text'},
                'WFSerializationType': 'WFTextTokenAttachment',
            },
        },
    },
    {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.notification',
        'WFWorkflowActionParameters': {
            'WFNotificationActionTitle': 'Sleep copied',
            'WFNotificationActionBody': 'Go back to Zoro and tap Paste.',
            'WFNotificationActionSound': False,
        },
    },
]

shortcut = {
    'WFWorkflowActions': actions,
    'WFWorkflowClientVersion': '2605.0.5',
    'WFWorkflowMinimumClientVersion': 900,
    'WFWorkflowMinimumClientVersionString': '900',
    'WFWorkflowIcon': {'WFWorkflowIconStartColor': 1440408063, 'WFWorkflowIconGlyphNumber': 59446},
    'WFWorkflowImportQuestions': [],
    'WFWorkflowInputContentItemClasses': [],
    'WFWorkflowOutputContentItemClasses': [],
    'WFWorkflowTypes': [],
    'WFWorkflowHasShortcutInputVariables': False,
    'WFQuickActionSurfaces': [],
}

out = Path(__file__).resolve().parent.parent / 'public' / 'ZoroSleep.shortcut'
with tempfile.TemporaryDirectory() as tmp:
    unsigned = Path(tmp) / 'Zoro Sleep.shortcut'
    unsigned.write_bytes(plistlib.dumps(shortcut, fmt=plistlib.FMT_BINARY))
    res = subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', str(unsigned), '--output', str(out)], capture_output=True, text=True)
    if res.returncode != 0 or not out.exists():
        sys.exit(f'Signing failed: {res.stderr or res.stdout}')
print(f'Wrote {out} ({out.stat().st_size} bytes)')
