import React from "react";
import { Container, makeStyles, Typography } from "@material-ui/core";
import Page from "src/components/Page";

import ConfigContext from "src/utils/ConfigContext";

import LayersTable from "./LayersTable";

const useStyles = makeStyles((theme) => ({
  root: {
    backgroundColor: theme.palette.background.dark,
    minHeight: "100%",
    paddingBottom: theme.spacing(3),
    paddingTop: theme.spacing(3),
  },
}));

const Layers = () => {
  const classes = useStyles();
  const config = React.useContext(ConfigContext);

  return (
    config.layers !== null && (
      <Page className={classes.root} title="Layers">
        <Container maxWidth={false}>
          <Typography variant="caption">{config.maps?.join(", ")}</Typography>
          {Object.entries(config.layers).map((l, i) => (
            <LayersTable key={i} type={l[0]} layers={l[1]} />
          ))}
        </Container>
      </Page>
    )
  );
};

export default Layers;
