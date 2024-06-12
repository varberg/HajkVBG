import { hfetch } from "utils/FetchWrapper";

class FmeAppsService {
  constructor(props) {
    this.props = props;
    this.options = props.options;
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

    // console.log(oUrl.href);

    const response = await hfetch(oUrl.href);

    if (response.ok && response.status === 200) {
      const data = await response.json();
      return data;
    }
    return { error: true, code: response.status, message: response.statusText };
  }
}

export default FmeAppsService;
