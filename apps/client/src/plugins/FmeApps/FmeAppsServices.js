import { hfetch } from "utils/FetchWrapper";

class FmeAppsService {
  constructor(props) {
    this.props = props;
    this.options = props.options;

    // Create a unique session ID for each user.
    // This is used for the upload feature.
    // A timestamp is used and should be enough.
    this.sessionID = new Date().getTime();
  }

  /**
   * Retrieves the results of an app execution from the FmeFlow API.
   *
   * @param {Object} app - The app object for which to retrieve results.
   * @param {Array} form - The form inputs to pass to the app.
   * @return {Promise<Object|null>} - The JSON response from the API, or null if the request failed.
   */
  async getDataStreamingServiceResults(app, form) {
    const oUrl = new URL(
      `${this.props.options.fmeFlowBaseUrl}/fmedatastreaming/${app.repository}/${app.workspace}`
    );

    form.forEach((input) => {
      oUrl.searchParams.append(input.fmeParameterName, input.value);
    });

    oUrl.searchParams.append("opt_responseformat", "json");

    // Have we uploaded a file?
    // Add the URL of the file upload if it exists
    const fileUpload = form.find((input) => input.inputType === "fileupload");
    if (fileUpload && fileUpload.inputFileUploadUrl) {
      oUrl.searchParams.append("opt_geturl", fileUpload.inputFileUploadUrl);
    }

    let response = await hfetch(oUrl.href, {});

    // FME sometimes returns 204 instead of a geojson with no features.
    // Thats why we have to check the status code and only accept 200.
    if (response.ok && response.status === 200) {
      try {
        const data = await response.json();
        return data;
      } catch (error) {
        return {
          error: true,
          code: 666,
          message: `Failed to parse response: ${error.message}`,
        };
      }
    } else {
      response = await this.getFMEErrorMessage(response);
    }
    return {
      error: true,
      code: response.status,
      message: response.statusText + (response.fmeErrorMessage ?? ""),
    };
  }

  async uploadFile(app, form, file) {
    const oUrl = new URL(
      `${this.options.fmeFlowBaseUrl}/fmedataupload/${app.repository}/${app.workspace}/${file.name}`
    );
    oUrl.searchParams.append("opt_fullpath", "true");
    oUrl.searchParams.append("opt_namespace", this.sessionID);
    oUrl.searchParams.append("opt_responseformat", "json");

    let response = await hfetch(oUrl.href, {
      method: "PUT",
      body: file,
    });

    // Check status code, should be 200 or 201.
    if (response.ok && response.status >= 200 && response.status <= 201) {
      try {
        const data = await response.json();
        let fn = data.serviceResponse.files.path;
        let path = data.serviceResponse.files.folder[0].path;
        // We need to fix the incoming path with the original base url when running through the proxy.
        path = path.replace(
          "$(FME_DATA_REPOSITORY)",
          this.options.fmeFlowBaseUrlOriginal
        );
        return { url: path + fn };
      } catch (error) {
        return {
          error: true,
          code: 666,
          message: `Failed to parse response: ${error.message}`,
        };
      }
    } else {
      response = await this.getFMEErrorMessage(response);
    }
    return {
      error: true,
      code: response.status,
      message: response.statusText + (response.fmeErrorMessage ?? ""),
    };
  }

  async getFMEErrorMessage(response) {
    // When we got to this point, the response is not ok.
    // Therefore, we need to check for an error message from the FME response.
    try {
      // Check for error message from the FME response
      const errorData = await response.json();
      // Decorate response with message from FME
      response.fmeErrorMessage = errorData.serviceResponse?.statusInfo?.message;
      console.error("serviceResponse from FME", errorData.serviceResponse);
    } catch (error) {
      // silence, there is no need to handle the error of an error.
    }

    // Return the response with or without the FME error message.
    // At least we tried.
    return response;
  }
}

export default FmeAppsService;
