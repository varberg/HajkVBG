import React from "react";
import { Box, Paper, Typography } from "@mui/material";

function UserMessage({ message }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <Paper
        variant="outlined"
        elevation={0}
        sx={{
          maxWidth: "80%",
          p: 1.25,
          backgroundColor: (theme) =>
            theme.palette.mode === "dark"
              ? theme.palette.grey[800]
              : theme.palette.grey[200],
          borderColor: "primary.main",
          border: "none",
          borderRadius: "10px",
          boxShadow: "none",
        }}
      >
        <Typography sx={{ whiteSpace: "pre-wrap", fontSize: "0.75rem" }}>
          {message.text}
        </Typography>
      </Paper>
    </Box>
  );
}

export default UserMessage;
