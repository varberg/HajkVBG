import { TextField } from "@mui/material";
import HajkToolTip from "components/HajkToolTip";
import InputFileUpload from "./components/InputFileUpload";
import InputSlider from "./components/InputSlider";
import InputSelect from "./components/InputSelect";

/**
 * The InputFactory class is a factory class that creates input components based on the input type specified in the formItem object.
 * It provides methods to update the form state and wrap input components with tooltips.
 */

class InputFactory {
  constructor(app, form, setForm, services, methods) {
    this.app = app;
    this.form = form;
    this.setForm = setForm;
    this.services = services;
    this.methods = methods;
  }

  updateForm() {
    // Force setForm with new object to re-render.
    this.setForm([...this.form]);
  }

  wrap(d, anInput) {
    return (
      <HajkToolTip title={d.tooltip} placement="bottom-end">
        {anInput}
      </HajkToolTip>
    );
  }
  getTextInput(d) {
    return (
      <TextField
        disabled={d.disabled}
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
        disabled={d.disabled}
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
    return (
      <div>
        <InputSlider
          formItem={d}
          onChange={(e, value) => {
            d.value = value;
            this.updateForm();
          }}
        ></InputSlider>
      </div>
    );
  }

  getSelectInput(d) {
    return (
      <div sx={{ minWidth: "100%" }}>
        <InputSelect
          formItem={d}
          form={this.form}
          onChange={(e, value) => {
            this.updateForm();
          }}
        />
      </div>
    );
  }

  getFileUpload(d) {
    return (
      <div>
        <InputFileUpload
          app={this.app}
          form={this.form}
          services={this.services}
          formItem={d}
          onChange={(data) => {
            // todo: add error handling for file upload
            this.updateForm();
          }}
          onProgress={this.methods.onProgress ?? (() => {})}
          onProgressEnd={this.methods.onProgressEnd ?? (() => {})}
        ></InputFileUpload>
      </div>
    );
  }

  getInputItem(formItem) {
    // I considered a more dynamic approach, but it's not worth it right now.
    // This is the more robust approach.
    // The only downside is that if you add a new input type, you have to add it here.
    if (formItem.inputType === "text") {
      return this.wrap(formItem, this.getTextInput(formItem));
    } else if (formItem.inputType === "number") {
      return this.wrap(formItem, this.getNumberInput(formItem));
    } else if (formItem.inputType === "select") {
      return this.wrap(formItem, this.getSelectInput(formItem));
    } else if (formItem.inputType === "fileupload") {
      return this.wrap(formItem, this.getFileUpload(formItem));
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
