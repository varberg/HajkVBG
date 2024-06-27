const { Grid, Collapse, Paper, Typography } = require("@mui/material");

const AppInfo = (props) => {
  const { app, infoIsVisible } = props;

  return (
    app && (
      <Grid item xs={12}>
        <Collapse in={infoIsVisible} timeout="auto">
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography
              variant="body2"
              dangerouslySetInnerHTML={{ __html: app.description }}
            ></Typography>
          </Paper>
        </Collapse>
      </Grid>
    )
  );
};

export default AppInfo;
