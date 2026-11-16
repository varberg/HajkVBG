import { Box, Chip } from "@mui/material";

interface SuggestionListProps {
  items: string[];
  /** For screen readers, as the list has no visible heading */
  label: string;
  disabled: boolean;
  /** Small chips with small text, for the follow-ups under an answer */
  small?: boolean;
  onPick: (question: string) => void;
}

/** Questions to send with a click */
function SuggestionList({
  items,
  label,
  disabled,
  small = false,
  onPick,
}: SuggestionListProps) {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: small ? 0.75 : 1,
        m: 0,
        p: 0,
        listStyle: "none",
      }}
    >
      {items.map((item) => (
        <li key={item}>
          <Chip
            label={item}
            size={small ? "small" : "medium"}
            variant="outlined"
            color="primary"
            disabled={disabled}
            onClick={() => onPick(item)}
            sx={{
              height: "auto",
              py: small ? 0.25 : 0.5,
              fontSize: small ? "0.75rem" : undefined,
              "& .MuiChip-label": { whiteSpace: "normal" },
            }}
          />
        </li>
      ))}
    </Box>
  );
}

export default SuggestionList;
