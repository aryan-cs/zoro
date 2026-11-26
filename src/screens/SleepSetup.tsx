import { Page } from 'konsta/react';
import { Cell, Header, Section } from '../ui/kit';
import { useNav } from '../ui/nav';

const STEPS: [string, string][] = [
  ['Open Shortcuts', 'Tap +. Name the shortcut “Zoro Health”.'],
  ['Find Health Samples', 'Add “Find Health Samples”: Type = Sleep; Start Date = “is in the last” 1 day; sort by Start Date, oldest first.'],
  [
    'Repeat with Each',
    'Add “Repeat with Each” for the samples. Inside, add Text:\n{"start":"Start Date","end":"End Date","value":"Value"},\nInsert Repeat Item variables for Start Date, End Date and Value. Set both dates to ISO 8601.',
  ],
  ['Combine', 'After End Repeat, add “Combine Text”: Repeat Results, New Lines.'],
  ['Wrap Text', 'Add Text: ZORO-SLEEP [ followed by Combined Text, then ].'],
  ['Copy', 'Add “Copy to Clipboard” for that text.'],
  ['Run Each Morning', 'In Zoro, open Log Sleep and tap Copy. When you’re back in Zoro, tap Paste.'],
];

export function SleepSetupScreen() {
  const nav = useNav();
  return (
    <Page className="tab-safe">
      <Header title="Sleep Shortcut" onBack={nav.pop} />
      {STEPS.map(([title, body], i) => (
        <Section key={title} keep title={`${i + 1}. ${title}`}>
          <Cell className="whitespace-pre-line py-2.5 text-[15px]">{body}</Cell>
        </Section>
      ))}
    </Page>
  );
}
