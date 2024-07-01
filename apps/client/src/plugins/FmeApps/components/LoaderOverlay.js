// import { Box, Slider, Typography } from "@mui/material";
import { Typography } from "@mui/material";
import CircularProgress from "@mui/material/CircularProgress";

const LoaderOverlay = (props) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        top: "0",
        left: "0",
        height: "100%",
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
        // paddingBottom: "4rem",
        opacity: props.isLoading ? 1 : 0,
        transition: "all 500ms",
        pointerEvents: props.isLoading ? "all" : "none",
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {props.text || "Laddar"}
      </Typography>
      <CircularProgress />
    </div>
  );
};

export default LoaderOverlay;
