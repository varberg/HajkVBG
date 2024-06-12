import { InputLabel, MenuItem, Select, TextField } from "@mui/material";
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
