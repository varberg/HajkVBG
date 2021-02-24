import React, { forwardRef } from "react";
import { Helmet, HelmetProvider } from "react-helmet-async";
import PropTypes from "prop-types";

const Page = forwardRef(({ children, title = "", ...rest }, ref) => {
  // TODO: Move Helmet provider so it encapsulates the entire App?
  return (
    <HelmetProvider>
      <div ref={ref} {...rest}>
        <Helmet>
          <title>{title}</title>
        </Helmet>
        {children}
      </div>
    </HelmetProvider>
  );
});

Page.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string,
};

export default Page;
