import { Box, Button, Grid, IconButton, Typography } from "@mui/material";
import BackIcon from "@mui/icons-material/ArrowCircleLeft";
import InfoIcon from "@mui/icons-material/Info";
import HajkToolTip from "components/HajkToolTip";

const AppList = (props) => {
  const { app, list, onSelectApp, onReset, onInfo } = props;

  const renderTitleBlock = () => {
    return (
      <Box>
        <Grid container alignItems="center" spacing={1} sx={{}}>
          <Grid item xs={1}>
            <HajkToolTip title="Tillbaka till applistan">
              <IconButton onClick={onReset} aria-label="delete">
                <BackIcon />
              </IconButton>
            </HajkToolTip>
          </Grid>
          <Grid item xs={9}>
            <Box sx={{ pl: 2 }}>
              <Typography variant="subtitle2">{app.title}</Typography>
            </Box>
          </Grid>
          <Grid item xs={2} sx={{ textAlign: "right" }}>
            <HajkToolTip title={`Information om appen '${app.title}'`}>
              <IconButton onClick={onInfo} aria-label="info">
                <InfoIcon />
              </IconButton>
            </HajkToolTip>
          </Grid>
        </Grid>
      </Box>
    );
  };

  return (
    // If there is an app selected, render the title and back button
    // Otherwise render the list of apps.
    (app && renderTitleBlock()) || (
      <Grid container spacing={1} sx={{}}>
        {list.map((_app, index) => (
          <Grid item xs={6} md={6} key={_app.id + index}>
            <Button
              fullWidth
              variant="contained"
              size="small"
              key={_app.id + index}
              sx={{ height: "100%" }}
              onClick={() => {
                onSelectApp(_app);
              }}
            >
              {_app.title}
            </Button>
          </Grid>
        ))}
      </Grid>
    )
  );
};
export default AppList;
