import { Block, BlockTitle, Navbar, NavbarBackLink, Page } from 'konsta/react';
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
  ['Run it each morning', 'Tap “Run the Zoro Sleep shortcut” on the Body → Sleep tab (or add the shortcut as a widget). Then come back to Zoro, tap the box, and paste.'],
];

export function SleepSetupScreen() {
  const nav = useNav();
  return (
    <Page className="tab-safe">
      <Navbar title="Sleep shortcut" left={<NavbarBackLink onClick={nav.pop} />} />
      <Block className="!my-3 text-[15px] text-black/70 dark:text-white/70">
        Web apps can't read Apple Health directly. This one-time Shortcut copies last night's sleep so you can paste it into Zoro. It takes about 5 minutes to set up.
      </Block>
      {STEPS.map(([title, body], i) => (
        <div key={title}>
          <BlockTitle>
            {i + 1}. {title}
          </BlockTitle>
          <Block strong inset className="!my-2 whitespace-pre-line text-[15px]">
            {body}
          </Block>
        </div>
      ))}
      <Block className="text-[13px] text-black/50 dark:text-white/55">
        Zoro only counts time asleep, merges overlapping samples from your watch and phone, and ignores naps earlier in the day. If you don't wear a watch, just
        enter your bed and wake times by hand.
      </Block>
    </Page>
  );
}
