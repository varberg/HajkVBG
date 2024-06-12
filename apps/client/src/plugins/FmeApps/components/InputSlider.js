import { Box, Slider, Typography } from "@mui/material";

const InputSlider = (props) => {
  const d = props.formItem;

  const minValue = d.min ? Number(d.min) : 0;
  const maxValue = d.max ? Number(d.max) : 100;
  const centerValue = (minValue + maxValue) / 2;

  return (
    <Box sx={{ width: "100%", pl: 2, pr: 2, mt: -1 }}>
      <Typography variant="caption" sx={{ opacity: 0.7 }}>
        {d.title}
      </Typography>
      <Typography
        variant="subtitle2"
        sx={{
          position: "absolute",
          right: 0,
          top: "4px",
          mt: -1,
          pr: 2,
          opacity: 0.7,
          fontWeight: "bold",
        }}
      >
        {d.value}
      </Typography>
      <Slider
        defaultValue={Number(d.defaultValue)}
        min={minValue}
        max={maxValue}
        valueLabelDisplay="auto"
        // Lets modify the slider label to alternate between left and right
        // depending on center position. Otherwise the slider label will be
        // cut off by the parent window overflow hidden style.
        sx={{
          "& .MuiSlider-valueLabel": {
            left: d.value < centerValue ? "0" : "auto",
            right: d.value > centerValue ? "0" : "auto",
            transformOrigin:
              d.value < centerValue ? "bottom left" : "bottom right",
            "&:before": {
              left: d.value < centerValue ? "10px" : "calc(100% - 10px)",
            },
          },
        }}
        onChange={props.onChange || (() => {})}
      />
    </Box>
  );
};

export default InputSlider;
