import { InputLabel, MenuItem, Select } from "@mui/material";

const InputSelect = (props) => {
  const d = props.formItem;
  let form = props.form;
  const onChange = props.onChange;

  return (
    <div sx={{ minWidth: "100%" }}>
      <InputLabel id={d.id + "-label"}>{d.title}</InputLabel>
      <Select
        disabled={d.disabled}
        fullWidth
        labelId={d.id + "-label"}
        id={d.id + "-select"}
        label={d.title}
        value={d.value}
        onChange={(e) => {
          d.value = e.target.value;
          // The loop below is needed to clear potential file upload inputs when the select value changes.
          // If not cleared, the form will include the file input value when posting the form data.
          // The other input types are not affected by this.
          // Note: That this approach is not optimal, the logic should probably be moved to the service class
          // which could cleanup right before a form post. But this works for now.
          form.forEach((formItem) => {
            if (
              formItem.inputType === "fileupload" &&
              formItem.visibleIf?.id === d.id &&
              formItem.visibleIf?.value !== d.value
            ) {
              formItem.value = formItem.defaultValue; // probably always null here.
            }
          });
          if (onChange) {
            onChange(d);
          }
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
};

export default InputSelect;
