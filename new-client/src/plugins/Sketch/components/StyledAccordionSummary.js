import { styled } from "@mui/material/styles";
import { AccordionSummary } from "@mui/material";

export const StyledAccordionSummary = styled(AccordionSummary)(() => ({
  minHeight: 35,
  "&.MuiAccordionSummary-root.Mui-expanded": {
    minHeight: 35,
  },
  "& .MuiAccordionSummary-content": {
    transition: "inherit !important",
    marginTop: 0,
    marginBottom: 0,
    "&.Mui-expanded": {
      marginTop: 0,
      marginBottom: 0,
    },
  },
}));
