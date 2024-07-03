import { InputLabel, MenuItem, Select, styled } from "@mui/material";

const InputSelect = (props) => {
  const d = props.formItem;
  let form = props.form;
  const onChange = props.onChange;

  const StyledInputLabel = styled(InputLabel)(({ theme }) => ({
    color: d.error ? theme.palette.error.main : null,
  }));

  return (
    <div sx={{ minWidth: "100%" }}>
      <StyledInputLabel id={d.id + "-label"} required={!d.optional}>
        {d.title}
      </StyledInputLabel>
      <Select
        error={d.error}
        disabled={d.disabled}
        fullWidth
        labelId={d.id + "-label"}
        id={d.id + "-select"}
        label={d.title}
        value={d.value}
        required={!d.optional}
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
              formItem.value = null; // Force null
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
