"""Build and sign the "Connect Zoro to Health" shortcut: last night's sleep and the last two days' steps
from Apple Health, sent to Zoro on their own.

Run on a Mac: python3 scripts/make-health-shortcut.py
Writes public/ZoroHealth.shortcut (signed so anyone can add it). Nothing personal is in it: adding
it asks for the backup key and repo (Import Questions), which stay on that iPhone.

Once a day (the first run after 5 AM; a note in the Shortcuts folder, Zoro Health.txt, remembers
the day), the shortcut finds Sleep and Steps samples from the last two days, builds one block of
text:
    ZORO-HEALTH1
    <sleep start dates> --- <sleep end dates> --- <sleep values (Asleep Core, Awake, ...)>
    --- <step start dates> --- <step counts> --- <step sources (iPhone, Apple Watch)>
(each list one item per line, each "---" on its own line), and saves it to the backup repo as
health/<yyyyMMdd-HHmmss>.txt through GitHub's API. A Shortcuts automation runs it (when an app you
open every morning opens: Apple Health can't be read while the iPhone is locked; later opens that
day stop at the first check), and Zoro brings the files in when it opens (src/ui/healthSync.ts, parseHealthImport in src/core/sleep.ts).
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
KEY = str(uuid.uuid4()).upper()
REPO = str(uuid.uuid4()).upper()
B64 = str(uuid.uuid4()).upper()
PUT = str(uuid.uuid4()).upper()
ADJ = str(uuid.uuid4()).upper()
DAY = str(uuid.uuid4()).upper()
FILE = str(uuid.uuid4()).upper()
LAST = str(uuid.uuid4()).upper()
SKIP = str(uuid.uuid4()).upper()


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

def output(uid: str, name: str) -> dict:
    return {'Type': 'ActionOutput', 'OutputUUID': uid, 'OutputName': name}


def tokens(*parts) -> dict:
    """Text with variables in it: plain strings and attachments (dicts), in order."""
    string, attachments = '', {}
    for part in parts:
        if isinstance(part, str):
            string += part
        else:
            attachments[f'{{{len(string.encode("utf-16-le")) // 2}, 1}}'] = part
            string += OBJ
    return {'Value': {'string': string, 'attachmentsByRange': attachments}, 'WFSerializationType': 'WFTextTokenString'}


def dictionary(items: dict) -> dict:
    """A dictionary of text values (a request's headers or its JSON body)."""
    return {
        'Value': {
            'WFDictionaryFieldValueItems': [
                {'WFItemType': 0, 'WFKey': tokens(k), 'WFValue': v if isinstance(v, dict) and 'WFSerializationType' in v else tokens(v)}
                for k, v in items.items()
            ]
        },
        'WFSerializationType': 'WFDictionaryFieldValue',
    }


def text_action(uid: str, value: str) -> dict:
    return {'WFWorkflowActionIdentifier': 'is.workflow.actions.gettext', 'WFWorkflowActionParameters': {'UUID': uid, 'WFTextActionText': value}}


def fmt(attachment: dict, pattern: str) -> dict:
    """A date variable written out with a custom pattern."""
    return {**attachment, 'Aggrandizements': attachment.get('Aggrandizements', []) + [{'Type': 'WFDateFormatVariableAggrandizement', 'WFDateFormatStyle': 'Custom', 'WFDateFormat': pattern}]}


def variable(attachment: dict) -> dict:
    """An If's input."""
    return {'Type': 'Variable', 'Variable': {'Value': attachment, 'WFSerializationType': 'WFTextTokenAttachment'}}


def if_start(group: str, value: dict, condition: int, against: dict) -> dict:
    return {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.conditional',
        'WFWorkflowActionParameters': {'GroupingIdentifier': group, 'WFControlFlowMode': 0, 'WFCondition': condition, 'WFInput': variable(value), 'WFConditionalActionString': against},
    }


def if_end(group: str) -> dict:
    return {'WFWorkflowActionIdentifier': 'is.workflow.actions.conditional', 'WFWorkflowActionParameters': {'GroupingIdentifier': group, 'WFControlFlowMode': 2}}


IS = 4
MARK_FILE = 'Zoro Health.txt'  # in the Shortcuts folder: the last day it brought in last night
now = {'Type': 'CurrentDate'}

actions = [
    # 0, 1: filled in when the shortcut is added (Import Questions below).
    text_action(KEY, ''),
    text_action(REPO, 'aryan-cs/zoro-data'),
    # Once a day. A "day" starts at 5 AM, so checking Messages at 1 AM doesn't use it up.
    {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.adjustdate',
        'WFWorkflowActionParameters': {
            'UUID': ADJ,
            'WFAdjustOperation': 'Subtract',
            'WFDuration': {'Value': {'Unit': 'hr', 'Magnitude': '5'}, 'WFSerializationType': 'WFQuantityFieldValue'},
            'WFDate': tokens(now),
        },
    },
    {'WFWorkflowActionIdentifier': 'is.workflow.actions.gettext', 'WFWorkflowActionParameters': {'UUID': DAY, 'WFTextActionText': tokens(fmt(output(ADJ, 'Adjusted Date'), 'yyyy-MM-dd'))}},
    {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.documentpicker.open',
        'WFWorkflowActionParameters': {'UUID': FILE, 'WFGetFilePath': MARK_FILE, 'WFFileErrorIfNotFound': False, 'WFShowFilePicker': False},
    },
    {'WFWorkflowActionIdentifier': 'is.workflow.actions.detect.text', 'WFWorkflowActionParameters': {'UUID': LAST, 'WFInput': {'Value': output(FILE, 'File'), 'WFSerializationType': 'WFTextTokenAttachment'}}},
    # Already brought in last night today: stop before reading anything.
    if_start(SKIP, output(LAST, 'Text'), IS, tokens(output(DAY, 'Text'))),
    {'WFWorkflowActionIdentifier': 'is.workflow.actions.exit', 'WFWorkflowActionParameters': {}},
    if_end(SKIP),
    # Two days of each, so a day that didn't send still comes in the next.
    find(FIND, 'Sleep', 2),
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
        'WFWorkflowActionIdentifier': 'is.workflow.actions.base64encode',
        'WFWorkflowActionParameters': {
            'UUID': B64,
            'WFEncodeMode': 'Encode',
            'WFBase64LineBreakMode': 'None',
            'WFInput': {'Value': output(TEXT, 'Text'), 'WFSerializationType': 'WFTextTokenAttachment'},
        },
    },
    {
        # PUT /repos/<repo>/contents/health/<now>.txt — a new file each run, so no sha is needed.
        'WFWorkflowActionIdentifier': 'is.workflow.actions.downloadurl',
        'WFWorkflowActionParameters': {
            'UUID': PUT,
            'WFURL': tokens('https://api.github.com/repos/', output(REPO, 'Text'), '/contents/health/', fmt(now, 'yyyyMMdd-HHmmss'), '.txt'),
            'WFHTTPMethod': 'PUT',
            'ShowHeaders': True,
            'WFHTTPHeaders': dictionary({
                'Authorization': tokens('Bearer ', output(KEY, 'Text')),
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            }),
            'WFHTTPBodyType': 'JSON',
            'WFJSONValues': dictionary({
                'message': 'Apple Health from iPhone',
                'content': tokens(output(B64, 'Base64 Encoded')),
            }),
        },
    },
    # Done for the day: later runs stop at the first check. (Without an Apple Watch nothing writes
    # sleep to Apple Health, so it doesn't wait for last night; two days per run covers a late sync.)
    {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.documentpicker.save',
        'WFWorkflowActionParameters': {
            'WFInput': {'Value': output(DAY, 'Text'), 'WFSerializationType': 'WFTextTokenAttachment'},
            'WFAskWhereToSave': False,
            'WFFileDestinationPath': MARK_FILE,
            'WFSaveFileOverwrite': True,
        },
    },
]

shortcut = {
    'WFWorkflowActions': actions,
    'WFWorkflowClientVersion': '2605.0.5',
    'WFWorkflowMinimumClientVersion': 900,
    'WFWorkflowMinimumClientVersionString': '900',
    'WFWorkflowIcon': {'WFWorkflowIconStartColor': 4292093695, 'WFWorkflowIconGlyphNumber': 59754},  # green, heart
    'WFWorkflowImportQuestions': [
        {'ActionIndex': 0, 'Category': 'Parameter', 'DefaultValue': '', 'ParameterKey': 'WFTextActionText', 'Text': 'Paste the key you use for Zoro’s Cloud Backup (github_pat_…).'},
        {'ActionIndex': 1, 'Category': 'Parameter', 'DefaultValue': 'aryan-cs/zoro-data', 'ParameterKey': 'WFTextActionText', 'Text': 'Your backup repo, as in Zoro’s Settings.'},
    ],
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
