import { FormControl, Grid } from "@mui/material";

const AppForm = (props) => {
  const { app, form, inputFactory } = props;

  /**
   * Filters the form array based on certain conditions.
   * @param {Object} formItem - The form item to filter.
   * @returns {boolean}
   */
  const formFilter = (formItem) => {
    // If the formItem is hidden, return false.
    if (formItem.hidden === true) {
      return false;
    }

    // visibleIf is used to show/hide the form item based on another form item's value.
    if (formItem.visibleIf?.id && formItem.visibleIf?.value) {
      const owner = form.find((item) => item.id === formItem.visibleIf.id);
      return owner && owner.value === formItem.visibleIf.value;
    }

    return true;
  };

  return (
    app && (
      <Grid item xs={12}>
        <Grid container spacing={1}>
          {form.filter(formFilter).map((formItem, index) => {
            return (
              <Grid
                item
                xs={12}
                md={formItem.gridSize ?? 12}
                key={formItem.id + index}
              >
                <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                  {inputFactory.getInputItem(formItem)}
                </FormControl>
              </Grid>
            );
          })}
        </Grid>
      </Grid>
    )
  );
};

export default AppForm;
