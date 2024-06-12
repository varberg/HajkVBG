import {
  Box,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  TextField,
  Typography,
} from "@mui/material";
import HajkToolTip from "components/HajkToolTip";
import InputFileUpload from "./components/InputFileUpload";

class InputFactory {
  constructor(form, setForm) {
    this.form = form;
    this.setForm = setForm;
  }

  updateForm() {
    this.setForm([...this.form]);
  }

  wrap(d, input) {
    return (
      <HajkToolTip title={d.tooltip} placement="bottom-end">
        {input}
      </HajkToolTip>
    );
  }
  getTextInput(d) {
    return (
      <TextField
        size="small"
        label={d.title}
        value={d.value}
        onChange={(e) => {
          d.value = e.target.value;
          this.updateForm();
        }}
      ></TextField>
    );
  }

  getNumberInput(d) {
    return (
      <TextField
        size="small"
        type="number"
        label={d.title}
        value={d.value}
        InputProps={{
          inputProps: { min: d.min, max: d.max },
        }}
        onChange={(e) => {
          d.value = e.target.value;
          this.updateForm();
        }}
        onBlur={(e) => {
          // Make sure the value is within the bounds, the built-in checks are not enough.
          const originalN = Number(e.target.value);
          let n = Number(e.target.value);
          if (isNaN(n)) {
            n = d.min;
          } else if (n < d.min) {
            n = d.min;
          } else if (n > d.max) {
            n = d.max;
          }

          if (n !== originalN) {
            d.value = n;
            this.updateForm();
          }
        }}
      ></TextField>
    );
  }

  getSliderInput(d) {
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
          // size="small"
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
          onChange={(e, value) => {
            d.value = value;
            this.updateForm();
          }}
        />
      </Box>
    );
  }

  getSelectInput(d) {
    return (
      <div sx={{ minWidth: "100%" }}>
        <InputLabel id={d.id + "-label"}>{d.title}</InputLabel>
        <Select
          fullWidth
          labelId={d.id + "-label"}
          id={d.id + "-select"}
          label={d.title}
          value={d.value}
          onChange={(e) => {
            d.value = e.target.value;
            this.updateForm();
          }}
        >
          {d.options.map((option, index) => (
            <MenuItem key={option.title + index} value={option.value}>
              {option.title}
            </MenuItem>
          ))}
        </Select>
      </div>
    );
  }

  getFileUpload(d) {
    return (
      <InputFileUpload
        formItem={d}
        onChange={(data) => {
          d.file = data;
          this.updateForm();
        }}
      ></InputFileUpload>
    );
  }

  getInputItem(formItem) {
    if (formItem.inputType === "text") {
      return this.wrap(formItem, this.getTextInput(formItem));
    } else if (formItem.inputType === "number") {
      return this.wrap(formItem, this.getNumberInput(formItem));
    } else if (formItem.inputType === "select") {
      return this.wrap(formItem, this.getSelectInput(formItem));
    } else if (formItem.inputType === "fileupload") {
      return this.getFileUpload(formItem);
    } else if (formItem.inputType === "slider") {
      return this.wrap(formItem, this.getSliderInput(formItem));
    }
    return (
      <div>
        Invalid inputType "{formItem.inputType}" for form input "
        {formItem.title}". Please check configuration.
      </div>
    );
  }
}

export default InputFactory;
