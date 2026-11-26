"""Build and sign the "Zoro Health" shortcut: last night's sleep and the last two days' steps
from Apple Health, copied in one go.

Run on a Mac: python3 scripts/make-health-shortcut.py
Writes public/ZoroHealth.shortcut (signed so anyone can add it).

The shortcut finds Sleep samples from the last day and Steps samples from the last two days,
and copies one block of text:
    ZORO-HEALTH1
    <sleep start dates> --- <sleep end dates> --- <sleep values (Asleep Core, Awake, ...)>
    --- <step start dates> --- <step counts> --- <step sources (iPhone, Apple Watch)>
(each list one item per line, each "---" on its own line). Zoro reads it from the clipboard
(see parseHealthImport in src/core/sleep.ts).
"""
import plistlib
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

FIND = str(uuid.uuid4()).upper()
STEPS = str(uuid.uuid4()).upper()
TEXT = str(uuid.uuid4()).upper()


def samples(prop: str, iso: bool, uid: str = FIND) -> dict:
    agg = [{'Type': 'WFPropertyVariableAggrandizement', 'PropertyName': prop}]
    if iso:
        agg.append({'Type': 'WFDateFormatVariableAggrandizement', 'WFDateFormatStyle': 'ISO 8601', 'WFISO8601IncludeTime': True})
    return {'Type': 'ActionOutput', 'OutputUUID': uid, 'OutputName': 'Health Samples', 'Aggrandizements': agg}


def find(uid: str, kind: str, days: int) -> dict:
    """Find Health Samples of a type from the last `days` days, oldest first."""
    return {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.filter.health.quantity',
        'WFWorkflowActionParameters': {
            'UUID': uid,
            'WFContentItemFilter': {
                'Value': {
                    'WFActionParameterFilterPrefix': 1,
                    'WFContentPredicateBoundedDate': False,
                    'WFActionParameterFilterTemplates': [
                        # iOS 27 saves the type as a substitutable string (a plain one shows as "Choose").
                        {'Bounded': True, 'Operator': 4, 'Property': 'Type', 'Removable': False, 'Values': {'Enumeration': {'Value': kind, 'WFSerializationType': 'WFStringSubstitutableState'}}},
                        {'Bounded': True, 'Operator': 1002, 'Property': 'Start Date', 'Removable': True, 'Values': {'Number': days, 'Unit': 16}},
                    ],
                },
                'WFSerializationType': 'WFContentPredicateTableTemplate',
            },
            'WFContentItemSortProperty': 'Start Date',
            'WFContentItemSortOrder': 'Oldest First',
        },
    }


OBJ = '￼'
SEP = '\n---\n'
parts = ['ZORO-HEALTH1\n', OBJ, SEP, OBJ, SEP, OBJ, SEP, OBJ, SEP, OBJ, SEP, OBJ]
text = ''.join(parts)
attachments = {}
pos = 0
values = [
    samples('Start Date', True), samples('End Date', True), samples('Value', False),
    samples('Start Date', True, STEPS), samples('Value', False, STEPS), samples('Source', False, STEPS),
]
vi = 0
for p in parts:
    if p == OBJ:
        attachments[f'{{{pos}, 1}}'] = values[vi]
        vi += 1
    pos += len(p.encode('utf-16-le')) // 2

actions = [
    find(FIND, 'Sleep', 1),
    find(STEPS, 'Steps', 2),
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
            'WFNotificationActionTitle': 'Sleep and steps copied',
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

out = Path(__file__).resolve().parent.parent / 'public' / 'ZoroHealth.shortcut'
with tempfile.TemporaryDirectory() as tmp:
    unsigned = Path(tmp) / 'Zoro Health.shortcut'
    unsigned.write_bytes(plistlib.dumps(shortcut, fmt=plistlib.FMT_BINARY))
    res = subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', str(unsigned), '--output', str(out)], capture_output=True, text=True)
    if res.returncode != 0 or not out.exists():
        sys.exit(f'Signing failed: {res.stderr or res.stdout}')
print(f'Wrote {out} ({out.stat().st_size} bytes)')
