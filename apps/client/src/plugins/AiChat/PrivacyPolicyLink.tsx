import type { ReactNode } from "react";
import { Link } from "@mui/material";

interface PrivacyPolicyLinkProps {
  url?: string;
  children: ReactNode;
  // Text around the link, also left out without a link
  before?: string;
  after?: string;
  // On a line of its own instead of after a space
  newLine?: boolean;
}

/**
 * The link to the privacy policy, opened in a new tab, after a space or a line
 * break. Nothing at all without a web address (`http(s)` only, as for the
 * links in answers).
 */
function PrivacyPolicyLink({
  url,
  children,
  before,
  after,
  newLine = false,
}: PrivacyPolicyLinkProps) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return null;
  }
  return (
    <>
      {newLine ? <br /> : " "}
      {before}
      <Link
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        color="inherit"
        underline="always"
      >
        {children}
      </Link>
      {after}
    </>
  );
}

export default PrivacyPolicyLink;
