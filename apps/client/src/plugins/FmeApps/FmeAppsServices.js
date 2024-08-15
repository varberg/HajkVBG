import DrawModel from "models/DrawModel";
import KmlModel from "models/KmlModel";
// import { saveAs } from "file-saver";

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

  formFilter(form, formItem) {
    // If the formItem is hidden or has no fmeParameterName, return false.
    if (formItem.hidden === true || !formItem.fmeParameterName) {
      return false;
    }

    // visibleIf is used to show/hide the form item based on another form item's value.
    if (formItem.visibleIf?.id && formItem.visibleIf?.value) {
      const owner = form.find((item) => item.id === formItem.visibleIf.id);
      return owner && owner.value === formItem.visibleIf.value;
    }

    return true;
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
      `${this.props.options.fmeFlowBaseUrl}/fmedatastreaming/${app.fmeRepository}/${app.fmeWorkspace}`
    );

    // Make sure to filter out any inputs that have'nt any parameter name.
    form
      .filter((input) => this.formFilter(form, input))
      .forEach((input) => {
        oUrl.searchParams.append(input.fmeParameterName, input.value);
      });

    // Response format is always JSON and is actually the format for errors etc, not for features etc.
    oUrl.searchParams.append("opt_responseformat", "json");

    // Have we uploaded a file?
    // Add the URL of the file upload if it exists
    const fileUpload = form.find((input) => input.inputType === "fileupload");
    if (fileUpload && fileUpload.value) {
      oUrl.searchParams.append("opt_geturl", fileUpload.value);
    }

    let response = await hfetch(oUrl.href, {});

    if ((response.ok && response.status === 200) || response.status === 204) {
      try {
        const simpleContentType = this.getSimpleContentType(response);
        const data = await this.getResponseData(response, simpleContentType);

        return {
          data: data,
          simpleContentType: simpleContentType,
          imageUrl: oUrl.href,
          error: data.error === true,
          errorHandledByFME: data.errorHandledByFME || false,
          errorHandledByHajk: data.errorHandledByHajk || false,
          message: data.message ?? "",
        };
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

  async getResponseData(response, simpleContentType) {
    if (simpleContentType === "json") {
      const jsonData = await response.json();
      if (jsonData.error) {
        // Used internally for separating handled and unhandled errors.
        jsonData.errorHandledByFME = true;
      }
      return jsonData;
    } else if (simpleContentType === "tiff") {
      return await response.blob();
    } else if (response.status === 204) {
      // FME sometimes returns 204 instead of a geojson with no features.
      // We have no idea if we expect json or not at this point,
      // so here we assume it is json.
      return {
        error: true,
        errorHandledByHajk: true,
        message: "Svaret från FME hade inget innehåll.",
      };
    } else {
      throw new Error(
        `FmeAppsService.getResponseData: Content type '${simpleContentType}' is not supported, cannot return data`
      );
    }
  }

  async uploadFile(app, form, file) {
    const oUrl = new URL(
      `${this.options.fmeFlowBaseUrl}/fmedataupload/${app.fmeRepository}/${app.fmeWorkspace}/${file.name}`
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

  getSimpleContentType(response) {
    const contentType = (
      "" + response.headers.get("content-type")
    ).toLowerCase();
    if (contentType.includes("json")) {
      return "json";
    } else if (contentType.includes("tiff")) {
      return "tiff";
    }
    return contentType;
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

  downloadResults(app, layerController, results) {
    if (results.simpleContentType === "tiff") {
      // Here we create a blob url from the data and download it.
      // This way we can download the image without creating a new request to FME.
      const blobUrl = URL.createObjectURL(results.data);
      window.location.replace(blobUrl);
      URL.revokeObjectURL(blobUrl);
    } else if (results.simpleContentType === "json") {
      // Lets create a kml file with default draw model settings.
      const drawModel = new DrawModel({
        layerName: layerController.layerName,
        map: layerController.map,
      });
      const kmlModel = new KmlModel({
        layerName: layerController.layerName,
        map: layerController.map,
        drawModel: drawModel,
      });
      kmlModel.export();
      // Save the results in a json file, in the example below the point of origin is missing.
      // const blob = new Blob([JSON.stringify(results.data)], {
      //   type: "application/json",
      // });
      // saveAs(blob, "geojson.json", { type: "application/json" });
    } else {
      console.warn(
        `FmeAppsService.downloadResults: Content type ${results.simpleContentType} is not supported, cannot download data`
      );
    }
  }
}

export default FmeAppsService;
