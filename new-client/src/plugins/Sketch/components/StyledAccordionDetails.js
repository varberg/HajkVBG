import { styled } from "@mui/material/styles";
import { AccordionDetails } from "@mui/material";

export const StyledAccordionDetails = styled(AccordionDetails)(({ theme }) => ({
  paddingLeft: theme.spacing(2),
  paddingRight: theme.spacing(2),
  paddingTop: 0,
}));
