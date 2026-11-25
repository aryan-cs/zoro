import { Page } from 'konsta/react';
import { Header, Note, Section } from '../ui/kit';
import { useNav } from '../ui/nav';

const STEPS: [string, string][] = [
  ['Open Shortcuts', 'Tap + to make a new shortcut and name it exactly “Zoro Sleep”.'],
  ['Find Health Samples', 'Add “Find Health Samples”. Set Type to Sleep, Start Date “is in the last” 1 day, sorted by Start Date, oldest first.'],
  [
    'Repeat with Each',
    'Add “Repeat with Each” on those samples. Inside it, add a Text action with:\n{"start":"Start Date","end":"End Date","value":"Value"},\nUse the Repeat Item variables for Start Date, End Date and Value. Tap each date and set Date Format to ISO 8601.',
  ],
  ['Combine', 'After End Repeat, add “Combine Text” on Repeat Results, combined with New Lines.'],
  ['Wrap it', 'Add a Text action: ZORO-SLEEP [ then the Combined Text, then ] on the end.'],
  ['Copy', 'Add “Copy to Clipboard” with that text. Optional: add “Show Notification” saying “Sleep copied”.'],
  ['Run it each morning', 'On Today, tap Sleep, then “Run the Zoro Sleep shortcut” (or add the shortcut as a widget). Then come back to Zoro, tap the box, and paste.'],
];

export function SleepSetupScreen() {
  const nav = useNav();
  return (
    <Page className="tab-safe">
      <Header title="Sleep shortcut" onBack={nav.pop} />
      <Note className="mt-3 text-[13px]">
        Web apps can't read Apple Health directly. This one-time Shortcut copies last night's sleep so you can paste it into Zoro. It takes about 5 minutes.
      </Note>
      {STEPS.map(([title, body], i) => (
        <Section key={title} title={`${i + 1}. ${title}`} cardClass="px-4 py-2.5 text-[14px] whitespace-pre-line">
          {body}
        </Section>
      ))}
      <Note className="mt-3">
        Zoro only counts time asleep, merges overlapping samples from your watch and phone, and ignores naps earlier in the day. No watch? Enter your bed and wake
        times by hand.
      </Note>
    </Page>
  );
}
