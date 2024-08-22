import * as React from "react";
import { styled } from "@mui/material/styles";
import Button from "@mui/material/Button";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { Grid } from "@mui/material";
import { useTheme } from "@emotion/react";

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
  const d = props.formItem;
  const [fileName, setFileName] = React.useState(null);
  const theme = useTheme();

  const updateFormItem = (e) => {
    // Make sure the user has selected a file.
    // If the user cancelled, the file input length will be 0.
    const file = e.target.files?.length > 0 ? e.target.files[0] : null;
    let inputFileName = file ? file.name : null;

    setFileName(inputFileName);

    d.value = null; // reset the url in advance

    if (inputFileName) {
      props.onProgress({ text: `Laddar upp fil` });
      props.services.uploadFile(props.app, file).then((response) => {
        // FME returns an incorrectly encoded URL in some cases.
        // If the filename included spaces and similar characters, we need to encode it.
        // If we send the original URL from FME back to FME, FME will return an error :).
        const urlComponents = response.url.split("/");
        // The last component is the filename, encode it and push it back.
        const fileName = encodeURIComponent(urlComponents.pop());
        urlComponents.push(fileName);
        response.url = urlComponents.join("/");

        d.value = response.url;

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
          disabled={d.disabled}
          fullWidth
          component="label"
          role={undefined}
          variant="outlined"
          tabIndex={-1}
          startIcon={<UploadFileIcon />}
        >
          Välj fil
          <VisuallyHiddenInput type="file" onChange={updateFormItem} />
        </Button>
      </Grid>
      <Grid item xs={7} sx={{ alignContent: "center", pl: 1 }}>
        <TruncatedTextBlock
          title={fileName}
          sx={{ color: d.error ? theme.palette.error.main : null }}
        >
          {fileName ?? "Ingen fil vald"}
        </TruncatedTextBlock>
      </Grid>
    </Grid>
  );
};

export default InputFileUpload;
