import React from "react";
import { styled, keyframes } from "@mui/material/styles";

const typingBounce = keyframes`
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  40% {
    transform: translateY(-8px);
    opacity: 1;
  }
`;

const TypingContainer = styled("div")({
  display: "flex",
  gap: "4px",
  alignItems: "center",
  height: "20px",
  padding: "8px 12px",
});

const Dot = styled("span")({
  display: "block",
  width: "4px",
  height: "4px",
  background: "#9ca3af",
  borderRadius: "50%",
  animation: `${typingBounce} 1.4s infinite ease-in-out both`,
  "&:nth-of-type(1)": {
    animationDelay: "-0.32s",
  },
  "&:nth-of-type(2)": {
    animationDelay: "-0.16s",
  },
  "&:nth-of-type(3)": {
    animationDelay: "0s",
  },
});

export default function TypingAnim() {
  return (
    <TypingContainer>
      <Dot />
      <Dot />
      <Dot />
    </TypingContainer>
  );
}
