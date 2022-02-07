import React from "react";
import { styled } from "@material-ui/core";
import { Button, IconButton } from "@material-ui/core";
import { Grid, Paper, TextField, Tooltip, Typography } from "@material-ui/core";
import Information from "../components/Information";
import AddIcon from "@material-ui/icons/Add";

const StyledPaper = styled(Paper)(({ theme }) => ({
  width: "100%",
  padding: theme.spacing(1),
  marginBottom: theme.spacing(1),
  borderLeft: `${theme.spacing(0.5)}px solid ${theme.palette.info.main}`,
}));

// A simple component allowing the user to select a name and save the current
// sketch to LS under that name.
const SketchSaver = (props) => {
  const handleInputChange = (e) => {
    props.setWorkspaceName(e.target.value);
  };

  // We only allow workspace-names that consist of three characters or more.
  const workspaceNameHasEnoughChars = props.workspaceName.length > 2;

  return (
    <Paper style={{ padding: 8 }}>
      <Grid container alignItems="center" justify="space-between">
        <Grid item xs={8}>
          <Tooltip title="Ange att namn så att arbetsytan kan identifieras senare.">
            <TextField
              size="small"
              variant="outlined"
              style={{ maxWidth: "100%" }}
              onChange={handleInputChange}
              value={props.workspaceName}
            />
          </Tooltip>
        </Grid>
        <Grid container item xs={3} justify="flex-end">
          <Tooltip
            title={
              workspaceNameHasEnoughChars
                ? "Klicka för att spara de ritobjekt som finns i kartan."
                : "Minst tre tecken måste anges för att ritobjekten ska kunna sparas."
            }
          >
            <span>
              <Button
                size="small"
                variant="contained"
                disabled={!workspaceNameHasEnoughChars}
              >
                Spara
              </Button>
            </span>
          </Tooltip>
        </Grid>
      </Grid>
    </Paper>
  );
};

const SavedSketch = (props) => {
  return (
    <StyledPaper>
      <Grid container justify="space-between" alignItems="center">
        <Grid item xs={8}>
          <Typography variant="button">{props.title}</Typography>
        </Grid>
        <Grid container item xs={3} justify="flex-end">
          <Tooltip title="Klicka för att läsa in objekten.">
            <IconButton size="small" onClick={null}>
              <AddIcon />
            </IconButton>
          </Tooltip>
        </Grid>
      </Grid>
    </StyledPaper>
  );
};

const SaveUploadView = (props) => {
  // If the user wants to save their work, they'll have to choose a name
  // so that the workspace can be identified in the list of saved workspaces later.
  const [workspaceName, setWorkspaceName] = React.useState("");
  // We have to get some information about the current activity (view)
  const activity = props.model.getActivityFromId(props.id);
  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Information text={activity.information} />
      </Grid>
      <Grid item xs={12}>
        <SketchSaver
          workspaceName={workspaceName}
          setWorkspaceName={setWorkspaceName}
        />
      </Grid>
      <Grid item xs={12}>
        <SavedSketch title={"Detta är ett testobjekt lalala"} />
        <SavedSketch title={"Kortare test"} />
      </Grid>
    </Grid>
  );
};

export default SaveUploadView;
