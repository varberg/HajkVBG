import * as React from "react";
import { styled } from "@mui/material/styles";
import Button from "@mui/material/Button";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { Grid } from "@mui/material";

// Creates an invisible input
const VisuallyHiddenInput = styled("input")({
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  height: 1,
  overflow: "hidden",
  position: "absolute",
  bottom: 0,
  left: 0,
  whiteSpace: "nowrap",
  width: 1,
});

// Creates a text block that truncates the text on overflow.
const TruncatedTextBlock = styled("div")({
  maxWidth: "100%",
  overflow: "hidden",
  display: "block",
  width: "100%",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  opacity: 0.7,
});

const InputFileUpload = (props) => {
  const [fileName, setFileName] = React.useState(null);

  const updateFormItem = (e) => {
    // Make sure the user has selected a file.
    // If the user cancelled, the file input length will be 0.
    const file = e.target.files?.length > 0 ? e.target.files[0] : null;
    let inputFileName = file ? file.name : null;

    setFileName(inputFileName);

    props.formItem.value = null; // reset the url in advance

    if (inputFileName) {
      props.onProgress({ text: `Laddar upp fil` });
      props.services
        .uploadFile(props.app, props.form, file)
        .then((response) => {
          props.formItem.value = response.url;
          if (props.onChange) {
            props.onChange(response.url);
          }
          props.onProgressEnd();
        });
    }
  };

  return (
    <Grid container sx={{ mb: 1 }}>
      <Grid item xs={5}>
        <Button
          disabled={props.formItem.disabled}
          fullWidth
          component="label"
          role={undefined}
          variant="contained"
          tabIndex={-1}
          startIcon={<UploadFileIcon />}
        >
          Välj fil
          <VisuallyHiddenInput type="file" onChange={updateFormItem} />
        </Button>
      </Grid>
      <Grid item xs={7} sx={{ alignContent: "center", pl: 1 }}>
        <TruncatedTextBlock title={fileName}>
          {fileName ?? "Ingen fil vald"}
        </TruncatedTextBlock>
      </Grid>
    </Grid>
  );
};

export default InputFileUpload;
