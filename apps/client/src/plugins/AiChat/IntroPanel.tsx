import { Stack, Typography } from "@mui/material";

import { UI_STRINGS } from "./constants";
import PrivacyPolicyLink from "./PrivacyPolicyLink";
import SuggestionList from "./SuggestionList";

// A line starting with one of these is an example question
const EXAMPLE_PATTERN = /^\s*[•*-]\s+(.+)$/;

interface IntroPanelProps {
  introText: string;
  privacyPolicyUrl?: string;
  disabled: boolean;
  onExample: (question: string) => void;
}

/** Splits the intro text into its lead and its example questions */
function parseIntro(introText: string) {
  const lead: string[] = [];
  const examples: string[] = [];
  for (const line of introText.split("\n")) {
    const match = EXAMPLE_PATTERN.exec(line);
    if (match) {
      examples.push(match[1].trim());
    } else {
      lead.push(line);
    }
  }
  return { lead: lead.join("\n").trim(), examples };
}

/** Shown before the first question: the intro, example questions to click, and the warning */
function IntroPanel({
  introText,
  privacyPolicyUrl,
  disabled,
  onExample,
}: IntroPanelProps) {
  const { lead, examples } = parseIntro(introText);
  const [before, linkText, after] = UI_STRINGS.privacyPolicy;

  return (
    <Stack spacing={1.5}>
      {lead && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ whiteSpace: "pre-line" }}
        >
          {lead}
        </Typography>
      )}
      {examples.length > 0 && (
        <SuggestionList
          items={examples}
          label={UI_STRINGS.examples}
          disabled={disabled}
          onPick={onExample}
        />
      )}
      <Typography variant="body2" color="error">
        {UI_STRINGS.introWarning}
        <PrivacyPolicyLink url={privacyPolicyUrl} before={before} after={after}>
          {linkText}
        </PrivacyPolicyLink>
      </Typography>
    </Stack>
  );
}

export default IntroPanel;
