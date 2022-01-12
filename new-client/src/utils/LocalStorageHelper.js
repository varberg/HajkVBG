/**
 * HOW TO USE THIS HELPER
 * Import this helper wherever you want to use the get/set methods.
 * This helper is initiated once, on export, and we set the key name
 * once (in index.js), so you don't have to worry about the details.
 * Just get/set whatever you want.
 *
 * Please note however that THERE IS A TWIST HERE TO THE  USUAL LOCALSTORAGE
 * behavior!
 *
 * A. This helper is map-specific. That means that ALL SETTINGS RELATED TO A
 * MAPCONFIG WILL BE HELD IN ONE KEY/VALUE PAIR IN LOCALSTORAGE.
 * B. Because we only have one value to play with for all the settings, and
 * LocalStorage stores values as string, we utilized JSON.stringify and JSON.parse.
 * C. The constructor of this helper overrides the default window.localStorage.setItem
 * function by – in addition to the normal behavior of writing the new value – dispatching
 * a custom Event on the document object. This way all parts of our application can
 * listen for changes in the store!
 *
 * === Example for map config 'map_1' ===
 * We can use this helper as follows.
 *
 * === Storing map-specific data ===
 * LocalStorageHelper.set("foobar", [1,2,3]);
 *
 * This will create/modify the following in browser's LocalStorage:
 * map_options_map_1: "{\"foobar\":[1,2,3]}"
 * If there were any other keys (except "foobar") THEY WON'T BE TOUCHED!
 *
 * === Retrieving map-specific data ===
 * LocalStorageHelper.get("foobar", "default value")
 *
 * This can do one of two things:
 * - if there was a key named "foobar" for current entry, we'll get the JSON.parsed results
 * - if there was no entry named "foobar", we'll get "default value" back
 * 
 * === Listening for changes in LocalStorage ===
 * We will emit an event called "localStorageChanged" on the document itself.
 * In order to listen for this event, add something like this to your code:
    document.addEventListener(
      "localStorageChanged",
      localStorageSetHandler, // The handler function
      false
    );
 */

class LocalStorageHelper {
  mapName = "map_options_unknown_map";
  constructor() {
    // Below we override the default setItem function
    // of LocalStorage so that it emits an event
    // when it's called. This way we can bind a handler to
    // the emitted event and listen for changes to LocalStorage.

    // First save the original function, so we can use it later.
    const originalSetItem = localStorage.setItem;

    // Next, override the function with the new one that…
    localStorage.setItem = function () {
      // …creates an Event…
      const event = new Event("localStorageChanged");
      // …calls the original setItem (that actually) writes the
      // new value to LocalStorage…
      originalSetItem.apply(this, arguments);
      // …and finally dispatch (publish) the event.
      document.dispatchEvent(event);
    };
  }
  /**
   * @summary We want each map to have its own settings in LS, so we use mapConfig's name
   * as a key for the LS property.
   * @description This will normally be called once, when the map is initiated. All subsequent
   * use (getting and setting values) will read this key's value.
   *
   * @param {string} [mapName="unknown_map"]
   * @memberof LocalStorageHelper
   */
  setKeyName(mapName = "unknown_map") {
    this.mapName = `map_options_${mapName}`;
  }

  /**
   * @summary Get map-specific settings from LocalStorage for the given key, fallback to supplied default
   * if parsing not possible.
   *
   * @param {*} key
   * @param {*} [defaults={}]
   * @returns
   * @memberof
   */
  get(key, defaults = {}) {
    try {
      // Return a shallow merged objects with
      return {
        ...defaults, // …supplied defaults, that can be overwritten by…
        ...JSON.parse(localStorage.getItem(this.mapName))[
          key // …whatever exists in local storage for the specified key
        ],
      };
    } catch (error) {
      // If parsing failed, return defaults
      return defaults;
    }
  }

  /**
   * @summary Get all keys/values from the map-specific settings, fallback to defaults.
   *
   * @param {*} [defaults={}]
   * @returns
   * @memberof LocalStorageHelper
   */
  getAll(defaults = {}) {
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem(this.mapName)),
      };
    } catch (error) {
      return defaults;
    }
  }
  /**
   * @summary Return an object with key/value pairs for the entire
   * content of LocalStorage. Also, include this map's name, so whatever
   * consumes this method's results can decide if it wants only this map's
   * settings, or if it's interested in seeing the rest too.
   * @description This function is differs from the "normal" way that this
   * helper works as it ignores the "one-setting-per-map" convention. Instead,
   * it is very powerful and returns the entire contents of the store.
   * We also return the name of this map, giving the programmer a way to decide
   * what is of interest.
   *
   * @returns {object} Current map's name and contents of the store
   * @memberof LocalStorageHelper
   */
  getReallyAll() {
    // First create a duplicate, so we don't touch the actual
    // window.localStorage object
    const store = Object.assign({}, localStorage);

    // Delete the setItem function override (see this helper's
    // constructor where we create it) - it would be returned
    // otherwise (as it would be seen as an "own property"), but
    // we don't want it to get out!
    delete store.setItem;

    // Finally, prepare a return object. We want a nice key-value
    // object from the localStorage entries, hence the nice little
    // dance with fromEntries/entries.
    return {
      currentMap: this.mapName,
      store: Object.fromEntries(Object.entries(store)),
    };
  }

  /**
   * @summary Save any JSON-able value to a specified key in a local storage object specific to current map
   *
   * @param {*} key Name of the key inside the JSON object
   * @param {*} value Value that the key will be set to
   * @memberof
   */
  set(key, value) {
    localStorage.setItem(
      this.mapName, // Use a map-specific name as key for LocalStorage setting
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(this.mapName)),
        [key]: value,
      })
    );
  }
}

// Export singleton instance
export default new LocalStorageHelper();
