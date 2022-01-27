import React, { Component } from "react";
import Button from "@material-ui/core/Button";
import SaveIcon from "@material-ui/icons/SaveSharp";
import { withStyles } from "@material-ui/core/styles";
import { blue } from "@material-ui/core/colors";
import { SketchPicker } from "react-color";

const ColorButtonBlue = withStyles((theme) => ({
  root: {
    color: theme.palette.getContrastText(blue[500]),
    backgroundColor: blue[500],
    "&:hover": {
      backgroundColor: blue[700],
    },
  },
}))(Button);

const defaultState = {
  active: false,
  index: 0,
  title: "EDP integration",
  panelDescription: "Integrera med EDP Vision",
  target: "toolbar",
  visibleAtStart: false,
  position: "right",
  instruction: "",
  mapObjects: {
    realEstate: {
      wfsId: "",
      wmsId: "",
      activateWms: true,
      editable: false,
    },
  },
  //used to style the features that appear in the 'Markerade kartobjekt' list.
  listFeatureFillColor: "rgba(0,0,255,0.07)",
  listFeatureStrokeColor: "rgba(0,0,255,0.5)",

  //used to style a selected feature, selected from the 'Markerade kartobjekt' list.
  selectedListFeatureFillColor: "rgba(200,40,255,0.5)",
  selectedListFeatureStrokeColor: "rgba(200,40,255,1)",

  //used to style a created feature, that is not yet saved/imported into EDP Vision.
  unsavedFeatureFillColor: "rgba(100, 220, 50, 0.25)",
  unsavedFeatureStrokeColor: "rgba(100, 220, 50, 1)",

  //used to style a feature that is currently being edited/created.
  editFeatureFillColor: "rgba(255,0,0,0.07)",
  editFeatureStrokeColor: "rgba(255,0,0,0.5)",

  //local state, not saved to config.
  searchableLayers: {},
};

class RGBA {
  static toString(o) {
    return `rgba(${o.r},${o.g},${o.b},${o.a})`;
  }

  static parse(s) {
    try {
      // 1. RegEx that matches stuff between a set of parentheses
      // 2. Execute that regex on the input string, but first remove any whitespace it may contain
      // 3. RegEx exec returns an array. Grab the second element, which will contain the value.
      // 4. Split the value to extract individual rgba values
      const o = /\(([^)]+)\)/.exec(s.replace(/\s/g, ""))[1].split(",");
      return {
        r: o[0],
        g: o[1],
        b: o[2],
        a: o[3],
      };
    } catch (error) {
      console.error("RGBA parsing failed: " + error.message);
    }
  }
}

class ToolOptions extends Component {
  constructor() {
    super();
    this.state = defaultState;
    this.type = "mfintegration";
  }

  componentDidMount() {
    const tool = this.getTool();
    if (tool) {
      this.loadAvailableVectorLayers();
      this.setState({
        active: true,
        index: tool.index,
        title: tool.options?.title ?? defaultState.title,
        panelDescription:
          tool.options?.panelDescription ?? defaultState.panelDescription,
        target: tool.options.target || "toolbar",
        visibleAtStart: tool.options.visibleAtStart,
        position: tool.options?.position ?? defaultState.position,
        instruction: tool.options?.instruction ?? defaultState.instruction,
        listFeatureFillColor:
          tool.options?.listFeatureFillColor ??
          defaultState.listFeatureFillColor,
        listFeatureStrokeColor:
          tool.options?.listFeatureStrokeColor ??
          defaultState.listFeatureStrokeColor,
        selectedListFeatureFillColor:
          tool.options?.selectedListFeatureFillColor ??
          defaultState.selectedListFeatureFillColor,
        selectedListFeatureStrokeColor:
          tool.options?.selectedListFeatureStrokeColor ??
          defaultState.selectedListFeatureStrokeColor,
        unsavedFeatureFillColor:
          tool.options?.unsavedFeatureFillColor ??
          defaultState.unsavedFeatureFillColor,
        unsavedFeatureStrokeColor:
          tool.options?.unsavedFeatureStrokeColor ??
          defaultState.unsavedFeatureStrokeColor,
        editFeatureFillColor:
          tool.options?.editFeatureFillColor ??
          defaultState.editFeatureFillColor,
        editFeatureStrokeColor:
          tool.options?.editFeatureStrokeColor ??
          defaultState.editFeatureStrokeColor,
        mapObjects: tool.options?.mapObjects ?? defaultState.mapObjects,
      });
    } else {
      this.setState({
        active: false,
      });
    }
  }

  loadAvailableVectorLayers() {
    console.log("loadAvailableVectorLayers");
    this.props.model.getConfig(
      this.props.model.get("config").url_layers,
      (layers) => {
        let wmslayers = layers.wmslayers.filter((l) =>
          this.props.model.findLayerInConfig(l.id)
        );
        let wfslayers = layers.wfslayers;
        let vectorlayers = layers.vectorlayers;

        /*filter out only the layers that are available in this map configuration.*/
        // let configWfslayers = wfslayers.filter((l) => {
        //   return this.props.model.findLayerInConfig(l.id) === true;
        // });

        this.setState({
          availableVectorLayers: wfslayers,
          availableWmsLayers: wmslayers,
        });
      }
    );

    let inConfig = this.props.model.findLayerInConfig("beans");
    console.log("isinconfig", inConfig);
  }

  handleInputChange(event) {
    const target = event.target;
    const name = target.name;
    let value = target.type === "checkbox" ? target.checked : target.value;
    if (typeof value === "string" && value.trim() !== "") {
      value = !isNaN(Number(value)) ? Number(value) : value;
    }

    this.setState({
      [name]: value,
    });
  }

  //update t.ex. "realEstateSettings"
  handleMapObjectChange = (modeName, stateName, value) => {
    //debugger;
    let currentMapObjectState = { ...this.state.mapObjects };
    let currentModeState = { ...this.state.mapObjects[modeName] };

    currentModeState[stateName] = value;
    this.setState({
      mapObjects: { ...currentMapObjectState, [modeName]: currentModeState },
    });

    //this.setState({ [modeName]: { ...current, [stateName]: value } });
  };

  getTool() {
    return this.props.model
      .get("toolConfig")
      .find((tool) => tool.type === this.type);
  }

  add(tool) {
    this.props.model.get("toolConfig").push(tool);
  }

  remove(tool) {
    this.props.model.set({
      toolConfig: this.props.model
        .get("toolConfig")
        .filter((tool) => tool.type !== this.type),
    });
  }

  replace(tool) {
    this.props.model.get("toolConfig").forEach((t) => {
      if (t.type === this.type) {
        t.options = tool.options;
        t.index = tool.index;
      }
    });
  }

  save() {
    const tool = {
      type: this.type,
      index: this.state.index,
      options: {
        title: this.state.title,
        panelDescription: this.state.panelDescription,
        target: this.state.target,
        position: this.state.position,
        visibleAtStart: this.state.visibleAtStart,
        instruction: this.state.instruction,
        listFeatureFillColor: this.state.listFeatureFillColor,
        listFeatureStrokeColor: this.state.listFeatureStrokeColor,
        selectedListFeatureFillColor: this.state.selectedListFeatureFillColor,
        selectedListFeatureStrokeColor:
          this.state.selectedListFeatureStrokeColor,
        unsavedFeatureFillColor: this.state.unsavedFeatureFillColor,
        unsavedFeatureStrokeColor: this.state.unsavedFeatureStrokeColor,
        editFeatureFillColor: this.state.editFeatureFillColor,
        editFeatureStrokeColor: this.state.editFeatureStrokeColor,
        mapObjects: this.state.mapObjects,
      },
    };

    const existing = this.getTool();

    function update() {
      this.props.model.updateToolConfig(
        this.props.model.get("toolConfig"),
        () => {
          this.props.parent.props.parent.setState({
            alert: true,
            alertMessage: "Uppdateringen lyckades",
          });
        }
      );
    }

    if (!this.state.active) {
      if (existing) {
        this.props.parent.props.parent.setState({
          alert: true,
          confirm: true,
          alertMessage:
            "Verktyget kommer att tas bort. Nuvarande inställningar kommer att gå förlorade. Vill du fortsätta?",
          confirmAction: () => {
            this.remove();
            update.call(this);
            this.setState(defaultState);
          },
        });
      } else {
        this.remove();
        update.call(this);
      }
    } else {
      if (existing) {
        this.replace(tool);
      } else {
        this.add(tool);
      }
      update.call(this);
    }
  }

  handleColorChange = (target, color) => {
    this.setState({ [target]: RGBA.toString(color.rgb) });
  };

  handleWfsChange = (target, value) => {
    console.log("handleWfsChange");
    this.setState({
      [target]: { ...this.state[target], wfsId: value },
    });
  };

  handleWmsChange = (target, value) => {
    console.log("handleWmsChange");
    this.setState({
      [target]: { ...this.state[target], wmsId: value },
    });
  };

  renderLayerOptionsList = (layers) => {
    let options = [
      <option key="noOption" value="">
        -
      </option>,
    ];

    if (!layers) {
      return options;
    }

    layers.forEach((layer) => {
      options.push(
        <option key={layer.id} value={layer.id}>
          {layer.caption}
        </option>
      );
    });
    return options;
  };

  render() {
    return (
      <div>
        <form>
          <p>
            <ColorButtonBlue
              variant="contained"
              className="btn"
              onClick={(e) => {
                e.preventDefault();
                this.save();
              }}
              startIcon={<SaveIcon />}
            >
              Spara
            </ColorButtonBlue>
          </p>
          <div>
            <input
              id="active"
              name="active"
              type="checkbox"
              onChange={(e) => {
                this.handleInputChange(e);
              }}
              checked={this.state.active}
            />
            &nbsp;
            <label htmlFor="active">Aktiverad</label>
          </div>
          <div className="separator">Fönsterinställningar</div>
          <div>
            <label htmlFor="drawerTitle">
              Titel{" "}
              <i
                className="fa fa-question-circle"
                data-toggle="tooltip"
                title="Titel på verktygets panel. Detta visas högst upp i panelen"
              />
            </label>
            <input
              id="title"
              value={this.state.title}
              type="text"
              name="title"
              onChange={(e) => {
                this.handleInputChange(e);
              }}
            />
          </div>
          <div>
            <label htmlFor="panelDescription">
              Description{" "}
              <i
                className="fa fa-question-circle"
                data-toggle="tooltip"
                title="Beskrivande text som visas vid hoovring över verktygsknapp."
              />
            </label>
            <input
              id="panelDescription"
              value={this.state.panelDescription}
              type="text"
              name="panelDescription"
              onChange={(e) => {
                this.handleInputChange(e);
              }}
            />
          </div>
          <div>
            <label htmlFor="index">Sorteringsordning</label>
            <input
              id="index"
              name="index"
              type="number"
              min="0"
              className="control-fixed-width"
              onChange={(e) => {
                this.handleInputChange(e);
              }}
              value={this.state.index}
            />
          </div>
          <div>
            <label htmlFor="target">Verktygsplacering</label>
            <select
              id="target"
              name="target"
              className="control-fixed-width"
              onChange={(e) => {
                this.handleInputChange(e);
              }}
              value={this.state.target}
            >
              <option value="toolbar">Drawer</option>
              <option value="left">Widget left</option>
              <option value="right">Widget right</option>
              <option value="control">Control button</option>
            </select>
          </div>
          <div>
            <label htmlFor="position">
              Fönsterplacering{" "}
              <i
                className="fa fa-question-circle"
                data-toggle="tooltip"
                title="Placering av verktygets fönster. Anges som antingen 'left' eller 'right'."
              />
            </label>
            <select
              id="position"
              name="position"
              className="control-fixed-width"
              onChange={(e) => {
                this.handleInputChange(e);
              }}
              value={this.state.position}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div className="separator">Kartobjekt inställningar</div>
          <div>
            <label>
              <strong>RealEstate</strong>
            </label>
          </div>
          <div>
            <input
              id="editable"
              name="editable"
              type="checkbox"
              onChange={(e) => {
                this.handleMapObjectChange(
                  "realEstate",
                  "editable",
                  e.target.checked
                );
              }}
              checked={this.state.mapObjects.realEstate.editable}
            />
            &nbsp;
            <label htmlFor="editable" className="long-label">
              Redigerbar i EDP vision
            </label>
          </div>
          <div>
            <input
              id="activateWms"
              name="activateWms"
              type="checkbox"
              onChange={(e) => {
                this.handleMapObjectChange(
                  "realEstate",
                  "activateWms",
                  e.target.checked
                );
              }}
              checked={this.state.mapObjects.realEstate.activateWms}
            />
            &nbsp;
            <label htmlFor="activateWms" className="long-label">
              Tänd kopplad wms lager när lager väljs
            </label>
          </div>
          <div>
            <label htmlFor="realEstateWfs">
              WFS lager{" "}
              <i
                className="fa fa-question-circle"
                data-toggle="tooltip"
                title="WFS lager som är kopplad till kartobjektet RealEstate."
              />
            </label>
            <select
              id="realEstateWfs"
              name="realEstateWfs"
              className="control-fixed-width"
              value={this.state.mapObjects.realEstate.wfsId}
              onChange={(e) => {
                this.handleMapObjectChange(
                  "realEstate",
                  "wfsId",
                  e.target.value
                );
              }}
            >
              {this.renderLayerOptionsList(this.state.availableVectorLayers)}
            </select>
          </div>
          <div>
            <label htmlFor="realEstateWms">
              WMS lager{" "}
              <i
                className="fa fa-question-circle"
                data-toggle="tooltip"
                title="WMS lager som är kopplad till kartobjektet RealEstate."
              />
            </label>
            <select
              id="realEstateWms"
              name="realEstateWms"
              className="control-fixed-width"
              value={this.state.mapObjects.realEstate.wmsId}
              onChange={(e) => {
                this.handleMapObjectChange(
                  "realEstate",
                  "wmsId",
                  e.target.value
                );
              }}
            >
              {this.renderLayerOptionsList(this.state.availableWmsLayers)}
            </select>
          </div>
          <div className="separator">Utseende för markerade objekt</div>
          <span className="pull-left" style={{ marginLeft: "10px" }}>
            <div>
              <div>
                <label className="long-label" htmlFor="listFeatureFillColor">
                  Fyllnadsfärg
                </label>
              </div>
              <SketchPicker
                color={RGBA.parse(this.state.listFeatureFillColor)}
                onChangeComplete={(color) =>
                  this.handleColorChange("listFeatureFillColor", color)
                }
              />
            </div>
          </span>
          <div>
            <div>
              <label className="long-label" htmlFor="listFeatureStrokeColor">
                Ramfärg
              </label>
            </div>
            <SketchPicker
              color={RGBA.parse(this.state.listFeatureStrokeColor)}
              onChangeComplete={(color) =>
                this.handleColorChange("listFeatureStrokeColor", color)
              }
            />
          </div>
          <div className="separator">Utseende för valt markerat objekt</div>
          <span className="pull-left" style={{ marginLeft: "10px" }}>
            <div>
              <div>
                <label
                  className="long-label"
                  htmlFor="selectedListFeatureFillColor"
                >
                  Fyllnadsfärg
                </label>
              </div>
              <SketchPicker
                color={RGBA.parse(this.state.selectedListFeatureFillColor)}
                onChangeComplete={(color) =>
                  this.handleColorChange("selectedListFeatureFillColor", color)
                }
              />
            </div>
          </span>
          <div>
            <div>
              <label
                className="long-label"
                htmlFor="selectedListFeatureStrokeColor"
              >
                Ramfärg
              </label>
            </div>
            <SketchPicker
              color={RGBA.parse(this.state.selectedListFeatureStrokeColor)}
              onChangeComplete={(color) =>
                this.handleColorChange("selectedListFeatureStrokeColor", color)
              }
            />
          </div>
          <div className="separator">Utseende för ej sparat objekt</div>
          <span className="pull-left" style={{ marginLeft: "10px" }}>
            <div>
              <div>
                <label className="long-label" htmlFor="unsavedFeatureFillColor">
                  Fyllnadsfärg
                </label>
              </div>
              <SketchPicker
                color={RGBA.parse(this.state.unsavedFeatureFillColor)}
                onChangeComplete={(color) =>
                  this.handleColorChange("unsavedFeatureFillColor", color)
                }
              />
            </div>
          </span>
          <div>
            <div>
              <label className="long-label" htmlFor="unsavedFeatureStrokeColor">
                Ramfärg
              </label>
            </div>
            <SketchPicker
              color={RGBA.parse(this.state.unsavedFeatureStrokeColor)}
              onChangeComplete={(color) =>
                this.handleColorChange("unsavedFeatureStrokeColor", color)
              }
            />
          </div>
          <div className="separator">Utseende för objekt i redigeringsläge</div>
          <span className="pull-left" style={{ marginLeft: "10px" }}>
            <div>
              <div>
                <label className="long-label" htmlFor="editFeatureFillColor">
                  Fyllnadsfärg
                </label>
              </div>
              <SketchPicker
                color={RGBA.parse(this.state.editFeatureFillColor)}
                onChangeComplete={(color) =>
                  this.handleColorChange("editFeatureFillColor", color)
                }
              />
            </div>
          </span>
          <div>
            <div>
              <label className="long-label" htmlFor="editFeatureStrokeColor">
                Ramfärg
              </label>
            </div>
            <SketchPicker
              color={RGBA.parse(this.state.editFeatureStrokeColor)}
              onChangeComplete={(color) =>
                this.handleColorChange("editFeatureStrokeColor", color)
              }
            />
          </div>
          <div className="separator">KUBB inställningar</div>
          <div className="separator">Övriga inställningar</div>
          <div>
            <input
              id="visibleAtStart"
              name="visibleAtStart"
              type="checkbox"
              onChange={(e) => {
                this.handleInputChange(e);
              }}
              checked={this.state.visibleAtStart}
            />
            &nbsp;
            <label htmlFor="visibleAtStart">Synlig vid start</label>
          </div>
          <div>
            <label htmlFor="instruction">
              Instruction{" "}
              <i
                className="fa fa-question-circle"
                data-toggle="tooltip"
                title="Förklarande text som visas högst upp i verktygspanelen."
              />
            </label>
            <input
              id="instruction"
              value={this.state.instruction}
              type="text"
              name="instruction"
              onChange={(e) => {
                this.handleInputChange(e);
              }}
            />
          </div>
        </form>
      </div>
    );
  }
}

export default ToolOptions;
